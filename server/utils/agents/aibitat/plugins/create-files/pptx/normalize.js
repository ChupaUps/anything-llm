const path = require("path");
const { jsonrepair } = require("jsonrepair");
const extractJson = require("extract-json-from-string");
const { normalizeChartPayload, CHART_TYPES } = require("../../chart-data.js");
const { getStrings, resolveLanguage } = require("./i18n.js");
const { getThemeChoices, normalizeHex } = require("./themes.js");

const MAX_SECTIONS = 12;
const MAX_SLIDES_PER_DECK = 60;
const MAX_SLIDES_PER_SECTION = 8;
const MAX_BULLETS = 6;
const MAX_BULLET_CHARS = 220;
const MAX_CONTENT_BULLETS = 12;
const MAX_TABLE_COLUMNS = 8;
const MAX_TABLE_ROWS = 24;
const MAX_TABLE_ROWS_PER_SLIDE = 8;
const MAX_STATS = 4;
const MAX_SOURCES = 8;

const SECTION_LAYOUTS = [
  "content",
  "section",
  "table",
  "chart",
  "kpi",
  "two-column",
  "quote",
  "image",
  "blank",
];

const LAYOUT_ALIASES = {
  title: "section",
  cover: "section",
  divider: "section",
  chapter: "section",
  section: "section",
  content: "content",
  bullets: "content",
  bullet: "content",
  text: "content",
  list: "content",
  "bullet-list": "content",
  table: "table",
  data: "table",
  "data-table": "table",
  chart: "chart",
  graph: "chart",
  visualization: "chart",
  kpi: "kpi",
  stats: "kpi",
  metrics: "kpi",
  numbers: "kpi",
  "two-column": "two-column",
  twocolumn: "two-column",
  columns: "two-column",
  compare: "two-column",
  comparison: "two-column",
  quote: "quote",
  testimonial: "quote",
  image: "image",
  picture: "image",
  photo: "image",
  blank: "blank",
  empty: "blank",
};

