import { useState, useRef, useEffect } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { Prezzario, VocePrezzario, ScorporoResult, MappingVociSimilari } from "../types";
import { readFileAsBase64 } from "../lib/parseDisciplinareApi";
import { runParsePrezzarioPdf, runScorporoIntelligente } from "../lib/gemini";
import { matchVociSimili } from "../lib/bidCalculations";

interface PrezzariManagerProps {
  prezzari: Prezzario[];
  onSavePrezzari: (prezzari: Prezzario[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

const UM_OPTIONS = ["m", "m2", "m3", "kg", "l", "ore", "cad", "mc", "mq", "t", "gg"];
const CATEGORIE = ["Manodopera", "Materiali", "Noli", "Lavorazioni", "Spese", "Rischio"];
const FONTI = ["ANCE", "Regionale", "Interno"];

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const emptyVoceForm = () => ({
  codice: "",
  descrizione: "",
  um: "m",
  prezzo: "",
  categoria: "Lavorazioni",
});

const emptyPrezzarioForm = () => ({
  nome: "",
  regione: "",
  anno: new Date().getFullYear(),
  fonte: "Regionale",
  note: "",
});

export function PrezzariManager({ prezzari, onSavePrezzari, isOpen, onClose }: PrezzariManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyPrezzarioForm);
  const [voceForm, setVoceForm] = useState(emptyVoceForm);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [parsingSuccess, setParsingSuccess] = useState<string | null>(null);
  const [isScorporoRunning, setIsScorporoRunning] = useState(false);
  const [scorporoResults, setScorporoResults] = useState<ScorporoResult[]>([]);
  const [scorporoMessage, setScorporoMessage] = useState<string | null>(null);
  const [selectedPrezzario1, setSelectedPrezzario1] = useState(prezzari[0]?.id ?? "");
  const [selectedPrezzario2, setSelectedPrezzario2] = useState(prezzari[1]?.id ?? "");
  const [mappingResults, setMappingResults] = useState<MappingVociSimilari[]>([]);
  const [mappingMessage, setMappingMessage] = useState<string | null>(null);
  const [selectedPrezzarioPerAggiornamento, setSelectedPrezzarioPerAggiornamento] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prezzari.length === 0) {
      setSelectedPrezzario1("");
      setSelectedPrezzario2("");
      return;
    }
    if (!prezzari.some((p) => p.id === selectedPrezzario1)) {
      setSelectedPrezzario1(prezzari[0].id);
    }
    const second = prezzari.find((p) => p.id !== (selectedPrezzario1 || prezzari[0].id));
    if (prezzari.length > 1) {
      if (!prezzari.some((p) => p.id === selectedPrezzario2) || selectedPrezzario2 === selectedPrezzario1) {
        setSelectedPrezzario2(second?.id ?? prezzari[1].id);
      }
    } else {
      setSelectedPrezzario2("");
    }
  }, [prezzari, selectedPrezzario1, selectedPrezzario2]);

  const persist = (next: Prezzario[]) => {
    onSavePrezzari(next);
    if (selectedId && !next.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  };

  const handlePdfUpload = async (file: File) => {
    setIsParsingPdf(true);
    setParsingError(null);
    setParsingSuccess(null);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await runParsePrezzarioPdf(base64, file.name);

      if (result.success && result.vocieEstratte.length > 0) {
        const now = new Date().toISOString();
        const nuovoPrezzario: Prezzario = {
          id: newId("prezzario"),
          nome: `${result.regioneRilevata || "Importato"} ${result.annoRilevato || new Date().getFullYear()}`,
          regione: result.regioneRilevata || "Sconosciuta",
          anno: result.annoRilevato || new Date().getFullYear(),
          fonte: "PDF Importato",
          voci: result.vocieEstratte.map((v) => ({
            id: newId("voce"),
            codice: v.codice,
            descrizione: v.descrizione,
            um: v.um,
            prezzo: v.prezzo,
            categoria: v.categoria,
          })),
          dataCreazione: now,
          dataUltimAggiornamento: now,
          note: `Importato da: ${file.name}. ${result.messaggioEsito}${
            result.erroriEstrazione.length ? ` Avvisi: ${result.erroriEstrazione.join("; ")}` : ""
          }`,
        };

        persist([...prezzari, nuovoPrezzario]);
        setSelectedId(nuovoPrezzario.id);
        setParsingSuccess(`✓ ${result.totaleVoci} voci estratte e salvate`);
      } else {
        setParsingError(result.messaggioEsito || "Nessuna voce estratta dal PDF");
      }
    } catch (err) {
      setParsingError(err instanceof Error ? err.message : "Errore parsing");
    } finally {
      setIsParsingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  const selected = prezzari.find((p) => p.id === selectedId) ?? null;

  const updatePrezzario = (id: string, updater: (p: Prezzario) => Prezzario) => {
    persist(
      prezzari.map((p) => (p.id === id ? updater(p) : p))
    );
  };

  const handleCreatePrezzario = () => {
    if (!createForm.nome.trim() || !createForm.regione.trim()) return;
    const now = new Date().toISOString();
    const nuovo: Prezzario = {
      id: newId("prezzario"),
      nome: createForm.nome.trim(),
      regione: createForm.regione.trim(),
      anno: createForm.anno,
      fonte: createForm.fonte,
      voci: [],
      dataCreazione: now,
      dataUltimAggiornamento: now,
      note: createForm.note.trim() || undefined,
    };
    persist([...prezzari, nuovo]);
    setSelectedId(nuovo.id);
    setCreateForm(emptyPrezzarioForm());
    setIsCreateOpen(false);
  };

  const handleDuplicate = (p: Prezzario) => {
    const now = new Date().toISOString();
    const copy: Prezzario = {
      ...p,
      id: newId("prezzario"),
      nome: `${p.nome} (copia)`,
      dataCreazione: now,
      dataUltimAggiornamento: now,
      voci: p.voci.map((v) => ({ ...v, id: newId("voce") })),
    };
    persist([...prezzari, copy]);
    setSelectedId(copy.id);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Eliminare questo prezzario?")) return;
    persist(prezzari.filter((p) => p.id !== id));
  };

  const handleAddVoce = () => {
    if (!selected) return;
    const prezzo = parseFloat(voceForm.prezzo);
    if (!voceForm.codice.trim() || !voceForm.descrizione.trim() || !Number.isFinite(prezzo)) return;

    const voce: VocePrezzario = {
      id: newId("voce"),
      codice: voceForm.codice.trim(),
      descrizione: voceForm.descrizione.trim(),
      um: voceForm.um,
      prezzo,
      categoria: voceForm.categoria,
    };

    updatePrezzario(selected.id, (p) => ({
      ...p,
      voci: [...p.voci, voce],
      dataUltimAggiornamento: new Date().toISOString(),
    }));
    setVoceForm(emptyVoceForm());
  };

  const handleRemoveVoce = (voceId: string) => {
    if (!selected) return;
    updatePrezzario(selected.id, (p) => ({
      ...p,
      voci: p.voci.filter((v) => v.id !== voceId),
      dataUltimAggiornamento: new Date().toISOString(),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <span className="text-xs font-extrabold tracking-widest uppercase text-white">
            Gestione Prezzari Regionali
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
          {prezzari.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nessun prezzario salvato.</p>
          ) : (
            <div className="space-y-2">
              {prezzari.map((p) => (
                <div
                  key={p.id}
                  className={`bg-black border rounded-lg p-3 ${
                    selectedId === p.id ? "border-brand-gold" : "border-neutral-700"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className="cursor-pointer text-left flex-1 min-w-0"
                    >
                      <p className="text-sm font-bold text-white">{p.nome}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {p.regione} · {p.anno} · {p.fonte} · {p.voci.length} voci
                      </p>
                    </button>
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className="cursor-pointer text-[10px] font-bold px-2 py-1 rounded border border-neutral-700 text-slate-300 hover:border-brand-gold"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(p)}
                        className="cursor-pointer text-[10px] font-bold px-2 py-1 rounded border border-neutral-700 text-slate-300 hover:border-brand-gold inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Duplica
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadJson(`${p.nome.replace(/\s+/g, "_")}.json`, p)}
                        className="cursor-pointer text-[10px] font-bold px-2 py-1 rounded border border-neutral-700 text-slate-300 hover:border-brand-gold inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="cursor-pointer text-[10px] font-bold px-2 py-1 rounded border border-red-900 text-red-400 hover:bg-red-950/40 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Elimina
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border border-neutral-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsCreateOpen((v) => !v)}
              className="cursor-pointer w-full px-4 py-3 flex items-center justify-between bg-neutral-950 text-[10px] font-extrabold uppercase tracking-widest text-slate-300"
            >
              + Crea nuovo prezzario
              {isCreateOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {isCreateOpen && (
              <div className="p-4 space-y-3 border-t border-neutral-800 bg-black">
                <input
                  type="text"
                  placeholder="Nome prezzario"
                  value={createForm.nome}
                  onChange={(e) => setCreateForm((f) => ({ ...f, nome: e.target.value }))}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Regione"
                  value={createForm.regione}
                  onChange={(e) => setCreateForm((f) => ({ ...f, regione: e.target.value }))}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    placeholder="Anno"
                    value={createForm.anno}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, anno: parseInt(e.target.value, 10) || f.anno }))
                    }
                    className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <select
                    value={createForm.fonte}
                    onChange={(e) => setCreateForm((f) => ({ ...f, fonte: e.target.value }))}
                    className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {FONTI.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  placeholder="Note (opzionale)"
                  value={createForm.note}
                  onChange={(e) => setCreateForm((f) => ({ ...f, note: e.target.value }))}
                  rows={2}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white resize-none"
                />
                <button
                  type="button"
                  onClick={handleCreatePrezzario}
                  className="cursor-pointer w-full bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-4 py-2 rounded-lg"
                >
                  Crea prezzario vuoto
                </button>
              </div>
            )}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 mt-4">
            <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
              Importa voci da PDF prezzario
            </h3>

            <div className="space-y-2">
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                disabled={isParsingPdf}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void handlePdfUpload(file);
                }}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-neutral-900 file:text-brand-gold hover:file:bg-neutral-800 disabled:opacity-50"
              />

              {isParsingPdf && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Parsing PDF in corso...
                </div>
              )}

              {parsingSuccess && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 rounded px-2 py-1">
                  <CheckCircle className="w-3 h-3 shrink-0" />
                  {parsingSuccess}
                </div>
              )}

              {parsingError && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/50 rounded px-2 py-1">
                  <XCircle className="w-3 h-3 shrink-0" />
                  {parsingError}
                </div>
              )}
            </div>
          </div>

          {prezzari.length > 0 && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                  Scorporo voci composite
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    setIsScorporoRunning(true);
                    setScorporoMessage(null);
                    try {
                      const tutteVoci = prezzari.flatMap((p) => p.voci);
                      const risultati = await runScorporoIntelligente(tutteVoci);
                      const scorporate = risultati.filter((r) => r.successoScorporo);
                      const vocieNuove = scorporate.flatMap((r) => r.vocieScorprate);
                      setScorporoResults(risultati);
                      setScorporoMessage(
                        `✓ ${scorporate.length} voci scorporate in ${vocieNuove.length} voci elementari`
                      );
                    } catch (err) {
                      setScorporoMessage(
                        `✗ ${err instanceof Error ? err.message : "Errore"}`
                      );
                    } finally {
                      setIsScorporoRunning(false);
                    }
                  }}
                  disabled={isScorporoRunning}
                  className="cursor-pointer text-[9px] font-bold px-2 py-1 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white rounded disabled:opacity-50"
                >
                  {isScorporoRunning ? "Analizzando..." : "Analizza"}
                </button>
              </div>
              {scorporoMessage && (
                <p
                  className={`text-xs ${scorporoMessage.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}
                >
                  {scorporoMessage}
                </p>
              )}
              {scorporoResults.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {scorporoResults
                    .filter((r) => r.successoScorporo)
                    .map((result) => (
                      <div
                        key={result.voceOriginaleId}
                        className="bg-neutral-900 border border-neutral-700 rounded p-2 text-[10px]"
                      >
                        <div className="font-bold text-brand-gold">{result.voceOriginale.descrizione}</div>
                        <div className="text-slate-400 text-[9px] mt-0.5">↓ Scorporata:</div>
                        {result.vocieScorprate.map((v) => (
                          <div key={v.id} className="text-slate-300 text-[9px] ml-2">
                            • {v.descrizione} @ €{v.prezzo.toFixed(2)}/{v.um}
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {prezzari.length > 1 && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 mt-4">
              <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                Matching voci tra prezzari
              </h3>
              <div className="flex flex-wrap gap-2 items-center text-[10px]">
                <select
                  value={selectedPrezzario1}
                  onChange={(e) => setSelectedPrezzario1(e.target.value)}
                  className="px-2 py-1 bg-neutral-900 border border-neutral-700 text-white rounded"
                >
                  {prezzari.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <span className="text-slate-500">vs</span>
                <select
                  value={selectedPrezzario2}
                  onChange={(e) => setSelectedPrezzario2(e.target.value)}
                  className="px-2 py-1 bg-neutral-900 border border-neutral-700 text-white rounded"
                >
                  {prezzari
                    .filter((p) => p.id !== selectedPrezzario1)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const p1 = prezzari.find((p) => p.id === selectedPrezzario1);
                    const p2 = prezzari.find((p) => p.id === selectedPrezzario2);
                    if (p1 && p2) {
                      const matches = matchVociSimili(p1, p2, 70);
                      setMappingResults(matches);
                      setMappingMessage(`Trovate ${matches.length} voci simili`);
                    }
                  }}
                  className="cursor-pointer text-[9px] font-bold px-2 py-1 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white rounded ml-auto"
                >
                  Matcha
                </button>
              </div>
              {mappingMessage && <p className="text-[9px] text-slate-400">{mappingMessage}</p>}
              {mappingResults.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto text-[9px]">
                  {mappingResults.slice(0, 10).map((match) => (
                    <div
                      key={`${match.vocePrezzario1Id}-${match.vocePrezzario2Id}`}
                      className="bg-neutral-900 border border-neutral-700 rounded p-2"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-brand-gold flex-1">{match.descrizione1}</span>
                        <span
                          className={`font-mono shrink-0 ml-2 ${
                            match.deltaPrezzoPercent > 0 ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {match.deltaPrezzoPercent > 0 ? "+" : ""}
                          {match.deltaPrezzoPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-slate-400">{match.descrizione2}</div>
                      <div className="text-slate-500 text-[8px] mt-1">
                        €{match.prezzo1.toFixed(2)} → €{match.prezzo2.toFixed(2)} ·{" "}
                        {match.similarita.toFixed(0)}%
                        {match.suggerimentoUnificazione ? " · unificabile" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {prezzari.length > 0 && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3 mt-4">
              <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                Aggiorna prezzi voci
              </h3>

              <select
                value={selectedPrezzarioPerAggiornamento}
                onChange={(e) => setSelectedPrezzarioPerAggiornamento(e.target.value)}
                className="w-full text-[10px] px-2 py-1 bg-neutral-900 border border-neutral-700 text-white rounded cursor-pointer"
              >
                <option value="">Seleziona prezzario</option>
                {prezzari.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>

              {selectedPrezzarioPerAggiornamento && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {prezzari
                    .find((p) => p.id === selectedPrezzarioPerAggiornamento)
                    ?.voci.map((voce) => (
                      <div
                        key={voce.id}
                        className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded p-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] font-bold text-brand-gold truncate">
                            {voce.descrizione}
                          </div>
                          <div className="text-[8px] text-slate-500">
                            €{voce.prezzo.toFixed(2)}/{voce.um}
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          key={`${voce.id}-${voce.prezzo}`}
                          defaultValue={voce.prezzo}
                          onBlur={(e) => {
                            const nuovoPrezzo = parseFloat(e.currentTarget.value);
                            if (nuovoPrezzo > 0 && nuovoPrezzo !== voce.prezzo) {
                              const prezzarioAggiornato = prezzari.map((p) =>
                                p.id === selectedPrezzarioPerAggiornamento
                                  ? {
                                      ...p,
                                      voci: p.voci.map((v) =>
                                        v.id === voce.id ? { ...v, prezzo: nuovoPrezzo } : v
                                      ),
                                      dataUltimAggiornamento: new Date().toISOString(),
                                    }
                                  : p
                              );
                              onSavePrezzari(prezzarioAggiornato);
                            }
                          }}
                          className="w-20 text-[9px] px-1 py-0.5 bg-neutral-800 border border-neutral-600 text-white rounded"
                          placeholder="€"
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {selected && (
            <div className="space-y-4 border-t border-neutral-800 pt-4">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Aggiungi voci — {selected.nome}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Codice"
                  value={voceForm.codice}
                  onChange={(e) => setVoceForm((f) => ({ ...f, codice: e.target.value }))}
                  className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Descrizione"
                  value={voceForm.descrizione}
                  onChange={(e) => setVoceForm((f) => ({ ...f, descrizione: e.target.value }))}
                  className="col-span-2 sm:col-span-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                />
                <select
                  value={voceForm.um}
                  onChange={(e) => setVoceForm((f) => ({ ...f, um: e.target.value }))}
                  className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                >
                  {UM_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Prezzo €"
                  value={voceForm.prezzo}
                  onChange={(e) => setVoceForm((f) => ({ ...f, prezzo: e.target.value }))}
                  className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                />
                <select
                  value={voceForm.categoria}
                  onChange={(e) => setVoceForm((f) => ({ ...f, categoria: e.target.value }))}
                  className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                >
                  {CATEGORIE.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleAddVoce}
                className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg"
              >
                Aggiungi voce
              </button>

              {selected.voci.length > 0 ? (
                <div className="overflow-x-auto border border-neutral-800 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-900 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="px-2 py-2 text-left">Codice</th>
                        <th className="px-2 py-2 text-left">Descrizione</th>
                        <th className="px-2 py-2 text-left">UM</th>
                        <th className="px-2 py-2 text-right">Prezzo</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {selected.voci.map((v) => (
                        <tr key={v.id}>
                          <td className="px-2 py-2 font-mono text-slate-300">{v.codice}</td>
                          <td className="px-2 py-2 text-slate-200">{v.descrizione}</td>
                          <td className="px-2 py-2 text-slate-400">{v.um}</td>
                          <td className="px-2 py-2 text-right font-mono text-white">
                            € {v.prezzo.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveVoce(v.id)}
                              className="cursor-pointer text-red-400 hover:text-red-300 text-[10px] font-bold"
                            >
                              Rimuovi
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">Nessuna voce in questo prezzario.</p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-800 flex flex-wrap gap-2 shrink-0">
          {selected && (
            <button
              type="button"
              onClick={() =>
                downloadJson(`${selected.nome.replace(/\s+/g, "_")}.json`, selected)
              }
              className="cursor-pointer flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Scarica JSON
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer ml-auto bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-6 py-2 rounded-lg"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
