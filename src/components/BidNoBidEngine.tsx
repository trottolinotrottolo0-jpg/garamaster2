import { useState, useEffect } from "react";
import { X, RefreshCw, CheckCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import type { TenderDocument, CompanyProfile, BidNoBidResult } from "../types";
import { runBidNoBid } from "../lib/gemini";
import { ExplainabilityLayer } from "./ExplainabilityLayer";

interface BidNoBidEngineProps {
  tender: TenderDocument;
  isOpen: boolean;
  onClose: () => void;
}

function CheckPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
        ok
          ? "bg-emerald-950/60 border-emerald-700 text-emerald-400"
          : "bg-red-950/60 border-red-700 text-red-400"
      }`}
    >
      {ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

export function BidNoBidEngine({ tender, isOpen, onClose }: BidNoBidEngineProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [result, setResult] = useState<BidNoBidResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAndRun = async (prof: CompanyProfile) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runBidNoBid(tender, prof);
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

  const decisionConfig = {
    "GO": {
      label: "GO",
      bg: "bg-emerald-950",
      border: "border-emerald-600",
      text: "text-emerald-400",
    },
    "CAUTELA": {
      label: "CAUTELA",
      bg: "bg-amber-950",
      border: "border-amber-600",
      text: "text-amber-400",
    },
    "NO-GO": {
      label: "NO-GO",
      bg: "bg-red-950",
      border: "border-red-600",
      text: "text-red-400",
    },
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <span className="text-xs font-extrabold tracking-widest uppercase text-white">
            Bid / No-Bid Engine
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-500 hover:text-white transition-colors text-lg font-bold leading-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5">
          {/* No profile */}
          {!profile && !loading && (
            <div className="text-center space-y-3 py-8">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm text-slate-300">
                Profilo azienda non trovato.
              </p>
              <p className="text-xs text-slate-500">
                Compilalo prima nel tab <span className="text-brand-gold font-bold">Profilo azienda</span>.
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
              <p className="text-sm text-slate-300 font-semibold">Analisi Bid/No-Bid in corso</p>
              <p className="text-xs text-slate-500">Gemini sta analizzando la compatibilità...</p>
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
              {/* Decision badge */}
              {(() => {
                const cfg = decisionConfig[result.decision];
                return (
                  <div className={`${cfg.bg} border ${cfg.border} rounded-2xl px-6 py-5 flex items-center justify-between`}>
                    <div>
                      <span className={`text-3xl font-extrabold tracking-widest ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">Decisione di gara</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-4xl font-extrabold ${cfg.text}`}>
                        {result.scoreComplessivo}
                      </span>
                      <span className="text-slate-500 text-lg font-bold">/100</span>
                      <p className="text-xs text-slate-400 mt-1">Score complessivo</p>
                    </div>
                  </div>
                );
              })()}

              {/* Sintesi */}
              <p className="text-sm text-slate-300 leading-relaxed">{result.motivazioneSintetica}</p>

              {/* Pro / Contro */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                    Motivi Pro
                  </h3>
                  <ul className="space-y-1.5">
                    {result.motiviPro.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                    Motivi Contro
                  </h3>
                  <ul className="space-y-1.5">
                    {result.motiviContro.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Criticità principale */}
              {result.criticitaPrincipale && (
                <div className="bg-amber-950/30 border border-amber-900 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-600 block mb-1">
                      Criticità principale
                    </span>
                    <p className="text-xs text-amber-200">{result.criticitaPrincipale}</p>
                  </div>
                </div>
              )}

              {/* Suggerimento */}
              {result.suggerimento && (
                <div className="bg-neutral-950 border border-brand-gold/40 rounded-xl p-4">
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-brand-gold block mb-1">
                    Suggerimento operativo
                  </span>
                  <p className="text-xs text-slate-300">{result.suggerimento}</p>
                </div>
              )}

              {/* Check pills */}
              <div className="flex flex-wrap gap-2">
                <CheckPill label="SOA" ok={result.soaCompatibile} />
                <CheckPill label="Area geografica" ok={result.areaGeograficaOk} />
                <CheckPill label="Importo" ok={result.importoInTarget} />
                <CheckPill label="Capacità operativa" ok={result.capacitaSufficiente} />
              </div>

              {/* SOA Detail */}
              {result.soaDetail && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                      Analisi SOA dettagliata
                    </h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                      result.soaDetail.esito === "PIENA_COPERTURA"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                        : result.soaDetail.esito === "COPERTURA_PARZIALE"
                        ? "bg-blue-950/40 border-blue-800 text-blue-400"
                        : result.soaDetail.esito === "GAP_COLMABILE"
                        ? "bg-amber-950/40 border-amber-800 text-amber-400"
                        : "bg-red-950/40 border-red-800 text-red-400"
                    }`}>
                      {result.soaDetail.esito.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <span className="text-slate-500 uppercase font-bold block mb-1">Richieste dalla gara</span>
                      {result.soaDetail.categorieRichieste.length > 0
                        ? result.soaDetail.categorieRichieste.map((c, i) => (
                            <span key={i} className="inline-block bg-neutral-900 border border-neutral-700 text-white font-mono px-1.5 py-0.5 rounded mr-1 mb-1">{c}</span>
                          ))
                        : <span className="text-slate-500 italic">Non specificate</span>
                      }
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase font-bold block mb-1">Possedute dall'impresa</span>
                      {result.soaDetail.categorieImpresa.map((c, i) => (
                        <span key={i} className={`inline-block border font-mono px-1.5 py-0.5 rounded mr-1 mb-1 text-[10px] ${
                          result.soaDetail.categorieCompatibili.includes(c)
                            ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                            : "bg-neutral-900 border-neutral-700 text-slate-400"
                        }`}>{c}</span>
                      ))}
                    </div>
                  </div>

                  {result.soaDetail.categorieGap.length > 0 && (
                    <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg px-3 py-2">
                      <span className="text-[9px] font-bold text-amber-500 uppercase block mb-1">Gap SOA</span>
                      <div className="flex flex-wrap gap-1">
                        {result.soaDetail.categorieGap.map((c, i) => (
                          <span key={i} className="bg-amber-950/40 border border-amber-800 text-amber-400 font-mono text-[10px] px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Classifica richiesta</span>
                      <span className="text-white font-mono font-bold">{result.soaDetail.classificaRichiesta}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">Classifica posseduta</span>
                      <span className={`font-mono font-bold ${result.soaDetail.classificaAdeguata ? "text-emerald-400" : "text-amber-400"}`}>
                        {result.soaDetail.classificaPosseduta}
                        {result.soaDetail.incrementoQuintoApplicabile && (
                          <span className="ml-1 text-blue-400 text-[9px]">(+quinto)</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{result.soaDetail.motivazione}</p>

                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-brand-gold uppercase block mb-0.5">Azione consigliata</span>
                    <p className="text-xs text-slate-300">{result.soaDetail.azioneConsigliata}</p>
                  </div>
                </div>
              )}

              {/* Rigenera */}
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

              {result.explainability && <ExplainabilityLayer data={result.explainability} />}

              {/* Footer */}
              <p className="text-[10px] text-slate-600 pt-2 border-t border-neutral-900">
                Basato su D.Lgs. 36/2023 · Generato:{" "}
                {new Date(result.generatedAt).toLocaleString("it-IT")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
