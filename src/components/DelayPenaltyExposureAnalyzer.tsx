import { useState, useEffect, useCallback, type ChangeEvent } from "react";
import { X, Clock, AlertTriangle, FileText, Loader2 } from "lucide-react";
import type { TenderDocument, DelayPenaltyExposure, CompanyProfile } from "../types";
import {
  createDelayPenaltyExposure,
  defaultPenaltyClausesForTender,
  defaultCompanyDelayProfile,
  estimateMargineForTender,
  DELAY_RISK_STYLES,
  TIMELINE_CRITICITA_STYLES,
  analyzeTimelineRisk,
  generateMitigationStrategies,
  calculateDelayAdjustedBidPrice,
  type TimelineRiskAnalysis,
  type MitigationPlan,
  type DelayAdjustedBidPrice,
} from "../lib/delayPenaltyEngine";
import { requestDelayPenaltiesParse } from "../lib/parseDelayPenaltiesApi";
import { analyzeDelayPenaltyInsights, analyzeDelayRiskDeep, type DelayRiskDeepInsights } from "../lib/gemini";
import { readFileAsBase64 } from "../lib/parseSOAApi";

interface DelayPenaltyExposureAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  margineStimato?: number;
  companyProfile?: CompanyProfile | null;
}

type AnalyzerTab = "summary" | "timeline" | "mitigation" | "insights" | "pricing";

