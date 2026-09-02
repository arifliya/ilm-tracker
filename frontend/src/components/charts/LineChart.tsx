import React, { useState } from "react";

export interface LineChartPoint {
  x: string; // date, "YYYY-MM-DD"
  y: number | null; // null renders as a gap in the line
}

interface LineChartProps {
  title: string;
  emptyMessage?: string;
  points: LineChartPoint[];
  width?: number;
  height?: number;
  yFormat?: (y: number) => string;
  xFormat?: (x: string) => string;
}

const HUE = "#2a78d6";
const GRID = "#e2e8f0";
const TEXT_SECONDARY = "#64748b";
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

const defaultYFormat = (y: number) => `${Math.round(y * 100)}%`;
const defaultXFormat = (x: string) => x.slice(5); // "MM-DD"

const LineChart: React.FC<LineChartProps> = ({
  title,
  emptyMessage = "No data yet.",
  points,
  width = 600,
  height = 220,
  yFormat = defaultYFormat,
  xFormat = defaultXFormat
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div>
        <h4 style={{ marginBottom: 8 }}>{title}</h4>
        <p style={{ color: TEXT_SECONDARY, fontSize: 14 }}>{emptyMessage}</p>
      </div>
    );
  }

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const values = points.map(p => p.y).filter((y): y is number => y !== null);
  const maxY = values.length > 0 ? Math.max(...values, 0.0001) : 1;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].filter(t => t <= Math.max(maxY, 0.25) + 0.01);

  const xFor = (i: number) => (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yFor = (y: number) => plotH - (y / (yTicks[yTicks.length - 1] || 1)) * plotH;

  // Break the line into segments at null points so gaps render as gaps, not a drop to zero.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  points.forEach((p, i) => {
    if (p.y === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ x: xFor(i), y: yFor(p.y) });
    }
  });
  if (current.length > 0) segments.push(current);

  // Show at most ~6 x-axis labels to avoid crowding.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  const hover = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>{title}</h4>
      <svg
        role="img"
        aria-label={title}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: width, overflow: "visible" }}
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {yTicks.map(t => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={yFor(t)} y2={yFor(t)} stroke={GRID} strokeWidth={1} />
              <text x={-8} y={yFor(t)} dy={4} textAnchor="end" fontSize={11} fill={TEXT_SECONDARY}>
                {yFormat(t)}
              </text>
            </g>
          ))}

          {segments.map((seg, si) => (
            <path
              key={si}
              d={seg.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ")}
              fill="none"
              stroke={HUE}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {points.map((p, i) =>
            p.y === null ? null : (
              <circle
                key={i}
                cx={xFor(i)}
                cy={yFor(p.y)}
                r={hoverIdx === i ? 5 : 4}
                fill={HUE}
                stroke="#fff"
                strokeWidth={2}
              />
            )
          )}

          {/* Wide, invisible hit targets — bigger than the visible marker, per hover-layer guidance */}
          {points.map((p, i) => (
            <rect
              key={`hit-${i}`}
              x={xFor(i) - plotW / points.length / 2}
              y={0}
              width={Math.max(plotW / points.length, 8)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          ))}

          {points.map((p, i) =>
            i % labelStep === 0 ? (
              <text key={i} x={xFor(i)} y={plotH + 18} textAnchor="middle" fontSize={11} fill={TEXT_SECONDARY}>
                {xFormat(p.x)}
              </text>
            ) : null
          )}

          {hover && hover.y !== null && (
            <g transform={`translate(${xFor(hoverIdx!)},${yFor(hover.y)})`}>
              <rect x={-38} y={-34} width={76} height={22} rx={4} fill="#0f172a" />
              <text x={0} y={-19} textAnchor="middle" fontSize={11} fill="#fff">
                {xFormat(hover.x)}: {yFormat(hover.y)}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};

export default LineChart;
