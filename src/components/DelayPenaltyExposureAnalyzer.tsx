import { useState, useEffect } from "react";
import { X, Loader2, Clock, AlertTriangle, TrendingDown } from "lucide-react";
import type { TenderDocument, DelayPenaltyExposure, DelayRiskClasse } from "../types";
import {
  createDelayPenaltyExposure,
  DELAY_RISK_CLASS,
} from "../lib/delayPenaltyEngine";

interface DelayPenaltyExposureAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  bandoPdfBase64?: string;
  fileName?: string;
  margineStimato?: number;
}

type Tab = "summary" | "timeline" | "mitigation" | "pricing";

const formatEuro = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function DelayPenaltyExposureAnalyzer({
  isOpen,
  onClose,
  tender,
  margineStimato = 100_000,
}: DelayPenaltyExposureAnalyzerProps) {
  const [exposure, setExposure] = useState<DelayPenaltyExposure | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("summary");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const result = createDelayPenaltyExposure(tender, margineStimato);
      setExposure(result);
    } finally {
      setLoading(false);
    }
  }, [isOpen, tender, margineStimato]);

  if (!isOpen) return null;

  const RISK_LABEL: Record<DelayRiskClasse, string> = {
    BASSO: "Rischio Basso",
    MEDIO: "Rischio Medio",
    ALTO: "Rischio Alto",
    CRITICO: "Rischio Critico",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="sticky top-0 bg-black z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-800 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-extrabold tracking-widest uppercase text-white">
              Delay & Penalty Exposure
            </span>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 px-6 shrink-0">
          {(["summary", "timeline", "mitigation", "pricing"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`cursor-pointer text-[10px] font-bold uppercase tracking-wider px-3 py-2.5 border-b-2 transition-colors ${
                activeTab === t ? "border-amber-500 text-amber-400" : "border-transparent text-slate-500 hover:text-white"
              }`}
            >
              {t === "summary" ? "Sintesi" : t === "timeline" ? "Timeline" : t === "mitigation" ? "Mitigazione" : "Pricing"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-amber-400 mx-auto animate-spin" />
              <p className="text-xs text-slate-500 mt-3">Analisi esposizione penali...</p>
            </div>
          )}

          {!loading && exposure && (
            <>
              {activeTab === "summary" && (
                <div className="space-y-4">
                  <div className={`border rounded-xl px-5 py-4 flex items-center justify-between ${DELAY_RISK_CLASS[exposure.riskClasse]}`}>
                    <div>
                      <span className="text-2xl font-extrabold font-mono">{RISK_LABEL[exposure.riskClasse]}</span>
                      <p className="text-[10px] mt-0.5 opacity-70">Livello rischio penali</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold font-mono">{formatEuro(exposure.penalitaAttesa)}</span>
                      <p className="text-[10px] mt-0.5 opacity-70">Penalità attesa</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center">
                      <span className="text-lg font-extrabold text-white font-mono">{exposure.giorniRitardoProbabili}</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">gg ritardo probabile</p>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center">
                      <span className="text-lg font-extrabold text-amber-400 font-mono">{formatEuro(exposure.penalitaWorstCase)}</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">worst case</p>
                    </div>
                    <div className={`border rounded-lg p-3 text-center ${exposure.margineDopoRitardo > 0 ? "bg-emerald-950/20 border-emerald-900/50" : "bg-red-950/20 border-red-900/50"}`}>
                      <span className={`text-lg font-extrabold font-mono ${exposure.margineDopoRitardo > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatEuro(exposure.margineDopoRitardo)}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">margine dopo penali</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] font-bold uppercase text-slate-500 block mb-2">Clausole penali rilevate ({exposure.penaltyClauses.length})</span>
                    {exposure.penaltyClauses.map((c) => (
                      <div key={c.id} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 mb-2">
                        <div className="flex items-start justify-between mb-1">
                          <span className="text-[10px] font-bold text-white">{c.tipo.replace("_", " ").toUpperCase()}</span>
                          <span className="text-[9px] text-slate-500">{c.articoloRiferimento}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">{c.descrizione}</p>
                        <p className="text-[9px] text-slate-500 mt-1">
                          {c.importoGiornaliero ? `${formatEuro(c.importoGiornaliero)}/giorno` : ""}
                          {c.importoMassimo ? ` — cap: ${formatEuro(c.importoMassimo)}` : ""}
                          {c.giorniTolleranza ? ` — tolleranza: ${c.giorniTolleranza} gg` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "timeline" && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">Indicatori di rischio ritardo per questa gara:</p>
                  {exposure.riskIndicators.map((ind, i) => (
                    <div key={i} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] font-bold text-white">{ind.fattore}</span>
                        <span className="text-[10px] font-mono text-brand-gold">{(ind.contributo * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(ind.valore * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "mitigation" && (
                <div className="space-y-2">
                  {exposure.mitigazioni.map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      {m}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "pricing" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">Impatto penali sul prezzo offerta:</p>
                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Margine base stimato</span>
                      <span className="text-white font-mono">{formatEuro(margineStimato)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Penalità attesa</span>
                      <span className="text-amber-400 font-mono">-{formatEuro(exposure.penalitaAttesa)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-neutral-800 pt-2">
                      <span className="text-white font-bold">Margine netto stimato</span>
                      <span className={`font-mono font-bold ${exposure.margineDopoRitardo > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatEuro(exposure.margineDopoRitardo)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-300 bg-neutral-950 border border-amber-900/40 rounded-lg p-3">
                    <TrendingDown className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    Considera di aumentare il prezzo offerta di {formatEuro(exposure.penalitaAttesa * 0.5)} per coprire il rischio penali atteso.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky border-t border-neutral-800 px-6 py-3 flex justify-end shrink-0 bg-black rounded-b-2xl">
          <button type="button" onClick={onClose} className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
