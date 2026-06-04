import { useState, useEffect, useCallback, type ChangeEvent } from "react";
import { Leaf, Loader2, TrendingUp, FileText, Upload, Factory } from "lucide-react";
import type { TenderDocument, CAMComplianceProfile, CAMDocumentoStato } from "../types";
import {
  createCAMComplianceProfile,
  updateCAMAssessmentItem,
  analyzeCAMImpactOnBid,
  CAM_CONFORMITA_STYLES,
  formatConformitaLabel,
  defaultCAMRequirementsForTender,
  verifySuppliersForCAMProfile,
  analyzeCAMCostImpactForProfile,
  createCAMDocumentationTracker,
  addCAMDocument,
  updateCAMDocumentStato,
  generateCAMComplianceReport,
  supplierComplianceStyle,
  type CAMSupplierVerificationReport,
  type CAMCostAnalysis,
  type CAMDocumentationTracker,
} from "../lib/camComplianceEngine";
import { requestCAMRequirementsParse } from "../lib/parseCAMRequirementsApi";
import {
  analyzeCAMComplianceInsights,
  generateCAMStrategicInsights,
  analyzeCAMDocumentationAudit,
  type CAMStrategicInsights,
} from "../lib/gemini";
import { readFileAsBase64 } from "../lib/parseSOAApi";
import type { CAMAssessmentStato } from "../types";

type CAMPanelTab = "assessment" | "suppliers" | "costs" | "insights" | "documentation";

interface CAMCompliancePanelProps {
  tender: TenderDocument;
  compact?: boolean;
}

