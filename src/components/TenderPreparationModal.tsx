import { useMemo } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Send,
  Building2,
  FileStack,
} from "lucide-react";
import { useTenderPreparation } from "../hooks/useTenderPreparation";
import { WIZARD_STEPS } from "../lib/tenderPreparationEngine";
import type { TenderBusta, TenderPreparationStep } from "../types/tenderPreparation";
import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import { TenderStatusBadge } from "./TenderStatusBadge";
import { TenderProgress } from "./TenderProgress";
import { TenderDocumentList } from "./TenderDocumentList";
import { TenderChecklist } from "./TenderChecklist";

type TenderPreparationModalProps = {
  open: boolean;
  onClose: () => void;
  tender: TenderDocument;
  userId?: string;
  profilo: ProfiloImpresaContext | null;
};

function stepBusta(step: TenderPreparationStep): TenderBusta | null {
  if (step === "amministrativa" || step === "tecnica" || step === "economica") return step;
  return null;
}

export function TenderPreparationModal({
  open,
  onClose,
  tender,
  userId,
  profilo,
}: TenderPreparationModalProps) {
  const prep = useTenderPreparation(userId, tender, profilo, open);

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === prep.step);
  const busta = stepBusta(prep.step);

  const autocompilazione = prep.bundle?.practice.autocompilazione ?? {};

  const missingSummary = useMemo(() => {
    if (!prep.bundle) return [];
    const docs = prep.bundle.documents.filter(
      (d) => d.obbligatorio && d.stato === "MANCANTE"
    );
    return docs.slice(0, 6).map((d) => d.nome);
  }, [prep.bundle]);

  if (!open) return null;

  const goNext = () => {
    if (stepIndex < WIZARD_STEPS.length - 1) {
      prep.setStep(WIZARD_STEPS[stepIndex + 1].id);
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) {
      prep.setStep(WIZARD_STEPS[stepIndex - 1].id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tender-prep-title"
    >
      <div className="w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden">
        <header className="shrink-0 flex items-start justify-between gap-3 p-4 border-b border-neutral-800">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
              <FileStack className="w-3.5 h-3.5" />
              Preparazione partecipazione
            </p>
            <h2 id="tender-prep-title" className="text-sm font-bold text-white truncate mt-0.5">
              {tender.title}
            </h2>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              CIG {tender.cig} · {tender.region}
            </p>
            {prep.bundle && (
              <div className="mt-2">
                <TenderStatusBadge stato={prep.bundle.practice.stato} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer shrink-0 p-2 rounded-lg border border-neutral-800 text-slate-400 hover:text-white hover:border-neutral-600"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <nav className="shrink-0 flex gap-1 overflow-x-auto px-3 py-2 border-b border-neutral-800 scrollbar-thin">
          {WIZARD_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => prep.setStep(s.id)}
              className={`cursor-pointer shrink-0 text-[9px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                prep.step === s.id
                  ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                  : i < stepIndex
                    ? "border-emerald-900/40 text-emerald-400/80"
                    : "border-neutral-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin min-h-0">
          {prep.loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-brand-gold mb-3" />
              <p className="text-[11px]">Caricamento pratica…</p>
            </div>
          )}

          {prep.error && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-[11px] text-red-300">
              {prep.error}
            </div>
          )}

          {!prep.loading && prep.bundle && (
            <>
              <TenderProgress
                percent={prep.progress.percent}
                documentsDone={prep.progress.documentsDone}
                documentsTotal={prep.progress.documentsTotal}
                checklistDone={prep.progress.checklistDone}
                checklistTotal={prep.progress.checklistTotal}
              />

              {prep.step === "panoramica" && (
                <div className="space-y-4">
                  <section className="rounded-xl border border-neutral-800 bg-black/40 p-3">
                    <p className="text-[10px] font-extrabold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-brand-gold" />
                      Dati impresa (autocompilati)
                    </p>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      {autocompilazione.ragioneSociale && (
                        <>
                          <dt className="text-slate-500">Ragione sociale</dt>
                          <dd className="text-white font-medium">{autocompilazione.ragioneSociale}</dd>
                        </>
                      )}
                      {autocompilazione.partitaIva && (
                        <>
                          <dt className="text-slate-500">P.IVA</dt>
                          <dd className="text-white font-mono">{autocompilazione.partitaIva}</dd>
                        </>
                      )}
                      {autocompilazione.soa && (
                        <>
                          <dt className="text-slate-500">SOA</dt>
                          <dd className="text-white">{autocompilazione.soa}</dd>
                        </>
                      )}
                      {autocompilazione.certificazioni?.length ? (
                        <>
                          <dt className="text-slate-500">Certificazioni</dt>
                          <dd className="text-white">{autocompilazione.certificazioni.join(", ")}</dd>
                        </>
                      ) : null}
                    </dl>
                  </section>

                  {missingSummary.length > 0 && (
                    <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3">
                      <p className="text-[10px] font-bold text-red-300 mb-1">Documenti mancanti</p>
                      <ul className="text-[10px] text-red-200/90 list-disc list-inside">
                        {missingSummary.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {prep.aiCritical.length > 0 && (
                    <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-3">
                      <p className="text-[10px] font-bold text-amber-300 mb-1">Critici (AI)</p>
                      <ul className="text-[10px] text-amber-200/90 list-disc list-inside">
                        {prep.aiCritical.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void prep.runAiSuggest()}
                    disabled={prep.aiLoading}
                    className="cursor-pointer w-full flex items-center justify-center gap-2 rounded-xl border border-brand-gold/50 bg-brand-gold/10 py-2.5 text-[11px] font-extrabold text-brand-gold hover:bg-brand-gold/20 disabled:opacity-50"
                  >
                    {prep.aiLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Suggerisci documenti e checklist con AI
                  </button>
                </div>
              )}

              {busta && (
                <div className="space-y-4">
                  <TenderChecklist
                    items={prep.bundle.checklist}
                    busta={busta}
                    onSetStato={(id, stato) => void prep.setChecklistStato(id, stato)}
                  />
                  <TenderDocumentList
                    documents={prep.bundle.documents}
                    bustaFilter={busta}
                    uploadingDocId={prep.uploadingDocId}
                    onUpload={(id, file) => void prep.uploadDocument(id, file)}
                    onMarkReview={(id) => void prep.setDocumentStato(id, "DA_REVISIONARE")}
                    onMarkMissing={(id) => void prep.setDocumentStato(id, "MANCANTE")}
                  />
                  {busta === "amministrativa" && prep.aiTexts.length > 0 && (
                    <section className="rounded-xl border border-neutral-800 bg-black/40 p-3">
                      <p className="text-[10px] font-extrabold uppercase text-slate-500 mb-2">
                        Testi standard (AI)
                      </p>
                      <ul className="space-y-2 text-[10px] text-slate-300 leading-relaxed">
                        {prep.aiTexts.map((t, i) => (
                          <li key={i} className="border-l-2 border-brand-gold/40 pl-2">
                            {t}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}

              {prep.step === "revisione" && (
                <div className="space-y-4">
                  <TenderDocumentList
                    documents={prep.bundle.documents}
                    bustaFilter="all"
                    uploadingDocId={prep.uploadingDocId}
                    onUpload={(id, file) => void prep.uploadDocument(id, file)}
                    onMarkReview={(id) => void prep.setDocumentStato(id, "DA_REVISIONARE")}
                    onMarkMissing={(id) => void prep.setDocumentStato(id, "MANCANTE")}
                  />
                  {prep.bundle.practice.stato === "PRONTA" && (
                    <button
                      type="button"
                      onClick={() => void prep.markInviata()}
                      className="cursor-pointer w-full flex items-center justify-center gap-2 rounded-xl border border-violet-800/50 bg-violet-950/40 py-3 text-[11px] font-extrabold text-violet-200 hover:bg-violet-900/40"
                    >
                      <Send className="w-4 h-4" />
                      Conferma invio offerta
                    </button>
                  )}
                  {prep.bundle.practice.stato !== "PRONTA" && (
                    <p className="text-[10px] text-amber-400 text-center">
                      Completa tutti i documenti obbligatori e la checklist per segnare la pratica come pronta.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="shrink-0 flex items-center justify-between gap-2 p-3 border-t border-neutral-800 bg-neutral-950/90">
          <button
            type="button"
            onClick={goPrev}
            disabled={stepIndex <= 0}
            className="cursor-pointer flex items-center gap-1 rounded-lg border border-neutral-800 px-3 py-2 text-[10px] font-bold text-slate-400 hover:text-white disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Indietro
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={stepIndex >= WIZARD_STEPS.length - 1}
            className="cursor-pointer flex items-center gap-1 rounded-lg border border-brand-gold/50 bg-brand-gold/10 px-3 py-2 text-[10px] font-bold text-brand-gold hover:bg-brand-gold/20 disabled:opacity-40"
          >
            Avanti
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </footer>
      </div>
    </div>
  );
}
