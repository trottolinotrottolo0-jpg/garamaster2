import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  CloudDownload,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import type { ProfiloImpresaContext } from "../types/database";
import type { ScoutingFilters, ScoutingGaraItem } from "../types/scouting";
import { DEFAULT_SCOUTING_FILTERS } from "../types/scouting";
import {
  fetchScoutingFacets,
  markScoutingGaraSeen,
  searchScoutingGare,
  setScoutingStatoUtente,
} from "../services/scoutingService";
import { fetchAnacSyncStatus, triggerAnacSync } from "../lib/anacSyncApi";
import type { AnacSyncStatusResponse } from "../types/anacSync";

type ScoutingGareAppProps = {
  userId?: string;
  profilo: ProfiloImpresaContext | null;
  onOpenInChat: (gareAnacId: string, cig: string) => void;
  onOpenAnalyzer: () => void;
  onAfterSync?: () => Promise<void>;
};

function FitBadge({ score, label }: { score: number; label: ScoutingGaraItem["fitLabel"] }) {
  const colors =
    label === "alto"
      ? "text-emerald-400 bg-emerald-950/50 border-emerald-900/50"
      : label === "medio"
        ? "text-amber-400 bg-amber-950/50 border-amber-900/50"
        : "text-slate-400 bg-neutral-900 border-neutral-800";

  return (
    <span className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg border ${colors}`}>
      {score}%
    </span>
  );
}

export function ScoutingGareApp({
  userId,
  profilo,
  onOpenInChat,
  onOpenAnalyzer,
  onAfterSync,
}: ScoutingGareAppProps) {
  const [filters, setFilters] = useState<ScoutingFilters>(DEFAULT_SCOUTING_FILTERS);
  const [facets, setFacets] = useState<{ regioni: string[]; categorie: string[] }>({
    regioni: [],
    categorie: [],
  });
  const [results, setResults] = useState<ScoutingGaraItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [syncStatus, setSyncStatus] = useState<AnacSyncStatusResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    if (!userId) {
      setError("Accedi per usare lo scouting gare.");
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const items = await searchScoutingGare(userId, filters, profilo);
      setResults(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore scouting gare";
      setError(message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [userId, filters, profilo]);

  const reloadFacets = useCallback(async () => {
    const f = await fetchScoutingFacets();
    setFacets(f);
  }, []);

  useEffect(() => {
    void reloadFacets();
    void fetchAnacSyncStatus()
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
  }, [reloadFacets]);

  const handleAnacSync = async (demoExpand = false) => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result = await triggerAnacSync({ limit: 200, demoExpand });
      setSyncMessage(
        `Import completato: ${result.imported} nuove, ${result.updated} aggiornate (${result.source}).`
      );
      await onAfterSync?.();
      await reloadFacets();
      await loadResults();
      const status = await fetchAnacSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync ANAC fallito";
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const regioniProfilo = profilo?.regioni ?? [];
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.query.trim()) n++;
    if (filters.regioni.length) n++;
    if (filters.categorie.length) n++;
    if (filters.importoMin != null || filters.importoMax != null) n++;
    if (filters.fitMin > 0) n++;
    if (filters.soloSalvate || filters.soloNuove) n++;
    return n;
  }, [filters]);

  const toggleRegion = (regione: string) => {
    setFilters((prev) => ({
      ...prev,
      regioni: prev.regioni.includes(regione)
        ? prev.regioni.filter((r) => r !== regione)
        : [...prev.regioni, regione],
      allineaProfilo: false,
    }));
  };

  const toggleCategoria = (categoria: string) => {
    setFilters((prev) => ({
      ...prev,
      categorie: prev.categorie.includes(categoria)
        ? prev.categorie.filter((c) => c !== categoria)
        : [...prev.categorie, categoria],
    }));
  };

  const handleStato = async (item: ScoutingGaraItem, stato: "salvata" | "scartata" | "vista") => {
    if (!userId) return;
    await setScoutingStatoUtente(userId, item.gareAnacId, stato);
    await loadResults();
  };

  const handleOpen = async (item: ScoutingGaraItem) => {
    if (userId) await markScoutingGaraSeen(userId, item.gareAnacId);
    onOpenInChat(item.gareAnacId, item.cig);
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 scrollbar-thin" id="scouting-gare-app">
      <div className="max-w-6xl mx-auto space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Scouting Gare
            </p>
            <h1 className="text-2xl font-extrabold text-white mt-1">Trova opportunità ANAC</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Filtra per zona, tipologia SOA/CPV, importo e scadenza. Salva le gare interessanti e
              aprile in chat per analisi con DeepSeek.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleAnacSync(syncStatus?.demoExpand ?? true)}
              disabled={syncing || syncStatus?.configured === false}
              title={
                syncStatus?.configured === false
                  ? "Configura SUPABASE_SERVICE_ROLE_KEY nel server"
                  : "Importa gare da ANAC"
              }
              className="cursor-pointer flex items-center gap-2 rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-[11px] font-bold text-emerald-300 hover:border-emerald-600 disabled:opacity-50"
            >
              <CloudDownload className={`w-4 h-4 ${syncing ? "animate-pulse" : ""}`} />
              {syncing ? "Sync ANAC…" : "Sync ANAC"}
            </button>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="cursor-pointer flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] font-bold text-slate-300 hover:border-brand-gold"
            >
              <Filter className="w-4 h-4 text-brand-gold" />
              Filtri {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <button
              type="button"
              onClick={() => void loadResults()}
              disabled={loading}
              className="cursor-pointer flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] font-bold text-slate-300 hover:border-brand-gold disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-brand-gold ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </button>
          </div>
        </header>

        {syncMessage && (
          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
            {syncMessage}
          </div>
        )}

        {syncStatus && !syncStatus.configured && (
          <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
            Sync ANAC disabilitato: il server non vede{" "}
            <code className="text-amber-100">SUPABASE_SERVICE_ROLE_KEY</code>. Aggiungila in{" "}
            <code className="text-amber-100">.env.local</code> (consigliato) o{" "}
            <code className="text-amber-100">.env</code>, poi{" "}
            <strong className="text-amber-100">Ctrl+C</strong> e{" "}
            <code className="text-amber-100">npm run dev</code>. Chiave: Supabase → Settings → API →{" "}
            <em>service_role</em> (secret). SQL già eseguito se vedi le gare in lista.
          </div>
        )}

        {syncStatus?.last?.finished_at && (
          <p className="text-[10px] text-slate-500 font-mono">
            Ultimo sync: {new Date(syncStatus.last.finished_at).toLocaleString("it-IT")} —{" "}
            {syncStatus.last.source} (+{syncStatus.last.imported_count ?? 0} / ~
            {syncStatus.last.updated_count ?? 0})
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
            {error.includes("gare_scouting_utente") && (
              <p className="text-xs mt-2 text-red-200/80">
                Esegui <code className="text-red-100">supabase/solo-scouting-gare.sql</code> nel SQL
                Editor di Supabase.
              </p>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
          {showFilters && (
            <aside className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 space-y-4 h-fit lg:sticky lg:top-4">
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">Cerca</label>
                <div className="relative mt-1.5">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={filters.query}
                    onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
                    placeholder="CIG, titolo, ente…"
                    className="w-full rounded-xl border border-neutral-800 bg-black pl-9 pr-3 py-2 text-[11px] text-white placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-extrabold uppercase text-slate-500">Zone</label>
                  {regioniProfilo.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          allineaProfilo: !p.allineaProfilo,
                          regioni: [],
                        }))
                      }
                      className={`cursor-pointer text-[9px] font-bold ${filters.allineaProfilo ? "text-brand-gold" : "text-slate-500"}`}
                    >
                      Profilo
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {facets.regioni.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRegion(r)}
                      className={`cursor-pointer text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                        filters.regioni.includes(r)
                          ? "border-brand-gold text-brand-gold bg-brand-gold/10"
                          : "border-neutral-800 text-slate-400 hover:border-neutral-600"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">
                  Tipologia / SOA
                </label>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {facets.categorie.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCategoria(c)}
                      className={`cursor-pointer text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                        filters.categorie.includes(c)
                          ? "border-emerald-600 text-emerald-400 bg-emerald-950/30"
                          : "border-neutral-800 text-slate-400 hover:border-neutral-600"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500">
                    Importo min €
                  </label>
                  <input
                    type="number"
                    value={filters.importoMin ?? ""}
                    onChange={(e) =>
                      setFilters((p) => ({
                        ...p,
                        importoMin: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-2 py-1.5 text-[11px] text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500">
                    Importo max €
                  </label>
                  <input
                    type="number"
                    value={filters.importoMax ?? ""}
                    onChange={(e) =>
                      setFilters((p) => ({
                        ...p,
                        importoMax: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-black px-2 py-1.5 text-[11px] text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">
                  Scadenza entro {filters.scadenzaEntroGiorni ?? 90} gg
                </label>
                <input
                  type="range"
                  min={7}
                  max={180}
                  value={filters.scadenzaEntroGiorni ?? 90}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, scadenzaEntroGiorni: Number(e.target.value) }))
                  }
                  className="w-full mt-2 accent-brand-gold"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">
                  Fit minimo {filters.fitMin}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={filters.fitMin}
                  onChange={(e) => setFilters((p) => ({ ...p, fitMin: Number(e.target.value) }))}
                  className="w-full mt-2 accent-emerald-500"
                />
              </div>

              <div className="space-y-2 text-[11px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.soloNuove}
                    onChange={(e) => setFilters((p) => ({ ...p, soloNuove: e.target.checked }))}
                  />
                  <span className="text-slate-300">Solo gare non ancora viste</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.soloSalvate}
                    onChange={(e) => setFilters((p) => ({ ...p, soloSalvate: e.target.checked }))}
                  />
                  <span className="text-slate-300">Solo salvate</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.nascondiScartate}
                    onChange={(e) =>
                      setFilters((p) => ({ ...p, nascondiScartate: e.target.checked }))
                    }
                  />
                  <span className="text-slate-300">Nascondi scartate</span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setFilters(DEFAULT_SCOUTING_FILTERS)}
                className="cursor-pointer w-full text-[10px] font-bold text-slate-500 hover:text-brand-gold"
              >
                Reset filtri
              </button>
            </aside>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {loading ? "Ricerca in corso…" : `${results.length} gare trovate`}
                {filters.allineaProfilo && regioniProfilo.length > 0 && (
                  <span className="text-brand-gold ml-1">
                    · zone profilo: {regioniProfilo.join(", ")}
                  </span>
                )}
              </span>
            </div>

            {loading && results.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
                <p className="text-sm">Scouting gare ANAC…</p>
              </div>
            )}

            {!loading && results.length === 0 && !error && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-8 text-center">
                <p className="text-sm text-slate-400">Nessuna gara corrisponde ai filtri.</p>
                <button
                  type="button"
                  onClick={() => setFilters({ ...DEFAULT_SCOUTING_FILTERS, allineaProfilo: false })}
                  className="cursor-pointer mt-3 text-[11px] font-bold text-brand-gold hover:underline"
                >
                  Allarga ricerca
                </button>
              </div>
            )}

            {results.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 hover:border-neutral-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <FitBadge score={item.fitScore} label={item.fitLabel} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {item.isNew && (
                        <span className="text-[9px] font-extrabold uppercase text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          Nuova
                        </span>
                      )}
                      {item.statoUtente === "salvata" && (
                        <span className="text-[9px] font-extrabold uppercase text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded-full">
                          Salvata
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-500">CIG {item.cig}</span>
                    </div>
                    <h2 className="text-sm font-bold text-white leading-snug">{item.titolo}</h2>
                    <p className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {item.regione && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {item.regione}
                          {item.provincia ? ` · ${item.provincia}` : ""}
                        </span>
                      )}
                      {item.categoria && <span>SOA/CPV {item.categoria}</span>}
                      {item.importo && <span>{item.importo}</span>}
                      {item.giorniRimanenti != null && item.giorniRimanenti >= 0 && (
                        <span>Scadenza tra {item.giorniRimanenti} gg</span>
                      )}
                    </p>

                    {item.aiSummary && (
                      <p className="text-[11px] text-slate-400 mt-2 flex items-start gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-gold shrink-0 mt-0.5" />
                        {item.aiSummary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => void handleOpen(item)}
                    className="cursor-pointer rounded-lg bg-brand-gold text-black text-[10px] font-extrabold px-3 py-2 hover:bg-yellow-400"
                  >
                    Analizza in chat
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStato(item, item.statoUtente === "salvata" ? "vista" : "salvata")}
                    className="cursor-pointer rounded-lg border border-neutral-700 text-[10px] font-bold px-3 py-2 text-slate-300 hover:border-brand-gold flex items-center gap-1"
                  >
                    {item.statoUtente === "salvata" ? (
                      <BookmarkCheck className="w-3.5 h-3.5 text-brand-gold" />
                    ) : (
                      <Bookmark className="w-3.5 h-3.5" />
                    )}
                    Salva
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStato(item, "scartata")}
                    className="cursor-pointer rounded-lg border border-neutral-800 text-[10px] font-bold px-3 py-2 text-slate-500 hover:border-red-900 hover:text-red-400 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Scarta
                  </button>
                  {item.urlPortale && (
                    <a
                      href={item.urlPortale}
                      target="_blank"
                      rel="noreferrer"
                      className="cursor-pointer rounded-lg border border-neutral-800 text-[10px] font-bold px-3 py-2 text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Portale
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={onOpenAnalyzer}
                    className="cursor-pointer rounded-lg border border-neutral-800 text-[10px] font-bold px-3 py-2 text-slate-400 hover:text-emerald-400"
                  >
                    Carica disciplinare PDF
                  </button>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