const CHART_TYPE_ALIASES = {
  column: "bar",
  columns: "bar",
  bars: "bar",
  linechart: "line",
  "line-chart": "line",
  areachart: "area",
  "area-chart": "area",
  piechart: "pie",
  "pie-chart": "pie",
  donut: "pie",
  doughnut: "pie",
  combo: "composed",
  combination: "composed",
  "radial-bar": "radialBar",
  radialbar: "radialBar",
  gauge: "radialBar",
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse a JSON string, repairing and extracting embedded JSON when possible.
 * @param {unknown} value
 * @returns {unknown}
 */
function parseJsonLoose(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {}

  try {
    return JSON.parse(jsonrepair(trimmed));
  } catch {}

  try {
    const candidates = extractJson(trimmed);
    return Array.isArray(candidates) && candidates.length > 0
      ? candidates[0]
      : null;
  } catch {}

  return null;
}

/**
 * Convert any scalar to a clean string.
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
function asText(value, maxLength = 4000) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, maxLength);
  }
  if (isPlainObject(value)) {
    for (const key of ["text", "label", "title", "value", "name"]) {
      if (typeof value[key] === "string" || typeof value[key] === "number") {
        return asText(value[key], maxLength);
      }
    }
  }
  return "";
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripBulletMarker(text) {
  return text
    .replace(/^\s*(?:[-*•–—▪◦●○]|\d+[.)])\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split one long bullet into readable bullets at natural boundaries.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function splitLongBullet(text, maxChars = MAX_BULLET_CHARS) {
  if (text.length <= maxChars) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > maxChars && chunks.length < 3) {
    const window = remaining.slice(0, maxChars + 1);
    const boundary = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("; "),
      window.lastIndexOf(" — "),
      window.lastIndexOf(", ")
    );
    const cut = boundary > maxChars * 0.5 ? boundary + 1 : maxChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

/**
 * Normalize bullet-like values. Accepts arrays, newline strings and objects.
 * @param {unknown} value
 * @param {Object} [options]
 * @param {number} [options.maxItems]
 * @param {number} [options.maxChars]
 * @returns {string[]}
 */
function asStringList(
  value,
  { maxItems = MAX_CONTENT_BULLETS, maxChars = MAX_BULLET_CHARS } = {}
) {
  const rawItems = [];

  if (Array.isArray(value)) {
    for (const item of value.flat(2)) {
      if (typeof item === "string") rawItems.push(item);
      else if (typeof item === "number" || typeof item === "boolean")
        rawItems.push(String(item));
      else if (isPlainObject(item)) {
        const text = asText(item, maxChars * 2);
        if (text) rawItems.push(text);
      }
    }
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const lines = trimmed.includes("\n")
        ? trimmed.split(/\n+/)
        : trimmed.split(/\s*[;•]\s+/);
      rawItems.push(...lines);
    }
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string" || typeof item === "number") {
        rawItems.push(`${key}: ${item}`);
      }
    }
  }

  const seen = new Set();
  const result = [];
  for (const raw of rawItems) {
    const clean = stripBulletMarker(asText(raw, maxChars * 2));
    if (!clean) continue;

    for (const chunk of splitLongBullet(clean, maxChars)) {
      const valueText = chunk.slice(0, maxChars);
      const key = valueText.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(valueText);
      if (result.length >= maxItems) return result;
    }
  }
  return result;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeLayout(value) {
  const key = String(value || "content")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
  return LAYOUT_ALIASES[key] || "content";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeChartType(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (CHART_TYPE_ALIASES[raw]) return CHART_TYPE_ALIASES[raw];
  const exact = CHART_TYPES.find((type) => type.toLowerCase() === raw);
  return exact || "";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (isPlainObject(value)) return asText(value, 500);
  return String(value).trim().slice(0, 500);
}

/**
 * Normalize table data from arrays, row objects and common aliases.
 * @param {unknown} value
 * @returns {Object|null}
 */
function normalizeTable(value) {
  let table = parseJsonLoose(value);
  if (Array.isArray(table)) table = { rows: table };
  if (!isPlainObject(table)) return null;

  const rawHeaders =
    table.headers || table.columns || table.header || table.keys || [];
  const rawRows =
    table.rows || table.data || table.values || table.items || table.body || [];

  let headers = Array.isArray(rawHeaders)
    ? rawHeaders.map((header) => asText(header, 120))
    : [];
  let rows = Array.isArray(rawRows) ? rawRows : [];
  if (rows.length === 0) return null;

  if (isPlainObject(rows[0])) {
    const keys = [];
    for (const row of rows) {
      if (!isPlainObject(row)) continue;
      for (const key of Object.keys(row)) {
        if (!keys.includes(key)) keys.push(key);
      }
    }

    // Rows are objects, so look values up by their keys. A provided header
    // list is only a display label override; it must not be used as keys.
    if (headers.length === 0) headers = keys.map((key) => asText(key, 120));
    rows = rows.map((row) =>
      isPlainObject(row) ? keys.map((key) => formatCell(row[key])) : []
    );
  } else {
    rows = rows.map((row) =>
      Array.isArray(row)
        ? row.map((cell) => formatCell(cell))
        : [formatCell(row)]
    );
  }

  rows = rows.filter((row) => row.some((cell) => cell !== ""));
  if (rows.length === 0) return null;
  const totalRows = rows.length;

  const colCount = Math.min(
    MAX_TABLE_COLUMNS,
    Math.max(headers.length, ...rows.map((row) => row.length))
  );
  if (colCount === 0) return null;

  if (headers.length > 0) {
    headers = headers.slice(0, colCount);
    while (headers.length < colCount) headers.push("");
  }

  rows = rows.map((row) => {
    const next = row.slice(0, colCount);
    while (next.length < colCount) next.push("");
    return next;
  });

  const truncated = rows.length > MAX_TABLE_ROWS;
  if (truncated) rows = rows.slice(0, MAX_TABLE_ROWS);

  const source = normalizeSource(
    table.source || table.dataSource || table.citation
  );

  return {
    headers,
    rows,
    truncated,
    totalRows,
    source,
    asOf: asText(table.asOf || source?.asOf || "", 60),
  };
}

/**
 * @param {unknown} value
 * @returns {Object|null}
 */
function normalizeSource(value) {
  if (!value) return null;

  let source = value;
  if (typeof source === "string") {
    const text = source.trim();
    if (!text) return null;
    if (/^https?:\/\//i.test(text)) {
      try {
        const url = new URL(text);
        source = { title: url.hostname + url.pathname, url: text };
      } catch {
        source = { title: text };
      }
    } else {
      source = { title: text };
    }
  }

  if (!isPlainObject(source)) return null;

  const urlCandidate = asText(
    source.url || source.link || source.href || source.sourceUrl || "",
    1000
  );
  let url = "";
  if (urlCandidate && /^https?:\/\//i.test(urlCandidate)) url = urlCandidate;

  let title = asText(
    source.title || source.name || source.publisher || source.label || "",
    200
  );
  if (!title && url) {
    try {
      title = new URL(url).hostname;
    } catch {
      title = url;
    }
  }
  if (!title) return null;

  return {
    title,
    url,
    publisher: asText(source.publisher || source.organisation || "", 120),
    asOf: asText(source.asOf || source.date || source.updatedAt || "", 60),
    excerpt: asText(source.excerpt || source.note || "", 300),
  };
}

/**
 * @param {unknown} value
 * @returns {Object[]}
 */
function normalizeStats(value) {
  const raw = parseJsonLoose(value);
  if (isPlainObject(raw)) {
    return Object.entries(raw)
      .map(([label, item]) => {
        if (isPlainObject(item)) {
          return {
            value: asText(item.value ?? item.metric ?? "", 40),
            label: asText(item.label ?? label, 80),
            detail: asText(item.detail ?? item.note ?? "", 160),
          };
        }
        return {
          value: asText(item, 40),
          label: asText(label, 80),
          detail: "",
        };
      })
      .filter((stat) => stat.value || stat.label)
      .slice(0, MAX_STATS);
  }

  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (isPlainObject(item)) {
        return {
          value: asText(item.value ?? item.metric ?? item.number ?? "", 40),
          label: asText(item.label ?? item.name ?? item.title ?? "", 80),
          detail: asText(
            item.detail ?? item.note ?? item.description ?? "",
            160
          ),
        };
      }
      return { value: asText(item, 40), label: "", detail: "" };
    })
    .filter((stat) => stat.value || stat.label)
    .slice(0, MAX_STATS);
}

