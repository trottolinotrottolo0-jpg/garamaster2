import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  ChevronRight,
  FileStack,
  FileText,
  Home,
  MessageSquare,
  MessageSquarePlus,
  Network,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { TenderPortfolioScore } from "./TenderPortfolioScore";
import { SoaGapForecastPanel } from "./SoaGapForecastPanel";
import type { AppTab } from "../types/navigation";
import type { DailyFeedData } from "../types/dailyFeed";
import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import { GENERAL_CHAT_TENDER } from "../lib/generalChatContext";

export type HomeShortcut = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  badge?: string | number;
  accentClass?: string;
};

type HomeDashboardProps = {
  profilo: ProfiloImpresaContext | null;
  userEmail?: string | null;
  userId?: string;
  tenders: TenderDocument[];
  selectedTender: TenderDocument;
  chatSessionsCount: number;
  dailyFeed: DailyFeedData | null;
  dailyFeedLoading: boolean;
  supabaseConfigured: boolean;
  dataError: string | null;
  onNavigate: (tab: AppTab) => void;
  onRefreshAll: () => void;
  isRefreshing?: boolean;
  engineShortcuts: HomeShortcut[];
};

const CHAT_SHORTCUT_IDS = new Set(["chat", "new-chat", "new-tender-chat", "offer-prep"]);
const TOOL_SHORTCUT_IDS = new Set([
  "bid-no-bid",
  "bid-pricing",
  "rti",
  "vessatorie",
  "capacity",
  "profitability",
]);

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-3 min-w-0">
      <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
        {label}
      </p>
      <p className={`text-xl font-extrabold mt-0.5 ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-[9px] text-slate-600 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function ShortcutGrid({ items }: { items: HomeShortcut[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            onClick={s.onClick}
            className={`cursor-pointer text-left rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 p-3 flex items-start gap-3 transition-colors group ${s.accentClass ?? "hover:border-brand-gold/40"}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 border border-neutral-800 text-brand-gold group-hover:border-brand-gold/50">
              <Icon className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-white group-hover:text-brand-gold">
                  {s.label}
                </span>
                {s.badge != null && (
                  <span className="text-[9px] font-bold bg-brand-gold text-black px-1.5 py-0.5 rounded-full shrink-0">
                    {s.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{s.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ShortcutSection({
  title,
  icon,
  items,
  accentClass = "text-slate-500",
}: {
  title: string;
  icon: ReactNode;
  items: HomeShortcut[];
  accentClass?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h3
        className={`text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${accentClass}`}
      >
        {icon}
        {title}
      </h3>
      <ShortcutGrid items={items} />
    </section>
  );
}

export function HomeDashboard({
  profilo,
  userEmail,
  userId,
  tenders,
  selectedTender,
  chatSessionsCount,
  dailyFeed,
  dailyFeedLoading,
  supabaseConfigured,
  dataError,
  onNavigate,
  onRefreshAll,
  isRefreshing,
  engineShortcuts,
}: HomeDashboardProps) {
  const isRealTender = selectedTender.id !== GENERAL_CHAT_TENDER.id;
  const alertCount = dailyFeed?.totalAlerts ?? 0;
  const tendersCount = tenders.length;

  const chatNavShortcut: HomeShortcut = {
    id: "chat",
    label: "Chat GaraMaster",
    description: "Conversazioni libere e su disciplinare",
    icon: MessageSquare,
    onClick: () => onNavigate("chat"),
    badge: chatSessionsCount,
  };

  const chatShortcuts: HomeShortcut[] = [
    chatNavShortcut,
    ...engineShortcuts.filter((s) => CHAT_SHORTCUT_IDS.has(s.id)),
  ];

  const toolShortcuts: HomeShortcut[] = engineShortcuts.filter((s) =>
    TOOL_SHORTCUT_IDS.has(s.id)
  );

  const alertAndOtherShortcuts: HomeShortcut[] = [
    {
      id: "scouting",
      label: "Scouting Gare",
      description: "Filtra ANAC per zona, SOA e importo",
      icon: Target,
      onClick: () => onNavigate("scouting"),
      accentClass: "hover:border-emerald-600/50",
    },
    {
      id: "feed",
      label: "Alert & Daily Feed",
      description: "Scadenze, gare ANAC, azioni urgenti",
      icon: Bell,
      onClick: () => onNavigate("feed"),
      badge: alertCount > 0 ? alertCount : undefined,
      accentClass: "hover:border-amber-600/50",
    },
    {
      id: "analyzer",
      label: "Analizzatore PDF",
      description: "Disciplinari e OCR capitolati",
      icon: ShieldCheck,
      onClick: () => onNavigate("analyzer"),
    },
    {
      id: "profile",
      label: "Profilo impresa",
      description: "SOA, fatturato, certificazioni",
      icon: Briefcase,
      onClick: () => onNavigate("profile"),
    },
    {
      id: "mcp",
      label: "App & connettori",
      description: "Hub MCP e strumenti collegati",
      icon: Network,
      onClick: () => onNavigate("mcp"),
    },
    {
      id: "guide",
      label: "Codex manuale",
      description: "Documentazione tecnica TS",
      icon: BookOpen,
      onClick: () => onNavigate("guide"),
    },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" id="home-dashboard">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" />
              Home
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
              Ciao{profilo?.ragioneSociale ? `, ${profilo.ragioneSociale.split(" ")[0]}` : ""}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Centro di controllo GaraMaster — tutto in un colpo d&apos;occhio.
              {userEmail && (
                <span className="block font-mono text-[10px] mt-0.5">{userEmail}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="cursor-pointer shrink-0 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-[11px] font-bold text-slate-300 hover:border-brand-gold hover:text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-brand-gold ${isRefreshing ? "animate-spin" : ""}`} />
            Aggiorna dashboard
          </button>
        </header>

        {dataError && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {dataError}
          </div>
        )}

        <button
          type="button"
          onClick={() => onNavigate("scouting")}
          className="cursor-pointer w-full text-left rounded-2xl border border-emerald-600/40 bg-gradient-to-r from-emerald-950/80 to-neutral-950 p-4 hover:border-emerald-500 transition-colors group"
          id="home-scouting-cta"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Scouting Gare
              </p>
              <p className="text-sm font-bold text-white mt-1 group-hover:text-emerald-50">
                Cerca bandi ANAC per zona, categoria, importo e fit azienda
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Filtri, salva/scarta, sync ANAC — icona verde nella barra a sinistra
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-500 text-black text-[11px] font-extrabold px-3 py-2">
              Apri scouting
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </button>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Alert oggi"
            value={dailyFeedLoading ? "…" : alertCount}
            sub="Daily feed"
            accent={alertCount > 0 ? "text-amber-400" : "text-slate-400"}
          />
          <StatCard label="Gare in catalogo" value={tendersCount} sub="ANAC + tue gare" />
          <StatCard label="Chat attive" value={chatSessionsCount} sub="Sessioni salvate" />
          <StatCard
            label="Supabase"
            value={supabaseConfigured ? "ON" : "Demo"}
            sub={supabaseConfigured ? "Dati live" : "Mock locali"}
            accent={supabaseConfigured ? "text-emerald-400" : "text-slate-500"}
          />
        </div>

        {userId && tendersCount > 0 && (
          <section className="space-y-3">
            <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-brand-gold" />
              Portfolio competitività
            </h2>
            <TenderPortfolioScore userId={userId} profilo={profilo} tenders={tenders} />
            <SoaGapForecastPanel
              userId={userId}
              profilo={profilo}
              tenders={tenders}
              compact
            />
          </section>
        )}

        {isRealTender && (
          <section className="rounded-2xl border border-brand-gold/30 bg-gradient-to-r from-brand-gold/10 to-transparent p-4">
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-gold mb-2">
              Gara in focus
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white line-clamp-2">{selectedTender.title}</p>
                <p className="text-[10px] font-mono text-slate-400 mt-1">
                  CIG {selectedTender.cig} · {selectedTender.value} · {selectedTender.region}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("chat")}
                className="cursor-pointer shrink-0 flex items-center gap-1 rounded-lg bg-brand-gold text-black text-[11px] font-extrabold px-3 py-2 hover:bg-yellow-400 transition-colors"
              >
                Apri chat gara
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}

        <section className="space-y-5">
          <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
            Scorciatoie
          </h2>

          <ShortcutSection
            title="Chat"
            icon={<MessageSquare className="w-3.5 h-3.5 text-brand-gold" />}
            items={chatShortcuts}
            accentClass="text-brand-gold"
          />

          <ShortcutSection
            title="Strumenti"
            icon={<Wrench className="w-3.5 h-3.5 text-purple-400" />}
            items={toolShortcuts}
            accentClass="text-purple-400"
          />

          <ShortcutSection
            title="Alert e altro"
            icon={<Sparkles className="w-3.5 h-3.5 text-amber-400" />}
            items={alertAndOtherShortcuts}
            accentClass="text-amber-400"
          />
        </section>

        {dailyFeed && (
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Anteprima daily feed
              </h2>
              <button
                type="button"
                onClick={() => onNavigate("feed")}
                className="cursor-pointer text-[10px] font-bold text-brand-gold hover:underline"
              >
                Vedi tutto →
              </button>
            </div>
            <ul className="space-y-2 text-[11px]">
              {dailyFeed.scadenzaProssimi7Giorni.slice(0, 2).map((item) => (
                <li key={item.id} className="text-amber-200/90 flex gap-2">
                  <span className="text-amber-500 shrink-0">⏱</span>
                  <span>
                    Scadenza {item.giorniRimanenti}gg — <strong>{item.cig}</strong>{" "}
                    {item.titolo.slice(0, 40)}…
                  </span>
                </li>
              ))}
              {dailyFeed.nuoveGareAnac.slice(0, 2).map((item) => (
                <li key={item.id} className="text-emerald-200/90 flex gap-2">
                  <span className="text-emerald-500 shrink-0">✦</span>
                  <span>
                    Nuova ANAC {item.fitScore}% — <strong>{item.cig}</strong>
                  </span>
                </li>
              ))}
              {dailyFeed.azioniUrgenti.slice(0, 2).map((item) => (
                <li key={item.id} className="text-red-200/90 flex gap-2">
                  <span className="text-red-500 shrink-0">!</span>
                  <span>
                    In preparazione — <strong>{item.cig}</strong>
                  </span>
                </li>
              ))}
              {alertCount === 0 && (
                <li className="text-slate-500 italic">Nessun alert pendente — ottimo lavoro.</li>
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export function buildEngineShortcuts(handlers: {
  onNewChat: () => void;
  onNewTenderChat: () => void;
  onOfferPrep: () => void;
  onBidNoBid: () => void;
  onBidPricing: () => void;
  onRtiAvvalimento: () => void;
  onVessatorie: () => void;
  onCapacity: () => void;
  onProfitability: () => void;
}): HomeShortcut[] {
  return [
    {
      id: "new-chat",
      label: "Nuova chat libera",
      description: "Consulenza generale senza disciplinare",
      icon: MessageSquarePlus,
      onClick: handlers.onNewChat,
    },
    {
      id: "new-tender-chat",
      label: "Chat su gara corrente",
      description: "Collegata al CIG selezionato",
      icon: FileText,
      onClick: handlers.onNewTenderChat,
    },
    {
      id: "offer-prep",
      label: "Preparazione offerta",
      description: "Percorso guidato step-by-step",
      icon: FileStack,
      onClick: handlers.onOfferPrep,
      accentClass: "hover:border-emerald-600/50",
    },
    {
      id: "bid-no-bid",
      label: "Bid / No-Bid",
      description: "GO · CAUTELA · NO-GO",
      icon: Scale,
      onClick: handlers.onBidNoBid,
    },
    {
      id: "bid-pricing",
      label: "Bid Pricing",
      description: "Scenari ribasso e margine",
      icon: TrendingUp,
      onClick: handlers.onBidPricing,
    },
    {
      id: "rti",
      label: "RTI & Avvalimento",
      description: "Gap SOA e art. 104",
      icon: Users,
      onClick: handlers.onRtiAvvalimento,
    },
    {
      id: "vessatorie",
      label: "Clausole vessatorie",
      description: "Red flag contrattuali",
      icon: ShieldCheck,
      onClick: handlers.onVessatorie,
    },
    {
      id: "capacity",
      label: "Capacity Engine",
      description: "Saturazione organizzativa",
      icon: Activity,
      onClick: handlers.onCapacity,
    },
    {
      id: "profitability",
      label: "Profitability Gate",
      description: "Margine e verdict economico",
      icon: BarChart3,
      onClick: handlers.onProfitability,
    },
  ];
}
