import { Clock, Coins, Loader2, Percent, RefreshCw, TrendingUp } from "lucide-react";
import { useGaraRoi } from "../hooks/useGaraRoi";
import { roiTier } from "../lib/garaRoiApi";
import { formatEuro } from "../lib/tenderValue";
import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";

type GaraRoiCalculatorProps = {
  tender: TenderDocument;
  profilo: ProfiloImpresaContext | null;
  className?: string;
  /** Solo desktop: in sidebar (default). Su mobile usare senza questa prop sopra la chat */
  sidebar?: boolean;
};

export function GaraRoiCalculator({
  tender,
  profilo,
  className = "",
  sidebar = false,
}: GaraRoiCalculatorProps) {
  const { result, loading, error, refresh, isGaraValid } = useGaraRoi(tender, profilo);

  if (!isGaraValid) return null;

  const tier = result ? roiTier(result.roiPercent) : null;

  return (
    <section
      className={`rounded-xl border border-neutral-800 bg-gradient-to-b from-neutral-950 to-black p-3 space-y-3 ${
        sidebar ? "hidden lg:block" : ""
      } ${className}`}
      id="gara-roi-calculator-widget"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-gold flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          Gara ROI Calculator
        </p>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="cursor-pointer p-1 rounded text-slate-500 hover:text-brand-gold disabled:opacity-40"
          title="Ricalcola ROI"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !result && (
        <div className="flex items-center gap-2 text-[10px] text-slate-500 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-gold" />
          Stima margine, costi e probabilità con Gemini…
        </div>
      )}

      {error && !result && (
        <div className="text-[10px] text-red-300 space-y-1">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="cursor-pointer text-brand-gold font-bold hover:underline"
          >
            Riprova
          </button>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-2">
              <p className="text-[9px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Coins className="w-3 h-3" />
                ROI stimato
              </p>
              <p className={`text-xl font-extrabold ${tier?.className ?? "text-white"}`}>
                {result.roiPercent != null ? `${result.roiPercent}%` : "N/D"}
              </p>
              {tier && (
                <p className={`text-[9px] font-bold ${tier.className}`}>{tier.label}</p>
              )}
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black/60 px-2.5 py-2">
              <p className="text-[9px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Percent className="w-3 h-3" />
                Probabilità vittoria
              </p>
              <p className="text-lg font-extrabold text-white">
                {result.probabilitaVittoriaPercent}%
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black/60 px-2.5 py-2">
              <p className="text-[9px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Ore stimate preparazione
              </p>
              <p className="text-lg font-extrabold text-white">
                {Math.round(result.orePreparazioneStimate)} h
              </p>
            </div>
          </div>

          <dl className="text-[9px] text-slate-500 space-y-1 border-t border-neutral-800 pt-2">
            <div className="flex justify-between gap-2">
              <dt>Margine stimato</dt>
              <dd className="text-slate-300 font-mono">{result.marginePercentStimato}%</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Costi partecipazione</dt>
              <dd className="text-slate-300 font-mono">
                {formatEuro(result.costiPartecipazioneEuro)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Profitto atteso (se vinci)</dt>
              <dd
                className={`font-mono font-bold ${
                  result.profittoAttesoEuro >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {formatEuro(result.profittoAttesoEuro)}
              </dd>
            </div>
          </dl>

          <p className="text-[8px] text-slate-600 font-mono leading-snug" title={result.formulaSintesi}>
            ROI = (Importo × margine% − costi) / costi
          </p>
          <p className="text-[9px] text-slate-500 leading-snug line-clamp-3">
            {result.motivazioneMargine}
          </p>
        </>
      )}
    </section>
  );
}
