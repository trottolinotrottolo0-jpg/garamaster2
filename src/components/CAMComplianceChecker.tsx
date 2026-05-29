import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, XCircle, AlertTriangle, Leaf } from "lucide-react";
import type { TenderDocument, CAMComplianceScore, CAMRequirement } from "../types";
import {
  createCAMComplianceProfile,
  updateCAMAssessmentItem,
  calculateCAMScore,
  CAM_LIVELLO_CLASS,
  CAM_LIVELLO_LABEL,
  CAM_CATEGORIA_LABEL,
} from "../lib/camComplianceEngine";

interface CAMComplianceCheckerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  bandoPdfBase64?: string;
  fileName?: string;
}

type Tab = "overview" | "items" | "raccomandazioni";

export function CAMComplianceChecker({
  isOpen,
  onClose,
  tender,
  bandoPdfBase64,
  fileName,
}: CAMComplianceCheckerProps) {
  const [assessment, setAssessment] = useState<CAMComplianceScore | null>(null);
  const [requirements, setRequirements] = useState<CAMRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const profile = createCAMComplianceProfile(tender);
      setAssessment(profile.score);
      setRequirements(profile.score.requirements);
    } finally {
      setLoading(false);
    }
  }, [isOpen, tender]);

  if (!isOpen) return null;

  const handleToggleItem = (itemId: string, stato: "conforme" | "non_conforme" | "parziale") => {
    if (!assessment) return;
    const updated = updateCAMAssessmentItem(assessment, requirements, itemId, stato);
    setAssessment(updated);
  };

  const STATO_COLORS = {
    conforme: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
    parziale: "text-amber-400 border-amber-800 bg-amber-950/40",
    non_conforme: "text-red-400 border-red-800 bg-red-950/40",
    non_applicabile: "text-slate-500 border-neutral-700 bg-neutral-900",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="sticky top-0 bg-black z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-800 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-extrabold tracking-widest uppercase text-white">
              CAM Compliance Checker
            </span>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 px-6 shrink-0">
          {(["overview", "items", "raccomandazioni"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`cursor-pointer text-[10px] font-bold uppercase tracking-wider px-3 py-2.5 border-b-2 transition-colors ${
                activeTab === t ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-500 hover:text-white"
              }`}
            >
              {t === "overview" ? "Panoramica" : t === "items" ? "Requisiti" : "Raccomandazioni"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-400 mx-auto animate-spin" />
              <p className="text-xs text-slate-500 mt-3">Analisi requisiti CAM...</p>
            </div>
          )}

          {!loading && assessment && (
            <>
              {activeTab === "overview" && (
                <div className="space-y-4">
                  <div className={`border rounded-xl px-5 py-4 flex items-center justify-between ${CAM_LIVELLO_CLASS[assessment.livelloConformita]}`}>
                    <div>
                      <span className="text-2xl font-extrabold font-mono">{CAM_LIVELLO_LABEL[assessment.livelloConformita]}</span>
                      <p className="text-[10px] mt-0.5 opacity-70">Livello conformità CAM</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-extrabold font-mono">{assessment.scoreConformita}%</span>
                      <p className="text-[10px] mt-0.5 opacity-70">Conformità obbligatori</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(["ambientale", "energetica", "sociale", "qualita"] as const).map((cat) => {
                      const catReqs = assessment.requirements.filter((r) => r.categoria === cat);
                      return (
                        <div key={cat} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                          <span className="text-[9px] font-bold uppercase text-slate-500 block mb-1">{CAM_CATEGORIA_LABEL[cat]}</span>
                          <span className="text-lg font-extrabold text-white font-mono">{catReqs.length}</span>
                          <p className="text-[9px] text-slate-500">requisiti</p>
                        </div>
                      );
                    })}
                  </div>

                  {assessment.criticitaRilevate.length > 0 && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4">
                      <span className="text-[9px] font-bold uppercase text-red-500 block mb-2">Criticità rilevate</span>
                      {assessment.criticitaRilevate.map((c, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-red-300 mb-1">
                          <XCircle className="w-3 h-3 shrink-0 mt-0.5 text-red-400" />
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "items" && (
                <div className="space-y-2">
                  {assessment.assessmentItems.map((item) => {
                    const req = assessment.requirements.find((r) => r.id === item.requirementId);
                    return (
                      <div key={item.requirementId} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className="text-[10px] font-bold text-white">{item.titolo}</span>
                            {req?.obbligatorio && (
                              <span className="ml-1 text-[8px] font-bold text-red-400 border border-red-800 rounded px-1">OBB</span>
                            )}
                            <p className="text-[9px] text-slate-500 mt-0.5">{req?.descrizione}</p>
                          </div>
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded border shrink-0 ${STATO_COLORS[item.stato]}`}>
                            {item.stato.replace("_", " ").toUpperCase()}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          {(["conforme", "parziale", "non_conforme"] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleToggleItem(item.requirementId, s)}
                              className={`cursor-pointer text-[9px] font-bold px-2 py-0.5 rounded border transition-colors ${
                                item.stato === s ? STATO_COLORS[s] : "border-neutral-700 text-slate-500 hover:text-white"
                              }`}
                            >
                              {s === "conforme" ? "✓ Conforme" : s === "parziale" ? "~ Parziale" : "✗ N/C"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "raccomandazioni" && (
                <div className="space-y-2">
                  {assessment.raccomandazioni.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                      <p className="text-sm text-slate-300">Nessuna raccomandazione — conformità ottimale</p>
                    </div>
                  ) : (
                    assessment.raccomandazioni.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        {r}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky border-t border-neutral-800 px-6 py-3 flex justify-end shrink-0 bg-black rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
