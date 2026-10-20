// Shared limits for the create-chart tool. The model is told about these in
// the tool description, but the normalization layer enforces them so a single
// oversized payload can never produce an unreadable chart.
const MAX_CHARTS_PER_RESPONSE = 4;
const MAX_CARTESIAN_POINTS = 40;
const MAX_CATEGORY_POINTS = 12;
const MAX_PIE_SLICES = 8;
const MAX_SCATTER_POINTS = 300;
const MAX_SANKEY_NODES = 12;
const MAX_SANKEY_LINKS = 40;

const CHART_TYPES = [
  "area",
  "bar",
  "waterfall",
  "line",
  "composed",
  "scatter",
  "pie",
  "radar",
  "radialBar",
  "treemap",
  "funnel",
  "sankey",
];

const POSITIVE_ONLY_TYPES = ["pie", "radialBar", "treemap", "funnel"];
const CATEGORY_TYPES = [
  "bar",
  "pie",
  "radar",
  "radialBar",
  "treemap",
  "funnel",
];
const VALUE_FORMATS = ["number", "currency", "percent", "compact"];
const SERIES_KINDS = ["bar", "line", "area"];
const STACK_MODES = ["grouped", "stacked", "percent"];
const ORIENTATIONS = ["vertical", "horizontal"];
const CURVES = ["smooth", "linear", "step"];
const PALETTES = ["default", "ocean", "sunset", "mono", "semantic"];
const SORTS = ["none", "asc", "desc"];
const AXES = ["left", "right"];
const MAX_LIMIT = 20;

const X_KEY_CANDIDATES = [
  "name",
  "label",
  "category",
  "date",
  "month",
  "year",
  "quarter",
  "period",
  "day",
  "week",
  "x",
];

// Checked first so a real date column wins over a generic "name" column.
const DATE_KEY_CANDIDATES = [
  "date",
  "month",
  "period",
  "quarter",
  "week",
  "day",
  "year",
];

const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const CURRENCY_SYMBOLS = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₽": "RUB",
  "₹": "INR",
};

const EMPTY_VALUES = /^(?:n\/?a|null|nil|none|undefined|[-—–])$/i;

/**
 * Parse the legacy JSON-string dataset form. Stored charts and some providers
 * send the dataset as a string, so it is accepted alongside real arrays.
 * @param {unknown} value
 * @returns {unknown}
 */
function parseDatasetString(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Turn chart metric keys into display labels: net_revenue -> Net Revenue,
 * netRevenue -> Net Revenue, Q1_sales -> Q1 Sales.
 * @param {string} key
 * @returns {string}
 */
function prettifyKey(key = "") {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Coerce LLM-formatted numbers ("1,234", "$1.2k", "12%", "(1,200)") into
 * finite numbers. Anything that cannot be parsed is treated as missing data.
 * @param {unknown} value
 * @returns {number|null}
 */
function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw || EMPTY_VALUES.test(raw)) return null;

  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[()]/g, "")
    .replace(/[$€£¥₽₹]/g, "")
    .replace(/[\s\u00a0]/g, "")
    .replace(/,/g, "")
    .replace(/%$/, "");

  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/i);
  if (!match) return null;

  let number = parseFloat(match[1]);
  if (!Number.isFinite(number)) return null;

  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k") number *= 1e3;
  else if (suffix === "m") number *= 1e6;
  else if (suffix === "b") number *= 1e9;

  return negative ? -Math.abs(number) : number;
}

/**
 * @param {Object[]} rows
 * @param {string} key
 * @returns {boolean}
 */
function isDateLikeColumn(rows, key) {
  const values = rows
    .map((row) => row?.[key])
    .filter((value) => value !== undefined && value !== null && value !== "");
  if (values.length === 0) return false;
  const matches = values.filter((value) => parseDateValue(value) !== null);
  return matches.length >= Math.ceil(values.length * 0.8);
}

/**
 * Pick the column that holds the category labels for the x-axis.
 * @param {Object[]} rows
 * @param {string} [requested]
 * @param {string} [type]
 * @returns {string|null}
 */
