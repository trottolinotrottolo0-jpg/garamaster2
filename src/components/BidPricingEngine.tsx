import { useState, useEffect, Fragment } from "react";
import { X, TrendingUp, AlertTriangle, RefreshCw, Loader2, XCircle } from "lucide-react";
import type { TenderDocument, CompanyProfile, BidPricingResult, PricingScenario } from "../types";
import { runBidPricing } from "../lib/gemini";
import { ExplainabilityLayer } from "./ExplainabilityLayer";

interface BidPricingEngineProps {
  tender: TenderDocument;
  isOpen: boolean;
  onClose: () => void;
}

const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtEuro = (n: number) => fmt.format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function marginColor(margine: number, minMargine: number) {
  if (margine > minMargine + 5) return "text-emerald-400";
  if (margine >= minMargine) return "text-amber-400";
  return "text-red-400";
}

function ScenarioCard({ s, minMargine }: { s: PricingScenario; minMargine: number }) {
  const isCustom = s.label === "Personalizzato";
  return (
    <div
      className={`bg-neutral-950 rounded-xl p-4 space-y-2 border ${
        isCustom ? "border-brand-gold" : "border-neutral-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
          {s.label}
        </span>
        {s.rischioAlert && (
          <span className="text-[9px] font-bold text-red-400 bg-red-950/60 border border-red-800 px-1.5 py-0.5 rounded">
            ⚠ SOTTO SOGLIA
          </span>
        )}
      </div>
      <div className="text-2xl font-extrabold text-white font-mono">{fmtPct(s.ribasso)}</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Offerto</span>
          <span className="text-white font-mono">{fmtEuro(s.importoOfferto)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Margine €</span>
          <span className={`font-mono font-bold ${marginColor(s.margineStimato, minMargine)}`}>
            {fmtEuro(s.margineEuro)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Margine %</span>
          <span className={`font-mono font-bold ${marginColor(s.margineStimato, minMargine)}`}>
            {fmtPct(s.margineStimato)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BidPricingEngine({ tender, isOpen, onClose }: BidPricingEngineProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [ribasso, setRibasso] = useState(12);
  const [result, setResult] = useState<BidPricingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setRibasso(prof.avgRibassoPercent || 12);
    setResult(null);
    setError(null);
  }, [isOpen, tender]);

  const handleRun = async (prof: CompanyProfile, r: number) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runBidPricing(tender, prof, r);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const BAR_MAX = 40;
  const toBarPct = (v: number) => `${Math.min(Math.max((v / BAR_MAX) * 100, 0), 100)}%`;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <span className="text-xs font-extrabold tracking-widest uppercase text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-gold" />
            Bid Intelligence &amp; Pricing Engine
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
          {/* No profile */}
          {!profile && (
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

          {/* Slider + launch (only when profile loaded) */}
          {profile && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                  Ribasso personalizzato da simulare
                </label>
                <span className="text-2xl font-extrabold text-brand-gold font-mono">
                  {ribasso.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={0.5}
                value={ribasso}
                onChange={(e) => setRibasso(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-gold [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-brand-gold [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background:
                    "linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 80%, #ef4444 100%)",
                }}
              />
              <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                <span>0%</span>
                <span>20%</span>
                <span>40%</span>
              </div>
              <button
                type="button"
                onClick={() => handleRun(profile, ribasso)}
                disabled={loading}
                className="cursor-pointer w-full bg-brand-gold hover:bg-yellow-400 disabled:opacity-50 text-black text-xs font-bold px-6 py-2.5 rounded-lg transition-colors"
              >
                Avvia analisi Gemini
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center space-y-4 py-8">
              <Loader2 className="w-8 h-8 text-brand-gold mx-auto animate-spin" />
              <p className="text-sm text-slate-300 font-semibold">Analisi pricing in corso...</p>
              <p className="text-xs text-slate-500">Gemini calcola range ottimale e scenari...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="space-y-4">
              <div className="bg-red-950/30 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
              {profile && (
                <button
                  type="button"
                  onClick={() => handleRun(profile, ribasso)}
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
              {/* Range numbers */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-emerald-950/40 border border-emerald-900 rounded-xl p-4">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-600 mb-1">
                    Ribasso MIN
                  </p>
                  <p className="text-3xl font-extrabold text-emerald-400 font-mono">
                    {fmtPct(result.rangeMinRibasso)}
                  </p>
                </div>
                <div className="bg-neutral-950 border border-brand-gold rounded-xl p-4">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-brand-gold mb-1">
                    Ribasso OTTIMALE
                  </p>
                  <p className="text-4xl font-extrabold text-brand-gold font-mono">
                    {fmtPct(result.ribassoOttimale)}
                  </p>
                </div>
                <div className="bg-amber-950/40 border border-amber-900 rounded-xl p-4">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-amber-600 mb-1">
                    Ribasso MAX
                  </p>
                  <p className="text-3xl font-extrabold text-amber-400 font-mono">
                    {fmtPct(result.rangeMaxRibasso)}
                  </p>
                </div>
              </div>

              {/* Visual bar */}
              <div className="space-y-2">
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                  Mappa range ribasso (0–40%)
                </p>
                <div
                  className="relative h-5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 80%, #ef4444 100%)",
                  }}
                >
                  {/* Min marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 z-10"
                    style={{ left: toBarPct(result.rangeMinRibasso) }}
                    title={`Min: ${fmtPct(result.rangeMinRibasso)}`}
                  />
                  {/* Ottimale marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-brand-gold border-2 border-black z-20 shadow"
                    style={{ left: toBarPct(result.ribassoOttimale) }}
                    title={`Ottimale: ${fmtPct(result.ribassoOttimale)}`}
                  />
                  {/* Max marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-amber-500 z-10"
                    style={{ left: toBarPct(result.rangeMaxRibasso) }}
                    title={`Max: ${fmtPct(result.rangeMaxRibasso)}`}
                  />
                  {/* Personalizzato marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-black z-10 opacity-80"
                    style={{ left: toBarPct(ribasso) }}
                    title={`Slider: ${fmtPct(ribasso)}`}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                  <span>0%</span>
                  <span className="text-blue-400">▲ {fmtPct(ribasso)} (tuo slider)</span>
                  <span>40%</span>
                </div>
              </div>

              {/* Scenario cards */}
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-3">
                  Scenario Simulator
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {result.scenari.map((s) => (
                    <Fragment key={s.label}>
                      <ScenarioCard s={s} minMargine={profile?.minMargineAccettabile ?? 0} />
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* Motivazione LLM */}
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                  Analisi Pricing
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">{result.motivazioneRange}</p>
              </div>

              {/* Alert margine */}
              {result.alertMargine && result.alertText && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] font-extrabold uppercase tracking-widest text-red-600 mb-1">
                      Alert margine
                    </p>
                    <p className="text-xs text-red-300">{result.alertText}</p>
                  </div>
                </div>
              )}

              {/* Win rate */}
              <div className="bg-neutral-950 border border-neutral-700 rounded-xl p-5 space-y-2">
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                  Win Rate stimato (prudente)
                </p>
                <p className="text-4xl font-extrabold text-brand-gold font-mono">
                  {fmtPct(result.winRatePrudente)}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">{result.winRateMotivazione}</p>
              </div>

              {/* Rigenera */}
              {profile && (
                <button
                  type="button"
                  onClick={() => handleRun(profile, ribasso)}
                  className="cursor-pointer flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Rigenera con stesso ribasso
                </button>
              )}

              {result.explainability && <ExplainabilityLayer data={result.explainability} />}

              {/* Footer */}
              <p className="text-[10px] text-slate-600 pt-2 border-t border-neutral-900">
                Basato su dati aziendali reali e D.Lgs. 36/2023 · Generato:{" "}
                {new Date(result.generatedAt).toLocaleString("it-IT")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