/**
 * @param {unknown} value
 * @returns {Object|null}
 */
function normalizeColumns(value) {
  const raw = parseJsonLoose(value);
  if (!raw) return null;

  let items = raw;
  if (isPlainObject(raw)) {
    if (Array.isArray(raw.columns)) items = raw.columns;
    else if (raw.left || raw.right) items = [raw.left, raw.right];
    else if (raw.before || raw.after) items = [raw.before, raw.after];
    else {
      items = Object.entries(raw).map(([title, content]) => ({
        title,
        content,
      }));
    }
  }

  if (!Array.isArray(items)) return null;
  const columns = items
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          title: `Option ${index + 1}`,
          content: asStringList(item, { maxItems: 5, maxChars: 180 }),
        };
      }
      if (!isPlainObject(item)) return null;
      return {
        title: asText(item.title || item.heading || item.label || "", 80),
        content: asStringList(
          item.content || item.bullets || item.points || item.items,
          { maxItems: 5, maxChars: 180 }
        ),
      };
    })
    .filter((column) => column && (column.title || column.content.length > 0))
    .slice(0, 2);

  return columns.length === 2 ? columns : null;
}

/**
 * @param {unknown} value
 * @returns {Object|null}
 */
function normalizeQuote(value) {
  if (typeof value === "string") {
    const text = asText(value, 500);
    return text ? { text, attribution: "" } : null;
  }
  if (!isPlainObject(value)) return null;
  const text = asText(value.text || value.quote || value.content || "", 500);
  if (!text) return null;
  return {
    text,
    attribution: asText(
      value.attribution || value.author || value.source || value.role || "",
      120
    ),
  };
}

/**
 * @param {unknown} value
 * @returns {Object|null}
 */
function normalizeImage(value) {
  if (typeof value === "string") {
    value = { data: value };
  }
  if (!isPlainObject(value)) return null;

  const candidate = asText(
    value.data || value.dataUri || value.url || value.src || value.path || "",
    2_000_000
  );
  if (!candidate) return null;

  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(candidate)) {
    return {
      kind: "data",
      value: candidate,
      alt: asText(value.alt || value.description || "", 200),
      caption: asText(value.caption || "", 200),
    };
  }

  if (/^https?:\/\//i.test(candidate)) {
    return {
      kind: "url",
      value: candidate,
      alt: asText(value.alt || value.description || "", 200),
      caption: asText(value.caption || "", 200),
    };
  }

  return null;
}

/**
 * Normalize a chart block and attach provenance.
 * @param {unknown} value
 * @returns {{ok: true, chart: Object, warnings: string[]}|{ok: false, reason: string}}
 */
