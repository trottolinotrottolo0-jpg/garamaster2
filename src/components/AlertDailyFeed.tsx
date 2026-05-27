import { useMemo, type ReactNode } from "react";
import {
  AlertCircle,
  Bell,
  CalendarClock,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import type { DailyFeedData } from "../types/dailyFeed";

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

export function AlertDailyFeed({
  feed,
  loading,
  error,
  onRefresh,
  onSelectGara,
  onSelectAnac,
  onOpenOfferPrep,
}: AlertDailyFeedProps) {
  const todayLabel = useMemo(() => formatFeedDate(feed?.generatedAt ?? new Date().toISOString()), [feed?.generatedAt]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 scrollbar-thin" id="alert-daily-feed-page">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              Alert &amp; Daily Feed
            </p>
            <h1 className="text-2xl font-extrabold text-white mt-1">La tua giornata gare</h1>
            <p className="text-xs text-slate-500 mt-1">{todayLabel}</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="cursor-pointer shrink-0 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-[11px] font-bold text-slate-300 hover:border-brand-gold hover:text-white disabled:opacity-50 transition-colors"
            id="daily-feed-refresh-btn"
          >
            <RefreshCw className={`w-4 h-4 text-brand-gold ${loading ? "animate-spin" : ""}`} />
            Aggiorna feed
          </button>
        </header>

        {feed && feed.totalAlerts > 0 && (
          <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-brand-gold shrink-0" />
            <p className="text-sm text-white">
              <strong className="text-brand-gold">{feed.totalAlerts}</strong> elementi richiedono attenzione oggi.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && !feed && (
          <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
            <p className="text-sm">Caricamento feed da Supabase…</p>
          </div>
        )}

        {feed && (
          <div className="space-y-8">
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

            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
              <SectionHeader
                icon={<Sparkles className="w-4 h-4" />}
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
          </div>
        )}
      </div>
    </div>
  );
}
