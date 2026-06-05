import { useState, useEffect, useMemo } from "react";
import { X, RefreshCw, CheckCircle, XCircle, AlertTriangle, Loader2, Clock, Zap, CheckCircle2 } from "lucide-react";
import type { TenderDocument, CompanyProfile, BidNoBidResult, WinningPattern } from "../types";
import { runBidNoBid, analyzeFitStrategicInsights, type FitStrategicInsights } from "../lib/gemini";
import { checkSOAQualificationForTender } from "../lib/bidQualificationEngine";
import {
  calculateStrategicFit,
  combineFitWithPattern,
  FIT_RECOMMENDATION_CLASS,
  FIT_RECOMMENDATION_LABEL,
  FIT_SUPER_VERDICT_CLASS,
} from "../lib/fitEngineStrategic";
import { matchGaraToPatterns } from "../lib/winningPatternEngine";
import { ExplainabilityLayer } from "./ExplainabilityLayer";
import { WinningPatternViewer } from "./WinningPatternViewer";
import { DelayPenaltyExposureAnalyzer } from "./DelayPenaltyExposureAnalyzer";
import { VariantClaimsRiskAnalyzer } from "./VariantClaimsRiskAnalyzer";
import { PreSubmissionComplianceAudit } from "./PreSubmissionComplianceAudit";
import { QualificationReadinessHub } from "./QualificationReadinessHub";
import {
  assessQualification,
  defaultQualificationRequirementsForTender,
  QUALIFICATION_VERDICT_STYLES,
  generateRTIRecommendations,
  generateAccelerationStrategies,
  daysUntilTenderDeadlineForQualification,
} from "../lib/qualificationEngine";
import {
  createPreSubmissionAudit,
  generateFinalSubmissionChecklist,
  generateExpiryReminders,
  FINAL_VERDICT_STYLES,
} from "../lib/preSubmissionAuditEngine";
import { parseTenderValue } from "../lib/bidCalculations";
import {
  createDelayPenaltyExposure,
  defaultPenaltyClausesForTender,
  defaultCompanyDelayProfile,
  estimateMargineForTender,
  DELAY_RISK_STYLES,
  TIMELINE_CRITICITA_STYLES,
  analyzeTimelineRisk,
  isDelayTrapGara,
} from "../lib/delayPenaltyEngine";
import {
  createVariantClaimsRiskExposure,
  defaultVariantClausesForTender,
  defaultClaimsClausesForTender,
  defaultCompanyVariantHistory,
  VARIANT_RISK_STYLES,
  identifyProblematicVariantClauses,
  analyzeClaimsRisk,
  isVariantTrapGara,
  CLAIMS_RISK_LEVEL_STYLES,
} from "../lib/variantClaimsEngine";

interface BidNoBidEngineProps {
  tender: TenderDocument;
  isOpen: boolean;
  onClose: () => void;
  winningPatterns?: WinningPattern[];
  isAnalyzingPatterns?: boolean;
  companyProfile?: CompanyProfile | null;
  onShowCAM?: () => void;
  onShowDelayAnalysis?: () => void;
  onShowVariantsAnalysis?: () => void;
  onShowAudit?: () => void;
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

export function BidNoBidEngine({
  tender,
  isOpen,
  onClose,
  winningPatterns = [],
  isAnalyzingPatterns = false,
  companyProfile: companyProfileProp,
  onShowCAM,
  onShowDelayAnalysis,
  onShowVariantsAnalysis,
  onShowAudit,
}: BidNoBidEngineProps) {
  const similarityScores = useMemo(
    () => (winningPatterns.length > 0 ? matchGaraToPatterns(tender, winningPatterns) : []),
    [tender, winningPatterns]
  );
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [result, setResult] = useState<BidNoBidResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitInsights, setFitInsights] = useState<FitStrategicInsights | null>(null);
  const [fitInsightsLoading, setFitInsightsLoading] = useState(false);
  const [isDelayAnalyzerOpen, setIsDelayAnalyzerOpen] = useState(false);
  const [isVariantAnalyzerOpen, setIsVariantAnalyzerOpen] = useState(false);
  const [isComplianceAuditOpen, setIsComplianceAuditOpen] = useState(false);
  const [auditPassed, setAuditPassed] = useState(false);
  const [isQualificationHubOpen, setIsQualificationHubOpen] = useState(false);
  const [qualificationVerdict, setQualificationVerdict] = useState<string | null>(null);

  useEffect(() => {
    setQualificationVerdict(null);
  }, [tender.id]);

  const delayExposure = useMemo(() => {
    if (!profile) return null;
    const penalties = defaultPenaltyClausesForTender(tender);
    const delayProf = defaultCompanyDelayProfile(profile, tender);
    const margine = estimateMargineForTender(tender, profile);
    return createDelayPenaltyExposure(tender, penalties, delayProf, margine);
  }, [tender, profile]);

  const delayTimeline = useMemo(() => {
    if (!delayExposure) return null;
    return analyzeTimelineRisk(
      tender,
      delayExposure.durationGiorni,
      delayExposure.companyProfile
    );
  }, [tender, delayExposure]);

  const delayTrap = delayExposure ? isDelayTrapGara(delayExposure) : false;

