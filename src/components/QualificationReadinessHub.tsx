import { useState, useEffect } from "react";
import { X, Loader2, Award, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import type {
  TenderDocument,
  QualificationAssessment,
  QualificationReadinessPath,
  QualificationRequirement,
  CompanyProfile,
} from "../types";
import {
  assessQualification,
  generateQualificationPath,
  generateRTIRecommendations,
  mapTenderRequirementToQualification,
  QUALIFICATION_VERDICT_CLASS,
} from "../lib/qualificationEngine";

interface QualificationReadinessHubProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  bandoPdfBase64?: string;
  fileName?: string;
  companyProfile?: CompanyProfile;
  onQualificationCheck?: (verdict: string) => void;
}

type Tab = "assessment" | "path" | "rti";

const VERDICT_LABEL: Record<QualificationAssessment["raccomandazioneFinale"], string> = {
  PARTECIPA: "✓ Partecipa",
  PARTECIPA_CON_RTI: "~ Partecipa con RTI",
  AVVALIMENTO: "⚠ Avvalimento necessario",
  NON_PARTECIPARE: "✗ Non partecipare",
};

export function QualificationReadinessHub({
  isOpen,
  onClose,
  tender,
  companyProfile,
  onQualificationCheck,
}: QualificationReadinessHubProps) {
  const [assessment, setAssessment] = useState<QualificationAssessment | null>(null);
  const [readinessPath, setReadinessPath] = useState<QualificationReadinessPath[]>([]);
  const [rtiRecs, setRtiRecs] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<QualificationRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("assessment");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const reqs = tender.requirements.map((r, i) =>
        mapTenderRequirementToQualification(r, i)
      );
      setRequirements(reqs);

      const ass = assessQualification(tender, reqs, companyProfile);
      setAssessment(ass);
      setReadinessPath(generateQualificationPath(ass, reqs));
      setRtiRecs(generateRTIRecommendations(ass));

      onQualificationCheck?.(ass.raccomandazioneFinale);
    } finally {
      setLoading(false);
    }
  }, [isOpen, tender, companyProfile, onQualificationCheck]);

  if (!isOpen) return null;

  const STATUS_COLORS = {
    SODDISFATTO: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
    PARZIALE: "text-amber-400 border-amber-800 bg-amber-950/40",
    MANCANTE: "text-red-400 border-red-800 bg-red-950/40",
    NON_VERIFICABILE: "text-slate-400 border-neutral-700 bg-neutral-900",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        <div className="sticky top-0 bg-black z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-800 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-brand-gold" />
            <span className="text-xs font-extrabold tracking-widest uppercase text-white">
              Qualification Readiness Hub
            </span>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-neutral-800 px-6 shrink-0">
          {(["assessment", "path", "rti"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`cursor-pointer text-[10px] font-bold uppercase tracking-wider px-3 py-2.5 border-b-2 transition-colors ${
                activeTab === t ? "border-brand-gold text-brand-gold" : "border-transparent text-slate-500 hover:text-white"
              }`}
            >
              {t === "assessment" ? "Valutazione" : t === "path" ? "Piano" : "RTI / Avvalimento"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-brand-gold mx-auto animate-spin" />
              <p className="text-xs text-slate-500 mt-3">Analisi qualificazione in corso...</p>
            </div>
          )}

          {!loading && assessment && (
            <>
              {activeTab === "assessment" && (
                <div className="space-y-4">
                  <div className={`border rounded-xl px-5 py-4 flex items-center justify-between ${QUALIFICATION_VERDICT_CLASS[assessment.raccomandazioneFinale]}`}>
                    <div>
                      <span className="text-xl font-extrabold font-mono">{VERDICT_LABEL[assessment.raccomandazioneFinale]}</span>
                      <p className="text-[10px] mt-0.5 opacity-70">Raccomandazione qualificazione</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-extrabold font-mono">{assessment.compliancePercent}%</span>
                      <p className="text-[10px] mt-0.5 opacity-70">compliance requisiti</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-bold uppercase text-slate-500 block">
                      Requisiti ({assessment.requirements.length})
                    </span>
                    {assessment.matchingStatus.map((status) => {
                      const req = requirements.find((r) => r.id === status.requirementId);
                      if (!req) return null;
                      return (
                        <div key={status.requirementId} className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {status.status === "SODDISFATTO"
                              ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              : status.status === "MANCANTE"
                              ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            }
                            <span className="text-[10px] text-white truncate">{req.descrizione}</span>
                          </div>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ml-2 ${STATUS_COLORS[status.status]}`}>
                            {status.status.replace("_", " ")}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {assessment.gapsCritici.length > 0 && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4">
                      <span className="text-[9px] font-bold uppercase text-red-500 block mb-2">Gap critici</span>
                      {assessment.gapsCritici.map((g, i) => (
                        <p key={i} className="text-xs text-red-300 mb-1">• {g}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "path" && (
                <div className="space-y-3">
                  {readinessPath.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                      <p className="text-sm text-slate-300">Nessuna azione richiesta — qualificazione completa</p>
                    </div>
                  ) : (
                    readinessPath.map((step, i) => (
                      <div key={step.stepId} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-slate-500 font-mono">Step {i + 1}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                              step.priorita === "alta"
                                ? "text-red-400 border-red-800 bg-red-950/40"
                                : step.priorita === "media"
                                ? "text-amber-400 border-amber-800 bg-amber-950/40"
                                : "text-slate-400 border-neutral-700"
                            }`}>{step.priorita.toUpperCase()}</span>
                          </div>
                          <span className="text-[9px] text-slate-500">{step.tempoStimato}</span>
                        </div>
                        <p className="text-[10px] text-white font-medium">{step.azione}</p>
                        <p className="text-[9px] text-slate-500 mt-1">Gap: {step.gapColmato}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "rti" && (
                <div className="space-y-2">
                  {rtiRecs.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                      <p className="text-sm text-slate-300">RTI non necessario — partecipazione diretta consigliata</p>
                    </div>
                  ) : (
                    rtiRecs.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                        <Award className="w-3.5 h-3.5 text-brand-gold shrink-0 mt-0.5" />
                        {r}
                      </div>
                    ))
                  )}
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
