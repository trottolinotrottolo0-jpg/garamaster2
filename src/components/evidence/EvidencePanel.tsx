import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, GitBranch, HelpCircle } from "lucide-react";
import type { EvidenceGraphEdgeRow, EvidenceItemInput, EvidenceItemRow } from "../../types/evidence";
import { buildReasoningChain, documentLabel } from "../../lib/evidence";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ClauseTooltip } from "./ClauseTooltip";
import { HumanReviewAlert } from "./HumanReviewAlert";
import { EvidenceGraph } from "./EvidenceGraph";

type EvidencePanelProps = {
  title?: string;
  items: (EvidenceItemRow | EvidenceItemInput)[];
  edges?: EvidenceGraphEdgeRow[];
  defaultOpen?: boolean;
  onMarkReviewed?: (evidenceId: string) => void | Promise<void>;
  anchorHrefBuilder?: (reference: string) => string | null;
  compact?: boolean;
};

function itemId(item: EvidenceItemRow | EvidenceItemInput): string | undefined {
  return "id" in item ? item.id : undefined;
}

function itemConfidence(item: EvidenceItemRow | EvidenceItemInput): number {
  return item.confidence_score ?? 85;
}

function itemNeedsReview(item: EvidenceItemRow | EvidenceItemInput): boolean {
  const needs = item.requires_human_review === true;
  if ("human_reviewed" in item && item.human_reviewed) return false;
  return needs || itemConfidence(item) < 70;
}

export function EvidencePanel({
  title = "Perché il sistema ti dice questo",
  items,
  edges = [],
  defaultOpen = false,
  onMarkReviewed,
  anchorHrefBuilder,
  compact,
}: EvidencePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [graphOpen, setGraphOpen] = useState(false);

  if (!items.length) return null;

  const anyReview = items.some(itemNeedsReview);

  return (
    <div className={`${compact ? "mt-2" : "mt-3"} border-t border-neutral-800/80 pt-2`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer flex w-full items-center justify-between gap-2 text-left group"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-gold">
          <HelpCircle className="w-3.5 h-3.5" />
          {title}
        </span>
        <span className="flex items-center gap-2">
          {anyReview && (
            <span className="text-[9px] font-bold text-red-400 uppercase">Verifica</span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-4">
              {items.map((item, idx) => {
                const chain = buildReasoningChain(item);
                const id = itemId(item);
                const ref = item.source_reference;
                const href =
                  ref && anchorHrefBuilder ? anchorHrefBuilder(ref) : null;

                return (
                  <div
                    key={id ?? `ev-${idx}`}
                    className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <ConfidenceBadge
                        score={itemConfidence(item)}
                        requiresReview={itemNeedsReview(item)}
                        compact
                      />
                      {ref && (
                        <ClauseTooltip
                          reference={ref}
                          sourceText={item.source_text}
                          documentLabel={documentLabel(item.source_document)}
                          anchorHref={href}
                        />
                      )}
                    </div>

                    {itemNeedsReview(item) && (
                      <HumanReviewAlert
                        reason={item.review_reason}
                        reviewed={"human_reviewed" in item && item.human_reviewed}
                        onMarkReviewed={
                          id && onMarkReviewed ? () => onMarkReviewed(id) : undefined
                        }
                      />
                    )}

                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 leading-relaxed">
                      {chain.map((step, si) => (
                        <li key={si}>{step}</li>
                      ))}
                    </ol>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setGraphOpen(true)}
                className="cursor-pointer flex items-center gap-1.5 text-[10px] font-bold text-sky-400 hover:text-sky-300"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Apri Evidence Graph (schermo intero)
              </button>

              {(edges.length > 0 || items.length > 0) && !graphOpen && (
                <EvidenceGraph items={items} edges={edges} height={160} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {graphOpen && (
        <EvidenceGraph
          items={items}
          edges={edges}
          fullscreen
          onCloseFullscreen={() => setGraphOpen(false)}
          height={280}
        />
      )}
    </div>
  );
}