  const variantExposure = useMemo(() => {
    if (!profile) return null;
    const variants = defaultVariantClausesForTender(tender);
    const claims = defaultClaimsClausesForTender();
    const history = defaultCompanyVariantHistory(tender, profile);
    return createVariantClaimsRiskExposure(tender, variants, claims, history);
  }, [tender, profile]);

  const problematicVariantCount = useMemo(() => {
    if (!variantExposure) return 0;
    return identifyProblematicVariantClauses(variantExposure.variantClauses).length;
  }, [variantExposure]);

  const claimsRisk = useMemo(() => {
    if (!variantExposure) return null;
    return analyzeClaimsRisk(tender);
  }, [tender, variantExposure]);

  const variantTrap = variantExposure ? isVariantTrapGara(variantExposure) : false;

  const qualificationPreview = useMemo(() => {
    if (!profile) return null;
    const requirements = defaultQualificationRequirementsForTender(tender);
    return assessQualification(tender, requirements, profile);
  }, [tender, profile]);

  const qualificationRtiCount = useMemo(
    () => (qualificationPreview ? generateRTIRecommendations(qualificationPreview).length : 0),
    [qualificationPreview]
  );

  const qualificationAccelCount = useMemo(() => {
    if (!qualificationPreview) return 0;
    return generateAccelerationStrategies(
      qualificationPreview,
      daysUntilTenderDeadlineForQualification(tender)
    ).length;
  }, [qualificationPreview, tender]);

  const complianceAuditPreview = useMemo(() => {
    if (!profile) return null;
    const audit = createPreSubmissionAudit(tender, profile);
    const importo = parseTenderValue(tender.value);
    const margine = estimateMargineForTender(tender, profile);
    const finalCheck = generateFinalSubmissionChecklist(audit, importo, margine);
    const reminders = generateExpiryReminders(audit.checklistItems);
    return { audit, finalCheck, reminders };
  }, [tender, profile]);

  const strategicFit = useMemo(
    () =>
      profile?.fitStrategicProfile
        ? calculateStrategicFit(tender, profile.fitStrategicProfile)
        : null,
    [tender, profile?.fitStrategicProfile]
  );

  const bestPatternMatch = useMemo(() => {
    if (similarityScores.length === 0) return undefined;
    return similarityScores.reduce((best, s) =>
      s.similarita > best.similarita ? s : best
    );
  }, [similarityScores]);

  const fitPlusPattern = useMemo(() => {
    if (!strategicFit) return null;
    return combineFitWithPattern(
      strategicFit,
      bestPatternMatch?.similarita,
      bestPatternMatch?.predictionWinRate
    );
  }, [strategicFit, bestPatternMatch]);

  useEffect(() => {
    if (!isOpen || loading || !profile?.fitStrategicProfile) {
      setFitInsights(null);
      setFitInsightsLoading(false);
      return;
    }

    let cancelled = false;
    setFitInsightsLoading(true);
    setFitInsights(null);

    analyzeFitStrategicInsights(tender, profile.fitStrategicProfile)
      .then((data) => {
        if (!cancelled) setFitInsights(data);
      })
      .catch(() => {
        if (!cancelled) setFitInsights(null);
      })
      .finally(() => {
        if (!cancelled) setFitInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, loading, tender, profile?.fitStrategicProfile]);

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
    setAuditPassed(false);
  }, [tender.id]);

  useEffect(() => {
    if (!isOpen) return;

    let prof: CompanyProfile | null = companyProfileProp ?? null;
    if (!prof) {
      try {
        const stored = localStorage.getItem("gm_company_profile");
        if (stored) prof = JSON.parse(stored) as CompanyProfile;
      } catch {
        prof = null;
      }
    }

    if (!prof) {
      setProfile(null);
      setResult(null);
      setError(null);
      return;
    }

    setProfile(prof);
    loadAndRun(prof);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tender.id, companyProfileProp]);

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

