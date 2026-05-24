import React, { useState } from "react";
import { McpServer, PacketLog, McpTool } from "../types";
import { ToggleLeft, ToggleRight, Database, Globe, FileText, Cpu, Check, Play, RefreshCw, Send, AlertTriangle } from "lucide-react";

interface McpHubProps {
  servers: McpServer[];
  onToggleServer: (id: string) => void;
  packets: PacketLog[];
  onClearPackets: () => void;
  onAddPacket: (packet: PacketLog) => void;
}

export const McpHub: React.FC<McpHubProps> = ({
  servers,
  onToggleServer,
  packets,
  onClearPackets,
  onAddPacket,
}) => {
  const [selectedTool, setSelectedTool] = useState<{ serverId: string; tool: McpTool } | null>(null);
  const [paramInputs, setParamInputs] = useState<{ [key: string]: string }>({});
  const [toolResult, setToolResult] = useState<any | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const getServerIcon = (id: string) => {
    switch (id) {
      case "anac-ted-server":
        return <Globe className="w-5 h-5 text-brand-gold" />;
      case "supabase-historicals":
        return <Database className="w-5 h-5 text-brand-gold" />;
      case "doc-parser-server":
        return <FileText className="w-5 h-5 text-brand-gold" />;
      case "relazione-tecnica-gen":
        return <Cpu className="w-5 h-5 text-brand-gold" />;
      default:
        return <Database className="w-5 h-5 text-brand-gold" />;
    }
  };

  const handleSelectTool = (serverId: string, tool: McpTool) => {
    setSelectedTool({ serverId, tool });
    setToolResult(null);
    const initialParams: { [key: string]: string } = {};
    tool.parameters.forEach((p) => {
      // Set default example values to make it interactive and immediate
      let defVal = "";
      if (p.name === "regione") defVal = "Lazio";
      if (p.name === "importo_minimo") defVal = "1000000";
      if (p.name === "cig") defVal = "9874563A2B";
      if (p.name === "cig_gara") defVal = "9874563A2B";
      if (p.name === "categoria_soa") defVal = "OG1";
      if (p.name === "valore_lavoro") defVal = "1000000";
      if (p.name === "doc_id") defVal = "scuola-roma";
      if (p.name === "sezione_chiave") defVal = "Punteggio Tecnico";
      if (p.name === "titolo_criterio") defVal = "Organizzazione e logistica del cantiere";
      if (p.name === "punti_massimi") defVal = "25";
      if (p.name === "capitolato_richieste") defVal = "Fornire dettagli sulle barriere acustiche e impatto ambientale.";
      initialParams[p.name] = defVal;
    });
    setParamInputs(initialParams);
  };

  const executeToolMock = () => {
    if (!selectedTool) return;
    setIsExecuting(true);

    const { serverId, tool } = selectedTool;
    const serverObj = servers.find((s) => s.id === serverId);
    if (!serverObj || !serverObj.connected) {
      alert("Il server associato a questo tool è disconnesso! Connettilo prima di lanciare.");
      setIsExecuting(false);
      return;
    }

    // Capture input parameters
    const parsedArgs: { [key: string]: any } = {};
    tool.parameters.forEach((p) => {
      const val = paramInputs[p.name];
      if (p.type === "number") {
        parsedArgs[p.name] = Number(val) || 0;
      } else {
        parsedArgs[p.name] = val;
      }
    });

    // Generate Request Packet
    const requestId = `req-${Math.floor(Math.random() * 10000)}`;
    const reqTimestamp = new Date().toLocaleTimeString();

    const requestPacket: PacketLog = {
      id: `${requestId}-req`,
      timestamp: reqTimestamp,
      direction: "host-to-server",
      service: serverObj.name,
      payload: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: tool.name,
          arguments: parsedArgs,
        },
        id: requestId,
      },
    };

    onAddPacket(requestPacket);

    // Mock response data logic
    setTimeout(() => {
      let resultPayload: any = {};
      if (tool.name === "cerca_bandi_regione") {
        resultPayload = {
          content: [
            {
              type: "text",
              text: `Trovati 2 bandi attivi in ${parsedArgs.regione} con categoria prevalente ${parsedArgs.categoria_prevalente || "OG1"} sopra €${parsedArgs.importo_minimo || 0}:\n1. CIG: 9874563A2B - Riqualificazione Energetica Scuola, Roma (€1.25M)\n2. CIG: A045B899C5 - Ampliamento SP12, Bologna (€3.8M)`
            }
          ]
        };
      } else if (tool.name === "dettagli_bando_cig") {
        resultPayload = {
          content: [
            {
              type: "text",
              text: `Dettagli CIG ${parsedArgs.cig}: Ente Appaltante: Città Metropolitana. Valore: €1.250.000,00. Scadenza: 12 Giugno 2026. Categoria richiesta: OG1 Class II.`
            }
          ]
        };
      } else if (tool.name === "verifica_requisiti_impresa") {
        resultPayload = {
          content: [
            {
              type: "text",
              text: `Report per Gara ${parsedArgs.cig_gara}: SOA OG1 Class III Posseduta (Richiesto OG1 Class II) -> IDONEO. ISO 9001 -> IDONEO. Certificato Fatturato Triennio -> MANCANTE €350.000. Referenze Edilizia Scolastica -> IDONEO.`
            }
          ]
        };
      } else if (tool.name === "recupera_esperienze_simili") {
        resultPayload = {
          content: [
            {
              type: "text",
              text: `Estratte 3 commesse pregresse per la categoria ${parsedArgs.categoria_soa} con importo superiore a €${parsedArgs.valore_lavoro || 0} dal database Supabase 'Gara Master':\n- 2024: Manutenzione Straordinaria Liceo Scientifico, Fiumicino (€850k)\n- 2025: Lavori Consolidamento Solaio, Tivoli (€450k)`
            }
          ]
        };
      } else if (tool.name === "analizza_sezione_disciplinare") {
        resultPayload = {
          content: [
            {
              type: "text",
              text: `Analisi Capitolo '${parsedArgs.sezione_chiave}': L'offerta tecnica riceverà un punteggio massimo di 70 punti, ripartiti su requisiti di pregio tecnico, criteri CAM e politiche green. Massima estensione: 20 facciate A4.`
            }
          ]
        };
      } else if (tool.name === "rileva_indicatori_rischio_anomalie") {
        resultPayload = {
          content: [
            {
              type: "text",
              text: `Anomalie individuate:\n1. Requisito fatturato sproporzionato rispetto all'importo a base di gara (Art. 10 Codice sulla proporzionalità e concorrenza).\n2. Tempistica di consegna compressa senza motivazione economica.`
            }
          ]
        };
      } else if (tool.name === "bozza_criterio_offerta") {
        resultPayload = {
          content: [
            {
              type: "text",
              text: `### Proposta Tecnica per Criterio: ${parsedArgs.titolo_criterio} (${parsedArgs.punti_massimi} Punti)\n\n#### 1. Approccio Organizzativo\nIntegriamo una pianificazione lean...`
            }
          ]
        };
      } else {
        resultPayload = {
          content: [{ type: "text", text: "Esecuzione completata correttamente." }]
        };
      }

      const responsePacket: PacketLog = {
        id: `${requestId}-res`,
        timestamp: new Date().toLocaleTimeString(),
        direction: "server-to-host",
        service: serverObj.name,
        payload: {
          jsonrpc: "2.0",
          result: resultPayload,
          id: requestId,
        },
      };

      onAddPacket(responsePacket);
      setToolResult(resultPayload.content[0].text);
      setIsExecuting(false);
    }, 1000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="mcp-hub-view">
      {/* Servers section */}
      <div className="lg:col-span-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-sans font-extrabold tracking-wider text-slate-450 uppercase">
            Protocollo MCP (Connettori Gara Master)
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-900 text-brand-gold text-xs font-sans font-bold border border-neutral-805 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-ping"></span>
            MCP HOST ATTIVO
          </span>
        </div>

        <div className="space-y-3">
          {servers.map((server) => (
            <div
              key={server.id}
              className="p-4 rounded-xl border border-neutral-800 bg-black transition-all"
              id={`server-${server.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 overflow-hidden">
                  <div className={`p-2.5 rounded-lg shrink-0 ${server.connected ? "bg-neutral-900 border border-neutral-850" : "bg-neutral-950 text-slate-500"}`}>
                    {getServerIcon(server.id)}
                  </div>
                  <div className="overflow-hidden flex-1">
                    <h4 className="font-sans font-bold text-xs text-white flex items-center gap-2 flex-wrap">
                      {server.name}
                      {server.connected ? (
                        <span className="text-[9px] bg-neutral-900 text-brand-gold border border-neutral-800 px-1.5 py-0.5 rounded font-sans font-bold">
                          ONLINE
                        </span>
                      ) : (
                        <span className="text-[9px] bg-neutral-950 text-slate-500 border border-neutral-800 px-1.5 py-0.5 rounded font-sans">
                          SCOLLEGATO
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {server.description}
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-brand-gold bg-neutral-950 border border-neutral-800 px-1.5 py-0.5 rounded truncate inline-block max-w-full">
                      {server.url}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onToggleServer(server.id)}
                  className="cursor-pointer transition-colors text-slate-450 hover:text-brand-gold"
                  title={server.connected ? "Disconnetti server" : "Connetti server"}
                  id={`toggle-${server.id}`}
                >
                  {server.connected ? (
                    <ToggleRight className="w-8 h-8 text-brand-gold" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-700" />
                  )}
                </button>
              </div>

              {server.connected && (
                <div className="mt-4 pt-3.5 border-t border-neutral-800">
                  <span className="text-[9px] font-sans font-extrabold text-[#FFD700] uppercase tracking-widest block mb-2">
                    Strumenti Esportati (Tools)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {server.tools.map((tool) => (
                      <button
                        key={tool.name}
                        onClick={() => handleSelectTool(server.id, tool)}
                        className={`text-[11px] px-2.5 py-1.5 rounded-md font-mono border transition-all truncate max-w-full cursor-pointer ${
                          selectedTool?.tool.name === tool.name
                            ? "bg-brand-gold text-black border-brand-gold font-bold shadow-xs"
                            : "bg-black border-neutral-800 text-white hover:border-brand-gold"
                        }`}
                        id={`tool-btn-${tool.name}`}
                      >
                        /{tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Simulator Playground */}
      <div className="lg:col-span-7 flex flex-col space-y-4">
        {selectedTool ? (
          <div className="bg-black border border-neutral-800 rounded-xl p-5 shadow-xs flex flex-col h-full justify-between" id="tool-testbed">
            <div>
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div>
                  <span className="text-[10px] font-sans font-bold text-slate-400">Strumento Selezionato:</span>
                  <h3 className="text-sm font-mono font-extrabold text-brand-gold mt-0.5">
                    /{selectedTool.tool.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedTool(null)}
                  className="text-xs font-sans text-slate-400 hover:text-white font-bold cursor-pointer"
                >
                  Annulla
                </button>
              </div>

              <p className="text-xs text-slate-300 mt-3 font-sans leading-relaxed">
                {selectedTool.tool.description}
              </p>

              {/* Form parameters */}
              <div className="mt-4 space-y-3">
                <h5 className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-400">
                  Parametri Chiamata (JSON params)
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedTool.tool.parameters.map((p) => (
                    <div key={p.name} className="flex flex-col gap-1">
                      <label className="text-[11px] font-sans font-bold text-slate-300 flex items-center gap-1.5">
                        <span>{p.name}</span>
                        {p.required && <span className="text-brand-gold font-bold">*</span>}
                        <span className="text-[9.5px] text-slate-500 font-mono">({p.type})</span>
                      </label>
                      <input
                        type="text"
                        value={paramInputs[p.name] || ""}
                        onChange={(e) =>
                          setParamInputs({ ...paramInputs, [p.name]: e.target.value })
                        }
                        className="text-xs px-3 py-2 border border-neutral-800 bg-neutral-950 focus:border-brand-gold focus:outline-hidden transition-all text-white rounded-lg"
                        placeholder={p.description}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={executeToolMock}
                disabled={isExecuting}
                className="cursor-pointer transition-all bg-brand-gold hover:bg-yellow-400 text-black rounded-xl px-4 py-2.5 text-xs font-sans font-extrabold flex items-center justify-center gap-2 mt-5 disabled:opacity-50 shadow-sm"
                id="execute-tool-button"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Chiamata MCP in Corso...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-black" />
                    Esegui Chiamata MCP (JSON-RPC)
                  </>
                )}
              </button>
            </div>

            {/* Results block */}
            <div className="mt-5 border-t border-dashed border-neutral-800 pt-4">
              <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Output Risposta (JSON-RPC Content)
              </span>
              {toolResult ? (
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-sans text-white separator-line whitespace-pre-wrap leading-relaxed animate-fade-in border-l-4 border-l-brand-gold">
                  <div className="flex items-center gap-1.5 mb-1.5 text-brand-gold font-sans font-bold text-[10px]">
                    <Check className="w-3.5 h-3.5" /> ESEGUITO CON SUCCESSO (MCP OK)
                  </div>
                  {toolResult}
                </div>
              ) : (
                <div className="bg-neutral-950 border border-dashed border-neutral-800 rounded-lg p-4 text-xs font-mono text-slate-500 text-center italic">
                  {isExecuting ? "In attesa dei pacchetti..." : "Configura i parametri ed esegui il test per lanciare la simulazione."}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-black border border-neutral-800 rounded-xl p-6 shadow-2xs text-center flex flex-col items-center justify-center h-full min-h-[300px]" id="no-tool-fallback">
            <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center shadow-2xs mb-3 text-brand-gold">
              <Cpu className="w-6 h-6 text-brand-gold" />
            </div>
            <h4 className="font-sans font-bold text-white text-sm">Pronto al Test dei Connettori</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
              I connettori MCP permettono a GaraMaster AI di leggere e scrivere su Supabase, ANAC ed estrarre i PDF. Seleziona uno dei tool operativi a sinistra per eseguirlo in autonomia!
            </p>
          </div>
        )}

        {/* Real-time Packet Stream Logger */}
        <div className="bg-black border border-neutral-800 rounded-xl flex flex-col h-[280px]" id="mcp-packet-logger">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-805">
            <span className="text-[10px] font-mono font-bold text-[#FFD700] uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse"></span>
              Console Pacchetti MCP (JSON-RPC Stream)
            </span>
            <button
              onClick={onClearPackets}
              className="text-[10px] font-sans font-bold text-slate-400 hover:text-brand-gold transition-colors cursor-pointer"
            >
              Pulisci Log
            </button>
          </div>

          <div className="p-4 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-3 flex-1 scrollbar-thin bg-black rounded-b-xl">
            {packets.length === 0 ? (
              <div className="text-slate-650 text-center italic py-10 text-[10px]">
                // In attesa di chiamate MCP... Prova a lanciare un tool o fai una domanda in chat.
              </div>
            ) : (
              packets.slice().reverse().map((p) => {
                const getDirectionBadge = (dir: string) => {
                  switch (dir) {
                    case "host-to-server":
                      return "bg-neutral-900 text-brand-gold border-neutral-800";
                    case "server-to-host":
                      return "bg-neutral-900 text-white border-neutral-800";
                    case "host-to-llm":
                      return "bg-neutral-900 text-emerald-400 border-neutral-800";
                    case "llm-to-host":
                      return "bg-neutral-900 text-indigo-400 border-neutral-800";
                    default:
                      return "bg-neutral-900 text-slate-400 border-neutral-800";
                  }
                };

                const getDirectionLabel = (dir: string) => {
                  switch (dir) {
                    case "host-to-server":
                      return "HOST → MCP SERVER";
                    case "server-to-host":
                      return "MCP SERVER → HOST";
                    case "host-to-llm":
                      return "HOST → LLM CONTEXT";
                    case "llm-to-host":
                      return "LLM → TOOL INVOCATION";
                    default:
                      return "DATA";
                  }
                };

                return (
                  <div key={p.id} className="border-b border-neutral-900 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${getDirectionBadge(p.direction)}`}>
                          {getDirectionLabel(p.direction)}
                        </span>
                        <span className="text-[10px] text-slate-500">{p.service}</span>
                      </div>
                      <span className="text-[9px] text-slate-600 font-sans">{p.timestamp}</span>
                    </div>
                    <pre className="bg-neutral-950 p-2.5 rounded-lg overflow-x-auto text-[10px] text-slate-400 leading-tight border border-neutral-800">
                      {JSON.stringify(p.payload, null, 2)}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
