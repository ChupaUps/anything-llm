import { formatValue, truncateText } from "./chart-utils.js";

/**
 * Treemap cell. Recharts injects the layout props for every node, while
 * `colors` and `model` are forwarded from the chart for palette and units.
 */
export default function CustomCell({
  colors = [],
  model,
  depth,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
  name,
  value,
}) {
  const isLeaf = depth === 1;
  const fill = colors[index % (colors.length || 1)] || "#3b82f6";
  const label = truncateText(name, Math.max(6, Math.floor(width / 8)));
  const showValue = height >= 52 && width >= 72;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: isLeaf ? fill : "transparent",
          stroke: "var(--theme-bg-primary)",
          strokeWidth: isLeaf ? 2 : 0,
        }}
      />
      {isLeaf && width >= 56 && height >= 28 ? (
        <text
          x={x + 8}
          y={y + 19}
          fill="#ffffff"
          fontSize={12}
          fontWeight={600}
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.25)" }}
        >
          {label}
        </text>
      ) : null}
      {isLeaf && showValue ? (
        <text
          x={x + 8}
          y={y + 36}
          fill="rgba(255,255,255,0.85)"
          fontSize={11}
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.25)" }}
        >
          {formatValue(value, model)}
        </text>
      ) : null}
    </g>
  );
}
