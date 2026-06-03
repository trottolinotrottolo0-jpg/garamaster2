import { useState } from "react";
import { Loader2, Trash2, Undo2 } from "lucide-react";
import type { GaraDiscardCandidate } from "../lib/discardFilter";
import { RankingMotivazione } from "./RankingMotivazione";
import { ScoreSinteticoBadge } from "./ScoreSinteticoBadge";
import type { Gara } from "../types/gara";

type TenderPortfolioDiscardProps = {
  candidates: GaraDiscardCandidate[];
  scartate: Gara[];
  loading: boolean;
  showScartate: boolean;
  onToggleShowScartate: () => void;
  onConfirmScarto: (gara: Gara) => Promise<void>;
  onRestore: (gara: Gara) => Promise<void>;
  onSelectTender?: (listId: string) => void;
  className?: string;
};

export function TenderPortfolioDiscard({
  candidates,
  scartate,
  loading,
  showScartate,
  onToggleShowScartate,
  onConfirmScarto,
  onRestore,
  onSelectTender,
  className = "",
}: TenderPortfolioDiscardProps) {
  if (loading && candidates.length === 0 && scartate.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 flex items-center justify-center gap-2 text-[11px] text-slate-500 ${className}`}
      >
        <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
        Analisi gare da scartare…
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`} id="portfolio-discard-view">
      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 p-6 text-center">
          <p className="text-sm font-bold text-slate-400">Nessuna gara da scartare al momento</p>
          <p className="text-[11px] text-slate-600 mt-2">
            Compaiono qui se score, fit, rischio, NO-GO o gap SOA superano le soglie.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-red-900/30 bg-red-950/10 p-4">
          <ul className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-thin">
            {candidates.map(({ gara, primaryReason }) => (
              <DiscardCard
                key={`${gara.source}-${gara.id}`}
                gara={gara}
                primaryReason={primaryReason}
                onConfirm={() => onConfirmScarto(gara)}
                onSelect={onSelectTender}
              />
            ))}
          </ul>
        </div>
      )}

      {scartate.length > 0 && (
        <div className="border-t border-neutral-800 pt-3">
          <button
            type="button"
            onClick={onToggleShowScartate}
            className="cursor-pointer text-[10px] font-bold text-slate-500 hover:text-brand-gold"
          >
            {showScartate ? "Nascondi" : "Mostra"} gare scartate ({scartate.length})
          </button>

          {showScartate && (
            <ul className="mt-3 space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
              {scartate.map((gara) => (
                <li
                  key={`scartata-${gara.source}-${gara.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-black/40 px-3 py-2"
                >
                  <span className="text-[11px] text-slate-400 truncate flex-1">{gara.titolo}</span>
                  <button
                    type="button"
                    onClick={() => void onRestore(gara)}
                    className="cursor-pointer shrink-0 flex items-center gap-1 text-[10px] font-bold text-brand-gold hover:underline"
                  >
                    <Undo2 className="w-3 h-3" />
                    Ripristina
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DiscardCard({
  gara,
  primaryReason,
  onConfirm,
  onSelect,
}: {
  gara: Gara;
  primaryReason: string;
  onConfirm: () => Promise<void>;
  onSelect?: (listId: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-red-900/40 bg-black/50 px-3 py-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <ScoreSinteticoBadge score={gara.score_sintetico} />
          </div>
          {onSelect && gara.listId ? (
            <button
              type="button"
              onClick={() => onSelect(gara.listId!)}
              className="cursor-pointer text-left w-full"
            >
              <p className="text-[11px] font-bold text-white hover:text-brand-gold line-clamp-2">
                {gara.titolo}
              </p>
            </button>
          ) : (
            <p className="text-[11px] font-bold text-white line-clamp-2">{gara.titolo}</p>
          )}
          <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
            CIG {gara.cig}
            {gara.ente ? ` · ${gara.ente}` : ""}
          </p>
          <span className="inline-block mt-2 text-[9px] font-extrabold uppercase tracking-wide text-red-300 bg-red-950/60 border border-red-800/60 px-2 py-1 rounded-lg">
            {primaryReason}
          </span>

          <RankingMotivazione gara={gara} />
        </div>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={busy}
          className="cursor-pointer shrink-0 flex items-center justify-center gap-1.5 rounded-lg border border-red-800 bg-red-950/80 px-3 py-2 text-[10px] font-extrabold text-red-200 hover:bg-red-900 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Conferma scarto
        </button>
      </div>
    </li>
  );
}
