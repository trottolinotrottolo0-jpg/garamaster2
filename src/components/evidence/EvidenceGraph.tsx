import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { EvidenceGraphEdgeRow, EvidenceItemRow } from "../../types/evidence";
import type { EvidenceItemInput } from "../../types/evidence";
import { documentLabel } from "../../lib/evidence";

type GraphNode = {
  id: string;
  type: string;
  label: string;
  itemId?: string;
};

const NODE_COLORS: Record<string, string> = {
  document: "#38bdf8",
  clause: "#a78bfa",
  rule: "#fb923c",
  company_data: "#4ade80",
  output: "#f87171",
};

type EvidenceGraphProps = {
  items: (EvidenceItemRow | EvidenceItemInput)[];
  edges: EvidenceGraphEdgeRow[];
  fullscreen?: boolean;
  onCloseFullscreen?: () => void;
  height?: number;
};

export function EvidenceGraph({
  items,
  edges,
  fullscreen,
  onCloseFullscreen,
  height = 200,
}: EvidenceGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { nodes, links, width } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const linkList: { from: string; to: string; type: string }[] = [];

    for (const e of edges) {
      const fromId = `${e.from_node}:${e.from_label}`;
      const toId = `${e.to_node}:${e.to_label}`;
      if (!nodeMap.has(fromId)) {
        nodeMap.set(fromId, { id: fromId, type: e.from_node, label: e.from_label });
      }
      if (!nodeMap.has(toId)) {
        nodeMap.set(toId, { id: toId, type: e.to_node, label: e.to_label });
      }
      linkList.push({ from: fromId, to: toId, type: e.edge_type });
    }

    if (nodeMap.size === 0 && items.length > 0) {
      const item = items[0];
      const doc = documentLabel(
        "source_document" in item ? item.source_document : null
      );
      const chain = [
        { type: "document", label: doc },
        { type: "clause", label: item.source_reference ?? "Clausola" },
        { type: "rule", label: item.rule_triggered ?? "Regola" },
        { type: "output", label: (item.conclusion ?? "Output").slice(0, 40) },
      ];
      for (let i = 0; i < chain.length; i++) {
        const id = `${chain[i].type}:${chain[i].label}`;
        nodeMap.set(id, { id, type: chain[i].type, label: chain[i].label });
        if (i > 0) {
          const prev = `${chain[i - 1].type}:${chain[i - 1].label}`;
          linkList.push({ from: prev, to: id, type: "causes" });
        }
      }
    }

    const nodeList = [...nodeMap.values()];
    const w = Math.max(320, nodeList.length * 88);
    return { nodes: nodeList, links: linkList, width: w };
  }, [edges, items]);

  const selected = nodes.find((n) => n.id === selectedId);

  const content = (
    <div className={`${fullscreen ? "p-4" : ""}`}>
      {fullscreen && onCloseFullscreen && (
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs font-bold text-brand-gold uppercase tracking-wider">
            Evidence Graph — catena causa-effetto
          </p>
          <button
            type="button"
            onClick={onCloseFullscreen}
            className="cursor-pointer p-1 rounded hover:bg-neutral-800 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full bg-neutral-950/80 rounded-lg border border-neutral-800"
        style={{ height }}
      >
        {links.map((l, i) => {
          const fromIdx = nodes.findIndex((n) => n.id === l.from);
          const toIdx = nodes.findIndex((n) => n.id === l.to);
          if (fromIdx < 0 || toIdx < 0) return null;
          const x1 = 48 + fromIdx * ((width - 96) / Math.max(1, nodes.length - 1));
          const x2 = 48 + toIdx * ((width - 96) / Math.max(1, nodes.length - 1));
          const y = height / 2;
          const stroke = l.type === "contradicts" ? "#ef4444" : "#64748b";
          return (
            <g key={i}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={2} markerEnd="url(#arrow)" />
              {i === 0 && (
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
                  </marker>
                </defs>
              )}
            </g>
          );
        })}

        {nodes.map((n, i) => {
          const x = 48 + i * ((width - 96) / Math.max(1, nodes.length - 1));
          const y = height / 2;
          const fill = NODE_COLORS[n.type] ?? "#94a3b8";
          const isSel = selectedId === n.id;
          return (
            <g
              key={n.id}
              className="cursor-pointer"
              onClick={() => setSelectedId(isSel ? null : n.id)}
            >
              <circle
                cx={x}
                cy={y}
                r={isSel ? 22 : 18}
                fill={fill}
                fillOpacity={0.25}
                stroke={fill}
                strokeWidth={isSel ? 3 : 2}
              />
              <text
                x={x}
                y={y + height / 2 - 12}
                textAnchor="middle"
                className="fill-slate-300"
                style={{ fontSize: 9 }}
              >
                {n.label.length > 14 ? `${n.label.slice(0, 12)}…` : n.label}
              </text>
              <text
                x={x}
                y={y - 28}
                textAnchor="middle"
                className="fill-slate-500 uppercase"
                style={{ fontSize: 8 }}
              >
                {n.type.replace("_", " ")}
              </text>
            </g>
          );
        })}
      </svg>

      {selected && (
        <div className="mt-2 text-[11px] text-slate-300 rounded-lg border border-neutral-800 bg-neutral-900/80 p-2">
          <span className="text-brand-gold font-bold">{selected.type}: </span>
          {selected.label}
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-950">
          {content}
        </div>
      </div>
    );
  }

  return content;
}
