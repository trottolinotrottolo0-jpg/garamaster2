import { useState } from "react";
import { Loader2, Microscope, X } from "lucide-react";
import { requestPostGaraForensics } from "../lib/postGaraForensicsApi";
import {
  buildPostGaraForensicsNote,
  extractPatternsFromForensics,
} from "../lib/postGaraForensicsNote";
import { entriesToPromptItems } from "../lib/storicoGare";
import { savePostGaraForensicsResult } from "../services/storicoGareService";
import type { ProfiloImpresaContext } from "../types/database";
import type { StoricoGaraAiEntry } from "../types/storicoGare";

type PostGaraForensicsModalProps = {
  entry: StoricoGaraAiEntry;
  esito: "vinta" | "persa";
  userId: string;
  profilo?: ProfiloImpresaContext | null;
  storicoEntries?: StoricoGaraAiEntry[];
  onClose: () => void;
  onSaved: () => void;
};

export function PostGaraForensicsModal({
  entry,
  esito,
  userId,
  profilo,
  storicoEntries = [],
  onClose,
  onSaved,
}: PostGaraForensicsModalProps) {
  const [ribassoVincitore, setRibassoVincitore] = useState(
    entry.ribassoOfferto != null ? String(entry.ribassoOfferto) : ""
  );
  const [motivazione, setMotivazione] = useState("");
  const [noteOperative, setNoteOperative] = useState("");
  const [analisi, setAnalisi] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState("deepseek/deepseek-chat");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esitoLabel = esito === "vinta" ? "Vinta" : "Persa";
  const esitoColor = esito === "vinta" ? "text-emerald-400" : "text-amber-400";

  const handleAnalyze = async () => {
    if (!motivazione.trim() && !noteOperative.trim()) {
      setError("Compila almeno motivazione o note operative.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ribasso =
        ribassoVincitore.trim() !== "" ? Number(ribassoVincitore.replace(",", ".")) : null;

      const snippet = entriesToPromptItems(
        storicoEntries.filter((e) => e.id !== entry.id).slice(0, 15)
      );

      const result = await requestPostGaraForensics({
        esito,
        entry,
        form: {
          ribassoVincitore: ribasso != null && !Number.isNaN(ribasso) ? ribasso : null,
          motivazione: motivazione.trim(),
          noteOperative: noteOperative.trim(),
        },
        profilo,
        storicoSnippet: snippet,
      });

      setAnalisi(result.analisi);
      setModelUsed(result.model);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analisi non riuscita");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!analisi) return;

    setSaving(true);
    setError(null);

    try {
      const ribasso =
        ribassoVincitore.trim() !== "" ? Number(ribassoVincitore.replace(",", ".")) : null;
      const ribassoNum = ribasso != null && !Number.isNaN(ribasso) ? ribasso : null;

      const noteAi = buildPostGaraForensicsNote({
        esito,
        form: {
          ribassoVincitore: ribassoNum,
          motivazione: motivazione.trim(),
          noteOperative: noteOperative.trim(),
        },
        analisiGemini: analisi,
        model: modelUsed,
      });

      const patterns = extractPatternsFromForensics(analisi);

      const ok = await savePostGaraForensicsResult({
        storicoId: entry.id,
        userId,
        esito,
        ribassoVincitore: ribassoNum,
        noteAi,
        patternVincenti: patterns.length ? patterns : undefined,
      });

      if (!ok) {
        throw new Error("Salvataggio storico non riuscito.");
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-labelledby="post-gara-forensics-title"
    >
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-neutral-800">
          <div>
            <h2
              id="post-gara-forensics-title"
              className="text-sm font-extrabold text-white flex items-center gap-2"
            >
              <Microscope className="w-4 h-4 text-brand-gold" />
              Post-Gara Forensics & Learning Loop
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {entry.titoloGara} · CIG {entry.cig}
            </p>
            <p className={`text-xs font-bold mt-1 ${esitoColor}`}>Esito: {esitoLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer p-1 text-slate-500 hover:text-white"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1 scrollbar-thin">
          {!analisi ? (
            <>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Compila i dati post-gara: Gemini analizzerà l&apos;esito e salverà l&apos;analisi nello
                storico per le prossime gare simili.
              </p>

              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Ribasso vincitore (%)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="es. 12.5"
                  value={ribassoVincitore}
                  onChange={(e) => setRibassoVincitore(e.target.value)}
                  className="w-full text-sm bg-black border border-neutral-700 rounded-lg px-3 py-2 text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Motivazione esclusione / vittoria
                </span>
                <textarea
                  rows={3}
                  placeholder={
                    esito === "vinta"
                      ? "Es. miglior rapporto qualità/prezzo, punteggio tecnico superiore…"
                      : "Es. ribasso troppo alto del aggiudicatario, carenza punteggio tecnico…"
                  }
                  value={motivazione}
                  onChange={(e) => setMotivazione(e.target.value)}
                  className="w-full text-sm bg-black border border-neutral-700 rounded-lg px-3 py-2 text-white resize-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Note operative
                </span>
                <textarea
                  rows={3}
                  placeholder="Tempi, competitor, errori in offerta, RTI, ecc."
                  value={noteOperative}
                  onChange={(e) => setNoteOperative(e.target.value)}
                  className="w-full text-sm bg-black border border-neutral-700 rounded-lg px-3 py-2 text-white resize-none"
                />
              </label>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-brand-gold uppercase">Analisi Gemini</p>
              <div className="rounded-xl border border-neutral-800 bg-black/60 p-3 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto">
                {analisi}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>

        <div className="p-4 border-t border-neutral-800 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-xs font-bold text-slate-400 hover:text-white px-3 py-2"
          >
            Annulla
          </button>
          {!analisi ? (
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading}
              className="cursor-pointer flex items-center gap-2 bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analisi in corso…
                </>
              ) : (
                "Analizza con Gemini"
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAnalisi(null)}
                className="cursor-pointer text-xs font-bold text-slate-400 border border-neutral-700 px-3 py-2 rounded-lg hover:text-white"
              >
                Modifica dati
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="cursor-pointer flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Salvataggio…
                  </>
                ) : (
                  "Salva nello storico"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
