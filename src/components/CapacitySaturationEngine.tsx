import { useState, useEffect } from "react";
import {
  X, Activity, RefreshCw, CheckCircle, XCircle, AlertTriangle, Loader2, ArrowLeft,
} from "lucide-react";
import type { TenderDocument, CompanyProfile, CapacityAnalysisResult, CapacityVerdict } from "../types";
import { runCapacityAnalysis } from "../lib/gemini";

interface CapacitySaturationEngineProps {
  tender: TenderDocument;
  isOpen: boolean;
  onClose: () => void;
}

const VERDICT_CFG: Record<CapacityVerdict, { bg: string; border: string; text: string; label: string }> = {
  SOSTENIBILE: { bg: "bg-emerald-950", border: "border-emerald-600", text: "text-emerald-400", label: "SOSTENIBILE" },
  CRITICA: { bg: "bg-amber-950", border: "border-amber-600", text: "text-amber-400", label: "CRITICA" },
  NON_SOSTENIBILE: { bg: "bg-red-950", border: "border-red-600", text: "text-red-400", label: "NON SOSTENIBILE" },
};

const SATURATION_CFG = {
  basso: "text-emerald-400",
  medio: "text-amber-400",
  alto: "text-red-400",
};

function barColor(pct: number) {
  if (pct < 70) return "bg-emerald-600";
  if (pct < 85) return "bg-amber-500";
  return "bg-red-600";
}

function barTextColor(pct: number) {
  if (pct < 70) return "text-emerald-400";
  if (pct < 85) return "text-amber-400";
  return "text-red-400";
}

function LoadBar({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400 font-mono">{label}</span>
        <span className={`text-xs font-mono font-bold ${barTextColor(clamped)}`}>
          {clamped.toFixed(0)}%
        </span>
      </div>
      <div className="relative pb-5">
        <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor(clamped)}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
        {/* Soglia critica at 85% */}
        <div
          className="absolute top-0 w-0.5 h-5 bg-white/30"
          style={{ left: "85%" }}
        />
        <span
          className="absolute text-[8px] text-white/35 font-mono whitespace-nowrap"
          style={{ left: "85%", top: "16px", transform: "translateX(-50%)" }}
        >
          soglia critica
        </span>
      </div>
    </div>
  );
}

export function CapacitySaturationEngine({ tender, isOpen, onClose }: CapacitySaturationEngineProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [result, setResult] = useState<CapacityAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAndRun = async (prof: CompanyProfile) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runCapacityAnalysis(tender, prof);
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
            <Activity className="w-4 h-4 text-brand-gold" />
            Capacity &amp; Saturation Engine
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
              <p className="text-sm text-slate-300 font-semibold">Analisi capacità operativa in corso</p>
              <p className="text-xs text-slate-500">Gemini valuta carico, squadre e saturazione...</p>
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
                  <div className={`${cfg.bg} border ${cfg.border} rounded-2xl px-6 py-5 flex items-center justify-between`}>
                    <div>
                      <span className={`text-3xl font-extrabold tracking-widest ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">Verdetto capacità operativa</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-4xl font-extrabold ${cfg.text}`}>
                        {result.scoreCapacita}
                      </span>
                      <span className="text-slate-500 text-lg font-bold">/100</span>
                      <p className="text-xs text-slate-400 mt-1">Score capacità</p>
                    </div>
                  </div>
                );
              })()}

              {/* Sintesi */}
              <p className="text-sm text-slate-300 leading-relaxed">{result.motivazioneSintetica}</p>

              {/* Load bars */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-4">
                <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  Barre di carico operativo
                </h3>
                <LoadBar label="Carico attuale" pct={result.caricoAttualePercent} />
                <LoadBar label="Carico + questa gara" pct={result.caricoDopoGaraPercent} />
              </div>

              {/* Quick metrics */}
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border bg-neutral-950 border-neutral-700 text-white">
                  <Activity className="w-3 h-3 text-brand-gold" />
                  Squadre libere dopo gara: {result.squadreDisponibili}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border bg-neutral-950 border-neutral-700 text-white">
                  Carico attuale: {result.caricoAttualePercent.toFixed(0)}%
                </span>
                <span
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border bg-neutral-950 border-neutral-700 ${SATURATION_CFG[result.rischioSaturazione]}`}
                >
                  Rischio saturazione: {result.rischioSaturazione}
                </span>
              </div>

              {/* Punti forza / Criticità */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                    Punti di forza operativi
                  </h3>
                  <ul className="space-y-1.5">
                    {result.puntiForza.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                    Criticità operative
                  </h3>
                  <ul className="space-y-1.5">
                    {result.criticitaOperative.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Analisi organizzativa */}
              <div>
                <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                  Analisi organizzativa
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">{result.analisiCompatibilita}</p>
              </div>

              {/* Alert */}
              {result.rischioAlert && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-500 block mb-1">
                      Alert saturazione
                    </span>
                    <p className="text-xs text-red-300">{result.rischioAlert}</p>
                  </div>
                </div>
              )}

              {/* Suggerimento */}
              <div className="bg-neutral-950 border border-brand-gold/40 rounded-xl p-4">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-brand-gold block mb-1">
                  Suggerimento operativo
                </span>
                <p className="text-xs text-slate-300">{result.suggerimentoOperativo}</p>
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-neutral-900 space-y-3">
                <p className="text-[10px] text-slate-600">
                  Analisi basata su dati operativi impresa · Generato:{" "}
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
