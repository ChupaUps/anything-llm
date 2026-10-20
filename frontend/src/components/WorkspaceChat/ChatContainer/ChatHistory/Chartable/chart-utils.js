// Palettes tuned to stay readable on both the light and dark chat surfaces.
// Series and slices cycle through the selected preset for stable colors.
export const CHART_PALETTES = {
  default: [
    "#3b82f6", // blue
    "#10b981", // emerald
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#ef4444", // red
    "#06b6d4", // cyan
    "#ec4899", // pink
    "#84cc16", // lime
    "#f97316", // orange
    "#6366f1", // indigo
    "#14b8a6", // teal
    "#eab308", // yellow
  ],
  ocean: [
    "#0ea5e9",
    "#06b6d4",
    "#14b8a6",
    "#3b82f6",
    "#6366f1",
    "#0891b2",
    "#22d3ee",
    "#2dd4bf",
  ],
  sunset: [
    "#f97316",
    "#ef4444",
    "#ec4899",
    "#f59e0b",
    "#8b5cf6",
    "#fb7185",
    "#fbbf24",
    "#c026d3",
  ],
  mono: [
    "#1d4ed8",
    "#2563eb",
    "#3b82f6",
    "#60a5fa",
    "#818cf8",
    "#a5b4fc",
    "#7dd3fc",
    "#bae6fd",
  ],
  semantic: [
    "#10b981",
    "#ef4444",
    "#3b82f6",
    "#f59e0b",
    "#8b5cf6",
    "#06b6d4",
    "#ec4899",
    "#84cc16",
  ],
};

export const PALETTE_NAMES = Object.keys(CHART_PALETTES);
// Kept for callers that only need the default palette.
export const CHART_PALETTE = CHART_PALETTES.default;

const VALUE_FORMATS = ["number", "currency", "percent", "compact"];
const SERIES_KINDS = ["bar", "line", "area"];
const STACK_MODES = ["grouped", "stacked", "percent"];
const ORIENTATIONS = ["vertical", "horizontal"];
const CURVES = ["smooth", "linear", "step"];
const SORTS = ["none", "asc", "desc"];
const CURRENCY_SYMBOLS = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₽": "RUB",
  "₹": "INR",
};
const EMPTY_VALUES = /^(?:n\/?a|null|nil|none|undefined|[-—–])$/i;
const FORMATTER_CACHE = new Map();

export function paletteColors(name) {
  return CHART_PALETTES[name] ?? CHART_PALETTES.default;
}

/**
 * @param {number} [index]
 * @param {string} [palette]
 * @returns {string}
 */
export function colorAt(index = 0, palette = "default") {
  const colors = paletteColors(palette);
  return colors[index % colors.length];
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/**
 * Turn metric keys into display labels: net_revenue -> Net Revenue.
 * @param {string} key
 * @returns {string}
 */
export function prettifyKey(key = "") {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Coerce legacy values ("1,234", "$1.2k", "12%") into numbers so stored
 * charts that predate the server normalization layer still render.
 * @param {unknown} value
 * @returns {number|null}
 */
export function toNumber(value) {
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
 * @param {unknown} type
 * @returns {string|null}
 */
export function normalizeChartType(type) {
  if (typeof type !== "string") return null;
  const value = type.trim().toLowerCase();
  if (value === "radialbar") return "radialBar";
  if (value === "donut") return "pie";
  return [
    "area",
    "bar",
    "waterfall",
    "line",
    "composed",
    "scatter",
    "pie",
    "radar",
    "treemap",
    "funnel",
    "sankey",
  ].includes(value)
    ? value
    : null;
}

/**
 * @param {unknown} currency
 * @returns {string}
 */
export function normalizeCurrency(currency) {
  if (typeof currency !== "string") return "USD";
  const trimmed = currency.trim();
  if (CURRENCY_SYMBOLS[trimmed]) return CURRENCY_SYMBOLS[trimmed];
  const code = trimmed.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

function getNumberFormatter(valueFormat, currency, compact) {
  const cacheKey = `${valueFormat}|${currency}|${compact}`;
  if (FORMATTER_CACHE.has(cacheKey)) return FORMATTER_CACHE.get(cacheKey);

  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  let formatter;
  try {
    if (valueFormat === "currency") {
      formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 1 : 2,
      });
    } else if (valueFormat === "compact") {
      formatter = new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      });
    } else {
      formatter = new Intl.NumberFormat("en-US", {
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 0 : 2,
      });
    }
  } catch {
    formatter = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    });
  }

  FORMATTER_CACHE.set(cacheKey, formatter);
  return formatter;
}

