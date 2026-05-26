export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  url: string;
  connected: boolean;
  tools: McpTool[];
}

export interface PacketLog {
  id: string;
  timestamp: string;
  direction: "client-to-host" | "host-to-server" | "server-to-host" | "host-to-llm" | "llm-to-host";
  service: string;
  payload: any;
}

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
}

export interface Message {
  id: string;
  sender: "user" | "assistant" | "system" | "mcp-call";
  text: string;
  timestamp: Date;
  attachments?: ChatAttachment[];
  toolUsage?: {
    toolName: string;
    params: any;
    result: any;
  };
}

export interface TenderRequirement {
  category: "SOA" | "ISO" | "Fatturato" | "Referenze" | "Altro";
  description: string;
  satisfied: boolean;
  details: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  importance: "high" | "medium" | "low";
  summary: string;
  originalTextSnippet: string;
  scoreWeight?: string; // e.g. "30 Punti" or "25 Punti"
}

export interface TenderDocument {
  id: string;
  title: string;
  cig: string;
  region: string;
  value: string;
  category: string;
  deadline: string;
  requirements: TenderRequirement[];
  sections: DocumentSection[];
  anomalies: string[];
  penalties: string[];
}

// ─── SOA FOUNDATION TYPES ───────────────────────────────────────────────────

export type SOACategoryCode =
  | "OG1" | "OG2" | "OG3" | "OG4" | "OG5" | "OG6" | "OG7" | "OG8"
  | "OG9" | "OG10" | "OG11" | "OG12" | "OG13"
  | "OS1" | "OS2-A" | "OS2-B" | "OS3" | "OS4" | "OS5" | "OS6"
  | "OS7" | "OS8" | "OS9" | "OS10" | "OS11" | "OS12-A" | "OS12-B"
  | "OS13" | "OS14" | "OS15" | "OS16" | "OS17" | "OS18-A" | "OS18-B"
  | "OS19" | "OS20-A" | "OS20-B" | "OS21" | "OS22" | "OS23" | "OS24"
  | "OS25" | "OS26" | "OS27" | "OS28" | "OS29" | "OS30" | "OS31"
  | "OS32" | "OS33" | "OS34" | "OS35";

export type SOAClassifica = "I" | "II" | "III" | "III-bis" | "IV" | "IV-bis" | "V" | "VI" | "VII" | "VIII";

export interface SOACategory {
  code: SOACategoryCode;
  classifica: SOAClassifica;
  expiryDate: string; // ISO date string "YYYY-MM-DD"
  isScorporabile?: boolean;
  isPrevale?: boolean;
}

// ─── COMPANY PROFILE ────────────────────────────────────────────────────────

export type GeographicArea =
  | "Nord-Ovest" | "Nord-Est" | "Centro" | "Sud" | "Isole" | "Nazionale";

export type WorkSector =
  | "Edilizia civile" | "Edilizia industriale" | "Infrastrutture"
  | "Impianti" | "Restauro" | "Verde pubblico" | "Strade e autostrade"
  | "Idraulica" | "Bonifica" | "Altro";

export interface CompanyProfile {
  // Anagrafica
  companyName: string;
  vatNumber: string;
  legalForm: string;
  foundedYear: number;

  // SOA
  soaCategories: SOACategory[];
  soaAttestatoreName?: string;

  // Operatività
  geographicAreas: GeographicArea[];
  workSectors: WorkSector[];
  targetImportMin: number;
  targetImportMax: number;

  // Capacità
  employeesCount: number;
  activeSquads: number;
  activeJobsites: number;

  // Economici
  lastYearRevenue: number;
  avgMarginPercent: number;

  // Storico ribassi e pricing
  avgRibassoPercent: number;
  avgWinRatePercent: number;
  minMargineAccettabile: number;

  // Costi interni
  costoOraOperaio: number;
  costoOraCaposquadra: number;
  incidenzaSpeseGenerali: number;
  incidenzaRischioMedio: number;

  // Storico libero
  historicalNotes: string;

  // Metadata
  lastUpdated: string; // ISO date string
}

// ─── BID PRICING ENGINE ─────────────────────────────────────────────────────

export interface PricingScenario {
  ribasso: number;
  importoOfferto: number;
  margineStimato: number;
  margineEuro: number;
  label: "Aggressivo" | "Bilanciato" | "Conservativo" | "Personalizzato";
  rischioAlert: boolean;
}

export interface BidPricingResult {
  rangeMinRibasso: number;
  rangeMaxRibasso: number;
  ribassoOttimale: number;
  scenari: PricingScenario[];
  motivazioneRange: string;
  alertMargine: boolean;
  alertText: string;
  winRatePrudente: number;
  winRateMotivazione: string;
  generatedAt: string;
}

// ─── BID/NO-BID ENGINE ──────────────────────────────────────────────────────

export type BidDecision = "GO" | "CAUTELA" | "NO-GO";

export interface BidNoBidResult {
  decision: BidDecision;
  scoreComplessivo: number;
  motivazioneSintetica: string;
  motiviPro: string[];
  motiviContro: string[];
  criticitaPrincipale: string;
  suggerimento: string;
  soaCompatibile: boolean;
  capacitaSufficiente: boolean;
  areaGeograficaOk: boolean;
  importoInTarget: boolean;
  generatedAt: string;
}
