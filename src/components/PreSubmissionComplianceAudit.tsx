import { useState, useEffect, useCallback } from "react";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Upload,
} from "lucide-react";
import type {
  TenderDocument,
  PreSubmissionComplianceAudit,
  CompanyProfile,
  ComplianceChecklistStato,
} from "../types";
import {
  createPreSubmissionAudit,
  updateComplianceItem,
  generatePreSubmissionSummary,
  PRE_SUBMISSION_RISK_STYLES,
  manageDocumentVersion,
  generateExpiryReminders,
  generateFinalSubmissionChecklist,
  generateDocumentAuditTrail,
  EXPIRY_SEVERITY_STYLES,
  FINAL_VERDICT_STYLES,
  type ReminderSchedule,
  type FinalSubmissionChecklist,
} from "../lib/preSubmissionAuditEngine";
import { estimateMargineForTender } from "../lib/delayPenaltyEngine";
import { parseTenderValue } from "../lib/bidCalculations";
import { requestRiskComplianceParse } from "../lib/parseRiskComplianceApi";
import {
  analyzePreSubmissionComplianceInsights,
  analyzeComplianceAuditDeep,
  type ComplianceAuditDeepInsights,
} from "../lib/gemini";
import { readFileAsBase64 } from "../lib/parseSOAApi";

interface PreSubmissionComplianceAuditProps {
  isOpen: boolean;
  onClose: () => void;
  onReadyToSubmit?: (audit: PreSubmissionComplianceAudit) => void;
  tender: TenderDocument;
  companyProfile?: CompanyProfile | null;
}

type AuditTab = "items" | "reminders" | "insights" | "final";

const CATEGORY_PROGRESS_BADGE: Record<string, string> = {
  complete: "bg-emerald-900/60 text-emerald-400",
  partial: "bg-amber-900/60 text-amber-400",
  low: "bg-red-900/60 text-red-400",
};

async function computeSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "hex"))
    .join("");
}

