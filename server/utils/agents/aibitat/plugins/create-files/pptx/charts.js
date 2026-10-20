const {
  MARGIN_X,
  CONTENT_W,
  addText,
  addRect,
  truncate,
} = require("./utils.js");
const { getStrings } = require("./i18n.js");
const { prettifyKey } = require("../../chart-data.js");

const CURRENCY_FORMAT = {
  USD: "$#,##0",
  EUR: "€#,##0",
  GBP: "£#,##0",
  RUB: '#,##0 "₽"',
  JPY: "¥#,##0",
  CNY: "¥#,##0",
  KZT: "₸#,##0",
  UAH: "₴#,##0",
  BRL: "R$#,##0",
  INR: "₹#,##0",
};

/**
 * @param {Object} chart
 * @returns {string}
 */
function valueFormatCode(chart) {
  if (chart.valueFormat === "percent") return "0%";
  if (chart.valueFormat === "currency") {
    return CURRENCY_FORMAT[chart.currency] || "#,##0";
  }
  return "#,##0";
}

/**
 * @param {Object} chart
 * @param {string} key
 * @returns {string}
 */
function seriesLabel(chart, key) {
  const series = chart.series.find((item) => item.key === key);
  return series?.label || prettifyKey(key);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function categoryLabel(value) {
  if (value === null || value === undefined) return "";
  return truncate(String(value), 28);
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * @param {Object} chart
 * @param {Object[]} [seriesList]
 * @returns {Object[]}
 */
function categoryData(chart, seriesList = chart.series) {
  const labels = chart.dataset.map((row) => categoryLabel(row[chart.xKey]));
  return seriesList.map((series) => ({
    name: series.label || prettifyKey(series.key),
    labels,
    values: chart.dataset.map((row) => numberValue(row[series.key])),
  }));
}

/**
 * @param {Object} chart
 * @returns {Object[]}
 */
function scatterData(chart) {
  const xValues = chart.dataset.map((row) => numberValue(row[chart.xKey]));
  const data = [{ name: "X-Axis", values: xValues }];

  for (const series of chart.series) {
    const entry = {
      name: series.label || prettifyKey(series.key),
      values: chart.dataset.map((row) => numberValue(row[series.key])),
      labels: chart.dataset.map((row) => categoryLabel(row[chart.xKey])),
    };
    if (chart.sizeKey) {
      entry.sizes = chart.dataset.map((row) => numberValue(row[chart.sizeKey]));
    }
    data.push(entry);
  }

  // PptxGenJS treats the first entry as the shared X axis and the remaining
  // entries as Y series; a single series is still a valid scatter.
  return data;
}

/**
 * @param {Object} chart
 * @returns {Object[]}
 */
function waterfallData(chart) {
  const labels = chart.dataset.map((row) => categoryLabel(row[chart.xKey]));
  return [
    {
      name: "Base",
      labels,
      values: chart.dataset.map((row) => numberValue(row.base)),
    },
    {
      name: "Increase",
      labels,
      values: chart.dataset.map((row) =>
        numberValue(row.change) >= 0 ? numberValue(row.delta) : 0
      ),
    },
    {
      name: "Decrease",
      labels,
      values: chart.dataset.map((row) =>
        numberValue(row.change) < 0 ? numberValue(row.delta) : 0
      ),
    },
  ];
}

/**
 * @param {Object} chart
 * @returns {Object}
 */
function baseChartOptions(chart, theme) {
  const labels = chart.dataset.map((row) => categoryLabel(row[chart.xKey]));
  const longestLabel = labels.reduce(
    (longest, label) => Math.max(longest, label.length),
    0
  );
  const hasNegative = chart.dataset.some((row) =>
    chart.series.some((series) => numberValue(row[series.key]) < 0)
  );

  return {
    showTitle: false,
    showLegend:
      chart.showLegend &&
      (chart.series.length > 1 || chart.type === "pie") &&
      chart.dataset.length <= 12,
    legendPos: "b",
    legendFontSize: 9,
    legendColor: theme.chartTextColor,
    legendFontFace: theme.fontBody,

    chartColors: theme.chartPalette,
    chartColorsOpacity: 100,
    showValue: Boolean(chart.showValues) && chart.dataset.length <= 10,
    showPercent:
      chart.type === "pie" &&
      Boolean(chart.showValues) &&
      chart.valueFormat === "percent",
    dataLabelFontFace: theme.fontBody,
    dataLabelFontSize: 9,
    dataLabelColor: theme.chartTextColor,
    showLeaderLines: chart.type === "pie",

    catAxisLabelColor: theme.chartTextColor,
    catAxisLabelFontSize: 9,
    catAxisLabelFontFace: theme.fontBody,
    catAxisLabelRotate: longestLabel > 12 || chart.dataset.length > 7 ? -28 : 0,
    valAxisLabelColor: theme.chartTextColor,
    valAxisLabelFontSize: 9,
    valAxisLabelFontFace: theme.fontBody,
    valAxisLabelFormatCode: valueFormatCode(chart),
    valAxisMinVal: hasNegative ? undefined : 0,

    catAxisLineShow: false,
    valAxisLineShow: false,
    catGridLine: { style: "none" },
    valGridLine: {
      color: theme.chartGridColor,
      style: "solid",
      size: 0.5,
    },

    chartArea: { fill: { color: theme.background } },
    plotArea: { fill: { color: theme.background } },

    showCatAxisTitle: Boolean(chart.xLabel),
    catAxisTitle: chart.xLabel || "",
    catAxisTitleColor: theme.chartTextColor,
    catAxisTitleFontSize: 9,
    showValAxisTitle: Boolean(chart.yLabel),
    valAxisTitle: chart.yLabel || "",
    valAxisTitleColor: theme.chartTextColor,
    valAxisTitleFontSize: 9,

    altText: [
      chart.title,
      chart.source ? `Source: ${chart.source.title}` : "",
      chart.asOf ? `As of ${chart.asOf}` : "",
    ]
      .filter(Boolean)
      .join(". "),
  };
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} chart
 * @param {Object} theme
 * @param {Object} options
 */
function addChartContent(slide, pptx, chart, theme, options = {}) {
  const { x = MARGIN_X, y = 1.45, w = CONTENT_W, h = 3.15 } = options;

  const base = baseChartOptions(chart, theme);
  const placement = { x, y, w, h };

  if (chart.type === "scatter") {
    const chartType = chart.sizeKey
      ? pptx.ChartType.bubble
      : pptx.ChartType.scatter;
    slide.addChart(chartType, scatterData(chart), {
      ...base,
      ...placement,
      showLabel: Boolean(chart.showValues),
      dataLabelPosition: "r",
      dataLabelFormatScatter: "custom",
      lineSize: chart.sizeKey ? 0 : 1.5,
      lineDataSymbolSize: 7,
      lineDataSymbolLineColor: theme.background,
    });
    return;
  }

  if (chart.type === "waterfall") {
    slide.addChart(pptx.ChartType.bar, waterfallData(chart), {
      ...base,
      ...placement,
      barDir: "col",
      barGrouping: "stacked",
      chartColors: [theme.background, "10B981", "EF4444"],
      showLegend: false,
      showValue: false,
      altText: base.altText,
    });
    return;
  }

  if (chart.type === "funnel") {
    const primaryKey = chart.series[0]?.key;
    const rows = [...chart.dataset].sort(
      (left, right) =>
        numberValue(right[primaryKey]) - numberValue(left[primaryKey])
    );
    const funnelChart = { ...chart, dataset: rows, type: "bar" };
    slide.addChart(pptx.ChartType.bar, categoryData(funnelChart), {
      ...base,
      ...placement,
      barDir: "bar",
      showLegend: false,
      showValue: true,
    });
    return;
  }

  if (chart.type === "radialBar" && chart.gauge) {
    const primaryKey = chart.series[0]?.key;
    const actual = numberValue(chart.dataset[0]?.[primaryKey]);
    const max = chart.gaugeMax || Math.max(100, actual);
    const remaining = Math.max(0, max - actual);
    slide.addChart(
      pptx.ChartType.doughnut,
      [
        {
          name: chart.series[0]?.label || "Actual",
          labels: ["Actual", "Remaining"],
          values: [actual, remaining],
        },
      ],
      {
        ...base,
        ...placement,
        holeSize: 68,
        showLegend: false,
        showValue: false,
        showPercent: false,
        chartColors: [theme.accentColor, theme.cardBorderColor],
      }
    );

    // PptxGenJS cannot place text inside the doughnut hole, so overlay it.
    slide.addText(`${Math.round((actual / max) * 100)}%`, {
      x: x + w / 2 - 0.9,
      y: y + h / 2 - 0.35,
      w: 1.8,
      h: 0.55,
      fontSize: 26,
      bold: true,
      color: theme.titleColor,
      fontFace: theme.fontTitle,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    slide.addText(truncate(chart.series[0]?.label || "", 32), {
      x: x + w / 2 - 0.9,
      y: y + h / 2 + 0.2,
      w: 1.8,
      h: 0.3,
      fontSize: 9,
      color: theme.chartTextColor,
      fontFace: theme.fontBody,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    return;
  }

  if (chart.type === "composed") {
    const groups = new Map();
    for (const series of chart.series) {
      const kind = series.kind || (groups.size === 0 ? "bar" : "line");
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push(series);
    }

    const chartTypes = [...groups.entries()].map(([kind, series], index) => {
      const type =
        kind === "line"
          ? pptx.ChartType.line
          : kind === "area"
            ? pptx.ChartType.area
            : pptx.ChartType.bar;
      return {
        type,
        data: categoryData(chart, series),
        options: {
          chartColors: series.map(
            (_, seriesIndex) =>
              theme.chartPalette[
                (index + seriesIndex) % theme.chartPalette.length
              ]
          ),
          ...(series.some((item) => item.axis === "right")
            ? { secondaryValAxis: true, secondaryCatAxis: true }
            : {}),
          ...(type === pptx.ChartType.line
            ? { lineDataSymbol: "none", lineSize: 2.5 }
            : {}),
        },
      };
    });

    if (chartTypes.length === 1) {
      slide.addChart(chartTypes[0].type, chartTypes[0].data, {
        ...base,
        ...placement,
        ...chartTypes[0].options,
        chartColors: theme.chartPalette,
      });
      return;
    }

    slide.addChart(chartTypes, {
      ...base,
      ...placement,
      barDir: chart.orientation === "horizontal" ? "bar" : "col",
      barGrouping: chart.stackMode === "stacked" ? "stacked" : "clustered",
    });
    return;
  }

  const typeMap = {
    bar: pptx.ChartType.bar,
    line: pptx.ChartType.line,
    area: pptx.ChartType.area,
    pie: chart.donut ? pptx.ChartType.doughnut : pptx.ChartType.pie,
    radar: pptx.ChartType.radar,
    radialBar: pptx.ChartType.bar,
  };
  const chartType = typeMap[chart.type] || pptx.ChartType.bar;
  const data =
    chart.type === "pie"
      ? categoryData(chart, [chart.series[0]]).map((series) => ({
          ...series,
          name: series.name,
        }))
      : categoryData(chart);

  const chartOptions = {
    ...base,
    ...placement,
    barDir:
      chart.type === "bar" && chart.orientation === "horizontal"
        ? "bar"
        : "col",
    barGrouping:
      chart.stackMode === "stacked" && ["bar", "area"].includes(chart.type)
        ? "stacked"
        : "clustered",
    holeSize: chart.donut ? 58 : undefined,
    radarStyle: chart.type === "radar" ? "filled" : undefined,
    lineDataSymbol: chart.type === "line" ? "none" : undefined,
    lineSize: chart.type === "line" ? 2.5 : undefined,
    lineSmooth: chart.type === "line" ? chart.curve === "smooth" : undefined,
  };

  if (chart.type === "pie") {
    chartOptions.showLegend = chart.dataset.length <= 8;
    chartOptions.dataBorder = { pt: 1, color: theme.background };
  }

  slide.addChart(chartType, data, chartOptions);
}

/**
 * @param {Object[]} rows
 * @param {number} colCount
 * @returns {boolean[]}
 */
function numericColumns(rows, colCount) {
  return Array.from({ length: colCount }, (_, index) => {
    const values = rows
      .map((row) => String(row[index] ?? "").trim())
      .filter(Boolean);
    if (values.length === 0) return false;
    const numeric = values.filter((value) =>
      /^[-+]?[$€£¥₽₸₴₹]?\s*\d[\d\s.,]*%?$/.test(value)
    ).length;
    return numeric / values.length >= 0.6;
  });
}

/**
 * @param {number[]} widths
 * @param {number} totalWidth
 * @returns {number[]}
 */
function scaleWidths(widths, totalWidth) {
  const total = widths.reduce((sum, width) => sum + width, 0) || 1;
  return widths.map((width) => (width / total) * totalWidth);
}

/**
 * @param {Object} slide
 * @param {Object} pptx
 * @param {Object} table
 * @param {Object} theme
 * @param {Object} options
 */
function addTableContent(slide, pptx, table, theme, options = {}) {
  const {
    x = MARGIN_X,
    y = 1.45,
    w = CONTENT_W,
    h = 3.15,
    language = "en",
  } = options;

  const strings = getStrings(language);
  const rows = table.rows || [];
  if (rows.length === 0) return;

  const colCount = Math.max(
    table.headers?.length || 0,
    ...rows.map((row) => row.length)
  );
  if (colCount === 0) return;

  const hasHeader =
    Array.isArray(table.headers) &&
    table.headers.length > 0 &&
    table.headers.some((header) => String(header || "").trim() !== "");
  const bodyRows = rows.map((row) => {
    const next = row.slice(0, colCount);
    while (next.length < colCount) next.push("");
    return next;
  });

  const numeric = numericColumns(bodyRows, colCount);
  const weights = Array.from({ length: colCount }, (_, index) => {
    const values = bodyRows.map((row) => String(row[index] || "").length);
    const headerLength = hasHeader
      ? String(table.headers[index] || "").length
      : 0;
    return Math.min(3, Math.max(0.8, Math.max(headerLength, ...values, 6) / 6));
  });
  const colW = scaleWidths(weights, w);

  const headerHeight = hasHeader ? 0.36 : 0;
  const availableHeight =
    h - headerHeight - (table.source || table.asOf ? 0.22 : 0);
  const rowHeight = Math.min(
    0.52,
    Math.max(0.26, availableHeight / Math.max(bodyRows.length, 1))
  );
  const bodyFontSize = bodyRows.length > 10 ? 8 : bodyRows.length > 7 ? 9 : 10;

  const tableRows = [];
  if (hasHeader) {
    tableRows.push(
      table.headers.slice(0, colCount).map((header) => ({
        text: String(header || ""),
        options: {
          bold: true,
          fontSize: bodyFontSize + 1,
          fontFace: theme.fontBody,
          color: theme.tableHeaderColor,
          fill: { color: theme.tableHeaderBg },
          align: "left",
          valign: "middle",
          margin: [3, 5, 3, 5],
        },
      }))
    );
  }

  bodyRows.forEach((row, rowIndex) => {
    tableRows.push(
      row.map((cell, colIndex) => ({
        text: String(cell ?? ""),
        options: {
          fontSize: bodyFontSize,
          fontFace: theme.fontBody,
          color: theme.bodyColor,
          fill: {
            color: rowIndex % 2 === 1 ? theme.tableAltRowBg : theme.background,
          },
          align: numeric[colIndex] ? "right" : "left",
          valign: "middle",
          margin: [3, 5, 3, 5],
        },
      }))
    );
  });

  slide.addTable(tableRows, {
    x,
    y,
    w,
    colW,
    rowH: hasHeader
      ? [headerHeight, ...Array(bodyRows.length).fill(rowHeight)]
      : rowHeight,
    border: {
      type: "solid",
      pt: 0.5,
      color: theme.tableBorderColor,
    },
    autoPage: false,
  });

  const sourceParts = [];
  if (table.source?.title) {
    sourceParts.push(`${strings.source}: ${truncate(table.source.title, 90)}`);
  }
  if (table.asOf || table.source?.asOf) {
    sourceParts.push(`${strings.asOf} ${table.asOf || table.source.asOf}`);
  }
  if (table.truncated) {
    sourceParts.push(
      strings.showingFirst.replace("{count}", String(table.rows.length))
    );
  }

  if (sourceParts.length > 0) {
    addText(slide, sourceParts.join("  ·  "), {
      x,
      y: y + h - 0.2,
      w,
      h: 0.18,
      fontSize: 8,
      color: theme.footerColor,
      fontFace: theme.fontBody,
      align: "left",
      valign: "middle",
    });
  }
}

/**
 * @param {Object} slide
 * @param {Object} content
 * @param {Object} theme
 * @param {Object} options
 */
function addBulletContent(slide, pptx, content, theme, options = {}) {
  const {
    x = MARGIN_X,
    y = 1.45,
    w = CONTENT_W,
    h = 3.2,
    language = "en",
  } = options;

  const items = Array.isArray(content)
    ? content.filter((item) => String(item || "").trim() !== "")
    : [];
  if (items.length === 0) {
    addText(slide, getStrings(language).noData, {
      x,
      y,
      w,
      h,
      fontSize: 14,
      color: theme.subtitleColor,
      fontFace: theme.fontBody,
      italic: true,
      valign: "top",
    });
    return;
  }

  const totalChars = items.reduce((sum, item) => sum + String(item).length, 0);
  const fontSize =
    items.length <= 3 && totalChars <= 260
      ? 17
      : items.length <= 4 && totalChars <= 360
        ? 16
        : items.length <= 6
          ? 14
          : 12;
  const paraSpaceAfter = theme.density === "compact" ? 7 : 11;

  if (pptx) {
    addRect(slide, pptx, {
      x: x - 0.02,
      y,
      w: 0.03,
      h,
      fill: { color: theme.accentColor, transparency: 72 },
    });
  }

  const bullets = items.map((text) => ({
    text: String(text),
    options: {
      fontSize,
      color: theme.bodyColor,
      fontFace: theme.fontBody,
      bullet: { code: theme.bulletCode || "25AA", color: theme.bulletColor },
      paraSpaceAfter,
      lineSpacingMultiple: 1.1,
      breakLine: false,
    },
  }));

  slide.addText(bullets, {
    x: x + 0.18,
    y,
    w: w - 0.18,
    h,
    valign: "top",
    margin: 0,
    fit: "shrink",
  });
}

module.exports = {
  valueFormatCode,
  seriesLabel,
  categoryData,
  scatterData,
  waterfallData,
  addChartContent,
  addTableContent,
  addBulletContent,
};
