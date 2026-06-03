import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  Microscope,
  RefreshCw,
  Tag,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { requestPostGaraForensics } from "../lib/postGaraForensicsApi";
import {
  buildPostGaraForensicsNote,
  extractPatternsFromForensics,
  parseForensicsAnalysis,
} from "../lib/postGaraForensicsNote";
import type { ForensicsTag } from "../lib/postGaraForensicsNote";
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

// ─── Tag chip ─────────────────────────────────────────────────────────────────

const TAG_LABELS: Record<ForensicsTag, string> = {
  DOCUMENTAZIONE: "Documentazione",
  RIBASSO: "Ribasso",
  FIT: "Fit profilo",
  TIMING: "Timing",
  OFFERTA_TECNICA: "Offerta tecnica",
  RISCHIO: "Rischio",
  CAPACITA: "Capacità",
  SOA: "SOA",
  PREZZO: "Prezzo",
  CONCORRENZA: "Concorrenza",
  REQUISITI: "Requisiti",
};

function TagChip({ tag }: { tag: ForensicsTag }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border border-brand-gold/40 bg-brand-gold/10 text-brand-gold">
      <Tag className="w-2.5 h-2.5" />
      {TAG_LABELS[tag]}
    </span>
  );
}

// ─── Cause bar ────────────────────────────────────────────────────────────────

