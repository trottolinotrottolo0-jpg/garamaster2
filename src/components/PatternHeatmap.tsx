import React from "react";
import type { HeatmapPoint } from "../lib/winningPatternEngine";

interface PatternHeatmapProps {
  heatmapData: HeatmapPoint[];
  selectedClusterId?: string;
  onSelectCluster?: (clusterId: string) => void;
}

export function PatternHeatmap({
  heatmapData,
  selectedClusterId,
  onSelectCluster,
}: PatternHeatmapProps) {
  if (heatmapData.length === 0) {
    return (
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 h-64 flex items-center justify-center">
        <p className="text-slate-400 text-[10px]">Nessun dato per heatmap</p>
      </div>
    );
  }

  const width = 500;
  const height = 300;
  const padding = 40;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const xMin = 0;
  const xMax = Math.max(...heatmapData.map((p) => p.x), 1) + 1;
  const yMin = 0;
  const yMax = Math.max(...heatmapData.map((p) => p.y), 1) + 2;

  const mapX = (value: number) =>
    padding + ((value - xMin) / Math.max(xMax - xMin, 0.01)) * plotWidth;
  const mapY = (value: number) =>
    height - padding - ((value - yMin) / Math.max(yMax - yMin, 0.01)) * plotHeight;

  const idealRibasso = Math.min(...heatmapData.map((p) => p.x));
  const idealMargine = Math.max(...heatmapData.map((p) => p.y));

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 overflow-x-auto">
      <h3 className="text-[9px] font-bold text-brand-gold uppercase mb-3">
        Heatmap Ribasso vs Margine
      </h3>

      <svg
        width={width}
        height={height}
        className="bg-neutral-900 rounded border border-neutral-700 min-w-[280px]"
        role="img"
        aria-label="Heatmap ribasso versus margine"
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <React.Fragment key={`grid-${ratio}`}>
            <line
              x1={padding + plotWidth * ratio}
              y1={padding}
              x2={padding + plotWidth * ratio}
              y2={height - padding}
              stroke="#374151"
              strokeDasharray="2,2"
              opacity="0.5"
            />
            <line
              x1={padding}
              y1={padding + plotHeight * ratio}
              x2={width - padding}
              y2={padding + plotHeight * ratio}
              stroke="#374151"
              strokeDasharray="2,2"
              opacity="0.5"
            />
          </React.Fragment>
        ))}

        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#6b7280"
          strokeWidth="2"
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#6b7280"
          strokeWidth="2"
        />

        <text x={width / 2} y={height - 5} textAnchor="middle" className="text-[9px] fill-slate-400">
          Ribasso %
        </text>
        <text
          x={15}
          y={height / 2}
          textAnchor="middle"
          className="text-[9px] fill-slate-400"
          transform={`rotate(-90 15 ${height / 2})`}
        >
          Margine %
        </text>

        <rect
          x={padding}
          y={padding}
          width={Math.max(0, mapX(idealRibasso + 2) - padding)}
          height={Math.max(0, mapY(idealMargine) - padding)}
          fill="#10b981"
          opacity="0.05"
        />
        <text
          x={padding + 5}
          y={padding + 12}
          className="text-[8px] fill-emerald-600/50"
          fontWeight="bold"
        >
          IDEALE
        </text>

        {heatmapData.map((point) => {
          const px = mapX(point.x);
          const py = mapY(point.y);
          const isSelected = selectedClusterId === point.clusterId;
          const radius = isSelected ? 8 : 6;

          return (
            <g
              key={point.clusterId}
              onClick={() => onSelectCluster?.(point.clusterId)}
              style={{ cursor: onSelectCluster ? "pointer" : "default" }}
            >
              {isSelected && (
                <circle cx={px} cy={py} r={radius + 3} fill={point.colore} opacity="0.2" />
              )}
              <circle
                cx={px}
                cy={py}
                r={radius}
                fill={point.colore}
                opacity={isSelected ? 1 : 0.7}
                stroke={isSelected ? "#fff" : "none"}
                strokeWidth="2"
              />
              <title>
                {point.clusterNome} • {point.numeroGare} gare • Ribasso {point.x.toFixed(1)}% •
                Margine {point.y.toFixed(1)}%
              </title>
            </g>
          );
        })}

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const val = xMin + (xMax - xMin) * ratio;
          const x = padding + ratio * plotWidth;
          return (
            <g key={`x-tick-${ratio}`}>
              <line
                x1={x}
                y1={height - padding + 3}
                x2={x}
                y2={height - padding - 3}
                stroke="#6b7280"
              />
              <text
                x={x}
                y={height - padding + 15}
                textAnchor="middle"
                className="text-[8px] fill-slate-500"
              >
                {val.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const val = yMin + (yMax - yMin) * ratio;
          const y = height - padding - ratio * plotHeight;
          return (
            <g key={`y-tick-${ratio}`}>
              <line x1={padding - 3} y1={y} x2={padding + 3} y2={y} stroke="#6b7280" />
              <text
                x={padding - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[8px] fill-slate-500"
              >
                {val.toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px]">
        {heatmapData.map((point) => (
          <div key={point.clusterId} className="flex items-center gap-2 min-w-0">
            <div
              className="w-3 h-3 rounded shrink-0"
              style={{ backgroundColor: point.colore }}
            />
            <span className="text-slate-400 truncate">{point.clusterNome}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
