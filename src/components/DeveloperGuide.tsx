import React from "react";
import { Cpu, Database, Network, Code2, ShieldCheck, HelpCircle } from "lucide-react";

export const DeveloperGuide: React.FC = () => {
  return (
    <div className="space-y-8" id="developer-architect-playbook">
      {/* Intro and Strategy card */}
      <div className="bg-black border border-neutral-800 rounded-xl p-6 shadow-3xs space-y-4">
        <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
          <Network className="w-5 h-5 text-brand-gold" />
          Come Convertire 'Gara Master' in un LLM-Agent Nativo con MCP
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          Attualmente "Gara Master" è un software strutturato su database (Supabase + tabelle relazionali) con una UI statica. 
          Raderlo al suolo non serve: puoi trasformarlo in una **AI Piattaforma** (simile a Claude Artifacts o ChatGPT) incapsulando Supabase, scrapper ANAC e parser di file PDF all'interno di 
          <strong> Model Context Protocol (MCP) Servers</strong>. 
          L'LLM diventerà l'orchestratore intelligente che richiama le tue API relazionali sotto forma di "Tool", assemblando risposte, compilando file Excel ed effettuando audit legali complessi in tempo reale.
        </p>
      </div>

      {/* Interactive Schema Visualizer */}
      <div className="bg-black border border-neutral-800 rounded-xl p-6 text-white space-y-6">
        <div>
          <span className="text-[10px] bg-neutral-905 border border-neutral-800 text-brand-gold px-2.5 py-0.5 rounded font-mono">
            ARCHITETTURA DI FLUSSO
          </span>
          <h4 className="font-sans font-bold text-sm text-white mt-2">
            La Topologia MCP: Dal Client al Database Supabase
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center text-xs font-mono">
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 flex flex-col justify-between">
            <div className="font-bold text-white">1. CONTROLLER / UI</div>
            <p className="text-[10px] text-slate-400 font-sans leading-normal">
              La tua Dashboard Gara Master invia i prompt in chat all'orchestratore.
            </p>
            <div className="bg-black p-1.5 rounded text-[10px] text-brand-gold border border-neutral-800">
              React SPA (Custom)
            </div>
          </div>

          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 flex flex-col justify-between">
            <div className="font-bold text-brand-gold">2. MCP HOST</div>
            <p className="text-[10px] text-slate-400 font-sans leading-normal">
              Invia i messaggi all'LLM. Se l'LLM risponde con un "tool_use", l'Host devia l'esecuzione sui server locali.
            </p>
            <div className="bg-black p-1.5 rounded text-[10px] text-brand-gold border border-neutral-800">
              Express + @google/genai
            </div>
          </div>

          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 flex flex-col justify-between">
            <div className="font-bold text-brand-gold">3. MCP SERVERS</div>
            <p className="text-[10px] text-slate-400 font-sans leading-normal">
              Eseguono query su database, analizzano PDF o effettuano scraping per recuperare i documenti d'appalto richiesti.
            </p>
            <div className="bg-black p-1.5 rounded text-[10px] text-brand-gold border border-neutral-800">
              Docker Microservices
            </div>
          </div>

          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 flex flex-col justify-between">
            <div className="font-bold text-brand-gold">4. DATABASES + API</div>
            <p className="text-[10px] text-slate-400 font-sans leading-normal">
              Supabase, PGVector per RAG semantico, e scraping dei portali di gara ANAC / TED.
            </p>
            <div className="bg-black p-1.5 rounded text-[10px] text-brand-gold border border-neutral-800">
              Supa-DB (PostgreSQL)
            </div>
          </div>
        </div>
      </div>

      {/* Tabs / Accordions of Real Production Code in Italian */}
      <div className="space-y-6">
        <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-[#FFD700] flex items-center gap-1.5">
          <Code2 className="w-4 h-4 text-brand-gold" />
          Template di Implementazione Pratica
        </h4>

        {/* 1. MCP Server Creation boilerplate */}
        <div className="bg-black border border-neutral-800 rounded-xl overflow-hidden shadow-3xs" id="code-mcp-server">
          <div className="px-5 py-3 border-b border-neutral-805 bg-neutral-950 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-brand-gold" />
              <span className="font-mono text-xs font-bold text-white">1. Host & Server MCP (TypeScript)</span>
            </div>
            <span className="text-[9px] font-mono text-brand-gold">mcp-server-tender.ts</span>
          </div>
          <div className="p-5 font-mono text-xs bg-neutral-950 text-slate-300 overflow-x-auto leading-relaxed border-b border-neutral-800">
            <pre className="text-[11px] text-slate-300">
{`import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// 1. Inizializza l'MCP Server per Gara Master
const server = new Server(
  { name: "gara-master-connector", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 2. Registra gli strumenti da esporre all'LLM (es. Cerca bandi in database relazionale)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_gare_supabase",
      description: "Interroga il database di Gara Master per recuperare gare corrispondenti ai requisiti aziendali",
      inputSchema: {
        type: "object",
        properties: {
          scadenza_massima_giorni: { type: "number", description: "Escludi gare che scadono prima di N giorni" },
          categoria_soa: { type: "string", description: "Es: OG1, OG3" }
        },
        required: ["categoria_soa"]
      }
    }
  ]
}));

// 3. Gestisci l'esecuzione effettiva richiesta dall'LLM
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_gare_supabase") {
    const { categoria_soa } = request.params.arguments as { categoria_soa: string };
    
    // Esegui la vera chiamata a Supabase o al tuo backend
    return {
      content: [{
        type: "text",
        text: \`Trovate 3 gare in Supabase con categoria \${categoria_soa}.\`
      }]
    };
  }
  throw new Error("Tool non trovato");
});

// Avvia il server tramite standard input-output per connetterlo a Claude/Gemini
const transport = new StdioServerTransport();
await server.connect(transport);`}
            </pre>
          </div>
          <div className="p-4 bg-black text-xs text-slate-400 font-sans leading-relaxed">
            <strong className="text-white">Perché Stdio?</strong> Il protocollo MCP nativo comunica tramite standard input/output (Stdio) o SSE (Server-Sent Events). Utilizzando Stdio, l'applicazione Host (il tuo backend Node in Cloud Run/EC2) può lanciare l'MCP server con una subprocess execution sicura, offrendo i tool all'LLM in tempo reale con overhead vicino allo zero.
          </div>
        </div>

        {/* 2. Supabase SQL with Vector RAG structure */}
        <div className="bg-black border border-neutral-800 rounded-xl overflow-hidden shadow-3xs" id="code-supabase-pgvector">
          <div className="px-5 py-3 border-b border-neutral-805 bg-neutral-950 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-gold" />
              <span className="font-mono text-xs font-bold text-white">2. Supabase Integration (PGVector RAG)</span>
            </div>
            <span className="text-[9px] font-mono text-brand-gold">supabase-schema.sql</span>
          </div>
          <div className="p-5 font-mono text-xs bg-neutral-950 text-slate-300 overflow-x-auto leading-relaxed border-b border-neutral-800">
            <pre className="text-[11px] text-slate-300">
{`-- 1. Attiva l'estensione vector in Supabase
create extension if not exists vector;

-- 2. Crea la tabella per raccogliere gli snippet delle relazioni tecniche passate
create table storico_offerte_tecniche (
  id uuid primary key default gen_random_uuid(),
  bando_nome text not null,
  criterio_titolo text not null,
  contenuto_paragrafo text not null,
  punteggio_ottenuto numeric(5,2),
  embedding vector(1536) -- Modello text-embedding-3 di OpenAI o gemini-embedding-2
);

-- 3. Crea l'indice per la ricerca ad altissima velocità
create index on storico_offerte_tecniche 
using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 4. Funzione SQL per la similarità coseno usata dal tuo MCP server
create or replace function cerca_relazioni_simili (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  bando_nome text,
  criterio_titolo text,
  contenuto_paragrafo text,
  punteggio_ottenuto numeric,
  similarity float
)
language sql stable as $$
  select
    storico_offerte_tecniche.id,
    storico_offerte_tecniche.bando_nome,
    storico_offerte_tecniche.criterio_titolo,
    storico_offerte_tecniche.contenuto_paragrafo,
    storico_offerte_tecniche.punteggio_ottenuto,
    1 - (storico_offerte_tecniche.embedding <=> query_embedding) as similarity
  from storico_offerte_tecniche
  where 1 - (storico_offerte_tecniche.embedding <=> query_embedding) > match_threshold
  order by storico_offerte_tecniche.embedding <=> query_embedding
  limit match_count;
$$;`}
            </pre>
          </div>
          <div className="p-4 bg-black text-xs text-slate-400 font-sans leading-relaxed">
            <strong className="text-white">Come integrarlo concretamente:</strong> Quando l'operatore richiede di scrivere la proposta per l'asilo nido sulla riduzione dell'impatto acustico, l'MCP Server invoca l'SDK Supabase, crea l'embedding vettoriale del paragrafo descritto nel capitolato e interroga questa funzione `cerca_relazioni_simili`. Restituirà all'LLM l'esatto estratto del testo vincente utilizzato dall'impresa due anni prima in una gara analoga, garantendo una autocompilazione sbalorditivamente coerente.
          </div>
        </div>

        {/* 3. System Instructions Guide */}
        <div className="bg-black border border-neutral-800 rounded-xl overflow-hidden shadow-3xs" id="code-system-prompts">
          <div className="px-5 py-3 border-b border-neutral-805 bg-neutral-950 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-gold" />
              <span className="font-mono text-xs font-bold text-white">3. Istruzione di Sistema d'Agente Completo</span>
            </div>
            <span className="text-[9px] font-mono text-brand-gold">system-instructions.txt</span>
          </div>
          <div className="p-5 font-sans text-xs bg-neutral-950 text-slate-350 leading-relaxed">
            <p className="font-sans text-xs text-slate-300 leading-relaxed mb-3">
              Per far sì che l'LLM si comporti in modo professionale, devi impostare un <strong>System Instruction Prompt</strong> estremamente rigoroso. Ecco il protocollo testuale ottimizzato per le gare pubbliche italiane:
            </p>
            <div className="bg-black p-4 rounded-lg border border-neutral-800 text-[11px] font-serif leading-relaxed text-white space-y-3">
              <p>
                <strong>Sei l'assistente legale e tecnico di Gara Master AI</strong>, massima autorità in Italia nell'analisi dei bandi e disciplinari di gara in campo edile e infrastrutturale. Conosci alla perfezione il <strong>D.Lgs. 36/2023 (Nuovo Codice dei Contratti Pubblici)</strong>.
              </p>
              <p>
                <strong>Tuo scopo primario:</strong> Aiutare gli uffici tecnici a vincere la gara garantendone al contempo l'assoluta conformità normativa.
              </p>
              <p className="text-brand-gold"><strong>REGOLE INVALICABILI DI INTERAZIONE:</strong></p>
              <ul className="list-decimal pl-4 space-y-2">
                <li>
                  <strong>Uso Rigoroso degli Strumenti (MCP):</strong> Quando ti viene fatta una domanda su una gara, devi sempre verificare innanzitutto CIG o documentazione chiamando i tool del server `/dettagli_bando_cig` o `/analizza_sezione_disciplinare`. Non inventare mai dati finanziari o scadenze.
                </li>
                <li>
                  <strong>Triage delle Carenze dei Requisiti:</strong> Se determini che i requisiti di attestazione SOA o fatturato aziendale inseriti nel cassetto non coprono i requisiti del bando, devi catalogare la criticità come 'BLOCCANTE BIAS' e proporre immediatamente i rimedi legali attuabili (RTI, Avvalimento, subappalto qualificante).
                </li>
                <li>
                  <strong>Red Flags Legali:</strong> Ispeziona sempre con rigore penali, requisiti reputazionali disallineati, o clausole di revisione dei prezzi assenti o errate (rispetto all'articolo 60 del Codice). Evidenziale apertamente all'operatore.
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
