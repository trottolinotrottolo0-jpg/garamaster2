import { useState, useEffect } from "react";
import { X, Loader2, GitBranch, AlertTriangle } from "lucide-react";
import type { TenderDocument, VariantRiskExposure, VariantRiskClasse } from "../types";
import { createVariantClaimsRiskExposure, VARIANT_RISK_CLASS } from "../lib/variantClaimsEngine";

interface VariantClaimsRiskAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  bandoPdfBase64?: string;
  fileName?: string;
}

type Tab = "summary" | "clauses" | "strategie";

const formatEuro = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function VariantClaimsRiskAnalyzer({
  isOpen,
  onClose,
  tender,
}: VariantClaimsRiskAnalyzerProps) {
  const [exposure, setExposure] = useState<VariantRiskExposure | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("summary");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    try {
      setExposure(createVariantClaimsRiskExposure(tender));
    } finally {
      setLoading(false);
    }
  }, [isOpen, tender]);

  if (!isOpen) return null;

  const RISK_LABEL: Record<VariantRiskClasse, string> = {
    BASSO: "Rischio Basso",
    MEDIO: "Rischio Medio",
    ALTO: "Rischio Alto",
    CRITICO: "Rischio Critico",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        <div className="sticky top-0 bg-black z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-800 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-extrabold tracking-widest uppercase text-white">
              Variants & Claims Risk
            </span>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-neutral-800 px-6 shrink-0">
          {(["summary", "clauses", "strategie"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`cursor-pointer text-[10px] font-bold uppercase tracking-wider px-3 py-2.5 border-b-2 transition-colors ${
                activeTab === t ? "border-purple-500 text-purple-400" : "border-transparent text-slate-500 hover:text-white"
              }`}
            >
              {t === "summary" ? "Sintesi" : t === "clauses" ? "Clausole" : "Strategie"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-purple-400 mx-auto animate-spin" />
              <p className="text-xs text-slate-500 mt-3">Analisi rischio varianti e claims...</p>
            </div>
          )}

          {!loading && exposure && (
            <>
              {activeTab === "summary" && (
                <div className="space-y-4">
                  <div className={`border rounded-xl px-5 py-4 flex items-center justify-between ${VARIANT_RISK_CLASS[exposure.riskClasse]}`}>
                    <div>
                      <span className="text-2xl font-extrabold font-mono">{RISK_LABEL[exposure.riskClasse]}</span>
                      <p className="text-[10px] mt-0.5 opacity-70">Livello rischio varianti/claims</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold font-mono">{formatEuro(exposure.esposizioneTotale)}</span>
                      <p className="text-[10px] mt-0.5 opacity-70">Esposizione totale</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center">
                      <span className="text-lg font-extrabold text-white font-mono">{exposure.variantClauses.length}</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">clausole variante</p>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center">
                      <span className="text-lg font-extrabold text-white font-mono">{exposure.claimsClauses.length}</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">tipologie claims</p>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center">
                      <span className="text-lg font-extrabold text-amber-400 font-mono">{formatEuro(exposure.importoVariantiNnegatteAtteso)}</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">varianti negate</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "clauses" && (
                <div className="space-y-3">
                  <p className="text-[9px] font-bold uppercase text-slate-500">Clausole Variante ({exposure.variantClauses.length})</p>
                  {exposure.variantClauses.map((c) => (
                    <div key={c.id} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                      <span className="text-[10px] font-bold text-white">{c.tipoVariante}</span>
                      <p className="text-[10px] text-slate-400 mt-1">{c.descrizione}</p>
                      <div className="flex gap-2 mt-1.5 text-[9px] text-slate-500">
                        {c.percentualeMassima && <span>Max: {c.percentualeMassima}%</span>}
                        {c.articoloRiferimento && <span>{c.articoloRiferimento}</span>}
                      </div>
                    </div>
                  ))}
                  <p className="text-[9px] font-bold uppercase text-slate-500 mt-4">Tipologie Claims ({exposure.claimsClauses.length})</p>
                  {exposure.claimsClauses.map((c) => (
                    <div key={c.id} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                      <span className="text-[10px] font-bold text-white">{c.tipoReclamo}</span>
                      <p className="text-[10px] text-slate-400 mt-1">{c.descrizione}</p>
                      <p className="text-[9px] text-slate-500 mt-1">Termine: {c.terminePresentazione} giorni</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "strategie" && (
                <div className="space-y-2">
                  {exposure.strategie.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                      <AlertTriangle className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                      {s}
                    </div>
                  ))}
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
