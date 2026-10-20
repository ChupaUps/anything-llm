import { colorAt, formatValue } from "./chart-utils.js";

const CATEGORY_CHARTS = ["pie", "radialBar", "treemap", "funnel", "waterfall"];

function categoryColor(model, row, entry) {
  if (model?.type === "waterfall") {
    return row?.direction === "down" ? "#ef4444" : "#10b981";
  }
  if (entry?.color) return entry.color;
  if (row?.fill) return row.fill;
  const index = model?.dataset?.findIndex(
    (item) => item === row || (row && item?.[model.xKey] === row[model.xKey])
  );
  return index >= 0
    ? colorAt(index, model?.palette)
    : model?.series?.[0]?.color;
}

function resolvePoint(entry, model) {
  const row =
    entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  const isCategoryChart = CATEGORY_CHARTS.includes(model?.type);
  const dataKey = entry?.dataKey;
  let value = entry?.value;
  if (value === undefined && dataKey) value = row[dataKey];
  if (model?.type === "waterfall" && typeof row?.change === "number") {
    value = row.change;
  }
  if (value === undefined && model?.series?.length === 1) {
    value = row[model.series[0].key];
  }

  if (model?.type === "sankey") {
    const nodeName = row?.source?.name ?? row?.payload?.name ?? row?.name;
    const nodeIndex = model?.nodes?.findIndex((node) => node.name === nodeName);
    return {
      name: entry?.name ?? "",
      value: entry?.value,
      color:
        nodeIndex >= 0
          ? colorAt(nodeIndex, model?.palette)
          : model?.series?.[0]?.color,
    };
  }

  const name = isCategoryChart
    ? (row?.[model?.xKey] ?? entry?.name ?? row?.name ?? "")
    : (entry?.name ?? model?.series?.[0]?.label ?? row?.[model?.xKey] ?? "");
  const color = isCategoryChart
    ? categoryColor(model, row, entry)
    : (entry?.color ?? row?.fill ?? entry?.fill ?? model?.series?.[0]?.color);

  return { name, value, color };
}

function formatModelFor(entry, model) {
  const series = model?.series?.find((item) => item.key === entry?.dataKey);
  if (series?.axis !== "right") return model;
  if (!model?.rightValueFormat && !model?.rightCurrency) return model;
  return {
    ...model,
    valueFormat: model.rightValueFormat ?? model.valueFormat,
    currency: model.rightCurrency ?? model.currency,
  };
}

/**
 * Theme-aware tooltip shared by every chart type. `model` is the normalized
 * chart so values can be formatted with the right units and currency.
 */
export default function CustomTooltip({ active, payload, label, model }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const entries =
    model?.type === "waterfall"
      ? payload.filter((entry) => entry?.dataKey === "delta")
      : payload;
  const visible = entries.length > 0 ? entries : payload;
  const points = visible.map((entry) => ({
    ...resolvePoint(entry, model),
    formatModel: formatModelFor(entry, model),
  }));
  const isCategoryChart = CATEGORY_CHARTS.includes(model?.type);
  const header =
    model?.type === "sankey" || isCategoryChart
      ? null
      : (label ?? points[0]?.name ?? points[0]?.value);

  return (
    <div className="min-w-[9rem] max-w-[16rem] rounded-lg border border-theme-modal-border bg-theme-bg-primary px-3 py-2 text-xs shadow-lg">
      {header !== null && header !== undefined && header !== "" && (
        <p className="mb-1 truncate font-semibold text-theme-text-primary">
          {String(header)}
        </p>
      )}
      <div className="space-y-1">
        {points.map((point, index) => (
          <div
            key={`${String(point.name)}-${index}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-theme-text-secondary">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: point.color }}
              />
              <span className="truncate">{String(point.name)}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-theme-text-primary">
              {formatValue(point.value, point.formatModel ?? model)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
