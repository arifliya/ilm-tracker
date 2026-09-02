import React, { useState } from "react";

export interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  title: string;
  emptyMessage?: string;
  data: BarChartDatum[];
  width?: number;
  height?: number;
  valueFormat?: (v: number) => string;
}

const HUE = "#2a78d6";
const GRID = "#e2e8f0";
const TEXT_SECONDARY = "#64748b";
const PAD = { top: 16, right: 16, bottom: 40, left: 32 };
const BAR_MAX_WIDTH = 24;
const BAR_GAP = 2;
const BAR_RADIUS = 4;

const defaultValueFormat = (v: number) => `${v}`;

const BarChart: React.FC<BarChartProps> = ({
  title,
  emptyMessage = "No data yet.",
  data,
  width = 600,
  height = 220,
  valueFormat = defaultValueFormat
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div>
        <h4 style={{ marginBottom: 8 }}>{title}</h4>
        <p style={{ color: TEXT_SECONDARY, fontSize: 14 }}>{emptyMessage}</p>
      </div>
    );
  }

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const slotWidth = plotW / data.length;
  const barWidth = Math.min(BAR_MAX_WIDTH, slotWidth - BAR_GAP * 2);

  const yFor = (v: number) => plotH - (v / maxValue) * plotH;

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
          <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={GRID} strokeWidth={1} />

          {data.map((d, i) => {
            const barHeight = Math.max(plotH - yFor(d.value), d.value > 0 ? 2 : 0);
            const x = i * slotWidth + (slotWidth - barWidth) / 2;
            const y = plotH - barHeight;
            const isHover = hoverIdx === i;

            return (
              <g key={i}>
                {barHeight > 0 && (
                  <path
                    d={`
                      M ${x} ${plotH}
                      L ${x} ${y + BAR_RADIUS}
                      Q ${x} ${y} ${x + BAR_RADIUS} ${y}
                      L ${x + barWidth - BAR_RADIUS} ${y}
                      Q ${x + barWidth} ${y} ${x + barWidth} ${y + BAR_RADIUS}
                      L ${x + barWidth} ${plotH}
                      Z
                    `}
                    fill={HUE}
                    opacity={isHover ? 1 : 0.9}
                  />
                )}
                <rect
                  x={i * slotWidth}
                  y={0}
                  width={slotWidth}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
                <text
                  x={i * slotWidth + slotWidth / 2}
                  y={plotH + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill={TEXT_SECONDARY}
                >
                  {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
                </text>
              </g>
            );
          })}

          {hoverIdx !== null && (
            <g
              transform={`translate(${hoverIdx * slotWidth + slotWidth / 2},${yFor(data[hoverIdx].value) - 10})`}
            >
              <rect x={-40} y={-22} width={80} height={22} rx={4} fill="#0f172a" />
              <text x={0} y={-7} textAnchor="middle" fontSize={11} fill="#fff">
                {data[hoverIdx].label}: {valueFormat(data[hoverIdx].value)}
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};

export default BarChart;