function normalizeChart(value) {
  let chartInput = parseJsonLoose(value);
  if (!isPlainObject(chartInput)) {
    return { ok: false, reason: "chart must be an object" };
  }

  const requestedType = chartInput.type || chartInput.chartType;
  const type = normalizeChartType(requestedType);
  if (!type) {
    return {
      ok: false,
      reason: `unsupported chart type "${requestedType || "(missing)"}". Use one of: ${[
        "bar",
        "line",
        "area",
        "pie",
        "radar",
        "scatter",
        "composed",
        "waterfall",
        "funnel",
        "radialBar",
      ].join(", ")}`,
    };
  }

  if (type === "sankey" || type === "treemap") {
    return {
      ok: false,
      reason: `${type} charts are not supported in PPTX. Use a bar chart or a table instead`,
    };
  }

  const source = normalizeSource(
    chartInput.source ||
      chartInput.dataSource ||
      chartInput.citation ||
      chartInput.sourceUrl
  );
  if (!source) {
    return {
      ok: false,
      reason:
        'chart requires source {title, url?, asOf?} with the real data provenance. If the numbers came from the conversation, use source.title = "User-provided data" and include asOf',
    };
  }
  if (!source.url && !source.asOf) {
    return {
      ok: false,
      reason:
        "chart source needs a url or an asOf date/period so the audience can verify freshness",
    };
  }

  const asOf = asText(
    chartInput.asOf || chartInput.dataAsOf || source.asOf || "",
    60
  );
  const normalized = normalizeChartPayload({
    ...chartInput,
    type,
  });
  if (!normalized.ok) return normalized;

  const chart = normalized.chart;
  const minPoints =
    chart.type === "scatter"
      ? 2
      : chart.type === "waterfall"
        ? 2
        : chart.type === "pie"
          ? 2
          : chart.gauge
            ? 1
            : 3;
  if (chart.dataset.length < minPoints) {
    return {
      ok: false,
      reason: `chart has only ${chart.dataset.length} data point(s); use a KPI layout for 1-2 points or provide at least ${minPoints}`,
    };
  }

  chart.source = source;
  chart.asOf = asOf || source.asOf;
  const warnings = [];
  if (!chart.asOf) {
    warnings.push(
      `Chart "${chart.title}" has no asOf date; add one when freshness matters`
    );
  }
  if (chart.truncated) {
    warnings.push(
      `Chart "${chart.title}" was truncated to ${chart.dataset.length} of ${chart.totalRows} categories`
    );
  }

  return { ok: true, chart, warnings };
}

/**
 * Merge a nested chart block with slide-level provenance so both
 * {chart:{...}, source:{...}} and {chart:{..., source:{...}}} work.
 * @param {Object} slide
 * @param {string} layout
 * @returns {unknown}
 */
function chartInputForSlide(slide, layout) {
  if (!isPlainObject(slide)) return null;
  const raw = slide.chart || slide.graph;
  if (isPlainObject(raw)) {
    return {
      ...raw,
      source: raw.source || raw.dataSource || slide.source,
      asOf: raw.asOf || slide.asOf,
    };
  }
  if (raw) return raw;
  return layout === "chart" ? slide : null;
}

/**
 * Check the raw slide shape before accepting it from a sub-agent. Returns
 * actionable messages so the model can correct its JSON and retry.
 * @param {unknown} raw
 * @returns {string[]}
 */
function validateSlide(raw) {
  let slide = raw;
  if (isPlainObject(slide) && isPlainObject(slide.slide)) slide = slide.slide;
  if (!isPlainObject(slide)) return ["slide must be a JSON object"];

  const errors = [];
  const layout = normalizeLayout(slide.layout || slide.type || slide.kind);
  if (!SECTION_LAYOUTS.includes(layout)) {
    errors.push(
      `layout "${slide.layout}" is not available; use one of ${SECTION_LAYOUTS.join(", ")}`
    );
  }

  const title = asText(
    slide.title || slide.heading || slide.headline || "",
    160
  );
  if (layout !== "blank" && !title) errors.push("title is required");

  if (layout === "content") {
    const content = asStringList(
      slide.content || slide.bullets || slide.points || slide.items,
      { maxItems: MAX_CONTENT_BULLETS, maxChars: MAX_BULLET_CHARS }
    );
    if (content.length === 0) {
      errors.push(
        "content must be an array of 3-6 short bullet strings (not a single string or object)"
      );
    }
  }

  if (layout === "table") {
    const table = normalizeTable(
      slide.table || slide.dataTable || (layout === "table" ? slide.data : null)
    );
    if (!table) {
      errors.push(
        'table must contain rows: {"headers":["A","B"],"rows":[["a","b"]]}'
      );
    }
  }

  if (layout === "chart") {
    const chartResult = normalizeChart(chartInputForSlide(slide, layout));
    if (!chartResult.ok) errors.push(`chart: ${chartResult.reason}`);
  }

  if (layout === "kpi") {
    const stats = normalizeStats(slide.stats || slide.kpis || slide.metrics);
    if (stats.length < 2) {
      errors.push(
        'kpi layout needs 2-4 stats: [{"value":"+23%","label":"Revenue growth"}]'
      );
    }
  }

  if (layout === "two-column") {
    const columns = normalizeColumns(
      slide.columns || slide.compare || slide.comparison
    );
    if (!columns) {
      errors.push(
        'two-column layout needs exactly two columns: [{"title":"Before","content":["..."]}]'
      );
    }
  }

  if (layout === "quote") {
    const quote = normalizeQuote(
      slide.quote || slide.testimonial || (layout === "quote" ? slide : null)
    );
    if (!quote) errors.push("quote layout needs quote text");
  }

  if (layout === "image") {
    const image = normalizeImage(slide.image || slide.picture || slide.photo);
    if (!image) {
      errors.push(
        "image layout needs an https URL or a data:image/...;base64 URI"
      );
    }
  }

  return errors;
}