function findXKey(rows, requested, type = null) {
  if (
    typeof requested === "string" &&
    rows.some((row) => row && requested in row)
  ) {
    return requested;
  }

  if (type === "scatter") {
    const keys = [
      ...new Set(rows.flatMap((row) => (row ? Object.keys(row) : []))),
    ];
    const numericKeys = keys.filter(
      (key) =>
        rows.filter((row) => toFiniteNumber(row?.[key]) !== null).length >= 2
    );
    // A scatter needs two numeric columns: one for x and at least one to plot.
    // Returning the only numeric column would leave no series and surface a
    // confusing "no numeric columns" error instead of the scatter guidance.
    if (numericKeys.length >= 2) return numericKeys[0];
  }

  for (const candidate of DATE_KEY_CANDIDATES) {
    if (isDateLikeColumn(rows, candidate)) return candidate;
  }

  for (const candidate of X_KEY_CANDIDATES) {
    if (
      rows.some(
        (row) => row && row[candidate] !== undefined && row[candidate] !== null
      )
    ) {
      return candidate;
    }
  }

  const keys = [
    ...new Set(rows.flatMap((row) => (row ? Object.keys(row) : []))),
  ];
  for (const key of keys) {
    const values = rows
      .map((row) => row?.[key])
      .filter((value) => value !== undefined && value !== null && value !== "");
    if (
      values.length > 0 &&
      values.every(
        (value) => typeof value === "string" && toFiniteNumber(value) === null
      )
    ) {
      return key;
    }
  }

  return null;
}

/**
 * Resolve which columns are numeric series. An explicit `series` list wins,
 * but only for keys that actually exist in the dataset.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {Array<{key: string}|string>} [requested]
 * @param {string|null} [excludeKey] Size column that must not become a series.
 * @returns {string[]}
 */
function findSeriesKeys(rows, xKey, requested, excludeKey = null) {
  const allKeys = [
    ...new Set(rows.flatMap((row) => (row ? Object.keys(row) : []))),
  ].filter((key) => key !== xKey && key !== excludeKey);

  if (Array.isArray(requested) && requested.length > 0) {
    const keys = requested
      .map((entry) => (typeof entry === "string" ? entry : entry?.key))
      .filter((key) => typeof key === "string" && allKeys.includes(key))
      // A requested text column cannot be plotted, so fall back to the
      // numeric columns instead of failing the whole chart.
      .filter((key) => rows.some((row) => toFiniteNumber(row?.[key]) !== null));
    if (keys.length > 0) return [...new Set(keys)];
  }

  return allKeys.filter((key) =>
    rows.some((row) => toFiniteNumber(row?.[key]) !== null)
  );
}

/**
 * Build the series metadata sent to the renderer.
 * @param {Array<{key: string}|string>} [requested]
 * @param {string[]} seriesKeys
 * @returns {Array<{key: string, label: string, kind: string|null}>}
 */
function buildSeries(seriesKeys, requested) {
  const definitions = Array.isArray(requested) ? requested : [];
  return seriesKeys.map((key) => {
    const definition = definitions.find((entry) =>
      typeof entry === "string" ? entry === key : entry?.key === key
    );
    const metadata =
      definition && typeof definition !== "string" ? definition : {};
    const label =
      typeof metadata.label === "string" && metadata.label.trim()
        ? metadata.label.trim().slice(0, 80)
        : prettifyKey(key);
    const kind = SERIES_KINDS.includes(metadata.kind) ? metadata.kind : null;
    const axis = AXES.includes(metadata.axis) ? metadata.axis : null;
    return { key, label, kind, axis };
  });
}

/**
 * Parse enough date shapes to sort month/quarter/year categories correctly.
 * Returns null for anything that is not date-like.
 * @param {unknown} value
 * @returns {number|null}
 */