/**
 * Format a value for tooltips, legends, and labels.
 * @param {unknown} value
 * @param {{valueFormat?: string, currency?: string, compact?: boolean}} [options]
 * @returns {string}
 */
export function formatValue(value, options = {}) {
  const number = toNumber(value);
  if (number === null) return "—";

  const valueFormat = VALUE_FORMATS.includes(options.valueFormat)
    ? options.valueFormat
    : "number";
  const currency = normalizeCurrency(options.currency);
  const formatter = getNumberFormatter(
    valueFormat,
    currency,
    Boolean(options.compact)
  );

  return valueFormat === "percent"
    ? `${formatter.format(number)}%`
    : formatter.format(number);
}

/**
 * Full-precision formatter for tooltips and legends.
 * @param {{valueFormat?: string, currency?: string}} model
 * @returns {(value: unknown) => string}
 */
export function createValueFormatter(model = {}) {
  return (value) => formatValue(value, model);
}

/**
 * Compact formatter for axis ticks so large numbers do not clip.
 * @param {{valueFormat?: string, currency?: string}} model
 * @returns {(value: unknown) => string}
 */
export function createAxisFormatter(model = {}) {
  return (value) => formatValue(value, { ...model, compact: true });
}

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
export function truncateText(value, max = 16) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} content
 * @returns {Object|null}
 */
export function parseChartContent(content) {
  const payload = parseJson(content);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload;
}

function datasetKeys(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

function resolveXKey(type, requested, rows) {
  const keys = datasetKeys(rows);

  if (type === "scatter") {
    if (
      typeof requested === "string" &&
      rows.filter((row) => toNumber(row[requested]) !== null).length >= 2
    ) {
      return requested;
    }
    const numericKey = keys.find(
      (key) => rows.filter((row) => toNumber(row[key]) !== null).length >= 2
    );
    if (numericKey) return numericKey;
  }

  if (
    typeof requested === "string" &&
    rows.some((row) => row[requested] !== undefined && row[requested] !== null)
  ) {
    return requested;
  }
  if (rows.some((row) => row.name !== undefined && row.name !== null)) {
    return "name";
  }

  const categoryKey = keys.find((key) => {
    const values = rows
      .map((row) => row[key])
      .filter((value) => value !== undefined && value !== null && value !== "");
    return (
      values.length > 0 && values.every((value) => toNumber(value) === null)
    );
  });
  return categoryKey || keys[0] || "name";
}

function resolveSeries(requested, rows, xKey, palette = "default") {
  const definitions = Array.isArray(requested) ? requested : [];
  const requestedKeys = [];
  for (const definition of definitions) {
    const key = typeof definition === "string" ? definition : definition?.key;
    if (
      typeof key === "string" &&
      key !== xKey &&
      !requestedKeys.includes(key) &&
      rows.some((row) => key in row)
    ) {
      requestedKeys.push(key);
    }
  }

  const candidates =
    requestedKeys.length > 0
      ? requestedKeys
      : datasetKeys(rows).filter((key) => key !== xKey);
  const numericKeys = candidates.filter((key) =>
    rows.some((row) => toNumber(row[key]) !== null)
  );
  const selected = numericKeys.length > 0 ? numericKeys : candidates;

  return selected.map((key, index) => {
    const definition = definitions.find((entry) =>
      typeof entry === "string" ? entry === key : entry?.key === key
    );
    const metadata =
      definition && typeof definition !== "string" ? definition : {};
    const label =
      typeof metadata.label === "string" && metadata.label.trim()
        ? metadata.label.trim()
        : prettifyKey(key);
    return {
      key,
      label,
      kind: SERIES_KINDS.includes(metadata.kind) ? metadata.kind : null,
      axis: metadata.axis === "right" ? "right" : null,
      color: colorAt(index, palette),
    };
  });
}

/**
 * Sankey nodes arrive as [{ name }] (or plain strings in older payloads).
 * Keep the original order because links reference nodes by index.
 * @param {unknown} nodes
 * @returns {{name: string}[]|null}
 */
function normalizeSankeyNodes(nodes) {
  if (!Array.isArray(nodes)) return null;
  const names = nodes
    .map((node) => (typeof node === "string" ? node : node?.name))
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim());
  if (names.length < 2 || new Set(names).size !== names.length) return null;
  return names.map((name) => ({ name }));
}

