import { useState, useEffect, useCallback } from "react";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Upload,
} from "lucide-react";
import type {
  TenderDocument,
  QualificationAssessment,
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
  defaultQualificationRequirementsForTender,
  QUALIFICATION_VERDICT_STYLES,
  QUALIFICATION_MATCH_STYLES,
  generateRTIRecommendations,
  generateAccelerationStrategies,
  createQualificationProgressTracker,
  updateProgressItem,
  daysUntilTenderDeadlineForQualification,
  ACCELERATION_FEASIBILITY_STYLES,
  URGENZA_IMPLEMENTAZIONE_STYLES,
  MILESTONE_STATUS_STYLES,
  type RTIRecommendation,
  type TimelineAccelerationOption,
  type QualificationProgressTracker,
} from "../lib/qualificationEngine";
import { requestQualificationRequirementsParse } from "../lib/parseQualificationRequirementsApi";
import { analyzeQualificationInsights, analyzeQualificationDeep, type QualificationDeepInsights } from "../lib/gemini";
import { readFileAsBase64 } from "../lib/parseSOAApi";
  generateRTIRecommendations,
  mapTenderRequirementToQualification,
  QUALIFICATION_VERDICT_CLASS,
} from "../lib/qualificationEngine";

interface QualificationReadinessHubProps {
  isOpen: boolean;
  onClose: () => void;
  onQualificationCheck?: (verdict: string) => void;
  tender: TenderDocument;
  companyProfile?: CompanyProfile | null;
}

type HubTab = "summary" | "rti" | "acceleration" | "insights" | "progress";

const PATH_PRIORITY_CLASS: Record<string, string> = {
  CRITICA: "bg-red-900/60 text-red-400",
  ALTA: "bg-orange-900/60 text-orange-400",
  MEDIA: "bg-amber-900/60 text-amber-400",
};