function parseDateValue(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})$/);
  if (match) return Date.UTC(Number(match[1]), 0, 1);

  match = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/);
  if (match) {
    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3] || 1)
    );
  }

  match =
    text.match(/^(\d{4})[-/ ]?q([1-4])$/i) ||
    text.match(/^q([1-4])[-/ ]?(\d{4})$/i);
  if (match) {
    const startsWithYear = /^\d{4}/.test(match[0]);
    const year = startsWithYear ? match[1] : match[2];
    const quarter = startsWithYear ? match[2] : match[1];
    return Date.UTC(Number(year), (Number(quarter) - 1) * 3, 1);
  }

  match = text.match(/^([a-z]{3,9})\.?[-/ ](\d{4})$/i);
  if (match) {
    const month = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
    if (month !== undefined) return Date.UTC(Number(match[2]), month, 1);
  }

  match = text.match(/^([a-z]{3,9})\.?$/i);
  if (match) {
    const month = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
    if (month !== undefined) return month;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Sort rows chronologically or numerically when the x-axis is ordered data.
 * Unordered categories keep the order the model produced.
 * @param {Object[]} rows
 * @param {string} xKey
 * @returns {Object[]}
 */
function sortRows(rows, xKey) {
  const dateValues = rows.map((row) => parseDateValue(row?.[xKey]));
  const validDates = dateValues.filter((value) => value !== null);
  if (validDates.length >= Math.ceil(rows.length * 0.8)) {
    return rows
      .map((row, index) => ({ row, order: dateValues[index] }))
      .sort((left, right) => {
        if (left.order === null) return 1;
        if (right.order === null) return -1;
        return left.order - right.order;
      })
      .map((entry) => entry.row);
  }

  const numericValues = rows.map((row) => toFiniteNumber(row?.[xKey]));
  if (numericValues.every((value) => value !== null)) {
    return rows
      .map((row, index) => ({ row, order: numericValues[index] }))
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.row);
  }

  return rows;
}

/**
 * Coerce every series cell to a number (or null) and normalize the label.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string[]} seriesKeys
 * @returns {Object[]}
 */
function coerceRows(rows, xKey, seriesKeys, sizeKey = null) {
  return rows.map((row, index) => {
    const next = { [xKey]: String(row?.[xKey] ?? index + 1) };
    for (const key of seriesKeys) next[key] = toFiniteNumber(row?.[key]);
    if (sizeKey && !(sizeKey in next)) {
      next[sizeKey] = toFiniteNumber(row?.[sizeKey]);
    }
    return next;
  });
}

/**
 * Sum rows that share a category so duplicate labels do not create
 * overlapping bars or misleading tooltips.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string[]} seriesKeys
 * @returns {Object[]}
 */
function aggregateRows(rows, xKey, seriesKeys) {
  const order = [];
  const aggregated = new Map();

  for (const row of rows) {
    const label = String(row?.[xKey] ?? "").trim();
    if (!label) continue;

    if (!aggregated.has(label)) {
      aggregated.set(label, { [xKey]: label });
      order.push(label);
    }

    const target = aggregated.get(label);
    for (const key of seriesKeys) {
      const value = toFiniteNumber(row?.[key]);
      if (value === null) continue;
      target[key] = (target[key] ?? 0) + value;
    }
  }

  return order.map((label) => aggregated.get(label));
}

/**
 * @param {Object[]} rows
 * @param {string[]} seriesKeys
 * @returns {Object[]}
 */
function keepChartableRows(rows, seriesKeys) {
  return rows.filter((row) =>
    seriesKeys.some((key) => toFiniteNumber(row?.[key]) !== null)
  );
}

/**
 * Pie charts beyond 8 slices are unreadable, so everything after the 7 largest
 * categories is folded into a single "Other" slice.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string[]} seriesKeys
 * @returns {{rows: Object[], truncated: boolean}}
 */
function capPieRows(rows, xKey, seriesKeys, maxSlices = MAX_PIE_SLICES) {
  if (rows.length <= maxSlices) return { rows, truncated: false };

  const primaryKey = seriesKeys[0];
  const sorted = [...rows].sort(
    (left, right) => (right[primaryKey] ?? 0) - (left[primaryKey] ?? 0)
  );
  const visible = sorted.slice(0, maxSlices - 1);
  const remainder = sorted.slice(maxSlices - 1);

  const other = { [xKey]: "Other" };
  for (const key of seriesKeys) {
    other[key] = remainder.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  }

  return { rows: [...visible, other], truncated: true };
}

/**
 * Enforce per-type row limits.
 * @param {string} type
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string[]} seriesKeys
 * @returns {{rows: Object[], truncated: boolean}}
 */
function capRows(type, rows, xKey, seriesKeys, maxSlices = MAX_PIE_SLICES) {
  if (type === "pie") return capPieRows(rows, xKey, seriesKeys, maxSlices);

  const limit =
    type === "scatter"
      ? MAX_SCATTER_POINTS
      : ["radar", "radialBar", "treemap", "funnel"].includes(type)
        ? MAX_CATEGORY_POINTS
        : MAX_CARTESIAN_POINTS;

  if (rows.length <= limit) return { rows, truncated: false };

  if (type === "treemap" || type === "radialBar") {
    const primaryKey = seriesKeys[0];
    const top = [...rows]
      .sort((left, right) => (right[primaryKey] ?? 0) - (left[primaryKey] ?? 0))
      .slice(0, limit);
    return { rows: top, truncated: true };
  }

  return { rows: rows.slice(0, limit), truncated: true };
}

