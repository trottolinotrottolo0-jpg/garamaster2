import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2, Microscope, RefreshCw, Trash2 } from "lucide-react";
import {
  deleteStoricoEntry,
  listStoricoGareAi,
  updateStoricoEsito,
} from "../services/storicoGareService";
import { inferPatternVincenti } from "../lib/storicoGare";
import { PostGaraForensicsModal } from "./PostGaraForensicsModal";
import type { ProfiloImpresaContext } from "../types/database";
import type { StoricoGaraAiEntry, StoricoGaraEsito } from "../types/storicoGare";

type HistoricalKnowledgePanelProps = {
  userId: string | undefined;
  profilo?: ProfiloImpresaContext | null;
};

const ESITO_OPTIONS: { value: StoricoGaraEsito | ""; label: string }[] = [
  { value: "", label: "— Da definire" },
  { value: "vinta", label: "Vinta" },
  { value: "persa", label: "Persa" },
  { value: "non partecipato", label: "Non partecipato" },
];

type ForensicsTarget = {
  entry: StoricoGaraAiEntry;
  esito: "vinta" | "persa";
};

export function HistoricalKnowledgePanel({ userId, profilo }: HistoricalKnowledgePanelProps) {
  const [entries, setEntries] = useState<StoricoGaraAiEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forensicsTarget, setForensicsTarget] = useState<ForensicsTarget | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(await listStoricoGareAi(userId, 60));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento storico");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const patterns = inferPatternVincenti(entries);

  const handleEsitoChange = async (entry: StoricoGaraAiEntry, value: StoricoGaraEsito | "") => {
    if (value === "vinta" || value === "persa") {
      setForensicsTarget({ entry, esito: value });
      return;
    }

    await updateStoricoEsito(entry.id, { esito: value === "" ? null : value });
    load();
  };

  const hasForensics = (entry: StoricoGaraAiEntry) =>
    entry.tipoAnalisi === "post_gara_forensics" ||
    entry.noteAi.includes("POST-GARA FORENSICS");

  if (!userId) {
    return (
      <p className="text-sm text-slate-500 italic">
        Accedi per salvare e consultare lo storico analisi AI.
      </p>
    );
  }

  return (
    <>
      <section
        className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-4"
        id="historical-knowledge-panel"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Archive className="w-4 h-4 text-brand-gold" />
            Historical Knowledge Layer
          </h3>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="cursor-pointer p-1.5 text-slate-500 hover:text-brand-gold"
            title="Ricarica storico"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Ogni analisi AI su una gara viene salvata qui. Segna <strong className="text-white">Vinta</strong> o{" "}
          <strong className="text-white">Persa</strong> per avviare il{" "}
          <span className="text-brand-gold">Post-Gara Forensics</span> e alimentare il learning loop.
        </p>

        {patterns.length > 0 && (
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3">
            <p className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Pattern identificati</p>
            <ul className="text-[11px] text-emerald-200/90 list-disc list-inside space-y-0.5">
              {patterns.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {loading && !entries.length ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
            Caricamento storico…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500 italic py-4 text-center">
            Nessuna analisi salvata. Chatta su una gara per popolare lo storico.
          </p>
        ) : (
          <ul className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-neutral-800 bg-black/50 p-3 space-y-2"
              >
                <div className="flex justify-between gap-2 items-start">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">{entry.titoloGara}</p>
                    <p className="text-[10px] font-mono text-slate-500">
                      CIG {entry.cig} · {entry.tipoAnalisi} ·{" "}
                      {new Date(entry.createdAt).toLocaleDateString("it-IT")}
                    </p>
                    {hasForensics(entry) && (
                      <span className="inline-flex items-center gap-1 text-[9px] text-brand-gold mt-1">
                        <Microscope className="w-3 h-3" />
                        Forensics completata
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteStoricoEntry(entry.id);
                      load();
                    }}
                    className="cursor-pointer p-1 text-slate-600 hover:text-red-400 shrink-0"
                    title="Elimina"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <label className="text-[9px] text-slate-500 uppercase font-bold">Esito</label>
                  <select
                    value={entry.esito ?? ""}
                    onChange={(e) => {
                      const v = e.target.value as StoricoGaraEsito | "";
                      void handleEsitoChange(entry, v);
                    }}
                    className="text-[11px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white"
                  >
                    {ESITO_OPTIONS.map((o) => (
                      <option key={o.label} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  {(entry.esito === "vinta" || entry.esito === "persa") && !hasForensics(entry) && (
                    <button
                      type="button"
                      onClick={() =>
                        setForensicsTarget({
                          entry,
                          esito: entry.esito as "vinta" | "persa",
                        })
                      }
                      className="cursor-pointer text-[10px] font-bold text-brand-gold border border-brand-gold/40 rounded px-2 py-0.5 hover:bg-brand-gold/10"
                    >
                      Avvia forensics
                    </button>
                  )}

                  <label className="text-[9px] text-slate-500 uppercase font-bold ml-2">Ribasso %</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="—"
                    defaultValue={entry.ribassoOfferto ?? ""}
                    onBlur={async (e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      if (v !== entry.ribassoOfferto) {
                        await updateStoricoEsito(entry.id, { ribassoOfferto: v });
                        load();
                      }
                    }}
                    className="w-16 text-[11px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white"
                  />
                </div>

                {entry.noteAi && (
                  <p className="text-[10px] text-slate-500 line-clamp-4 leading-snug whitespace-pre-line">
                    {entry.noteAi.includes("ANALISI GEMINI")
                      ? entry.noteAi.split("--- ANALISI GEMINI")[1]?.slice(0, 400) ?? entry.noteAi
                      : entry.noteAi}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {forensicsTarget && userId && (
        <PostGaraForensicsModal
          entry={forensicsTarget.entry}
          esito={forensicsTarget.esito}
          userId={userId}
          profilo={profilo}
          storicoEntries={entries}
          onClose={() => setForensicsTarget(null)}
          onSaved={() => load()}
        />
      )}
    </>
  );
}