/**
 * Normalize one slide, downgrading invalid layout-specific data to a safe
 * fallback instead of silently rendering an empty slide.
 * @param {unknown} raw
 * @param {number} index
 * @returns {{ok: boolean, slide: Object|null, warnings: string[]}}
 */
function normalizeSlide(raw, index = 0) {
  let input = raw;
  if (isPlainObject(input) && isPlainObject(input.slide)) input = input.slide;
  if (!isPlainObject(input)) {
    return {
      ok: false,
      slide: null,
      warnings: [`Slide ${index + 1} was not an object and was skipped`],
    };
  }

  const warnings = [];
  let layout = normalizeLayout(input.layout || input.type || input.kind);
  const title = asText(
    input.title || input.heading || input.headline || input.name || "",
    160
  );
  const subtitle = asText(
    input.subtitle || input.kicker || input.description || input.takeaway || "",
    220
  );
  const notes = asText(
    input.notes || input.speakerNotes || input.speaker_notes || "",
    4000
  );
  const content = asStringList(
    input.content || input.bullets || input.points || input.items,
    { maxItems: MAX_CONTENT_BULLETS, maxChars: MAX_BULLET_CHARS }
  );
  const tableRaw =
    input.table || input.dataTable || (layout === "table" ? input.data : null);
  const table = normalizeTable(
    isPlainObject(tableRaw) && !tableRaw.source
      ? { ...tableRaw, source: input.source, asOf: input.asOf }
      : tableRaw
  );
  const chartResult = normalizeChart(chartInputForSlide(input, layout));
  const stats = normalizeStats(
    input.stats || input.kpis || input.metrics || input.numbers
  );
  const columns = normalizeColumns(
    input.columns || input.compare || input.comparison
  );
  const quote = normalizeQuote(
    input.quote || input.testimonial || (layout === "quote" ? input : null)
  );
  const image = normalizeImage(input.image || input.picture || input.photo);

  if (chartResult.ok) warnings.push(...(chartResult.warnings || []));
  else if (layout === "chart") warnings.push(chartResult.reason);

  if (layout === "content" && content.length === 0) {
    if (chartResult.ok) layout = "chart";
    else if (table) layout = "table";
    else if (stats.length >= 2) layout = "kpi";
    else if (columns) layout = "two-column";
    else if (quote) layout = "quote";
    else if (image) layout = "image";
  }

  if (layout === "chart" && !chartResult.ok) {
    warnings.push(`Chart slide downgraded: ${chartResult.reason}`);
    if (table) layout = "table";
    else if (stats.length >= 2) layout = "kpi";
    else if (content.length > 0) layout = "content";
    else if (columns) layout = "two-column";
    else layout = "content";
  }

  if (layout === "table" && !table) {
    warnings.push("Table slide had no usable rows; downgraded to bullets");
    layout = content.length > 0 ? "content" : "blank";
  }

  if (layout === "kpi" && stats.length < 2) {
    warnings.push("KPI slide needs at least two stats; downgraded to bullets");
    layout = content.length > 0 ? "content" : "blank";
  }

  if (layout === "two-column" && !columns) {
    warnings.push(
      "Two-column slide needs exactly two columns; downgraded to bullets"
    );
    layout = content.length > 0 ? "content" : "blank";
  }

  if (layout === "quote" && !quote) {
    warnings.push("Quote slide had no quote text; downgraded to bullets");
    layout = content.length > 0 ? "content" : "blank";
  }

  if (layout === "image" && !image) {
    warnings.push("Image slide had no usable image; downgraded to bullets");
    layout = content.length > 0 ? "content" : "blank";
  }

  if (!title && layout !== "blank") {
    warnings.push(`Slide ${index + 1} has no title`);
  }

  const hasVisibleContent =
    title ||
    subtitle ||
    content.length > 0 ||
    table ||
    chartResult.ok ||
    stats.length >= 2 ||
    columns ||
    quote ||
    image;
  if (!hasVisibleContent) {
    return {
      ok: false,
      slide: null,
      warnings: [
        ...warnings,
        `Slide ${index + 1} had no usable content and was skipped`,
      ],
    };
  }

  const slide = {
    layout,
    title: title || "Untitled slide",
    subtitle,
    notes,
  };

  if (content.length > 0) slide.content = content;
  if (table) slide.table = table;
  if (chartResult.ok) slide.chart = chartResult.chart;
  if (stats.length >= 2) slide.stats = stats;
  if (columns) slide.columns = columns;
  if (quote) slide.quote = quote;
  if (image) slide.image = image;

  return { ok: true, slide, warnings };
}

