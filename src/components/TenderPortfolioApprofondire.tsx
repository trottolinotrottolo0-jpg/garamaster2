import { ChevronRight, Loader2, Search } from "lucide-react";
import {
  SCORE_APPROFONDIRE_MAX,
  SCORE_APPROFONDIRE_MIN,
  type GaraApprofondireCandidate,
} from "../lib/approfondireFilter";
import { RankingMotivazione } from "./RankingMotivazione";
import { ScoreSinteticoBadge } from "./ScoreSinteticoBadge";

type TenderPortfolioApprofondireProps = {
  candidates: GaraApprofondireCandidate[];
  loading: boolean;
  onApprofondisci?: (listId: string) => void;
  className?: string;
};

export function TenderPortfolioApprofondire({
  candidates,
  loading,
  onApprofondisci,
  className = "",
}: TenderPortfolioApprofondireProps) {
  if (loading && candidates.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 flex items-center justify-center gap-2 text-[11px] text-slate-500 ${className}`}
      >
        <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
        Analisi gare da approfondire…
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 p-8 text-center ${className}`}
        id="portfolio-approfondire-empty"
      >
        <Search className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-400">Nessuna gara in fascia intermedia</p>
        <p className="text-[11px] text-slate-600 mt-2 max-w-sm mx-auto leading-relaxed">
          Qui compaiono le gare con score sintetico tra {SCORE_APPROFONDIRE_MIN} e{" "}
          {SCORE_APPROFONDIRE_MAX}: né prioritarie né da scartare.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-sky-900/30 bg-sky-950/10 p-4 ${className}`}
      id="portfolio-approfondire-list"
    >
      <ul className="space-y-2 max-h-[360px] overflow-y-auto scrollbar-thin">
        {candidates.map(({ gara, blockingFactor, suggestedAction }) => (
          <ApprofondireCard
            key={`${gara.source}-${gara.id}`}
            gara={gara}
            blockingLabel={blockingFactor.label}
            suggestedAction={suggestedAction}
            onApprofondisci={onApprofondisci}
          />
        ))}
      </ul>
    </div>
  );
}

function ApprofondireCard({
  gara,
  blockingLabel,
  suggestedAction,
  onApprofondisci,
}: {
  gara: GaraApprofondireCandidate["gara"];
  blockingLabel: string;
  suggestedAction: string;
  onApprofondisci?: (listId: string) => void;
}) {
  return (
    <li className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-3">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <ScoreSinteticoBadge score={gara.score_sintetico} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white leading-snug line-clamp-2">
                {gara.titolo}
              </p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                CIG {gara.cig}
                {gara.ente ? ` · ${gara.ente}` : ""}
              </p>
            </div>
          </div>

          <p className="mt-2 text-[10px] text-amber-200/90 leading-snug">
            <span className="font-extrabold uppercase text-[9px] text-amber-500/80 tracking-wide">
              Fattore limitante ·{" "}
            </span>
            {blockingLabel}
          </p>

          <p className="mt-1.5 text-[10px] text-sky-300/90">
            <span className="font-bold text-sky-400/80">Azione suggerita: </span>
            {suggestedAction}
          </p>

          <RankingMotivazione gara={gara} />
        </div>

        {onApprofondisci && gara.listId && (
          <button
            type="button"
            onClick={() => onApprofondisci(gara.listId!)}
            className="cursor-pointer shrink-0 flex items-center justify-center gap-1.5 rounded-lg border border-brand-gold/50 bg-brand-gold/10 px-3 py-2 text-[10px] font-extrabold text-brand-gold hover:bg-brand-gold/20 transition-colors"
          >
            Approfondisci
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