function CausaBar({
  etichetta,
  score,
  esito,
}: {
  etichetta: string;
  score: number;
  esito: "vinta" | "persa";
}) {
  const color =
    esito === "vinta"
      ? "bg-emerald-500"
      : score >= 70
        ? "bg-red-500"
        : score >= 45
          ? "bg-amber-500"
          : "bg-neutral-600";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-300 w-32 shrink-0">{etichetta}</span>
      <div className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-8 text-right shrink-0">{score}%</span>
    </div>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────

function SectionBlock({
  icon,
  title,
  items,
  accent,
  emptyMsg,
}: {
  icon: import("react").ReactNode;
  title: string;
  items: string[];
  accent: string;
  emptyMsg?: string;
}) {
  if (!items.length && !emptyMsg) return null;
  return (
    <div className="space-y-1.5">
      <p className={`text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${accent}`}>
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[10px] text-slate-500 italic">{emptyMsg}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5 leading-relaxed">
              <span className={`mt-0.5 shrink-0 ${accent}`}>→</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [showRaw, setShowRaw] = useState(false);

  const esitoLabel = esito === "vinta" ? "Vinta ✓" : "Persa ✗";
  const esitoColor = esito === "vinta" ? "text-emerald-400" : "text-red-400";
  const esitoBorder = esito === "vinta" ? "border-emerald-700/40" : "border-red-800/40";
  const esitoBg = esito === "vinta" ? "bg-emerald-950/30" : "bg-red-950/20";

  const structured = useMemo(
    () => (analisi ? parseForensicsAnalysis(analisi, esito) : null),
    [analisi, esito]
  );

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
        form: { ribassoVincitore: ribassoNum, motivazione: motivazione.trim(), noteOperative: noteOperative.trim() },
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

      if (!ok) throw new Error("Salvataggio storico non riuscito.");
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
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-neutral-800 shrink-0">
          <div>
            <h2 id="post-gara-forensics-title" className="text-sm font-extrabold text-white flex items-center gap-2">
              <Microscope className="w-4 h-4 text-brand-gold" />
              Post-Gara Forensics & Learning Loop
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {entry.titoloGara} · CIG {entry.cig}
            </p>
            <span className={`inline-block text-[11px] font-extrabold mt-1 px-2 py-0.5 rounded border ${esitoBorder} ${esitoBg} ${esitoColor}`}>
              {esitoLabel}
            </span>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer p-1 text-slate-500 hover:text-white" aria-label="Chiudi">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 scrollbar-thin">

          {/* ── FORM (pre-analysis) ── */}
          {!analisi && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Compila i dati post-gara. L&apos;AI analizzerà l&apos;esito, classificherà le cause e genererà lezioni apprese per il learning loop.
              </p>

              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Ribasso vincitore (%)</span>
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
                  {esito === "vinta" ? "Motivazione vittoria" : "Motivazione esclusione"}
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
                <span className="text-[10px] font-bold text-slate-500 uppercase">Note operative</span>
                <textarea
                  rows={3}
                  placeholder="Tempi, competitor, errori in offerta, RTI, ecc."
                  value={noteOperative}
                  onChange={(e) => setNoteOperative(e.target.value)}
                  className="w-full text-sm bg-black border border-neutral-700 rounded-lg px-3 py-2 text-white resize-none"
                />
              </label>
            </div>
          )}

          {/* ── STRUCTURED ANALYSIS (post-analysis) ── */}
          {analisi && structured && (
            <div className="space-y-5">

              {/* 1. Riepilogo esito */}
              {structured.riepilogoEsito && (
                <div className={`rounded-xl border ${esitoBorder} ${esitoBg} px-3 py-2.5`}>
                  <p className={`text-[10px] font-extrabold uppercase mb-1 ${esitoColor}`}>Riepilogo esito</p>
                  <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-4">{structured.riepilogoEsito}</p>
                </div>
              )}

              {/* 2. Cause probabili */}
              {structured.causeProbabili.length > 0 && (
                <div className="space-y-2">
                  <p className={`text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${esito === "vinta" ? "text-emerald-400" : "text-red-400"}`}>
                    {esito === "vinta"
                      ? <><TrendingUp className="w-3.5 h-3.5" /> Fattori di vittoria</>
                      : <><TrendingDown className="w-3.5 h-3.5" /> Cause probabili perdita</>}
                  </p>
                  <div className="space-y-1.5">
                    {structured.causeProbabili.map((c) => (
                      <div key={c.categoria}>
                        <CausaBar etichetta={String(c.etichetta)} score={Number(c.score)} esito={esito} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Tag apprendimento */}
              {structured.tagApprendimento.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Tag apprendimento
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {structured.tagApprendimento.map((t) => (
                      <span key={String(t)}><TagChip tag={t as ForensicsTag} /></span>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Lezioni apprese */}
              <SectionBlock
                icon={<BookOpen className="w-3.5 h-3.5" />}
                title="Lezioni apprese"
                items={structured.lezioniApprese}
                accent="text-amber-400"
                emptyMsg="Nessuna lezione estratta — vedi testo completo."
              />

              {/* 5. Azioni correttive */}
              <SectionBlock
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                title="Azioni correttive per la prossima gara"
                items={structured.azioniCorrettive}
                accent="text-orange-400"
                emptyMsg="Nessuna azione estratta automaticamente."
              />

              {/* 6. Cosa continuare / smettere / migliorare */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {esito === "vinta" && structured.cosaContinuare.length > 0 && (
                  <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3 space-y-1">
                    <p className="text-[9px] font-extrabold uppercase text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Continuare
                    </p>
                    {structured.cosaContinuare.slice(0, 3).map((s, i) => (
                      <p key={i} className="text-[10px] text-emerald-200/80 leading-relaxed">→ {s}</p>
                    ))}
                  </div>
                )}
                {esito === "persa" && structured.cosaSmettere.length > 0 && (
                  <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-3 space-y-1">
                    <p className="text-[9px] font-extrabold uppercase text-red-400 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Smettere
                    </p>
                    {structured.cosaSmettere.slice(0, 3).map((s, i) => (
                      <p key={i} className="text-[10px] text-red-200/80 leading-relaxed">→ {s}</p>
                    ))}
                  </div>
                )}
                {structured.cosaMigliorare.length > 0 && (
                  <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3 space-y-1">
                    <p className="text-[9px] font-extrabold uppercase text-amber-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Migliorare
                    </p>
                    {structured.cosaMigliorare.slice(0, 3).map((s, i) => (
                      <p key={i} className="text-[10px] text-amber-200/80 leading-relaxed">→ {s}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* 7. Model Update */}
              {(structured.modelUpdate.categorieConsigliate.length > 0 ||
                structured.modelUpdate.regioniConsigliate.length > 0 ||
                structured.modelUpdate.ribassoMin != null) && (
                <div className="rounded-xl border border-brand-gold/20 bg-brand-gold/5 p-3 space-y-2">
                  <p className="text-[10px] font-extrabold uppercase text-brand-gold flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5" /> Aggiornamento modello aziendale
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                    {structured.modelUpdate.categorieConsigliate.length > 0 && (
                      <div>
                        <p className="text-slate-500 uppercase font-bold text-[9px]">Categorie</p>
                        <p className="text-white font-mono">{structured.modelUpdate.categorieConsigliate.join(", ")}</p>
                      </div>
                    )}
                    {structured.modelUpdate.regioniConsigliate.length > 0 && (
                      <div>
                        <p className="text-slate-500 uppercase font-bold text-[9px]">Regioni</p>
                        <p className="text-white">{structured.modelUpdate.regioniConsigliate.join(", ")}</p>
                      </div>
                    )}
                    {structured.modelUpdate.ribassoMin != null && (
                      <div>
                        <p className="text-slate-500 uppercase font-bold text-[9px]">Range ribasso</p>
                        <p className="text-white font-mono">
                          {structured.modelUpdate.ribassoMin}%
                          {structured.modelUpdate.ribassoMax != null ? ` – ${structured.modelUpdate.ribassoMax}%` : "+"}
                        </p>
                      </div>
                    )}
                  </div>
                  {structured.modelUpdate.note && (
                    <p className="text-[9px] text-slate-500 italic">{structured.modelUpdate.note}</p>
                  )}
                </div>
              )}

              {/* 8. Testo completo (collassabile) */}
              <div className="border-t border-neutral-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="cursor-pointer flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 w-full"
                >
                  Analisi completa AI
                  {showRaw ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                </button>
                {showRaw && (
                  <div className="mt-2 rounded-xl border border-neutral-800 bg-black/60 p-3 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-thin">
                    {analisi}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 flex flex-wrap gap-2 justify-end shrink-0">
          <button type="button" onClick={onClose} className="cursor-pointer text-xs font-bold text-slate-400 hover:text-white px-3 py-2">
            Annulla
          </button>
          {!analisi ? (
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading}
              className="cursor-pointer flex items-center gap-2 bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analisi in corso…</> : "Analizza con AI"}
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
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvataggio…</> : "Salva nel learning loop"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
