/* eslint-env jest */
const {
  MAX_CARTESIAN_POINTS,
  MAX_CATEGORY_POINTS,
  MAX_PIE_SLICES,
  normalizeChartPayload,
  normalizeCurrency,
  parseDateValue,
  prettifyKey,
  toFiniteNumber,
} = require("../../../../../utils/agents/aibitat/plugins/chart-data.js");

const seriesKeys = (chart) => chart.series.map((series) => series.key);

describe("toFiniteNumber", () => {
  it.each([
    [42, 42],
    [0, 0],
    [-3.5, -3.5],
    ["42", 42],
    ["1,234", 1234],
    ["1 234", 1234],
    ["$1.2k", 1200],
    ["€ 3.5M", 3500000],
    ["12%", 12],
    ["12.5%", 12.5],
    ["(1,200)", -1200],
    ["-1.5k", -1500],
    ["$0", 0],
  ])("coerces %j to %d", (input, expected) => {
    expect(toFiniteNumber(input)).toBe(expected);
  });

  it.each(["", "  ", "N/A", "n/a", "null", "None", "—", "–", "-", "abc"])(
    "treats %j as missing data",
    (input) => {
      expect(toFiniteNumber(input)).toBeNull();
    }
  );

  it.each([null, undefined, NaN, Infinity, true, {}, []])(
    "rejects the non-numeric value %j",
    (input) => {
      expect(toFiniteNumber(input)).toBeNull();
    }
  );
});

describe("prettifyKey", () => {
  it.each([
    ["net_revenue", "Net Revenue"],
    ["netRevenue", "Net Revenue"],
    ["gross-profit", "Gross Profit"],
    ["Q1_sales", "Q1 Sales"],
    ["value", "Value"],
    ["", ""],
  ])("formats %j as %j", (input, expected) => {
    expect(prettifyKey(input)).toBe(expected);
  });
});

describe("parseDateValue", () => {
  it("parses years, months, quarters, and full dates", () => {
    expect(parseDateValue("2024")).toBe(Date.UTC(2024, 0, 1));
    expect(parseDateValue("2024-03")).toBe(Date.UTC(2024, 2, 1));
    expect(parseDateValue("2024-03-15")).toBe(Date.UTC(2024, 2, 15));
    expect(parseDateValue("Q2 2024")).toBe(Date.UTC(2024, 3, 1));
    expect(parseDateValue("2024 Q2")).toBe(Date.UTC(2024, 3, 1));
    expect(parseDateValue("Jan 2024")).toBe(Date.UTC(2024, 0, 1));
    expect(parseDateValue("January 2024")).toBe(Date.UTC(2024, 0, 1));
    expect(parseDateValue("September 2023")).toBe(Date.UTC(2023, 8, 1));
  });

  it("parses bare month names in both short and long form", () => {
    expect(parseDateValue("Jan")).toBe(0);
    expect(parseDateValue("January")).toBe(0);
    expect(parseDateValue("Dec")).toBe(11);
    expect(parseDateValue("December")).toBe(11);
  });

  it("returns null for values that are not dates", () => {
    expect(parseDateValue("Revenue")).toBeNull();
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue(42)).toBeNull();
  });
});

describe("normalizeCurrency", () => {
  it.each([
    ["USD", "USD"],
    ["usd", "USD"],
    ["eur", "EUR"],
    ["$", "USD"],
    ["€", "EUR"],
    ["£", "GBP"],
    ["₽", "RUB"],
    [" dollars ", "USD"],
    ["", "USD"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeCurrency(input)).toBe(expected);
  });

  it("defaults to USD for missing values", () => {
    expect(normalizeCurrency(undefined)).toBe("USD");
    expect(normalizeCurrency(null)).toBe("USD");
  });
});

