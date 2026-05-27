import { AlertTriangle, CheckCircle2, Circle, FileStack } from "lucide-react";
import {
  BUSTA_LABELS,
  computeOfferProgress,
  getMissingOfferAlerts,
  OFFER_DATA_FIELDS,
  type OfferBusta,
  type OfferPreparationState,
} from "../lib/guidedOfferPreparation";

type GuidedOfferPanelProps = {
  state: OfferPreparationState;
  onToggleChecklistItem: (busta: OfferBusta, itemId: string) => void;
  compact?: boolean;
};

export function GuidedOfferPanel({
  state,
  onToggleChecklistItem,
  compact = false,
}: GuidedOfferPanelProps) {
  const progress = computeOfferProgress(state);
  const alerts = getMissingOfferAlerts(state);

  return (
    <aside
      className={`flex flex-col bg-neutral-950 border-neutral-800 overflow-hidden shrink-0 ${
        compact
          ? "w-full border-b rounded-none"
          : "hidden xl:flex w-72 border-l rounded-none h-full"
      }`}
      id="guided-offer-panel"
    >
      <div className="p-3 border-b border-neutral-800 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <FileStack className="w-4 h-4 text-brand-gold shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-gold">
              Preparazione offerta
            </p>
            <p className="text-[9px] text-slate-500 truncate">
              Step: {state.currentStep ?? "avvio"}
            </p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[9px] text-slate-400 mb-1">
            <span>Avanzamento pratica</span>
            <span className="font-bold text-brand-gold">{progress.overallPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-900 overflow-hidden border border-neutral-800">
            <div
              className="h-full bg-gradient-to-r from-brand-gold/80 to-yellow-300 transition-all duration-500"
              style={{ width: `${progress.overallPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-slate-600 mt-1">
            <span>
              Dati {progress.filledDataCount}/{progress.totalDataFields}
            </span>
            <span>
              Doc. {progress.doneChecklistCount}/{progress.totalChecklistCount || "—"}
            </span>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mx-3 mt-2 p-2 rounded-lg border border-amber-900/50 bg-amber-950/30 shrink-0">
          <p className="text-[9px] font-bold text-amber-400 flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Cosa manca
          </p>
          <ul className="text-[9px] text-amber-200/90 space-y-0.5 max-h-20 overflow-y-auto scrollbar-thin">
            {alerts.map((a, i) => (
              <li key={i} className="leading-snug">
                • {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin min-h-0">
        <section>
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
            Dati offerta
          </p>
          <ul className="space-y-1">
            {OFFER_DATA_FIELDS.map((field) => {
              const value = state.collectedData[field.key]?.trim();
              const done = Boolean(value);
              return (
                <li
                  key={field.key}
                  className={`flex items-start gap-1.5 text-[10px] rounded-lg px-2 py-1.5 border ${
                    done
                      ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-200"
                      : "border-neutral-800 bg-neutral-900/50 text-slate-400"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <Circle className="w-3 h-3 shrink-0 text-slate-600 mt-0.5" />
                  )}
                  <span className="min-w-0">
                    <span className="font-semibold block text-white/90">{field.label}</span>
                    {done ? (
                      <span className="text-[9px] line-clamp-2">{value}</span>
                    ) : (
                      <span className="text-[9px] italic text-slate-500">da raccogliere in chat</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {(["amministrativa", "tecnica", "economica"] as OfferBusta[]).map((busta) => {
          const items = state.checklist[busta] ?? [];
          if (!items.length) return null;
          const doneCount = items.filter((i) => i.done).length;
          return (
            <section key={busta}>
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-1 flex justify-between">
                <span>{BUSTA_LABELS[busta]}</span>
                <span className="text-brand-gold font-mono">
                  {doneCount}/{items.length}
                </span>
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onToggleChecklistItem(busta, item.id)}
                      className={`cursor-pointer w-full flex items-start gap-1.5 text-left text-[10px] rounded-lg px-2 py-1.5 border transition-colors ${
                        item.done
                          ? "border-emerald-900/40 bg-emerald-950/15 text-emerald-200"
                          : "border-neutral-800 hover:border-brand-gold/40 text-slate-300"
                      }`}
                    >
                      {item.done ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400 mt-0.5" />
                      ) : (
                        <Circle className="w-3 h-3 shrink-0 text-slate-500 mt-0.5" />
                      )}
                      <span className="min-w-0">
                        <span className="font-medium block leading-snug">{item.label}</span>
                        {item.note && (
                          <span className="text-[8px] text-slate-500 block">{item.note}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
