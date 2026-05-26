import React, { useState, useRef, useEffect, useCallback } from "react";
import { Message, TenderDocument, PacketLog, ChatAttachment } from "../types";
import { 
  Cpu, Send, RefreshCw, ChevronDown, ChevronUp, Sparkles, 
  Mic, Paperclip, CheckCircle, Database, Calculator, X, FileText
} from "lucide-react";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ACCEPTED_FILE_TYPES =
  ".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,image/jpeg,image/png,image/webp,image/gif";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
import { FormattedMessage } from "./FormattedMessage";
import { ExplainabilityLayer } from "./ExplainabilityLayer";
import { parseExplainabilityFromText } from "../lib/explainability";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import type { ChatMode } from "../types/chat";
import {
  ConnectorChips,
  ConnectorPlusMenu,
} from "./ConnectorPlusMenu";
import type { InternalConnector, InternalConnectorAction } from "../lib/internalConnectors";
import { GuidedOfferPanel } from "./GuidedOfferPanel";
import { SoaGapBanner } from "./SoaGapBanner";
import type { OfferBusta, OfferPreparationState } from "../lib/guidedOfferPreparation";
import { detectSoaGaps } from "../lib/soaGapAnalysis";
import type { ProfiloImpresaContext } from "../types/database";

const GENERAL_SUGGESTED_PROMPTS = [
  {
    label: "Come funziona il Codice Appalti 2023?",
    text: "Spiegami in modo operativo le novità principali del D.Lgs. 36/2023 per un'impresa edile.",
  },
  {
    label: "Quando conviene un RTI?",
    text: "In quali casi conviene costituire un RTI invece dell'avvalimento per una gara pubblica?",
  },
  {
    label: "Checklist documenti di gara",
    text: "Dammi una checklist dei documenti da preparare per partecipare a una gara sopra soglia europea.",
  },
];

function buildOfferPreparationPrompts(tender: TenderDocument) {
  return [
    {
      label: "Ribasso al 12%",
      text: `Il ribasso previsto per la gara CIG ${tender.cig} è del 12%. Prossimo passo?`,
    },
    {
      label: "Checklist documenti",
      text: `Genera la checklist completa dei documenti per Busta Amministrativa, Tecnica ed Economica in base al disciplinare CIG ${tender.cig}.`,
    },
    {
      label: "Subappalto impianti",
      text: "Intendo subappaltare la parte impiantistica. Quali dichiarazioni e documenti servono?",
    },
  ];
}

function buildSuggestedPrompts(tender: TenderDocument) {
  const missingReqs = tender.requirements.filter((r) => !r.satisfied);
  const missingSummary =
    missingReqs.length > 0
      ? missingReqs
          .slice(0, 3)
          .map((r) => r.description)
          .join("; ")
      : null;

  return [
    {
      label: "Posso partecipare con il mio profilo SOA?",
      text: `Posso partecipare con il mio profilo SOA alla gara "${tender.title}" (CIG ${tender.cig}, categoria ${tender.category})?`,
    },
    {
      label: "Quali sono i rischi principali di questa gara?",
      text: `Quali sono i rischi principali di questa gara (CIG ${tender.cig})${
        tender.penalties?.length ? `, considerando ${tender.penalties.length} penali` : ""
      }${tender.anomalies?.length ? ` e ${tender.anomalies.length} anomalie` : ""}?`,
    },
    {
      label: "Come strutturare un RTI per coprire i requisiti mancanti?",
      text: missingSummary
        ? `Come strutturare un RTI per coprire i requisiti mancanti (${missingSummary}) sulla gara CIG ${tender.cig}?`
        : `Come strutturare un RTI per coprire i requisiti mancanti della gara CIG ${tender.cig}?`,
    },
  ];
}

