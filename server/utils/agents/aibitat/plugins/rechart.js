const { Deduplicator } = require("../utils/dedupe");
const {
  AXES,
  CHART_TYPES,
  CURVES,
  MAX_CHARTS_PER_RESPONSE,
  MAX_LIMIT,
  ORIENTATIONS,
  PALETTES,
  SERIES_KINDS,
  SORTS,
  STACK_MODES,
  VALUE_FORMATS,
  normalizeChartPayload,
} = require("./chart-data.js");

const EXAMPLE_PAYLOAD = JSON.stringify({
  type: "bar",
  title: "Revenue by month",
  valueFormat: "currency",
  currency: "USD",
  dataset: [
    { name: "Jan", revenue: 1200 },
    { name: "Feb", revenue: 1540 },
  ],
});

const LAYOUTS = ["auto", "grid", "stack", "dashboard"];

/**
 * Resolve the collection layout for the current turn. A single chart always
 * stacks, and an unknown/auto request falls back to a grid for 2+ charts.
 * @param {Object[]} charts
 * @param {string|null} requested
 * @returns {"grid"|"stack"|"dashboard"}
 */
function resolveLayout(charts, requested) {
  if (!Array.isArray(charts) || charts.length < 2) return "stack";
  if (requested === "dashboard" && charts.length < 3) return "grid";
  return ["grid", "stack", "dashboard"].includes(requested)
    ? requested
    : "grid";
}

