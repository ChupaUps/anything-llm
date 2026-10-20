/* eslint-env jest */
const {
  normalizeTable,
  normalizeChart,
  normalizeSlide,
  normalizeSlides,
  normalizeDeckRequest,
  normalizeLayout,
  extractSlidesFromText,
  dedupeCitations,
  expandLongSlides,
  normalizeBranding,
} = require("../../../../../../../utils/agents/aibitat/plugins/create-files/pptx/normalize.js");

const CHART_DATASET = [
  { month: "Jan", revenue: 120 },
  { month: "Feb", revenue: 140 },
  { month: "Mar", revenue: 180 },
];

function validChart(overrides = {}) {
  return {
    type: "bar",
    xKey: "month",
    series: ["revenue"],
    dataset: CHART_DATASET,
    source: { title: "Internal finance report", asOf: "2026-01" },
    ...overrides,
  };
}

describe("normalizeTable", () => {
  test("maps object rows by key even when display headers are provided", () => {
    const table = normalizeTable({
      headers: ["Month", "Revenue"],
      rows: [
        { month: "Jan", revenue: 120 },
        { month: "Feb", revenue: 140 },
      ],
    });

    expect(table.headers).toEqual(["Month", "Revenue"]);
    expect(table.rows).toEqual([
      ["Jan", "120"],
      ["Feb", "140"],
    ]);
  });

  test("uses object keys as headers when none are provided", () => {
    const table = normalizeTable({
      rows: [{ region: "EMEA", arr: 42 }],
    });

    expect(table.headers).toEqual(["region", "arr"]);
    expect(table.rows).toEqual([["EMEA", "42"]]);
  });

  test("pads ragged rows to the same column count", () => {
    const table = normalizeTable({
      headers: ["A", "B", "C"],
      rows: [["1"], ["2", "3"]],
    });

    expect(table.rows).toEqual([
      ["1", "", ""],
      ["2", "3", ""],
    ]);
  });

  test("tracks totalRows before truncation", () => {
    const rows = Array.from({ length: 30 }, (_, index) => [
      String(index),
      "value",
    ]);
    const table = normalizeTable({ headers: ["N", "V"], rows });

    expect(table.truncated).toBe(true);
    expect(table.rows).toHaveLength(24);
    expect(table.totalRows).toBe(30);
  });

  test("returns null when there are no usable rows", () => {
    expect(normalizeTable({ headers: ["A"], rows: [] })).toBeNull();
    expect(normalizeTable({ rows: [["", ""]] })).toBeNull();
  });
});

