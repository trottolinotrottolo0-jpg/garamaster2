import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { BUSTA_LABELS, checklistStatoLabel } from "../lib/tenderPreparationEngine";
import type { TenderBusta, TenderChecklistItemRow, TenderChecklistStato } from "../types/tenderPreparation";

const STATI_CYCLE: TenderChecklistStato[] = [
  "TODO",
  "IN_CORSO",
  "FATTO",
  "NON_APPLICABILE",
];

type TenderChecklistProps = {
  items: TenderChecklistItemRow[];
  busta: TenderBusta;
  onSetStato: (itemId: string, stato: TenderChecklistStato) => void;
};

export function TenderChecklist({ items, busta, onSetStato }: TenderChecklistProps) {
  const filtered = items.filter((i) => i.busta === busta);

  if (!filtered.length) {
    return (
      <p className="text-[11px] text-slate-500 italic py-2">
        Nessuna voce checklist per {BUSTA_LABELS[busta]}.
      </p>
    );
  }

  const done = filtered.filter((i) => i.stato === "FATTO").length;

  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2 flex justify-between">
        <span>Checklist {BUSTA_LABELS[busta]}</span>
        <span className="text-brand-gold font-mono">
          {done}/{filtered.length}
        </span>
      </p>
      <ul className="space-y-1">
        {filtered.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                const idx = STATI_CYCLE.indexOf(item.stato);
                const next = STATI_CYCLE[(idx + 1) % STATI_CYCLE.length];
                onSetStato(item.id, next);
              }}
              className={`cursor-pointer w-full flex items-start gap-2 text-left rounded-lg px-2.5 py-2 border transition-colors ${
                item.stato === "FATTO"
                  ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-200"
                  : item.stato === "IN_CORSO"
                    ? "border-sky-900/40 bg-sky-950/20 text-sky-200"
                    : item.stato === "NON_APPLICABILE"
                      ? "border-neutral-800 bg-neutral-900/30 text-slate-500"
                      : "border-neutral-800 hover:border-brand-gold/40 text-slate-300"
              }`}
            >
              {item.stato === "FATTO" ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
              ) : item.stato === "NON_APPLICABILE" ? (
                <MinusCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
              ) : (
                <Circle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
              )}
              <span className="min-w-0 flex-1">
                <span className="text-[10px] font-medium block leading-snug">{item.titolo}</span>
                <span className="text-[8px] opacity-70">{checklistStatoLabel(item.stato)}</span>
                {item.note && (
                  <span className="text-[8px] text-slate-500 block mt-0.5">{item.note}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
