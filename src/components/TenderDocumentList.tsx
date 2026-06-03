import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import {
  documentStatoClasses,
  documentStatoLabel,
} from "../lib/tenderPreparationEngine";
import type { TenderBusta, TenderDocumentRow } from "../types/tenderPreparation";

type TenderDocumentListProps = {
  documents: TenderDocumentRow[];
  bustaFilter?: TenderBusta | "all";
  uploadingDocId?: string | null;
  onUpload: (documentId: string, file: File) => void;
  onMarkReview: (documentId: string) => void;
  onMarkMissing: (documentId: string) => void;
};

export function TenderDocumentList({
  documents,
  bustaFilter = "all",
  uploadingDocId,
  onUpload,
  onMarkReview,
  onMarkMissing,
}: TenderDocumentListProps) {
  const filtered =
    bustaFilter === "all"
      ? documents
      : documents.filter((d) => d.categoria === bustaFilter || d.categoria === "generale");

  if (!filtered.length) {
    return (
      <p className="text-[11px] text-slate-500 italic py-4 text-center">
        Nessun documento in questa sezione. Usa «Suggerisci con AI» per arricchire la lista.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {filtered.map((doc) => (
        <li
          key={doc.id}
          className={`rounded-xl border px-3 py-2.5 ${documentStatoClasses(doc.stato)}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-white leading-snug">{doc.nome}</p>
              <p className="text-[9px] mt-0.5 opacity-80">
                {documentStatoLabel(doc.stato)}
                {doc.uploaded_at
                  ? ` · ${new Date(doc.uploaded_at).toLocaleDateString("it-IT")}`
                  : ""}
                {doc.file_name ? ` · ${doc.file_name}` : ""}
              </p>
              {doc.note && (
                <p className="text-[9px] mt-1 text-slate-400 leading-snug">{doc.note}</p>
              )}
            </div>
            {doc.stato === "CARICATO" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : doc.stato === "DA_REVISIONARE" ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            <label className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-black/40 px-2 py-1 text-[9px] font-bold text-slate-300 hover:border-brand-gold/50 hover:text-brand-gold">
              {uploadingDocId === doc.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Carica file
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                disabled={uploadingDocId === doc.id}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(doc.id, file);
                  e.target.value = "";
                }}
              />
            </label>
            {doc.stato !== "DA_REVISIONARE" && (
              <button
                type="button"
                onClick={() => onMarkReview(doc.id)}
                className="cursor-pointer text-[9px] font-bold text-amber-400 border border-amber-900/40 rounded-lg px-2 py-1 hover:bg-amber-950/30"
              >
                Da revisionare
              </button>
            )}
            {doc.stato !== "MANCANTE" && (
              <button
                type="button"
                onClick={() => onMarkMissing(doc.id)}
                className="cursor-pointer text-[9px] font-bold text-slate-400 border border-neutral-800 rounded-lg px-2 py-1 hover:text-red-300"
              >
                Segna mancante
              </button>
            )}
            {doc.file_url && (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-[9px] font-bold text-brand-gold flex items-center gap-1 px-2 py-1"
              >
                <FileUp className="w-3 h-3" />
                Apri
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
