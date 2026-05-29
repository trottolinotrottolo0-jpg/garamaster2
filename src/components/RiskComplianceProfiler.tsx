import { useState, useEffect, useCallback, type ChangeEvent } from "react";
import { X, AlertTriangle, Clock, FileText, Loader2, Upload } from "lucide-react";
import type { TenderDocument, RiskComplianceProfile } from "../types";
import {
  createRiskComplianceProfile,
  markRequirementCompleted,
  identifyCriticalComplianceItems,
  generateRiskMitigationPlan,
  requirementsFromTender,
  defaultRiskFactoriForTender,
  RISK_CLASSE_STYLES,
  analyzeAntimafiaCompliance,
  analyzeInsuranceFinancialRisk,
  buildDocumentationTrackers,
  updateDocumentationTracker,
  generateDocumentationReport,
  type AntimafiaComplianceCheck,
  type InsuranceFinancialRisk,
  type ComplianceDocumentationTracker,
} from "../lib/riskComplianceEngine";
import { requestRiskComplianceParse } from "../lib/parseRiskComplianceApi";
import {
  analyzeRiskComplianceInsights,
  generateDeepRiskAnalysis,
  analyzeComplianceDocumentationInsights,
  type DeepRiskAnalysisResult,
  type ComplianceDocumentationInsights,
} from "../lib/gemini";
import { readFileAsBase64 } from "../lib/parseSOAApi";
import { parseTenderValue } from "../lib/bidCalculations";
import { CAMCompliancePanel } from "./CAMCompliancePanel";
import { Leaf } from "lucide-react";

const LOCALSTORAGE_PROFILO_KEY = "gm_company_profile";

interface RiskComplianceProfilerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
}

type ProfilerTab = "risks" | "compliance" | "mitigation" | "financial" | "insights" | "cam";

function readAvailableCapital(): number {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_PROFILO_KEY);
    if (!raw) return 500_000;
    const profile = JSON.parse(raw) as { lastYearRevenue?: number };
    if (typeof profile.lastYearRevenue === "number" && profile.lastYearRevenue > 0) {
      return Math.round(profile.lastYearRevenue * 0.15);
    }
  } catch {
    /* ignore */
  }
  return 500_000;
}

const TRACKER_STATUS_STYLES: Record<
  ComplianceDocumentationTracker["stato"],
  string
> = {
  NOT_STARTED: "text-slate-500",
  IN_PROGRESS: "text-amber-400",
  COMPLETED: "text-emerald-400",
  OVERDUE: "text-red-400",
};