const TAB_LABELS: Record<HubTab, string> = {
  summary: "Summary",
  rti: "RTI",
  acceleration: "Accelerate",
  insights: "Insights",
  progress: "Progress",
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
  onQualificationCheck,
  tender,
  companyProfile: companyProfileProp,
}: QualificationReadinessHubProps) {
  const [assessment, setAssessment] = useState<QualificationAssessment | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<HubTab>("summary");

  const [rtiRecommendations, setRtiRecommendations] = useState<RTIRecommendation[]>([]);
  const [accelerationOptions, setAccelerationOptions] = useState<TimelineAccelerationOption[]>([]);
  const [deepInsights, setDeepInsights] = useState<QualificationDeepInsights | null>(null);
  const [deepInsightsLoading, setDeepInsightsLoading] = useState(false);
  const [progressTracker, setProgressTracker] = useState<QualificationProgressTracker | null>(null);

  const runAssessment = useCallback(
    (prof: CompanyProfile | null, requirements: import("../types").QualificationRequirement[]) => {
      const next = assessQualification(tender, requirements, prof ?? ({} as CompanyProfile));
      setAssessment(next);
      setSelectedTab("summary");
      onQualificationCheck?.(next.qualificazioneVerdetto);

      setInsightsLoading(true);
      analyzeQualificationInsights(next)
        .then((insights) =>
          setAssessment((prev) => (prev ? { ...prev, insightsDeepSeek: insights } : prev))
        )
        .catch(() => {})
        .finally(() => setInsightsLoading(false));
    },
    [tender, onQualificationCheck]
  );

  useEffect(() => {
    if (!isOpen) {
      setAssessment(null);
      setParseError(null);
      setRtiRecommendations([]);
      setAccelerationOptions([]);
      setDeepInsights(null);
      setProgressTracker(null);
      return;
    }

    let prof: CompanyProfile | null = companyProfileProp ?? null;
    if (!prof) {
      try {
        const raw = localStorage.getItem("gm_company_profile");
        if (raw) prof = JSON.parse(raw) as CompanyProfile;
      } catch {
        prof = null;
      }
    }

    runAssessment(prof, defaultQualificationRequirementsForTender(tender));
  }, [isOpen, tender.id, companyProfileProp, runAssessment, tender]);

  useEffect(() => {
    if (!assessment) return;

    setRtiRecommendations(generateRTIRecommendations(assessment));
    const giorni = daysUntilTenderDeadlineForQualification(assessment.gara);
    setAccelerationOptions(generateAccelerationStrategies(assessment, giorni));
    setProgressTracker(createQualificationProgressTracker(assessment));

    setDeepInsightsLoading(true);
    setDeepInsights(null);
    analyzeQualificationDeep(assessment)
      .then(setDeepInsights)
      .catch(() => setDeepInsights(null))
      .finally(() => setDeepInsightsLoading(false));
  }, [assessment?.id]);

  const handlePdfUpload = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const requirements = await requestQualificationRequirementsParse({
        bandoPdfBase64: base64,
        fileName: file.name,
        tender,
      });
      let prof: CompanyProfile | null = companyProfileProp ?? null;
      if (!prof) {
        try {
          const raw = localStorage.getItem("gm_company_profile");
          if (raw) prof = JSON.parse(raw) as CompanyProfile;
        } catch {
          prof = null;
        }
      }
      runAssessment(prof, requirements);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing bando");
    } finally {
      setIsParsing(false);
    }
  };

  if (!isOpen) return null;

  const verdictStyles = assessment
    ? QUALIFICATION_VERDICT_STYLES[assessment.qualificazioneVerdetto]
    : null;
  const qualificationPath = assessment ? generateQualificationPath(assessment) : [];
  const conformiCount = assessment?.matchingStatus.filter((m) => m.status === "CONFORME").length ?? 0;
  const urgenzaStyles = deepInsights
    ? URGENZA_IMPLEMENTAZIONE_STYLES[deepInsights.urgenzaImplementazione]
    : null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              Qualification Readiness Hub
            </h2>
            <p className="text-[9px] text-slate-400 mt-1 line-clamp-1">{tender.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {assessment && !isParsing && (
          <div className="flex gap-0 border-b border-neutral-800 px-4 shrink-0 overflow-x-auto">
            {(Object.keys(TAB_LABELS) as HubTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSelectedTab(tab)}
                className={`cursor-pointer px-3 py-2 text-[9px] font-bold uppercase whitespace-nowrap transition-colors ${
                  selectedTab === tab
                    ? "text-blue-400 border-b-2 border-blue-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <label className="flex items-center justify-center gap-2 cursor-pointer text-[10px] font-bold px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-slate-300 hover:border-blue-600 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            Carica PDF bando per estrazione requisiti
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={isParsing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePdfUpload(f);
                e.target.value = "";
              }}
            />
          </label>

          {(isParsing || !assessment) && (
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <span className="text-[10px] text-slate-400">
                {isParsing ? "Estrazione requisiti dal bando..." : "Calcolo qualificazione..."}
              </span>
            </div>
          )}

          {parseError && (
            <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-400">{parseError}</p>
            </div>
          )}

          {assessment && verdictStyles && !isParsing && selectedTab === "summary" && (
            <>
              <div
                className={`rounded-lg p-4 border ${verdictStyles.bg} ${verdictStyles.border}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className={`text-sm font-bold uppercase ${verdictStyles.text}`}>
                      {assessment.qualificazioneVerdetto.replace(/_/g, " ")}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {assessment.compliancePercent}% requisiti conformi
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${verdictStyles.text}`}>
                      {conformiCount} / {assessment.requirementsTotal}
                    </div>
                    <p className="text-[9px] text-slate-400">Conforme</p>
                  </div>
                </div>
                <p className={`text-[9px] ${verdictStyles.text} opacity-90`}>
                  {assessment.recommendation}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <p className="text-[9px] text-slate-500 mb-1">Obbligatori</p>
                  <p className="text-sm font-bold text-white">
                    {assessment.conformiObbligatori} / {assessment.requirementsObbligatori}
                  </p>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <p className="text-[9px] text-slate-500 mb-1">Esclusori</p>
                  <p
                    className={`text-sm font-bold ${
                      assessment.conformiEsclusori === assessment.requirementsEsclusori
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {assessment.conformiEsclusori} / {assessment.requirementsEsclusori}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Requisiti</p>
                {assessment.matchingStatus.map((match) => {
                  const st = QUALIFICATION_MATCH_STYLES[match.status];
                  return (
                    <div
                      key={match.requirementId}
                      className={`bg-neutral-950 border border-neutral-800 rounded-lg p-3 border-l-4 ${st.border}`}
                    >
                      <p className={`text-[10px] font-bold ${st.text}`}>
                        {st.icon} {match.titolo}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{match.categoria}</p>
                      {match.evidenza && (
                        <p className="text-[8px] text-slate-300 mt-2">Evidenza: {match.evidenza}</p>
                      )}
                      {match.gap && (
                        <p className="text-[8px] text-red-300 mt-1">Gap: {match.gap}</p>
                      )}
                      {match.azioni.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {match.azioni.map((azione, i) => (
                            <li key={i} className="text-[8px] text-blue-300">
                              → {azione}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

              {qualificationPath.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3">
                  <h3 className="text-[10px] font-bold text-amber-400 uppercase mb-3">
                    Roadmap colmamento gap
                  </h3>
                  <div className="space-y-2">
                    {qualificationPath.map((step) => (
                      <div
                        key={step.requirementId}
                        className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5"
                      >
                        <div className="flex items-start gap-2 mb-1">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                              PATH_PRIORITY_CLASS[step.priorita]
                            }`}
                          >
                            {step.priorita}
                          </span>
                          <span className="text-[9px] font-bold text-white flex-1">
                            {step.titolo}
                          </span>
                        </div>
                        <p className="text-[8px] text-slate-400">Gap: {step.gapAttuali}</p>
                        <p className="text-[8px] text-blue-300 mt-1">
                          → {step.azionePer_Colmare}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {selectedTab === "rti" && assessment && !isParsing && (
            <div className="space-y-3">
              <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-2">
                  RTI — Raggruppamento temporaneo imprese
                </h3>
                <p className="text-[9px] text-slate-300">
                  Partnership per colmare gap di qualificazione senza ampliare tutti i requisiti in
                  proprio.
                </p>
              </div>

              {rtiRecommendations.length === 0 ? (
                <p className="text-[9px] text-slate-500 text-center py-4">
                  Nessun gap RTI — qualificazione sufficiente o esclusorio senza via RTI.
                </p>
              ) : (
                rtiRecommendations.map((rec, i) => (
                  <div
                    key={`${rec.requirementId}-${i}`}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2"
                  >
                    <p className="text-[10px] font-bold text-white">Gap: {rec.requirementGap}</p>

                    <div className="text-[9px] text-slate-400">
                      <span className="font-bold text-slate-300">Partner idoneo:</span>
                      {rec.partnerProfiloIdoneo.specializzazione.map((s, idx) => (
                        <p key={idx} className="text-[8px] ml-2">
                          → {s}
                        </p>
                      ))}
                    </div>

                    {rec.partnerSuggeriti && rec.partnerSuggeriti.length > 0 && (
                      <div className="space-y-1.5 border-t border-neutral-800 pt-2">
                        <p className="text-[9px] font-bold text-blue-400">Partner suggeriti</p>
                        {rec.partnerSuggeriti.map((p) => (
                          <div
                            key={p.id}
                            className="bg-neutral-900 rounded p-2 text-[8px] text-slate-300"
                          >
                            <span className="font-bold text-white">{p.nome}</span>
                            <span className="text-slate-500 ml-2">· {p.reputazione}</span>
                            {p.winRate != null && (
                              <span className="text-emerald-400 ml-2">Win {p.winRate}%</span>
                            )}
                            {p.soa?.categorie[0] && (
                              <p className="text-slate-500 mt-0.5">
                                SOA {p.soa.categorie[0].codice} · €
                                {p.soa.categorie[0].importoMaxRealizzato.toLocaleString("it-IT")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[9px] text-blue-300">
                      <span className="font-bold">Strategia:</span> {rec.strategiaRTI}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[8px]">
                      <div>
                        <span className="font-bold text-emerald-400">Vantaggi</span>
                        {rec.vantaggiRTI.slice(0, 2).map((v, idx) => (
                          <p key={idx} className="text-slate-300">
                            ✓ {v}
                          </p>
                        ))}
                      </div>
                      <div>
                        <span className="font-bold text-red-400">Rischi</span>
                        {rec.rischiRTI.slice(0, 2).map((r, idx) => (
                          <p key={idx} className="text-slate-300">
                            ⚠ {r}
                          </p>
                        ))}
                      </div>
                    </div>

                    <p className="text-[8px] text-slate-400">
                      Timeline: {rec.timeline_formazione}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {selectedTab === "acceleration" && assessment && !isParsing && (
            <div className="space-y-3">
              <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-amber-400 uppercase mb-2">
                  Accelerate qualification
                </h3>
                <p className="text-[9px] text-slate-300">
                  Strategie rapide per colmare gap prima della scadenza gara (
                  {daysUntilTenderDeadlineForQualification(tender)} gg stimati).
                </p>
              </div>

              {accelerationOptions.length === 0 ? (
                <p className="text-[9px] text-slate-500 text-center py-4">
                  Nessuna strategia di accelerazione — nessun gap aperto.
                </p>
              ) : (
                accelerationOptions.map((opt, i) => {
                  const fs = ACCELERATION_FEASIBILITY_STYLES[opt.feasibility];
                  return (
                    <div
                      key={`${opt.gap}-${i}`}
                      className={`bg-neutral-950 border-l-4 ${fs.border} border border-neutral-800 rounded-lg p-3`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex-1">
                          <p className="text-[10px] font-bold text-white">{opt.gap}</p>
                          <p className="text-[9px] text-slate-400 mt-1">{opt.strategia}</p>
                        </div>
                        <span className={`text-[8px] font-bold px-2 py-1 rounded ${fs.badge}`}>
                          {opt.feasibility}
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-300 space-y-1">
                        <p>
                          Timeline: <strong>{opt.timeline}</strong>
                        </p>
                        {opt.costo_stimato != null && opt.costo_stimato > 0 && (
                          <p>
                            Costo stimato:{" "}
                            <strong>€{opt.costo_stimato.toLocaleString("it-IT")}</strong>
                          </p>
                        )}
                        {opt.rischi.length > 0 && (
                          <p className="text-red-300/80">⚠ {opt.rischi[0]}</p>
                        )}
                      </div>
                      <p className="text-[8px] text-blue-300 mt-2">{opt.note}</p>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {selectedTab === "insights" && assessment && !isParsing && (
            <div className="space-y-3">
              {deepInsightsLoading && (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="text-[9px] text-slate-400">Deep analysis in corso...</span>
                </div>
              )}
              {deepInsights && urgenzaStyles && (
                <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3 space-y-3">
                  <h3 className="text-[10px] font-bold text-blue-400 uppercase">
                    Deep analysis (AI)
                  </h3>
                  <p className="text-[9px] text-slate-300">{deepInsights.analisi}</p>

                  <div
                    className={`rounded-lg p-2 border ${urgenzaStyles.box} ${urgenzaStyles.border}`}
                  >
                    <p className={`text-[9px] font-bold ${urgenzaStyles.text}`}>
                      Urgenza implementazione: {deepInsights.urgenzaImplementazione}
                    </p>
                  </div>

                  <div className="text-[8px] space-y-2">
                    <div>
                      <p className="font-bold text-amber-400 mb-1">Gaps principali</p>
                      {deepInsights.gapsPrincipali.map((g, i) => (
                        <p key={i} className="text-slate-400">
                          • {g}
                        </p>
                      ))}
                    </div>
                    <div>
                      <p className="font-bold text-blue-400 mb-1">Path to qualification</p>
                      {deepInsights.pathToQualification.map((p, i) => (
                        <p key={i} className="text-slate-400">
                          {i + 1}. {p}
                        </p>
                      ))}
                    </div>
                    <div>
                      <p className="font-bold text-emerald-400 mb-1">Raccomandazioni</p>
                      {deepInsights.raccomandazioni.map((r, i) => (
                        <p key={i} className="text-slate-400">
                          → {r}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTab === "progress" && progressTracker && assessment && !isParsing && (
            <div className="space-y-3">
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-[10px] font-bold text-slate-400">Overall progress</p>
                  <p
                    className={`text-[10px] font-bold ${
                      progressTracker.readinessStatus === "PRONTO"
                        ? "text-emerald-400"
                        : progressTracker.readinessStatus === "NOT_READY"
                          ? "text-red-400"
                          : "text-amber-400"
                    }`}
                  >
                    {progressTracker.progressComplessivo}% — {progressTracker.readinessStatus}
                  </p>
                </div>
                <div className="h-2 bg-neutral-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      progressTracker.progressComplessivo === 100
                        ? "bg-emerald-500"
                        : progressTracker.progressComplessivo > 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${progressTracker.progressComplessivo}%` }}
                  />
                </div>
                <p className="text-[8px] text-slate-500 mt-2">
                  Gap aperti: {progressTracker.gapsCriticheRemote}
                </p>
              </div>

              {progressTracker.progressItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Gap tracking</p>
                  {progressTracker.progressItems.map((item) => (
                    <div
                      key={item.gapId}
                      className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-[9px] font-bold text-white flex-1">{item.titolo}</p>
                        <span className="text-[8px] text-slate-400">{item.status}</span>
                      </div>
                      <div className="h-1 bg-neutral-900 rounded-full mb-2">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${item.percentualeProgresso}%` }}
                        />
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="cursor-pointer text-[7px] px-2 py-0.5 rounded bg-neutral-800 text-slate-300 hover:bg-neutral-700"
                          onClick={() =>
                            setProgressTracker((t) =>
                              t
                                ? updateProgressItem(t, item.gapId, "IN_CORSO", 50, "Avviato")
                                : t
                            )
                          }
                        >
                          50%
                        </button>
                        <button
                          type="button"
                          className="cursor-pointer text-[7px] px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900"
                          onClick={() =>
                            setProgressTracker((t) =>
                              t
                                ? updateProgressItem(
                                    t,
                                    item.gapId,
                                    "COMPLETATO",
                                    100,
                                    "Completato"
                                  )
                                : t
                            )
                          }
                        >
                          Completa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Milestones</p>
                {progressTracker.milestonesRimanenti.map((m, i) => {
                  const ms = MILESTONE_STATUS_STYLES[m.status];
                  return (
                    <div
                      key={i}
                      className={`bg-neutral-950 border-l-4 ${ms.border} border border-neutral-800 rounded-lg p-2.5`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <p className="text-[9px] font-bold text-white">{m.milestone}</p>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded ${ms.badge}`}>
                          {m.status}
                        </span>
                      </div>
                      <p className="text-[8px] text-slate-400">
                        Target: {new Date(m.dataTarget).toLocaleDateString("it-IT")} ·{" "}
                        {m.criticita}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-neutral-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded-lg hover:border-neutral-600"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={assessment?.qualificazioneVerdetto === "ESCLUSORIO"}
            className={`cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
              assessment?.qualificazioneVerdetto === "ESCLUSORIO"
                ? "bg-neutral-900 border border-neutral-700 text-slate-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {assessment?.qualificazioneVerdetto === "QUALIFICATO"
              ? "Procedi a Bid/No-Bid"
              : "Valuta opzioni"}
          </button>
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
