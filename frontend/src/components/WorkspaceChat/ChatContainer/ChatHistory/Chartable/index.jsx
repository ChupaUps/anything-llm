import { memo, useCallback, useId, useMemo, useState } from "react";
import { v4 } from "uuid";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import DOMPurify from "dompurify";
import { saveAs } from "file-saver";
import { useGenerateImage } from "recharts-to-png";
import { CircleNotch, DownloadSimple } from "@phosphor-icons/react";
import { useThemeContext } from "@/ThemeContext";
import renderMarkdown from "@/utils/chat/markdown.js";
import {
  colorAt,
  createAxisFormatter,
  formatValue,
  normalizeChartCollection,
  paletteColors,
  prettifyKey,
  truncateText,
} from "./chart-utils.js";
import CustomCell from "./CustomCell.jsx";
import CustomTooltip from "./CustomTooltip.jsx";

const TICK = { fill: "var(--theme-text-secondary)", fontSize: 11 };
const GRID = {
  stroke: "var(--theme-modal-border)",
  strokeOpacity: 0.6,
  strokeDasharray: "3 3",
  vertical: false,
};
const CHART_HEIGHT = "h-[320px]";
const WATERFALL_UP = "#10b981";
const WATERFALL_DOWN = "#ef4444";

const CURVE_TYPES = { smooth: "monotone", linear: "linear", step: "step" };

function curveType(model) {
  return CURVE_TYPES[model.curve] ?? "monotone";
}

function stackId(model) {
  return model.stackMode === "grouped" ? undefined : "stack";
}

function hasRightAxis(model) {
  return model.series.some((series) => series.axis === "right");
}

function seriesAxisId(model, series) {
  if (!hasRightAxis(model)) return undefined;
  return series.axis === "right" ? "right" : "left";
}

function chartMargin(model) {
  return {
    top: 8,
    right: 16,
    bottom: model.xLabel ? 22 : 8,
    left: model.yLabel ? 8 : 0,
  };
}

function categoryXAxis(model) {
  return (
    <XAxis
      dataKey={model.xKey}
      tickLine={false}
      axisLine={false}
      tick={TICK}
      tickMargin={8}
      minTickGap={16}
      interval="preserveStartEnd"
      tickFormatter={(value) => truncateText(value, 14)}
      label={
        model.xLabel
          ? {
              value: model.xLabel,
              position: "insideBottom",
              offset: -4,
              fill: "var(--theme-text-secondary)",
              fontSize: 11,
            }
          : undefined
      }
    />
  );
}

function numericXAxis(model, formatter) {
  return (
    <XAxis
      type="number"
      dataKey={model.xKey}
      name={model.xLabel || prettifyKey(model.xKey)}
      tickLine={false}
      axisLine={false}
      tick={TICK}
      tickMargin={8}
      domain={["auto", "auto"]}
      tickFormatter={formatter}
      label={
        model.xLabel
          ? {
              value: model.xLabel,
              position: "insideBottom",
              offset: -4,
              fill: "var(--theme-text-secondary)",
              fontSize: 11,
            }
          : undefined
      }
    />
  );
}

function valueAxis(model, formatter, axisId) {
  return (
    <YAxis
      yAxisId={axisId}
      tickLine={false}
      axisLine={false}
      tick={TICK}
      tickMargin={6}
      width={56}
      domain={model.stackMode === "percent" ? [0, 100] : undefined}
      tickFormatter={formatter}
      label={
        model.yLabel
          ? {
              value: model.yLabel,
              angle: -90,
              position: "insideLeft",
              offset: 4,
              fill: "var(--theme-text-secondary)",
              fontSize: 11,
              style: { textAnchor: "middle" },
            }
          : undefined
      }
    />
  );
}

function chartTooltip(model, cursor) {
  return (
    <RechartsTooltip
      wrapperStyle={{ outline: "none" }}
      isAnimationActive={false}
      cursor={cursor}
      content={<CustomTooltip model={model} />}
    />
  );
}