/**
 * Sankey links may reference nodes by index (server payload) or by name
 * (hand-written payload), so resolve both and drop unusable flows.
 * @param {Object[]} rows
 * @param {{name: string}[]} nodes
 * @returns {Object[]|null}
 */
function normalizeSankeyLinks(rows, nodes) {
  const indexByName = new Map(nodes.map((node, index) => [node.name, index]));
  const links = rows
    .map((row) => {
      const source =
        typeof row.source === "number"
          ? row.source
          : indexByName.get(String(row.source ?? "").trim());
      const target =
        typeof row.target === "number"
          ? row.target
          : indexByName.get(String(row.target ?? "").trim());
      const value = toNumber(row.value);
      if (!Number.isInteger(source) || !Number.isInteger(target)) return null;
      if (source === target) return null;
      if (source < 0 || target < 0) return null;
      if (source >= nodes.length || target >= nodes.length) return null;
      if (value === null || value <= 0) return null;
      return { source, target, value };
    })
    .filter(Boolean);
  return links.length > 0 ? links : null;
}

/**
 * Normalize any chart payload - including charts stored before the server
 * normalization layer existed - into the model the renderer consumes.
 * @param {unknown} content
 * @returns {Object|null}
 */
export function normalizeChart(content) {
  const payload = parseChartContent(content);
  if (!payload) return null;

  const type = normalizeChartType(payload.type);
  if (!type) return null;

  const rawDataset = parseJson(payload.dataset);
  if (!Array.isArray(rawDataset) || rawDataset.length === 0) return null;

  const rows = rawDataset.filter(
    (row) => row && typeof row === "object" && !Array.isArray(row)
  );
  if (rows.length === 0) return null;

  let sankeyNodes = null;
  let chartRows = rows;
  if (type === "sankey") {
    sankeyNodes = normalizeSankeyNodes(payload.nodes);
    if (!sankeyNodes) return null;
    chartRows = normalizeSankeyLinks(rows, sankeyNodes);
    if (!chartRows) return null;
  }

  const palette = PALETTE_NAMES.includes(payload.palette)
    ? payload.palette
    : "default";
  const xKey = resolveXKey(type, payload.xKey, chartRows);
  const requestedSeries =
    type === "sankey" &&
    !(Array.isArray(payload.series) && payload.series.length > 0)
      ? [{ key: "value" }]
      : payload.series;
  const series = resolveSeries(requestedSeries, chartRows, xKey, palette);
  if (series.length === 0) return null;

  const sizeKey =
    type === "scatter" &&
    typeof payload.sizeKey === "string" &&
    payload.sizeKey !== xKey &&
    chartRows.some((row) => toNumber(row[payload.sizeKey]) !== null)
      ? payload.sizeKey
      : null;

  let dataset = chartRows.map((row, index) => {
    const next = { ...row };
    if (next[xKey] === undefined || next[xKey] === null || next[xKey] === "") {
      next[xKey] = String(index + 1);
    }
    for (const item of series) next[item.key] = toNumber(row[item.key]);
    if (sizeKey && !(sizeKey in next)) {
      next[sizeKey] = toNumber(row[sizeKey]);
    }
    return next;
  });

  dataset = dataset.filter((row) =>
    series.some((item) => toNumber(row[item.key]) !== null)
  );

  if (type === "scatter") {
    dataset = dataset
      .map((row) => ({ ...row, [xKey]: toNumber(row[xKey]) }))
      .filter((row) => row[xKey] !== null);
    if (sizeKey) dataset = dataset.filter((row) => row[sizeKey] !== null);
    if (dataset.length < 2) return null;
  }

  if (dataset.length === 0) return null;

  const totalRows = Number.isFinite(payload.totalRows)
    ? payload.totalRows
    : dataset.length;
  const trendPoints = Array.isArray(payload.trendPoints)
    ? payload.trendPoints.filter(
        (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)
      )
    : [];

  return {
    type,
    title:
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : "Chart",
    subtitle:
      typeof payload.subtitle === "string" ? payload.subtitle.trim() : "",
    xKey,
    xLabel: typeof payload.xLabel === "string" ? payload.xLabel.trim() : "",
    yLabel: typeof payload.yLabel === "string" ? payload.yLabel.trim() : "",
    valueFormat: VALUE_FORMATS.includes(payload.valueFormat)
      ? payload.valueFormat
      : "number",
    currency: normalizeCurrency(payload.currency),
    series,
    dataset,
    nodes: sankeyNodes,
    caption: typeof payload.caption === "string" ? payload.caption : "",
    truncated: Boolean(payload.truncated),
    totalRows,
    stackMode: STACK_MODES.includes(payload.stackMode)
      ? payload.stackMode
      : "grouped",
    orientation: ORIENTATIONS.includes(payload.orientation)
      ? payload.orientation
      : "vertical",
    curve: CURVES.includes(payload.curve) ? payload.curve : "smooth",
    donut: toBoolean(payload.donut, true),
    showValues: toBoolean(payload.showValues, false),
    showLegend: toBoolean(payload.showLegend, true),
    palette,
    sort: SORTS.includes(payload.sort) ? payload.sort : "none",
    limit: Number.isFinite(payload.limit) ? payload.limit : null,
    sizeKey,
    referenceLine: Number.isFinite(payload.referenceLine)
      ? payload.referenceLine
      : null,
    referenceLabel:
      typeof payload.referenceLabel === "string"
        ? payload.referenceLabel.trim()
        : "",
    showAverage: toBoolean(payload.showAverage, false),
    averageValue: Number.isFinite(payload.averageValue)
      ? payload.averageValue
      : null,
    trendLine: toBoolean(payload.trendLine, false),
    trendPoints: trendPoints.length === 2 ? trendPoints : null,
    gauge: type === "radialBar" && toBoolean(payload.gauge, false),
    gaugeMax:
      Number.isFinite(payload.gaugeMax) && payload.gaugeMax > 0
        ? payload.gaugeMax
        : null,
    rightValueFormat: VALUE_FORMATS.includes(payload.rightValueFormat)
      ? payload.rightValueFormat
      : null,
    rightCurrency:
      typeof payload.rightCurrency === "string"
        ? normalizeCurrency(payload.rightCurrency)
        : null,
  };
}

/**
 * A reply can contain several charts. They are stored as `{ charts, caption }`,
 * while older records store a single chart object, so accept both shapes.
 * @param {unknown} content
 * @returns {{charts: Object[], caption: string, layout: string|null}}
 */
export function normalizeChartCollection(content) {
  const payload = parseChartContent(content);
  if (!payload) return { charts: [], caption: "", layout: null };

  const layout =
    payload.layout === "grid" ||
    payload.layout === "stack" ||
    payload.layout === "dashboard"
      ? payload.layout
      : null;

  if (Array.isArray(payload.charts)) {
    const charts = payload.charts
      .map((chart) => normalizeChart(chart))
      .filter(Boolean);
    return {
      charts,
      caption: typeof payload.caption === "string" ? payload.caption : "",
      layout,
    };
  }

  const chart = normalizeChart(payload);
  return {
    charts: chart ? [chart] : [],
    caption:
      chart?.caption ||
      (typeof payload.caption === "string" ? payload.caption : ""),
    layout,
  };
}