/**
 * Sort category rows by the first series so rankings read top-down.
 * @param {Object[]} rows
 * @param {string} primaryKey
 * @param {string} order
 * @returns {Object[]}
 */
function sortByMetric(rows, primaryKey, order) {
  if (order !== "asc" && order !== "desc") return rows;
  const direction = order === "asc" ? 1 : -1;
  return [...rows].sort(
    (left, right) =>
      direction * ((left[primaryKey] ?? 0) - (right[primaryKey] ?? 0))
  );
}

/**
 * Fold everything after the first `limit` categories into a single Other row.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string[]} seriesKeys
 * @param {number} limit
 * @returns {{rows: Object[], truncated: boolean}}
 */
function limitRows(rows, xKey, seriesKeys, limit) {
  if (rows.length <= limit) return { rows, truncated: false };

  const visible = rows.slice(0, limit);
  const remainder = rows.slice(limit);
  const other = { [xKey]: "Other" };
  for (const key of seriesKeys) {
    other[key] = remainder.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  }

  return { rows: [...visible, other], truncated: true };
}

/**
 * Turn absolute values into a 100% share of each row for percent stacking.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string[]} seriesKeys
 * @returns {Object[]}
 */
function toPercentRows(rows, xKey, seriesKeys) {
  return rows.map((row) => {
    const total = seriesKeys.reduce(
      (sum, key) => sum + Math.max(row[key] ?? 0, 0),
      0
    );
    const next = { [xKey]: row[xKey] };
    for (const key of seriesKeys) {
      next[key] =
        total > 0
          ? Math.round((Math.max(row[key] ?? 0, 0) / total) * 10000) / 100
          : null;
    }
    return next;
  });
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function normalizeLimit(value) {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  return Math.min(Math.max(Math.round(number), 1), MAX_LIMIT);
}

/**
 * Pick the numeric column that controls bubble size on a scatter chart.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {unknown} requested
 * @returns {string|null}
 */
function findSizeKey(rows, xKey, requested) {
  if (typeof requested !== "string" || requested === xKey) return null;
  const usable = rows.filter(
    (row) => toFiniteNumber(row?.[requested]) !== null
  );
  return usable.length > 0 ? requested : null;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function normalizePositiveNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

/**
 * @param {Object[]} rows
 * @param {string} key
 * @returns {number|null}
 */
function averageOf(rows, key) {
  const values = rows
    .map((row) => row?.[key])
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Least-squares trend line between two numeric columns, returned as the two
 * endpoints Recharts needs to draw a straight line.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string} yKey
 * @returns {Array<{x: number, y: number}>|null}
 */
function linearTrendPoints(rows, xKey, yKey) {
  const points = rows
    .filter(
      (row) => Number.isFinite(row?.[xKey]) && Number.isFinite(row?.[yKey])
    )
    .map((row) => ({ x: row[xKey], y: row[yKey] }));
  if (points.length < 2) return null;

  const count = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;
  if (!denominator) return null;

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  const xs = points.map((point) => point.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (minX === maxX) return null;

  return [
    { x: minX, y: intercept + slope * minX },
    { x: maxX, y: intercept + slope * maxX },
  ];
}

/**
 * Turn signed deltas into a stacked base/delta pair so a waterfall can be
 * drawn with two regular bars; `change` keeps the signed value for labels.
 * @param {Object[]} rows
 * @param {string} xKey
 * @param {string} primaryKey
 * @returns {Object[]}
 */
function toWaterfallRows(rows, xKey, primaryKey) {
  let running = 0;
  return rows.map((row) => {
    const change = row[primaryKey] ?? 0;
    const start = running;
    running += change;
    return {
      [xKey]: row[xKey],
      base: Math.min(start, running),
      delta: Math.abs(change),
      change,
      direction: change < 0 ? "down" : "up",
    };
  });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeCurrency(value) {
  if (typeof value !== "string") return "USD";
  const trimmed = value.trim();
  if (CURRENCY_SYMBOLS[trimmed]) return CURRENCY_SYMBOLS[trimmed];
  const code = trimmed.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

/**
 * @param {string} reason
 * @returns {{ok: false, reason: string}}
 */
function fail(reason) {
  return { ok: false, reason };
}

/**
 * Sankey charts use link rows instead of category rows: each row is
 * { source, target, value }. Nodes are derived in first-appearance order and
 * links are converted to the numeric indices Recharts expects.
 * @param {Object} args
 * @param {Object[]} rows
 * @returns {{ok: true, chart: Object}|{ok: false, reason: string}}
 */
function normalizeSankeyChart(args, rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const sourceKey = ["source", "from", "origin"].find((key) =>
    keys.includes(key)
  );
  const targetKey = ["target", "to", "destination"].find((key) =>
    keys.includes(key)
  );
  if (!sourceKey || !targetKey) {
    return fail(
      'sankey rows need source and target columns, for example {"source":"Organic","target":"Free","value":420}'
    );
  }

  const valueKey =
    ["value", "amount", "flow", "weight", "count"].find((key) =>
      keys.includes(key)
    ) ??
    keys.find(
      (key) =>
        key !== sourceKey &&
        key !== targetKey &&
        rows.some((row) => toFiniteNumber(row?.[key]) !== null)
    );
  if (!valueKey) {
    return fail(
      "sankey rows need a positive numeric value column (value, amount, flow...)"
    );
  }

  const merged = new Map();
  for (const row of rows) {
    const source = String(row?.[sourceKey] ?? "")
      .trim()
      .slice(0, 40);
    const target = String(row?.[targetKey] ?? "")
      .trim()
      .slice(0, 40);
    const value = toFiniteNumber(row?.[valueKey]);
    if (!source || !target || source === target) continue;
    if (value === null || value <= 0) continue;

    const key = `${source}\u0000${target}`;
    const current = merged.get(key);
    if (current) current.value += value;
    else merged.set(key, { source, target, value });
  }

  let links = [...merged.values()];
  if (links.length === 0) {
    return fail(
      "sankey links need distinct source/target nodes and positive values"
    );
  }

  const totalRows = links.length;
  let truncated = false;
  if (links.length > MAX_SANKEY_LINKS) {
    links = [...links]
      .sort((left, right) => right.value - left.value)
      .slice(0, MAX_SANKEY_LINKS);
    truncated = true;
  }

  const nodeIndex = new Map();
  const nodeNames = [];
  for (const link of links) {
    for (const name of [link.source, link.target]) {
      if (!nodeIndex.has(name)) {
        nodeIndex.set(name, nodeNames.length);
        nodeNames.push(name);
      }
    }
  }
  if (nodeNames.length > MAX_SANKEY_NODES) {
    return fail(
      `sankey is limited to ${MAX_SANKEY_NODES} nodes. Aggregate small categories into an Other node first`
    );
  }

  const dataset = links.map((link) => ({
    source: nodeIndex.get(link.source),
    target: nodeIndex.get(link.target),
    value: link.value,
  }));
  const yLabel =
    typeof args.yLabel === "string" ? args.yLabel.trim().slice(0, 60) : "";
  const valueFormat = VALUE_FORMATS.includes(args.valueFormat)
    ? args.valueFormat
    : "number";

  return {
    ok: true,
    chart: {
      type: "sankey",
      title:
        typeof args.title === "string" && args.title.trim()
          ? args.title.trim().slice(0, 140)
          : "Chart",
      subtitle:
        typeof args.subtitle === "string"
          ? args.subtitle.trim().slice(0, 240)
          : "",
      xKey: "source",
      xLabel:
        typeof args.xLabel === "string" ? args.xLabel.trim().slice(0, 60) : "",
      yLabel,
      valueFormat,
      currency: normalizeCurrency(args.currency),
      series: [
        {
          key: "value",
          label: yLabel || "Flow",
          kind: null,
          axis: null,
        },
      ],
      nodes: nodeNames.map((name) => ({ name })),
      dataset,
      truncated,
      totalRows,
      stackMode: "grouped",
      orientation: "vertical",
      curve: "smooth",
      donut: true,
      showValues: false,
      showLegend: normalizeBoolean(args.showLegend, true),
      palette: PALETTES.includes(args.palette) ? args.palette : "default",
      sort: "none",
      limit: null,
      sizeKey: null,
      referenceLine: null,
      referenceLabel: "",
      showAverage: false,
      averageValue: null,
      trendLine: false,
      trendPoints: null,
      gauge: false,
      gaugeMax: null,
      rightValueFormat: null,
      rightCurrency: null,
    },
  };
}

/**
 * Validate and normalize the create-chart arguments into the payload the
 * frontend renders. Accepts both an array dataset and the legacy JSON-string
 * form so previously stored charts keep working if they are re-normalized.
 * @param {Object} args
 * @returns {{ok: true, chart: Object}|{ok: false, reason: string}}
 */
function normalizeChartPayload(args = {}) {
  const requestedType = typeof args.type === "string" ? args.type : "";
  const type = CHART_TYPES.find(
    (candidate) => candidate.toLowerCase() === requestedType.toLowerCase()
  );
  if (!type) {
    return fail(
      `unsupported chart type "${requestedType || "(missing)"}". Use one of: ${CHART_TYPES.join(", ")}`
    );
  }

  const rawDataset = parseDatasetString(args.dataset);
  if (!Array.isArray(rawDataset)) {
    return fail(
      "dataset must be an array of row objects (not a JSON string, object, or null)"
    );
  }

  const rawRows = rawDataset.filter(
    (row) => row && typeof row === "object" && !Array.isArray(row)
  );
  if (rawRows.length === 0) {
    return fail("dataset has no usable row objects");
  }

  if (type === "sankey") return normalizeSankeyChart(args, rawRows);

  let xKey = findXKey(rawRows, args.xKey, type);
  let rows = rawRows;
  if (!xKey) {
    // No category column at all - fall back to row numbers so the chart can
    // still show something useful instead of failing the whole call.
    xKey = "name";
    rows = rawRows.map((row, index) => ({ ...row, name: String(index + 1) }));
  }

  const sizeKey =
    type === "scatter" ? findSizeKey(rows, xKey, args.sizeKey) : null;
  const seriesKeys = findSeriesKeys(rows, xKey, args.series, sizeKey);
  if (seriesKeys.length === 0) {
    return fail(
      `no numeric columns found besides the category column "${xKey}". Add at least one numeric field to each row`
    );
  }

  let series = buildSeries(seriesKeys, args.series);
  const primaryKey = seriesKeys[0];

  rows = coerceRows(rows, xKey, seriesKeys, sizeKey);
  if (type !== "scatter") {
    rows = aggregateRows(rows, xKey, seriesKeys);
  } else {
    // A scatter chart plots two numeric axes, so keep the x values numeric.
    rows = rows.map((row) => ({ ...row, [xKey]: toFiniteNumber(row[xKey]) }));
  }
  rows = keepChartableRows(rows, seriesKeys);
  if (type === "scatter") {
    rows = rows.filter((row) => row[xKey] !== null);
    if (sizeKey) rows = rows.filter((row) => row[sizeKey] !== null);
  }

  if (POSITIVE_ONLY_TYPES.includes(type)) {
    rows = rows.filter((row) => (row[primaryKey] ?? 0) > 0);
  }

  if (type === "scatter" && rows.length < 2) {
    return fail(
      "scatter charts need at least two numeric data points on both axes"
    );
  }
  if (rows.length === 0) {
    return fail("all values for the selected series are empty or non-numeric");
  }

  const stackMode =
    ["bar", "area"].includes(type) && STACK_MODES.includes(args.stackMode)
      ? args.stackMode
      : "grouped";
  const canStackAsPercent =
    stackMode === "percent" &&
    rows.every((row) => seriesKeys.every((key) => (row[key] ?? 0) >= 0));
  const resolvedStackMode =
    stackMode === "percent" && !canStackAsPercent ? "stacked" : stackMode;
  if (resolvedStackMode === "percent") {
    rows = toPercentRows(rows, xKey, seriesKeys);
  }

  if (type !== "scatter") rows = sortRows(rows, xKey);

  const sort =
    CATEGORY_TYPES.includes(type) && SORTS.includes(args.sort)
      ? args.sort
      : "none";
  if (sort !== "none") rows = sortByMetric(rows, primaryKey, sort);

  if (type === "waterfall") {
    rows = toWaterfallRows(rows, xKey, primaryKey);
    series = [
      {
        key: "delta",
        label: prettifyKey(primaryKey),
        kind: "bar",
        axis: null,
      },
    ];
  }

  const limit = normalizeLimit(args.limit);
  const totalRows = rows.length;
  const limited =
    limit && ["bar", "radar", "radialBar", "treemap", "funnel"].includes(type)
      ? limitRows(rows, xKey, seriesKeys, limit)
      : { rows, truncated: false };
  const maxSlices = limit ? Math.min(limit, MAX_PIE_SLICES) : MAX_PIE_SLICES;
  const capped = capRows(type, limited.rows, xKey, seriesKeys, maxSlices);

  const valueFormat =
    resolvedStackMode === "percent"
      ? "percent"
      : VALUE_FORMATS.includes(args.valueFormat)
        ? args.valueFormat
        : "number";

  const supportsReference = [
    "bar",
    "line",
    "area",
    "composed",
    "scatter",
  ].includes(type);
  const referenceCandidate = toFiniteNumber(args.referenceLine);
  const referenceLine =
    supportsReference && referenceCandidate !== null
      ? referenceCandidate
      : null;
  const referenceLabel =
    typeof args.referenceLabel === "string"
      ? args.referenceLabel.trim().slice(0, 60)
      : "";
  const showAverage =
    supportsReference && normalizeBoolean(args.showAverage, false);
  const averageValue = showAverage ? averageOf(capped.rows, primaryKey) : null;
  const trendLine =
    type === "scatter" && normalizeBoolean(args.trendLine, false);
  const trendPoints = trendLine
    ? linearTrendPoints(capped.rows, xKey, primaryKey)
    : null;
  const gauge = type === "radialBar" && normalizeBoolean(args.gauge, false);
  const gaugeMax = gauge ? normalizePositiveNumber(args.gaugeMax) : null;
  const hasRightAxis =
    type === "composed" && series.some((item) => item.axis === "right");
  const rightValueFormat =
    hasRightAxis && VALUE_FORMATS.includes(args.rightValueFormat)
      ? args.rightValueFormat
      : null;
  const rightCurrency = hasRightAxis
    ? normalizeCurrency(args.rightCurrency ?? args.currency)
    : null;

  const title =
    typeof args.title === "string" && args.title.trim()
      ? args.title.trim().slice(0, 140)
      : "Chart";
  const subtitle =
    typeof args.subtitle === "string" ? args.subtitle.trim().slice(0, 240) : "";

  return {
    ok: true,
    chart: {
      type,
      title,
      subtitle,
      xKey,
      xLabel:
        typeof args.xLabel === "string" ? args.xLabel.trim().slice(0, 60) : "",
      yLabel:
        typeof args.yLabel === "string" ? args.yLabel.trim().slice(0, 60) : "",
      valueFormat,
      currency: normalizeCurrency(args.currency),
      series,
      dataset: capped.rows,
      truncated: limited.truncated || capped.truncated,
      totalRows,
      stackMode: resolvedStackMode,
      orientation:
        type === "bar" && ORIENTATIONS.includes(args.orientation)
          ? args.orientation
          : "vertical",
      curve: CURVES.includes(args.curve) ? args.curve : "smooth",
      donut: normalizeBoolean(args.donut, true),
      showValues: normalizeBoolean(args.showValues, false),
      showLegend: normalizeBoolean(args.showLegend, true),
      palette: PALETTES.includes(args.palette) ? args.palette : "default",
      sort,
      limit,
      sizeKey,
      referenceLine,
      referenceLabel,
      showAverage,
      averageValue,
      trendLine,
      trendPoints,
      gauge,
      gaugeMax,
      rightValueFormat,
      rightCurrency,
    },
  };
}

module.exports = {
  CHART_TYPES,
  MAX_CHARTS_PER_RESPONSE,
  MAX_CARTESIAN_POINTS,
  MAX_CATEGORY_POINTS,
  MAX_PIE_SLICES,
  MAX_SCATTER_POINTS,
  MAX_LIMIT,
  VALUE_FORMATS,
  SERIES_KINDS,
  STACK_MODES,
  ORIENTATIONS,
  CURVES,
  PALETTES,
  SORTS,
  AXES,
  normalizeChartPayload,
  normalizeCurrency,
  toFiniteNumber,
  prettifyKey,
  parseDateValue,
};
