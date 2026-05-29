import { useState, useEffect, useCallback } from "react";
import { X, AlertTriangle, Zap, FileText, AlertCircle, Loader2 } from "lucide-react";
import type { TenderDocument, VariantRiskExposure, CompanyProfile } from "../types";
import {
  createVariantClaimsRiskExposure,
  defaultVariantClausesForTender,
  defaultClaimsClausesForTender,
  defaultCompanyVariantHistory,
  identifyProblematicVariantClauses,
  identifyUnfavorableClaimsClauses,
  VARIANT_RISK_STYLES,
  VARIANT_TIPO_BADGE,
  CLAIMS_TIPO_BADGE,
  CLAIMS_RISK_LEVEL_STYLES,
  NEGOTIATION_EFFORT_CLASS,
  generateVariantNegotiationStrategies,
  analyzeClaimsRisk,
  calculateVariantAdjustedBidPrice,
  type VariantNegotiationPlan,
  type ClaimsRiskIndicator,
  type VariantAdjustedBidPrice,
} from "../lib/variantClaimsEngine";
import { requestVariantsClausesParse } from "../lib/parseVariantsClausesApi";
import {
  analyzeVariantClaimsInsights,
  analyzeVariantsClaimsDeep,
  type VariantsClaimsDeepInsights,
} from "../lib/gemini";
import { readFileAsBase64 } from "../lib/parseSOAApi";
import { useState, useEffect } from "react";
import { X, Loader2, GitBranch, AlertTriangle } from "lucide-react";
import type { TenderDocument, VariantRiskExposure, VariantRiskClasse } from "../types";
import { createVariantClaimsRiskExposure, VARIANT_RISK_CLASS } from "../lib/variantClaimsEngine";

interface VariantClaimsRiskAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  companyProfile?: CompanyProfile | null;
}