function secondaryValueAxis(model, formatter) {
  return (
    <YAxis
      yAxisId="right"
      orientation="right"
      tickLine={false}
      axisLine={false}
      tick={TICK}
      tickMargin={6}
      width={56}
      domain={model.stackMode === "percent" ? [0, 100] : undefined}
      tickFormatter={formatter}
    />
  );
}

function rightAxisFormatter(model) {
  return createAxisFormatter({
    ...model,
    valueFormat: model.rightValueFormat ?? model.valueFormat,
    currency: model.rightCurrency ?? model.currency,
  });
}

function referenceLines(model, horizontal, yAxisId) {
  const lines = [];

  if (model.referenceLine !== null && model.referenceLine !== undefined) {
    const props = {
      stroke: "#f59e0b",
      strokeDasharray: "4 4",
      strokeWidth: 1.5,
      ifOverflow: "extendDomain",
      yAxisId: horizontal ? undefined : yAxisId,
      label: {
        value: model.referenceLabel || formatValue(model.referenceLine, model),
        position: "insideTopRight",
        fill: "var(--theme-text-secondary)",
        fontSize: 10,
      },
    };
    lines.push(
      horizontal ? (
        <ReferenceLine key="reference" {...props} x={model.referenceLine} />
      ) : (
        <ReferenceLine key="reference" {...props} y={model.referenceLine} />
      )
    );
  }

  if (model.showAverage && model.averageValue !== null) {
    const props = {
      stroke: "#94a3b8",
      strokeDasharray: "2 4",
      strokeWidth: 1.25,
      ifOverflow: "extendDomain",
      yAxisId: horizontal ? undefined : yAxisId,
      label: {
        value: `Avg ${formatValue(model.averageValue, model)}`,
        position: "insideBottomRight",
        fill: "var(--theme-text-secondary)",
        fontSize: 10,
      },
    };
    lines.push(
      horizontal ? (
        <ReferenceLine key="average" {...props} x={model.averageValue} />
      ) : (
        <ReferenceLine key="average" {...props} y={model.averageValue} />
      )
    );
  }

  return lines.length > 0 ? lines : null;
}

function lineDot(visible, color) {
  return visible ? { r: 2.5, strokeWidth: 0, fill: color } : false;
}

function SeriesLegend({ model }) {
  if (model.series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {model.series.map((series) => (
        <span
          key={series.key}
          className="inline-flex items-center gap-1.5 text-[11px] text-theme-text-secondary"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: series.color }}
          />
          {series.label}
        </span>
      ))}
    </div>
  );
}

