import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Message,
  McpServer,
  PacketLog,
  TenderDocument,
  ChatAttachment,
  Prezzario,
  CompanyProfile,
  type ColllegamentoComputoPrezzario,
  type WinningPattern,
  type GaraSimilareHistorica,
} from "./types";
import {
  generateWinningPatterns,
  matchGaraToPatterns,
  analyzePatternsTimeTrend,
  generatePatternAlerts,
  type PatternAlert,
} from "./lib/winningPatternEngine";
import { WinningPatternViewer } from "./components/WinningPatternViewer";
import { buildComputoFromTender } from "./lib/bidCalculations";
import { initialMcpServers, mockTenders } from "./mockData";
import { useGaraMaster } from "./context/GaraMasterContext";
import { requestGaraMasterReply } from "./lib/chatApi";
import { GENERAL_CHAT_TENDER } from "./lib/generalChatContext";
import type { InternalConnectorAction } from "./lib/internalConnectors";
import {
  createChatSession,
  createOfferPreparationSession,
  deriveTitleFromMessage,
  loadSessionsForUser,
  persistSession,
  saveLocalSessions,
} from "./lib/chatSessions";
import {
  mergeOfferPreparationState,
  parseOfferStateFromAssistantText,
  createInitialOfferState,
  type OfferBusta,
} from "./lib/guidedOfferPreparation";
import { McpHub } from "./components/McpHub";
import { ChatWorkspace } from "./components/ChatWorkspace";
import { ChatSessionsSidebar } from "./components/ChatSessionsSidebar";
import type { ChatSession } from "./types/chat";
import { DocumentAnalyzer } from "./components/DocumentAnalyzer";
import { DeveloperGuide } from "./components/DeveloperGuide";
import { CompanyProfile as CompanyProfileComponent } from "./components/CompanyProfile";
import { TenderPortfolioScore } from "./components/TenderPortfolioScore";
import { VessatorieModal } from "./components/VessatorieModal";
import { BidNoBidEngine } from "./components/BidNoBidEngine";
import { RtiAvvalimentoConfigurator } from "./components/RtiAvvalimentoConfigurator";
import { BidPricingEngine } from "./components/BidPricingEngine";
import { PrezzariManager } from "./components/PrezzariManager";
import { CapacitySaturationEngine } from "./components/CapacitySaturationEngine";
import { ProfitabilityGate } from "./components/ProfitabilityGate";
import { AwardCriteriaAnalyzer } from "./components/AwardCriteriaAnalyzer";
import { MarketIntelligenceDashboard } from "./components/MarketIntelligenceDashboard";
import { RiskComplianceProfiler } from "./components/RiskComplianceProfiler";
import { CAMComplianceChecker } from "./components/CAMComplianceChecker";
import { DelayPenaltyExposureAnalyzer } from "./components/DelayPenaltyExposureAnalyzer";
import { VariantClaimsRiskAnalyzer } from "./components/VariantClaimsRiskAnalyzer";
import { PreSubmissionComplianceAudit } from "./components/PreSubmissionComplianceAudit";
import { QualificationReadinessHub } from "./components/QualificationReadinessHub";
import { fetchHistoricalGareData } from "./lib/marketIntelligenceApi";
import { buildHistoricalFromCompanyProfile, mergeHistoricalSources } from "./lib/marketIntelligenceEngine";
import { AlertDailyFeed } from "./components/AlertDailyFeed";
import { ScoutingGareApp } from "./components/ScoutingGareApp";
import { GaraRoiCalculator } from "./components/GaraRoiCalculator";
import { HomeDashboard, buildEngineShortcuts } from "./components/HomeDashboard";
import { HistoricalKnowledgePanel } from "./components/HistoricalKnowledgePanel";
import { SoaGapForecastPanel } from "./components/SoaGapForecastPanel";
import type { AppTab } from "./types/navigation";
import { extractRibassoPercent } from "./lib/storicoGare";
import { fetchStoricoForPrompt, saveStoricoAnalisi } from "./services/storicoGareService";
import { markAnacGaraAsSeen } from "./services/dailyFeedService";
import { 
  Cpu, Layers, Network, BookOpen, MessageSquare, ShieldCheck, Info, Plus, Search, Sliders, LogOut, Settings, 
  Sparkles, HelpCircle, Briefcase, User, Database, ShieldAlert, Key, Download, Bell,
  Menu, ChevronDown, ChevronLeft, ChevronRight, PanelLeftOpen, PanelRightOpen,
  FileText, Calculator, Scale, TrendingUp, Activity, BarChart3, Users, Home, Target, ListChecks, AlertTriangle, Leaf, Clock, Zap, CheckCircle2
} from "lucide-react";

const LOCALSTORAGE_PREZZARI_KEY = "gm_prezzari";
const LOCALSTORAGE_PROFILO_KEY = "gm_company_profile";