export function CAMCompliancePanel({ tender, compact = false }: CAMCompliancePanelProps) {
  const [profile, setProfile] = useState<CAMComplianceProfile | null>(null);
  const [selectedTab, setSelectedTab] = useState<CAMPanelTab>("assessment");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [strategicLoading, setStrategicLoading] = useState(false);

  const [supplierReports, setSupplierReports] = useState<CAMSupplierVerificationReport[]>([]);
  const [costAnalysis, setCostAnalysis] = useState<CAMCostAnalysis[]>([]);
  const [strategicInsights, setStrategicInsights] = useState<CAMStrategicInsights | null>(null);
  const [docTracker, setDocTracker] = useState<CAMDocumentationTracker | null>(null);
  const [docAuditSummary, setDocAuditSummary] = useState<string | null>(null);

  const refreshPart2 = useCallback((prof: CAMComplianceProfile) => {
    const suppliers = verifySuppliersForCAMProfile(prof);
    setSupplierReports(suppliers);

    const costs = analyzeCAMCostImpactForProfile(prof);
    setCostAnalysis(costs);

    const tracker = createCAMDocumentationTracker(prof);
    setDocTracker(tracker);

    setStrategicLoading(true);
    generateCAMStrategicInsights(prof, costs)
      .then(setStrategicInsights)
      .catch(() => setStrategicInsights(null))
      .finally(() => setStrategicLoading(false));

    analyzeCAMDocumentationAudit(tracker, prof)
      .then((audit) => setDocAuditSummary(audit.summary))
      .catch(() => setDocAuditSummary(null));
  }, []);

  useEffect(() => {
    const reqs = defaultCAMRequirementsForTender(tender);
    const prof = createCAMComplianceProfile(tender, reqs);
    setProfile(prof);
    refreshPart2(prof);

    let cancelled = false;
    setInsightsLoading(true);
    analyzeCAMComplianceInsights(prof)
      .then((insights) => {
        if (!cancelled) {
          setProfile((p) =>
            p ? { ...p, assessment: { ...p.assessment, insightsDeepSeek: insights } } : p
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tender.id, refreshPart2]);

  const bidImpact = profile ? analyzeCAMImpactOnBid(profile.assessment) : null;
  const conformitaStyle = profile
    ? CAM_CONFORMITA_STYLES[profile.assessment.conformitaComplessiva]
    : CAM_CONFORMITA_STYLES.NON_CONFORME;

  const syncProfile = (next: CAMComplianceProfile) => {
    setProfile(next);
    refreshPart2(next);
  };

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
      const requirements = await requestCAMRequirementsParse({
        bandoPdfBase64: base64,
        fileName: file.name,
        tender,
      });
      const prof = createCAMComplianceProfile(tender, requirements);
      setInsightsLoading(true);
      const insights = await analyzeCAMComplianceInsights(prof);
      syncProfile({ ...prof, assessment: { ...prof.assessment, insightsDeepSeek: insights } });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing CAM");
    } finally {
      setIsParsing(false);
      e.target.value = "";
      setInsightsLoading(false);
    }
  };

  const handleStatoChange = (requirementId: string, stato: CAMAssessmentStato) => {
    if (!profile) return;
    const item = profile.assessment.assessmentItems.find((i) => i.requirementId === requirementId);
    if (!item) return;
    const punti =
      stato === "CONFORME"
        ? item.puntiMassimi
        : stato === "IN_VALUTAZIONE"
          ? Math.round(item.puntiMassimi * 0.5)
          : 0;
    syncProfile(updateCAMAssessmentItem(profile, requirementId, punti, stato));
  };

  const handleDocUpload = (requirementId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !docTracker) return;
    const updated = addCAMDocument(docTracker, requirementId, { fileName: file.name });
    setDocTracker(updated);
    e.target.value = "";
  };

  const exportReport = () => {
    if (!profile || !bidImpact) return;
    const docReport = docTracker ? generateCAMComplianceReport(docTracker) : null;
    const lines = [
      `CAM Compliance — ${tender.title}`,
      `Score: ${profile.assessment.scoreTotale}%`,
      `Conformità: ${formatConformitaLabel(profile.assessment.conformitaComplessiva)}`,
      strategicInsights?.strategia ?? "",
      "",
      bidImpact.recommendation,
      docReport ? `Doc audit ready: ${docReport.readyForAudit}` : "",
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
  };

  if (!profile) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const tabs: Array<{ id: CAMPanelTab; label: string }> = [
    { id: "assessment", label: "Assessment" },
    { id: "suppliers", label: "Supplier" },
    { id: "costs", label: "Costi" },
    { id: "insights", label: "Strategy" },
    { id: "documentation", label: "Doc" },
  ];

  const totalCostDelta = costAnalysis.reduce((s, c) => s + c.deltaCosto, 0);

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="border border-dashed border-emerald-900/50 rounded-lg p-3 text-center">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePdfUpload}
            disabled={isParsing}
            className="hidden"
            id="cam-bando-input"
          />
          <label htmlFor="cam-bando-input" className="cursor-pointer block">
            <FileText className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <div className="text-[10px] text-white font-bold">Carica bando PDF (sezione CAM)</div>
          </label>
        </div>
      )}

      {isParsing && (
        <div className="flex items-center gap-2 text-[9px] text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
          Analisi requisiti CAM…
        </div>
      )}
      {parseError && <div className="text-[9px] text-red-400">{parseError}</div>}
      {(insightsLoading || strategicLoading) && (
        <div className="text-[8px] text-slate-500">Analisi AI in corso…</div>
      )}

      <div className={`rounded-lg p-4 border ${conformitaStyle.box}`}>
        <div className="flex justify-between items-start gap-3">
          <div>
            <div className={`text-[11px] font-bold uppercase ${conformitaStyle.text}`}>
              {formatConformitaLabel(profile.assessment.conformitaComplessiva)}
            </div>
            <div className="text-[9px] text-slate-400 mt-1">
              {profile.assessment.requisitiObbligatoriCoperti} /{" "}
              {profile.assessment.totalRequisitiObbligatori} obbligatori
              {totalCostDelta > 0 && (
                <span className="ml-2">· Extra CAM ~€{totalCostDelta.toLocaleString("it-IT")}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-[22px] font-bold ${conformitaStyle.score}`}>
              {profile.assessment.scoreTotale}%
            </div>
            <div className="text-[8px] text-slate-400">CAM Score</div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-neutral-800 overflow-x-auto scrollbar-thin">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedTab(id)}
            className={`cursor-pointer shrink-0 px-3 py-2 text-[9px] font-bold uppercase transition-colors ${
              selectedTab === id
                ? id === "assessment"
                  ? "text-emerald-400 border-b-2 border-emerald-400"
                  : id === "suppliers"
                    ? "text-emerald-400 border-b-2 border-emerald-400"
                    : id === "costs"
                      ? "text-amber-400 border-b-2 border-amber-400"
                      : id === "insights"
                        ? "text-blue-400 border-b-2 border-blue-400"
                        : "text-purple-400 border-b-2 border-purple-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {selectedTab === "assessment" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Leaf className="w-3 h-3 text-emerald-400" />
              Requisiti CAM
            </div>
            {profile.assessment.assessmentItems.map((item) => {
              const req = profile.requirements.find((r) => r.id === item.requirementId);
              return (
                <div
                  key={item.requirementId}
                  className="bg-neutral-950 border border-neutral-800 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-white">{item.titolo}</span>
                        {req?.obbligatorio && (
                          <span className="text-[7px] font-bold text-red-400 bg-red-950 px-1.5 py-0.5 rounded">
                            MUST
                          </span>
                        )}
                      </div>
                      <div className="text-[8px] text-slate-400 mt-1 line-clamp-2">
                        {req?.categoria.descrizione}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <select
                        value={item.stato}
                        onChange={(e) =>
                          handleStatoChange(item.requirementId, e.target.value as CAMAssessmentStato)
                        }
                        className="cursor-pointer text-[9px] px-2 py-1 bg-neutral-900 border border-neutral-700 text-white rounded max-w-[120px]"
                      >
                        <option value="NON_INIZIATO">Non iniziato</option>
                        <option value="IN_VALUTAZIONE">In valutazione</option>
                        <option value="CONFORME">Conforme</option>
                        <option value="NON_CONFORME">Non conforme</option>
                      </select>
                      <div className="text-[9px] text-slate-400 mt-1">
                        {item.puntiOttenuti} / {item.puntiMassimi} pt
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {bidImpact && (
            <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
              <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-2 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" />
                Impatto su bid
              </h3>
              <div className="space-y-2 text-[9px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Vantaggio competitivo</span>
                  <span
                    className={`font-bold ${bidImpact.bidAdvantage > 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {bidImpact.bidAdvantage > 0 ? "+" : ""}
                    {bidImpact.bidAdvantage} pt
                  </span>
                </div>
                <div className="text-[8px] text-slate-300 pt-2 border-t border-blue-900/30">
                  {bidImpact.recommendation}
                </div>
              </div>
            </div>
          )}

          {profile.miglioramentiPossibili.length > 0 && (
            <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3">
              <h3 className="text-[10px] font-bold text-emerald-400 uppercase mb-2">
                Miglioramenti possibili
              </h3>
              {profile.miglioramentiPossibili.map((migl, i) => (
                <div key={i} className="text-[9px] text-slate-300 mb-2">
                  <span className="font-bold text-emerald-300">{migl.categoria}</span> —{" "}
                  {migl.descrizione} (+{migl.puntiAggiuntivi} pt)
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTab === "suppliers" && supplierReports.length > 0 && (
        <div className="space-y-3">
          {supplierReports.map((report) => {
            const style = supplierComplianceStyle(report.complianceRate);
            return (
              <div key={report.camRequirementId} className={`rounded-lg p-3 border ${style.box}`}>
                <h4 className="text-[10px] font-bold text-emerald-400 uppercase mb-2 flex items-center gap-1">
                  <Factory className="w-3 h-3" />
                  {report.titolo}
                </h4>
                <div className="space-y-1.5 text-[9px] mb-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fornitori verificati</span>
                    <span className="text-white font-bold">{report.suppliersVerificati.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Compliance rate</span>
                    <span className={`font-bold ${style.rate}`}>{report.complianceRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Risk supply chain</span>
                    <span
                      className={`font-bold ${report.riskSupplyChain > 50 ? "text-red-400" : "text-amber-400"}`}
                    >
                      {report.riskSupplyChain}/100
                    </span>
                  </div>
                </div>
                {report.suppliersVerificati.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 mb-1.5"
                  >
                    <div className="flex justify-between">
                      <span className="text-[10px] font-bold text-white">{supplier.nome}</span>
                      <span className="text-[9px] text-emerald-400">{supplier.scoreConformita}%</span>
                    </div>
                    <div className="text-[8px] text-slate-400">
                      {supplier.certifications.join(", ")}
                    </div>
                    {supplier.noteSostenibilita && (
                      <div className="text-[8px] text-slate-300 mt-1">{supplier.noteSostenibilita}</div>
                    )}
                  </div>
                ))}
                {report.azioni.map((a, i) => (
                  <div key={i} className="text-[8px] text-slate-400 mt-1">
                    {a}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {selectedTab === "costs" && costAnalysis.length > 0 && (
        <div className="space-y-3">
          <div className="text-[9px] text-slate-400 bg-neutral-950 rounded p-2 border border-neutral-800">
            Investimento CAM totale stimato:{" "}
            <span className="text-amber-400 font-bold">
              €{totalCostDelta.toLocaleString("it-IT")}
            </span>
          </div>
          {costAnalysis.map((analysis) => (
            <div
              key={analysis.requirementId}
              className="bg-neutral-950 border border-neutral-800 rounded-lg p-3"
            >
              <div className="text-[10px] font-bold text-white mb-2">{analysis.titolo}</div>
              <div className="space-y-1.5 text-[9px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Baseline</span>
                  <span className="text-white">
                    €{(analysis.importoBaseLine / 1000).toFixed(0)}k
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Con CAM</span>
                  <span className="text-white">€{(analysis.importoCAM / 1000).toFixed(0)}k</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Delta</span>
                  <span className="text-amber-400 font-bold">
                    €{(analysis.deltaCosto / 1000).toFixed(0)}k (+{analysis.percentualeIncremento}%)
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-neutral-700">
                  <span className="text-slate-400">Payback</span>
                  <span className="text-blue-400 font-bold">{analysis.ROI.paybackMesi} mesi</span>
                </div>
                <div className="text-[8px] text-slate-300 mt-2">{analysis.recommendation}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTab === "insights" && (
        <div className="space-y-3">
          {strategicLoading && (
            <div className="flex items-center gap-2 text-[9px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Strategia CAM…
            </div>
          )}
          {strategicInsights && (
            <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
              <div className="text-[10px] font-bold text-blue-400 uppercase mb-2">Strategia CAM</div>
              <div className="text-[9px] text-slate-300 mb-3">{strategicInsights.strategia}</div>
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div>
                  <div className="font-bold text-emerald-400 mb-1">Punti forza</div>
                  {strategicInsights.puntiForza.map((p, i) => (
                    <div key={i} className="text-[8px] text-slate-300">
                      ✓ {p}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-bold text-red-400 mb-1">Punti deboli</div>
                  {strategicInsights.puntiDeboli.map((p, i) => (
                    <div key={i} className="text-[8px] text-slate-300">
                      ✗ {p}
                    </div>
                  ))}
                </div>
              </div>
              {strategicInsights.opportunita.length > 0 && (
                <div className="mt-2 text-[8px]">
                  <span className="font-bold text-slate-300">Opportunità: </span>
                  {strategicInsights.opportunita.join(" · ")}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-blue-900/30">
                <div className="font-bold text-slate-300 mb-1 text-[9px]">Raccomandazioni</div>
                {strategicInsights.raccomandazioni.map((r, i) => (
                  <div key={i} className="text-[8px] text-slate-300">
                    → {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTab === "documentation" && docTracker && (
        <div className="space-y-3">
          {docAuditSummary && (
            <div className="text-[8px] text-slate-400 bg-neutral-950 rounded p-2 border border-neutral-800">
              {docAuditSummary}
            </div>
          )}
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
            <div className="text-[10px] font-bold text-slate-300 mb-2">Progresso documentazione</div>
            <div className="h-2 bg-neutral-900 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${docTracker.progressoDocumentazione}%` }}
              />
            </div>
            <div className="text-[9px] text-slate-400">
              {docTracker.documentiObbligatori.filter((d) => d.stato !== "BOZZA").length} /{" "}
              {docTracker.documentiObbligatori.length} sottomessi
              {generateCAMComplianceReport(docTracker).readyForAudit && (
                <span className="text-emerald-400 ml-2">· Pronto per audit</span>
              )}
            </div>
          </div>

          {docTracker.documentiObbligatori.map((doc, i) => (
            <div
              key={doc.id}
              className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-bold text-white">{doc.titolo}</div>
                  <div className="text-[8px] text-slate-400">{doc.tipoDocumento}</div>
                  {doc.fileName && (
                    <div className="text-[8px] text-slate-400 mt-1">📎 {doc.fileName} v{doc.versione}</div>
                  )}
                  <input
                    type="file"
                    id={`cam-doc-${doc.requirementId}`}
                    className="hidden"
                    onChange={(e) => handleDocUpload(doc.requirementId, e)}
                  />
                  <label
                    htmlFor={`cam-doc-${doc.requirementId}`}
                    className="cursor-pointer inline-flex items-center gap-1 text-[8px] text-emerald-400 mt-1.5"
                  >
                    <Upload className="w-3 h-3" />
                    Carica
                  </label>
                </div>
                <select
                  value={doc.stato}
                  onChange={(e) => {
                    const updated = updateCAMDocumentStato(
                      docTracker,
                      i,
                      e.target.value as CAMDocumentoStato
                    );
                    setDocTracker(updated);
                  }}
                  className="cursor-pointer text-[8px] px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 text-white rounded"
                >
                  <option value="BOZZA">Bozza</option>
                  <option value="SOTTOMESSA">Sottomessa</option>
                  <option value="VERIFICATA">Verificata</option>
                  <option value="RICHIESTA_MODIFICA">Modifica</option>
                </select>
              </div>
            </div>
          ))}

          {docTracker.auditTrail.length > 0 && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Audit trail</div>
              {docTracker.auditTrail.slice(-5).map((entry, i) => (
                <div key={i} className="text-[8px] text-slate-400 mb-1">
                  <span className="text-slate-500">
                    {new Date(entry.dataOra).toLocaleString("it-IT")} —
                  </span>{" "}
                  {entry.azione}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={exportReport}
        className="cursor-pointer w-full text-[10px] font-bold px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
      >
        Export report CAM
      </button>
    </div>
  );
}