export function PreSubmissionComplianceAudit({
  isOpen,
  onClose,
  onReadyToSubmit,
  tender,
  companyProfile: companyProfileProp,
}: PreSubmissionComplianceAuditProps) {
  const [audit, setAudit] = useState<PreSubmissionComplianceAudit | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<AuditTab>("items");
  const [deepInsights, setDeepInsights] = useState<ComplianceAuditDeepInsights | null>(null);
  const [deepInsightsLoading, setDeepInsightsLoading] = useState(false);
  const [expiryReminders, setExpiryReminders] = useState<ReminderSchedule | null>(null);
  const [finalChecklist, setFinalChecklist] = useState<FinalSubmissionChecklist | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  const initAudit = useCallback(
    (prof: CompanyProfile | null, parsedRequirements?: import("../types").ComplianceRequirement[]) => {
      const newAudit = createPreSubmissionAudit(tender, prof, parsedRequirements);
      setAudit(newAudit);
      setInsightsLoading(true);
      analyzePreSubmissionComplianceInsights(newAudit)
        .then((insights) => setAudit({ ...newAudit, insightsDeepSeek: insights }))
        .catch(() => {})
        .finally(() => setInsightsLoading(false));
    },
    [tender]
  );

  useEffect(() => {
    if (!isOpen) {
      setAudit(null);
      setParseError(null);
      setExpandedCategories(new Set());
      setDuplicateWarning(null);
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
    setSelectedTab("items");
    initAudit(prof);
  }, [isOpen, tender.id, companyProfileProp, initAudit]);

  useEffect(() => {
    if (!audit) {
      setDeepInsights(null);
      setExpiryReminders(null);
      setFinalChecklist(null);
      return;
    }

    setExpiryReminders(generateExpiryReminders(audit.checklistItems));
    const importo = parseTenderValue(tender.value);
    const margine = estimateMargineForTender(tender, companyProfileProp ?? undefined);
    setFinalChecklist(generateFinalSubmissionChecklist(audit, importo, margine));

    setDeepInsightsLoading(true);
    analyzeComplianceAuditDeep(audit)
      .then(setDeepInsights)
      .catch(() => setDeepInsights(null))
      .finally(() => setDeepInsightsLoading(false));
  }, [audit, tender, companyProfileProp]);

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
      const { complianceRequirements } = await requestRiskComplianceParse({
        bandoPdfBase64: base64,
        fileName: file.name,
        tender,
      });

      let prof: CompanyProfile | null = companyProfileProp ?? null;
      if (!prof) {
        const raw = localStorage.getItem("gm_company_profile");
        if (raw) prof = JSON.parse(raw) as CompanyProfile;
      }
      initAudit(prof, complianceRequirements);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing bando");
    } finally {
      setIsParsing(false);
      e.target.value = "";
    }
  };

  const handleItemDocUpload = async (itemId: string, file: File) => {
    if (!audit) return;
    setUploadingItemId(itemId);
    setDuplicateWarning(null);
    try {
      const checksum = await computeSha256(file);
      const result = manageDocumentVersion(audit, itemId, {
        fileName: file.name,
        fileSize: file.size,
        checksum,
      });
      if (result.isDuplicate) {
        setDuplicateWarning(result.duplicateMsg ?? "Documento duplicato rilevato.");
      }
      setAudit(result.audit);
    } finally {
      setUploadingItemId(null);
    }
  };

  const toggleCategory = (categoria: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoria)) next.delete(categoria);
      else next.add(categoria);
      return next;
    });
  };

  if (!isOpen) return null;

  const riskStyle = audit
    ? PRE_SUBMISSION_RISK_STYLES[audit.complianceRisk]
    : PRE_SUBMISSION_RISK_STYLES.GIALLO;

  const titlePreview =
    tender.title.length > 50 ? `${tender.title.slice(0, 50)}…` : tender.title;

  const summary = audit ? generatePreSubmissionSummary(audit) : "";
  const blockingIssues = audit?.issuesFound.filter((i) => i.severity === "BLOCKING") ?? [];
  const docTrail = audit ? generateDocumentAuditTrail(audit.checklistItems) : [];
  const canSubmit =
    Boolean(audit?.readyForSubmission) && finalChecklist?.verdictFinal === "GO";

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-start p-4 border-b border-neutral-800 shrink-0 gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              Pre-Submission Compliance Audit
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

        {audit && (
          <div className="flex gap-0 border-b border-neutral-800 px-4 shrink-0 overflow-x-auto bg-black">
            {(
              [
                ["items", "Items"],
                ["reminders", "📅 Reminders"],
                ["insights", "💡 Insights"],
                ["final", "✈️ Final Check"],
              ] as const
            ).map(([tab, label]) => (
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
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
          <div className="border border-dashed border-blue-900/50 rounded-lg p-3 text-center">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handlePdfUpload}
              disabled={isParsing}
              className="hidden"
              id="presubmission-bando-input"
            />
            <label htmlFor="presubmission-bando-input" className="cursor-pointer block">
              <FileText className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-[10px] text-white font-bold">
                Carica bando PDF (requisiti compliance)
              </div>
            </label>
          </div>

          {isParsing && (
            <div className="flex items-center justify-center py-6 gap-3">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <span className="text-[10px] text-slate-400">Parsing requisiti bando…</span>
            </div>
          )}

          {parseError && (
            <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div className="text-[10px] text-red-400">{parseError}</div>
            </div>
          )}

          {duplicateWarning && (
            <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3 text-[9px] text-amber-300">
              {duplicateWarning}
            </div>
          )}

          {(insightsLoading || deepInsightsLoading) && !isParsing && selectedTab === "items" && (
            <div className="text-[8px] text-slate-500">Analisi AI in corso…</div>
          )}

          {audit && !isParsing && selectedTab === "items" && (
            <>
              <div className={`rounded-lg p-4 border ${riskStyle.box}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className={`text-[14px] font-bold uppercase ${riskStyle.text}`}>
                      {audit.complianceRisk}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Completion: {audit.completamentoPercent}%
                      {finalChecklist && (
                        <span className="ml-2">· Final: {finalChecklist.verdictFinal}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[16px] font-bold ${riskStyle.text}`}>
                      {audit.itemsObbligatori - audit.itemsObbligatoriBlocchi} /{" "}
                      {audit.itemsObbligatori}
                    </div>
                    <div className="text-[9px] text-slate-400">Obbligatori OK</div>
                  </div>
                </div>
                <div className="text-[9px] text-slate-300">{summary}</div>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-[10px] font-bold text-slate-400">COMPLETION OVERALL</div>
                  <div className="text-[10px] font-bold text-white">
                    {audit.completamentoPercent}%
                  </div>
                </div>
                <div className="h-2 bg-neutral-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${riskStyle.progress}`}
                    style={{ width: `${audit.completamentoPercent}%` }}
                  />
                </div>
              </div>

              {blockingIssues.length > 0 && (
                <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-3">
                  <h3 className="text-[10px] font-bold text-red-400 uppercase mb-2">
                    Blocchi critici
                  </h3>
                  {blockingIssues.map((issue, i) => (
                    <div key={i} className="text-[9px] text-red-300 mb-2">
                      <div className="font-bold">{issue.messaggio}</div>
                      <div className="text-[8px] text-slate-400">→ {issue.azione}</div>
                    </div>
                  ))}
                </div>
              )}

              {docTrail.length > 0 && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                    Upload history
                  </div>
                  {docTrail.slice(0, 5).map((entry, i) => (
                    <div key={i} className="text-[8px] text-slate-400 mb-1">
                      v{entry.versione} {entry.fileName} — {entry.titolo}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase">
                  Checklist per categoria
                </div>
                {audit.categorieBreakdown.map((category) => {
                  const badgeKey =
                    category.progressoPercent === 100
                      ? "complete"
                      : category.progressoPercent >= 70
                        ? "partial"
                        : "low";
                  return (
                    <div
                      key={category.nome}
                      className="bg-neutral-950 border border-neutral-800 rounded-lg"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(category.nome)}
                        className="cursor-pointer w-full flex items-center justify-between p-3 hover:bg-neutral-900 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-white">
                            {category.nome}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded ${CATEGORY_PROGRESS_BADGE[badgeKey]}`}
                          >
                            {category.itemsCompletati}/{category.itemsTotal}
                          </span>
                        </div>
                        {expandedCategories.has(category.nome) ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      {expandedCategories.has(category.nome) && (
                        <div className="border-t border-neutral-700 space-y-2 p-3">
                          {audit.checklistItems
                            .filter((i) => i.categoria === category.nome)
                            .map((item) => (
                              <div
                                key={item.id}
                                className={`bg-neutral-900 border-l-4 ${
                                  item.stato === "COMPLETATO"
                                    ? "border-emerald-500"
                                    : item.stato === "NON_APPLICABILE"
                                      ? "border-slate-600"
                                      : item.obbligatorio
                                        ? "border-red-500"
                                        : "border-amber-500"
                                } p-2.5 rounded`}
                              >
                                <div className="flex items-start gap-2 mb-1">
                                  <input
                                    type="checkbox"
                                    checked={item.stato === "COMPLETATO"}
                                    disabled={item.stato === "NON_APPLICABILE"}
                                    onChange={(e) => {
                                      const nuovoStato: ComplianceChecklistStato = e.target
                                        .checked
                                        ? "COMPLETATO"
                                        : "NON_INIZIATO";
                                      setAudit(
                                        updateComplianceItem(audit, item.id, nuovoStato)
                                      );
                                    }}
                                    className="w-4 h-4 mt-0.5 cursor-pointer"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-bold text-white flex items-center gap-1 flex-wrap">
                                      {item.titolo}
                                      {item.obbligatorio && (
                                        <span className="text-[7px] font-bold text-red-400 bg-red-950 px-1.5 py-0.5 rounded">
                                          MUST
                                        </span>
                                      )}
                                      {item.evidenza && (
                                        <span className="text-[7px] text-blue-400">
                                          v{item.evidenza.versione}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[8px] text-slate-400 mt-0.5">
                                      {item.descrizione}
                                    </div>
                                    {item.evidenza && (
                                      <div className="text-[8px] text-slate-500 mt-1">
                                        📎 {item.evidenza.fileName}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {item.stato !== "NON_APPLICABILE" && (
                                  <label className="cursor-pointer flex items-center gap-1 ml-6 mt-2 text-[8px] text-blue-400">
                                    <Upload className="w-3 h-3" />
                                    {uploadingItemId === item.id ? "Upload…" : "Carica documento"}
                                    <input
                                      type="file"
                                      className="hidden"
                                      disabled={uploadingItemId === item.id}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void handleItemDocUpload(item.id, f);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {audit && !isParsing && selectedTab === "reminders" && expiryReminders && (
            <div className="space-y-3">
              {expiryReminders.prossimoCritical && (
                <div
                  className={`rounded-lg p-3 border ${
                    EXPIRY_SEVERITY_STYLES[expiryReminders.prossimoCritical.severity].box
                  }`}
                >
                  <h3
                    className={`text-[10px] font-bold uppercase mb-2 ${
                      EXPIRY_SEVERITY_STYLES[expiryReminders.prossimoCritical.severity].text
                    }`}
                  >
                    Prossima scadenza critica
                  </h3>
                  <div className="text-[9px] text-slate-300 space-y-1">
                    <div className="font-bold">
                      {expiryReminders.prossimoCritical.messaggio}
                    </div>
                    {expiryReminders.prossimoCritical.azioni.map((a, i) => (
                      <div key={i} className="text-[8px] text-slate-400">
                        → {a}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expiryReminders.reminders.length === 0 ? (
                <div className="text-[9px] text-slate-500">Nessuna scadenza configurata.</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">
                    Tutti i reminder
                  </div>
                  {expiryReminders.reminders.map((reminder) => {
                    const rs = EXPIRY_SEVERITY_STYLES[reminder.severity];
                    return (
                      <div
                        key={reminder.itemId}
                        className={`bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 border-l-4 ${rs.border}`}
                      >
                        <div className="text-[10px] font-bold text-white">{reminder.titolo}</div>
                        <div className={`text-[9px] font-bold mt-1 ${rs.text}`}>
                          {reminder.messaggio}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {audit && !isParsing && selectedTab === "insights" && (
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
                      <div className="text-red-400 font-bold text-[8px] mb-1">Items critici</div>
                      {deepInsights.itemsCritici.map((item, i) => (
                        <div key={i} className="text-[8px] text-slate-300">
                          🔴 {item}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-amber-400 font-bold text-[8px] mb-1">Attenzione</div>
                      {deepInsights.itemsAttenzione.map((item, i) => (
                        <div key={i} className="text-[8px] text-slate-300">
                          🟡 {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-900">
                    {deepInsights.raccomandazioni.map((r, i) => (
                      <div key={i} className="text-[8px] text-slate-300">
                        → {r}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-900">
                    <div className="text-[8px] font-bold text-blue-400 mb-1">Priority actions</div>
                    {deepInsights.priorityActions.map((a, i) => (
                      <div key={i} className="text-[8px] text-slate-300 mb-1">
                        <span className="font-bold">
                          {i + 1}. {a.azione}
                        </span>
                        <div className="text-[7px] text-slate-400 ml-2">
                          {a.timeline} · {a.impact}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {audit && !isParsing && selectedTab === "final" && finalChecklist && (
            <div className="space-y-3">
              {(() => {
                const vs = FINAL_VERDICT_STYLES[finalChecklist.verdictFinal];
                return (
                  <div className={`rounded-lg p-4 border ${vs.box}`}>
                    <div className={`text-[16px] font-bold uppercase mb-2 ${vs.text}`}>
                      {finalChecklist.verdictFinal}
                    </div>
                    <div className={`text-[10px] ${vs.sub}`}>
                      {finalChecklist.raccomandazione}
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2">
                {finalChecklist.checklistItems.map((check, i) => (
                  <div
                    key={i}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`text-[12px] font-bold ${
                          check.status === "✓"
                            ? "text-emerald-400"
                            : check.status === "⚠️"
                              ? "text-amber-400"
                              : "text-red-400"
                        }`}
                      >
                        {check.status}
                      </span>
                      <div className="flex-1">
                        <div className="text-[10px] font-bold text-white">{check.check}</div>
                        <div className="text-[8px] text-slate-400 mt-0.5">{check.messaggio}</div>
                        {check.azione && (
                          <div className="text-[8px] text-amber-400 mt-1">→ {check.azione}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
            disabled={!canSubmit}
            onClick={() => {
              if (canSubmit && audit && onReadyToSubmit) {
                onReadyToSubmit(audit);
                onClose();
              }
            }}
            className={`cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 rounded transition-colors ${
              canSubmit
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-neutral-900 border border-neutral-700 text-slate-500 cursor-not-allowed"
            }`}
          >
            Pronto per invio
          </button>
        </div>
      </div>
    </div>
  );
}
