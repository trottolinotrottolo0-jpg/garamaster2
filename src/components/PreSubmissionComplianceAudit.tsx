import { useState, useEffect } from "react";
import { X, Loader2, CheckSquare, Square, AlertTriangle, CheckCircle } from "lucide-react";
import type { TenderDocument, PreSubmissionComplianceAuditResult, CompanyProfile } from "../types";
import {
  createPreSubmissionAudit,
  updateComplianceItem,
  AUDIT_VERDETTO_CLASS,
  COMPLIANCE_CATEGORY_LABEL,
} from "../lib/preSubmissionAuditEngine";

interface PreSubmissionComplianceAuditProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
  onReadyToSubmit?: (audit: PreSubmissionComplianceAuditResult) => void;
  companyProfile?: CompanyProfile;
}

type Tab = "items" | "reminders" | "final";

export function PreSubmissionComplianceAudit({
  isOpen,
  onClose,
  tender,
  onReadyToSubmit,
}: PreSubmissionComplianceAuditProps) {
  const [audit, setAudit] = useState<PreSubmissionComplianceAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("items");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    try {
      setAudit(createPreSubmissionAudit(tender));
    } finally {
      setLoading(false);
    }
  }, [isOpen, tender]);

  if (!isOpen) return null;

  const handleToggle = (itemId: string) => {
    if (!audit) return;
    const item = audit.items.find((i) => i.id === itemId);
    if (!item) return;
    setAudit(updateComplianceItem(audit, itemId, !item.completato));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        <div className="sticky top-0 bg-black z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-800 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-extrabold tracking-widest uppercase text-white">
              Pre-Submission Audit
            </span>
            {audit && (
              <span className="text-[9px] font-bold text-brand-gold font-mono">
                {audit.completamentoPercent}%
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {audit && (
          <div className="px-6 py-2 shrink-0 border-b border-neutral-900">
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  audit.completamentoPercent === 100 ? "bg-emerald-500" :
                  audit.completamentoPercent > 60 ? "bg-blue-500" : "bg-amber-500"
                }`}
                style={{ width: `${audit.completamentoPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex border-b border-neutral-800 px-6 shrink-0">
          {(["items", "reminders", "final"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`cursor-pointer text-[10px] font-bold uppercase tracking-wider px-3 py-2.5 border-b-2 transition-colors ${
                activeTab === t ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-white"
              }`}
            >
              {t === "items" ? `Checklist (${audit?.items.length ?? 0})` : t === "reminders" ? "Promemoria" : "Verdetto finale"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-3">
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-blue-400 mx-auto animate-spin" />
              <p className="text-xs text-slate-500 mt-3">Caricamento audit...</p>
            </div>
          )}

          {!loading && audit && (
            <>
              {activeTab === "items" && (
                <div className="space-y-2">
                  {audit.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleToggle(item.id)}
                      className={`cursor-pointer w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        item.completato
                          ? "bg-emerald-950/20 border-emerald-900/50"
                          : "bg-neutral-950 border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      {item.completato
                        ? <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        : <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold ${item.completato ? "text-emerald-400" : "text-white"}`}>
                            {item.titolo}
                          </span>
                          {item.obbligatorio && (
                            <span className="text-[8px] font-bold text-red-400 border border-red-800 rounded px-1">OBB</span>
                          )}
                          <span className="text-[8px] font-bold text-slate-600 border border-neutral-800 rounded px-1">
                            {COMPLIANCE_CATEGORY_LABEL[item.categoria]}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-0.5">{item.descrizione}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {activeTab === "reminders" && (
                <div className="space-y-2">
                  {audit.promemoria.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                      <p className="text-sm text-slate-300">Nessun promemoria urgente</p>
                    </div>
                  ) : (
                    audit.promemoria.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-amber-950/20 border border-amber-900/50 rounded-lg p-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        {p}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "final" && (
                <div className="space-y-4">
                  <div className={`border rounded-xl px-5 py-4 ${AUDIT_VERDETTO_CLASS[audit.verdetto]}`}>
                    <span className="text-2xl font-extrabold font-mono">
                      {audit.verdetto === "GO" ? "✓ GO — Pronto per invio" : audit.verdetto === "GO_WITH_CAUTION" ? "~ GO CON CAUTELA" : "✗ STOP — Non inviare"}
                    </span>
                    <p className="text-[10px] mt-1 opacity-70">{audit.completamentoPercent}% documenti completati</p>
                  </div>

                  {audit.criticitaBloccanti.length > 0 && (
                    <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4">
                      <span className="text-[9px] font-bold uppercase text-red-500 block mb-2">Criticità bloccanti</span>
                      {audit.criticitaBloccanti.map((c, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-red-300 mb-1">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                          {c}
                        </div>
                      ))}
                    </div>
                  )}

                  {audit.verdetto === "GO" && onReadyToSubmit && (
                    <button
                      type="button"
                      onClick={() => onReadyToSubmit(audit)}
                      className="cursor-pointer w-full bg-emerald-900 border border-emerald-700 hover:border-emerald-500 text-emerald-400 text-xs font-bold py-2.5 rounded-lg transition-colors"
                    >
                      Conferma Pronto per Invio
                    </button>
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
