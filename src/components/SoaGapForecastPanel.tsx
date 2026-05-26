import { RefreshCw, Target, TrendingUp, Wallet, Unlock } from "lucide-react";
import { useSoaGapForecast } from "../hooks/useSoaGapForecast";
import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";

type SoaGapForecastPanelProps = {
  userId?: string;
  profilo: ProfiloImpresaContext | null;
  tenders: TenderDocument[];
  compact?: boolean;
  className?: string;
};

function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SoaGapForecastPanel({
  userId,
  profilo,
  tenders,
  compact = false,
  className = "",
}: SoaGapForecastPanelProps) {
  const { result, loading, error, refresh } = useSoaGapForecast(
    userId,
    profilo,
    tenders,
    Boolean(userId),
    !compact
  );

  if (!userId) {
    return (
      <p className={`text-sm text-slate-500 italic ${className}`}>
        Accedi per il forecast gap SOA.
      </p>
    );
  }

  if (!profilo?.soa?.trim()) {
    return (
      <section
        className={`rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 ${className}`}
        id="soa-gap-forecast-panel"
      >
        <p className="text-sm text-amber-200/90">
          Compila le <strong className="text-white">qualificazioni SOA</strong> nel profilo impresa per
          attivare il forecast sulle gare dell&apos;area.
        </p>
      </section>
    );
  }

  if (loading && !result) {
    return (
      <section
        className={`rounded-2xl border border-neutral-800 bg-neutral-950 p-4 flex items-center gap-2 text-sm text-slate-400 ${className}`}
        id="soa-gap-forecast-panel"
      >
        <RefreshCw className="w-4 h-4 animate-spin text-brand-gold shrink-0" />
        Analisi SOA Gap Forecasting (Gemini)…
      </section>
    );
  }

  if (error && !result) {
    return (
      <section
        className={`rounded-2xl border border-red-900/50 bg-red-950/30 p-4 space-y-2 ${className}`}
        id="soa-gap-forecast-panel"
      >
        <p className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => void refresh(true)}
          className="cursor-pointer text-xs font-bold text-brand-gold hover:underline"
        >
          Riprova analisi
        </button>
      </section>
    );
  }

  if (compact && !result) {
    return (
      <section
        className={`rounded-xl border border-neutral-800 bg-neutral-950 p-3 ${className}`}
        id="soa-gap-forecast-panel"
      >
        <p className="text-[11px] font-bold text-brand-gold flex items-center gap-1.5 mb-2">
          <Target className="w-3.5 h-3.5" />
          SOA Gap Forecast
        </p>
        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={loading}
          className="cursor-pointer text-[10px] font-bold text-slate-300 border border-neutral-700 rounded-lg px-3 py-1.5 hover:border-brand-gold hover:text-white disabled:opacity-50"
        >
          {loading ? "Calcolo in corso…" : "Calcola gap SOA area"}
        </button>
      </section>
    );
  }

  if (!result) return null;

  if (compact) {
    return (
      <section
        className={`rounded-xl border border-brand-gold/30 bg-neutral-950 p-3 space-y-2 ${className}`}
        id="soa-gap-forecast-panel"
      >
        <p className="text-[11px] font-bold text-brand-gold flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" />
          SOA Gap Forecast
        </p>
        <p className="text-[11px] text-slate-300 leading-snug line-clamp-3">{result.messaggioPrincipale}</p>
        <p className="text-[10px] text-slate-500">
          ROI stimato {result.roiStimatoPercent}% · {result.gareSbloccate} gare sbloccate
        </p>
      </section>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-4 ${className}`}
      id="soa-gap-forecast-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-gold" />
            SOA Gap Forecasting
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            Area: {result.regioneAnalisi} · {result.gareAnacAnalizzate} gare ANAC ·{" "}
            {result.garePerseOSaltateSoa} perdite/salti SOA nello storico
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={loading}
          className="cursor-pointer p-1.5 text-slate-500 hover:text-brand-gold"
          title="Ricalcola forecast"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="rounded-xl border border-brand-gold/25 bg-brand-gold/5 p-4">
        <p className="text-sm text-white leading-relaxed font-medium">{result.messaggioPrincipale}</p>
      </div>

      {result.soaMancanti.length > 0 && (
        <ul className="space-y-2">
          {result.soaMancanti.map((s, i) => (
            <li
              key={`${s.categoria}-${s.classifica}-${i}`}
              className="flex items-start justify-between gap-2 rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-xs"
            >
              <div>
                <span className="font-mono font-bold text-brand-gold">
                  {s.categoria} Classifica {s.classifica}
                </span>
                {s.priorita && (
                  <span className="ml-2 text-[9px] uppercase text-slate-500">{s.priorita}</span>
                )}
                {s.motivazione && (
                  <p className="text-slate-400 mt-1 text-[11px] leading-snug">{s.motivazione}</p>
                )}
              </div>
              {s.frequenzaGareStimate != null && s.frequenzaGareStimate > 0 && (
                <span className="text-[10px] text-slate-500 shrink-0">
                  ~{s.frequenzaGareStimate} gare
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-black/50 p-3">
          <p className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
            <Wallet className="w-3 h-3" />
            Costo stimato ottenimento
          </p>
          <p className="text-lg font-extrabold text-white mt-1">
            {formatEuro(result.costoStimatoOttenimentoEuro)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-black/50 p-3">
          <p className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
            <Unlock className="w-3 h-3" />
            Gare sbloccate
          </p>
          <p className="text-lg font-extrabold text-emerald-400 mt-1">{result.gareSbloccate}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-black/50 p-3">
          <p className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            ROI stimato
          </p>
          <p className="text-lg font-extrabold text-brand-gold mt-1">{result.roiStimatoPercent}%</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-neutral-800 pt-3">
        {result.sintesi}
      </p>

      <p className="text-[9px] text-slate-600 italic">
        Stima indicativa da Gemini ({result.model}) — verificare con consulente SOA e visure
        certificate.
      </p>
    </section>
  );
}
