import { AlertTriangle, CheckCircle2, Clock, Coins, Loader2, Percent, RefreshCw, TrendingUp, XCircle } from "lucide-react";
import { useGaraRoi } from "../hooks/useGaraRoi";
import { roiTier } from "../lib/garaRoiApi";
import { formatEuro } from "../lib/tenderValue";
import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";

type GaraRoiCalculatorProps = {
  tender: TenderDocument;
  profilo: ProfiloImpresaContext | null;
  className?: string;
  sidebar?: boolean;
};

function VerdettoBadge({ verdetto, label, className }: { verdetto: string; label: string; className: string }) {
  const Icon =
    verdetto === "vale_la_pena"
      ? CheckCircle2
      : verdetto === "valuta_con_cautela"
        ? AlertTriangle
        : XCircle;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${
        verdetto === "vale_la_pena"
          ? "border-emerald-500/40 bg-emerald-950/40"
          : verdetto === "valuta_con_cautela"
            ? "border-amber-500/40 bg-amber-950/40"
            : "border-red-500/40 bg-red-950/40"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${className}`} />
      <span className={`text-sm font-extrabold ${className}`}>{label}</span>
    </div>
  );
}

export function GaraRoiCalculator({
  tender,
  profilo,
  className = "",
  sidebar = false,
}: GaraRoiCalculatorProps) {
  const { result, loading, error, refresh, isGaraValid } = useGaraRoi(tender, profilo);

  if (!isGaraValid) return null;

  const tier = result ? roiTier(result.roiPartecipazionePercent ?? result.roiPercent) : null;

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
          Stima margine, costi e probabilità…
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
          {/* VERDETTO */}
          {tier && (
            <VerdettoBadge
              verdetto={result.verdetto ?? tier.verdetto}
              label={tier.label}
              className={tier.className}
            />
          )}

          {/* ROI principale */}
          <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-2">
            <p className="text-[9px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
              <Coins className="w-3 h-3" />
              ROI partecipazione
            </p>
            <p className={`text-2xl font-extrabold ${tier?.className ?? "text-white"}`}>
              {result.roiPartecipazionePercent != null
                ? `${result.roiPartecipazionePercent}%`
                : "N/D"}
            </p>
            <p className="text-[8px] text-slate-600 font-mono mt-0.5">
              (Valore atteso − costi) / costi
            </p>
          </div>

          {/* GRIGLIA METRICHE */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-neutral-800 bg-black/60 px-2 py-1.5">
              <p className="text-[8px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                Ore preparazione
              </p>
              <p className="text-base font-extrabold text-white">
                {result.estimatedParticipationHours ?? Math.round(result.orePreparazioneStimate)} h
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black/60 px-2 py-1.5">
              <p className="text-[8px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Coins className="w-2.5 h-2.5" />
                Tariffa oraria
              </p>
              <p className="text-base font-extrabold text-white">
                {formatEuro(result.internalHourlyCostEuro ?? result.tariffaOrariaEuro)}/h
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black/60 px-2 py-1.5">
              <p className="text-[8px] text-slate-500 uppercase tracking-wide">
                Costo interno
              </p>
              <p className="text-base font-extrabold text-amber-300">
                {formatEuro(result.participationInternalCostEuro ?? result.costiPartecipazioneEuro)}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black/60 px-2 py-1.5">
              <p className="text-[8px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Percent className="w-2.5 h-2.5" />
                Prob. vittoria
              </p>
              <p className="text-base font-extrabold text-white">
                {result.probabilitaVittoriaPercent}%
              </p>
            </div>
          </div>

          {/* DETTAGLIO ECONOMICO */}
          <dl className="text-[9px] text-slate-500 space-y-1 border-t border-neutral-800 pt-2">
            <div className="flex justify-between gap-2">
              <dt>Costi totali partecipazione</dt>
              <dd className="text-slate-300 font-mono">
                {formatEuro(result.costiPartecipazioneEuro)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Margine atteso se vinci</dt>
              <dd className="text-emerald-400 font-mono font-bold">
                {formatEuro(result.expectedMarginIfWonEuro ?? result.profittoAttesoEuro)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Valore atteso (EV)</dt>
              <dd className="text-slate-300 font-mono">
                {formatEuro(result.expectedValueEuro ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Margine % stimato</dt>
              <dd className="text-slate-300 font-mono">{result.marginePercentStimato}%</dd>
            </div>
          </dl>

          {/* MOTIVAZIONE LEGGIBILE */}
          {result.motivazioneLeggibile && (
            <p className="text-[9px] text-slate-400 leading-relaxed border-t border-neutral-800 pt-2">
              {result.motivazioneLeggibile}
            </p>
          )}

          <p className="text-[8px] text-slate-700 font-mono leading-snug" title={result.formulaSintesi}>
            ⚠ Stima operativa, non una certezza. Dati da profilo impresa e bando.
          </p>
        </>
      )}
    </section>
  );
}
