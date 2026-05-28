import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TenderDocument, RiskLevel, RedFlagAnalysisResult } from "../types";
import { runRedFlagAnalysis } from "../lib/gemini";
import { ExplainabilityLayer } from "./ExplainabilityLayer";
import {
  ShieldAlert, AlertTriangle, AlertCircle, Sparkles, HelpCircle,
  ArrowRight, ArrowLeft, FileText, CheckCircle2, ChevronRight, MessageSquare, Copy,
  Loader2, XCircle, RefreshCw
} from "lucide-react";

interface VessatorieModalProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  onInjectClarification: (text: string) => void;
}

export const VessatorieModal: React.FC<VessatorieModalProps> = ({
  isOpen,
  onClose,
  tender,
  onInjectClarification,
}) => {
  const [result, setResult] = useState<RedFlagAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [injectedIndex, setInjectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setResult(null);
    setError(null);
    setInjectedIndex(null);
    setIsLoading(true);
    runRedFlagAnalysis(tender)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [isOpen, tender.id]);

  if (!isOpen) return null;

  const severityColor = (sev: RiskLevel) => {
    if (sev === "high") return "border-red-900/50 bg-red-950/40 text-red-400";
    if (sev === "medium") return "border-amber-900/50 bg-amber-950/40 text-amber-400";
    return "border-blue-900/50 bg-blue-950/40 text-blue-400";
  };

  const severityLabel = (sev: RiskLevel) => {
    if (sev === "high") return "CRITICITÀ CONTESTABILE";
    if (sev === "medium") return "ATTENZIONE";
    return "OSSERVAZIONE";
  };

  const categoryLabel = (type: string) => {
    switch (type) {
      case "hyper_detailed_specs":
        return "Specifiche iper-dettagliate";
      case "unbalanced_award_criteria":
        return "Criteri di valutazione sbilanciati";
      case "anomalous_timeline":
        return "Tempi anomali";
      case "restrictive_requirement_combination":
        return "Combinazione restrittiva di requisiti";
      default:
        return type.replaceAll("_", " ");
    }
  };

  const getReferenceHref = (anchorId?: string) => {
    if (!anchorId) return null;
    const trimmed = anchorId.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("#")) return trimmed;
    return null;
  };

  const rischioColor = (r: RiskLevel) => {
    if (r === "high") return "border-red-700 bg-red-950/50 text-red-400";
    if (r === "medium") return "border-amber-700 bg-amber-950/50 text-amber-400";
    return "border-emerald-700 bg-emerald-950/50 text-emerald-400";
  };

  const rischioLabel = (r: RiskLevel) => {
    if (r === "high") return "RISCHIO ALTO";
    if (r === "medium") return "RISCHIO MEDIO";
    return "RISCHIO BASSO";
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Testo chiarimento copiato negli appunti! Puoi usarlo sul portale o inviarlo in chat.");
  };

  const handleRetry = () => {
    setResult(null);
    setError(null);
    setIsLoading(true);
    runRedFlagAnalysis(tender)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 mt-8 mb-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-brand-gold" />
              </div>
              <div>
                <h3 className="text-white font-extrabold text-sm tracking-wider uppercase font-sans">
                  Scudo Legale GaraMaster (D.Lgs. 36/2023)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Rilevamento e neutralizzazione clausole abusive su:{" "}
                  <strong className="text-brand-gold">{tender.title.slice(0, 45)}...</strong>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors cursor-pointer text-lg font-bold p-1 hover:bg-neutral-900 rounded"
              id="close-vessatorie-modal"
            >
              ✕
            </button>
          </div>

          {/* Simple Reassuring Staff Intro */}
          <div className="bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-850 space-y-1.5">
            <div className="flex items-center gap-1.5 text-brand-gold">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider">
                Linguaggio Semplificato per Imprese e Segreterie
              </span>
            </div>
            <p className="text-[11.5px] text-slate-300 leading-relaxed">
              Il nostro algoritmo di Intelligenza Artificiale ha confrontato il bando corrente con il{" "}
              <strong>Nuovo Codice Contratti Pubblici</strong>. Di seguito trovi le clausole
              contrattuali dannose o illegittime identificate e i moduli pronti all&apos;uso per
              chiedere chiarimenti alla Stazione Appaltante a <strong>sforzo zero</strong>.
            </p>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="text-center space-y-4 py-8">
              <Loader2 className="w-8 h-8 text-brand-gold mx-auto animate-spin" />
              <p className="text-sm text-slate-300 font-semibold">
                Analisi clausole in corso con Gemini...
              </p>
              <p className="text-xs text-slate-500">Verifica conformità al D.Lgs. 36/2023...</p>
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="space-y-3">
              <div className="bg-red-950/30 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="cursor-pointer flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Riprova
              </button>
            </div>
          )}

          {/* Results */}
          {result && !isLoading && (
            <>
              {/* Risk summary badge */}
              <div
                className={`flex items-start justify-between gap-3 p-3 rounded-xl border ${rischioColor(result.rischioComplessivo)}`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`shrink-0 text-[8px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded border ${rischioColor(result.rischioComplessivo)}`}
                  >
                    {rischioLabel(result.rischioComplessivo)}
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">{result.sintesiRischio}</p>
                </div>
                <div className="shrink-0 flex gap-2 text-[9px] font-mono font-bold whitespace-nowrap">
                  <span className="text-red-400">{result.conteggioHigh} critici</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-amber-400">{result.conteggioMedium} medi</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-blue-400">{result.conteggioLow} bassi</span>
                </div>
              </div>

              {/* Legal items accordion/scroll list */}
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1.5 scrollbar-thin">
                {result.redFlags.map((item, index) => (
                  <div
                    key={index}
                    className="bg-neutral-950 border border-neutral-850 rounded-xl overflow-hidden shadow-md"
                  >
                    {/* Header item */}
                    <div className="p-3 bg-neutral-900/40 border-b border-neutral-850 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[8px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${severityColor(item.severity)}`}
                        >
                          {severityLabel(item.severity)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{categoryLabel(item.type)}</span>
                      </div>
                      <span className="text-[10px] text-brand-gold font-bold font-sans">
                        Ref: {item.articleRef.split(" (")[0]}
                      </span>
                    </div>

                    {/* Inner Body */}
                    <div className="p-4 space-y-3.5">
                      <div>
                        <h4 className="text-xs font-bold text-white font-sans flex items-center gap-1.5">
                          <ChevronRight className="w-3.5 h-3.5 text-brand-gold" />
                          {item.title}
                        </h4>
                        <p className="text-[10.5px] italic text-slate-400 bg-black p-2 rounded mt-1.5 border border-neutral-850 font-mono">
                          &quot;{item.clause}&quot;
                        </p>
                      </div>

                      {/* Clear non-jargon translation */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px]">
                        <div className="bg-neutral-900/30 p-2.5 rounded-lg border border-neutral-850">
                          <span className="text-brand-gold font-bold block mb-1">
                            Cosa significa nella pratica?
                          </span>
                          <p className="text-slate-300 leading-relaxed font-sans text-[10.5px]">
                            {item.simpleExplanation}
                          </p>
                        </div>

                        <div className="bg-neutral-900/30 p-2.5 rounded-lg border border-neutral-850">
                          <span className="text-emerald-450 font-bold block mb-1">
                            Come risolviamo (Sforzo Zero):
                          </span>
                          <p className="text-slate-300 leading-relaxed font-sans text-[10.5px]">
                            {item.remedy}
                          </p>
                        </div>
                      </div>

                      {item.sourceReference && (
                        <div className="bg-neutral-900/30 p-2.5 rounded-lg border border-neutral-850 space-y-2">
                          <span className="text-brand-gold font-bold block text-[10px] uppercase tracking-wider">
                            Riferimento puntuale disciplinare
                          </span>
                          <div className="text-[10.5px] text-slate-300 space-y-1">
                            <p>Documento: {item.sourceReference.documentName || "Documento gara"}</p>
                            <p>Pagina: {item.sourceReference.pageNumber ?? "n/d"}</p>
                            <p>Articolo/Clausola: {item.sourceReference.article || item.sourceReference.clauseTitle || "n/d"}</p>
                            {item.sourceReference.excerpt && (
                              <p className="italic text-slate-400">"{item.sourceReference.excerpt}"</p>
                            )}
                          </div>
                          {getReferenceHref(item.sourceReference.anchorId) ? (
                            <a
                              href={getReferenceHref(item.sourceReference.anchorId) ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-brand-gold hover:text-yellow-300 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Apri riferimento
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 border border-neutral-800 rounded px-2 py-1 cursor-not-allowed"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Riferimento disponibile nel documento
                            </button>
                          )}
                        </div>
                      )}

                      {/* Ready to use draft code block */}
                      <div className="space-y-1.5">
                        <span className="text-[9.5px] font-sans font-extrabold text-slate-450 uppercase tracking-wider block">
                          Testo di Chiarimento Pronto per il Portale Gare / RUP:
                        </span>
                        <div className="relative">
                          <textarea
                            readOnly
                            value={item.clarificationText}
                            className="w-full h-24 bg-black border border-neutral-850 p-2 text-[10.5px] text-slate-300 font-sans rounded-lg resize-none focus:outline-hidden focus:border-neutral-700 leading-relaxed"
                          />
                          <div className="absolute right-2 bottom-2 flex gap-1.5">
                            <button
                              onClick={() => handleCopy(item.clarificationText)}
                              className="bg-neutral-900 border border-neutral-800 hover:border-brand-gold hover:text-white p-1.5 rounded-md text-slate-400 cursor-pointer transition-colors"
                              title="Copia negli appunti"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setInjectedIndex(index);
                                onInjectClarification(item.clarificationText);
                                onClose();
                              }}
                              className="bg-brand-gold text-black hover:bg-yellow-400 p-1.5 rounded-md font-bold text-[9.5px] font-sans flex items-center gap-1 cursor-pointer transition-colors"
                              title="Invia la bozza nell'editor di chat"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Usa in Chat</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {result.explainability && <ExplainabilityLayer data={result.explainability} />}
            </>
          )}

          {/* Footer message */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px] text-slate-450">
            <span>D.Lgs. 36/2023 • Commissione Europea • Linee Guida ANAC</span>
            <button
              onClick={onClose}
              className="cursor-pointer bg-brand-gold hover:bg-yellow-400 text-black px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Torna alla chat
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