describe("normalizeChart", () => {
  test("accepts a bar chart with a verifiable source", () => {
    const result = normalizeChart(validChart());

    expect(result.ok).toBe(true);
    expect(result.chart.type).toBe("bar");
    expect(result.chart.source.title).toBe("Internal finance report");
    expect(result.chart.asOf).toBe("2026-01");
  });

  test("maps column/donut aliases to PPTX chart types", () => {
    expect(normalizeChart(validChart({ type: "column" })).chart.type).toBe(
      "bar"
    );

    const pie = normalizeChart(
      validChart({
        type: "donut",
        dataset: [
          { month: "A", revenue: 1 },
          { month: "B", revenue: 2 },
        ],
      })
    );
    expect(pie.ok).toBe(true);
    expect(pie.chart.type).toBe("pie");
  });

  test("rejects treemap and sankey because PPTX cannot render them", () => {
    expect(normalizeChart(validChart({ type: "treemap" })).ok).toBe(false);
    expect(normalizeChart(validChart({ type: "sankey" })).ok).toBe(false);
  });

  test("requires source provenance with a url or asOf date", () => {
    expect(normalizeChart(validChart({ source: null })).ok).toBe(false);
    expect(
      normalizeChart(validChart({ source: { title: "Some report" } })).ok
    ).toBe(false);
  });

  test("rejects charts with too few data points", () => {
    const result = normalizeChart(
      validChart({ dataset: [{ month: "Jan", revenue: 120 }] })
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data point/i);
  });

  test("rejects unknown chart types", () => {
    const result = normalizeChart(validChart({ type: "hologram" }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported chart type/i);
  });
});

describe("normalizeSlide", () => {
  test("recovers bullets from a newline string and strips markers", () => {
    const result = normalizeSlide({
      layout: "content",
      title: "Highlights",
      content: "• Revenue grew 23%\r\n• Margin expanded\n- Churn improved",
    });

    expect(result.ok).toBe(true);
    expect(result.slide.layout).toBe("content");
    expect(result.slide.content).toEqual([
      "Revenue grew 23%",
      "Margin expanded",
      "Churn improved",
    ]);
  });

  test("accepts a chart whose source is declared at slide level", () => {
    const result = normalizeSlide({
      layout: "chart",
      title: "Revenue trend",
      source: { title: "Finance report", asOf: "2026-01" },
      chart: {
        type: "line",
        xKey: "month",
        series: ["revenue"],
        dataset: CHART_DATASET,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.slide.layout).toBe("chart");
    expect(result.slide.chart.source.title).toBe("Finance report");
  });

  test("downgrades a chart without provenance to a table", () => {
    const result = normalizeSlide({
      layout: "chart",
      title: "Revenue",
      chart: {
        type: "bar",
        xKey: "month",
        series: ["revenue"],
        dataset: CHART_DATASET,
      },
      table: {
        headers: ["Month", "Revenue"],
        rows: [["Jan", 120]],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.slide.layout).toBe("table");
    expect(result.warnings.join(" ")).toMatch(/downgraded/i);
  });

  test("downgrades an under-filled KPI slide to content", () => {
    const result = normalizeSlide({
      layout: "kpi",
      title: "One metric",
      stats: [{ value: "23%", label: "Growth" }],
      content: ["Revenue grew 23%"],
    });

    expect(result.ok).toBe(true);
    expect(result.slide.layout).toBe("content");
  });

  test("downgrades an invalid table to bullets", () => {
    const result = normalizeSlide({
      layout: "table",
      title: "Broken table",
      table: { rows: [] },
      content: ["Fallback bullet"],
    });

    expect(result.ok).toBe(true);
    expect(result.slide.layout).toBe("content");
  });

  test("skips slides with no usable content", () => {
    const result = normalizeSlide({ layout: "content" });
    expect(result.ok).toBe(false);
    expect(result.slide).toBeNull();
  });

  test("normalizes layouts through aliases", () => {
    expect(normalizeLayout("Bullet List")).toBe("content");
    expect(normalizeLayout("stats")).toBe("kpi");
    expect(normalizeLayout("comparison")).toBe("two-column");
    expect(normalizeLayout("unknown-layout")).toBe("content");
  });
});

describe("expandLongSlides", () => {
  test("splits more than six bullets into continuation slides", () => {
    const slides = expandLongSlides(
      [
        {
          layout: "content",
          title: "Long list",
          content: ["1", "2", "3", "4", "5", "6", "7"],
        },
      ],
      { language: "en" }
    );

    expect(slides).toHaveLength(2);
    expect(slides[0].content).toHaveLength(6);
    expect(slides[1].content).toEqual(["7"]);
    expect(slides[1].title).toBe("Long list (continued)");
  });

  test("uses localized continuation wording", () => {
    const slides = expandLongSlides(
      [
        {
          layout: "content",
          title: "Список",
          content: ["1", "2", "3", "4", "5", "6", "7"],
        },
      ],
      { language: "ru" }
    );

    expect(slides[1].title).toBe("Список (продолжение)");
  });
});

describe("normalizeSlides", () => {
  test("drops invalid slides but keeps valid ones", () => {
    const result = normalizeSlides([
      { layout: "content", title: "Valid", content: ["One"] },
      { layout: "content" },
      "not a slide",
    ]);

    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].title).toBe("Valid");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("normalizeDeckRequest", () => {
  const base = {
    filename: "../../report.pptx",
    title: "Финансовый отчёт",
    sections: [{ title: "Итоги", keyPoints: ["Выручка выросла на 23%"] }],
  };

  test("detects Russian and sanitizes the filename", () => {
    const result = normalizeDeckRequest(base);

    expect(result.ok).toBe(true);
    expect(result.request.language).toBe("ru");
    expect(result.request.filename).toBe("report.pptx");
  });

  test("rejects a request without sections", () => {
    const result = normalizeDeckRequest({ title: "Empty" });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/sections/i);
  });

  test("falls back to auto for unknown themes and warns", () => {
    const result = normalizeDeckRequest({ ...base, theme: "neon" });

    expect(result.request.theme).toBe("auto");
    expect(result.warnings.join(" ")).toMatch(/unknown theme/i);
  });

  test("clamps targetSlideCount to the deck limit", () => {
    const result = normalizeDeckRequest({ ...base, targetSlideCount: 999 });
    expect(result.request.targetSlideCount).toBe(60);
  });

  test("defaults branding to minimal and honors mode none", () => {
    expect(normalizeDeckRequest(base).request.branding.mode).toBe("minimal");
    expect(
      normalizeDeckRequest({ ...base, branding: { mode: "none" } }).request
        .branding.mode
    ).toBe("none");
  });

  test("turns an object section map into sections with key points", () => {
    const result = normalizeDeckRequest({
      title: "Map",
      sections: { Overview: ["First point", "Second point"] },
    });

    expect(result.request.sections[0].title).toBe("Overview");
    expect(result.request.sections[0].keyPoints).toEqual([
      "First point",
      "Second point",
    ]);
  });
});

describe("extractSlidesFromText", () => {
  test("recovers slides from a fenced JSON array", () => {
    const text = [
      "Here is the section:",
      "```json",
      JSON.stringify([
        {
          layout: "content",
          title: "Recovered",
          content: ["First", "Second"],
        },
      ]),
      "```",
    ].join("\n");

    const result = extractSlidesFromText(text);

    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].title).toBe("Recovered");
    expect(result.warnings.join(" ")).toMatch(/recovered/i);
  });

  test("returns nothing for plain prose", () => {
    expect(extractSlidesFromText("No JSON here.").slides).toEqual([]);
  });
});

describe("dedupeCitations", () => {
  test("unwraps link://, dedupes by url and caps the list", () => {
    const citations = dedupeCitations([
      { title: "Doc A", chunkSource: "link://https://example.com/a" },
      { title: "Doc A again", url: "https://example.com/a" },
      { title: "Doc B" },
      ...Array.from({ length: 10 }, (_, index) => ({
        title: `Extra ${index}`,
        url: `https://example.com/${index}`,
      })),
    ]);

    expect(citations).toHaveLength(8);
    expect(citations[0]).toEqual({
      title: "Doc A",
      url: "https://example.com/a",
      text: "",
    });
    expect(citations[1].title).toBe("Doc B");
  });
});

describe("normalizeBranding", () => {
  test("normalizes hex colors and drops unusable logos", () => {
    const branding = normalizeBranding({
      mode: "full",
      primary: "#0c1929",
      accent: "c9943e",
      logo: "/local/logo.png",
    });

    expect(branding.mode).toBe("full");
    expect(branding.primary).toBe("0C1929");
    expect(branding.accent).toBe("C9943E");
    expect(branding.logo).toBeNull();
  });

  test("keeps data URI logos", () => {
    const branding = normalizeBranding({
      mode: "minimal",
      logo: "data:image/png;base64,AAAA",
    });

    expect(branding.logo.kind).toBe("data");
    expect(branding.logo.value).toBe("data:image/png;base64,AAAA");
  });
});
