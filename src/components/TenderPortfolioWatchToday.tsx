import { AlertCircle, ChevronRight, Eye, Loader2 } from "lucide-react";
import {
  buildTopTags,
  formatScadenzaCountdown,
} from "../lib/watchTodayFilter";
import { RankingMotivazione } from "./RankingMotivazione";
import { ScoreSinteticoBadge } from "./ScoreSinteticoBadge";
import type { Gara } from "../types/gara";

type TenderPortfolioWatchTodayProps = {
  gare: Gara[];
  loading: boolean;
  onSelectTender?: (listId: string) => void;
  className?: string;
};

export function TenderPortfolioWatchToday({
  gare,
  loading,
  onSelectTender,
  className = "",
}: TenderPortfolioWatchTodayProps) {
  if (loading && gare.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 flex items-center justify-center gap-2 text-[11px] text-slate-500 ${className}`}
      >
        <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
        Caricamento gare prioritarie…
      </div>
    );
  }

  if (gare.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 p-8 text-center ${className}`}
        id="portfolio-watch-today-empty"
      >
        <Eye className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-400">Nessuna gara prioritaria oggi</p>
        <p className="text-[11px] text-slate-600 mt-2 max-w-sm mx-auto leading-relaxed">
          Le gare compaiono qui con fit ≥ 75, urgenza entro 7 giorni (o score ≥ 80) e senza
          esito NO-GO.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-brand-gold/25 bg-neutral-950/80 p-4 ${className}`}
      id="portfolio-watch-today-list"
    >
      <ul className="space-y-2 max-h-[360px] overflow-y-auto scrollbar-thin">
        {gare.map((gara) => (
          <WatchTodayCard key={`${gara.source}-${gara.id}`} gara={gara} onSelect={onSelectTender} />
        ))}
      </ul>
    </div>
  );
}

function WatchTodayCard({
  gara,
  onSelect,
}: {
  gara: Gara;
  onSelect?: (listId: string) => void;
}) {
  const tags = buildTopTags(gara, 2);
  const countdown = formatScadenzaCountdown(gara.scadenza);
  const isUrgent = gara.urgency_score >= 70;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-white leading-snug line-clamp-2 group-hover:text-brand-gold">
            {gara.titolo}
          </p>
          <p className="text-[10px] text-slate-500 mt-1 truncate">
            {gara.ente ?? "Ente non indicato"}
          </p>
        </div>
        <ScoreSinteticoBadge score={gara.score_sintetico} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
            isUrgent
              ? "text-amber-300 border-amber-900/50 bg-amber-950/40"
              : "text-slate-400 border-neutral-800 bg-black/40"
          }`}
        >
          {isUrgent && <AlertCircle className="w-3 h-3 shrink-0" />}
          {countdown}
        </span>
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400 border border-neutral-800 rounded px-1.5 py-0.5"
          >
            {tag.label}
          </span>
        ))}
      </div>

      <RankingMotivazione gara={gara} />

      {onSelect && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </>
  );

  if (onSelect && gara.listId) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onSelect(gara.listId!)}
          className="cursor-pointer group relative w-full text-left rounded-xl border border-neutral-800 hover:border-brand-gold/50 bg-black/50 px-3 py-3 transition-colors"
        >
          {inner}
        </button>
      </li>
    );
  }

  return (
    <li className="relative rounded-xl border border-neutral-800 bg-black/50 px-3 py-3">
      {inner}
    </li>
  );
}