type AnalyzerTab = "summary" | "negotiation" | "claims" | "insights" | "pricing";
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
  companyProfile: companyProfileProp,
}: VariantClaimsRiskAnalyzerProps) {
  const [exposure, setExposure] = useState<VariantRiskExposure | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<AnalyzerTab>("summary");
  const [negotiationPlan, setNegotiationPlan] = useState<VariantNegotiationPlan | null>(null);
  const [claimsIndicator, setClaimsIndicator] = useState<ClaimsRiskIndicator | null>(null);
  const [deepInsights, setDeepInsights] = useState<VariantsClaimsDeepInsights | null>(null);
  const [deepInsightsLoading, setDeepInsightsLoading] = useState(false);
  const [adjustedPrice, setAdjustedPrice] = useState<VariantAdjustedBidPrice | null>(null);

  const buildExposure = useCallback(
    (
      variants: ReturnType<typeof defaultVariantClausesForTender>,
      claims: ReturnType<typeof defaultClaimsClausesForTender>,
      prof: CompanyProfile | null
    ) => {
      const history = defaultCompanyVariantHistory(tender, prof);
      const exp = createVariantClaimsRiskExposure(tender, variants, claims, history);
      setExposure(exp);
      setInsightsLoading(true);
      analyzeVariantClaimsInsights(exp)
        .then((insights) => setExposure({ ...exp, insightsDeepSeek: insights }))
        .catch(() => {})
        .finally(() => setInsightsLoading(false));
    },
    [tender]
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

    buildExposure(
      defaultVariantClausesForTender(tender),
      defaultClaimsClausesForTender(),
      prof
    );
    setSelectedTab("summary");
  }, [isOpen, tender.id, companyProfileProp, buildExposure]);

  useEffect(() => {
    if (!exposure) {
      setNegotiationPlan(null);
      setClaimsIndicator(null);
      setDeepInsights(null);
      setAdjustedPrice(null);
      return;
    }

    setNegotiationPlan(generateVariantNegotiationStrategies(exposure));
    setClaimsIndicator(analyzeClaimsRisk(exposure.gara));
    setAdjustedPrice(calculateVariantAdjustedBidPrice(exposure));

    setDeepInsightsLoading(true);
    analyzeVariantsClaimsDeep(exposure)
      .then(setDeepInsights)
      .catch(() => setDeepInsights(null))
      .finally(() => setDeepInsightsLoading(false));
  }, [exposure]);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const { variants, claims } = await requestVariantsClausesParse({
        bandoPdfBase64: base64,
        fileName: file.name,
        tender,
      });

      let prof: CompanyProfile | null = companyProfileProp ?? null;
      if (!prof) {
        const raw = localStorage.getItem("gm_company_profile");
        if (raw) prof = JSON.parse(raw) as CompanyProfile;
      }
      buildExposure(variants, claims, prof);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing");
    } finally {
      setIsParsing(false);
      e.target.value = "";
    }
  };

  if (!isOpen) return null;

  const riskStyle = exposure
    ? VARIANT_RISK_STYLES[exposure.riskClasse]
    : VARIANT_RISK_STYLES.MEDIO;

  const titlePreview =
    tender.title.length > 50 ? `${tender.title.slice(0, 50)}…` : tender.title;

  const problematicVariants = exposure
    ? identifyProblematicVariantClauses(exposure.variantClauses)
    : [];
  const unfavorableClaims = exposure
    ? identifyUnfavorableClaimsClauses(exposure.claimsClauses)
    : [];

  const exportReport = () => {
    if (!exposure) return;
    const lines = [
      `Variants & Claims — ${tender.title}`,
      `Risk: ${exposure.riskClasse}`,
      `Esposizione totale: €${exposure.esposizioneTotale.toLocaleString("it-IT")}`,
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
              <Zap className="w-4 h-4 text-orange-400" />
              Variants &amp; Claims Risk
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
                ["negotiation", "🤝 Negotiation"],
                ["claims", "📋 Claims"],
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
                    ? "text-orange-400 border-b-2 border-orange-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
          <div className="border border-dashed border-orange-900/50 rounded-lg p-3 text-center">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handlePdfUpload}
              disabled={isParsing}
              className="hidden"
              id="variants-bando-input"
            />
            <label htmlFor="variants-bando-input" className="cursor-pointer block">
              <FileText className="w-5 h-5 text-orange-400 mx-auto mb-1" />
              <div className="text-[10px] text-white font-bold">
                Carica bando PDF (clausole varianti/claims)
              </div>
            </label>
          </div>

          {isParsing && (
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
              <span className="text-[10px] text-slate-400">
                Analisi clausole varianti/claims…
              </span>
            </div>
          )}

          {parseError && (
            <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div className="text-[10px] text-red-400">{parseError}</div>
            </div>
          )}

          {(insightsLoading || deepInsightsLoading) && !isParsing && selectedTab === "summary" && (
            <div className="text-[8px] text-slate-500">Insights AI in corso…</div>
          )}

          {!isParsing && exposure && selectedTab === "negotiation" && negotiationPlan && (
            <div className="space-y-3">
              <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-emerald-400 uppercase mb-2">
                  Negotiation Impact
                </h3>
                <div className="space-y-2 text-[9px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Esposizione baseline</span>
                    <span className="font-bold text-orange-400">
                      €{exposure.esposizioneTotale.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Risk reduction potenziale</span>
                    <span className="font-bold text-emerald-400">
                      {negotiationPlan.riskReductionPotenziale}%
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-emerald-900 pt-2">
                    <span className="text-slate-400">Esposizione dopo negoziazione</span>
                    <span className="font-bold text-emerald-400">
                      €{negotiationPlan.esposizioneDoponegoziazione.toLocaleString("it-IT")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {negotiationPlan.strategieDisponibili.map((strat) => (
                  <div
                    key={strat.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <span className="text-[10px] font-bold text-white">{strat.titolo}</span>
                      <span className="text-[9px] font-bold text-emerald-400 shrink-0">
                        -{strat.impatto}%
                      </span>
                    </div>
                    <div className="text-[8px] text-slate-400 mb-2">{strat.descrizione}</div>
                    <div className="text-[8px] text-slate-300 mb-2 p-2 bg-neutral-900 rounded italic">
                      &ldquo;{strat.testoProposto}&rdquo;
                    </div>
                    <div className="flex justify-between text-[8px] text-slate-500">
                      <span>Success: {strat.successRate}%</span>
                      <span
                        className={`font-bold ${NEGOTIATION_EFFORT_CLASS[strat.effort]}`}
                      >
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
                {negotiationPlan.raccomandazioni.map((rac, i) => (
                  <div key={i} className="text-[9px] text-slate-300 mb-1">
                    {i + 1}. {rac}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isParsing && exposure && selectedTab === "claims" && claimsIndicator && (
            <div className="space-y-3">
              {(() => {
                const cs = claimsIndicator.riskClaimsAlti
                  ? CLAIMS_RISK_LEVEL_STYLES.alto
                  : CLAIMS_RISK_LEVEL_STYLES.medio;
                return (
                  <div className={`rounded-lg p-3 border ${cs.box}`}>
                    <h3 className={`text-[10px] font-bold uppercase mb-2 ${cs.text}`}>
                      Claims Risk: {claimsIndicator.riskClaimsAlti ? "ALTO" : "MEDIO"}
                    </h3>
                    <div className="space-y-2 text-[9px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">% progetti simili con claims</span>
                        <span className="text-white font-bold">
                          {claimsIndicator.historicoSimilari.percentualeProgetti_ConClaims}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Media claims per progetto</span>
                        <span className="text-white font-bold">
                          {claimsIndicator.historicoSimilari.mediaClaimsPerProgetto}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">% approvazione claims</span>
                        <span
                          className={`font-bold ${
                            claimsIndicator.historicoSimilari.percentualeClaimsApprovati > 50
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {claimsIndicator.historicoSimilari.percentualeClaimsApprovati}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Valore stimato claims</span>
                        <span className="text-amber-400 font-bold">
                          €{claimsIndicator.estimatedClaimsValue.toLocaleString("it-IT")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-300 mb-2">Tipi claims frequenti</div>
                {claimsIndicator.historicoSimilari.principaliTipiClaims.map((t, i) => (
                  <div key={i} className="text-[8px] text-slate-400 mb-1">
                    • {t}
                  </div>
                ))}
              </div>
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-300 mb-2">Fattori aggravanti</div>
                {claimsIndicator.fattoriAggravanti.length > 0 ? (
                  claimsIndicator.fattoriAggravanti.map((f, i) => (
                    <div key={i} className="text-[8px] text-red-400 mb-1">
                      ⚠️ {f}
                    </div>
                  ))
                ) : (
                  <div className="text-[8px] text-slate-400">Nessuno rilevato</div>
                )}
              </div>
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-300 mb-2">Fattori mitiganti</div>
                {claimsIndicator.fattoriMitiganti.length > 0 ? (
                  claimsIndicator.fattoriMitiganti.map((f, i) => (
                    <div key={i} className="text-[8px] text-emerald-400 mb-1">
                      ✓ {f}
                    </div>
                  ))
                ) : (
                  <div className="text-[8px] text-slate-400">Nessun fattore mitigante</div>
                )}
              </div>
              <div
                className={`rounded-lg p-3 border ${
                  claimsIndicator.riskClaimsAlti
                    ? CLAIMS_RISK_LEVEL_STYLES.alto.box
                    : CLAIMS_RISK_LEVEL_STYLES.medio.box
                }`}
              >
                <div
                  className={`text-[9px] ${
                    claimsIndicator.riskClaimsAlti
                      ? CLAIMS_RISK_LEVEL_STYLES.alto.text
                      : CLAIMS_RISK_LEVEL_STYLES.medio.text
                  } opacity-90`}
                >
                  {claimsIndicator.recommendation}
                </div>
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
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-red-400 font-bold text-[8px] mb-1">Rischi principali</div>
                      {deepInsights.rischiPrincipali.map((r, i) => (
                        <div key={i} className="text-[8px] text-slate-300">
                          ⚠️ {r}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-emerald-400 font-bold text-[8px] mb-1">
                        Strategie negoziazione
                      </div>
                      {deepInsights.strategieNegoziazione.map((s, i) => (
                        <div key={i} className="text-[8px] text-slate-300">
                          → {s}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-900">
                    <div className="text-[8px] font-bold text-blue-400 mb-1">
                      Documentazione richiesta
                    </div>
                    {deepInsights.documentazioneRichiesta.map((d, i) => (
                      <div key={i} className="text-[8px] text-slate-300">
                        📋 {d}
                      </div>
                    ))}
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
              <div className="bg-orange-950/20 border border-orange-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-orange-400 uppercase mb-2">
                  Variant-Adjusted Bid Pricing
                </h3>
                <div className="space-y-2 text-[9px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Prezzo base</span>
                    <span className="text-white font-bold">
                      €{adjustedPrice.prezzoBase.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Variant risk premium</span>
                    <span className="text-orange-400 font-bold">
                      +€{adjustedPrice.variantRiskPremium.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Claims risk premium</span>
                    <span className="text-orange-400 font-bold">
                      +€{adjustedPrice.claimsRiskPremium.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-orange-900/50 pt-2">
                    <span className="text-slate-400">Prezzo final da offrire</span>
                    <span className="text-white font-bold text-[10px]">
                      €{adjustedPrice.prezzoFinal.toLocaleString("it-IT")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Premium totale</span>
                    <span className="text-amber-400 font-bold">
                      +{adjustedPrice.premiumPercent}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ribasso suggerito</span>
                    <span className="text-blue-400 font-bold">{adjustedPrice.ribasso}%</span>
                  </div>
                </div>
              </div>
              <div className={`rounded-lg p-3 border ${riskStyle.box}`}>
                <div className="text-[9px] text-slate-300">{adjustedPrice.raccomandazione}</div>
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
                      Varianti + Claims exposure
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[20px] font-bold ${riskStyle.score}`}>
                      €{exposure.esposizioneTotale.toLocaleString("it-IT")}
                    </div>
                    <div className="text-[9px] text-slate-400">Esposizione totale</div>
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
                  <div className="text-[9px] text-slate-500 mb-1">Varianti stimate</div>
                  <div className="text-[14px] font-bold text-white">
                    {exposure.numeroVariantiStimate}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-1">
                    Prob: {exposure.probabilitaVariantRichiesta}%
                  </div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 mb-1">Importo varianti atteso</div>
                  <div className="text-[14px] font-bold text-amber-400">
                    €{exposure.importoTotaleVariantiAttese.toLocaleString("it-IT")}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-1">
                    Approval: {exposure.percentualeApprovazione}%
                  </div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 mb-1">Claims stimati</div>
                  <div className="text-[14px] font-bold text-white">
                    {exposure.numeroClaimsAttesi}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-1">
                    Prob: {exposure.probabilitaClaimsRivendicazione}%
                  </div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 mb-1">Importo claims atteso</div>
                  <div className="text-[14px] font-bold text-red-400">
                    €{exposure.importoTotaleClaimsAtteso.toLocaleString("it-IT")}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-1">
                    Approval: {exposure.percentualeApprovazioneClaims}%
                  </div>
                </div>
              </div>

              {(problematicVariants.length > 0 || unfavorableClaims.length > 0) && (
                <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3">
                  <h3 className="text-[10px] font-bold text-red-400 uppercase mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Clausole problematiche
                  </h3>
                  {problematicVariants.map((clause) => (
                    <div key={clause.id} className="text-[8px] text-red-300 mb-1">
                      • Variante: {clause.titolo} — {clause.tipoVariante.replace(/_/g, " ")}
                    </div>
                  ))}
                  {unfavorableClaims.map((clause) => (
                    <div key={clause.id} className="text-[8px] text-red-300 mb-1">
                      • Claims: {clause.titolo} — {clause.tipoClaimsAccettato}
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

              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase">
                  Clausole varianti
                </div>
                {exposure.variantClauses.map((clause) => {
                  const isProblematic = problematicVariants.some((p) => p.id === clause.id);
                  return (
                    <div
                      key={clause.id}
                      className={`bg-neutral-950 border ${
                        isProblematic ? "border-red-700" : "border-neutral-800"
                      } rounded-lg p-3`}
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <div className="min-w-0">
                          <div
                            className={`text-[10px] font-bold ${
                              isProblematic ? "text-red-400" : "text-white"
                            }`}
                          >
                            {clause.titolo}
                          </div>
                          <div className="text-[9px] text-slate-400 mt-1">{clause.descrizione}</div>
                        </div>
                        <span
                          className={`text-[8px] font-bold px-2 py-1 rounded shrink-0 ${
                            VARIANT_TIPO_BADGE[clause.tipoVariante] ?? "bg-neutral-800 text-slate-400"
                          }`}
                        >
                          {clause.tipoVariante.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-500 space-y-1">
                        {clause.percentualeMaxImporto != null && (
                          <div>Max importo: {clause.percentualeMaxImporto}%</div>
                        )}
                        {clause.percentualeMaxQuantita != null && (
                          <div>Max quantità: {clause.percentualeMaxQuantita}%</div>
                        )}
                        <div>Procedura: {clause.proceduaAutorizzazione}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase">
                  Clausole claims/riserve
                </div>
                {exposure.claimsClauses.map((clause) => {
                  const isUnfavorable = unfavorableClaims.some((u) => u.id === clause.id);
                  return (
                    <div
                      key={clause.id}
                      className={`bg-neutral-950 border ${
                        isUnfavorable ? "border-red-700" : "border-neutral-800"
                      } rounded-lg p-3`}
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <div className="min-w-0">
                          <div
                            className={`text-[10px] font-bold ${
                              isUnfavorable ? "text-red-400" : "text-white"
                            }`}
                          >
                            {clause.titolo}
                          </div>
                          <div className="text-[9px] text-slate-400 mt-1">{clause.descrizione}</div>
                        </div>
                        <span
                          className={`text-[8px] font-bold px-2 py-1 rounded shrink-0 ${
                            CLAIMS_TIPO_BADGE[clause.tipoClaimsAccettato] ??
                            "bg-neutral-800 text-slate-400"
                          }`}
                        >
                          {clause.tipoClaimsAccettato}
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-500 space-y-1">
                        {clause.percentualeMaxCodifica != null && (
                          <div>Max codifica: {clause.percentualeMaxCodifica}%</div>
                        )}
                        {clause.tempoRivendicazione && (
                          <div>Tempo rivendicazione: {clause.tempoRivendicazione}</div>
                        )}
                        <div>Oneri prova: {clause.oneriProva}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={`rounded-lg p-3 border ${riskStyle.box}`}>
                <div className={`text-[9px] font-bold uppercase mb-2 ${riskStyle.text}`}>
                  Raccomandazione
                </div>
                <div className="text-[9px] text-slate-300">{exposure.recommendation}</div>
              </div>

              {exposure.insightsDeepSeek && exposure.insightsDeepSeek.strategie.length > 0 && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-[9px]">
                  <div className="font-bold text-orange-400 mb-1">Strategie suggerite</div>
                  {exposure.insightsDeepSeek.strategie.map((s, i) => (
                    <div key={i} className="text-slate-400">
                      → {s}
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
            className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            Export report
          </button>
        <div className="sticky border-t border-neutral-800 px-6 py-3 flex justify-end shrink-0 bg-black rounded-b-2xl">
          <button type="button" onClick={onClose} className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
