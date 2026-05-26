import { useState, useEffect } from "react";
import {
  X, BarChart3, RefreshCw, AlertTriangle, Loader2, XCircle, ArrowLeft,
} from "lucide-react";
import type { TenderDocument, CompanyProfile, ProfitabilityGateResult, ProfitabilityVerdict } from "../types";
import { runProfitabilityGate } from "../lib/gemini";

interface ProfitabilityGateProps {
  tender: TenderDocument;
  isOpen: boolean;
  onClose: () => void;
}

const VERDICT_CFG: Record<ProfitabilityVerdict, { bg: string; border: string; text: string; label: string }> = {
  PROFITTEVOLE: { bg: "bg-emerald-950", border: "border-emerald-600", text: "text-emerald-400", label: "PROFITTEVOLE" },
  BORDERLINE: { bg: "bg-amber-950", border: "border-amber-600", text: "text-amber-400", label: "BORDERLINE" },
  PERICOLOSA: { bg: "bg-red-950", border: "border-red-600", text: "text-red-400", label: "PERICOLOSA" },
};

const RISCHIO_CFG = {
  basso: "text-emerald-400",
  medio: "text-amber-400",
  alto: "text-red-400",
};

const BAR_COLORS = [
  "bg-blue-600",
  "bg-violet-600",
  "bg-cyan-600",
  "bg-amber-500",
  "bg-orange-600",
  "bg-emerald-600",
];

function fmt(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function ProfitabilityGate({ tender, isOpen, onClose }: ProfitabilityGateProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [result, setResult] = useState<ProfitabilityGateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAndRun = async (prof: CompanyProfile) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runProfitabilityGate(tender, prof);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const stored = localStorage.getItem("gm_company_profile");
    if (!stored) {
      setProfile(null);
      setResult(null);
      setError(null);
      return;
    }
    const prof = JSON.parse(stored) as CompanyProfile;
    setProfile(prof);
    loadAndRun(prof);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tender]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <span className="text-xs font-extrabold tracking-widest uppercase text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-gold" />
            Profitability Gate
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5">
          {/* No profile */}
          {!profile && !loading && (
            <div className="text-center space-y-3 py-8">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm text-slate-300">Profilo azienda non trovato.</p>
              <p className="text-xs text-slate-500">
                Compilalo prima nel tab{" "}
                <span className="text-brand-gold font-bold">Profilo azienda</span>.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer mt-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Chiudi
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center space-y-4 py-12">
              <Loader2 className="w-8 h-8 text-brand-gold mx-auto animate-spin" />
              <p className="text-sm text-slate-300 font-semibold">Analisi profittabilità in corso</p>
              <p className="text-xs text-slate-500">Gemini calcola costi, margini e scenari...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="space-y-4 py-4">
              <div className="bg-red-950/30 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
              {profile && (
                <button
                  type="button"
                  onClick={() => loadAndRun(profile)}
                  className="cursor-pointer flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Riprova
                </button>
              )}
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="space-y-5">
              {/* Verdict badge */}
              {(() => {
                const cfg = VERDICT_CFG[result.verdict];
                return (
                  <div className={`${cfg.bg} border ${cfg.border} rounded-2xl px-6 py-5`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className={`text-3xl font-extrabold tracking-widest ${cfg.text}`}>
                          {cfg.label}
                        </span>
                        <p className="text-xs text-slate-400 mt-1">Verdetto profittabilità</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-4xl font-extrabold ${cfg.text}`}>
                          {result.scoreProfittabilita}
                        </span>
                        <span className="text-slate-500 text-lg font-bold">/100</span>
                        <p className="text-xs text-slate-400 mt-1">Score economico</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-baseline gap-3 flex-wrap">
                      <span className={`text-2xl font-extrabold ${cfg.text}`}>
                        {result.margineAttesoPercent.toFixed(1)}%
                      </span>
                      <span className="text-slate-400 text-sm">margine atteso</span>
                      <span className="text-white font-bold text-lg">{fmt(result.margineAttesoEuro)}</span>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border bg-neutral-950/60 border-neutral-700 ${RISCHIO_CFG[result.rischioEconomico]}`}
                      >
                        Rischio {result.rischioEconomico}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 3 scenari */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-950 border border-emerald-900/50 rounded-xl p-4 text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Ottimistico</p>
                  <p className="text-2xl font-extrabold text-emerald-400">{result.scenarioOttimistico.toFixed(1)}%</p>
                  <p className="text-[9px] text-slate-500 mt-1">scenario favorevole</p>
                </div>
                <div className="bg-neutral-950 border border-brand-gold/40 rounded-xl p-4 text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Realistico</p>
                  <p className="text-2xl font-extrabold text-brand-gold">{result.scenarioRealistico.toFixed(1)}%</p>
                  <p className="text-[9px] text-slate-500 mt-1">scenario base</p>
                </div>
                <div className="bg-neutral-950 border border-red-900/50 rounded-xl p-4 text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Pessimistico</p>
                  <p className="text-2xl font-extrabold text-red-400">{result.scenarioPessimistico.toFixed(1)}%</p>
                  <p className="text-[9px] text-slate-500 mt-1">scenario avverso</p>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-4">
                <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                  Cost Breakdown
                </h3>
                {result.breakdownCosti.map((item, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-300">{item.categoria}</span>
                      <span className="text-xs font-bold text-white font-mono">{fmt(item.importoStimato)}</span>
                    </div>
                    <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                        style={{ width: `${Math.min(item.percentualeImporto, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500">{item.note}</p>
                  </div>
                ))}
                <div className="pt-3 border-t border-neutral-800 flex justify-between items-center">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Totale costi stimati
                  </span>
                  <span className="text-sm font-extrabold text-white font-mono">{fmt(result.costoTotaleStimato)}</span>
                </div>
              </div>

              {/* Motivazione */}
              <div>
                <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                  Analisi economica
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">{result.motivazione}</p>
              </div>

              {/* Alert */}
              {(result.alertMargineNegativo || result.alertMargineInsufficiente) && result.alertText && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-500 block mb-1">
                      {result.alertMargineNegativo ? "Alert margine negativo" : "Alert margine insufficiente"}
                    </span>
                    <p className="text-xs text-red-300">{result.alertText}</p>
                  </div>
                </div>
              )}

              {/* Punti attenzione */}
              <div>
                <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                  Elementi che possono erodere il margine
                </h3>
                <ul className="space-y-1.5">
                  {result.puntiAttenzione.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-neutral-900 space-y-3">
                <p className="text-[10px] text-slate-600">
                  Analisi basata su costi interni impresa e D.Lgs. 36/2023 · Generato:{" "}
                  {new Date(result.generatedAt).toLocaleString("it-IT")}
                </p>
                <div className="flex items-center gap-3">
                  {profile && (
                    <button
                      type="button"
                      onClick={() => loadAndRun(profile)}
                      className="cursor-pointer flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Rigenera analisi
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="cursor-pointer flex items-center gap-2 bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Torna alla chat
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
