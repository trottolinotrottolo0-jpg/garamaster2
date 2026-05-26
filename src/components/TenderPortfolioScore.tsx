import { RefreshCw, Target } from "lucide-react";
import { usePortfolioScore } from "../hooks/usePortfolioScore";
import { getPortfolioScoreTier } from "../lib/portfolioScoreApi";
import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";

type TenderPortfolioScoreProps = {
  userId?: string;
  profilo: ProfiloImpresaContext | null;
  tenders: TenderDocument[];
  compact?: boolean;
  className?: string;
};

export function TenderPortfolioScore({
  userId,
  profilo,
  tenders,
  compact = false,
  className = "",
}: TenderPortfolioScoreProps) {
  const { result, loading, error, refresh } = usePortfolioScore(
    userId,
    profilo,
    tenders,
    Boolean(userId && tenders.length > 0)
  );

  if (!userId || tenders.length === 0) {
    return null;
  }

  if (loading && !result) {
    return (
      <div
        className={`rounded-xl border border-neutral-800 bg-neutral-900/80 p-3 flex items-center gap-2 text-[11px] text-slate-400 ${className}`}
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-gold shrink-0" />
        Calcolo Tender Portfolio Score…
      </div>
    );
  }

  if (error && !result) {
    return (
      <div
        className={`rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-[11px] text-red-300 ${className}`}
      >
        <p className="font-semibold">Portfolio score non disponibile</p>
        <p className="mt-1 text-red-400/90">{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="cursor-pointer mt-2 text-[10px] font-bold text-brand-gold hover:underline"
        >
          Riprova
        </button>
      </div>
    );
  }

  if (!result) return null;

  const tier = getPortfolioScoreTier(result.score);

  if (compact) {
    return (
      <div
        className={`rounded-xl border p-3 ${tier.className} ${className}`}
        title={result.sintesi}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-4 h-4 shrink-0 opacity-80" />
            <div className="min-w-0">
              <p className="text-[9px] font-extrabold uppercase tracking-wider opacity-80">
                Portfolio Score
              </p>
              <p className="text-lg font-extrabold leading-none">{result.score}</p>
            </div>
          </div>
          <span className="text-[10px] font-bold whitespace-nowrap shrink-0">
            {tier.emoji} {tier.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 ${tier.className} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Tender Portfolio Score
          </p>
          <p className="text-4xl font-extrabold mt-1 tabular-nums">{result.score}</p>
          <p className="text-xs mt-0.5 opacity-90">su 100</p>
        </div>
        <div className="text-right shrink-0">
          <span className="inline-block text-sm font-bold px-2.5 py-1 rounded-full border border-current/30">
            {tier.emoji} {tier.label}
          </span>
          <p className="text-[10px] mt-2 opacity-75">Confidenza: {result.confidenza}</p>
        </div>
      </div>

      <p className="text-xs mt-3 leading-relaxed opacity-95">{result.sintesi}</p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        <Factor label="SOA vs gare" value={result.fattori.soa} />
        <Factor label="Regioni" value={result.fattori.regioni} />
        <Factor label="Importi" value={result.fattori.importi} />
        <Factor label="Storico" value={result.fattori.storico} />
      </div>

      <div className="mt-4 pt-3 border-t border-current/20 space-y-2 text-[11px]">
        <ExplainRow icon="✅" title="Perché" value={result.perche} />
        <ExplainRow icon="📊" title="Dati usati" value={result.datiUsati} />
        <ExplainRow icon="⚠️" title="Verifica" value={result.verifica} />
      </div>

      <button
        type="button"
        onClick={() => refresh()}
        disabled={loading}
        className="cursor-pointer mt-3 flex items-center gap-1.5 text-[10px] font-bold opacity-80 hover:opacity-100 disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        Aggiorna score
      </button>
    </div>
  );
}

function Factor({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/25 border border-current/15 px-2.5 py-2">
      <p className="font-bold uppercase text-[9px] opacity-70">{label}</p>
      <p className="mt-0.5 leading-snug">{value}</p>
    </div>
  );
}

function ExplainRow({ icon, title, value }: { icon: string; title: string; value: string }) {
  if (!value) return null;
  return (
    <p>
      <span className="font-bold">
        {icon} {title}:
      </span>{" "}
      {value}
    </p>
  );
}
