import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  Microscope,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  deleteStoricoEntry,
  listStoricoGareAi,
  updateStoricoEsito,
} from "../services/storicoGareService";
import { PostGaraForensicsModal } from "./PostGaraForensicsModal";
import type { ProfiloImpresaContext } from "../types/database";
import type { StoricoGaraAiEntry, StoricoGaraEsito } from "../types/storicoGare";
import { computeHistoricalAnalytics } from "../lib/historicalKnowledgeEngine";
import type { WinRateByDimension } from "../lib/historicalKnowledgeEngine";

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

// ─── Small UI pieces ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, accent = "text-slate-400" }: { icon: ReactNode; title: string; accent?: string }) {
  return (
    <h3 className={`text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-2 mb-3 ${accent}`}>
      {icon}
      {title}
    </h3>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-2 text-center">
      <p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-extrabold mt-0.5 ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-[9px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function WinRateBar({ data, max = 5 }: { data: WinRateByDimension[]; max?: number }) {
  if (!data.length) return <p className="text-[11px] text-slate-500 italic">Dati insufficienti.</p>;
  return (
    <ul className="space-y-1.5">
      {data.slice(0, max).map((d) => (
        <li key={d.key} className="flex items-center gap-2">
          <span className="text-[10px] text-slate-300 w-28 shrink-0 truncate">{d.key}</span>
          <div className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-2 rounded-full bg-brand-gold transition-all"
              style={{ width: `${Math.min(100, d.winRate)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-300 w-10 text-right shrink-0">
            {d.winRate}%
          </span>
          <span className="text-[9px] text-slate-500 shrink-0">({d.vinte}/{d.totale})</span>
        </li>
      ))}
    </ul>
  );
}

function InsightBadge({ tipo }: { tipo: "positivo" | "negativo" | "neutro" }) {
  if (tipo === "positivo") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
  if (tipo === "negativo") return <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
  return <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
}

function PrioritaBadge({ priorita }: { priorita: "alta" | "media" | "bassa" }) {
  const cls =
    priorita === "alta"
      ? "bg-red-600/80 text-white"
      : priorita === "media"
        ? "bg-amber-500/80 text-black"
        : "bg-neutral-700 text-slate-300";
  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
      {priorita}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HistoricalKnowledgePanel({ userId, profilo }: HistoricalKnowledgePanelProps) {
  const [entries, setEntries] = useState<StoricoGaraAiEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forensicsTarget, setForensicsTarget] = useState<ForensicsTarget | null>(null);
  const [showStorico, setShowStorico] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "ribassi" | "performance" | "errori" | "raccomandazioni">("overview");

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

  useEffect(() => { load(); }, [load]);

  const analytics = useMemo(() => computeHistoricalAnalytics(entries), [entries]);
  const { kpis, insights, raccomandazioni, erroriRicorrenti, trend, winRateByCategoria, winRateByRegione, winRateByFascia, topCategorie, isDemoMode } = analytics;

  const handleEsitoChange = async (entry: StoricoGaraAiEntry, value: StoricoGaraEsito | "") => {
    if (value === "vinta" || value === "persa") {
      setForensicsTarget({ entry, esito: value });
      return;
    }
    await updateStoricoEsito(entry.id, { esito: value === "" ? null : value });
    load();
  };

  const hasForensics = (entry: StoricoGaraAiEntry) =>
    entry.tipoAnalisi === "post_gara_forensics" || entry.noteAi.includes("POST-GARA FORENSICS");

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "overview", label: "Panoramica" },
    { id: "ribassi", label: "Ribassi" },
    { id: "performance", label: "Performance" },
    { id: "errori", label: "Errori" },
    { id: "raccomandazioni", label: "Consigli" },
  ];

  if (!userId) {
    return (
      <p className="text-sm text-slate-500 italic">
        Accedi per salvare e consultare lo storico analisi AI.
      </p>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-5" id="historical-knowledge-panel">

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Archive className="w-4 h-4 text-brand-gold" />
            Historical Knowledge Layer
            {isDemoMode && (
              <span className="text-[9px] font-bold bg-amber-600/20 text-amber-400 border border-amber-700/40 px-2 py-0.5 rounded-full">
                DEMO — aggiungi esiti reali
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="cursor-pointer p-1.5 text-slate-500 hover:text-brand-gold"
            title="Ricarica storico"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}
        {loading && !entries.length && (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
            Caricamento…
          </div>
        )}

        {/* KPI principali */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiCard
            label="Gare totali"
            value={kpis.totaleGare}
            sub="nello storico"
          />
          <KpiCard
            label="Win Rate"
            value={kpis.winRateGlobal != null ? `${kpis.winRateGlobal}%` : "N/D"}
            sub={`${kpis.gareVinte}V / ${kpis.garePerse}P`}
            accent={
              kpis.winRateGlobal == null
                ? "text-slate-400"
                : kpis.winRateGlobal >= 40
                  ? "text-emerald-400"
                  : kpis.winRateGlobal >= 20
                    ? "text-amber-400"
                    : "text-red-400"
            }
          />
          <KpiCard
            label="Ribasso medio"
            value={kpis.ribassoMedio != null ? `${kpis.ribassoMedio}%` : "N/D"}
            sub="su tutte le gare"
          />
          <KpiCard
            label="Ribasso vincente"
            value={kpis.ribassoVincente != null ? `${kpis.ribassoVincente}%` : "N/D"}
            sub="media gare vinte"
            accent="text-emerald-400"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-neutral-800 pb-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`cursor-pointer px-3 py-1.5 text-[10px] font-bold rounded-t-lg transition-colors -mb-px border-b-2 ${
                activeTab === t.id
                  ? "border-brand-gold text-brand-gold bg-brand-gold/5"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Panoramica */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            {/* Insights automatici */}
            <div>
              <SectionHeader
                icon={<Lightbulb className="w-3.5 h-3.5" />}
                title="Insight automatici"
                accent="text-amber-400"
              />
              <ul className="space-y-2">
                {insights.map((ins) => (
                  <li key={ins.id} className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-black/30 px-3 py-2">
                    <InsightBadge tipo={ins.tipo} />
                    <p className="text-[11px] text-slate-300 leading-relaxed">{ins.testo}</p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Trend temporale */}
            <div>
              <SectionHeader
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                title="Report evolutivo"
                accent="text-brand-gold"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {trend.map((p) => (
                  <div key={p.label} className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-center">
                    <p className="text-[9px] text-slate-500 truncate">{p.label}</p>
                    <p className={`text-lg font-extrabold ${
                      p.winRate == null
                        ? "text-slate-500"
                        : p.winRate >= 40
                          ? "text-emerald-400"
                          : p.winRate >= 20
                            ? "text-amber-400"
                            : "text-red-400"
                    }`}>
                      {p.winRate != null ? `${p.winRate}%` : "—"}
                    </p>
                    <p className="text-[9px] text-slate-600">{p.garePartecipate} gare</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top categorie */}
            <div>
              <SectionHeader
                icon={<Trophy className="w-3.5 h-3.5" />}
                title="Categorie più profittevoli"
                accent="text-emerald-400"
              />
              {topCategorie.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">Nessun dato sufficiente.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-slate-500 border-b border-neutral-800">
                        <th className="text-left py-1.5 pr-3">Categoria</th>
                        <th className="text-right py-1.5 pr-3">Win Rate</th>
                        <th className="text-right py-1.5 pr-3">Gare</th>
                        <th className="text-right py-1.5">Ribasso medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCategorie.map((c) => (
                        <tr key={c.categoria} className="border-b border-neutral-900 hover:bg-neutral-900/50">
                          <td className="py-1.5 pr-3 font-bold text-white">{c.categoria}</td>
                          <td className={`py-1.5 pr-3 text-right font-mono font-bold ${
                            c.winRate >= 40 ? "text-emerald-400" : c.winRate >= 20 ? "text-amber-400" : "text-red-400"
                          }`}>
                            {c.winRate}%
                          </td>
                          <td className="py-1.5 pr-3 text-right text-slate-400">{c.vinte}/{c.totale}</td>
                          <td className="py-1.5 text-right text-slate-400 font-mono">
                            {c.ribassoMedio != null ? `${c.ribassoMedio}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Ribassi */}
        {activeTab === "ribassi" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-2 text-center">
                <p className="text-[9px] text-slate-500 uppercase">Ribasso medio</p>
                <p className="text-xl font-extrabold text-white">
                  {kpis.ribassoMedio != null ? `${kpis.ribassoMedio}%` : "N/D"}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-center">
                <p className="text-[9px] text-emerald-400 uppercase">Vincente</p>
                <p className="text-xl font-extrabold text-emerald-300">
                  {kpis.ribassoVincente != null ? `${kpis.ribassoVincente}%` : "N/D"}
                </p>
              </div>
              <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-center">
                <p className="text-[9px] text-red-400 uppercase">Perdente</p>
                <p className="text-xl font-extrabold text-red-300">
                  {kpis.ribassoPerdente != null ? `${kpis.ribassoPerdente}%` : "N/D"}
                </p>
              </div>
            </div>

            <div>
              <SectionHeader icon={<BookOpen className="w-3.5 h-3.5" />} title="Storico ribassi per gara" accent="text-slate-400" />
              <ul className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
                {entries.filter((e) => e.ribassoOfferto != null).length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic">Nessun ribasso registrato. Aggiungilo dalla lista storico.</p>
                ) : (
                  entries.filter((e) => e.ribassoOfferto != null).map((e) => (
                    <li key={e.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-black/30 px-3 py-1.5">
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                        e.esito === "vinta" ? "bg-emerald-800/60 text-emerald-300" : e.esito === "persa" ? "bg-red-900/50 text-red-300" : "bg-neutral-800 text-slate-400"
                      }`}>
                        {e.ribassoOfferto}%
                      </span>
                      <span className="flex-1 text-[10px] text-slate-300 truncate">{e.titoloGara}</span>
                      <span className="text-[9px] text-slate-500 shrink-0">{new Date(e.createdAt).toLocaleDateString("it-IT")}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Tab: Performance */}
        {activeTab === "performance" && (
          <div className="space-y-5">
            <div>
              <SectionHeader icon={<Target className="w-3.5 h-3.5" />} title="Win rate per categoria" accent="text-brand-gold" />
              <WinRateBar data={winRateByCategoria} />
            </div>
            <div>
              <SectionHeader icon={<Target className="w-3.5 h-3.5" />} title="Win rate per regione" accent="text-emerald-400" />
              <WinRateBar data={winRateByRegione} />
            </div>
            <div>
              <SectionHeader icon={<Target className="w-3.5 h-3.5" />} title="Win rate per fascia importo" accent="text-amber-400" />
              <WinRateBar data={winRateByFascia} />
            </div>
          </div>
        )}

        {/* Tab: Errori ricorrenti */}
        {activeTab === "errori" && (
          <div className="space-y-3">
            <SectionHeader icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Errori ricorrenti nelle gare perse" accent="text-red-400" />
            {erroriRicorrenti.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">Nessun errore rilevato — o nessuna gara persa con note AI nel testo.</p>
            ) : (
              <ul className="space-y-2">
                {erroriRicorrenti.map((err) => (
                  <li key={err.tipo} className="rounded-xl border border-red-900/30 bg-red-950/10 px-3 py-2.5 flex items-start gap-3">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white">{err.tipo}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{err.descrizione}</p>
                    </div>
                    <span className="shrink-0 text-[9px] font-extrabold bg-red-700/40 text-red-300 px-1.5 py-0.5 rounded">
                      ×{err.occorrenze}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tab: Raccomandazioni */}
        {activeTab === "raccomandazioni" && (
          <div className="space-y-3">
            <SectionHeader icon={<Lightbulb className="w-3.5 h-3.5" />} title="Raccomandazioni strategiche" accent="text-amber-400" />
            {raccomandazioni.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">Nessuna raccomandazione disponibile.</p>
            ) : (
              <ul className="space-y-2">
                {raccomandazioni.map((r) => (
                  <li key={r.id} className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <PrioritaBadge priorita={r.priorita} />
                      <p className="text-[11px] font-bold text-white">{r.titolo}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{r.descrizione}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Storico gare (collassabile) */}
        <div className="border-t border-neutral-800 pt-3">
          <button
            type="button"
            onClick={() => setShowStorico((v) => !v)}
            className="cursor-pointer flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-white w-full"
          >
            <Archive className="w-3.5 h-3.5 text-brand-gold" />
            Archivio gare ({entries.length})
            {showStorico ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>

          {showStorico && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] text-slate-500">
                Segna <strong className="text-white">Vinta</strong> o{" "}
                <strong className="text-white">Persa</strong> per avviare il{" "}
                <span className="text-brand-gold">Post-Gara Forensics</span> e alimentare gli analytics.
              </p>
              {entries.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-4 text-center">
                  Nessuna analisi salvata. Chatta su una gara per popolare lo storico.
                </p>
              ) : (
                <ul className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
                  {entries.map((entry) => (
                    <li key={entry.id} className="rounded-xl border border-neutral-800 bg-black/50 p-3 space-y-2">
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
                          onClick={async () => { await deleteStoricoEntry(entry.id); load(); }}
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
                          onChange={(e) => { void handleEsitoChange(entry, e.target.value as StoricoGaraEsito | ""); }}
                          className="text-[11px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white"
                        >
                          {ESITO_OPTIONS.map((o) => (
                            <option key={o.label} value={o.value}>{o.label}</option>
                          ))}
                        </select>

                        {(entry.esito === "vinta" || entry.esito === "persa") && !hasForensics(entry) && (
                          <button
                            type="button"
                            onClick={() => setForensicsTarget({ entry, esito: entry.esito as "vinta" | "persa" })}
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
                            if (v !== entry.ribassoOfferto) { await updateStoricoEsito(entry.id, { ribassoOfferto: v }); load(); }
                          }}
                          className="w-16 text-[11px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white"
                        />
                      </div>

                      {entry.noteAi && (
                        <p className="text-[10px] text-slate-500 line-clamp-3 leading-snug whitespace-pre-line">
                          {entry.noteAi.includes("ANALISI GEMINI")
                            ? entry.noteAi.split("--- ANALISI GEMINI")[1]?.slice(0, 400) ?? entry.noteAi
                            : entry.noteAi.slice(0, 400)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

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