type SidebarDropdownSectionProps = {
  title: string;
  badge?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function SidebarDropdownSection({
  title,
  badge,
  isOpen,
  onToggle,
  children,
}: SidebarDropdownSectionProps) {
  return (
    <section className="border-t border-neutral-800 pt-2.5 mt-2.5 first:border-t-0 first:pt-0 first:mt-0">
      <button
        type="button"
        onClick={onToggle}
        className="cursor-pointer w-full flex items-center justify-between gap-2 py-1.5 text-left group"
      >
        <span className="text-[10px] font-sans font-extrabold tracking-wider text-slate-450 uppercase group-hover:text-white transition-colors">
          {title}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {badge}
          <ChevronDown
            className={`w-3.5 h-3.5 text-brand-gold transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </section>
  );
}

export default function App() {
  const {
    gare,
    profilo,
    signOut,
    supabaseConfigured,
    dataError,
    user,
    dailyFeed,
    dailyFeedLoading,
    dailyFeedError,
    refreshDailyFeed,
    refreshData,
  } = useGaraMaster();
  const handleAfterAnacSync = useCallback(async () => {
    await Promise.all([refreshData(), refreshDailyFeed()]);
  }, [refreshData, refreshDailyFeed]);
  const [localTenders, setLocalTenders] = useState<TenderDocument[]>([]);
  const allTenders = [...gare, ...localTenders];

  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [servers, setServers] = useState<McpServer[]>(initialMcpServers);
  const [selectedTender, setSelectedTender] = useState<TenderDocument>(mockTenders[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [packets, setPackets] = useState<PacketLog[]>([]);
  const [isSimplifiedMode, setIsSimplifiedMode] = useState<boolean>(true);
  const [isVessatorieOpen, setIsVessatorieOpen] = useState<boolean>(false);
  const [isAwardAnalyzerOpen, setIsAwardAnalyzerOpen] = useState(false);
  const [isMarketIntelligenceOpen, setIsMarketIntelligenceOpen] = useState(false);
  const [isRiskComplianceOpen, setIsRiskComplianceOpen] = useState(false);
  const [qualificationVerdict, setQualificationVerdict] = useState<string | null>(null);
  const [showCAMChecker, setShowCAMChecker] = useState(false);
  const [showDelayAnalyzer, setShowDelayAnalyzer] = useState(false);
  const [showVariantsAnalyzer, setShowVariantsAnalyzer] = useState(false);
  const [showAuditGate, setShowAuditGate] = useState(false);
  const [auditPassed, setAuditPassed] = useState(false);
  const [isQualificationHubOpen, setIsQualificationHubOpen] = useState(false);
  const [historicalGareData, setHistoricalGareData] = useState<GaraSimilareHistorica[]>([]);
  const [isBidNoBidOpen, setIsBidNoBidOpen] = useState(false);
  const [isBidPricingOpen, setIsBidPricingOpen] = useState(false);
  const [isCapacityOpen, setIsCapacityOpen] = useState(false);
  const [isProfitabilityOpen, setIsProfitabilityOpen] = useState(false);
  const [isRtiAvvalimentoOpen, setIsRtiAvvalimentoOpen] = useState(false);
  const [prezzari, setPrezzari] = useState<Prezzario[]>([]);
  const [isPrezzariManagerOpen, setIsPrezzariManagerOpen] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [computoCollegamenti, setComputoCollegamenti] = useState<ColllegamentoComputoPrezzario[]>([]);
  const [winningPatterns, setWinningPatterns] = useState<WinningPattern[]>([]);
  const [isAnalyzingPatterns, setIsAnalyzingPatterns] = useState(false);
  const [isWinningPatternOpen, setIsWinningPatternOpen] = useState(false);
  const [patternAlerts, setPatternAlerts] = useState<PatternAlert[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);

  const openBidNoBidFlow = useCallback(() => {
    setQualificationVerdict(null);
    setIsBidNoBidOpen(true);
  }, []); // openBidNoBidFlow

  useEffect(() => {
    setQualificationVerdict(null);
    setAuditPassed(false);
  }, [selectedTender.id]);

  // Custom states for settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSysInfoOpen, setIsSysInfoOpen] = useState(false);
  const [llmModel, setLlmModel] = useState<string>("Gemini 3.5 Flash");
  const [supabaseStatus, setSupabaseStatus] = useState<string>(
    supabaseConfigured ? "Configurato — in attesa dati" : "Demo (mock data)"
  );
  const [customKey, setCustomKey] = useState<string>("•••••••••••••••••••••");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isRibassoOpen, setIsRibassoOpen] = useState(false);
  const [rightOpenSections, setRightOpenSections] = useState({
    requisiti: true,
    penali: false,
    anomalie: false,
    azioni: true,
  });
  const navMenuRef = useRef<HTMLDivElement>(null);

  const toggleRightSection = (key: keyof typeof rightOpenSections) => {
    setRightOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const storedPrezzari = localStorage.getItem(LOCALSTORAGE_PREZZARI_KEY);
    if (storedPrezzari) {
      try {
        setPrezzari(JSON.parse(storedPrezzari) as Prezzario[]);
      } catch {
        setPrezzari([]);
      }
    }
    const storedProfile = localStorage.getItem(LOCALSTORAGE_PROFILO_KEY);
    if (storedProfile) {
      try {
        setCompanyProfile(JSON.parse(storedProfile) as CompanyProfile);
      } catch {
        setCompanyProfile(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!isBidPricingOpen && !isPrezzariManagerOpen) return;
    const storedProfile = localStorage.getItem(LOCALSTORAGE_PROFILO_KEY);
    if (!storedProfile) return;
    try {
      setCompanyProfile(JSON.parse(storedProfile) as CompanyProfile);
    } catch {
      setCompanyProfile(null);
    }
  }, [isBidPricingOpen, isPrezzariManagerOpen]);

  useEffect(() => {
    if (!isMarketIntelligenceOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const fromApi = await fetchHistoricalGareData();
        const fromProfile = buildHistoricalFromCompanyProfile(companyProfile);
        if (!cancelled) {
          setHistoricalGareData(mergeHistoricalSources(fromApi, fromProfile));
        }
      } catch {
        if (!cancelled) {
          setHistoricalGareData(buildHistoricalFromCompanyProfile(companyProfile));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMarketIntelligenceOpen, companyProfile]);

  useEffect(() => {
    const storico = companyProfile?.historicalTenders;
    if (!storico?.length) {
      setWinningPatterns([]);
      return;
    }
    setIsAnalyzingPatterns(true);
    const timer = window.setTimeout(() => {
      const patterns = generateWinningPatterns(storico);
      setWinningPatterns(patterns);
      setIsAnalyzingPatterns(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [companyProfile?.historicalTenders]);

  useEffect(() => {
    if (!selectedTender?.id || winningPatterns.length === 0) {
      setPatternAlerts([]);
      return;
    }
    const matches = matchGaraToPatterns(selectedTender, winningPatterns);
    const trends = analyzePatternsTimeTrend(winningPatterns);
    setPatternAlerts(generatePatternAlerts(matches, winningPatterns, trends));
  }, [selectedTender, winningPatterns]);

  const visiblePatternAlerts = useMemo(
    () => patternAlerts.filter((a) => !dismissedAlertIds.includes(a.id)),
    [patternAlerts, dismissedAlertIds]
  );

  const handlePatternAlertAction = useCallback(
    (alert: PatternAlert) => {
      if (alert.tipo === "VERY_SIMILAR" || alert.tipo === "TREND_WARNING") {
        setIsWinningPatternOpen(true);
      } else if (alert.tipo === "OPPORTUNITY") {
        openBidNoBidFlow();
      } else if (alert.tipo === "RISK") {
        setIsVessatorieOpen(true);
      }
    },
    []
  );

  const savePrezzari = useCallback((nuoviPrezzari: Prezzario[]) => {
    setPrezzari(nuoviPrezzari);
    localStorage.setItem(LOCALSTORAGE_PREZZARI_KEY, JSON.stringify(nuoviPrezzari));
  }, []);

  const savePrezzarioPreferito = useCallback((id: string) => {
    if (!companyProfile) return;
    const updated: CompanyProfile = {
      ...companyProfile,
      prezzarioPreferito: id || undefined,
    };
    setCompanyProfile(updated);
    localStorage.setItem(LOCALSTORAGE_PROFILO_KEY, JSON.stringify(updated));
  }, [companyProfile]);

  useEffect(() => {
    if (dataError) {
      setSupabaseStatus(`Errore: ${dataError}`);
      return;
    }
    if (profilo) {
      setSupabaseStatus(`Connesso · ${profilo.ragioneSociale}`);
      return;
    }
    if (supabaseConfigured) {
      setSupabaseStatus("Connesso · profilo non trovato");
    }
  }, [profilo, dataError, supabaseConfigured]);

  useEffect(() => {
    if (allTenders.length === 0) return;
    if (!allTenders.some((t) => t.id === selectedTender.id)) {
      setSelectedTender(allTenders[0]);
    }
  }, [allTenders, selectedTender.id]);

  useEffect(() => {
    if (!isNavMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (navMenuRef.current && !navMenuRef.current.contains(e.target as Node)) {
        setIsNavMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNavMenuOpen]);

  const initialSession = createChatSession("general", null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([initialSession]);
  const [activeSessionId, setActiveSessionId] = useState(initialSession.id);
  const [enabledConnectors, setEnabledConnectors] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("gm_enabled_connectors");
      return raw ? (JSON.parse(raw) as string[]) : ["bid-no-bid", "vessatorie"];
    } catch {
      return ["bid-no-bid", "vessatorie"];
    }
  });
  const [conversazioneSaveStatus, setConversazioneSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "skipped"
  >("idle");
  const [conversazioneSaveError, setConversazioneSaveError] = useState<string | null>(null);

  const activeSession =
    chatSessions.find((s) => s.id === activeSessionId) ?? chatSessions[0];
  const messages = activeSession?.messages ?? [];

  const patchActiveSession = (patch: Partial<ChatSession> | ((s: ChatSession) => ChatSession)) => {
    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return typeof patch === "function" ? patch(s) : { ...s, ...patch };
      })
    );
  };

  const setMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    patchActiveSession((s) => {
      const next = typeof updater === "function" ? updater(s.messages) : updater;
      return { ...s, messages: next, updatedAt: new Date().toISOString() };
    });
  };

  const resolveTenderForSession = (session: ChatSession): TenderDocument => {
    if (session.mode === "general") return GENERAL_CHAT_TENDER;
    if (session.tenderId) {
      return allTenders.find((t) => t.id === session.tenderId) ?? selectedTender;
    }
    return selectedTender;
  };

  const resolveTenderByIdOrCig = (garaId: string, cig?: string): TenderDocument | undefined => {
    return (
      allTenders.find(
        (t) =>
          t.id === garaId ||
          t.id === `gare-${garaId}` ||
          t.id === `gare_anac-${garaId}` ||
          (cig && t.cig === cig)
      ) ?? undefined
    );
  };

  const handleFeedSelectGara = (garaId: string, cig: string) => {
    const tender = resolveTenderByIdOrCig(garaId, cig);
    if (tender) {
      setSelectedTender(tender);
      setActiveTab("chat");
      addSession(createChatSession("tender", tender));
    }
  };

  const handleFeedSelectAnac = async (gareAnacId: string, cig: string) => {
    if (user?.id) {
      await markAnacGaraAsSeen(user.id, gareAnacId);
      await refreshDailyFeed();
    }
    const tender =
      resolveTenderByIdOrCig(gareAnacId, cig) ??
      allTenders.find((t) => t.id === `gare_anac-${gareAnacId}` || t.cig === cig);
    if (tender) {
      setSelectedTender(tender);
      setActiveTab("chat");
      addSession(createChatSession("tender", tender));
    }
  };

  const handleFeedOpenOfferPrep = (garaId: string) => {
    const tender = resolveTenderByIdOrCig(garaId);
    if (tender) handleStartOfferPreparation(tender);
  };

  const handleStartOfferPreparation = (tender: TenderDocument) => {
    setSelectedTender(tender);
    addSession(createOfferPreparationSession(tender));
    setIsNavMenuOpen(false);
  };

  const handleToggleOfferChecklistItem = (busta: OfferBusta, itemId: string) => {
    patchActiveSession((s) => {
      if (!s.offerPreparation) return s;
      const list = s.offerPreparation.checklist[busta] ?? [];
      return {
        ...s,
        offerPreparation: {
          ...s.offerPreparation,
          checklist: {
            ...s.offerPreparation.checklist,
            [busta]: list.map((item) =>
              item.id === itemId ? { ...item, done: !item.done } : item
            ),
          },
          lastUpdatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const activeTender = resolveTenderForSession(activeSession);

  useEffect(() => {
    if (!user?.id) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshDailyFeed();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.id, refreshDailyFeed]);

  useEffect(() => {
    if ((activeTab === "feed" || activeTab === "home") && user?.id) {
      void refreshDailyFeed();
    }
  }, [activeTab, user?.id, refreshDailyFeed]);

  useEffect(() => {
    if (!user?.id) {
      saveLocalSessions(chatSessions);
      return;
    }
    const fallback = createChatSession("general", null);
    loadSessionsForUser(user.id, allTenders, fallback).then((loaded) => {
      setChatSessions(loaded);
      setActiveSessionId(loaded[0]?.id ?? fallback.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem("gm_enabled_connectors", JSON.stringify(enabledConnectors));
  }, [enabledConnectors]);

  const handleToggleServer = (id: string) => {
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, connected: !s.connected } : s))
    );

    // Alert packet stream
    const serverObj = servers.find((s) => s.id === id);
    if (serverObj) {
      const isCon = !serverObj.connected;
      const log: PacketLog = {
        id: `sys-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        direction: "host-to-llm",
        service: "MCP Connection Manager",
        payload: {
          event: "server_status_change",
          server: serverObj.id,
          connected: isCon,
          message: `L'MCP Server ${serverObj.name} è stato ${isCon ? "connesso" : "disconnesso"} dal bus principale.`,
        },
      };
      setPackets((prev) => [...prev, log]);
    }
  };

  const handleClearPackets = () => {
    setPackets([]);
  };

  const handleAddPacket = (packet: PacketLog) => {
    setPackets((prev) => [...prev, packet]);
  };

  const handleAddCustomTender = (newTender: TenderDocument) => {
    setLocalTenders((prev) => [...prev, newTender]);
  };

  const handleExportReport = () => {
    const tender = selectedTender;
    let markdown = `# GaraMaster AI - Report Analisi Gara\n\n`;
    markdown += `## DATI IDENTIFICATIVI GARA\n`;
    markdown += `- **Titolo Gara**: ${tender.title}\n`;
    markdown += `- **CIG**: ${tender.cig}\n`;
    markdown += `- **Importo a base d'asta**: ${tender.value}\n`;
    markdown += `- **Regione**: ${tender.region}\n`;
    markdown += `- **Termine Scadenza**: ${tender.deadline}\n\n`;

    markdown += `## 1. REQUISITI ANALIZZATI & COMPATIBILITÀ IMPRESA\n`;
    markdown += `Di seguito i requisiti di qualificazione (SOA, Fatturato, ISO) estratti dal disciplinare e la conformità rilevata:\n\n`;
    
    tender.requirements.forEach((req, idx) => {
      const statusIcon = req.satisfied ? "✅ REQUISITO CONFORME" : "❌ REQUISITO NON CONFORME / MANCANTE";
      markdown += `### Requisito #${idx + 1}: ${req.description}\n`;
      markdown += `- **Categoria**: ${req.category}\n`;
      markdown += `- **Stato**: ${statusIcon}\n`;
      markdown += `- **Dettagli Estrazione**: _${req.details}_\n\n`;
    });

    markdown += `\n## 2. PENALI IDENTIFICATE & RISCHI CONTRATTUALI\n`;
    markdown += `Analisi delle penali e delle clausole di revisione prezzo connesse al disciplinare corrente:\n\n`;
    
    if (tender.penalties && tender.penalties.length > 0) {
      tender.penalties.forEach((pen, idx) => {
        markdown += `${idx + 1}. **Penale di Gara / Ispezione Rischio**\n   - ${pen}\n\n`;
      });
    } else {
      markdown += `_Nessuna penale identificata per questo bando._\n`;
    }

    markdown += `\n---\n`;
    markdown += `*Generato automaticamente da GaraMaster AI ad integrazione con Supabase DB Gara Historian e MCP Host.*`;

    // Create downloadable blob
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Report_GaraMaster_${tender.cig || "Export"}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const addSession = (session: ChatSession) => {
    setChatSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setConversazioneSaveStatus("idle");
    setConversazioneSaveError(null);
    setActiveTab("chat");
  };

  const handleNewGeneralChat = () => {
    addSession(createChatSession("general", null));
  };

  const handleNewTenderChat = () => {
    addSession(createChatSession("tender", selectedTender));
  };

  const handleNewChat = () => handleNewGeneralChat();

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setConversazioneSaveStatus("idle");
    const session = chatSessions.find((s) => s.id === id);
    if (
      (session?.mode === "tender" || session?.mode === "offer_preparation") &&
      session.tenderId
    ) {
      const t = allTenders.find((x) => x.id === session.tenderId);
      if (t) setSelectedTender(t);
    }
  };

  const handleDeleteSession = (id: string) => {
    setChatSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fresh = createChatSession("general", null);
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(next[0].id);
      }
      return next;
    });
  };

  const handleToggleConnector = (id: string) => {
    setEnabledConnectors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRunConnector = (action: InternalConnectorAction) => {
    const map: Record<InternalConnectorAction, () => void> = {
      bidNoBid: openBidNoBidFlow,
      bidPricing: () => setIsBidPricingOpen(true),
      capacity: () => setIsCapacityOpen(true),
      profitability: () => setIsProfitabilityOpen(true),
      vessatorie: () => setIsVessatorieOpen(true),
      analyzer: () => setActiveTab("analyzer"),
      portfolioScore: () => setActiveTab("chat"),
      profile: () => setActiveTab("profile"),
      rtiAvvalimento: () => setIsRtiAvvalimentoOpen(true),
      garaRoi: () => {
        setActiveTab("chat");
        setIsRightSidebarOpen(true);
      },
    };
    map[action]?.();
  };

  const handleSendMessage = async (
    text: string,
    overrideTargetTender?: string,
    attachments?: ChatAttachment[]
  ) => {
    const hasAttachments = attachments && attachments.length > 0;
    const displayText =
      text.trim() ||
      (hasAttachments
        ? `Allegati caricati: ${attachments!.map((a) => a.name).join(", ")}`
        : "");

    const userMsg: Message = {
      id: `msg-user-${Date.now()}`,
      sender: "user",
      text: displayText,
      timestamp: new Date(),
      attachments: hasAttachments ? attachments : undefined,
    };

    const session = activeSession;
    let tenderForRequest = resolveTenderForSession(session);
    if (overrideTargetTender) {
      const match = allTenders.find((t) => t.id === overrideTargetTender);
      if (match) {
        tenderForRequest = match;
        setSelectedTender(match);
      }
    }

    const isFirstUserTurn = session.messages.filter((m) => m.sender === "user").length === 0;
    if (isFirstUserTurn && displayText.trim()) {
      patchActiveSession({ title: deriveTitleFromMessage(displayText) });
    }

    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);

    if (hasAttachments && attachments!.some((a) => a.name.toLowerCase().endsWith(".pdf"))) {
      setActiveTab("analyzer");
    }

    const requestLog: PacketLog = {
      id: `llm-req-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      direction: "host-to-llm",
      service: "Gemini Model reasoning",
      payload: {
        model: llmModel,
        prompt: displayText,
        tender_cig: tenderForRequest.cig,
        profilo: profilo?.ragioneSociale,
        attachments: attachments?.map((a) => a.name),
      },
    };
    setPackets((prev) => [...prev, requestLog]);

    try {
      const catalogSummary =
        session.mode === "general"
          ? allTenders.slice(0, 40).map((t) => ({
              cig: t.cig,
              titolo: t.title,
              regione: t.region,
              importo: t.value,
              categoria: t.category,
            }))
          : undefined;

      const storicoGare =
        user?.id && session.mode !== "general"
          ? await fetchStoricoForPrompt(user.id)
          : undefined;

      const result = await requestGaraMasterReply({
        message: displayText,
        model: llmModel,
        chatMode: session.mode,
        tender: session.mode === "general" ? null : tenderForRequest,
        profilo,
        history: messages,
        attachments,
        enabledConnectorIds: enabledConnectors,
        catalogSummary,
        storicoGare,
      });

      const { displayText: assistantDisplayText, statePatch } =
        session.mode === "offer_preparation"
          ? parseOfferStateFromAssistantText(result.text)
          : { displayText: result.text, statePatch: null };

      const assistantMsg: Message = {
        id: `msg-agent-${Date.now()}`,
        sender: "assistant",
        text: assistantDisplayText,
        timestamp: new Date(),
      };

      const updatedMessages = [...messages, userMsg, assistantMsg];
      setMessages(updatedMessages);

      const offerPreparation =
        session.mode === "offer_preparation" && statePatch
          ? mergeOfferPreparationState(
              session.offerPreparation ?? createInitialOfferState(),
              statePatch
            )
          : session.offerPreparation;

      const sessionAfter = {
        ...session,
        messages: updatedMessages,
        title: isFirstUserTurn && displayText.trim() ? deriveTitleFromMessage(displayText) : session.title,
        offerPreparation,
      };

      if (offerPreparation && session.mode === "offer_preparation") {
        patchActiveSession({ offerPreparation });
      }

      if (supabaseConfigured && user?.id) {
        setConversazioneSaveStatus("saving");
        setConversazioneSaveError(null);
        persistSession(sessionAfter, user.id, tenderForRequest)
          .then((id) => {
            if (id) patchActiveSession({ supabaseId: id });
            setConversazioneSaveStatus("saved");
          })
          .catch((saveError) => {
            const message =
              saveError instanceof Error ? saveError.message : "Salvataggio non riuscito";
            console.error("[GaraMaster] Salvataggio conversazione fallito:", message);
            setConversazioneSaveStatus("error");
            setConversazioneSaveError(message);
          });
      } else {
        setConversazioneSaveStatus("skipped");
        saveLocalSessions(
          chatSessions.map((s) =>
            s.id === activeSessionId ? { ...sessionAfter, updatedAt: new Date().toISOString() } : s
          )
        );
      }

      setPackets((prev) => [
        ...prev,
        {
          id: `llm-res-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "llm-to-host",
          service: "Gemini Model reasoning",
          payload: { model: result.model, chars: result.text.length },
        },
      ]);

      if (user?.id && supabaseConfigured && session.mode !== "general") {
        const ribasso =
          extractRibassoPercent(displayText) ??
          extractRibassoPercent(assistantDisplayText);
        void saveStoricoAnalisi({
          userId: user.id,
          tenderId: tenderForRequest.id,
          cig: tenderForRequest.cig,
          titoloGara: tenderForRequest.title,
          tipoAnalisi:
            session.mode === "offer_preparation" ? "preparazione_offerta" : "chat",
          ribassoOfferto: ribasso,
          noteAi: assistantDisplayText.slice(0, 4000),
        });
      }
    } catch (error) {
      const errText =
        error instanceof Error ? error.message : "Errore sconosciuto dal server LLM.";
      const isTemporaryOverload =
        /sovraccarico|503|429|high demand|UNAVAILABLE|troppe richieste|rate.?limit|temporarily rate-limited|saturi/i.test(
          errText
        );

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-error-${Date.now()}`,
          sender: "assistant",
          text: isTemporaryOverload
            ? `### Servizio LLM momentaneamente occupato\n\n${errText}\n\n**L'app funziona:** login, gare e Supabase non sono coinvolti. Attendi 1–2 minuti e **reinvia il messaggio**.`
            : `### Impossibile contattare l'LLM\n\n${errText}\n\nVerifica \`npm run dev\` su http://localhost:3000 e \`OPENROUTER_API_KEY\` in \`.env.local\`.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredTenders = allTenders.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.cig.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const engineShortcuts = useMemo(
    () =>
      buildEngineShortcuts({
        onNewChat: () => {
          handleNewGeneralChat();
          setActiveTab("chat");
        },
        onNewTenderChat: () => {
          handleNewTenderChat();
          setActiveTab("chat");
        },
        onOfferPrep: () => handleStartOfferPreparation(selectedTender),
        onBidNoBid: openBidNoBidFlow,
        onBidPricing: () => setIsBidPricingOpen(true),
        onRtiAvvalimento: () => setIsRtiAvvalimentoOpen(true),
        onVessatorie: () => setIsVessatorieOpen(true),
        onCapacity: () => setIsCapacityOpen(true),
        onProfitability: () => setIsProfitabilityOpen(true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTender.id, chatSessions.length]
  );

  const handleRefreshDashboard = async () => {
    setDashboardRefreshing(true);
    try {
      await Promise.all([refreshData(), refreshDailyFeed()]);
    } finally {
      setDashboardRefreshing(false);
    }
  };

  const navigateTo = (tab: AppTab) => {
    setActiveTab(tab);
    setIsNavMenuOpen(false);
    if (tab === "feed") void refreshDailyFeed();
  };

  const handleSelectTenderFromPortfolio = (listId: string) => {
    const match = allTenders.find((t) => t.id === listId);
    if (match) {
      setSelectedTender(match);
      setActiveTab("chat");
      setIsNavMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex text-white font-sans selection:bg-brand-gold selection:text-black" id="main-gpt-layout">
      
      {/* 1. LEFT NAV — barra collassabile + dropdown (elenco puntato) */}
      {isLeftSidebarOpen && (
      <div
        ref={navMenuRef}
        className="relative shrink-0 border-r border-neutral-800 bg-black z-50"
        id="gpt-left-sidebar"
      >
        <div className="flex flex-col items-center gap-2 p-3 h-screen sticky top-0 w-[72px]">
          <button
            type="button"
            onClick={() => navigateTo("home")}
            className={`cursor-pointer w-10 h-10 rounded-lg p-1.5 flex items-center justify-center font-bold shadow-md text-sm transition-colors ${
              activeTab === "home"
                ? "bg-brand-gold text-black"
                : "bg-neutral-900 border border-neutral-800 text-brand-gold hover:border-brand-gold"
            }`}
            title="Home"
            id="nav-home-btn"
          >
            <Home className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => navigateTo("scouting")}
            className={`cursor-pointer w-10 h-10 rounded-lg p-1.5 flex items-center justify-center transition-colors ${
              activeTab === "scouting"
                ? "bg-emerald-500 text-black"
                : "bg-neutral-900 border border-neutral-800 text-emerald-400 hover:border-emerald-500"
            }`}
            title="Scouting Gare"
            id="nav-scouting-btn"
          >
            <Target className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => navigateTo("feed")}
            className={`cursor-pointer w-10 h-10 rounded-lg p-1.5 flex items-center justify-center transition-colors relative ${
              activeTab === "feed"
                ? "bg-amber-500 text-black"
                : "bg-neutral-900 border border-neutral-800 text-amber-400 hover:border-amber-500"
            }`}
            title="Alert & Daily Feed"
            id="nav-feed-btn"
          >
            <Bell className="w-5 h-5" />
            {dailyFeed && dailyFeed.totalAlerts > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
                {dailyFeed.totalAlerts > 9 ? "9+" : dailyFeed.totalAlerts}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsNavMenuOpen((open) => !open)}
            className="cursor-pointer w-full flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-brand-gold transition-all"
            aria-expanded={isNavMenuOpen}
            aria-haspopup="true"
            id="nav-menu-toggle"
            title="Menu navigazione"
          >
            <Menu className="w-4 h-4 text-brand-gold" />
            <ChevronDown
              className={`w-3 h-3 text-slate-400 transition-transform ${isNavMenuOpen ? "rotate-180" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLeftSidebarOpen(false);
              setIsNavMenuOpen(false);
            }}
            className="cursor-pointer w-full py-2 px-1 rounded-xl border border-neutral-800 bg-neutral-950 hover:border-brand-gold text-slate-500 hover:text-white transition-all"
            title="Nascondi barra sinistra"
            id="collapse-left-sidebar-btn"
          >
            <ChevronLeft className="w-4 h-4 mx-auto text-brand-gold" />
          </button>
          <span className="text-[7px] bg-neutral-900 border border-neutral-800 text-slate-500 px-1 py-0.5 rounded font-mono">
            V1.4
          </span>
        </div>

        {isNavMenuOpen && (
          <div
            className="absolute left-[72px] top-0 w-72 max-h-screen overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-r-2xl shadow-2xl shadow-black/60 scrollbar-thin"
            id="nav-menu-dropdown"
          >
            <div className="p-4 border-b border-neutral-800">
              <h1 className="font-extrabold text-xs tracking-wider text-white uppercase font-sans">
                Gara Master AI
              </h1>
              <span className="text-[9px] font-mono font-semibold text-brand-gold">
                D.LGS 36/2023 EDITION
              </span>
            </div>

            {user?.id && (
              <div className="px-3 pt-3">
                <TenderPortfolioScore
                  userId={user.id}
                  profilo={profilo}
                  tenders={allTenders}
                  compact
                />
              </div>
            )}

            <div className="p-3 space-y-4">
              <section>
                <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-2">
                  Interfaccia utente
                </h2>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] text-slate-300 marker:text-brand-gold">
                  <li>
                    <span className="text-slate-500">Modalità: </span>
                    <span className={isSimplifiedMode ? "text-emerald-400" : "text-purple-400"}>
                      {isSimplifiedMode ? "Segreteria" : "Sviluppatore"}
                    </span>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSimplifiedMode(!isSimplifiedMode);
                        if (isSimplifiedMode) setActiveTab("chat");
                      }}
                      className="cursor-pointer text-left hover:text-brand-gold transition-colors"
                    >
                      {isSimplifiedMode ? "Attiva vista sviluppatore" : "Attiva vista semplice"}
                    </button>
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-2">
                  Azioni rapide
                </h2>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] text-slate-300 marker:text-brand-gold">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        handleNewChat();
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer hover:text-brand-gold transition-colors font-semibold"
                    >
                      Nuova chat
                    </button>
                  </li>
                  <li className="list-none -ml-0 pl-0">
                    <div className="relative mt-1">
                      <Search className="w-3.5 h-3.5 text-brand-gold absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Cerca gara/chat..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black border border-neutral-800 pl-8 pr-2 py-1.5 rounded-lg text-[11px] focus:outline-hidden text-white placeholder-slate-550"
                      />
                    </div>
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-2">
                  Navigazione
                </h2>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] marker:text-brand-gold">
                  <li>
                    <button
                      type="button"
                      onClick={() => navigateTo("home")}
                      className={`cursor-pointer hover:text-brand-gold transition-colors flex items-center gap-1.5 ${
                        activeTab === "home" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      <Home className="w-3 h-3 text-brand-gold shrink-0" />
                      Home / Dashboard
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => navigateTo("scouting")}
                      className={`cursor-pointer hover:text-brand-gold transition-colors flex items-center gap-1.5 ${
                        activeTab === "scouting" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      <Target className="w-3 h-3 text-brand-gold shrink-0" />
                      Scouting Gare
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => navigateTo("feed")}
                      className={`cursor-pointer hover:text-brand-gold transition-colors flex items-center gap-1.5 ${
                        activeTab === "feed" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      <Bell className="w-3 h-3 text-brand-gold shrink-0" />
                      Alert &amp; Daily Feed
                      {dailyFeed && dailyFeed.totalAlerts > 0 && (
                        <span className="text-[9px] font-bold bg-brand-gold text-black px-1.5 rounded-full">
                          {dailyFeed.totalAlerts}
                        </span>
                      )}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => navigateTo("chat")}
                      className={`cursor-pointer hover:text-brand-gold transition-colors ${
                        activeTab === "chat" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      Chat conversazione
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => navigateTo("analyzer")}
                      className={`cursor-pointer hover:text-brand-gold transition-colors ${
                        activeTab === "analyzer" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      Libreria disciplinari
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => navigateTo("profile")}
                      className={`cursor-pointer hover:text-brand-gold transition-colors ${
                        activeTab === "profile" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      Profilo azienda
                    </button>
                  </li>
                  {!isSimplifiedMode && (
                    <>
                      <li>
                        <button
                          type="button"
                          onClick={() => navigateTo("mcp")}
                          className={`cursor-pointer hover:text-brand-gold transition-colors ${
                            activeTab === "mcp" ? "text-white font-bold" : "text-slate-300"
                          }`}
                        >
                          App &amp; connettori (MCP)
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => navigateTo("guide")}
                          className={`cursor-pointer hover:text-brand-gold transition-colors ${
                            activeTab === "guide" ? "text-white font-bold" : "text-slate-300"
                          }`}
                        >
                          Codex manuale (TS)
                        </button>
                      </li>
                    </>
                  )}
                </ul>
              </section>

              <section>
                <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-2">
                  App e integrazioni
                </h2>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] marker:text-brand-gold">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("analyzer");
                        setIsNavMenuOpen(false);
                      }}
                      className={`cursor-pointer hover:text-brand-gold transition-colors flex items-center gap-1.5 ${
                        activeTab === "analyzer" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      <FileText className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Analizzatore PDF
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("mcp");
                        setIsNavMenuOpen(false);
                      }}
                      className={`cursor-pointer hover:text-brand-gold transition-colors flex items-center gap-1.5 ${
                        activeTab === "mcp" ? "text-white font-bold" : "text-slate-300"
                      }`}
                    >
                      <Network className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Connettori MCP
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        openBidNoBidFlow();
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors flex items-center gap-1.5"
                    >
                      <Scale className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Bid / No-Bid Engine
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBidPricingOpen(true);
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors flex items-center gap-1.5"
                    >
                      <TrendingUp className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Bid Pricing Engine
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPrezzariManagerOpen(true);
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors flex items-center gap-1.5"
                    >
                      <FileText className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Gestisci Prezzari
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCapacityOpen(true);
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors flex items-center gap-1.5"
                    >
                      <Activity className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Capacity Engine
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfitabilityOpen(true);
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors flex items-center gap-1.5"
                    >
                      <BarChart3 className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Profitability Gate
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("chat");
                        setIsRibassoOpen(true);
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors flex items-center gap-1.5"
                    >
                      <Calculator className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Calcolo ribasso
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        handleSendMessage(
                          "Verifica se la mia impresa possiede i requisiti per partecipare tramite incrocio Supabase."
                        );
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors flex items-center gap-1.5"
                    >
                      <Database className="w-3 h-3 inline text-brand-gold shrink-0" />
                      Incrocio Supabase
                    </button>
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-2">
                  Sistemi AI integrati
                </h2>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] text-slate-300 marker:text-brand-gold">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        handleSendMessage("Come funziona questo LLM + MCP?");
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-left hover:text-brand-gold transition-colors truncate max-w-full"
                    >
                      Doc Maker AI: PDFs
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        handleSendMessage("Analizza bando Piccoli Passi");
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-left hover:text-brand-gold transition-colors truncate max-w-full"
                    >
                      ANAC Crawler Master
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        handleSendMessage(
                          "Spiegami concretamente come potrei implementare un sistema del genere strutturato ad agenti."
                        );
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer text-left hover:text-brand-gold transition-colors truncate max-w-full"
                    >
                      Supabase Gara Historian
                    </button>
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-2">
                  Progetti gara &amp; cartelle
                </h2>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] marker:text-brand-gold">
                  {filteredTenders.map((tender) => (
                    <li key={tender.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTender(tender);
                          addSession(createChatSession("tender", tender));
                          setIsNavMenuOpen(false);
                        }}
                        className={`cursor-pointer text-left hover:text-brand-gold transition-colors truncate max-w-[220px] ${
                          selectedTender.id === tender.id
                            ? "text-brand-gold font-bold"
                            : "text-slate-300"
                        }`}
                        title={tender.title}
                        id={`tender-sidebar-${tender.id}`}
                      >
                        {tender.title
                          .replace("Riqualificazione Energetica dell'", "")
                          .replace("Ampliamento Asse Viario e Sottoservizi - ", "")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartOfferPreparation(tender)}
                        className="cursor-pointer block text-[10px] text-emerald-400/90 hover:text-emerald-300 font-semibold pl-4"
                        id={`tender-prepare-offer-${tender.id}`}
                      >
                        Prepara offerta →
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="border-t border-neutral-800 pt-3" id="sidebar-bottom-controls">
                <h2 className="text-[9px] font-sans font-extrabold tracking-widest text-slate-500 uppercase mb-2">
                  Account &amp; sistema
                </h2>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] text-slate-300 marker:text-brand-gold">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(true);
                        setIsNavMenuOpen(false);
                      }}
                      className="cursor-pointer hover:text-brand-gold transition-colors font-semibold"
                      id="open-settings-bottom-btn"
                    >
                      Impostazioni sistema
                    </button>
                  </li>
                  <li>
                    <span className="text-white font-semibold">
                      {profilo?.ragioneSociale ?? "Utente GaraMaster"}
                    </span>
                    <span className="block text-[10px] text-slate-500 font-mono truncate">
                      {user?.email ?? "—"}
                    </span>
                  </li>
                  {supabaseConfigured && (
                    <li>
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="cursor-pointer hover:text-red-400 transition-colors flex items-center gap-1"
                      >
                        <LogOut className="w-3 h-3" />
                        Esci
                      </button>
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      onClick={() => setIsSysInfoOpen(!isSysInfoOpen)}
                      className="cursor-pointer hover:text-brand-gold transition-colors"
                    >
                      Info stabilità sistema
                    </button>
                  </li>
                </ul>
                {isSysInfoOpen && (
                  <ul className="mt-2 p-2 bg-black border border-neutral-800 rounded-lg text-[9.5px] text-slate-450 font-mono list-disc list-inside space-y-0.5 marker:text-brand-gold">
                    <li>PostgreSQL: OK</li>
                    <li>Local Dev: Port 3000</li>
                    <li>Model: {llmModel}</li>
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 2. MAIN APP CONTENT CONTAINER */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-black relative" id="gpt-main-panel">

        {!isLeftSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsLeftSidebarOpen(true)}
            className="absolute left-3 top-3 z-40 cursor-pointer p-2 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-brand-gold text-brand-gold shadow-lg transition-all"
            title="Mostra barra sinistra"
            id="expand-left-sidebar-btn"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        
        {/* Dynamic Inner Tab Switcher Display Area */}
        <div className="flex-1 overflow-hidden p-4 sm:p-5 flex flex-col">
          {activeTab === "home" && (
            <div className="h-full overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <HomeDashboard
                profilo={profilo}
                userEmail={user?.email}
                userId={user?.id}
                tenders={allTenders}
                selectedTender={selectedTender}
                chatSessionsCount={chatSessions.length}
                dailyFeed={dailyFeed}
                dailyFeedLoading={dailyFeedLoading}
                supabaseConfigured={supabaseConfigured}
                dataError={dataError}
                onNavigate={navigateTo}
                onSelectTender={handleSelectTenderFromPortfolio}
                onRefreshAll={() => void handleRefreshDashboard()}
                isRefreshing={dashboardRefreshing || dailyFeedLoading}
                engineShortcuts={engineShortcuts}
              />
            </div>
          )}

          {activeTab === "scouting" && (
            <div className="h-full overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <ScoutingGareApp
                userId={user?.id}
                profilo={profilo}
                onOpenInChat={(gareAnacId, cig) => void handleFeedSelectAnac(gareAnacId, cig)}
                onAfterSync={handleAfterAnacSync}
              />
            </div>
          )}

          {activeTab === "feed" && (
            <div className="h-full overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <AlertDailyFeed
                feed={dailyFeed}
                loading={dailyFeedLoading}
                error={dailyFeedError}
                onRefresh={() => {
                  if (user?.id) void refreshDailyFeed();
                  else void refreshData();
                }}
                onSelectGara={handleFeedSelectGara}
                onSelectAnac={handleFeedSelectAnac}
                onOpenOfferPrep={handleFeedOpenOfferPrep}
              />
            </div>
          )}

          {activeTab === "chat" && (
            <div className="flex h-full overflow-hidden gap-3 relative">
              <ChatSessionsSidebar
                sessions={chatSessions}
                activeSessionId={activeSessionId}
                onSelect={handleSelectSession}
                onNewGeneral={handleNewGeneralChat}
                onNewTender={handleNewTenderChat}
                onDelete={handleDeleteSession}
              />

              <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden gap-3">
                {user?.id && (
                  <TenderPortfolioScore
                    userId={user.id}
                    profilo={profilo}
                    tenders={allTenders}
                    compact
                  />
                )}
                {activeTender.id !== GENERAL_CHAT_TENDER.id && (
                  <div className="lg:hidden shrink-0">
                    <GaraRoiCalculator tender={activeTender} profilo={profilo} />
                  </div>
                )}
                <ChatWorkspace
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isGenerating={isGenerating}
                  onSelectTender={setSelectedTender}
                  selectedTender={activeTender}
                  chatMode={activeSession.mode}
                  setActiveTab={setActiveTab}
                  onAddPacket={handleAddPacket}
                  isRibassoOpen={isRibassoOpen}
                  setIsRibassoOpen={setIsRibassoOpen}
                  conversazioneSaveStatus={conversazioneSaveStatus}
                  conversazioneSaveError={conversazioneSaveError}
                  enabledConnectorIds={enabledConnectors}
                  onToggleConnector={handleToggleConnector}
                  onRunConnector={handleRunConnector}
                  offerPreparation={activeSession.offerPreparation}
                  onToggleOfferChecklistItem={handleToggleOfferChecklistItem}
                  profilo={profilo}
                  onOpenRtiAvvalimento={() => setIsRtiAvvalimentoOpen(true)}
                />
              </div>

              {!isRightSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsRightSidebarOpen(true)}
                  className="hidden lg:flex absolute right-3 top-3 z-40 cursor-pointer p-2 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-brand-gold text-brand-gold shadow-lg transition-all"
                  title="Mostra quadro gara"
                  id="expand-right-sidebar-btn"
                >
                  <PanelRightOpen className="w-4 h-4" />
                </button>
              )}

              {isRightSidebarOpen && (
              <motion.aside
                key={selectedTender.id}
                initial={{ opacity: 0, x: 30, filter: "blur(3px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="hidden lg:flex w-72 shrink-0 bg-black border border-neutral-800 rounded-2xl flex-col h-full overflow-hidden"
                id="chat-right-sidebar-summary"
              >
                <div className="p-4 border-b border-neutral-800 flex items-start justify-between gap-2 shrink-0">
                  <div className="min-w-0 space-y-1">
                    <span className="text-[10px] font-sans font-extrabold tracking-wider text-slate-550 uppercase block">
                      Quadro gara corrente
                    </span>
                    <h3 className="font-sans font-extrabold text-sm text-white line-clamp-2" title={selectedTender.title}>
                      {selectedTender.title}
                    </h3>
                    <div className="text-[10px] text-slate-400 font-mono flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="bg-neutral-900 text-white px-1.5 py-0.5 rounded border border-neutral-800">
                        CIG {selectedTender.cig}
                      </span>
                      <span className="bg-neutral-900 text-brand-gold px-1.5 py-0.5 rounded border border-neutral-800 font-bold">
                        {selectedTender.value}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRightSidebarOpen(false)}
                    className="cursor-pointer p-1.5 rounded-lg border border-neutral-800 bg-neutral-950 hover:border-brand-gold shrink-0"
                    title="Nascondi barra destra"
                    id="collapse-right-sidebar-btn"
                  >
                    <ChevronRight className="w-4 h-4 text-brand-gold" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin space-y-3">
                  <GaraRoiCalculator tender={activeTender} profilo={profilo} sidebar />

                  {visiblePatternAlerts.length > 0 && (
                    <div className="space-y-2" id="pattern-alerts-panel">
                      {visiblePatternAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`border rounded-lg p-3 text-[10px] ${
                            alert.severity === "ALTA"
                              ? "bg-red-950/30 border-red-900 text-red-300"
                              : alert.severity === "MEDIA"
                                ? "bg-amber-950/30 border-amber-900 text-amber-300"
                                : "bg-blue-950/30 border-blue-900 text-blue-300"
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <span className="font-bold leading-snug">{alert.titolo}</span>
                            {alert.dismissible && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDismissedAlertIds((prev) => [...prev, alert.id])
                                }
                                className="cursor-pointer text-xs opacity-50 hover:opacity-100 shrink-0"
                                aria-label="Chiudi alert"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <p className="mb-2 leading-relaxed text-[9px] opacity-90">
                            {alert.descrizione}
                          </p>
                          {alert.actionLabel && (
                            <button
                              type="button"
                              onClick={() => handlePatternAlertAction(alert)}
                              className="cursor-pointer text-xs font-bold underline hover:no-underline"
                            >
                              {alert.actionLabel}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <SidebarDropdownSection
                    title="Requisiti analizzati"
                    badge={
                      <span className="text-[9px] font-mono font-bold text-brand-gold">
                        {selectedTender.requirements.filter((r) => r.satisfied).length}/
                        {selectedTender.requirements.length}
                      </span>
                    }
                    isOpen={rightOpenSections.requisiti}
                    onToggle={() => toggleRightSection("requisiti")}
                  >
                    <ul className="list-disc list-inside space-y-2 text-[11px] text-slate-300 marker:text-brand-gold max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                      {selectedTender.requirements.map((req, idx) => (
                        <li key={idx} className="leading-snug">
                          <span className="text-[8.5px] uppercase font-mono font-bold text-brand-gold">
                            {req.category}
                          </span>
                          <span className="block font-bold text-white mt-0.5">{req.description}</span>
                          <span className="block text-[10px] text-slate-400 italic mt-0.5">{req.details}</span>
                        </li>
                      ))}
                    </ul>
                  </SidebarDropdownSection>

                  <SidebarDropdownSection
                    title="Penali identificate"
                    badge={
                      <span className="bg-red-950/40 text-red-400 text-[8px] font-sans font-bold px-1.5 py-0.5 rounded border border-red-900/50">
                        Rischio
                      </span>
                    }
                    isOpen={rightOpenSections.penali}
                    onToggle={() => toggleRightSection("penali")}
                  >
                    {selectedTender.penalties && selectedTender.penalties.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1.5 text-[10.5px] text-slate-300 marker:text-brand-gold max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                        {selectedTender.penalties.map((pen, idx) => (
                          <li key={idx}>{pen}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic pl-4">
                        Nessuna penale identificata per questo bando.
                      </p>
                    )}
                  </SidebarDropdownSection>

                  <SidebarDropdownSection
                    title="Anomalie di gara"
                    badge={
                      <span className="bg-amber-950/40 text-amber-400 text-[8px] font-sans font-bold px-1.5 py-0.5 rounded border border-amber-900/50">
                        Alert
                      </span>
                    }
                    isOpen={rightOpenSections.anomalie}
                    onToggle={() => toggleRightSection("anomalie")}
                  >
                    {selectedTender.anomalies && selectedTender.anomalies.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1.5 text-[10.5px] text-slate-300 marker:text-amber-500 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                        {selectedTender.anomalies.map((anom, idx) => (
                          <li key={idx}>{anom}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic pl-4">
                        Nessuna anomalia identificata per questo bando.
                      </p>
                    )}
                  </SidebarDropdownSection>

                  <SidebarDropdownSection
                    title="Azioni rapide"
                    isOpen={rightOpenSections.azioni}
                    onToggle={() => toggleRightSection("azioni")}
                  >
                    <ul className="list-disc list-inside space-y-2 text-[11px] marker:text-brand-gold">
                      <li>
                        <button
                          type="button"
                          onClick={() => handleStartOfferPreparation(selectedTender)}
                          className="cursor-pointer text-emerald-400 hover:text-emerald-300 font-bold transition-colors text-left flex items-center gap-1.5"
                          id="prepare-offer-sidebar-btn"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          Prepara offerta (guidata)
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsRtiAvvalimentoOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="rti-avvalimento-sidebar-btn"
                        >
                          <Users className="w-3 h-3 text-brand-gold shrink-0" />
                          RTI &amp; Avvalimento Configurator
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsVessatorieOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left"
                          id="vessatorie-analysis-sidebar-btn"
                        >
                          Rileva clausole vessatorie
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsWinningPatternOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="winning-pattern-sidebar-btn"
                        >
                          <Target className="w-3 h-3 text-brand-gold shrink-0" />
                          Pattern vincenti ({winningPatterns.length})
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsAwardAnalyzerOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="award-criteria-sidebar-btn"
                        >
                          <ListChecks className="w-3 h-3 text-brand-gold shrink-0" />
                          Analizza criteri (reverse map)
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsMarketIntelligenceOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="market-intelligence-sidebar-btn"
                        >
                          <BarChart3 className="w-3 h-3 text-brand-gold shrink-0" />
                          Market Intelligence
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsRiskComplianceOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="risk-compliance-sidebar-btn"
                        >
                          <AlertTriangle className="w-3 h-3 text-brand-gold shrink-0" />
                          Risk &amp; Compliance
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setShowCAMChecker(true)}
                          className="cursor-pointer text-slate-300 hover:text-emerald-400 transition-colors text-left flex items-center gap-1.5"
                          id="cam-compliance-sidebar-btn"
                        >
                          <Leaf className="w-3 h-3 text-emerald-400 shrink-0" />
                          CAM Compliance
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setShowDelayAnalyzer(true)}
                          className="cursor-pointer text-slate-300 hover:text-amber-400 transition-colors text-left flex items-center gap-1.5"
                          id="delay-penalty-sidebar-btn"
                        >
                          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                          Delay &amp; Penalty
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setShowVariantsAnalyzer(true)}
                          className="cursor-pointer text-slate-300 hover:text-orange-400 transition-colors text-left flex items-center gap-1.5"
                          id="variant-claims-sidebar-btn"
                        >
                          <Zap className="w-3 h-3 text-orange-400 shrink-0" />
                          Variants &amp; Claims
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setShowAuditGate(true)}
                          className="cursor-pointer text-slate-300 hover:text-blue-400 transition-colors text-left flex items-center gap-1.5"
                          id="presubmission-audit-sidebar-btn"
                        >
                          <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
                          Pre-Submission Audit
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsQualificationHubOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-blue-400 transition-colors text-left flex items-center gap-1.5"
                          id="qualification-hub-sidebar-btn"
                        >
                          <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
                          Qualification Hub
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={openBidNoBidFlow}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="bid-no-bid-sidebar-btn"
                        >
                          <Scale className="w-3 h-3 text-brand-gold shrink-0" />
                          Bid / No-Bid Engine
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsBidPricingOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="bid-pricing-sidebar-btn"
                        >
                          <TrendingUp className="w-3 h-3 text-brand-gold shrink-0" />
                          Bid Pricing Engine
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsCapacityOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="capacity-engine-sidebar-btn"
                        >
                          <Activity className="w-3 h-3 text-brand-gold shrink-0" />
                          Capacity Engine
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setIsProfitabilityOpen(true)}
                          className="cursor-pointer text-slate-300 hover:text-brand-gold transition-colors text-left flex items-center gap-1.5"
                          id="profitability-gate-sidebar-btn"
                        >
                          <BarChart3 className="w-3 h-3 text-brand-gold shrink-0" />
                          Profitability Gate
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={handleExportReport}
                          className="cursor-pointer text-brand-gold hover:text-yellow-400 font-semibold transition-colors text-left"
                          id="export-report-sidebar-btn"
                        >
                          Esporta report gara
                        </button>
                      </li>
                    </ul>
                  </SidebarDropdownSection>
                </div>

                <p className="shrink-0 px-4 pb-4 text-[10px] text-slate-500 font-sans leading-relaxed text-center border-t border-neutral-800 pt-3">
                  L&apos;analisi di penali e anomalie tutela l&apos;impresa dal rischio contrattuale (D.Lgs. 36/2023).
                </p>
              </motion.aside>
              )}

            </div>
          )}

          {activeTab === "analyzer" && (
            <div className="h-full overflow-y-auto p-2">
              <div className="mb-4 bg-black border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-brand-gold" />
                    Libreria Contratti & Analizzatore PDF OCR
                  </h2>
                  <p className="text-xs text-slate-400">Verifica la compatibilità dei disciplinari estratti semantici o carica file locali</p>
                </div>
                <button
                  onClick={() => setActiveTab("chat")}
                  className="cursor-pointer bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  Torna alla Chat
                </button>
              </div>

              <DocumentAnalyzer
                selectedTender={selectedTender}
                onSelectTender={setSelectedTender}
                onAddCustomTender={handleAddCustomTender}
                userId={user?.id}
                profilo={profilo}
                supabaseConfigured={supabaseConfigured}
                catalogTenders={allTenders}
                onGaraSaved={async (tender) => {
                  setSelectedTender(tender);
                  await refreshData();
                }}
              />
            </div>
          )}

          {activeTab === "mcp" && (
            <div className="h-full overflow-y-auto p-2">
              <div className="mb-4 bg-black border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase flex items-center gap-1.5">
                    <Network className="w-4 h-4 text-brand-gold" />
                    Orchestratore di Server MCP (Model Context Protocol)
                  </h2>
                  <p className="text-xs text-slate-400">Ispeziona gli schemi json, i connettori legali ANAC e i log di comunicazione del protocollo</p>
                </div>
                <button
                  onClick={() => setActiveTab("chat")}
                  className="cursor-pointer bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  Torna alla Chat
                </button>
              </div>

              <McpHub
                servers={servers}
                onToggleServer={handleToggleServer}
                packets={packets}
                onClearPackets={handleClearPackets}
                onAddPacket={handleAddPacket}
              />
            </div>
          )}

          {activeTab === "guide" && (
            <div className="h-full overflow-y-auto p-2">
              <div className="mb-4 bg-black border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-brand-gold" />
                    Manuale d'Integrazione & Architettura di Sistema
                  </h2>
                  <p className="text-xs text-slate-400">Database Schema relazionali per Supabase, codice sorgente di riferimento TypeScript per SDK MCP</p>
                </div>
                <button
                  onClick={() => setActiveTab("chat")}
                  className="cursor-pointer bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  Torna alla Chat
                </button>
              </div>

              <DeveloperGuide />
            </div>
          )}

          {activeTab === "profile" && (
            <div className="h-full overflow-y-auto p-2">
              {user?.id && (
                <div className="mb-4">
                  <TenderPortfolioScore
                    userId={user.id}
                    profilo={profilo}
                    tenders={allTenders}
                    onSelectTender={handleSelectTenderFromPortfolio}
                  />
                </div>
              )}

              <div className="mb-4 bg-black border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-brand-gold" />
                    Profilo Azienda & Qualificazioni SOA
                  </h2>
                  <p className="text-xs text-slate-400">Anagrafica impresa, categorie SOA, aree operative e dati economici</p>
                </div>
                <button
                  onClick={() => setActiveTab("chat")}
                  className="cursor-pointer bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  Torna alla Chat
                </button>
              </div>

              {user?.id && (
                <div className="mb-4 space-y-4">
                  <SoaGapForecastPanel
                    userId={user.id}
                    profilo={profilo}
                    tenders={allTenders}
                  />
                  <HistoricalKnowledgePanel userId={user.id} profilo={profilo} />
                </div>
              )}

              <CompanyProfileComponent />
            </div>
          )}
        </div>

      </main>

      {/* 3. SETTINGS MODAL (Enterprise Settings in lower area of screen "in basso le impostazioni") */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-black border border-neutral-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-fade-in text-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand-gold" />
                <h3 className="font-extrabold font-sans text-sm tracking-wider uppercase text-white">
                  IMPOSTAZIONI GARA MASTER ENTERPRISE
                </h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-500 hover:text-white transition-colors cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Configura i segreti delle chiamate e delle interrogazioni per gli agenti AI di Gara Master del consorzio o impresa.
            </p>

            <div className="space-y-4">
              {/* Option 1: IA Model selection */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-sans font-extrabold tracking-wider uppercase text-slate-450">
                  Modello Generativo Principale (LLM)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLlmModel("Gemini 3.5 Flash")}
                    className={`p-2.5 rounded-lg border text-xs font-bold text-center cursor-pointer transition-all ${
                      llmModel === "Gemini 3.5 Flash"
                        ? "bg-brand-gold border-brand-gold text-black"
                        : "bg-neutral-900 border-neutral-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Gemini 3.5 Flash
                  </button>
                  <button
                    type="button"
                    onClick={() => setLlmModel("Claude 3.5 Sonnet")}
                    className={`p-2.5 rounded-lg border text-xs font-bold text-center cursor-pointer transition-all ${
                      llmModel === "Claude 3.5 Sonnet"
                        ? "bg-brand-gold border-brand-gold text-black"
                        : "bg-neutral-900 border-neutral-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Claude 3.5 Sonnet
                  </button>
                </div>
              </div>

              {/* Option 2: Supabase connection status */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-sans font-extrabold tracking-wider uppercase text-slate-450">
                  Stato Database Storico Gare (Supabase)
                </label>
                <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-brand-gold" />
                    <span className="text-slate-300">postgresql://gara-master:***@supabase.co</span>
                  </div>
                  <span className="bg-neutral-900 text-brand-gold px-1.5 py-0.5 rounded text-[10px] uppercase font-sans font-bold border border-neutral-800">
                    DIREZIONE OK
                  </span>
                </div>
              </div>

              {/* Option 3: Custom API simulated keys */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-sans font-extrabold tracking-wider uppercase text-slate-455">
                  GaraMaster API Key di Sicurezza (Garantisce ispezioni legali)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-brand-gold absolute left-3 top-3" />
                  <input
                    type="text"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 py-2.5 pl-9 pr-3 rounded-lg text-xs font-mono focus:border-brand-gold focus:outline-hidden text-white"
                  />
                </div>
              </div>

              {/* Option 4: Connettori active status list */}
              <div className="space-y-1.5 pt-1">
                <span className="block text-[10px] font-sans font-extrabold tracking-wider uppercase text-slate-450">
                  Servizi MCP Abilitati nel Flusso
                </span>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-gold"></span>
                    <span>ANAC Tender API</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-gold"></span>
                    <span>PDF OCR Spec Clarifier</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                     <span className="w-2 h-2 rounded-full bg-brand-gold"></span>
                    <span>BIM & CAM generator</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse"></span>
                    <span>Supabase Historian</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom save */}
            <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="cursor-pointer bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors border border-neutral-800"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                }}
                className="cursor-pointer bg-brand-gold hover:bg-yellow-400 text-black text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Salva Modifiche
              </button>
            </div>
          </div>
        </div>
      )}

      <RtiAvvalimentoConfigurator
        tender={activeTender}
        profilo={profilo}
        isOpen={isRtiAvvalimentoOpen}
        onClose={() => setIsRtiAvvalimentoOpen(false)}
      />

      {isWinningPatternOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-black border border-neutral-800 rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
              <span className="text-xs font-extrabold tracking-widest uppercase text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-brand-gold" />
                Winning Pattern Engine
              </span>
              <button
                type="button"
                onClick={() => setIsWinningPatternOpen(false)}
                className="cursor-pointer text-slate-500 hover:text-white text-lg font-bold"
                aria-label="Chiudi"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto scrollbar-thin">
              <WinningPatternViewer
                patterns={winningPatterns}
                similarityScores={matchGaraToPatterns(selectedTender, winningPatterns)}
                isLoading={isAnalyzingPatterns}
              />
            </div>
          </div>
        </div>
      )}

      {isBidNoBidOpen && selectedTender && (
        <>
          {!qualificationVerdict ? (
            <QualificationReadinessHub
              isOpen
              gateMode
              onClose={() => setIsBidNoBidOpen(false)}
              onQualificationCheck={(verdict) => setQualificationVerdict(verdict)}
              tender={selectedTender}
              companyProfile={companyProfile}
            />
          ) : (
            <BidNoBidEngine
              tender={selectedTender}
              isOpen
              onClose={() => setIsBidNoBidOpen(false)}
              winningPatterns={winningPatterns}
              isAnalyzingPatterns={isAnalyzingPatterns}
              companyProfile={companyProfile}
              onShowCAM={() => setShowCAMChecker(true)}
              onShowDelayAnalysis={() => setShowDelayAnalyzer(true)}
              onShowVariantsAnalysis={() => setShowVariantsAnalyzer(true)}
              onShowAudit={() => setShowAuditGate(true)}
            />
          )}

          <CAMComplianceChecker
            isOpen={showCAMChecker}
            onClose={() => setShowCAMChecker(false)}
            tender={selectedTender}
          />

          <DelayPenaltyExposureAnalyzer
            isOpen={showDelayAnalyzer}
            onClose={() => setShowDelayAnalyzer(false)}
            tender={selectedTender}
            companyProfile={companyProfile}
          />

          <VariantClaimsRiskAnalyzer
            isOpen={showVariantsAnalyzer}
            onClose={() => setShowVariantsAnalyzer(false)}
            tender={selectedTender}
            companyProfile={companyProfile}
          />

          <PreSubmissionComplianceAudit
            isOpen={showAuditGate}
            onClose={() => setShowAuditGate(false)}
            onReadyToSubmit={() => setAuditPassed(true)}
            tender={selectedTender}
            companyProfile={companyProfile}
          />
        </>
      )}

      <PrezzariManager
        prezzari={prezzari}
        onSavePrezzari={savePrezzari}
        isOpen={isPrezzariManagerOpen}
        onClose={() => setIsPrezzariManagerOpen(false)}
      />

      <BidPricingEngine
        tender={selectedTender}
        isOpen={isBidPricingOpen}
        onClose={() => setIsBidPricingOpen(false)}
        prezzari={prezzari}
        prezzarioSelezionato={companyProfile?.prezzarioPreferito}
        onPrezzarioChange={savePrezzarioPreferito}
        computoMetrico={buildComputoFromTender(selectedTender)}
        onCollegamentiComputo={setComputoCollegamenti}
      />

      <CapacitySaturationEngine
        tender={selectedTender}
        isOpen={isCapacityOpen}
        onClose={() => setIsCapacityOpen(false)}
      />

      <ProfitabilityGate
        tender={selectedTender}
        isOpen={isProfitabilityOpen}
        onClose={() => setIsProfitabilityOpen(false)}
        prezzari={prezzari}
      />

      {/* Deep D.Lgs. 36/2023 Vessatorie/Abusive Rules protective shield */}
      <VessatorieModal
        isOpen={isVessatorieOpen}
        onClose={() => setIsVessatorieOpen(false)}
        tender={selectedTender}
        onInjectClarification={(text) => handleSendMessage(text)}
      />

      <AwardCriteriaAnalyzer
        isOpen={isAwardAnalyzerOpen}
        onClose={() => setIsAwardAnalyzerOpen(false)}
        tender={selectedTender}
      />

      <MarketIntelligenceDashboard
        isOpen={isMarketIntelligenceOpen}
        onClose={() => setIsMarketIntelligenceOpen(false)}
        allTenders={allTenders}
        selectedTender={selectedTender}
        historicalData={historicalGareData}
        yourWinRatePercent={companyProfile?.avgWinRatePercent}
      />

      <RiskComplianceProfiler
        isOpen={isRiskComplianceOpen}
        onClose={() => setIsRiskComplianceOpen(false)}
        tender={selectedTender}
      />

      {selectedTender && !isBidNoBidOpen && (
        <QualificationReadinessHub
          isOpen={isQualificationHubOpen}
          onClose={() => setIsQualificationHubOpen(false)}
          onQualificationCheck={(verdict) => setQualificationVerdict(verdict)}
          tender={selectedTender}
          companyProfile={companyProfile}
        />
      )}

    </div>
  );
}