/**
 * Normalize every slide and split long tables/bullet lists into continuation
 * slides so the renderer never has to shrink text into illegibility.
 * @param {unknown} rawSlides
 * @param {Object} [options]
 * @param {string} [options.language]
 * @returns {{slides: Object[], warnings: string[]}}
 */
function normalizeSlides(rawSlides, { language = "en" } = {}) {
  let input = parseJsonLoose(rawSlides);
  if (isPlainObject(input) && Array.isArray(input.slides)) input = input.slides;
  if (isPlainObject(input) && isPlainObject(input.slide)) input = [input.slide];
  if (!Array.isArray(input)) {
    return {
      slides: [],
      warnings: ["Slide payload was not an array"],
    };
  }

  const warnings = [];
  const slides = [];
  input.forEach((raw, index) => {
    const result = normalizeSlide(raw, index);
    warnings.push(...result.warnings);
    if (result.ok && result.slide) slides.push(result.slide);
  });

  const expanded = expandLongSlides(slides, { language });
  const limited = expanded.slice(0, MAX_SLIDES_PER_DECK);
  if (expanded.length > MAX_SLIDES_PER_DECK) {
    warnings.push(
      `Deck had ${expanded.length} slides; limited to ${MAX_SLIDES_PER_DECK}`
    );
  }

  return { slides: limited, warnings };
}

/**
 * Split long bullets/tables/KPIs into continuation slides.
 * @param {Object[]} slides
 * @param {Object} [options]
 * @param {string} [options.language]
 * @returns {Object[]}
 */
function expandLongSlides(slides, { language = "en" } = {}) {
  const strings = getStrings(language);
  const expanded = [];

  for (const slide of slides) {
    const title = slide.title || "Untitled slide";
    const continuedTitle = `${title} (${strings.continued})`;

    if (slide.table?.rows?.length > MAX_TABLE_ROWS_PER_SLIDE) {
      const rows = slide.table.rows;
      for (
        let start = 0;
        start < rows.length;
        start += MAX_TABLE_ROWS_PER_SLIDE
      ) {
        expanded.push({
          ...slide,
          title: start === 0 ? title : continuedTitle,
          subtitle: start === 0 ? slide.subtitle : "",
          notes: start === 0 ? slide.notes : "",
          table: {
            ...slide.table,
            rows: rows.slice(start, start + MAX_TABLE_ROWS_PER_SLIDE),
          },
        });
      }
      continue;
    }

    if (slide.content?.length > MAX_BULLETS) {
      for (let start = 0; start < slide.content.length; start += MAX_BULLETS) {
        expanded.push({
          ...slide,
          title: start === 0 ? title : continuedTitle,
          subtitle: start === 0 ? slide.subtitle : "",
          notes: start === 0 ? slide.notes : "",
          content: slide.content.slice(start, start + MAX_BULLETS),
        });
      }
      continue;
    }

    if (slide.stats?.length > MAX_STATS) {
      for (let start = 0; start < slide.stats.length; start += MAX_STATS) {
        expanded.push({
          ...slide,
          title: start === 0 ? title : continuedTitle,
          stats: slide.stats.slice(start, start + MAX_STATS),
        });
      }
      continue;
    }

    expanded.push(slide);
  }

  return expanded;
}