export function RiskComplianceProfiler({ isOpen, onClose, tender }: RiskComplianceProfilerProps) {
  const [profile, setProfile] = useState<RiskComplianceProfile | null>(null);
  const [selectedTab, setSelectedTab] = useState<ProfilerTab>("risks");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);

  const [antimafiaCheck, setAntimafiaCheck] = useState<AntimafiaComplianceCheck | null>(null);
  const [insuranceRisk, setInsuranceRisk] = useState<InsuranceFinancialRisk | null>(null);
  const [deepInsights, setDeepInsights] = useState<DeepRiskAnalysisResult | null>(null);
  const [documentationTrackers, setDocumentationTrackers] = useState<
    ComplianceDocumentationTracker[]
  >([]);
  const [docInsights, setDocInsights] = useState<ComplianceDocumentationInsights | null>(null);

  const refreshPart2Analysis = useCallback((prof: RiskComplianceProfile) => {
    const antimafia = analyzeAntimafiaCompliance(prof.gara);
    setAntimafiaCheck(antimafia);

    const capital = readAvailableCapital();
    const insurance = analyzeInsuranceFinancialRisk(prof.gara, capital);
    setInsuranceRisk(insurance);

    const trackers = buildDocumentationTrackers(
      prof.complianceRequirements,
      prof.checklist
    );
    setDocumentationTrackers(trackers);

    const docReport = generateDocumentationReport(trackers);
    analyzeComplianceDocumentationInsights(prof, trackers, docReport)
      .then(setDocInsights)
      .catch(() => setDocInsights(null));

    setDeepLoading(true);
    generateDeepRiskAnalysis(prof, antimafia, insurance)
      .then(setDeepInsights)
      .catch(() => setDeepInsights(null))
      .finally(() => setDeepLoading(false));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setProfile(null);
      setParseError(null);
      setSelectedTab("risks");
      setAntimafiaCheck(null);
      setInsuranceRisk(null);
      setDeepInsights(null);
      setDocumentationTrackers([]);
      setDocInsights(null);
      return;
    }

    const baseReqs = requirementsFromTender(tender);
    const baseRisks = defaultRiskFactoriForTender(tender, baseReqs);
    const prof = createRiskComplianceProfile(tender, baseReqs, baseRisks);
    setProfile(prof);
    refreshPart2Analysis(prof);

    let cancelled = false;
    setInsightsLoading(true);
    analyzeRiskComplianceInsights(prof)
      .then((insights) => {
        if (!cancelled) {
          setProfile((p) => (p ? { ...p, insightsDeepSeek: insights } : p));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, tender.id, refreshPart2Analysis]);

  const syncProfile = (next: RiskComplianceProfile) => {
    setProfile(next);
    refreshPart2Analysis(next);
  };

  if (!isOpen) return null;

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setParseError("Solo PDF supportati.");
      return;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const base64 = await readFileAsBase64(file);
      const { complianceRequirements, riskFactori } = await requestRiskComplianceParse({
        bandoPdfBase64: base64,
        fileName: file.name,
        tender,
      });

      const reqs =
        complianceRequirements.length > 0 ? complianceRequirements : requirementsFromTender(tender);
      const risks =
        riskFactori.length > 0 ? riskFactori : defaultRiskFactoriForTender(tender, reqs);

      const prof = createRiskComplianceProfile(tender, reqs, risks);
      setInsightsLoading(true);
      const insights = await analyzeRiskComplianceInsights(prof);
      syncProfile({ ...prof, insightsDeepSeek: insights });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing");
    } finally {
      setIsParsing(false);
      e.target.value = "";
      setInsightsLoading(false);
    }
  };

  const handleRequirementDocUpload = (
    requirementId: string,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const tracker = documentationTrackers.find((t) => t.requirementId === requirementId);
    if (!tracker) return;

    const updatedTracker = updateDocumentationTracker(tracker, {
      fileName: file.name,
      fileSize: file.size,
    });

    setDocumentationTrackers((prev) =>
      prev.map((t) => (t.requirementId === requirementId ? updatedTracker : t))
    );

    const updatedChecklist = markRequirementCompleted(profile.checklist, requirementId, file.name);
    syncProfile({ ...profile, checklist: updatedChecklist });
    e.target.value = "";
  };

  const criticalItems = profile ? identifyCriticalComplianceItems(profile) : [];
  const mitigationPlan = profile ? generateRiskMitigationPlan(profile) : [];
  const riskStyle = profile ? RISK_CLASSE_STYLES[profile.riskClasse] : RISK_CLASSE_STYLES.MEDIO;
  const docReport = generateDocumentationReport(documentationTrackers);

  const titlePreview =
    tender.title.length > 50 ? `${tender.title.slice(0, 50)}…` : tender.title;

  const tabs: Array<{ id: ProfilerTab; label: string }> = [
    { id: "risks", label: "Rischi" },
    { id: "compliance", label: "Compliance" },
    { id: "financial", label: "Finanziari" },
    { id: "cam", label: "CAM" },
    { id: "insights", label: "Insights" },
    { id: "mitigation", label: "Mitigation" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-start p-4 border-b border-neutral-800 shrink-0 gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Risk &amp; Compliance Profiler</h2>
            <div className="text-[9px] text-slate-400 mt-1">{titlePreview}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!profile && (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
          </div>
        )}

        {profile && (
          <>
            <div className={`p-4 border-b border-neutral-800 ${riskStyle.box}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-300 uppercase mb-1">
                    Risk level
                  </div>
                  <div className={`text-[16px] font-bold ${riskStyle.text}`}>
                    {profile.riskClasse} ({profile.riskComplessivo}/100)
                  </div>
                  {deepInsights && (
                    <div className="text-[8px] text-slate-400 mt-1">
                      Range AI: {deepInsights.scoreRischioBest}–{deepInsights.scoreRischioWorst}
                    </div>
                  )}
                </div>
                <AlertTriangle className={`w-8 h-8 ${riskStyle.icon}`} />
              </div>
            </div>

            <div className="px-4 pt-3 space-y-2 shrink-0">
              <div className="border border-dashed border-neutral-700 rounded-lg p-3 text-center">
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileUpload}
                  disabled={isParsing}
                  className="hidden"
                  id="compliance-bando-input"
                />
                <label htmlFor="compliance-bando-input" className="cursor-pointer block">
                  <FileText className="w-6 h-6 text-brand-gold mx-auto mb-1" />
                  <div className="text-[10px] text-white font-bold">
                    Carica disciplinare/bando PDF
                  </div>
                  <div className="text-[8px] text-slate-500">
                    Arricchisce requisiti e rischi (DeepSeek)
                  </div>
                </label>
              </div>
              {isParsing && (
                <div className="flex items-center gap-2 text-[9px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin text-brand-gold" />
                  Analisi compliance e rischi…
                </div>
              )}
              {parseError && <div className="text-[9px] text-red-400">{parseError}</div>}
              {(insightsLoading || deepLoading) && (
                <div className="text-[8px] text-slate-500">Analisi AI in corso…</div>
              )}
              {docReport.summary && (
                <div className="text-[8px] text-slate-400 bg-neutral-950 rounded p-2 border border-neutral-800">
                  {docInsights?.summary || docReport.summary}
                </div>
              )}
            </div>

            <div className="flex border-b border-neutral-800 shrink-0 overflow-x-auto scrollbar-thin">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedTab(id)}
                  className={`cursor-pointer shrink-0 px-3 py-2.5 text-[9px] font-bold uppercase transition-colors flex items-center justify-center gap-1 ${
                    selectedTab === id
                      ? id === "cam"
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-brand-gold border-b-2 border-brand-gold"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {id === "cam" ? <Leaf className="w-3 h-3" /> : null}
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3 overflow-y-auto scrollbar-thin flex-1">
              {selectedTab === "cam" && profile && (
                <CAMCompliancePanel tender={profile.gara} compact />
              )}

              {selectedTab === "risks" && (
                <div className="space-y-2">
                  {profile.riskFactori.map((risk) => (
                    <div
                      key={risk.id}
                      className="bg-neutral-950 border border-neutral-800 rounded-lg p-3"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="text-[10px] font-bold text-white">{risk.nome}</div>
                          <div className="text-[9px] text-slate-400">{risk.categoria}</div>
                        </div>
                        <div
                          className={`text-[10px] font-bold ${
                            risk.score >= 75
                              ? "text-red-400"
                              : risk.score >= 50
                                ? "text-amber-400"
                                : "text-emerald-400"
                          }`}
                        >
                          {risk.score}
                        </div>
                      </div>
                      <div className="text-[9px] text-slate-300 mb-2">{risk.descrizione}</div>
                      <div className="flex justify-between text-[8px] text-slate-500 mb-2">
                        <span>Probabilità: {risk.probabilita}%</span>
                        <span>Impatto: {risk.impatto}%</span>
                      </div>
                      {risk.mitigazione.length > 0 && (
                        <div className="text-[8px] text-slate-400">
                          <div className="font-bold text-emerald-400 mb-1">Mitigazione</div>
                          {risk.mitigazione.map((m, i) => (
                            <div key={i}>→ {m}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedTab === "compliance" && (
                <div className="space-y-3">
                  {criticalItems.length > 0 && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3">
                      <div className="text-[10px] font-bold text-red-400 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" />
                        {criticalItems.length} item critico/i
                      </div>
                      {criticalItems.map((item) => (
                        <div key={item.id} className="text-[9px] text-red-300 mb-1">
                          ⚠ {item.titolo}
                          {item.deadline
                            ? ` (entro ${new Date(item.deadline).toLocaleDateString("it-IT")})`
                            : ""}
                        </div>
                      ))}
                    </div>
                  )}

                  {antimafiaCheck && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3">
                      <h4 className="text-[10px] font-bold text-red-400 uppercase mb-2">
                        Compliance Antimafia
                      </h4>
                      <div className="flex gap-3 text-[8px] text-slate-400 mb-2">
                        <span>Risk sanzioni: {antimafiaCheck.riskSanzioni}/100</span>
                        <span>Risk esclusione: {antimafiaCheck.riskEsclusione}/100</span>
                      </div>
                      {antimafiaCheck.checklistItems.map((item, i) => (
                        <div
                          key={i}
                          className="text-[9px] text-slate-300 mb-2 pb-2 border-b border-neutral-800 last:border-0"
                        >
                          <div
                            className={`font-bold ${item.obbligatorio ? "text-red-400" : "text-slate-400"}`}
                          >
                            {item.titolo}
                          </div>
                          <div className="text-[8px] text-slate-500 mt-1">{item.descrizione}</div>
                          {item.obbligatorio && (
                            <div className="text-[8px] text-red-300 mt-1">
                              ⚠ {item.riskIfMissing}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                    <div className="text-[10px] font-bold text-slate-300 mb-2">
                      Progresso compliance
                    </div>
                    <div className="h-2 bg-neutral-900 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-brand-gold transition-all"
                        style={{ width: `${profile.checklist.progressoCompletamento}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {profile.checklist.itemsCompletati.length} /{" "}
                      {profile.complianceRequirements.length} completati · {docReport.summary}
                    </div>
                  </div>

                  {profile.complianceRequirements.map((req) => {
                    const isCompleted = profile.checklist.itemsCompletati.includes(req.id);
                    const deadline = profile.checklist.scadenze.find(
                      (s) => s.requirementId === req.id
                    );
                    const tracker = documentationTrackers.find(
                      (t) => t.requirementId === req.id
                    );

                    return (
                      <div
                        key={req.id}
                        className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={() => {
                              const updated = markRequirementCompleted(
                                profile.checklist,
                                req.id
                              );
                              syncProfile({ ...profile, checklist: updated });
                            }}
                            className="w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-[9px] font-bold ${
                                isCompleted ? "line-through text-slate-500" : "text-white"
                              }`}
                            >
                              {req.titolo}
                            </div>
                            <div className="text-[8px] text-slate-400 mt-0.5 line-clamp-2">
                              {req.descrizione}
                            </div>
                            {deadline && (
                              <div
                                className={`text-[8px] mt-1 flex items-center gap-1 ${
                                  deadline.stato === "CRITICA"
                                    ? "text-red-400"
                                    : deadline.stato === "ATTENZIONE"
                                      ? "text-amber-400"
                                      : "text-emerald-400"
                                }`}
                              >
                                <Clock className="w-2.5 h-2.5" />
                                {deadline.giorni} giorni
                              </div>
                            )}
                            {tracker && (
                              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-[7px] font-bold uppercase ${TRACKER_STATUS_STYLES[tracker.stato]}`}
                                >
                                  {tracker.stato.replace("_", " ")}
                                </span>
                                {tracker.latestVersion && (
                                  <span className="text-[7px] text-slate-500">
                                    v{tracker.latestVersion.version}:{" "}
                                    {tracker.latestVersion.fileName}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {req.obbligatorio && (
                            <span className="text-[7px] font-bold text-red-400 uppercase bg-red-950 px-1.5 py-0.5 rounded shrink-0">
                              MUST
                            </span>
                          )}
                        </div>
                        <div className="mt-2 pl-6">
                          <input
                            type="file"
                            id={`doc-req-${req.id}`}
                            className="hidden"
                            onChange={(e) => handleRequirementDocUpload(req.id, e)}
                          />
                          <label
                            htmlFor={`doc-req-${req.id}`}
                            className="cursor-pointer inline-flex items-center gap-1 text-[8px] text-brand-gold hover:text-yellow-300"
                          >
                            <Upload className="w-3 h-3" />
                            Carica documento
                          </label>
                        </div>
                      </div>
                    );
                  })}

                  {docInsights && docInsights.priorita.length > 0 && (
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                      <div className="text-[10px] font-bold text-slate-300 mb-2">
                        Priorità documentazione (AI)
                      </div>
                      {docInsights.priorita.map((p, i) => (
                        <div key={i} className="text-[9px] text-slate-400">
                          → {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedTab === "financial" && insuranceRisk && (
                <div className="space-y-3">
                  <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                    <h4 className="text-[10px] font-bold text-brand-gold uppercase mb-2">
                      Financial requirements
                    </h4>
                    <div className="space-y-2 text-[9px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Importo gara</span>
                        <span className="text-white font-bold">
                          {parseTenderValue(tender.value) > 0
                            ? `€${parseTenderValue(tender.value).toLocaleString("it-IT")}`
                            : tender.value}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Garanzia fideiussoria</span>
                        <span className="text-white font-bold">
                          €{insuranceRisk.importoGaranziaRichiesto.toLocaleString("it-IT")}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">% garanzia</span>
                        <span className="text-white">
                          {insuranceRisk.percentualeGaranzia.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Capitale circolante immobilizzato</span>
                        <span className="text-amber-400 font-bold">
                          €{insuranceRisk.stimaCapitaleCircolante.toLocaleString("it-IT")}
                        </span>
                      </div>
                      <div className="flex gap-2 text-[8px] text-slate-500 pt-1">
                        {insuranceRisk.richiediAssicurazioneRC && <span>RC ✓</span>}
                        {insuranceRisk.richiediAssicurazioneFidelity && <span>Fideiussoria ✓</span>}
                        {insuranceRisk.richiediAssicurabilita && <span>Cantiere ✓</span>}
                      </div>
                    </div>
                  </div>

                  <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                    <h4 className="text-[10px] font-bold text-slate-300 uppercase mb-2">
                      Risk finanziari
                    </h4>
                    <div className="space-y-2 text-[9px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Risk finanziario</span>
                        <span
                          className={`font-bold ${insuranceRisk.riskFinanziario > 60 ? "text-red-400" : "text-amber-400"}`}
                        >
                          {insuranceRisk.riskFinanziario}/100
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Risk liquidazione (PA)</span>
                        <span
                          className={`font-bold ${insuranceRisk.riskLiquidazione > 70 ? "text-red-400" : "text-amber-400"}`}
                        >
                          {insuranceRisk.riskLiquidazione.toFixed(0)}/100
                        </span>
                      </div>
                    </div>
                  </div>

                  {insuranceRisk.raccomandazioni.length > 0 && (
                    <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3">
                      <h4 className="text-[10px] font-bold text-emerald-400 uppercase mb-2">
                        Raccomandazioni finanziarie
                      </h4>
                      {insuranceRisk.raccomandazioni.map((rac, i) => (
                        <div key={i} className="text-[9px] text-slate-300 mb-1.5">
                          → {rac}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedTab === "insights" && (
                <div className="space-y-3">
                  {deepLoading && (
                    <div className="flex items-center gap-2 text-[9px] text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analisi approfondita…
                    </div>
                  )}
                  {deepInsights && (
                    <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
                      <h4 className="text-[10px] font-bold text-blue-400 uppercase mb-2">
                        Analisi approfondita (AI)
                      </h4>
                      <div className="text-[9px] text-slate-300 mb-3">{deepInsights.riepilogo}</div>

                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="bg-blue-950 rounded p-2">
                          <div className="font-bold text-blue-400 mb-1">Risk score range</div>
                          <div className="text-slate-300">
                            Best:{" "}
                            <span className="text-emerald-400 font-bold">
                              {deepInsights.scoreRischioBest}
                            </span>
                          </div>
                          <div className="text-slate-300">
                            Worst:{" "}
                            <span className="text-red-400 font-bold">
                              {deepInsights.scoreRischioWorst}
                            </span>
                          </div>
                        </div>
                        <div className="bg-blue-950 rounded p-2">
                          <div className="font-bold text-blue-400 mb-1">Mitigation potential</div>
                          <div className="text-slate-300">
                            Riduzione:{" "}
                            <span className="text-emerald-400 font-bold">
                              {deepInsights.scoreRischioWorst - deepInsights.scoreRischioBest} pt
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2 text-[9px]">
                        {deepInsights.principaliRischi.length > 0 && (
                          <div>
                            <div className="font-bold text-red-400 mb-1">Principali rischi</div>
                            {deepInsights.principaliRischi.map((r, i) => (
                              <div key={i} className="text-slate-300">
                                → {r}
                              </div>
                            ))}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-emerald-400 mb-1">
                            Requisiti critici (non negoziabili)
                          </div>
                          {deepInsights.requisitiCritici.map((req, i) => (
                            <div key={i} className="text-slate-300">
                              → {req}
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="font-bold text-slate-300 mb-1">Raccomandazioni</div>
                          {deepInsights.raccomandazioni.map((rec, i) => (
                            <div key={i} className="text-slate-300">
                              → {rec}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {!deepInsights && !deepLoading && (
                    <p className="text-[9px] text-slate-500">Analisi non disponibile.</p>
                  )}
                </div>
              )}

              {selectedTab === "mitigation" && (
                <div className="space-y-2">
                  {mitigationPlan.length === 0 ? (
                    <p className="text-[9px] text-slate-500">
                      Nessun piano mitigation — rischi sotto soglia media.
                    </p>
                  ) : (
                    mitigationPlan.map((plan) => (
                      <div
                        key={plan.riskId}
                        className="bg-neutral-950 border border-neutral-800 rounded-lg p-3"
                      >
                        <div className="text-[10px] font-bold text-amber-400 mb-2">
                          {plan.riskNome}
                        </div>
                        <div className="space-y-1 text-[9px]">
                          {plan.azioni.map((azione, i) => (
                            <div key={i} className="text-slate-300">
                              → {azione}
                            </div>
                          ))}
                          <div className="text-[8px] text-slate-500 mt-2 pt-2 border-t border-neutral-700">
                            <span className="font-bold">Responsabile:</span> {plan.responsabile} ·{" "}
                            <span className="font-bold">Timeline:</span> {plan.timeline}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-neutral-800 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded hover:border-neutral-600 transition-colors"
              >
                Chiudi
              </button>
              <button
                type="button"
                onClick={() => {
                  const lines = [
                    `Risk & Compliance — ${tender.title}`,
                    `Classe: ${profile.riskClasse} (${profile.riskComplessivo}/100)`,
                    deepInsights
                      ? `Range AI: ${deepInsights.scoreRischioBest}–${deepInsights.scoreRischioWorst}`
                      : "",
                    "",
                    "ANTIMafia:",
                    ...(antimafiaCheck?.checklistItems.map((i) => `- ${i.titolo}`) ?? []),
                    "",
                    "MITIGATION PLAN:",
                    ...mitigationPlan.flatMap((p) => [
                      `- ${p.riskNome}`,
                      ...p.azioni.map((a) => `  • ${a}`),
                    ]),
                  ];
                  void navigator.clipboard.writeText(lines.join("\n"));
                }}
                className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-brand-gold text-black rounded hover:bg-yellow-400 transition-colors flex items-center justify-center gap-1"
              >
                <FileText className="w-3 h-3" />
                Export plan
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