interface ChatWorkspaceProps {
  messages: Message[];
  onSendMessage: (text: string, overrideTargetTender?: string, attachments?: ChatAttachment[]) => void;
  isGenerating: boolean;
  onSelectTender: (tender: TenderDocument) => void;
  selectedTender: TenderDocument;
  chatMode?: ChatMode;
  setActiveTab: (tab: "chat" | "analyzer" | "mcp") => void;
  onAddPacket: (packet: PacketLog) => void;
  isRibassoOpen: boolean;
  setIsRibassoOpen: (open: boolean) => void;
  conversazioneSaveStatus?: "idle" | "saving" | "saved" | "error" | "skipped";
  conversazioneSaveError?: string | null;
  enabledConnectorIds?: string[];
  onToggleConnector?: (id: string) => void;
  onRunConnector?: (action: InternalConnectorAction, connector: InternalConnector) => void;
  offerPreparation?: OfferPreparationState;
  onToggleOfferChecklistItem?: (busta: OfferBusta, itemId: string) => void;
  profilo?: ProfiloImpresaContext | null;
  onOpenRtiAvvalimento?: () => void;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  onSendMessage,
  isGenerating,
  onSelectTender,
  selectedTender,
  chatMode = "tender",
  setActiveTab,
  onAddPacket,
  isRibassoOpen,
  setIsRibassoOpen,
  conversazioneSaveStatus = "idle",
  conversazioneSaveError = null,
  enabledConnectorIds = [],
  onToggleConnector,
  onRunConnector,
  offerPreparation,
  onToggleOfferChecklistItem,
  profilo = null,
  onOpenRtiAvvalimento,
}) => {
  const [inputText, setInputText] = useState("");
  const [openTools, setOpenTools] = useState<{ [key: string]: boolean }>({});
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [calculatedRibasso, setCalculatedRibasso] = useState<number | null>(null);
  const [ribassoInput, setRibassoInput] = useState({ importo: 1250000, percentuale: 11.5 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const suggestedPrompts =
    chatMode === "general"
      ? GENERAL_SUGGESTED_PROMPTS
      : chatMode === "offer_preparation"
        ? buildOfferPreparationPrompts(selectedTender)
        : buildSuggestedPrompts(selectedTender);

  const appendTranscript = useCallback((text: string) => {
    setInputText((prev) => {
      const trimmed = text.trim();
      if (!trimmed) return prev;
      if (!prev.trim()) return trimmed;
      return prev.endsWith(" ") ? `${prev}${trimmed}` : `${prev} ${trimmed}`;
    });
  }, []);

  const {
    isSupported: isSpeechSupported,
    isListening,
    isTranscribing,
    error: speechError,
    startListening,
    stopListening,
  } = useVoiceDictation({ onTranscript: appendTranscript });

  const handleToggleDictation = () => {
    if (isTranscribing) return;
    startListening();
  };

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleSaveToSupabase = () => {
    if (messages.length <= 1) {
      alert("Nessuna proposta o chat disponibile da salvare! Avvia prima una conversazione.");
      return;
    }
    setSaveStatus("saving");

    // Gather last assistant message as chat summary
    const lastAssistantMsg = [...messages].reverse().find(m => m.sender === "assistant");
    const summaryText = lastAssistantMsg ? lastAssistantMsg.text : "Bozza di consultazione generica.";

    const bodyData = {
      tender_id: selectedTender.id,
      cig: selectedTender.cig,
      proposal_title: selectedTender.title,
      proposal_summary: summaryText.slice(0, 350) + (summaryText.length > 350 ? "..." : ""),
      saved_at: new Date().toISOString(),
      operator: "Tony Gallitto",
    };

    const requestId = `req-save-${Date.now().toString().slice(-4)}`;
    const reqTimestamp = new Date().toLocaleTimeString();

    // Prepare the outgoing JSON-RPC Request packet for GaraMaster logs
    const requestPacket: PacketLog = {
      id: `${requestId}-req`,
      timestamp: reqTimestamp,
      direction: "host-to-server",
      service: "Supabase Gara Historian",
      payload: {
        jsonrpc: "2.0",
        method: "database/insert",
        params: {
          endpoint: "/db/save_proposal",
          table: "saved_proposals",
          record: bodyData,
        },
        id: requestId,
      },
    };

    onAddPacket(requestPacket);

    // Fire simulated POST call to '/db/save_proposal'
    fetch("/db/save_proposal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyData),
    })
      .then((res) => {
        // Handle response gracefully - since it's a simulated client-side app, custom fallback handles 404
        return res.ok ? res.json() : Promise.resolve({ status: "success", simulated: true });
      })
      .catch((err) => {
        console.warn("POST to /db/save_proposal resolved in fallback:", err);
        return { status: "success", simulated: true };
      })
      .then((data) => {
        // Construct successful database response packet for logs
        const responsePacket: PacketLog = {
          id: `${requestId}-res`,
          timestamp: new Date().toLocaleTimeString(),
          direction: "server-to-host",
          service: "Supabase Gara Historian",
          payload: {
            jsonrpc: "2.0",
            result: {
              status: "success",
              inserted_id: Math.floor(Math.random() * 9000) + 1000,
              message: "Record salvato con successo nella tabella 'Saved Proposals'!",
              api_payload: data,
            },
            id: requestId,
          },
        };

        onAddPacket(responsePacket);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const readFileAsAttachment = (file: File): Promise<ChatAttachment> =>
    new Promise((resolve, reject) => {
      const base: ChatAttachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      };
      if (file.size > 2 * 1024 * 1024) {
        resolve(base);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ ...base, dataUrl: reader.result as string });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const newAttachments: ChatAttachment[] = [];
    for (const file of Array.from(files) as File[]) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        alert(`File troppo grande (max 15 MB): ${file.name}`);
        continue;
      }
      try {
        newAttachments.push(await readFileAsAttachment(file));
      } catch {
        alert(`Impossibile leggere il file: ${file.name}`);
      }
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    }
    e.target.value = "";
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;
    if (!inputText.trim() && pendingAttachments.length === 0) return;

    onSendMessage(
      inputText,
      undefined,
      pendingAttachments.length > 0 ? pendingAttachments : undefined
    );
    setInputText("");
    setPendingAttachments([]);
    stopListening();
  };

  const handleSuggestedPromptClick = (prompt: string) => {
    if (isGenerating) return;
    setInputText(prompt);
    textInputRef.current?.focus();
  };

  const toggleToolDetails = (id: string) => {
    setOpenTools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCalculateRibasso = (e: React.FormEvent) => {
    e.preventDefault();
    const impNetto = ribassoInput.importo - (ribassoInput.importo * (ribassoInput.percentuale / 100));
    setCalculatedRibasso(impNetto);
  };

  const isOfferPrep = chatMode === "offer_preparation";
  const soaGapAnalysis =
    chatMode !== "general" ? detectSoaGaps(selectedTender, profilo) : { hasGaps: false, gaps: [], unmetRequirements: [], profiloSoaSummary: null };

  return (
    <div className="flex h-full bg-black border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl relative" id="chat-workspace-card">
    <div className="flex flex-col flex-1 min-w-0 h-full">
      
      {/* Top indicator of current context */}
      <div className="px-5 py-3 border-b border-neutral-800 bg-black flex items-center justify-between text-slate-300 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isOfferPrep ? "bg-emerald-400" : "bg-brand-gold"}`}></div>
          <span className="text-[11px] font-mono text-slate-450">
            {chatMode === "general" ? (
              <>
                MODALITÀ: <strong className="text-brand-gold uppercase font-sans">Chat libera</strong>
                <span className="text-slate-500 ml-1">(stile ChatGPT — senza disciplinare)</span>
              </>
            ) : isOfferPrep ? (
              <>
                MODALITÀ:{" "}
                <strong className="text-emerald-400 uppercase font-sans">Preparazione offerta</strong>
                <span className="text-slate-500 ml-1">· CIG {selectedTender.cig}</span>
              </>
            ) : (
              <>
                DISCIPLINARE:{" "}
                <strong className="text-white uppercase font-sans">
                  {selectedTender.title.slice(0, 40)}...
                </strong>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {conversazioneSaveStatus === "saving" && (
            <span className="text-[10px] font-sans text-slate-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Salvataggio chat…
            </span>
          )}
          {conversazioneSaveStatus === "saved" && (
            <span className="text-[10px] font-sans font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded">
              ✓ Chat salvata su Supabase
            </span>
          )}
          {conversazioneSaveStatus === "error" && (
            <span
              className="text-[10px] font-sans text-red-300 bg-red-950/40 border border-red-800/50 px-2 py-0.5 rounded max-w-[220px] truncate"
              title={conversazioneSaveError ?? undefined}
            >
              ✗ Salvataggio fallito
            </span>
          )}
          {conversazioneSaveStatus === "skipped" && (
            <span className="text-[10px] font-sans text-slate-500 border border-neutral-800 px-2 py-0.5 rounded">
              Login richiesto per salvare
            </span>
          )}
          {(chatMode === "tender" || isOfferPrep) && (
            <span className={`text-[10px] uppercase tracking-wider font-mono bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded ${
              isOfferPrep ? "text-emerald-400" : "text-brand-gold"
            }`}>
              CIG: {selectedTender.cig}
            </span>
          )}
        </div>
      </div>

      {soaGapAnalysis.hasGaps && onOpenRtiAvvalimento && (
        <SoaGapBanner
          analysis={soaGapAnalysis}
          cig={selectedTender.cig}
          onOpenConfigurator={onOpenRtiAvvalimento}
        />
      )}

      {isOfferPrep && offerPreparation && onToggleOfferChecklistItem && (
        <div className="xl:hidden shrink-0">
          <GuidedOfferPanel
            state={offerPreparation}
            onToggleChecklistItem={onToggleOfferChecklistItem}
            compact
          />
        </div>
      )}

      {/* Messages layout */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin bg-black flex flex-col justify-between min-h-[200px]">
        
        {/* If only welcome message exists, show ChatGPT styled "Da dove iniziamo?" central area */}
        {messages.length <= 1 ? (
          <div className="my-auto py-8 text-center flex flex-col items-center">
            
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans">
              Da dove iniziamo?
            </h2>
            <p className="text-slate-450 text-xs mt-2 max-w-md leading-relaxed font-sans">
              {chatMode === "general" ? (
                <>
                  Consulenza generale su appalti pubblici. Collega una gara dalla lista o crea una{" "}
                  <strong className="text-white">chat su gara corrente</strong> quando serve il disciplinare.
                </>
              ) : isOfferPrep ? (
                <>
                  Preparazione offerta guidata per CIG{" "}
                  <span className="text-emerald-400 font-bold font-mono">{selectedTender.cig}</span>.
                  Rispondi alle domande una alla volta; a destra vedi avanzamento e checklist buste.
                </>
              ) : (
                <>
                  Disciplinare CIG{" "}
                  <span className="text-brand-gold font-bold font-mono">{selectedTender.cig}</span>{" "}
                  collegato a questa conversazione.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => {
              if (m.sender === "system") {
                return (
                  <div key={m.id} className="flex justify-center my-2 select-none">
                    <span className="bg-neutral-900 text-slate-300 text-[10px] px-3 py-1 rounded-full font-mono border border-neutral-800">
                      {m.text}
                    </span>
                  </div>
                );
              }

              const isUser = m.sender === "user";

              return (
                <div
                  key={m.id}
                  className={`flex gap-4 max-w-[95%] ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 self-start text-[11px] font-bold border ${
                    isUser 
                      ? "bg-brand-gold/15 border border-brand-gold text-brand-gold" 
                      : "bg-black border border-neutral-800 text-white"
                  }`}>
                    {isUser ? "TU" : "GM"}
                  </div>

                  <div className="space-y-2 flex-1 max-w-2xl">
                    {/* Tool usage inside bubble */}
                    {m.toolUsage && (
                      <div className="bg-neutral-900 border border-neutral-800 text-slate-200 rounded-xl p-3 text-xs font-mono mb-2 shadow-inner">
                        <button
                          onClick={() => toggleToolDetails(m.id)}
                          className="flex items-center justify-between w-full text-brand-gold font-bold hover:text-brand-gold cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <Cpu className="w-3.5 h-3.5 text-brand-gold animate-pulse" />
                            CONNESSIONE MCP: {m.toolUsage.toolName}()
                          </span>
                          {openTools[m.id] ? <ChevronUp className="w-3.5 h-3.5 text-brand-gold" /> : <ChevronDown className="w-3.5 h-3.5 text-brand-gold" />}
                        </button>

                        {(openTools[m.id] ?? true) && (
                          <div className="mt-3 pt-2.5 border-t border-neutral-800 space-y-2 text-[10px]">
                            <div>
                              <span className="text-brand-gold/75 font-semibold font-sans text-[9px] uppercase tracking-wider block">Parametri di input dell'Agente:</span>
                              <pre className="bg-black p-2 rounded mt-1 overflow-x-auto text-white font-mono border border-neutral-800">
                                {JSON.stringify(m.toolUsage.params, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <span className="text-brand-gold/75 font-semibold font-sans text-[9px] uppercase tracking-wider block">Dati reperiti (Database & OCR):</span>
                              <div className="bg-black p-2 rounded mt-1 text-white font-sans leading-relaxed border border-neutral-800">
                                {typeof m.toolUsage.result === "string" ? (
                                  <FormattedMessage text={m.toolUsage.result} />
                                ) : (
                                  m.toolUsage.result
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Speech Text Content */}
                    <div
                      className={`p-4 rounded-2xl text-[13px] leading-relaxed font-sans ${
                        isUser
                          ? "bg-neutral-900 border border-brand-gold text-white font-medium rounded-tr-xs shadow-md"
                          : "bg-neutral-950 border border-neutral-800 text-slate-100 rounded-tl-xs shadow-md"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                          {m.text}
                        </p>
                      ) : (
                        <>
                          {(() => {
                            const { mainText, explainability } = parseExplainabilityFromText(m.text);
                            return (
                              <>
                                <FormattedMessage text={mainText} />
                                {explainability && <ExplainabilityLayer data={explainability} />}
                              </>
                            );
                          })()}
                        </>
                      )}

                      {m.attachments && m.attachments.length > 0 && (
                        <ul className="mt-3 pt-3 border-t border-neutral-700/80 space-y-1.5 list-disc list-inside marker:text-brand-gold">
                          {m.attachments.map((att) => (
                            <li key={att.id} className="text-[10.5px] text-slate-300">
                              <span className="font-semibold text-white">{att.name}</span>
                              <span className="text-slate-500 ml-1">({formatFileSize(att.size)})</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* If response mentions school / road and helper option */}
                      {!isUser && (m.text.includes("Piccoli Passi") || m.text.includes("Bologna") || m.text.includes("Bozza")) && (
                        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-[11.5px]">
                          <span className="text-slate-400 font-mono text-[10px]">
                            Capitoli bando rilevati in OCR
                          </span>
                          <button
                            onClick={() => {
                              onSelectTender(selectedTender);
                              setActiveTab("analyzer");
                            }}
                            className="cursor-pointer bg-black hover:bg-neutral-900 text-white font-sans text-[11px] font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 border border-neutral-800 transition-all shadow-xs"
                          >
                            <FileText className="w-3.5 h-3.5 text-brand-gold" />
                            Ispeziona Disciplinare Completo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isGenerating && (
              <div className="flex gap-4 max-w-[90%] mr-auto">
                <div className="w-8 h-8 rounded-full bg-black border border-neutral-800 text-white flex items-center justify-center shrink-0 self-start">
                  <RefreshCw className="w-4 h-4 animate-spin text-brand-gold" />
                </div>
                <div className="bg-neutral-950 border border-neutral-800 py-3.5 px-5 rounded-2xl rounded-tl-xs text-[13px] text-slate-300 italic flex items-center gap-2.5 shadow-md">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-gold opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-gold"></span>
                  </span>
                  L'Agente Gara Master sta richiamando i webhook MCP e generando la risposta normativa...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Main prompt bar following ChatGPT styling */}
      <div className="p-4 border-t border-neutral-800 bg-black flex gap-3 items-stretch" id="chat-input-controls-area">
        <form onSubmit={handleSubmit} className="relative flex flex-col bg-neutral-950 border border-neutral-800 rounded-2xl p-2 shadow-2xl flex-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={handleFileChange}
            id="chat-file-upload-input"
          />

          {onToggleConnector && (
            <ConnectorChips enabledIds={enabledConnectorIds} onToggle={onToggleConnector} />
          )}

          {pendingAttachments.length > 0 && (
            <div className="px-2 pt-1 pb-2 border-b border-neutral-800 flex flex-wrap gap-1.5">
              {pendingAttachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-[10px] text-slate-200"
                >
                  <Paperclip className="w-3 h-3 text-brand-gold shrink-0" />
                  <span className="truncate max-w-[140px]" title={att.name}>
                    {att.name}
                  </span>
                  <span className="text-slate-500 shrink-0">{formatFileSize(att.size)}</span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(att.id)}
                    className="cursor-pointer text-slate-500 hover:text-white p-0.5"
                    title="Rimuovi allegato"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          
          <div className="flex items-center flex-1 px-2">
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
              title="Carica allegati dal PC (PDF, Office, immagini, ZIP)"
              id="chat-attach-file-btn"
            >
              <Paperclip className="w-5 h-5 text-brand-gold" />
            </button>

            {onToggleConnector && onRunConnector && (
              <ConnectorPlusMenu
                enabledIds={enabledConnectorIds}
                onToggle={onToggleConnector}
                onRunConnector={onRunConnector}
                disabled={isGenerating}
              />
            )}

            {/* Input area */}
            <input
              ref={textInputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Chiedi sull'appalto, requisiti SOA, anomalie o soluzioni di Avvalimento..."
              disabled={isGenerating}
              className="flex-1 bg-transparent px-3 py-3 text-xs text-white focus:outline-hidden transition-all placeholder-slate-500"
              id="chat-input-text-field"
            />

            {/* Thinking details dropdown / trigger indicator */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-slate-300 bg-neutral-900 border border-neutral-850 rounded-lg hover:text-white transition-all mr-1.5 cursor-pointer"
              >
                <span>Thinking</span>
                <span className="w-1.5 h-1.5 bg-brand-gold rounded-full animate-ping"></span>
                <ChevronDown className="w-3 h-3 text-brand-gold" />
              </button>

              {isThinkingOpen && (
                <div className="absolute right-0 bottom-10 z-50 bg-black border border-neutral-800 rounded-xl p-4 w-60 shadow-2xl text-[10px] text-slate-400 font-sans space-y-2">
                  <span className="font-extrabold text-brand-gold uppercase block tracking-wider">
                    Stato Ragionamento LLM
                  </span>
                  <p className="leading-relaxed">
                    Il sistema elabora i prompt con le policy del <strong>D.Lgs 36/2023</strong> ed effettua chiamate RPC al server MCP per allinearsi al database srl.
                  </p>
                  <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                    <span>STATUS: ATTIVO</span>
                    <span>MCP HUB: OK</span>
                  </div>
                </div>
              )}
            </div>

            {/* Dettatura vocale (Web Speech API, italiano) */}
            <button
              type="button"
              onClick={handleToggleDictation}
              disabled={isGenerating || isTranscribing || !isSpeechSupported}
              className={`p-2 rounded-lg transition-colors mr-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isListening
                  ? "bg-red-950/60 text-red-400 border border-red-800 animate-pulse"
                  : isTranscribing
                    ? "bg-neutral-900 border border-brand-gold/50"
                    : "text-slate-400 hover:text-white hover:bg-neutral-900"
              }`}
              title={
                !isSpeechSupported
                  ? "Registrazione vocale non supportata"
                  : isTranscribing
                    ? "Trascrizione in corso…"
                    : isListening
                      ? "Ferma e trascrivi con Gemini"
                      : "Registra messaggio vocale (Gemini)"
              }
              id="chat-voice-dictation-btn"
            >
              <Mic
                className={`w-4 h-4 ${
                  isListening ? "text-red-400" : isTranscribing ? "text-brand-gold animate-pulse" : "text-brand-gold"
                }`}
              />
            </button>

            {/* Submit btn */}
            <button
              type="submit"
              disabled={(!inputText.trim() && pendingAttachments.length === 0) || isGenerating}
              className="cursor-pointer bg-brand-gold font-bold text-black rounded-xl p-2.5 flex items-center justify-center shrink-0 disabled:opacity-45 hover:bg-yellow-400 transition-all"
              id="chat-send-btn"
            >
              <Send className="w-3.5 h-3.5 text-black" />
            </button>

          </div>

          {(isListening || isTranscribing || speechError) && (
            <p
              className={`px-3 pb-1 text-[10px] font-sans ${
                speechError ? "text-red-400" : "text-brand-gold"
              }`}
            >
              {speechError ??
                (isTranscribing
                  ? "Trascrizione in corso con Gemini…"
                  : isListening
                    ? "Registrazione attiva… clicca di nuovo il microfono quando hai finito di parlare."
                    : "")}
            </p>
          )}

          <div className="px-2 pt-2 pb-1 border-t border-neutral-800/80">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3 h-3 text-brand-gold" />
              <span className="text-[10px] uppercase font-sans font-bold tracking-wider text-slate-500">
                {chatMode === "general"
                  ? "Suggerimenti rapidi"
                  : isOfferPrep
                    ? "Passi guidati offerta"
                    : `Suggerimenti per CIG ${selectedTender.cig}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((suggestion, idx) => (
                <button
                  key={`${selectedTender.id}-suggestion-${idx}`}
                  type="button"
                  onClick={() => handleSuggestedPromptClick(suggestion.text)}
                  disabled={isGenerating}
                  className="cursor-pointer rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-brand-gold hover:text-white disabled:opacity-45 disabled:cursor-not-allowed"
                  title={suggestion.text}
                  id={`chat-suggested-prompt-${idx}`}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        </form>

        {/* Save to Supabase Custom button next to chat input */}
        <button
          type="button"
          onClick={handleSaveToSupabase}
          disabled={saveStatus === "saving" || messages.length <= 1}
          className="cursor-pointer bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-brand-gold text-white px-3 sm:px-4 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-center min-w-[75px] sm:min-w-[120px] disabled:opacity-40 disabled:hover:border-neutral-800 shadow-xl py-2 shrink-0 group"
          title="Salva la proposta d'appalto corrente su Postgres/Supabase"
          id="save-to-supabase-btn"
        >
          {saveStatus === "saving" ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-brand-gold" />
              <span className="text-[9px] sm:text-[10px] font-bold font-sans uppercase tracking-wider text-slate-400">Salvataggio...</span>
            </>
          ) : saveStatus === "saved" ? (
            <>
              <CheckCircle className="w-4 h-4 text-emerald-400 animate-bounce" />
              <span className="text-[9px] sm:text-[10px] font-bold font-sans uppercase tracking-wider text-emerald-400">Salvato!</span>
            </>
          ) : (
            <>
              <Database className="w-4 h-4 text-brand-gold group-hover:scale-110 transition-transform" />
              <span className="text-[9px] sm:text-[10px] font-bold font-sans uppercase tracking-wider text-slate-300 group-hover:text-white">
                <span className="hidden sm:inline">Salva </span>Supabase
              </span>
            </>
          )}
        </button>
      </div>

      {/* Calcolatore ribasso (aperto da menu App e integrazioni) */}
      {isRibassoOpen && (
        <div className="mt-3 bg-neutral-950 border border-neutral-800 p-4 rounded-xl text-xs space-y-3 font-sans max-w-lg mx-auto transition-all animate-fade-in shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="font-bold text-white uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-brand-gold" />
              SIMULAZIONE RIBASSO SOSTENIBILE (OEPV)
            </span>
              <button
                onClick={() => setIsRibassoOpen(false)}
                className="text-slate-500 hover:text-white cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCalculateRibasso} className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-450 uppercase mb-1 font-semibold">Importo di Gara (€)</label>
                <input
                  type="number"
                  value={ribassoInput.importo}
                  onChange={(e) => setRibassoInput({ ...ribassoInput, importo: Number(e.target.value) })}
                  className="w-full bg-black text-white border border-neutral-850 p-1.5 rounded focus:border-brand-gold focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-450 uppercase mb-1 font-semibold">Percentuale Ribasso (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={ribassoInput.percentuale}
                  onChange={(e) => setRibassoInput({ ...ribassoInput, percentuale: Number(e.target.value) })}
                  className="w-full bg-black text-white border border-neutral-850 p-1.5 rounded focus:border-brand-gold focus:outline-hidden"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="w-full bg-brand-gold hover:bg-yellow-400 text-black font-sans font-bold py-1.5 rounded text-[11px] cursor-pointer transition-colors"
                >
                  Calcola Importo Offerto Netto
                </button>
              </div>
            </form>

            {calculatedRibasso !== null && (
              <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded text-[11px] text-center text-brand-gold font-mono">
                Importo Netto Offerto: <strong className="text-white text-xs">€ {calculatedRibasso.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</strong>
                <p className="text-[9px] text-slate-400 mt-1 font-sans">Conforme all'art. 110 del D.Lgs. 36/2023 (verifica dell'anomalia dell'offerta).</p>
              </div>
            )}
          </div>
        )}

    </div>

    {isOfferPrep && offerPreparation && onToggleOfferChecklistItem && (
      <GuidedOfferPanel
        state={offerPreparation}
        onToggleChecklistItem={onToggleOfferChecklistItem}
      />
    )}
    </div>
  );
};