/**
 * @param {unknown} value
 * @returns {Object[]}
 */
function normalizeSections(value) {
  let input = parseJsonLoose(value);
  if (isPlainObject(input) && Array.isArray(input.sections))
    input = input.sections;
  if (isPlainObject(input) && !Array.isArray(input)) {
    input = Object.entries(input).map(([title, keyPoints]) => ({
      title,
      keyPoints,
    }));
  }
  if (!Array.isArray(input)) return [];

  return input
    .map((section) => {
      if (typeof section === "string") return { title: section.trim() };
      if (!isPlainObject(section)) return null;

      const title = asText(
        section.title || section.name || section.heading || section.section,
        160
      );
      if (!title) return null;

      const keyPoints = asStringList(
        section.keyPoints ||
          section.key_points ||
          section.points ||
          section.bullets ||
          section.content,
        { maxItems: 12, maxChars: 220 }
      );

      return {
        title,
        subtitle: asText(section.subtitle || section.kicker || "", 220),
        keyPoints,
        instructions: asText(
          section.instructions || section.guidance || section.notes || "",
          1200
        ),
        dataNeeds: asStringList(
          section.dataNeeds || section.data || section.research,
          { maxItems: 6, maxChars: 180 }
        ),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_SECTIONS);
}

/**
 * @param {unknown} value
 * @returns {Object}
 */
function normalizeBranding(value) {
  let input = parseJsonLoose(value);
  if (typeof input === "string") input = { mode: input };
  if (!isPlainObject(input)) input = {};

  const mode = ["none", "minimal", "full"].includes(
    String(input.mode || "").toLowerCase()
  )
    ? String(input.mode).toLowerCase()
    : "minimal";

  const logoInput =
    input.logo || input.logoUrl || input.logoDataUri || input.logoData || null;
  const logo = logoInput ? normalizeImage(logoInput) : null;

  return {
    mode,
    company: asText(input.company || input.companyName || input.name || "", 80),
    logo,
    website: asText(input.website || input.url || "", 160),
    footer: asText(input.footer || input.footerText || "", 140),
    confidentiality: asText(
      input.confidentiality || input.classification || "",
      40
    ),
    showDate: input.showDate !== false,
    primary: input.primary ? normalizeHex(input.primary, "") : "",
    accent: input.accent ? normalizeHex(input.accent, "") : "",
    background: input.background ? normalizeHex(input.background, "") : "",
    text: input.text ? normalizeHex(input.text, "") : "",
    logoAlt: asText(input.logoAlt || "", 160),
  };
}

/**
 * @param {unknown} filename
 * @param {string} title
 * @returns {string}
 */
function normalizeFilename(filename, title) {
  const fallback = `${
    (title || "presentation")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "presentation"
  }.pptx`;

  const raw = typeof filename === "string" ? filename.trim() : "";
  if (!raw) return fallback;

  const base = path
    .basename(raw)
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\p{Cc}/gu, "")
    .trim();
  if (!base) return fallback;
  return base.toLowerCase().endsWith(".pptx") ? base : `${base}.pptx`;
}

/**
 * Normalize the top-level tool request.
 * @param {Object} args
 * @returns {{ok: boolean, request: Object|null, warnings: string[], errors: string[]}}
 */
function normalizeDeckRequest(args = {}) {
  const warnings = [];
  const errors = [];

  const sections = normalizeSections(args.sections || args.outline || []);
  if (sections.length === 0) {
    errors.push(
      'sections must contain at least one section like {"title":"Overview","keyPoints":["..."]}'
    );
  }

  const title =
    asText(args.title || args.name || "", 160) || "Untitled Presentation";
  const author = asText(args.author || args.presenter || "", 120);
  const subtitle = asText(args.subtitle || args.tagline || "", 220);
  const filename = normalizeFilename(args.filename || args.fileName, title);

  const themeRequested = String(args.theme || "auto")
    .toLowerCase()
    .trim();
  const themeChoices = getThemeChoices();
  const theme = themeChoices.includes(themeRequested) ? themeRequested : "auto";
  if (theme !== themeRequested) {
    warnings.push(`Unknown theme "${themeRequested}"; using auto instead`);
  }

  const styleBrief = asText(
    args.styleBrief || args.style || args.brief || "",
    500
  );
  const audience = asText(args.audience || "", 160);
  const language = resolveLanguage(
    args.language,
    `${title} ${subtitle} ${sections.map((section) => section.title).join(" ")}`
  );

  const targetSlideCount = Number(args.targetSlideCount || 0);
  const includeAgenda =
    args.includeAgenda === undefined
      ? sections.length >= 3
      : Boolean(args.includeAgenda);
  const includeClosing =
    args.includeClosing === undefined ? true : Boolean(args.includeClosing);
  const includeSources =
    args.includeSources === undefined ? true : Boolean(args.includeSources);

  const aspectRatio = String(args.aspectRatio || "16:9");
  if (aspectRatio !== "16:9") {
    warnings.push(
      `Aspect ratio "${aspectRatio}" is not supported yet; using 16:9`
    );
  }

  return {
    ok: errors.length === 0,
    request: {
      filename,
      title,
      subtitle,
      author,
      theme,
      styleBrief,
      audience,
      language,
      sections,
      branding: normalizeBranding(args.branding || args.brand),
      includeAgenda,
      includeClosing,
      includeSources,
      targetSlideCount:
        Number.isFinite(targetSlideCount) && targetSlideCount >= 4
          ? Math.min(Math.round(targetSlideCount), MAX_SLIDES_PER_DECK)
          : null,
      today: new Date().toISOString().slice(0, 10),
    },
    warnings,
    errors,
  };
}

/**
 * Recover slides from a raw assistant response when the model failed to call
 * the submission tool. This is the last line of defense against JSON drift.
 * @param {string} text
 * @returns {{slides: Object[], warnings: string[]}}
 */
function extractSlidesFromText(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { slides: [], warnings: [] };
  }

  const candidates = [];
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(
    (match) => match[1]
  );
  candidates.push(...fences);

  try {
    candidates.push(...extractJson(text));
  } catch {}

  const warnings = [];
  const slides = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const parsed = parseJsonLoose(candidate);
    if (!parsed) continue;

    let items = parsed;
    if (isPlainObject(parsed) && Array.isArray(parsed.slides))
      items = parsed.slides;
    else if (isPlainObject(parsed) && isPlainObject(parsed.slide))
      items = [parsed.slide];
    else if (isPlainObject(parsed) && (parsed.layout || parsed.title))
      items = [parsed];
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const result = normalizeSlide(item, slides.length);
      if (!result.ok || !result.slide) continue;
      const signature = JSON.stringify(result.slide).slice(0, 500);
      if (seen.has(signature)) continue;
      seen.add(signature);
      slides.push(result.slide);
      warnings.push(...result.warnings);
    }
    if (slides.length > 0) break;
  }

  if (slides.length > 0) {
    warnings.push(
      `Recovered ${slides.length} slide(s) from a raw assistant response because submit-slide was not called`
    );
  }
  return { slides, warnings };
}