function CategoryLegend({ model, primaryKey }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3">
      {model.dataset.map((row, index) => (
        <div
          key={`${String(row[model.xKey])}-${index}`}
          className="flex min-w-0 items-center gap-2 text-[11px] text-theme-text-secondary"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: colorAt(index, model.palette) }}
          />
          <span className="truncate">{String(row[model.xKey])}</span>
          <span className="ml-auto shrink-0 tabular-nums text-theme-text-primary">
            {formatValue(row[primaryKey], model)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AreaView({ model }) {
  const reactId = useId();
  const gradientPrefix = `chart-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const axisFormatter = createAxisFormatter(model);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={model.dataset} margin={chartMargin(model)}>
        <defs>
          {model.series.map((series, index) => (
            <linearGradient
              key={series.key}
              id={`${gradientPrefix}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor={series.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={series.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID} />
        {categoryXAxis(model)}
        {valueAxis(model, axisFormatter)}
        {chartTooltip(model, {
          stroke: "var(--theme-modal-border)",
          strokeWidth: 1,
        })}
        {referenceLines(model, false)}
        {model.series.map((series, index) => (
          <Area
            key={series.key}
            type={curveType(model)}
            dataKey={series.key}
            name={series.label}
            stackId={stackId(model)}
            stroke={series.color}
            strokeWidth={2}
            fill={`url(#${gradientPrefix}-${index})`}
            activeDot={{ r: 3 }}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarView({ model }) {
  const axisFormatter = createAxisFormatter(model);
  const horizontal = model.orientation === "horizontal";
  const stacked = model.stackMode !== "grouped";
  const radius = stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  const grid = horizontal
    ? { ...GRID, vertical: true, horizontal: false }
    : GRID;
  const valueDomain = model.stackMode === "percent" ? [0, 100] : undefined;
  const labelPosition = horizontal
    ? stacked
      ? "center"
      : "right"
    : stacked
      ? "center"
      : "top";
  const margin = horizontal
    ? { top: 8, right: 16, bottom: 8, left: 0 }
    : chartMargin(model);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={model.dataset}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={margin}
      >
        <CartesianGrid {...grid} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickMargin={8}
              domain={valueDomain}
              tickFormatter={axisFormatter}
            />
            <YAxis
              type="category"
              dataKey={model.xKey}
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickMargin={6}
              width={96}
              interval={0}
              tickFormatter={(value) => truncateText(value, 18)}
            />
          </>
        ) : (
          <>
            {categoryXAxis(model)}
            {valueAxis(model, axisFormatter)}
          </>
        )}
        {chartTooltip(model, {
          fill: "var(--theme-text-secondary)",
          opacity: 0.08,
        })}
        {referenceLines(model, horizontal)}
        {model.series.map((series) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            fill={series.color}
            stackId={stacked ? "bar" : undefined}
            radius={radius}
            maxBarSize={horizontal ? 28 : 42}
          >
            {model.showValues ? (
              <LabelList
                dataKey={series.key}
                position={labelPosition}
                formatter={(value) => formatValue(value, model)}
                fill={stacked ? "#ffffff" : "var(--theme-text-secondary)"}
                fontSize={10}
              />
            ) : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineView({ model }) {
  const axisFormatter = createAxisFormatter(model);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={model.dataset} margin={chartMargin(model)}>
        <CartesianGrid {...GRID} />
        {categoryXAxis(model)}
        {valueAxis(model, axisFormatter)}
        {chartTooltip(model, {
          stroke: "var(--theme-modal-border)",
          strokeWidth: 1,
        })}
        {referenceLines(model, false)}
        {model.series.map((series) => (
          <Line
            key={series.key}
            type={curveType(model)}
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2}
            dot={lineDot(model.dataset.length <= 12, series.color)}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function composedShape(series, index, model) {
  const kind = series.kind || (index === 0 ? "bar" : "line");
  if (kind === "bar") {
    return (
      <Bar
        key={series.key}
        dataKey={series.key}
        name={series.label}
        fill={series.color}
        radius={[4, 4, 0, 0]}
        maxBarSize={42}
        yAxisId={seriesAxisId(model, series)}
      />
    );
  }
  if (kind === "area") {
    return (
      <Area
        key={series.key}
        type={curveType(model)}
        dataKey={series.key}
        name={series.label}
        stroke={series.color}
        strokeWidth={2}
        fill={series.color}
        fillOpacity={0.2}
        connectNulls
        yAxisId={seriesAxisId(model, series)}
      />
    );
  }
  return (
    <Line
      key={series.key}
      type={curveType(model)}
      dataKey={series.key}
      name={series.label}
      stroke={series.color}
      strokeWidth={2}
      dot={false}
      activeDot={{ r: 4 }}
      connectNulls
      yAxisId={seriesAxisId(model, series)}
    />
  );
}

function ComposedView({ model }) {
  const axisFormatter = createAxisFormatter(model);
  const dual = hasRightAxis(model);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={model.dataset} margin={chartMargin(model)}>
        <CartesianGrid {...GRID} />
        {categoryXAxis(model)}
        {valueAxis(model, axisFormatter, dual ? "left" : undefined)}
        {dual ? secondaryValueAxis(model, rightAxisFormatter(model)) : null}
        {chartTooltip(model, {
          fill: "var(--theme-text-secondary)",
          opacity: 0.08,
        })}
        {referenceLines(model, false, dual ? "left" : undefined)}
        {model.series.map((series, index) =>
          composedShape(series, index, model)
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ScatterView({ model }) {
  const axisFormatter = createAxisFormatter(model);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={chartMargin(model)}>
        <CartesianGrid {...GRID} vertical />
        {numericXAxis(model, axisFormatter)}
        <YAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={TICK}
          tickMargin={6}
          width={56}
          domain={["auto", "auto"]}
          tickFormatter={axisFormatter}
        />
        {model.sizeKey ? (
          <ZAxis
            type="number"
            dataKey={model.sizeKey}
            name={prettifyKey(model.sizeKey)}
            range={[60, 400]}
          />
        ) : null}
        {chartTooltip(model, {
          stroke: "var(--theme-modal-border)",
          strokeDasharray: "3 3",
        })}
        {referenceLines(model, false)}
        {model.trendPoints ? (
          <ReferenceLine
            segment={model.trendPoints}
            stroke="#8b5cf6"
            strokeDasharray="6 4"
            strokeWidth={2}
            ifOverflow="extendDomain"
          />
        ) : null}
        {model.series.map((series) => (
          <Scatter
            key={series.key}
            name={series.label}
            data={model.dataset}
            dataKey={series.key}
            fill={series.color}
            fillOpacity={0.8}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function PieView({ model }) {
  const primaryKey = model.series[0].key;
  const donut = model.donut !== false;
  const total = model.dataset.reduce(
    (sum, row) => sum + (Number(row[primaryKey]) || 0),
    0
  );

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {chartTooltip(model, { fill: "transparent" })}
          <Pie
            data={model.dataset}
            dataKey={primaryKey}
            nameKey={model.xKey}
            cx="50%"
            cy="50%"
            innerRadius={donut ? "58%" : 0}
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--theme-bg-primary)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {model.dataset.map((row, index) => (
              <Cell
                key={`${String(row[model.xKey])}-${index}`}
                fill={colorAt(index, model.palette)}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {donut && total > 0 ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
          <span className="text-[10px] uppercase tracking-wide text-theme-text-secondary">
            Total
          </span>
          <span className="max-w-full truncate text-base font-semibold text-theme-text-primary">
            {formatValue(total, model)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function RadarView({ model }) {
  const axisFormatter = createAxisFormatter(model);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={model.dataset} cx="50%" cy="50%" outerRadius="72%">
        <PolarGrid stroke="var(--theme-modal-border)" />
        <PolarAngleAxis
          dataKey={model.xKey}
          tick={TICK}
          tickFormatter={(value) => truncateText(value, 12)}
        />
        <PolarRadiusAxis
          tick={TICK}
          tickFormatter={axisFormatter}
          axisLine={false}
        />
        {chartTooltip(model, {
          stroke: "var(--theme-modal-border)",
          strokeDasharray: "3 3",
        })}
        {model.series.map((series) => (
          <Radar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            fill={series.color}
            fillOpacity={0.25}
            strokeWidth={2}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}

function GaugeView({ model }) {
  const primaryKey = model.series[0].key;
  const value = Number(model.dataset[0]?.[primaryKey]) || 0;
  const goal = model.gaugeMax;
  const maxValue =
    goal ?? (model.valueFormat === "percent" ? 100 : Math.max(value, 1));
  const showGoal = Boolean(goal) || model.valueFormat === "percent";
  const data = [{ ...model.dataset[0], fill: colorAt(0, model.palette) }];

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          cx="50%"
          cy="58%"
          innerRadius="72%"
          outerRadius="98%"
          barSize={18}
          startAngle={210}
          endAngle={-30}
        >
          <PolarAngleAxis type="number" domain={[0, maxValue]} tick={false} />
          {chartTooltip(model, { fill: "transparent" })}
          <RadialBar
            dataKey={primaryKey}
            background={{ fill: "var(--theme-modal-border)", opacity: 0.4 }}
            cornerRadius={9}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 pt-8">
        <span className="text-2xl font-semibold text-theme-text-primary">
          {formatValue(value, model)}
        </span>
        {showGoal ? (
          <span className="text-[11px] text-theme-text-secondary">
            of {formatValue(maxValue, model)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RadialBarView({ model }) {
  if (model.gauge) return <GaugeView model={model} />;

  const primaryKey = model.series[0].key;
  const data = model.dataset.map((row, index) => ({
    ...row,
    fill: colorAt(index, model.palette),
  }));
  const maxValue = Math.max(
    ...model.dataset.map((row) => Number(row[primaryKey]) || 0),
    1
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart
        data={data}
        cx="50%"
        cy="50%"
        innerRadius="20%"
        outerRadius="92%"
        barSize={14}
      >
        <PolarAngleAxis type="number" domain={[0, maxValue]} tick={false} />
        {chartTooltip(model, { fill: "transparent" })}
        <RadialBar
          dataKey={primaryKey}
          background={{ fill: "var(--theme-modal-border)", opacity: 0.4 }}
          cornerRadius={6}
        />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

function TreemapView({ model }) {
  const primaryKey = model.series[0].key;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={model.dataset}
        dataKey={primaryKey}
        nameKey={model.xKey}
        stroke="var(--theme-bg-primary)"
        content={
          <CustomCell colors={paletteColors(model.palette)} model={model} />
        }
      >
        {chartTooltip(model, { fill: "transparent" })}
      </Treemap>
    </ResponsiveContainer>
  );
}

function FunnelView({ model }) {
  const primaryKey = model.series[0].key;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart margin={{ top: 8, right: 84, bottom: 8, left: 8 }}>
        {chartTooltip(model, { fill: "transparent" })}
        <Funnel data={model.dataset} dataKey={primaryKey}>
          {model.dataset.map((row, index) => (
            <Cell
              key={`${String(row[model.xKey])}-${index}`}
              fill={colorAt(index, model.palette)}
              stroke="none"
            />
          ))}
          <LabelList
            position="inside"
            fill="#ffffff"
            stroke="none"
            fontSize={11}
            dataKey={primaryKey}
            formatter={(value) => formatValue(value, model)}
          />
          <LabelList
            position="right"
            fill="var(--theme-text-secondary)"
            stroke="none"
            fontSize={11}
            dataKey={model.xKey}
            formatter={(value) => truncateText(value, 16)}
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

function SankeyNodeShape({ x, y, width, height, index, payload, palette }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2}
        fill={colorAt(index, palette)}
        fillOpacity={0.9}
      />
      <text
        x={x + width + 8}
        y={y + height / 2}
        dominantBaseline="middle"
        fill="var(--theme-text-primary)"
        stroke="var(--theme-bg-primary)"
        strokeWidth={3}
        paintOrder="stroke"
        fontSize={10}
      >
        {truncateText(payload?.name, 18)}
      </text>
    </g>
  );
}

function SankeyLinkShape({
  sourceX,
  sourceY,
  sourceControlX,
  targetX,
  targetY,
  targetControlX,
  linkWidth,
  payload,
  nodeIndex,
  palette,
}) {
  const sourceIndex = nodeIndex.get(payload?.source?.name) ?? 0;
  const color = colorAt(sourceIndex, palette);
  const half = linkWidth / 2;
  const centerline = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  const ribbon = [
    `M${sourceX},${sourceY - half}`,
    `C${sourceControlX},${sourceY - half} ${targetControlX},${targetY - half} ${targetX},${targetY - half}`,
    `L${targetX},${targetY + half}`,
    `C${targetControlX},${targetY + half} ${sourceControlX},${sourceY + half} ${sourceX},${sourceY + half}`,
    "Z",
  ].join(" ");

  return (
    <g>
      <path
        d={centerline}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(linkWidth, 12)}
      />
      <path d={ribbon} fill={color} fillOpacity={0.22} stroke="none" />
    </g>
  );
}

function SankeyView({ model }) {
  const nodes = model.nodes ?? [];
  const nodeIndex = useMemo(
    () => new Map(nodes.map((node, index) => [node.name, index])),
    [nodes]
  );
  const data = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ name: node.name })),
      links: model.dataset,
    }),
    [nodes, model.dataset]
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Sankey
        data={data}
        nodePadding={12}
        nodeWidth={12}
        linkCurvature={0.5}
        iterations={32}
        margin={{ top: 10, right: 130, bottom: 10, left: 10 }}
        node={(shapeProps) => (
          <SankeyNodeShape {...shapeProps} palette={model.palette} />
        )}
        link={(shapeProps) => (
          <SankeyLinkShape
            {...shapeProps}
            nodeIndex={nodeIndex}
            palette={model.palette}
          />
        )}
      >
        {chartTooltip(model, { fill: "transparent" })}
      </Sankey>
    </ResponsiveContainer>
  );
}

function formatDelta(value, model) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const formatted = formatValue(Math.abs(number), model);
  return number < 0 ? `-${formatted}` : `+${formatted}`;
}

function WaterfallView({ model }) {
  const axisFormatter = createAxisFormatter(model);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={model.dataset} margin={chartMargin(model)}>
        <CartesianGrid {...GRID} />
        {categoryXAxis(model)}
        {valueAxis(model, axisFormatter)}
        {chartTooltip(model, {
          fill: "var(--theme-text-secondary)",
          opacity: 0.08,
        })}
        <Bar
          dataKey="base"
          stackId="waterfall"
          fill="transparent"
          isAnimationActive={false}
        />
        <Bar dataKey="delta" stackId="waterfall" maxBarSize={42}>
          {model.dataset.map((row, index) => (
            <Cell
              key={`${String(row[model.xKey])}-${index}`}
              fill={row.direction === "down" ? WATERFALL_DOWN : WATERFALL_UP}
            />
          ))}
          {model.showValues ? (
            <LabelList
              dataKey="change"
              position="top"
              formatter={(value) => formatDelta(value, model)}
              fill="var(--theme-text-secondary)"
              fontSize={10}
            />
          ) : null}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartBody({ model }) {
  switch (model.type) {
    case "area":
      return <AreaView model={model} />;
    case "bar":
      return <BarView model={model} />;
    case "waterfall":
      return <WaterfallView model={model} />;
    case "line":
      return <LineView model={model} />;
    case "composed":
      return <ComposedView model={model} />;
    case "scatter":
      return <ScatterView model={model} />;
    case "pie":
      return <PieView model={model} />;
    case "radar":
      return <RadarView model={model} />;
    case "radialBar":
      return <RadialBarView model={model} />;
    case "treemap":
      return <TreemapView model={model} />;
    case "funnel":
      return <FunnelView model={model} />;
    case "sankey":
      return <SankeyView model={model} />;
    default:
      return null;
  }
}

function ChartCard({ model, hero = false }) {
  const primaryKey = model.series[0].key;
  const hiddenRows = Math.max(0, model.totalRows - model.dataset.length);
  const heightClass = hero
    ? "h-[380px]"
    : model.type === "sankey"
      ? "h-[360px]"
      : CHART_HEIGHT;

  return (
    <div className="w-full rounded-xl border border-theme-modal-border bg-theme-bg-primary p-4 md:p-6">
      <header className="mb-3 pr-8">
        <h3 className="text-base font-medium text-theme-text-primary">
          {model.title}
        </h3>
        {model.subtitle ? (
          <p className="mt-0.5 text-xs text-theme-text-secondary">
            {model.subtitle}
          </p>
        ) : null}
      </header>
      {model.showLegend ? <SeriesLegend model={model} /> : null}
      <div className={`${heightClass} w-full`}>
        <ChartBody model={model} />
      </div>
      {model.showLegend &&
      ["pie", "radialBar"].includes(model.type) &&
      !model.gauge ? (
        <CategoryLegend model={model} primaryKey={primaryKey} />
      ) : null}
      {model.truncated && hiddenRows > 0 ? (
        <p className="mt-2 text-[11px] text-theme-text-secondary">
          Showing {model.dataset.length} of {model.totalRows} data points.
        </p>
      ) : null}
    </div>
  );
}

export function Chartable({ props }) {
  const collection = useMemo(
    () => normalizeChartCollection(props.content),
    [props.content]
  );
  const theme = useThemeContext();
  const isLight = theme?.isLight ?? false;
  const [capturingAll, setCapturingAll] = useState(false);
  const [getAllJpeg, { ref: allRef, isLoading: isExportingAll }] =
    useGenerateImage({
      quality: 1,
      type: "image/jpeg",
      options: {
        backgroundColor: isLight ? "#ffffff" : "#0e0f0f",
        padding: 24,
        scale: 2,
      },
    });

  const handleExportAll = useCallback(async () => {
    setCapturingAll(true);
    try {
      // Let the per-chart buttons unmount before the grid is captured.
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      const jpeg = await getAllJpeg();
      if (jpeg) saveAs(jpeg, `charts-${v4().split("-")[0]}.jpg`);
    } finally {
      setCapturingAll(false);
    }
  }, [getAllJpeg]);

  if (collection.charts.length === 0) return null;

  const multiple = collection.charts.length > 1;
  const dashboard =
    multiple &&
    collection.layout === "dashboard" &&
    collection.charts.length >= 3;
  const grid = multiple && collection.layout !== "stack";
  const layoutClass = grid
    ? "grid grid-cols-1 gap-3 md:grid-cols-2"
    : "flex flex-col gap-y-3";

  return (
    <div className="w-full">
      {multiple ? (
        <div className="mb-2 flex justify-end px-4">
          <ExportAllButton
            onClick={handleExportAll}
            loading={capturingAll || isExportingAll}
          />
        </div>
      ) : null}
      <div className="flex w-full justify-start">
        <div
          ref={allRef}
          className={`w-full px-4 py-2 ${layoutClass} ${
            grid ? "md:max-w-[92%]" : "md:max-w-[80%]"
          }`}
        >
          {collection.charts.map((model, index) => {
            const hero = dashboard && index === 0;
            const supportingRows =
              collection.charts.length - (dashboard ? 1 : 0);
            const fullWidth =
              grid &&
              (hero ||
                (supportingRows % 2 === 1 &&
                  index === collection.charts.length - 1));
            return (
              <div
                key={`${model.title}-${index}`}
                className={fullWidth ? "md:col-span-2" : undefined}
              >
                <ChartBlock
                  model={model}
                  hero={hero}
                  hideDownload={capturingAll}
                />
              </div>
            );
          })}
          {collection.caption ? (
            <span
              className={`flex flex-col gap-y-1 ${grid ? "md:col-span-2" : ""}`}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(renderMarkdown(collection.caption)),
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChartBlock({ model, hero = false, hideDownload = false }) {
  const theme = useThemeContext();
  const isLight = theme?.isLight ?? false;
  const [getDivJpeg, { ref, isLoading }] = useGenerateImage({
    quality: 1,
    type: "image/jpeg",
    options: {
      backgroundColor: isLight ? "#ffffff" : "#0e0f0f",
      padding: 20,
      scale: 2,
    },
  });

  const handleDownload = useCallback(async () => {
    const jpeg = await getDivJpeg();
    if (jpeg) saveAs(jpeg, `chart-${v4().split("-")[0]}.jpg`);
  }, [getDivJpeg]);

  return (
    <div className="relative w-full">
      {hideDownload ? null : (
        <DownloadGraph onClick={handleDownload} loading={isLoading} />
      )}
      <div ref={ref}>
        <ChartCard model={model} hero={hero} />
      </div>
    </div>
  );
}

function DownloadGraph({ onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label="Download chart image"
      className="absolute right-2 top-2 z-20 rounded-md p-1.5 text-theme-text-secondary transition-colors hover:bg-theme-bg-secondary hover:text-theme-text-primary disabled:opacity-60"
    >
      {loading ? (
        <CircleNotch
          className="h-4 w-4 animate-spin"
          aria-label="Downloading image..."
        />
      ) : (
        <DownloadSimple className="h-4 w-4" weight="bold" />
      )}
    </button>
  );
}

function ExportAllButton({ onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-md border border-theme-modal-border bg-theme-bg-primary px-2.5 py-1 text-[11px] font-medium text-theme-text-secondary transition-colors hover:bg-theme-bg-secondary hover:text-theme-text-primary disabled:opacity-60"
    >
      {loading ? (
        <CircleNotch className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <DownloadSimple className="h-3.5 w-3.5" weight="bold" />
      )}
      Download all
    </button>
  );
}

export default memo(Chartable);