const EFFORT_CLASS: Record<string, string> = {
  BASSO: "text-emerald-400",
  MEDIO: "text-amber-400",
  ALTO: "text-red-400",
};
export function DelayPenaltyExposureAnalyzer({
  isOpen,
  onClose,
  tender,
  margineStimato,
  companyProfile: companyProfileProp,
}: DelayPenaltyExposureAnalyzerProps) {
  const [exposure, setExposure] = useState<DelayPenaltyExposure | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<AnalyzerTab>("summary");
  const [timelineAnalysis, setTimelineAnalysis] = useState<TimelineRiskAnalysis | null>(null);
  const [mitigationPlan, setMitigationPlan] = useState<MitigationPlan | null>(null);
  const [deepInsights, setDeepInsights] = useState<DelayRiskDeepInsights | null>(null);
  const [deepInsightsLoading, setDeepInsightsLoading] = useState(false);
  const [adjustedPrice, setAdjustedPrice] = useState<DelayAdjustedBidPrice | null>(null);

  const buildExposure = useCallback(
    (penalties: ReturnType<typeof defaultPenaltyClausesForTender>, prof: CompanyProfile | null) => {
      const margin = margineStimato ?? estimateMargineForTender(tender, prof);
      const delayProf = defaultCompanyDelayProfile(prof, tender);
      const exp = createDelayPenaltyExposure(tender, penalties, delayProf, margin);
      setExposure(exp);
      setInsightsLoading(true);
      analyzeDelayPenaltyInsights(exp)
        .then((insights) => setExposure({ ...exp, insightsDeepSeek: insights }))
        .catch(() => {})
        .finally(() => setInsightsLoading(false));
    },
    [tender, margineStimato]
  );

  useEffect(() => {
    if (!isOpen) {
      setExposure(null);
      setParseError(null);
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

    buildExposure(defaultPenaltyClausesForTender(tender), prof);
    setSelectedTab("summary");
  }, [isOpen, tender.id, companyProfileProp, buildExposure]);

  useEffect(() => {
    if (!exposure) {
      setTimelineAnalysis(null);
      setMitigationPlan(null);
      setDeepInsights(null);
      setAdjustedPrice(null);
      return;
    }

    const timeline = analyzeTimelineRisk(
      exposure.gara,
      exposure.durationGiorni,
      exposure.companyProfile
    );
    setTimelineAnalysis(timeline);
    setMitigationPlan(generateMitigationStrategies(exposure));
    setAdjustedPrice(
      calculateDelayAdjustedBidPrice(exposure, exposure.margineStimato)
    );

    setDeepInsightsLoading(true);
    analyzeDelayRiskDeep(exposure, timeline)
      .then(setDeepInsights)
      .catch(() => setDeepInsights(null))
      .finally(() => setDeepInsightsLoading(false));
  }, [exposure]);

  const handlePdfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      const penalties = await requestDelayPenaltiesParse({
        bandoPdfBase64: base64,
        fileName: file.name,
        tender,
      });

      let prof: CompanyProfile | null = companyProfileProp ?? null;
      if (!prof) {
        const raw = localStorage.getItem("gm_company_profile");
        if (raw) prof = JSON.parse(raw) as CompanyProfile;
      }
      buildExposure(penalties, prof);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing");
    } finally {
      setIsParsing(false);
      e.target.value = "";
    }
  };

  if (!isOpen) return null;

  const riskStyle = exposure
    ? DELAY_RISK_STYLES[exposure.riskClasse]
    : DELAY_RISK_STYLES.MEDIO;

  const titlePreview =
    tender.title.length > 50 ? `${tender.title.slice(0, 50)}…` : tender.title;

  const exportReport = () => {
    if (!exposure) return;
    const lines = [
      `Delay & Penalty — ${tender.title}`,
      `Risk: ${exposure.riskClasse}`,
      `Penalità attesa: €${exposure.penalitaAttesa.toLocaleString("it-IT")}`,
      `Margine dopo ritardo: €${exposure.margineDopoRitardo.toLocaleString("it-IT")}`,
      "",
      exposure.recommendation,
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-start p-4 border-b border-neutral-800 shrink-0 gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Delay &amp; Penalty Exposure
            </h2>
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

        {exposure && (
          <div className="flex gap-0 border-b border-neutral-800 px-4 shrink-0 overflow-x-auto">
            {(
              [
                ["summary", "Summary"],
                ["timeline", "⏱️ Timeline"],
                ["mitigation", "🛡️ Mitigation"],
                ["insights", "💡 Insights"],
                ["pricing", "💰 Pricing"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSelectedTab(tab)}
                className={`cursor-pointer px-3 py-2 text-[9px] font-bold uppercase whitespace-nowrap transition-colors ${
                  selectedTab === tab
                    ? "text-amber-400 border-b-2 border-amber-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
          <div className="border border-dashed border-amber-900/50 rounded-lg p-3 text-center">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handlePdfUpload}
              disabled={isParsing}
              className="hidden"
              id="delay-bando-input"
            />
            <label htmlFor="delay-bando-input" className="cursor-pointer block">
              <FileText className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-[10px] text-white font-bold">
                Carica bando PDF (clausole penalità)
              </div>
            </label>
          </div>

          {isParsing && (
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <span className="text-[10px] text-slate-400">Analisi penalità ritardo…</span>
            </div>
          )}

          {parseError && (
            <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div className="text-[10px] text-red-400">{parseError}</div>
            </div>
          )}

          {(insightsLoading || deepInsightsLoading) && !isParsing && selectedTab !== "summary" && (
            <div className="text-[8px] text-slate-500">Analisi AI in corso…</div>
          )}

          {!isParsing && exposure && selectedTab === "timeline" && timelineAnalysis && (
            <div className="space-y-3">
              {(() => {
                const ts = TIMELINE_CRITICITA_STYLES[timelineAnalysis.critica];
                return (
                  <div className={`rounded-lg p-3 border ${ts.box}`}>
                    <h3 className={`text-[10px] font-bold uppercase mb-2 ${ts.text}`}>
                      Timeline Risk: {timelineAnalysis.critica}
                    </h3>
                    <div className="space-y-2 text-[9px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Durata planned</span>
                        <span className="text-white font-bold">
                          {timelineAnalysis.durataCompletataPlanned} gg
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Durata realistica</span>
                        <span className="text-amber-400 font-bold">
                          {timelineAnalysis.durataCompletataRealistica} gg
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Buffer suggerito</span>
                        <span className="text-blue-400 font-bold">
                          +{timelineAnalysis.bufferSuggerito} gg
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2">
                {timelineAnalysis.fasi.map((fase, i) => (
                  <div
                    key={i}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold text-white">{fase.nome}</span>
                      <span
                        className={`text-[9px] font-bold ${
                          fase.deltaPercent > 0.2 ? "text-red-400" : "text-amber-400"
                        }`}
                      >
                        +{Math.round(fase.deltaPercent * 100)}%
                      </span>
                    </div>
                    <div className="text-[8px] text-slate-400">
                      {fase.giorniPlannati} gg planned → {fase.giorniRealiStorici} gg reali
                    </div>
                  </div>
                ))}
              </div>
              <div
                className={`rounded-lg p-3 border ${
                  TIMELINE_CRITICITA_STYLES[timelineAnalysis.critica].box
                }`}
              >
                <div
                  className={`text-[9px] ${
                    TIMELINE_CRITICITA_STYLES[timelineAnalysis.critica].text
                  } opacity-90`}
                >
                  {timelineAnalysis.raccomandazione}
                </div>
              </div>
            </div>
          )}

          {!isParsing && exposure && selectedTab === "mitigation" && mitigationPlan && (
            <div className="space-y-3">
              <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-emerald-400 uppercase mb-2">
                  Mitigation Impact
                </h3>
                <div className="space-y-2 text-[9px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Penalità attesa (baseline)</span>
                    <span className="font-bold text-amber-400">
                      €{exposure.penalitaAttesa.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Riducibile con strategie</span>
                    <span className="font-bold text-emerald-400">
                      {mitigationPlan.impattoCumulativo}%
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-emerald-900 pt-2">
                    <span className="text-slate-400">Penalità dopo mitigation</span>
                    <span className="font-bold text-emerald-400">
                      €{mitigationPlan.penalitaDopoMitigazione.toLocaleString("it-IT")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {mitigationPlan.strategieDisponibili.map((strat) => (
                  <div
                    key={strat.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <span className="text-[10px] font-bold text-white">{strat.titolo}</span>
                      <span className="text-[9px] font-bold text-emerald-400 shrink-0">
                        -{Math.round(strat.impatto)}%
                      </span>
                    </div>
                    <div className="text-[8px] text-slate-400 mb-2">{strat.descrizione}</div>
                    <div className="flex justify-between text-[8px] text-slate-500">
                      <span>{strat.tempoImplementazione}</span>
                      <span className={`font-bold ${EFFORT_CLASS[strat.effort] ?? "text-slate-400"}`}>
                        {strat.effort} effort
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-2">
                  Azioni raccomandate
                </h3>
                {mitigationPlan.raccomandazioni.map((rac, i) => (
                  <div key={i} className="text-[9px] text-slate-300 mb-1">
                    {i + 1}. {rac}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isParsing && exposure && selectedTab === "insights" && (
            <div className="space-y-3">
              {deepInsightsLoading && (
                <div className="flex items-center justify-center py-6 gap-2">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="text-[9px] text-slate-400">Deep analysis…</span>
                </div>
              )}
              {deepInsights && !deepInsightsLoading && (
                <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
                  <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-2">
                    Deep Analysis (AI)
                  </h3>
                  <div className="text-[9px] text-slate-300 mb-3">{deepInsights.analisi}</div>
                  <div className="text-[9px] text-amber-400 mb-2">
                    P(ritardo) realistica: {deepInsights.probabilitaRealistica}%
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-emerald-400 font-bold text-[8px] mb-1">
                        Fattori rischio
                      </div>
                      {deepInsights.fattoriRischio.map((f, i) => (
                        <div key={i} className="text-[8px] text-slate-300">
                          ⚠️ {f}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-blue-400 font-bold text-[8px] mb-1">Mitigazioni</div>
                      {deepInsights.fattoriMitigazione.map((m, i) => (
                        <div key={i} className="text-[8px] text-slate-300">
                          ✓ {m}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-900">
                    <div className="text-[9px] text-slate-300 space-y-1">
                      {deepInsights.raccomandazioni.map((r, i) => (
                        <div key={i}>→ {r}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isParsing && exposure && selectedTab === "pricing" && adjustedPrice && (
            <div className="space-y-3">
              <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-amber-400 uppercase mb-2">
                  Delay-Adjusted Bid Pricing
                </h3>
                <div className="space-y-2 text-[9px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Prezzo base</span>
                    <span className="text-white font-bold">
                      €{adjustedPrice.prezzoBase.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Delay risk premium</span>
                    <span className="text-amber-400 font-bold">
                      +€{adjustedPrice.delayRiskPremium.toLocaleString("it-IT")} (+
                      {adjustedPrice.premiumPercent}%)
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-amber-900/50 pt-2">
                    <span className="text-slate-400">Prezzo final da offrire</span>
                    <span className="text-white font-bold text-[10px]">
                      €{adjustedPrice.prezzoFinal.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ribasso suggerito</span>
                    <span className="text-blue-400 font-bold">{adjustedPrice.ribasso}%</span>
                  </div>
                </div>
              </div>
              <div className={`rounded-lg p-3 border ${riskStyle.box}`}>
                <div className={`text-[9px] text-slate-300`}>{adjustedPrice.raccomandazione}</div>
              </div>
            </div>
          )}

          {!isParsing && exposure && selectedTab === "summary" && (
            <>
              {insightsLoading && (
                <div className="text-[8px] text-slate-500">Insights AI in corso…</div>
              )}
              <div className={`rounded-lg p-4 border ${riskStyle.box}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-[14px] font-bold ${riskStyle.text}`}>
                      RISK {exposure.riskClasse}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Probabilità ritardo: {exposure.probabilitaRitardo}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[20px] font-bold ${riskStyle.score}`}>
                      €{exposure.penalitaAttesa.toLocaleString("it-IT")}
                    </div>
                    <div className="text-[9px] text-slate-400">Penalità attesa</div>
                  </div>
                </div>
                {exposure.insightsDeepSeek?.analisi && (
                  <p className="text-[8px] text-slate-400 mt-2 border-t border-neutral-800 pt-2">
                    {exposure.insightsDeepSeek.analisi}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 mb-1">Durata gara</div>
                  <div className="text-[14px] font-bold text-white">{exposure.durationGiorni} gg</div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 mb-1">Giorni ritardo attesi</div>
                  <div className="text-[14px] font-bold text-amber-400">
                    {exposure.giorniRitardoAttesi} gg
                  </div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 mb-1">Margine stimato</div>
                  <div className="text-[14px] font-bold text-emerald-400">
                    €{exposure.margineStimato.toLocaleString("it-IT")}
                  </div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 mb-1">Margine dopo penalità</div>
                  <div
                    className={`text-[14px] font-bold ${
                      exposure.margineDopoRitardo > 0 ? "text-white" : "text-red-400"
                    }`}
                  >
                    €{exposure.margineDopoRitardo.toLocaleString("it-IT")}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase">
                  Clausole penalità
                </div>
                {exposure.penaltyClauses.map((clause) => (
                  <div
                    key={clause.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-white">{clause.tipo}</div>
                        <div className="text-[9px] text-slate-400 mt-1">{clause.descrizione}</div>
                      </div>
                      <div className="text-right text-[9px] shrink-0">
                        {(clause.tipo === "GIORNALIERA" || clause.tipo === "RAGGUAGLIATA") && (
                          <div className="text-amber-400 font-mono">
                            €{clause.importoGiornaliero.toLocaleString("it-IT")}/gg
                          </div>
                        )}
                        {clause.tipo === "DECURTAZIONE_IMPORTO" && clause.percentuale != null && (
                          <div className="text-amber-400">{clause.percentuale}% / gg</div>
                        )}
                        {clause.importoMassimo != null && (
                          <div className="text-slate-400 text-[8px] mt-1">
                            Max €{clause.importoMassimo.toLocaleString("it-IT")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-[8px] text-slate-500">
                      Tolleranza: {clause.giorniToleranza} gg
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-2">
                  Scenario analysis
                </h3>
                <div className="space-y-2 text-[9px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Best case (on-time)</span>
                    <span className="font-bold text-emerald-400">
                      €{exposure.margineStimato.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Expected</span>
                    <span
                      className={`font-bold ${
                        exposure.margineDopoRitardo > 0 ? "text-white" : "text-red-400"
                      }`}
                    >
                      €{exposure.margineDopoRitardo.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Worst case</span>
                    <span className="font-bold text-red-400">
                      €
                      {Math.max(
                        0,
                        exposure.margineStimato - exposure.penalitaWorstCase
                      ).toLocaleString("it-IT")}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`rounded-lg p-3 border ${riskStyle.box}`}>
                <div className={`text-[9px] font-bold uppercase mb-2 ${riskStyle.text}`}>
                  Raccomandazione
                </div>
                <div className="text-[9px] text-slate-300">{exposure.recommendation}</div>
              </div>

              {exposure.insightsDeepSeek && exposure.insightsDeepSeek.azioni.length > 0 && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-[9px]">
                  <div className="font-bold text-amber-400 mb-1">Azioni suggerite</div>
                  {exposure.insightsDeepSeek.azioni.map((a, i) => (
                    <div key={i} className="text-slate-400">
                      → {a}
                    </div>
                  ))}
                </div>
              )}
            </>
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
            onClick={exportReport}
            disabled={!exposure}
            className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-amber-600 text-white rounded hover:border-amber-700 transition-colors disabled:opacity-50"
          >
            Export report
          </button>
        </div>
      </div>
    </div>
  );
}
