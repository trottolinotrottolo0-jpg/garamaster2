import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Eye,
  Info,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { AlertItem, DailyFeedData, NotifPrefs } from "../types/dailyFeed";
import { DEFAULT_NOTIF_PREFS } from "../types/dailyFeed";
import {
  generateAlerts,
  filterAlertsByPrefs,
  generateDailyDigest,
  generateWeeklyDigest,
  severityColors,
  severityLabel,
  categoriaLabel,
} from "../lib/alertEngine";

const PREFS_KEY = "gm_notif_prefs";

function loadPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIF_PREFS };
    return { ...DEFAULT_NOTIF_PREFS, ...(JSON.parse(raw) as Partial<NotifPrefs>) };
  } catch {
    return { ...DEFAULT_NOTIF_PREFS };
  }
}

function savePrefs(prefs: NotifPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

type AlertDailyFeedProps = {
  feed: DailyFeedData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectGara: (garaId: string, cig: string) => void;
  onSelectAnac: (gareAnacId: string, cig: string) => void;
  onOpenOfferPrep?: (garaId: string) => void;
};

function formatFeedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function SectionHeader({
  icon,
  title,
  count,
  accent,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h3 className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${accent}`}>
        {icon}
        {title}
      </h3>
      <span className="text-[10px] font-mono font-bold bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-full text-slate-400">
        {count}
      </span>
    </div>
  );
}

function AlertCard({
  alert,
  onSelect,
}: {
  alert: AlertItem;
  onSelect: () => void;
}) {
  const colors = severityColors(alert.severity);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`cursor-pointer w-full text-left rounded-xl border ${colors.border} ${colors.bg} px-3 py-3 flex items-start gap-3 transition-colors hover:brightness-110 group`}
    >
      <span className={`shrink-0 text-[9px] font-extrabold px-2 py-1 rounded-lg ${colors.badge}`}>
        {severityLabel(alert.severity)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="text-[11px] font-bold text-white block truncate group-hover:text-brand-gold">
          {alert.titolo}
        </span>
        <span className="text-[10px] text-slate-400 block mt-0.5 line-clamp-2">
          {alert.descrizione}
        </span>
        {alert.actionConsigliata && (
          <span className="text-[9px] text-slate-500 block mt-1 italic">
            → {alert.actionConsigliata}
          </span>
        )}
        {alert.cig && (
          <span className="text-[9px] text-slate-600 font-mono mt-0.5 block">
            CIG {alert.cig} · {categoriaLabel(alert.categoria)}
          </span>
        )}
      </span>
      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-gold shrink-0 mt-0.5" />
    </button>
  );
}

function PreferenzePannel({
  prefs,
  onChange,
}: {
  prefs: NotifPrefs;
  onChange: (p: NotifPrefs) => void;
}) {
  const toggles: { key: keyof NotifPrefs; label: string }[] = [
    { key: "gareUrgenti", label: "Gare urgenti (scadenza)" },
    { key: "gareAltaPriorita", label: "Gare alta priorità" },
    { key: "documentiMancanti", label: "Documenti mancanti" },
    { key: "task", label: "Task aperti" },
    { key: "compliance", label: "Compliance" },
    { key: "alertCritici", label: "Alert critici" },
  ];

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 space-y-3">
      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
        <Settings2 className="w-3.5 h-3.5" />
        Preferenze notifiche
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {toggles.map(({ key, label }) => (
          <label
            key={key}
            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 cursor-pointer hover:border-neutral-700 transition-colors"
          >
            <span className="text-[11px] text-slate-300">{label}</span>
            <span
              role="switch"
              aria-checked={prefs[key]}
              onClick={() => onChange({ ...prefs, [key]: !prefs[key] })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                prefs[key] ? "bg-brand-gold" : "bg-neutral-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  prefs[key] ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function AlertDailyFeed({
  feed,
  loading,
  error,
  onRefresh,
  onSelectGara,
  onSelectAnac,
  onOpenOfferPrep,
}: AlertDailyFeedProps) {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadPrefs);
  const [showPrefs, setShowPrefs] = useState(false);

  const handlePrefsChange = (p: NotifPrefs) => {
    setPrefs(p);
    savePrefs(p);
  };

  const todayLabel = useMemo(
    () => formatFeedDate(feed?.generatedAt ?? new Date().toISOString()),
    [feed?.generatedAt]
  );

  const allAlerts = useMemo(
    () => (feed ? generateAlerts(feed) : []),
    [feed]
  );

  const filteredAlerts = useMemo(
    () => filterAlertsByPrefs(allAlerts, prefs),
    [allAlerts, prefs]
  );

  const criticiAlerts = useMemo(
    () => filteredAlerts.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH"),
    [filteredAlerts]
  );

  const todayAlerts = useMemo(() => filteredAlerts.slice(0, 6), [filteredAlerts]);

  const digest = useMemo(
    () => (feed ? generateDailyDigest(feed, allAlerts) : null),
    [feed, allAlerts]
  );

  const weekly = useMemo(
    () => (feed ? generateWeeklyDigest(feed) : null),
    [feed]
  );

  function handleAlertSelect(alert: AlertItem) {
    if (!alert.garaId || !alert.cig) return;
    if (alert.categoria === "FIT" || alert.categoria === "OPERATIVO") {
      onSelectAnac(alert.garaId, alert.cig);
    } else {
      onSelectGara(alert.garaId, alert.cig);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 scrollbar-thin" id="alert-daily-feed-page">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              Alert &amp; Daily Feed
            </p>
            <h1 className="text-2xl font-extrabold text-white mt-1">La tua giornata gare</h1>
            <p className="text-xs text-slate-500 mt-1">{todayLabel}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPrefs((v) => !v)}
              className="cursor-pointer flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] font-bold text-slate-300 hover:border-brand-gold hover:text-white transition-colors"
              title="Preferenze notifiche"
            >
              <Settings2 className="w-4 h-4 text-slate-500" />
              Preferenze
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="cursor-pointer flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-[11px] font-bold text-slate-300 hover:border-brand-gold hover:text-white disabled:opacity-50 transition-colors"
              id="daily-feed-refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 text-brand-gold ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </button>
          </div>
        </header>

        {/* Preferenze panel */}
        {showPrefs && (
          <PreferenzePannel prefs={prefs} onChange={handlePrefsChange} />
        )}

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && !feed && (
          <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
            <p className="text-sm">Caricamento feed…</p>
          </div>
        )}

        {feed && (
          <div className="space-y-6">

            {/* 1. DAILY DIGEST */}
            {digest && (
              <section className="rounded-2xl border border-brand-gold/40 bg-gradient-to-br from-brand-gold/10 to-neutral-950 p-4 space-y-3">
                <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-brand-gold flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Daily Digest — {new Date(digest.generatedAt).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Monitorate</p>
                    <p className="text-xl font-extrabold text-white">{digest.gareMonitorate}</p>
                  </div>
                  <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-center">
                    <p className="text-[9px] text-amber-400 uppercase tracking-wide">Urgenti</p>
                    <p className="text-xl font-extrabold text-amber-300">{digest.gareUrgenti}</p>
                  </div>
                  <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-center">
                    <p className="text-[9px] text-red-400 uppercase tracking-wide">Alert critici</p>
                    <p className="text-xl font-extrabold text-red-300">{digest.alertCritici}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Task aperti</p>
                    <p className="text-xl font-extrabold text-white">{digest.taskAperti}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-brand-gold/20 bg-brand-gold/5 px-3 py-2.5">
                  <p className="text-[10px] text-brand-gold font-bold mb-0.5 uppercase tracking-wide">
                    Raccomandazione del giorno
                  </p>
                  <p className="text-[11px] text-white leading-relaxed">{digest.raccomandazione}</p>
                </div>
              </section>
            )}

            {/* 2. ALERT FEED — tutti gli alert filtrati */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
              <SectionHeader
                icon={<Bell className="w-4 h-4" />}
                title="Alert Feed"
                count={filteredAlerts.length}
                accent="text-brand-gold"
              />
              {filteredAlerts.length === 0 ? (
                <div className="flex flex-col items-center py-6 gap-2 text-slate-500">
                  <BellOff className="w-6 h-6" />
                  <p className="text-[11px] italic">Nessun alert attivo con le preferenze correnti.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredAlerts.map((alert) => (
                    <li key={alert.id}>
                      <AlertCard alert={alert} onSelect={() => handleAlertSelect(alert)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 3. COSA GUARDARE OGGI */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
              <SectionHeader
                icon={<Eye className="w-4 h-4" />}
                title="Cosa guardare oggi"
                count={todayAlerts.length}
                accent="text-emerald-400"
              />
              <p className="text-[10px] text-slate-500 mb-3">
                Top priorità ordinate per urgenza e severity.
              </p>
              {todayAlerts.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">Tutto sotto controllo — nessuna priorità urgente.</p>
              ) : (
                <ol className="space-y-2">
                  {todayAlerts.map((alert, i) => {
                    const colors = severityColors(alert.severity);
                    return (
                      <li key={alert.id}>
                        <button
                          type="button"
                          onClick={() => handleAlertSelect(alert)}
                          className={`cursor-pointer w-full text-left rounded-xl border ${colors.border} bg-black/40 px-3 py-2.5 flex items-center gap-3 hover:brightness-110 transition group`}
                        >
                          <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-[9px] font-bold text-slate-400">
                            {i + 1}
                          </span>
                          <span className={`shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${colors.badge}`}>
                            {severityLabel(alert.severity)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="text-[11px] font-bold text-white block truncate group-hover:text-brand-gold">
                              {alert.descrizione.length > 60
                                ? `${alert.descrizione.slice(0, 60)}…`
                                : alert.descrizione}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">
                              {categoriaLabel(alert.categoria)}{alert.cig ? ` · ${alert.cig}` : ""}
                            </span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-brand-gold shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {/* 4. ALERT CRITICI */}
            {criticiAlerts.length > 0 && (
              <section className="rounded-2xl border border-red-900/40 bg-red-950/10 p-4">
                <SectionHeader
                  icon={<AlertCircle className="w-4 h-4" />}
                  title="Alert critici e ad alta priorità"
                  count={criticiAlerts.length}
                  accent="text-red-400"
                />
                <ul className="space-y-2">
                  {criticiAlerts.map((alert) => (
                    <li key={alert.id}>
                      <AlertCard alert={alert} onSelect={() => handleAlertSelect(alert)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Scadenze dettaglio */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
              <SectionHeader
                icon={<CalendarClock className="w-4 h-4" />}
                title="Scadenza offerta — prossimi 7 giorni"
                count={feed.scadenzaProssimi7Giorni.length}
                accent="text-amber-400"
              />
              {feed.scadenzaProssimi7Giorni.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">Nessuna gara in scadenza imminente.</p>
              ) : (
                <ul className="space-y-2">
                  {feed.scadenzaProssimi7Giorni.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelectGara(item.garaId, item.cig)}
                        className="cursor-pointer w-full text-left rounded-xl border border-neutral-800 hover:border-amber-600/50 bg-black/50 px-3 py-3 flex items-start gap-3 transition-colors group"
                      >
                        <span className="shrink-0 text-[10px] font-extrabold text-amber-400 bg-amber-950/50 border border-amber-900/50 px-2 py-1 rounded-lg">
                          {item.giorniRimanenti === 0
                            ? "Oggi"
                            : item.giorniRimanenti === 1
                              ? "1 gg"
                              : `${item.giorniRimanenti} gg`}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-white block truncate group-hover:text-brand-gold">
                            {item.titolo}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            CIG {item.cig}
                            {item.regione ? ` · ${item.regione}` : ""}
                            {item.importo ? ` · ${item.importo}` : ""}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-gold shrink-0 mt-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Nuove gare ANAC */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
              <SectionHeader
                icon={<Sparkles className="w-4 h-4" />}
                title="Nuove gare ANAC (fit profilo)"
                count={feed.nuoveGareAnac.length}
                accent="text-emerald-400"
              />
              <p className="text-[10px] text-slate-500 mb-3">
                Match con fit_score &gt; 60 non ancora visualizzate.
              </p>
              {feed.nuoveGareAnac.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">Nessuna nuova opportunità ANAC oggi.</p>
              ) : (
                <ul className="space-y-2">
                  {feed.nuoveGareAnac.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelectAnac(item.gareAnacId, item.cig)}
                        className="cursor-pointer w-full text-left rounded-xl border border-neutral-800 hover:border-emerald-700/50 bg-black/50 px-3 py-3 flex items-start gap-3 transition-colors group"
                      >
                        <span className="shrink-0 text-[10px] font-extrabold text-emerald-400 bg-emerald-950/50 border border-emerald-900/50 px-2 py-1 rounded-lg">
                          {item.fitScore}%
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-white block truncate group-hover:text-brand-gold">
                            {item.titolo}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            CIG {item.cig}
                            {item.regione ? ` · ${item.regione}` : ""}
                          </span>
                        </span>
                        <span className="text-[9px] font-bold text-emerald-400 uppercase shrink-0">Nuova</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Scouting AI alerts */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
              <SectionHeader
                icon={<AlertTriangle className="w-4 h-4" />}
                title="Alert AI scouting"
                count={feed.scoutingAiAlerts.length}
                accent="text-purple-400"
              />
              <p className="text-[10px] text-slate-500 mb-3">
                Rischi e verifiche urgenti da analisi LLM su gare ANAC (fit ≥ 50).
              </p>
              {feed.scoutingAiAlerts.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">
                  Nessun alert AI. Usa «Arricchisci AI» in Scouting Gare.
                </p>
              ) : (
                <ul className="space-y-2">
                  {feed.scoutingAiAlerts.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelectAnac(item.gareAnacId, item.cig)}
                        className="cursor-pointer w-full text-left rounded-xl border border-purple-900/40 hover:border-purple-600/50 bg-black/50 px-3 py-3 flex items-start gap-3 transition-colors group"
                      >
                        <span className="shrink-0 text-[10px] font-extrabold text-purple-300 bg-purple-950/50 border border-purple-900/50 px-2 py-1 rounded-lg">
                          {item.fitScore}%
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-white block truncate group-hover:text-brand-gold">
                            {item.titolo}
                          </span>
                          <span className="text-[10px] text-purple-200/90 block mt-1 line-clamp-2">
                            {item.alert}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">CIG {item.cig}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-gold shrink-0 mt-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Azioni urgenti */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
              <SectionHeader
                icon={<Zap className="w-4 h-4" />}
                title="Azioni urgenti"
                count={feed.azioniUrgenti.length}
                accent="text-red-400"
              />
              <p className="text-[10px] text-slate-500 mb-3">
                Gare con stato pratica «In preparazione».
              </p>
              {feed.azioniUrgenti.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">Nessuna azione urgente pendente.</p>
              ) : (
                <ul className="space-y-2">
                  {feed.azioniUrgenti.map((item) => (
                    <li key={item.id}>
                      <div className="rounded-xl border border-red-900/30 bg-red-950/20 px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-white truncate">{item.titolo}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            CIG {item.cig} · {item.statoPratica}
                            {item.giorniRimanenti != null && item.giorniRimanenti >= 0
                              ? ` · scadenza tra ${item.giorniRimanenti} gg`
                              : ""}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSelectGara(item.garaId, item.cig)}
                            className="cursor-pointer text-[10px] font-bold text-brand-gold hover:underline"
                          >
                            Apri gara
                          </button>
                          {onOpenOfferPrep && (
                            <button
                              type="button"
                              onClick={() => onOpenOfferPrep(item.garaId)}
                              className="cursor-pointer text-[10px] font-bold text-emerald-400 hover:underline"
                            >
                              Prepara offerta
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 5. WEEKLY SUMMARY */}
            {weekly && (
              <section className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 to-black p-4 space-y-3">
                <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-brand-gold" />
                  Weekly Summary — {weekly.settimana}
                </h2>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Nuove opp.</p>
                    <p className="text-lg font-extrabold text-emerald-400">{weekly.nuoveOpportunita}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Analizzate</p>
                    <p className="text-lg font-extrabold text-white">{weekly.gareAnalizzate}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-black/50 px-3 py-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Risolti</p>
                    <p className="text-lg font-extrabold text-slate-400">{weekly.alertRisolti}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2.5">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mb-1">
                    Raccomandazione settimanale
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{weekly.raccomandazione}</p>
                </div>

                <p className="text-[9px] text-slate-600 italic">
                  * I dati risolti saranno tracciati nelle versioni future con storico persistente.
                </p>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