describe("normalizeChartPayload", () => {
  describe("dataset handling", () => {
    it("accepts an array of row objects", () => {
      const result = normalizeChartPayload({
        type: "bar",
        title: "Revenue by month",
        dataset: [
          { month: "Jan", revenue: 1200 },
          { month: "Feb", revenue: 1540 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.xKey).toBe("month");
      expect(seriesKeys(result.chart)).toEqual(["revenue"]);
      expect(result.chart.dataset).toEqual([
        { month: "Jan", revenue: 1200 },
        { month: "Feb", revenue: 1540 },
      ]);
    });

    it("accepts the legacy JSON-string dataset form", () => {
      const result = normalizeChartPayload({
        type: "line",
        dataset: JSON.stringify([
          { name: "A", total: "1,234" },
          { name: "B", total: "$1.2k" },
        ]),
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toEqual([
        { name: "A", total: 1234 },
        { name: "B", total: 1200 },
      ]);
    });

    it("falls back to row numbers when there is no category column", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [
          { alpha: 1, beta: 2 },
          { alpha: 3, beta: 4 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.xKey).toBe("name");
      expect(seriesKeys(result.chart)).toEqual(["alpha", "beta"]);
      expect(result.chart.dataset).toEqual([
        { name: "1", alpha: 1, beta: 2 },
        { name: "2", alpha: 3, beta: 4 },
      ]);
    });

    it("picks a numeric x column for scatter charts even when name exists", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        dataset: [
          { name: "A", x: 1, y: 2 },
          { name: "B", x: 2, y: 4 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.xKey).toBe("x");
      expect(seriesKeys(result.chart)).toEqual(["y"]);
      // Unused columns are dropped so the payload only carries plotted data.
      expect(result.chart.dataset).toEqual([
        { x: 1, y: 2 },
        { x: 2, y: 4 },
      ]);
    });

    it("falls back to the category column when scatter has a single numeric column", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        dataset: [
          { name: "A", y: 2 },
          { name: "B", y: 4 },
        ],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("at least two numeric data points");
    });

    it("prefers a real date column over a generic name column", () => {
      const result = normalizeChartPayload({
        type: "line",
        dataset: [
          { name: "Series A", date: "2024-01", revenue: 10 },
          { name: "Series A", date: "2024-02", revenue: 12 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.xKey).toBe("date");
      expect(seriesKeys(result.chart)).toEqual(["revenue"]);
      expect(result.chart.dataset).toEqual([
        { date: "2024-01", revenue: 10 },
        { date: "2024-02", revenue: 12 },
      ]);
    });

    it("keeps the x values numeric for scatter charts", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        dataset: [
          { x: 1, y: 2 },
          { x: 2, y: 4 },
          { x: 3, y: 9 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.xKey).toBe("x");
      expect(result.chart.dataset).toEqual([
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 9 },
      ]);
    });
  });

  describe("series resolution", () => {
    it("honors an explicitly requested xKey", () => {
      const result = normalizeChartPayload({
        type: "bar",
        xKey: "category",
        dataset: [
          { category: "A", value: 5 },
          { category: "B", value: 7 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.xKey).toBe("category");
      expect(seriesKeys(result.chart)).toEqual(["value"]);
    });

    it("builds labels and kinds from the requested series", () => {
      const result = normalizeChartPayload({
        type: "composed",
        dataset: [
          { name: "Jan", signups: 320, churn: 42 },
          { name: "Feb", signups: 410, churn: 38 },
        ],
        series: [
          { key: "signups", label: "Signups", kind: "bar" },
          { key: "churn", label: "Churn", kind: "line" },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.series).toEqual([
        { key: "signups", label: "Signups", kind: "bar", axis: null },
        { key: "churn", label: "Churn", kind: "line", axis: null },
      ]);
    });

    it("prettifies labels and drops unknown series kinds", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [{ name: "A", net_revenue: 10 }],
        series: [{ key: "net_revenue", kind: "pie" }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.series).toEqual([
        { key: "net_revenue", label: "Net Revenue", kind: null, axis: null },
      ]);
    });

    it("falls back to numeric columns when requested keys do not exist", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [{ name: "A", v: 1, w: 2 }],
        series: [{ key: "missing" }],
      });

      expect(result.ok).toBe(true);
      expect(seriesKeys(result.chart)).toEqual(["v", "w"]);
    });

    it("ignores requested series columns that contain no numbers", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [{ name: "A", v: 1, notes: "first" }],
        series: [{ key: "notes", label: "Notes" }],
      });

      expect(result.ok).toBe(true);
      expect(seriesKeys(result.chart)).toEqual(["v"]);
    });

    it("deduplicates repeated series keys", () => {
      const result = normalizeChartPayload({
        type: "line",
        dataset: [{ name: "A", v: 1 }],
        series: [{ key: "v" }, { key: "v", label: "V" }],
      });

      expect(result.ok).toBe(true);
      expect(seriesKeys(result.chart)).toEqual(["v"]);
    });
  });

  describe("ordering and aggregation", () => {
    it("sums rows that share a category", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [
          { name: "EU", sales: 10 },
          { name: "US", sales: 15 },
          { name: "EU", sales: 5 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toEqual([
        { name: "EU", sales: 15 },
        { name: "US", sales: 15 },
      ]);
      expect(result.chart.totalRows).toBe(2);
    });

    it("aggregates before sorting dates chronologically", () => {
      const result = normalizeChartPayload({
        type: "line",
        dataset: [
          { month: "Mar", revenue: 3 },
          { month: "Jan", revenue: 1 },
          { month: "Feb", revenue: 2 },
          { month: "Jan", revenue: 4 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toEqual([
        { month: "Jan", revenue: 5 },
        { month: "Feb", revenue: 2 },
        { month: "Mar", revenue: 3 },
      ]);
    });

    it("sorts numeric x values ascending", () => {
      const result = normalizeChartPayload({
        type: "line",
        xKey: "year",
        dataset: [
          { year: 2025, value: 5 },
          { year: 2023, value: 3 },
          { year: 2024, value: 4 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset.map((row) => row.year)).toEqual([
        "2023",
        "2024",
        "2025",
      ]);
    });

    it("keeps zero and negative values for bar charts", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [
          { name: "A", value: 10 },
          { name: "B", value: 0 },
          { name: "C", value: -5 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toHaveLength(3);
    });

    it("drops non-positive slices from part-of-whole charts", () => {
      const result = normalizeChartPayload({
        type: "pie",
        dataset: [
          { name: "A", value: 10 },
          { name: "B", value: 0 },
          { name: "C", value: -5 },
          { name: "D", value: 7 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toEqual([
        { name: "A", value: 10 },
        { name: "D", value: 7 },
      ]);
      expect(result.chart.totalRows).toBe(2);
    });
  });

  describe("row limits", () => {
    it("caps cartesian charts and reports truncation", () => {
      const dataset = Array.from(
        { length: MAX_CARTESIAN_POINTS + 10 },
        (_, index) => ({ name: `Row ${index + 1}`, value: index + 1 })
      );

      const result = normalizeChartPayload({ type: "bar", dataset });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toHaveLength(MAX_CARTESIAN_POINTS);
      expect(result.chart.dataset.at(-1).name).toBe(
        `Row ${MAX_CARTESIAN_POINTS}`
      );
      expect(result.chart.totalRows).toBe(dataset.length);
      expect(result.chart.truncated).toBe(true);
    });

    it("folds all but the largest pie slices into Other", () => {
      const dataset = Array.from({ length: 12 }, (_, index) => ({
        name: `Item ${index + 1}`,
        value: index + 1,
      }));

      const result = normalizeChartPayload({ type: "pie", dataset });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toHaveLength(MAX_PIE_SLICES);
      expect(result.chart.dataset[0]).toEqual({ name: "Item 12", value: 12 });
      expect(result.chart.dataset.at(-1)).toEqual({ name: "Other", value: 15 });
      expect(result.chart.totalRows).toBe(12);
      expect(result.chart.truncated).toBe(true);
    });

    it("keeps the first categories for radar charts", () => {
      const dataset = Array.from(
        { length: MAX_CATEGORY_POINTS + 5 },
        (_, index) => ({ name: `Item ${index + 1}`, value: index + 1 })
      );

      const result = normalizeChartPayload({ type: "radar", dataset });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toHaveLength(MAX_CATEGORY_POINTS);
      expect(result.chart.dataset[0].name).toBe("Item 1");
      expect(result.chart.truncated).toBe(true);
    });

    it("keeps the largest categories for treemap charts", () => {
      const dataset = Array.from(
        { length: MAX_CATEGORY_POINTS + 3 },
        (_, index) => ({ name: `Item ${index + 1}`, value: index + 1 })
      );

      const result = normalizeChartPayload({ type: "treemap", dataset });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toHaveLength(MAX_CATEGORY_POINTS);
      expect(result.chart.dataset[0].name).toBe(
        `Item ${MAX_CATEGORY_POINTS + 3}`
      );
      expect(result.chart.truncated).toBe(true);
    });

    it("does not flag small datasets as truncated", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.truncated).toBe(false);
    });
  });

  describe("metadata", () => {
    it("applies defaults and normalizes the value format", () => {
      const result = normalizeChartPayload({
        type: "BAR",
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart).toMatchObject({
        type: "bar",
        title: "Chart",
        subtitle: "",
        xLabel: "",
        yLabel: "",
        valueFormat: "number",
        currency: "USD",
      });
    });

    it("keeps a valid value format and currency", () => {
      const result = normalizeChartPayload({
        type: "bar",
        title: "Revenue",
        subtitle: "Last quarter",
        xLabel: "Month",
        yLabel: "USD",
        valueFormat: "currency",
        currency: "€",
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart).toMatchObject({
        title: "Revenue",
        subtitle: "Last quarter",
        xLabel: "Month",
        yLabel: "USD",
        valueFormat: "currency",
        currency: "EUR",
      });
    });

    it("falls back on an unknown value format", () => {
      const result = normalizeChartPayload({
        type: "bar",
        valueFormat: "usd",
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.valueFormat).toBe("number");
    });
  });

  describe("presentation options", () => {
    it("applies safe presentation defaults", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [{ name: "A", revenue: 10 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart).toEqual(
        expect.objectContaining({
          stackMode: "grouped",
          orientation: "vertical",
          curve: "smooth",
          donut: true,
          showValues: false,
          showLegend: true,
          palette: "default",
          sort: "none",
          limit: null,
        })
      );
    });

    it("accepts horizontal stacked bars with a palette", () => {
      const result = normalizeChartPayload({
        type: "bar",
        orientation: "horizontal",
        stackMode: "stacked",
        palette: "ocean",
        showValues: true,
        dataset: [
          { name: "Q1", north: 10, south: 5 },
          { name: "Q2", north: 8, south: 6 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.orientation).toBe("horizontal");
      expect(result.chart.stackMode).toBe("stacked");
      expect(result.chart.palette).toBe("ocean");
      expect(result.chart.showValues).toBe(true);
    });

    it("normalizes percent stacks to a 100% share", () => {
      const result = normalizeChartPayload({
        type: "bar",
        stackMode: "percent",
        dataset: [
          { name: "Q1", north: 30, south: 10 },
          { name: "Q2", north: 20, south: 20 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.valueFormat).toBe("percent");
      expect(result.chart.dataset).toEqual([
        { name: "Q1", north: 75, south: 25 },
        { name: "Q2", north: 50, south: 50 },
      ]);
    });

    it("falls back to stacked when percent data contains negatives", () => {
      const result = normalizeChartPayload({
        type: "bar",
        stackMode: "percent",
        dataset: [
          { name: "A", g: 10, b: -2 },
          { name: "B", g: 8, b: 4 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.stackMode).toBe("stacked");
    });

    it("sorts rankings by the first series", () => {
      const result = normalizeChartPayload({
        type: "bar",
        sort: "desc",
        dataset: [
          { name: "A", value: 5 },
          { name: "B", value: 20 },
          { name: "C", value: 12 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset.map((row) => row.name)).toEqual([
        "B",
        "C",
        "A",
      ]);
    });

    it("folds rows beyond the limit into Other", () => {
      const result = normalizeChartPayload({
        type: "bar",
        sort: "desc",
        limit: 2,
        dataset: [
          { name: "A", value: 5 },
          { name: "B", value: 20 },
          { name: "C", value: 12 },
          { name: "D", value: 3 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toEqual([
        { name: "B", value: 20 },
        { name: "C", value: 12 },
        { name: "Other", value: 8 },
      ]);
      expect(result.chart.truncated).toBe(true);
    });

    it("uses the limit as the pie slice budget", () => {
      const result = normalizeChartPayload({
        type: "pie",
        limit: 3,
        dataset: [
          { name: "A", value: 5 },
          { name: "B", value: 20 },
          { name: "C", value: 12 },
          { name: "D", value: 3 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toEqual([
        { name: "B", value: 20 },
        { name: "C", value: 12 },
        { name: "Other", value: 8 },
      ]);
    });

    it("ignores invalid presentation values", () => {
      const result = normalizeChartPayload({
        type: "line",
        stackMode: "explode",
        orientation: "diagonal",
        curve: "bezier",
        palette: "neon",
        sort: "random",
        showLegend: "sometimes",
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.stackMode).toBe("grouped");
      expect(result.chart.orientation).toBe("vertical");
      expect(result.chart.curve).toBe("smooth");
      expect(result.chart.palette).toBe("default");
      expect(result.chart.sort).toBe("none");
      expect(result.chart.showLegend).toBe(true);
    });
  });

  describe("advanced presentation", () => {
    it("keeps per-series axis assignments for composed charts", () => {
      const result = normalizeChartPayload({
        type: "composed",
        rightValueFormat: "percent",
        dataset: [
          { name: "Jan", revenue: 1800, margin: 12 },
          { name: "Feb", revenue: 2200, margin: 15 },
        ],
        series: [
          { key: "revenue", kind: "bar", axis: "left" },
          { key: "margin", kind: "line", axis: "right" },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.series).toEqual([
        { key: "revenue", label: "Revenue", kind: "bar", axis: "left" },
        { key: "margin", label: "Margin", kind: "line", axis: "right" },
      ]);
      expect(result.chart.rightValueFormat).toBe("percent");
      expect(result.chart.rightCurrency).toBe("USD");
    });

    it("keeps a numeric size column for bubble charts", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        sizeKey: "weight",
        series: [{ key: "y", label: "Value" }],
        dataset: [
          { x: 1, y: 2, weight: 10 },
          { x: 2, y: 4, weight: 30 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.sizeKey).toBe("weight");
      expect(result.chart.dataset).toEqual([
        { x: 1, y: 2, weight: 10 },
        { x: 2, y: 4, weight: 30 },
      ]);
    });

    it("does not treat the bubble size column as a series", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        sizeKey: "weight",
        dataset: [
          { x: 1, y: 2, weight: 10 },
          { x: 2, y: 4, weight: 30 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(seriesKeys(result.chart)).toEqual(["y"]);
      expect(result.chart.dataset).toEqual([
        { x: 1, y: 2, weight: 10 },
        { x: 2, y: 4, weight: 30 },
      ]);
    });

    it("ignores a size column that has no numbers", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        sizeKey: "missing",
        series: [{ key: "y" }],
        dataset: [
          { x: 1, y: 2 },
          { x: 2, y: 4 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.sizeKey).toBeNull();
    });

    it("passes reference lines and computes the average", () => {
      const result = normalizeChartPayload({
        type: "bar",
        referenceLine: 15,
        referenceLabel: "Target",
        showAverage: true,
        dataset: [
          { name: "A", value: 10 },
          { name: "B", value: 20 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.referenceLine).toBe(15);
      expect(result.chart.referenceLabel).toBe("Target");
      expect(result.chart.showAverage).toBe(true);
      expect(result.chart.averageValue).toBe(15);
    });

    it("computes a least-squares trend for scatter charts", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        trendLine: true,
        series: [{ key: "y" }],
        dataset: [
          { x: 1, y: 2 },
          { x: 2, y: 4 },
          { x: 3, y: 6 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.trendLine).toBe(true);
      expect(result.chart.trendPoints).toEqual([
        { x: 1, y: 2 },
        { x: 3, y: 6 },
      ]);
    });

    it("converts signed deltas into a stacked waterfall", () => {
      const result = normalizeChartPayload({
        type: "waterfall",
        showValues: true,
        dataset: [
          { name: "Price", change: 100 },
          { name: "Costs", change: -30 },
          { name: "Volume", change: 50 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.type).toBe("waterfall");
      expect(result.chart.dataset).toEqual([
        { name: "Price", base: 0, delta: 100, change: 100, direction: "up" },
        { name: "Costs", base: 70, delta: 30, change: -30, direction: "down" },
        { name: "Volume", base: 70, delta: 50, change: 50, direction: "up" },
      ]);
      expect(result.chart.series).toEqual([
        { key: "delta", label: "Change", kind: "bar", axis: null },
      ]);
      expect(result.chart.showValues).toBe(true);
    });

    it("marks radialBar gauges and keeps the goal", () => {
      const result = normalizeChartPayload({
        type: "radialBar",
        gauge: true,
        gaugeMax: 500,
        dataset: [{ name: "Signups", value: 412 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.gauge).toBe(true);
      expect(result.chart.gaugeMax).toBe(500);
    });

    it("ignores advanced options that do not apply to the chart type", () => {
      const result = normalizeChartPayload({
        type: "bar",
        trendLine: true,
        gauge: true,
        gaugeMax: 100,
        rightValueFormat: "percent",
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.trendLine).toBe(false);
      expect(result.chart.trendPoints).toBeNull();
      expect(result.chart.gauge).toBe(false);
      expect(result.chart.gaugeMax).toBeNull();
      expect(result.chart.rightValueFormat).toBeNull();
      expect(result.chart.rightCurrency).toBeNull();
    });
  });

  describe("sankey", () => {
    it("converts link rows into nodes and indexed links", () => {
      const result = normalizeChartPayload({
        type: "sankey",
        title: "Signup flow",
        yLabel: "Users",
        dataset: [
          { source: "Organic", target: "Free", value: 420 },
          { source: "Paid", target: "Free", value: 260 },
          { source: "Organic", target: "Free", value: 80 },
          { source: "Free", target: "Pro", value: 300 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.type).toBe("sankey");
      expect(result.chart.nodes).toEqual([
        { name: "Organic" },
        { name: "Free" },
        { name: "Paid" },
        { name: "Pro" },
      ]);
      expect(result.chart.dataset).toEqual([
        { source: 0, target: 1, value: 500 },
        { source: 2, target: 1, value: 260 },
        { source: 1, target: 3, value: 300 },
      ]);
      expect(result.chart.series).toEqual([
        { key: "value", label: "Users", kind: null, axis: null },
      ]);
      expect(result.chart.xKey).toBe("source");
    });

    it("accepts from, to, and amount aliases", () => {
      const result = normalizeChartPayload({
        type: "sankey",
        dataset: [
          { from: "A", to: "B", amount: 10 },
          { from: "B", to: "C", amount: 4 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.dataset).toEqual([
        { source: 0, target: 1, value: 10 },
        { source: 1, target: 2, value: 4 },
      ]);
    });

    it("skips self loops and non-positive flows", () => {
      const result = normalizeChartPayload({
        type: "sankey",
        dataset: [
          { source: "A", target: "A", value: 10 },
          { source: "A", target: "B", value: 0 },
          { source: "B", target: "C", value: 5 },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.chart.nodes).toEqual([{ name: "B" }, { name: "C" }]);
      expect(result.chart.dataset).toEqual([
        { source: 0, target: 1, value: 5 },
      ]);
    });

    it("rejects link rows without source and target columns", () => {
      const result = normalizeChartPayload({
        type: "sankey",
        dataset: [{ name: "Organic", value: 420 }],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("source and target");
    });

    it("rejects sankey charts with too many nodes", () => {
      const dataset = Array.from({ length: 13 }, (_, index) => ({
        source: "Start",
        target: `Node ${index + 1}`,
        value: 1,
      }));
      const result = normalizeChartPayload({ type: "sankey", dataset });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("limited to 12 nodes");
    });
  });

  describe("rejections", () => {
    it("rejects unknown chart types", () => {
      const result = normalizeChartPayload({
        type: "donut",
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("unsupported chart type");
      expect(result.reason).toContain("pie");
    });

    it("rejects a missing chart type", () => {
      const result = normalizeChartPayload({
        dataset: [{ name: "A", value: 1 }],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("(missing)");
    });

    it.each([{}, null, "not-json", 42])("rejects the dataset %j", (dataset) => {
      const result = normalizeChartPayload({ type: "bar", dataset });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("dataset must be an array");
    });

    it("rejects datasets without row objects", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [null, "x", [1, 2]],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("no usable row objects");
    });

    it("rejects datasets without numeric columns", () => {
      const result = normalizeChartPayload({
        type: "bar",
        dataset: [{ name: "A", note: "great" }],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("no numeric columns");
    });

    it("rejects part-of-whole charts with no positive values", () => {
      const result = normalizeChartPayload({
        type: "pie",
        dataset: [
          { name: "A", value: -1 },
          { name: "B", value: 0 },
        ],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("empty or non-numeric");
    });

    it("rejects scatter charts with fewer than two points", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        dataset: [{ x: 1, y: 2 }],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("at least two numeric data points");
    });

    it("rejects scatter charts with a non-numeric x column", () => {
      const result = normalizeChartPayload({
        type: "scatter",
        xKey: "name",
        dataset: [
          { name: "A", x: 1, y: 2 },
          { name: "B", x: 2, y: 4 },
        ],
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("at least two numeric data points");
    });
  });
});