/**
 * Normalize and de-duplicate citations for the sources slide.
 * @param {Object[]} citations
 * @returns {Object[]}
 */
function dedupeCitations(citations = []) {
  if (!Array.isArray(citations)) return [];
  const seen = new Set();
  const result = [];

  for (const citation of citations) {
    if (!citation || typeof citation !== "object") continue;
    let url = asText(citation.url || citation.chunkSource || "", 1000);
    if (url.startsWith("link://")) url = url.slice("link://".length);
    if (!/^https?:\/\//i.test(url)) url = "";

    let title = asText(citation.title || citation.name || "", 200);
    if (!title && url) {
      try {
        title = new URL(url).hostname;
      } catch {
        title = url;
      }
    }
    if (!title) continue;

    const key = (url || title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      title,
      url,
      text: asText(citation.text || "", 300),
    });
    if (result.length >= MAX_SOURCES) break;
  }

  return result;
}

module.exports = {
  MAX_SECTIONS,
  MAX_SLIDES_PER_DECK,
  MAX_SLIDES_PER_SECTION,
  MAX_BULLETS,
  MAX_BULLET_CHARS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_TABLE_ROWS_PER_SLIDE,
  SECTION_LAYOUTS,
  asText,
  asStringList,
  normalizeLayout,
  normalizeChartType,
  normalizeTable,
  normalizeSource,
  normalizeStats,
  normalizeColumns,
  normalizeQuote,
  normalizeImage,
  normalizeChart,
  validateSlide,
  normalizeSlide,
  normalizeSlides,
  expandLongSlides,
  normalizeSections,
  normalizeBranding,
  normalizeFilename,
  normalizeDeckRequest,
  extractSlidesFromText,
  dedupeCitations,
};