const rechart = {
  name: "create-chart",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          tracker: new Deduplicator(),
          chartCount: 0,
          chartTurn: -1,
          description:
            "Create a chart, graph, or data visualization from data that is already present in the conversation or retrieved documents. " +
            "Never invent or estimate numbers - only chart values the user or the sources actually provided. " +
            "Pick the type that matches the question: line/area for trends over time, bar for comparing categories, " +
            "waterfall for how individual gains and losses add up to a total, " +
            "pie for parts of a whole (max 8 slices), scatter for correlation between two numeric columns (add sizeKey for a bubble chart), " +
            "radar for comparing several metrics, treemap for hierarchical shares, funnel for sequential stages, " +
            "sankey for flows between stages (link rows use source, target and value). " +
            "composed to combine bars with a line and, when the units differ, put a series on the right axis with axis: right and set rightValueFormat/rightCurrency for that axis. " +
            "radialBar with gauge: true draws a single-value progress gauge (set gaugeMax for the goal). " +
            "Vary the presentation: stacked or percent stacking for part-to-whole over time, horizontal bars for rankings and long labels, " +
            "step curves for discrete changes, and a palette that fits the topic (ocean, sunset, mono, semantic). " +
            "Use showValues on short bar charts, sort desc for rankings, referenceLine for a target, showAverage for an average line, and trendLine on scatter charts. " +
            "One answer can include up to 4 charts when they cover different parts of the question - never repeat the same data. " +
            "For multi-chart answers set layout: dashboard (feature the first chart full-width), grid (equal cards), or stack (one column); send it once on the first chart. " +
            "Keep datasets small and readable: at most 24 rows and 1-3 numeric series.",
          examples: [
            {
              prompt: "Make a bar chart of revenue by month",
              call: JSON.stringify({
                type: "bar",
                title: "Revenue by month",
                valueFormat: "currency",
                currency: "USD",
                dataset: [
                  { name: "Jan", revenue: 1200 },
                  { name: "Feb", revenue: 1540 },
                  { name: "Mar", revenue: 1310 },
                ],
              }),
            },
            {
              prompt: "Show revenue share by region over two quarters",
              call: JSON.stringify({
                type: "bar",
                title: "Revenue share by region",
                subtitle: "Percent of quarterly revenue",
                stackMode: "percent",
                orientation: "horizontal",
                palette: "ocean",
                showValues: true,
                dataset: [
                  { name: "Q1", north: 42, south: 31, west: 27 },
                  { name: "Q2", north: 40, south: 33, west: 27 },
                ],
              }),
            },
            {
              prompt: "Compare signups and churn over the last quarter",
              call: JSON.stringify({
                type: "composed",
                title: "Signups vs churn",
                dataset: [
                  { name: "Jan", signups: 320, churn: 42 },
                  { name: "Feb", signups: 410, churn: 38 },
                  { name: "Mar", signups: 380, churn: 51 },
                ],
                series: [
                  { key: "signups", label: "Signups", kind: "bar" },
                  { key: "churn", label: "Churn", kind: "line" },
                ],
              }),
            },
            {
              prompt:
                "Show revenue and profit margin together against the target",
              call: JSON.stringify({
                type: "composed",
                title: "Revenue vs margin",
                valueFormat: "currency",
                currency: "USD",
                rightValueFormat: "percent",
                referenceLine: 2000,
                referenceLabel: "Target",
                series: [
                  {
                    key: "revenue",
                    label: "Revenue",
                    kind: "bar",
                    axis: "left",
                  },
                  {
                    key: "margin",
                    label: "Margin",
                    kind: "line",
                    axis: "right",
                  },
                ],
                dataset: [
                  { name: "Jan", revenue: 1800, margin: 12 },
                  { name: "Feb", revenue: 2200, margin: 15 },
                  { name: "Mar", revenue: 2100, margin: 9 },
                ],
              }),
            },
            {
              prompt: "Show what drove the change in profit this quarter",
              call: JSON.stringify({
                type: "waterfall",
                title: "Profit bridge",
                subtitle: "Changes vs last quarter",
                valueFormat: "currency",
                currency: "USD",
                showValues: true,
                dataset: [
                  { name: "Price", change: 1200 },
                  { name: "Volume", change: 800 },
                  { name: "Costs", change: -1500 },
                  { name: "FX", change: -300 },
                ],
              }),
            },
            {
              prompt: "Show progress toward the 500 signup goal",
              call: JSON.stringify({
                type: "radialBar",
                title: "Signups vs goal",
                gauge: true,
                gaugeMax: 500,
                showLegend: false,
                dataset: [{ name: "Signups", value: 412 }],
              }),
            },
            {
              prompt: "Show how signups flow from channel to outcome",
              call: JSON.stringify({
                type: "sankey",
                title: "Signup flow",
                subtitle: "Users by channel and outcome",
                yLabel: "Users",
                dataset: [
                  { source: "Organic", target: "Free", value: 420 },
                  { source: "Paid", target: "Free", value: 260 },
                  { source: "Referral", target: "Free", value: 120 },
                  { source: "Free", target: "Pro", value: 300 },
                  { source: "Free", target: "Churn", value: 500 },
                ],
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: CHART_TYPES,
                description:
                  "Chart type. Use line/area for trends, bar for comparisons, waterfall for cumulative gains/losses, pie for parts of a whole, scatter for numeric correlation (bubble with sizeKey), radar for multi-metric profiles, treemap for shares, funnel for stages, sankey for flows between stages, radialBar with gauge for a single progress value. ",
              },
              title: {
                type: "string",
                description:
                  "Short, specific chart title. Do not leave it blank.",
              },
              subtitle: {
                type: "string",
                description:
                  "Optional context line (unit, period, source) shown under the title.",
              },
              xKey: {
                type: "string",
                description:
                  'Optional name of the category column. Defaults to the "name" column.',
              },
              xLabel: {
                type: "string",
                description: "Optional label for the x-axis.",
              },
              yLabel: {
                type: "string",
                description:
                  "Optional label for the y-axis (or the pie total).",
              },
              valueFormat: {
                type: "string",
                enum: VALUE_FORMATS,
                description:
                  "How to format numbers. percent appends % to the given values (send 42 for 42%, not 0.42).",
              },
              currency: {
                type: "string",
                description:
                  "ISO 4217 code (USD, EUR, GBP...) used when valueFormat is currency. Defaults to USD.",
              },
              rightValueFormat: {
                type: "string",
                enum: VALUE_FORMATS,
                description:
                  "composed only: number format for the right axis. Use it when the right-axis series has a different unit, for example percent margin next to currency revenue.",
              },
              rightCurrency: {
                type: "string",
                description:
                  "composed only: ISO 4217 code for the right axis. Defaults to currency.",
              },
              stackMode: {
                type: "string",
                enum: STACK_MODES,
                description:
                  "bar/area only: grouped (default), stacked, or percent for a 100% share of each row.",
              },
              orientation: {
                type: "string",
                enum: ORIENTATIONS,
                description:
                  "bar only: horizontal suits rankings and long category names. Defaults to vertical.",
              },
              curve: {
                type: "string",
                enum: CURVES,
                description:
                  "line/area only: smooth (default), linear, or step for discrete changes.",
              },
              donut: {
                type: "boolean",
                description:
                  "pie only: render a donut (default true) or a classic pie.",
              },
              showValues: {
                type: "boolean",
                description:
                  "Show numeric labels on bars. Best for short bar charts.",
              },
              showLegend: {
                type: "boolean",
                description: "Show the legend. Defaults to true.",
              },
              layout: {
                type: "string",
                enum: LAYOUTS,
                description:
                  "Answer layout for multiple charts: auto (default), grid (equal cards), stack (one column), or dashboard (first chart full-width with supporting cards). Send it on the first chart; it applies to the whole answer.",
              },
              palette: {
                type: "string",
                enum: PALETTES,
                description:
                  "Color preset: default, ocean, sunset, mono, or semantic (green/red for positive/negative).",
              },
              sort: {
                type: "string",
                enum: SORTS,
                description:
                  "Sort categories by the first numeric series. Use desc for rankings.",
              },
              limit: {
                type: "integer",
                minimum: 1,
                maximum: MAX_LIMIT,
                description:
                  "Keep only the first N categories after sorting; the rest are folded into Other for bars. Use with sort: desc.",
              },
              sizeKey: {
                type: "string",
                description:
                  "scatter only: numeric column that controls bubble size. Turns the scatter into a bubble chart.",
              },
              referenceLine: {
                type: "number",
                description:
                  "bar/line/area/composed/scatter: draw a horizontal line at this value (vertical on horizontal bars), for example a target or budget.",
              },
              referenceLabel: {
                type: "string",
                description:
                  "Short label for referenceLine, for example Target or Budget.",
              },
              showAverage: {
                type: "boolean",
                description:
                  "bar/line/area/composed/scatter: draw a dashed line at the average of the first series.",
              },
              trendLine: {
                type: "boolean",
                description:
                  "scatter only: draw a least-squares trend line through the points.",
              },
              gauge: {
                type: "boolean",
                description:
                  "radialBar only: render a single-value progress gauge instead of a radial ranking.",
              },
              gaugeMax: {
                type: "number",
                description:
                  "radialBar gauge only: maximum value of the arc, for example the goal. Defaults to the largest value.",
              },
              series: {
                type: "array",
                description:
                  "Optional metadata for each numeric column. key must match a dataset key. kind is only used by composed charts.",
                items: {
                  type: "object",
                  properties: {
                    key: {
                      type: "string",
                      description: "Numeric column name in dataset.",
                    },
                    label: {
                      type: "string",
                      description: "Legend/tooltip label. Defaults to the key.",
                    },
                    kind: {
                      type: "string",
                      enum: SERIES_KINDS,
                      description:
                        "Series rendering for composed charts. Defaults to bar for the first series and line for the rest.",
                    },
                    axis: {
                      type: "string",
                      enum: AXES,
                      description:
                        "composed only: left (default) or right. Use right for a series with a different unit or scale.",
                    },
                  },
                  required: ["key"],
                },
              },
              dataset: {
                type: "array",
                description:
                  'Array of row objects. Every row needs a category column named "name" (month, label, country, date...) plus one to three numeric metric columns named after the metric. ' +
                  'sankey charts use link rows instead: [{"source":"Organic","target":"Free","value":420}] with positive values. ' +
                  'Example: [{"name":"Jan","revenue":1200,"cost":800},{"name":"Feb","revenue":1540,"cost":920}]. ' +
                  "Send numbers, not strings. Never send the dataset as a JSON string.",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Category label for this row.",
                    },
                    source: {
                      type: "string",
                      description:
                        "sankey only: name of the node the flow starts from.",
                    },
                    target: {
                      type: "string",
                      description:
                        "sankey only: name of the node the flow ends at.",
                    },
                    value: {
                      type: "number",
                      description: "sankey only: positive flow amount.",
                    },
                  },
                },
              },
            },
            required: ["type", "title", "dataset"],
            additionalProperties: false,
          },
          handler: async function (args) {
            try {
              // The chart budget is per user turn, not per tool call, so a
              // single question can produce up to four charts.
              const userTurns = Array.isArray(this.super.chats)
                ? this.super.chats.filter((chat) => chat?.from === "USER")
                    .length
                : 0;
              if (this.chartTurn !== userTurns) {
                this.chartTurn = userTurns;
                this.chartCount = 0;
                this.tracker.reset("runs");
                // Charts rendered earlier in this conversation are already
                // persisted, so only keep the current turn's collection.
                this.super._rechartCharts = [];
                this.super._rechartLayout = null;
              }

              if (this.chartCount >= MAX_CHARTS_PER_RESPONSE) {
                this.super.introspect(
                  `${this.caller}: chart limit reached (${MAX_CHARTS_PER_RESPONSE} per response).`
                );
                return `You have already generated ${MAX_CHARTS_PER_RESPONSE} charts for this response. Do not call create-chart again. Tell the user the remaining findings in text instead.`;
              }

              const result = normalizeChartPayload(args || {});
              if (!result.ok) {
                this.super.introspect(
                  `${this.caller}: rejected ${args?.type || "chart"} chart - ${result.reason}.`
                );
                return `Chart not created: ${result.reason}. Call create-chart again with a corrected payload, for example ${EXAMPLE_PAYLOAD}. The dataset must be an array of row objects with numeric values and a "name" category column (sankey charts use source/target/value links).`;
              }

              const chart = result.chart;
              const signature = {
                type: chart.type,
                xKey: chart.xKey,
                series: chart.series.map((series) => series.key),
                dataset: chart.dataset,
              };

              if (this.tracker.isDuplicate(this.name, signature).isDuplicate) {
                return "An identical chart with the same data was already created for this response. Do not call create-chart again with the same dataset.";
              }

              this.tracker.trackRun(this.name, signature);
              this.chartCount += 1;
              if (LAYOUTS.includes(args?.layout) && args.layout !== "auto") {
                this.super._rechartLayout = args.layout;
              }

              this.super.introspect(
                `${this.caller}: Rendering ${chart.type} chart "${chart.title}" (${chart.series.length} series, ${chart.dataset.length} points${chart.truncated ? ", truncated" : ""}).`
              );
              if (!Array.isArray(this.super._rechartCharts)) {
                this.super._rechartCharts = [];
              }
              this.super._rechartCharts.push(chart);

              // Resend the whole collection with a stable turn id so the live
              // UI updates one message instead of appending a bubble per chart.
              const turnId = `${this.super.trackedChatId ?? "turn"}-${userTurns}`;
              const layout = resolveLayout(
                this.super._rechartCharts,
                this.super._rechartLayout
              );
              this.super.socket?.send?.("rechartVisualize", {
                charts: [...this.super._rechartCharts],
                caption: "",
                layout,
                turnId,
              });

              // The stored response keeps every chart from this turn so a
              // reload does not silently drop all but the last one.
              this.super._replySpecialAttributes = {
                saveAsType: "rechartVisualize",
                storedResponse: (additionalText = "") =>
                  JSON.stringify({
                    charts: this.super._rechartCharts,
                    caption: additionalText,
                    layout,
                  }),
                postSave: () => {
                  this.super._rechartCharts = [];
                },
              };

              return `The ${chart.type} chart "${chart.title}" was rendered with ${chart.series.length} series and ${chart.dataset.length} points (chart ${this.chartCount} of up to ${MAX_CHARTS_PER_RESPONSE}). Do not call create-chart again for this data. You may create more charts for different data, then use the final response to explain them.`;
            } catch (error) {
              this.super.handlerProps?.log?.(
                `create-chart raised an error. ${error.message}`
              );
              return `Let the user know this action was not successful. An error was raised while generating the chart. ${error.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = {
  rechart,
};