          {profile && !loading && (
            <div className="space-y-2">
              {!qualificationVerdict ? (
                <button
                  type="button"
                  onClick={() => setIsQualificationHubOpen(true)}
                  className="cursor-pointer flex items-center gap-2 text-[11px] font-bold px-3 py-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-600 hover:bg-blue-600/30 transition-colors w-full justify-center"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Check qualificazione PRIMA
                </button>
              ) : (
                <div
                  className={`text-[10px] font-bold px-3 py-2 rounded-lg text-center border ${
                    qualificationVerdict === "QUALIFICATO"
                      ? "bg-emerald-600/20 text-emerald-400 border-emerald-600"
                      : qualificationVerdict === "ESCLUSORIO"
                        ? "bg-red-600/20 text-red-400 border-red-600"
                        : "bg-amber-600/20 text-amber-400 border-amber-600"
                  }`}
                >
                  Qualificazione: {qualificationVerdict.replace(/_/g, " ")}
                  <button
                    type="button"
                    onClick={() => setIsQualificationHubOpen(true)}
                    className="cursor-pointer block mx-auto mt-1 text-[8px] text-slate-400 hover:text-white underline"
                  >
                    Rivedi hub
                  </button>
                </div>
              )}
              {qualificationPreview && !qualificationVerdict && (
                <p className="text-[8px] text-slate-500 text-center">
                  Anteprima:{" "}
                  <span
                    className={
                      QUALIFICATION_VERDICT_STYLES[qualificationPreview.qualificazioneVerdetto]
                        .text
                    }
                  >
                    {qualificationPreview.qualificazioneVerdetto.replace(/_/g, " ")}
                  </span>
                  {" · "}
                  {qualificationPreview.compliancePercent}% conformi
                </p>
              )}

              {qualificationPreview &&
                qualificationPreview.gapsCritici.length > 0 &&
                qualificationPreview.qualificazioneVerdetto !== "QUALIFICATO" && (
                  <div
                    className={`rounded-xl p-3 border space-y-2 ${
                      qualificationPreview.qualificazioneVerdetto === "ESCLUSORIO"
                        ? "bg-red-950/30 border-red-800/60"
                        : "bg-amber-950/20 border-amber-800/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[9px] font-bold uppercase flex items-center gap-1 ${
                          qualificationPreview.qualificazioneVerdetto === "ESCLUSORIO"
                            ? "text-red-400"
                            : "text-amber-400"
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Qualification warning
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsQualificationHubOpen(true)}
                        className="cursor-pointer text-[8px] font-bold text-blue-400 hover:text-blue-300"
                      >
                        Hub →
                      </button>
                    </div>
                    <p className="text-[8px] text-slate-300">
                      {qualificationPreview.gapsCritici.length} gap ·{" "}
                      {qualificationRtiCount > 0
                        ? `${qualificationRtiCount} opzioni RTI`
                        : "RTI non applicabile"}
                      {qualificationAccelCount > 0 &&
                        ` · ${qualificationAccelCount} strategie accelerate`}
                    </p>
                    <p className="text-[8px] text-red-300/90 line-clamp-2">
                      {qualificationPreview.gapsCritici[0]?.gap}
                    </p>
                    {qualificationPreview.qualificazioneVerdetto === "ESCLUSORIO" && (
                      <p className="text-[8px] text-red-400 font-bold">
                        Blocco partecipazione finché non regolarizzi requisiti esclusori.
                      </p>
                    )}
                  </div>
                )}
            </div>
          )}

          {/* Winning patterns */}
          {(winningPatterns.length > 0 || isAnalyzingPatterns) && !loading && profile && (
            <WinningPatternViewer
              patterns={winningPatterns}
              similarityScores={similarityScores}
              isLoading={isAnalyzingPatterns}
            />
          )}

          {delayExposure && !loading && profile && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9px] font-bold text-amber-400 uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Esposizione ritardo &amp; penalità
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onShowDelayAnalysis ? onShowDelayAnalysis() : setIsDelayAnalyzerOpen(true)
                  }
                  className="cursor-pointer text-[8px] font-bold text-amber-400 hover:text-amber-300"
                >
                  Analisi completa →
                </button>
              </div>

              {delayTrap && (
                <div className="bg-red-950/30 border border-red-800/60 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-[8px] text-red-300">
                    <span className="font-bold text-red-400">Delay trap:</span> penalità attesa o
                    margine residuo rendono la gara ad alto rischio. Valuta no-bid o negoziazione
                    clausole prima dell&apos;offerta.
                  </div>
                </div>
              )}

              <div
                className={`text-[9px] rounded-lg p-2 border ${
                  DELAY_RISK_STYLES[delayExposure.riskClasse].box
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`font-bold ${DELAY_RISK_STYLES[delayExposure.riskClasse].text}`}
                  >
                    {delayExposure.riskClasse}
                  </span>
                  <span className="text-white font-mono text-[10px]">
                    €{delayExposure.penalitaAttesa.toLocaleString("it-IT")} pen.
                  </span>
                </div>
                <div className="text-[8px] text-slate-400">
                  Margine dopo ritardo: €
                  {delayExposure.margineDopoRitardo.toLocaleString("it-IT")} · P(ritardo){" "}
                  {delayExposure.probabilitaRitardo}%
                </div>
              </div>

              {delayTimeline && (
                <div
                  className={`text-[8px] rounded-lg p-2 border ${
                    TIMELINE_CRITICITA_STYLES[delayTimeline.criticita].box
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span
                      className={`font-bold uppercase ${
                        TIMELINE_CRITICITA_STYLES[delayTimeline.criticita].text
                      }`}
                    >
                      Timeline {delayTimeline.criticita}
                    </span>
                    <span className="text-blue-400 font-mono">
                      +{delayTimeline.bufferSuggerito} gg buffer
                    </span>
                  </div>
                  {delayTimeline.faseRischiosa && (
                    <div className="text-slate-400">
                      Fase critica: {delayTimeline.faseRischiosa.nome} (+
                      {Math.round(delayTimeline.faseRischiosa.deltaPercent * 100)}% storico)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {variantExposure && !loading && profile && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9px] font-bold text-orange-400 uppercase flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Varianti &amp; claims
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onShowVariantsAnalysis
                      ? onShowVariantsAnalysis()
                      : setIsVariantAnalyzerOpen(true)
                  }
                  className="cursor-pointer text-[8px] font-bold text-orange-400 hover:text-orange-300"
                >
                  Analisi completa →
                </button>
              </div>

              {(variantTrap || variantExposure.riskClasse === "CRITICO") && (
                <div className="bg-red-950/30 border border-red-800/60 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-[8px] text-red-300">
                    <span className="font-bold text-red-400">Variant trap:</span> esposizione varianti/claims
                    critica. Negozia clausole o valuta no-bid prima dell&apos;offerta.
                  </div>
                </div>
              )}

              <div
                className={`text-[9px] rounded-lg p-2 border ${
                  VARIANT_RISK_STYLES[variantExposure.riskClasse].box
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`font-bold ${VARIANT_RISK_STYLES[variantExposure.riskClasse].text}`}
                  >
                    {variantExposure.riskClasse}
                  </span>
                  <span className="text-white font-mono text-[10px]">
                    €{variantExposure.esposizioneTotale.toLocaleString("it-IT")}
                  </span>
                </div>
                <div className="text-[8px] text-slate-400">
                  {variantExposure.numeroVariantiStimate} varianti ·{" "}
                  {variantExposure.numeroClaimsAttesi} claims · P(var){" "}
                  {variantExposure.probabilitaVariantRichiesta}%
                  {problematicVariantCount > 0 &&
                    ` · ${problematicVariantCount} clausole critiche`}
                </div>
              </div>

              {claimsRisk && (
                <div
                  className={`text-[8px] rounded-lg p-2 border ${
                    claimsRisk.riskClaimsAlti
                      ? CLAIMS_RISK_LEVEL_STYLES.alto.box
                      : CLAIMS_RISK_LEVEL_STYLES.medio.box
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span
                      className={`font-bold uppercase ${
                        claimsRisk.riskClaimsAlti
                          ? CLAIMS_RISK_LEVEL_STYLES.alto.text
                          : CLAIMS_RISK_LEVEL_STYLES.medio.text
                      }`}
                    >
                      Claims {claimsRisk.riskClaimsAlti ? "ALTO" : "MEDIO"}
                    </span>
                    <span className="text-amber-400 font-mono">
                      €{claimsRisk.estimatedClaimsValue.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="text-slate-400">
                    {claimsRisk.historicoSimilari.percentualeProgetti_ConClaims}% progetti con
                    claims · {claimsRisk.historicoSimilari.percentualeClaimsApprovati}% approvati
                  </div>
                </div>
              )}
            </div>
          )}

          {profile?.soaAttuale && !loading && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
              <div className="text-[9px] font-bold text-brand-gold uppercase mb-2">
                Verifica qualificazione SOA
              </div>
              {(() => {
                const qual = checkSOAQualificationForTender(profile.soaAttuale, tender);
                return (
                  <div
                    className={`text-[9px] ${qual.isQualified ? "text-emerald-400" : "text-red-400"}`}
                  >
                    <div className="font-bold mb-1">
                      {qual.isQualified ? "✓ Qualificati" : "✗ Non qualificati"}
                    </div>
                    <div className="text-slate-300">{qual.recommendation}</div>
                    {qual.percentualeCopertura > 0 && (
                      <div className="mt-1 text-[8px] text-slate-400">
                        Copertura: {qual.percentualeCopertura.toFixed(0)}% dell&apos;importo
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {strategicFit && !loading && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-3">
              <h4 className="text-[9px] font-bold text-brand-gold uppercase">
                Allineamento strategico
              </h4>
              <div
                className={`text-[9px] space-y-1 ${FIT_RECOMMENDATION_CLASS[strategicFit.recommendation]}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold">
                    {FIT_RECOMMENDATION_LABEL[strategicFit.recommendation]}
                  </span>
                  <span className="font-mono text-[10px] font-bold text-white">
                    {strategicFit.scoreComplessivo}/100
                  </span>
                </div>
                <div className="text-slate-300 text-[8px]">{strategicFit.motivazione}</div>
                <div className="flex gap-3 text-[8px] text-slate-500 font-mono">
                  <span>Nicchia {strategicFit.breakdownScore.nicchiaMatch}/50</span>
                  <span>Area {strategicFit.breakdownScore.areaMatch}/30</span>
                  <span>Importo {strategicFit.breakdownScore.importoMatch}/20</span>
                </div>
                {strategicFit.nicchieMatching.length > 0 && (
                  <div className="text-[8px] text-slate-400">
                    ✓ Nicchie: {strategicFit.nicchieMatching.map((n) => n.nome).join(", ")}
                  </div>
                )}
                {strategicFit.areeMatching.length > 0 && (
                  <div className="text-[8px] text-slate-400">
                    ✓ Aree: {strategicFit.areeMatching.map((a) => a.regione).join(", ")}
                  </div>
                )}
              </div>

              {fitPlusPattern && (
                <div className="border-t border-neutral-800 pt-2">
                  <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">
                    Fit + Winning pattern
                  </div>
                  <div
                    className={`text-[9px] ${FIT_SUPER_VERDICT_CLASS[fitPlusPattern.verdict]}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold">{fitPlusPattern.verdict.replace(/_/g, " ")}</span>
                      <span className="font-mono text-white">
                        Super {fitPlusPattern.superScore}/100
                      </span>
                    </div>
                    <div className="text-[8px] text-slate-400 mt-0.5">
                      Fit {fitPlusPattern.fitScore} · Pattern {fitPlusPattern.patternScore}
                    </div>
                    <div className="text-[8px] text-slate-300 mt-1">{fitPlusPattern.motivazione}</div>
                  </div>
                </div>
              )}

              <div className="border-t border-neutral-800 pt-2">
                <h4 className="text-[9px] font-bold text-brand-gold uppercase mb-2">
                  Insight strategici
                </h4>
                {fitInsightsLoading && (
                  <div className="flex items-center gap-2 text-[9px] text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin text-brand-gold" />
                    Analisi strategica DeepSeek...
                  </div>
                )}
                {!fitInsightsLoading && fitInsights && (
                  <div className="space-y-2 text-[9px]">
                    {fitInsights.spiegazione && (
                      <p className="text-[8px] text-slate-400 leading-relaxed">
                        {fitInsights.spiegazione}
                      </p>
                    )}
                    {fitInsights.opportunita.length > 0 && (
                      <div>
                        <div className="text-emerald-400 mb-1">Opportunità</div>
                        <ul className="space-y-0.5 ml-2">
                          {fitInsights.opportunita.map((opp, i) => (
                            <li key={i} className="text-slate-300">
                              • {opp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fitInsights.rischi.length > 0 && (
                      <div>
                        <div className="text-amber-400 mb-1">Rischi strategici</div>
                        <ul className="space-y-0.5 ml-2">
                          {fitInsights.rischi.map((risk, i) => (
                            <li key={i} className="text-slate-300">
                              ⚠ {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fitInsights.azioni.length > 0 && (
                      <div>
                        <div className="text-blue-400 mb-1">Azioni consigliate</div>
                        <ul className="space-y-0.5 ml-2">
                          {fitInsights.azioni.map((azione, i) => (
                            <li key={i} className="text-slate-300">
                              → {azione}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
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

              {/* Capacity Detail */}
              {result.capacitaDetail && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                      Analisi capacità operativa
                    </h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                      result.capacitaDetail.esito === "CAPACITA_PIENA"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                        : result.capacitaDetail.esito === "CAPACITA_SUFFICIENTE"
                        ? "bg-blue-950/40 border-blue-800 text-blue-400"
                        : result.capacitaDetail.esito === "CAPACITA_LIMITATA"
                        ? "bg-amber-950/40 border-amber-800 text-amber-400"
                        : "bg-red-950/40 border-red-800 text-red-400"
                    }`}>
                      {result.capacitaDetail.esito.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className="text-xl font-extrabold text-brand-gold font-mono">
                        {result.capacitaDetail.squadreDisponibili}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">squadre libere</p>
                    </div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className="text-xl font-extrabold text-white font-mono">
                        {result.capacitaDetail.fabbisognoSquadreGara}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">squadre necessarie</p>
                    </div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className={`text-xl font-extrabold font-mono ${
                        result.capacitaDetail.rischioSaturazione === "basso" ? "text-emerald-400"
                        : result.capacitaDetail.rischioSaturazione === "medio" ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {result.capacitaDetail.rischioSaturazione}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">rischio saturazione</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { label: "Carico attuale", pct: result.capacitaDetail.caricoAttualePercent },
                      { label: "Carico + questa gara", pct: result.capacitaDetail.caricoDopoGaraPercent },
                    ].map(({ label, pct }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">{label}</span>
                          <span className={`font-mono font-bold ${pct < 70 ? "text-emerald-400" : pct < 85 ? "text-amber-400" : "text-red-400"}`}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${pct < 70 ? "bg-emerald-600" : pct < 85 ? "bg-amber-500" : "bg-red-600"}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{result.capacitaDetail.motivazione}</p>

                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-brand-gold uppercase block mb-0.5">Azione consigliata</span>
                    <p className="text-xs text-slate-300">{result.capacitaDetail.azioneConsigliata}</p>
                  </div>
                </div>
              )}

              {/* Lavori in corso Detail */}
              {result.lavoriInCorsoDetail && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                      Analisi lavori in corso
                    </h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                      result.lavoriInCorsoDetail.esito === "NESSUN_CONFLITTO"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                        : result.lavoriInCorsoDetail.esito === "CONFLITTO_GESTIBILE"
                        ? "bg-blue-950/40 border-blue-800 text-blue-400"
                        : result.lavoriInCorsoDetail.esito === "CONFLITTO_CRITICO"
                        ? "bg-amber-950/40 border-amber-800 text-amber-400"
                        : "bg-red-950/40 border-red-800 text-red-400"
                    }`}>
                      {result.lavoriInCorsoDetail.esito.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <span className="text-slate-500 uppercase font-bold block mb-1">Cantieri critici</span>
                      {result.lavoriInCorsoDetail.cantieriCritici.length > 0
                        ? result.lavoriInCorsoDetail.cantieriCritici.map((c, i) => (
                            <div key={i} className="text-amber-400 font-mono bg-amber-950/20 border border-amber-900/40 px-2 py-1 rounded mb-1">{c}</div>
                          ))
                        : <span className="text-emerald-400 italic">Nessuno</span>
                      }
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase font-bold block mb-1">Risorse sottratte</span>
                      {result.lavoriInCorsoDetail.risorseSottratte.length > 0
                        ? result.lavoriInCorsoDetail.risorseSottratte.map((r, i) => (
                            <div key={i} className="text-slate-300 font-mono text-[10px] bg-neutral-900 border border-neutral-700 px-2 py-1 rounded mb-1">{r}</div>
                          ))
                        : <span className="text-emerald-400 italic">Nessuna</span>
                      }
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{result.lavoriInCorsoDetail.motivazione}</p>

                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-brand-gold uppercase block mb-0.5">Azione consigliata</span>
                    <p className="text-xs text-slate-300">{result.lavoriInCorsoDetail.azioneConsigliata}</p>
                  </div>
                </div>
              )}

              {/* Tempi Detail */}
              {result.tempiDetail && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                      Analisi tempi
                    </h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                      result.tempiDetail.esito === "TEMPI_OTTIMALI"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                        : result.tempiDetail.esito === "TEMPI_ACCETTABILI"
                        ? "bg-blue-950/40 border-blue-800 text-blue-400"
                        : result.tempiDetail.esito === "TEMPI_STRETTI"
                        ? "bg-amber-950/40 border-amber-800 text-amber-400"
                        : "bg-red-950/40 border-red-800 text-red-400"
                    }`}>
                      {result.tempiDetail.esito.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className="text-xl font-extrabold text-brand-gold font-mono">
                        {result.tempiDetail.durataGaraStimataSettimane}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">settimane gara</p>
                    </div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className={`text-xl font-extrabold font-mono ${result.tempiDetail.preparazioneRealistica ? "text-emerald-400" : "text-red-400"}`}>
                        {result.tempiDetail.tempoPreparazioneDisponibileGiorni}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">gg disponibili</p>
                    </div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className="text-xl font-extrabold text-white font-mono">
                        {result.tempiDetail.tempoPreparazioneNecessarioGiorni}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">gg necessari</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border ${
                    result.tempiDetail.preparazioneRealistica
                      ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                      : "bg-red-950/40 border-red-800 text-red-400"
                  }`}>
                    {result.tempiDetail.preparazioneRealistica
                      ? "✓ Preparazione offerta realistica nei tempi"
                      : "✗ Tempo insufficiente per preparare l'offerta"}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{result.tempiDetail.motivazione}</p>

                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-brand-gold uppercase block mb-0.5">Azione consigliata</span>
                    <p className="text-xs text-slate-300">{result.tempiDetail.azioneConsigliata}</p>
                  </div>
                </div>
              )}

              {/* Rischio Operativo Detail */}
              {result.rischioOperativoDetail && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                      Analisi rischio operativo
                    </h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                      result.rischioOperativoDetail.esito === "RISCHIO_BASSO"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                        : result.rischioOperativoDetail.esito === "RISCHIO_ACCETTABILE"
                        ? "bg-blue-950/40 border-blue-800 text-blue-400"
                        : result.rischioOperativoDetail.esito === "RISCHIO_ELEVATO"
                        ? "bg-amber-950/40 border-amber-800 text-amber-400"
                        : "bg-red-950/40 border-red-800 text-red-400"
                    }`}>
                      {result.rischioOperativoDetail.esito.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className={`text-xl font-extrabold font-mono ${
                        result.rischioOperativoDetail.scoreRischioOperativo < 25 ? "text-emerald-400"
                        : result.rischioOperativoDetail.scoreRischioOperativo < 50 ? "text-blue-400"
                        : result.rischioOperativoDetail.scoreRischioOperativo < 75 ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {result.rischioOperativoDetail.scoreRischioOperativo}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">score rischio</p>
                    </div>
                    {[
                      { label: "logistico", val: result.rischioOperativoDetail.rischioLogistico },
                      { label: "tempistico", val: result.rischioOperativoDetail.rischioTempistico },
                      { label: "subappalto", val: result.rischioOperativoDetail.rischioSubappalto },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                        <span className={`text-sm font-extrabold font-mono ${
                          val === "basso" ? "text-emerald-400" : val === "medio" ? "text-amber-400" : "text-red-400"
                        }`}>{val}</span>
                        <p className="text-[9px] text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <span className="text-slate-500 uppercase font-bold block mb-1">Fattori di rischio</span>
                      {result.rischioOperativoDetail.fattoriRischio.map((f, i) => (
                        <div key={i} className="flex items-start gap-1.5 mb-1">
                          <span className="text-red-400 shrink-0">✗</span>
                          <span className="text-slate-300">{f}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase font-bold block mb-1">Fattori mitigazione</span>
                      {result.rischioOperativoDetail.fattoriMitigazione.map((f, i) => (
                        <div key={i} className="flex items-start gap-1.5 mb-1">
                          <span className="text-emerald-400 shrink-0">✓</span>
                          <span className="text-slate-300">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{result.rischioOperativoDetail.motivazione}</p>
                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-brand-gold uppercase block mb-0.5">Azione consigliata</span>
                    <p className="text-xs text-slate-300">{result.rischioOperativoDetail.azioneConsigliata}</p>
                  </div>
                </div>
              )}

              {/* Rischio Documentale Detail */}
              {result.rischioDocumentaleDetail && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                      Analisi rischio documentale
                    </h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                      result.rischioDocumentaleDetail.esito === "DOCUMENTAZIONE_SEMPLICE"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                        : result.rischioDocumentaleDetail.esito === "DOCUMENTAZIONE_GESTIBILE"
                        ? "bg-blue-950/40 border-blue-800 text-blue-400"
                        : result.rischioDocumentaleDetail.esito === "DOCUMENTAZIONE_COMPLESSA"
                        ? "bg-amber-950/40 border-amber-800 text-amber-400"
                        : "bg-red-950/40 border-red-800 text-red-400"
                    }`}>
                      {result.rischioDocumentaleDetail.esito.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className={`text-xl font-extrabold font-mono ${
                        result.rischioDocumentaleDetail.scoreRischioDocumentale < 25 ? "text-emerald-400"
                        : result.rischioDocumentaleDetail.scoreRischioDocumentale < 50 ? "text-blue-400"
                        : result.rischioDocumentaleDetail.scoreRischioDocumentale < 75 ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {result.rischioDocumentaleDetail.scoreRischioDocumentale}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">score rischio doc.</p>
                    </div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                      <span className={`text-sm font-extrabold font-mono ${
                        result.rischioDocumentaleDetail.rischioEsclusione === "basso" ? "text-emerald-400"
                        : result.rischioDocumentaleDetail.rischioEsclusione === "medio" ? "text-amber-400"
                        : "text-red-400"
                      }`}>
                        {result.rischioDocumentaleDetail.rischioEsclusione}
                      </span>
                      <p className="text-[9px] text-slate-500 mt-0.5">rischio esclusione</p>
                    </div>
                  </div>

                  {result.rischioDocumentaleDetail.documentiCritici.length > 0 && (
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Documenti critici</span>
                      {result.rischioDocumentaleDetail.documentiCritici.map((d, i) => (
                        <div key={i} className="flex items-start gap-1.5 mb-1 text-[10px]">
                          <span className="text-amber-400 shrink-0">⚠</span>
                          <span className="text-slate-300">{d}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border ${
                    result.rischioDocumentaleDetail.tempoPreparazioneDocumenti === "sufficiente"
                      ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                      : result.rischioDocumentaleDetail.tempoPreparazioneDocumenti === "stretto"
                      ? "bg-amber-950/40 border-amber-800 text-amber-400"
                      : "bg-red-950/40 border-red-800 text-red-400"
                  }`}>
                    Tempo preparazione documenti: {result.rischioDocumentaleDetail.tempoPreparazioneDocumenti.toUpperCase()}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{result.rischioDocumentaleDetail.motivazione}</p>
                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-brand-gold uppercase block mb-0.5">Azione consigliata</span>
                    <p className="text-xs text-slate-300">{result.rischioDocumentaleDetail.azioneConsigliata}</p>
                  </div>
                </div>
              )}

              {/* Storico Simile Detail */}
              {result.storicoSimileDetail && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                      Analisi storico gare similari
                    </h3>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                      result.storicoSimileDetail.esito === "STORICO_FAVOREVOLE"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                        : result.storicoSimileDetail.esito === "STORICO_NEUTRO"
                        ? "bg-blue-950/40 border-blue-800 text-blue-400"
                        : result.storicoSimileDetail.esito === "STORICO_SFAVOREVOLE"
                        ? "bg-amber-950/40 border-amber-800 text-amber-400"
                        : "bg-neutral-800 border-neutral-700 text-slate-400"
                    }`}>
                      {result.storicoSimileDetail.esito.replace(/_/g, " ")}
                    </span>
                  </div>

                  {result.storicoSimileDetail.esito === "STORICO_ASSENTE" ? (
                    <p className="text-xs text-slate-500 italic">
                      Nessuna gara similare in archivio — aggiungi gare passate nel Profilo azienda per abilitare l'analisi storica.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                          <span className="text-xl font-extrabold text-brand-gold font-mono">
                            {result.storicoSimileDetail.gareSimilariTrovate}
                          </span>
                          <p className="text-[9px] text-slate-500 mt-0.5">gare similari</p>
                        </div>
                        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                          <span className={`text-xl font-extrabold font-mono ${
                            result.storicoSimileDetail.tassoDiSuccessoCategoria >= 50 ? "text-emerald-400"
                            : result.storicoSimileDetail.tassoDiSuccessoCategoria >= 25 ? "text-amber-400"
                            : "text-red-400"
                          }`}>
                            {result.storicoSimileDetail.tassoDiSuccessoCategoria.toFixed(0)}%
                          </span>
                          <p className="text-[9px] text-slate-500 mt-0.5">tasso successo</p>
                        </div>
                        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2">
                          <span className="text-xl font-extrabold text-white font-mono">
                            {result.storicoSimileDetail.ribassoMedioCategoria.toFixed(1)}%
                          </span>
                          <p className="text-[9px] text-slate-500 mt-0.5">ribasso medio</p>
                        </div>
                      </div>

                      {result.storicoSimileDetail.garePertinenti.length > 0 && (
                        <div>
                          <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Gare pertinenti</span>
                          {result.storicoSimileDetail.garePertinenti.map((g, i) => (
                            <div key={i} className="flex items-center justify-between text-[10px] bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 mb-1">
                              <span className="text-slate-400 font-mono">{g.anno} · {g.categoria}</span>
                              <span className="text-slate-300">€{g.importo.toLocaleString("it-IT")}</span>
                              <span className="text-slate-400">-{g.ribasso}%</span>
                              <span className={`font-bold font-mono ${
                                g.esito === "vinta" ? "text-emerald-400"
                                : g.esito === "persa" ? "text-red-400"
                                : g.esito === "in_corso" ? "text-blue-400"
                                : "text-neutral-500"
                              }`}>{g.esito.toUpperCase()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <div className={`text-[9px] font-bold px-2 py-1 rounded border w-fit ${
                    result.storicoSimileDetail.confidenzaAnalisi === "alta" ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                    : result.storicoSimileDetail.confidenzaAnalisi === "media" ? "bg-blue-950/40 border-blue-800 text-blue-400"
                    : result.storicoSimileDetail.confidenzaAnalisi === "bassa" ? "bg-amber-950/40 border-amber-800 text-amber-400"
                    : "bg-neutral-800 border-neutral-700 text-slate-500"
                  }`}>
                    Confidenza: {result.storicoSimileDetail.confidenzaAnalisi.toUpperCase()}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">{result.storicoSimileDetail.motivazione}</p>
                  <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-brand-gold uppercase block mb-0.5">Azione consigliata</span>
                    <p className="text-xs text-slate-300">{result.storicoSimileDetail.azioneConsigliata}</p>
                  </div>
                </div>
              )}

              {/* Pre-submission gate */}
              {profile && complianceAuditPreview && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[9px] font-bold text-blue-400 uppercase">
                      Pre-submission compliance
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onShowAudit ? onShowAudit() : setIsComplianceAuditOpen(true)
                      }
                      className={`cursor-pointer flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded transition-colors ${
                        auditPassed
                          ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600"
                          : "bg-blue-600/20 text-blue-400 border border-blue-600 hover:bg-blue-600/30"
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {auditPassed ? "Audit superato" : "Apri audit"}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-neutral-900 rounded-lg p-2">
                      <div className="text-[12px] font-bold text-white">
                        {complianceAuditPreview.audit.completamentoPercent}%
                      </div>
                      <div className="text-[8px] text-slate-500">Completion</div>
                    </div>
                    <div className="bg-neutral-900 rounded-lg p-2">
                      <div
                        className={`text-[12px] font-bold ${
                          FINAL_VERDICT_STYLES[complianceAuditPreview.finalCheck.verdictFinal]
                            .text
                        }`}
                      >
                        {complianceAuditPreview.finalCheck.verdictFinal}
                      </div>
                      <div className="text-[8px] text-slate-500">Final check</div>
                    </div>
                    <div className="bg-neutral-900 rounded-lg p-2">
                      <div className="text-[12px] font-bold text-amber-400">
                        {complianceAuditPreview.audit.itemsObbligatoriBlocchi}
                      </div>
                      <div className="text-[8px] text-slate-500">Blocchi</div>
                    </div>
                  </div>
                  {complianceAuditPreview.reminders.prossimoCritical && (
                    <div className="text-[8px] text-red-300 border border-red-900/50 rounded p-2 bg-red-950/20">
                      {complianceAuditPreview.reminders.prossimoCritical.messaggio}
                    </div>
                  )}
                  {!auditPassed &&
                    complianceAuditPreview.finalCheck.verdictFinal !== "GO" && (
                      <div className="text-[8px] text-amber-400">
                        Invio consentito solo con Final Check = GO e audit senza blocchi.
                      </div>
                    )}
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

      {!onShowDelayAnalysis && (
        <DelayPenaltyExposureAnalyzer
          isOpen={isDelayAnalyzerOpen}
          onClose={() => setIsDelayAnalyzerOpen(false)}
          tender={tender}
          margineStimato={delayExposure?.margineStimato}
          companyProfile={profile}
        />
      )}

      {!onShowVariantsAnalysis && (
        <VariantClaimsRiskAnalyzer
          isOpen={isVariantAnalyzerOpen}
          onClose={() => setIsVariantAnalyzerOpen(false)}
          tender={tender}
          companyProfile={profile}
        />
      )}

      {!onShowAudit && (
        <PreSubmissionComplianceAudit
          isOpen={isComplianceAuditOpen}
          onClose={() => setIsComplianceAuditOpen(false)}
          onReadyToSubmit={() => setAuditPassed(true)}
          tender={tender}
          companyProfile={profile}
        />
      )}

      <QualificationReadinessHub
        isOpen={isQualificationHubOpen}
        onClose={() => setIsQualificationHubOpen(false)}
        onQualificationCheck={(verdict) => setQualificationVerdict(verdict)}
        tender={tender}
        companyProfile={profile}
      />
    </div>
  );
}
