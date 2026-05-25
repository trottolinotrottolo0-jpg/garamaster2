import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { Message, McpServer, PacketLog, TenderDocument, ChatAttachment } from "./types";
import { initialMcpServers, mockTenders } from "./mockData";
import { McpHub } from "./components/McpHub";
import { ChatWorkspace } from "./components/ChatWorkspace";
import { DocumentAnalyzer } from "./components/DocumentAnalyzer";
import { DeveloperGuide } from "./components/DeveloperGuide";
import { CompanyProfile } from "./components/CompanyProfile";
import { VessatorieModal } from "./components/VessatorieModal";
import { 
  Cpu, Layers, Network, BookOpen, MessageSquare, ShieldCheck, Info, Plus, Search, Sliders, LogOut, Settings, 
  Sparkles, HelpCircle, Briefcase, User, Database, ShieldAlert, Key, Download,
  Menu, ChevronDown, ChevronLeft, ChevronRight, PanelLeftOpen, PanelRightOpen,
  FileText, Calculator
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"chat" | "analyzer" | "mcp" | "guide" | "profile">("chat");
  const [servers, setServers] = useState<McpServer[]>(initialMcpServers);
  const [selectedTender, setSelectedTender] = useState<TenderDocument>(mockTenders[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [packets, setPackets] = useState<PacketLog[]>([]);
  const [isSimplifiedMode, setIsSimplifiedMode] = useState<boolean>(true);
  const [isVessatorieOpen, setIsVessatorieOpen] = useState<boolean>(false);
  
  // Custom states for settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSysInfoOpen, setIsSysInfoOpen] = useState(false);
  const [llmModel, setLlmModel] = useState<string>("Gemini 3.5 Flash");
  const [supabaseStatus, setSupabaseStatus] = useState<string>("Connesso (Classe III/IV logic)");
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
    if (!isNavMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (navMenuRef.current && !navMenuRef.current.contains(e.target as Node)) {
        setIsNavMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNavMenuOpen]);

  // Initial welcome message
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Salve! Sono l'assistente AI di Gara Master. \n\nPosso aiutarti a navigare i disciplinari, estrarre requisiti SOA, rilevare clausole di penali complesse, verificare la compatibilità della tua impresa (tramite i dati archiviati su Supabase) ed abbozzare proposte tecniche vincitrici.\n\nScegli uno dei comandi rapidi qui sotto oppure parlami direttamente come se fossi Claude o ChatGPT!",
      timestamp: new Date(),
    },
  ]);

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
    mockTenders.push(newTender);
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

  // Resets the chat messages to welcome state
  const handleNewChat = () => {
    setMessages([
      {
        id: "welcome",
        sender: "assistant",
        text: `Nuova sessione avviata per la gara: ${selectedTender.title}.\n\nChiedimi di estrarre e sintetizzare i requisiti di qualificazione SOA, analizzare le penali o generare l'offerta tecnica basandoti sui CAM.`,
        timestamp: new Date(),
      }
    ]);
    setActiveTab("chat");
  };

  const handleSendMessage = (
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
    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);

    if (overrideTargetTender) {
      const match = mockTenders.find((t) => t.id === overrideTargetTender);
      if (match) setSelectedTender(match);
    }

    if (hasAttachments && attachments!.some((a) => a.name.toLowerCase().endsWith(".pdf"))) {
      setActiveTab("analyzer");
    }

    setTimeout(() => {
      let replyText = "";
      let toolName = "";
      let toolParams: any = {};
      let toolResult: any = null;

      const lowerText = displayText.toLowerCase();

      if (hasAttachments) {
        const names = attachments!.map((a) => a.name).join(", ");
        const hasPdf = attachments!.some((a) => a.name.toLowerCase().endsWith(".pdf"));
        replyText = `Ho ricevuto ${attachments!.length} allegato/i dal tuo PC: **${names}**.\n\n`;
        if (hasPdf) {
          replyText +=
            "Sto instradando il PDF all'**Analizzatore Disciplinare** per l'estrazione OCR dei requisiti SOA, penali e criteri di aggiudicazione (simulazione locale).\n\n";
          toolName = "analizza_disciplinare_pdf";
          toolParams = { files: attachments!.map((a) => ({ name: a.name, size: a.size })) };
          toolResult =
            "Estrazione completata: 4 requisiti qualificazione, 2 penali, 1 anomalia cronoprogramma rilevata.";
        } else {
          replyText +=
            "I file sono associati alla sessione corrente. Posso incrociarli con i dati Supabase o usarli per la redazione dell'offerta tecnica.";
        }
      } else if (lowerText.includes("scuola") || lowerText.includes("piccoli passi")) {
        toolName = "dettagli_bando_cig";
        toolParams = { cig: "9874563A2B" };
        toolResult = "Report: Ente Appaltante: Città Metropolitana. Valore: €1.250.000,00. SOA Prevalente: OG1 Class II. Criterio OEPV (70 punti Tecnica, 30 Economica).";

        // Log Packet
        const p1: PacketLog = {
          id: `p-${Date.now()}-1`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "host-to-server",
          service: "ANAC & TED Connector",
          payload: { jsonrpc: "2.0", method: "tools/call", params: { name: "dettagli_bando_cig", arguments: toolParams }, id: "req-scuola" }
        };
        const p2: PacketLog = {
          id: `p-${Date.now()}-2`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "server-to-host",
          service: "ANAC & TED Connector",
          payload: { jsonrpc: "2.0", result: { content: [{ type: "text", text: toolResult }] }, id: "req-scuola" }
        };
        setPackets((prev) => [...prev, p1, p2]);

        replyText = `### Analisi Gara Scuola Roma 'Piccoli Passi' (CIG: 9874563A2B)\n\nIn base al disciplinare estratto e alle regole del **D.Lgs. 36/2023 (Nuovo Codice dei Contratti)**, ecco il quadro emerso:\n\n* **Requisito d'Accesso SOA (OG1 II):** L'impresa ha la categoria **OG1 Class III** su Supabase, quindi è pienamente abilitata ad accedere alla gara.\n* **Fatturato Triennale Minimo (€2.000.000,00):** Vi è un **BLOCCANTE**. Lo storico finanziario registrato su Supabase indica che l'impresa ha un fatturato nel triennio di €1.650.000,00 (mancano €350k).\n  * **Soluzione Legale:** È necessario ricorrere all'**Avvalimento** per il requisito carente di fatturato, oppure partecipare mediante **RTI (Raggruppamento Temporaneo d'Imprese)** con un partner idoneo.\n\n* **Criticità / Red Flags Individuate:**\n  1. Il requisito del fatturato specifico richiesto (€2M) appare palesemente **sproporzionato** per un appalto da €1.25M (Art. 10 del Codice sulla massimizzazione della concorrenza).\n  2. Il capitolato speciale prevede l'installazione degli infissi in sole 3 settimane ad agosto. Si raccomanda di sollevare un quesito ufficiale (chiarimenti).\n\n*Clicca sul pulsante in basso per aprire la scheda bando dettagliata ed analizzare le penali.*`;
      } 
      else if (lowerText.includes("sicurezza") || lowerText.includes("cam") || lowerText.includes("roma")) {
        toolName = "bozza_criterio_offerta";
        toolParams = {
          titolo_criterio: "Riduzione Impatto Ambientale / CAM",
          punti_massimi: 15,
          capitolato_richieste: "Materiali provvisti di etichetta ecologica Tipo I, riduzione CO2 dei trasporti"
        };
        toolResult = "### Proposta Tecnica Criterio C: Sostenibilità...\n- Materiali accreditati CAM.";

        const p1: PacketLog = {
          id: `p-${Date.now()}-3`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "host-to-server",
          service: "technical-proposal-generator",
          payload: { jsonrpc: "2.0", method: "tools/call", params: { name: "bozza_criterio_offerta", arguments: toolParams }, id: "req-proposal" }
        };
        const p2: PacketLog = {
          id: `p-${Date.now()}-4`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "server-to-host",
          service: "technical-proposal-generator",
          payload: { jsonrpc: "2.0", result: { content: [{ type: "text", text: toolResult }] }, id: "req-proposal" }
        };
        setPackets((prev) => [...prev, p1, p2]);

        replyText = `### Bozza per Criterio C: Riduzione Impatto Ambientale (Punteggio Max: 15 Punti)\nGenerata incrociando i requisiti del capitolato con le soluzioni tecniche sostenibili approvate:\n\n#### C.1 Impiego di Materiali provvisti di Certificazione Ecologica (CAM)\nLa scrivente impresa si impegna formalmente a garantire l'approvvigionamento del **100% dei materiali isolanti termoacustici** conformi al paragrafo 2.4.2.9 dei Criteri Ambientali Minimi (CAM). In particolare:\n- **Poliuretano espanso e lane minerali:** provvisti di dichiarazione EPD (Environmental Product Declaration) di Tipo III rilasciata da ente indipendente.\n- **Legname strutturale:** certificato FSC o PEFC tracciabile lungo tutta la filiera.\n\n#### C.2 Ottimizzazione dei Trasporti e Logistica a Km Zero\nAl fine di ridurre l'impronta di carbonio (carbon footprint) derivante dai cicli di trasporto, l'impresa stabilirà la centrale di conferimento macerie ed il fornitore di calcestruzzo primario in un raggio inferiore a **15 km dal cantiere di Roma**.\n- Sarò predisposta una piattaforma software per il calcolo e monitoraggio mensile delle emissioni equivalenti di CO2 dovute ai trasporti.`;
      } 
      else if (lowerText.includes("soa") || lowerText.includes("bologna") || lowerText.includes("og3")) {
        toolName = "verifica_requisiti_impresa";
        toolParams = { cig_gara: "A045B899C5" };
        toolResult = "Report SP12: SOA OG3 Classifica IV richiesta. Posseduto: OG3 Classifica III -> CARENTE DI CLASSIFICA.";

        const p1: PacketLog = {
          id: `p-${Date.now()}-5`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "host-to-server",
          service: "Supabase Gara Historian",
          payload: { jsonrpc: "2.0", method: "tools/call", params: { name: "verifica_requisiti_impresa", arguments: toolParams }, id: "req-requisiti-sp12" }
        };
        const p2: PacketLog = {
          id: `p-${Date.now()}-6`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "server-to-host",
          service: "Supabase Gara Historian",
          payload: { jsonrpc: "2.0", result: { content: [{ type: "text", text: toolResult }] }, id: "req-requisiti-sp12" }
        };
        setPackets((prev) => [...prev, p1, p2]);

        replyText = `### Verifica Requisiti: Gara SP12 Bologna (Ampliamento Viario - Valore: €3.8M)\nIl nostro database Supabase indica che la tua impresa ha **OG3 Classifica III** (fino a €1.033.000). Il bando richiede **OG3 Classifica IV** (fino a €2.582.000). Abbiamo una carenza di classifica.\n\n#### Strategia D'Appalto Consigliata in base al D.Lgs. 36/2023:\n\n1. **AVVALIMENTO TECNICO-OPERATIVO (Art. 104):** Puoi stipulare un contratto di avvalimento con un'impresa ausiliaria che possiede l'attestazione OG3 Classifica IV o superiore. L'ausiliaria 'presterà' il proprio requisito a fronte di un corrispettivo ed un visualizzazione cantiere.\n2. **RTI ORIZZONTALE (Costituzione Associazione Temporanea):** Puoi aggregarti con un'altra impresa stradale in grado di coprire la percentuale mancante. L'impresa principale (capogruppo) deve possedere almeno il 40% dei requisiti cumulati, e la mandante almeno il 10%.\n3. **SUBAPPALTO QUALIFICANTE (Art. 119):** Questa opzione è praticabile solo nel caso in cui la tua qualifica copra la quota residua, potendo subappaltare l'eccedenza di esecuzione a un operatore partner prescelto.`;
      } 
      else {
        // General text reply
        toolName = "recupera_esperienze_simili";
        toolParams = { categoria_soa: "OG1" };
        toolResult = "Nessun bando specifico specificato. Estrazione relazioni generiche OG1 dal database.";

        replyText = `Ho compreso la tua richiesta! \n\nPer un'applicazione d'appalto avanzata come "Gara Master", l'integrazione di un LLM con **MCP (Model Context Protocol)** ti permette di richiamare in tempo reale i connettori legali. \n\nCosa vorresti simulare ora?\n\n1. Digita **"Analizza bando Piccoli Passi"** per simulare l'estrazione semantica di un disciplinare.\n2. Digita **"requisiti Bologna"** per vedere come l'agente rileva la mancanza della SOA OG3 e propone la soluzione legale.\n3. Digita **"Crea bozza per Criterio Sicurezza"** per redigere l'offerta tecnica basandoti sui CAM.\n\n*Puoi anche esplorare la scheda **"Connettori MCP"** nel menu a sinistra per lanciare singolarmente i tool e ispezionare i record JSON, oppure leggere la scheda **"Guida Sviluppatore"** con gli schemi SQL per Supabase.*`;
      }

      const assistantMsg: Message = {
        id: `msg-agent-${Date.now()}`,
        sender: "assistant",
        text: replyText,
        timestamp: new Date(),
        toolUsage: toolName ? {
          toolName,
          params: toolParams,
          result: toolResult,
        } : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsGenerating(false);

      // Add a system log matching LLM reasoning output
      const llmLog: PacketLog = {
        id: `llm-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        direction: "host-to-llm",
        service: "Gemini Model reasoning",
        payload: {
          prompt: text,
          reasoning_steps: [
            "Analisi token di input in lingua italiana",
            toolName ? `Intercettazione keyword: Generazione chiamata MCP a '${toolName}'` : "Nessun trigger tool, esecuzione risposta di default generica",
            "Sintesi risposta combinata con riferimenti a Codice Contratti Pubblici D.Lgs. 36/2023"
          ],
        },
      };
      setPackets((prev) => [...prev, llmLog]);
    }, 1200);
  };

  const filteredTenders = mockTenders.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.cig.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <div className="w-10 h-10 rounded-lg bg-brand-gold p-1.5 flex items-center justify-center font-bold text-black shadow-md text-sm">
            GM
          </div>
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
                      onClick={() => {
                        setActiveTab("chat");
                        setIsNavMenuOpen(false);
                      }}
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
                      onClick={() => {
                        setActiveTab("analyzer");
                        setIsNavMenuOpen(false);
                      }}
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
                      onClick={() => {
                        setActiveTab("profile");
                        setIsNavMenuOpen(false);
                      }}
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
                          onClick={() => {
                            setActiveTab("mcp");
                            setIsNavMenuOpen(false);
                          }}
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
                          onClick={() => {
                            setActiveTab("guide");
                            setIsNavMenuOpen(false);
                          }}
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
                    <li key={tender.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTender(tender);
                          handleNewChat();
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
                    <span className="text-white font-semibold">Tony Gallitto</span>
                    <span className="block text-[10px] text-slate-500 font-mono truncate">
                      tonygallitto@nomediagency.it
                    </span>
                  </li>
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
          {activeTab === "chat" && (
            <div className="flex h-full overflow-hidden gap-4 relative">
              
              <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
                <ChatWorkspace
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isGenerating={isGenerating}
                  onSelectTender={setSelectedTender}
                  selectedTender={selectedTender}
                  setActiveTab={setActiveTab}
                  onAddPacket={handleAddPacket}
                  isRibassoOpen={isRibassoOpen}
                  setIsRibassoOpen={setIsRibassoOpen}
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

                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin space-y-1">
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

              <CompanyProfile />
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

      {/* Deep D.Lgs. 36/2023 Vessatorie/Abusive Rules protective shield */}
      <VessatorieModal
        isOpen={isVessatorieOpen}
        onClose={() => setIsVessatorieOpen(false)}
        tender={selectedTender}
        onInjectClarification={(text) => handleSendMessage(text)}
      />

    </div>
  );
}
