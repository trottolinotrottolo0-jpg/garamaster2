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

export interface ExplainabilityData {
  perche: string;
  datiUsati: string;
  verifica: string;
  confidenza: string;
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

// ─── PREZZARI REGIONALI ─────────────────────────────────────────────────────

export interface VocePrezzario {
  id: string;
  codice: string;
  descrizione: string;
  um: string;
  prezzo: number;
  categoria?: string;
}

export interface Prezzario {
  id: string;
  nome: string;
  regione: string;
  anno: number;
  fonte: string;
  voci: VocePrezzario[];
  dataCreazione: string;
  dataUltimAggiornamento: string;
  note?: string;
}

export interface ExtractedVocePrezzario {
  codice: string;
  descrizione: string;
  um: string;
  prezzo: number;
  categoria?: string;
  confidenza: number;
}

export interface ParsePrezzarioPdfResponse {
  success: boolean;
  vocieEstratte: ExtractedVocePrezzario[];
  totaleVoci: number;
  regioneRilevata?: string;
  annoRilevato?: number;
  erroriEstrazione: string[];
  messaggioEsito: string;
}

export interface VoceScorporata {
  voceOriginalId: string;
  voceOriginale: VocePrezzario;
  voceScorporata: VocePrezzario;
  operazione: string;
  confidenza: number;
}

export interface MappingVociSimilari {
  vocePrezzario1Id: string;
  vocePrezzario2Id: string;
  prezzario1Nome: string;
  prezzario2Nome: string;
  descrizione1: string;
  descrizione2: string;
  prezzo1: number;
  prezzo2: number;
  deltaPrezzoPercent: number;
  similarita: number;
  suggerimentoUnificazione: boolean;
}

export interface ScorporoResult {
  voceOriginaleId: string;
  voceOriginale: VocePrezzario;
  vocieScorprate: VocePrezzario[];
  successoScorporo: boolean;
  motivazione: string;
}

export interface ComputoMetricoVoce {
  id: string;
  codice?: string;
  descrizione: string;
  um: string;
  quantita: number;
  prezzoUnitarioStimato: number;
}

export interface ColllegamentoComputoPrezzario {
  computoVoceId: string;
  prezzarioVoceId: string;
  computoDescrizione: string;
  prezzarioDescrizione: string;
  um: string;
  quantita: number;
  prezzoComputo: number;
  prezzoPrezzario: number;
  deltaPercent: number;
  similarita: number;
  collegato: boolean;
}

export interface AggiornamentoPrezzoVoce {
  voceId: string;
  prezzoVecchio: number;
  prezzoNuovo: number;
  motivazione: string;
  dataAggiornamento: string;
}

export interface PricingLineItem extends VocePrezzario {
  qta: number;
  produttivita: number;
  importoPrezzario?: number;
  importoInterno?: number;
}

// ─── COMPANY PROFILE ────────────────────────────────────────────────────────

export type GeographicArea =
  | "Nord-Ovest" | "Nord-Est" | "Centro" | "Sud" | "Isole" | "Nazionale";

export type WorkSector =
  | "Edilizia civile" | "Edilizia industriale" | "Infrastrutture"
  | "Impianti" | "Restauro" | "Verde pubblico" | "Strade e autostrade"
  | "Idraulica" | "Bonifica" | "Altro";

export type CompanyResourceType = "mezzo" | "attrezzatura" | "risorsa_tecnica" | "altro";

export type CompanyResourceAvailability =
  | "disponibile"
  | "parzialmente_disponibile"
  | "occupato"
  | "non_disponibile";

export interface CompanyAvailableResource {
  id: string;
  name: string;
  type: CompanyResourceType;
  quantity: string;
  availability: CompanyResourceAvailability;
  notes?: string;
}

export type CompanyTenderOutcome = "vinta" | "persa" | "partecipata";

export interface CompanyTenderHistoryItem {
  id: string;
  title: string;
  ente: string;
  category: string;
  amount: number | null;
  year: number | null;
  outcome: CompanyTenderOutcome;
  notes?: string;
}

export interface CompanySimilarWork {
  id: string;
  title: string;
  category: string;
  amount: number | null;
  location: string;
  year: number | null;
  description?: string;
}

export type CompanyActiveProjectStatus =
  | "avvio"
  | "operativo"
  | "quasi_completato"
  | "sospeso";

export interface CompanyActiveProject {
  id: string;
  title: string;
  category: string;
  amount: number | null;
  location: string;
  status: CompanyActiveProjectStatus;
  startDate?: string;
  expectedEndDate?: string;
  notes?: string;
}

export type PreferredTenderSize = "piccole" | "medie" | "grandi";
export type PreferredWorkType = "pubblici" | "privati" | "misti";
export type OperationalRiskTolerance = "basso" | "medio" | "alto";
export type SaturationPreference = "conservativa" | "bilanciata" | "aggressiva";
export type PreferredProjectDuration = "breve" | "media" | "lunga";

export interface CompanyOperationalPreferences {
  preferredTenderSize?: PreferredTenderSize;
  preferredWorkType?: PreferredWorkType;
  operationalRiskTolerance?: OperationalRiskTolerance;
  saturationPreference?: SaturationPreference;
  preferredProjectDuration?: PreferredProjectDuration;
  prefersLocalProjects?: boolean;
  availableForTransfers?: boolean;
  preferredCategories?: string[];
  strategicNotes?: string;
}

export type ExecutionSpeed = "lenta" | "standard" | "veloce";
export type OrganizationalEfficiency = "bassa" | "media" | "alta";

export interface CompanyProductivityData {
  averageTeamProductivity?: number | null;
  concurrentProjectsCapacity?: number | null;
  averageWeeklyOperationalHours?: number | null;
  executionSpeed?: ExecutionSpeed;
  organizationalEfficiency?: OrganizationalEfficiency;
  concurrentTenderManagementCapacity?: number | null;
  operationalNotes?: string;
}

export type MarginDataReliability = "basso" | "medio" | "alto";

export interface CompanyHistoricalMargin {
  id: string;
  category: string;
  averageMarginPercentage: number | null;
  analyzedProjectsCount?: number | null;
  reliability?: MarginDataReliability;
  notes?: string;
}

export type TenderOutcome = "vinta" | "persa" | "ritirata" | "in_corso";

export interface HistoricalTender {
  id: string;
  anno: number;
  categoriaSOA: string;
  importoGara: number;
  regioneGara: string;
  ribasso: number;
  esito: TenderOutcome;
  margineRealizzato?: number;
  noteGara?: string;
}

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
  oreGiornaliereSquadra: number;
  rendimentoSquadrePercent: number;
  giorniLavorativiSettimana: number;
  durataMediaCantieriMesi: number;

  // Mezzi e risorse operative
  availableResources?: CompanyAvailableResource[];

  // Storico gare strutturato
  tenderHistory?: CompanyTenderHistoryItem[];

  // Storico lavori simili
  similarWorks?: CompanySimilarWork[];

  // Lavori / cantieri in corso
  activeProjects?: CompanyActiveProject[];

  // Preferenze operative strategiche
  operationalPreferences?: CompanyOperationalPreferences;

  // Produttività interna
  productivityData?: CompanyProductivityData;

  // Margini storici per categoria
  historicalMargins?: CompanyHistoricalMargin[];

  // Archivio gare passate strutturato
  historicalTenders?: HistoricalTender[];

  prezzariAttivi?: string[];
  prezzarioPreferito?: string;

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
  fattoreProduttivita: number;
  costoManodoperaStimato: number;
  margineCorrettoPercent: number;
  margineCorrettoEuro: number;
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
  impattoProduttivita: string;
  fattoreProduttivitaGlobale: number;
  avvertenzaProduttivita: boolean;
  generatedAt: string;
  explainability?: ExplainabilityData;
}

// ─── RED FLAG & CLAUSE RISK ENGINE ──────────────────────────────────────────

export type RiskLevel = "high" | "medium" | "low";

export interface RedFlag {
  title: string;
  type: string;
  clause: string;
  articleRef: string;
  severity: RiskLevel;
  simpleExplanation: string;
  remedy: string;
  clarificationText: string;
}

export interface RedFlagAnalysisResult {
  redFlags: RedFlag[];
  rischioComplessivo: RiskLevel;
  conteggioHigh: number;
  conteggioMedium: number;
  conteggioLow: number;
  sintesiRischio: string;
  generatedAt: string;
  explainability?: ExplainabilityData;
}

// ─── CAPACITY & SATURATION ENGINE ───────────────────────────────────────────

export type CapacityVerdict = "SOSTENIBILE" | "CRITICA" | "NON_SOSTENIBILE";

export interface CapacityAnalysisResult {
  verdict: CapacityVerdict;
  scoreCapacita: number;
  rischioSaturazione: "basso" | "medio" | "alto";
  motivazioneSintetica: string;
  squadreDisponibili: number;
  caricoAttualePercent: number;
  caricoDopoGaraPercent: number;
  puntiForza: string[];
  criticitaOperative: string[];
  analisiCompatibilita: string;
  produttivitaAnalisi: string;
  oreDisponibiliStimate: number;
  oreRichiesteStimate: number;
  produttivitaSufficiente: boolean;
  tempiAnalisi: string;
  durataGaraStimataSettimane: number;
  meseLiberazioneRisorse: number;
  compatibilitaTemporale: "ottima" | "accettabile" | "critica" | "incompatibile";
  sovrapposizioneRischio: boolean;
  rischioAlert: string | null;
  suggerimentoOperativo: string;
  generatedAt: string;
  explainability?: ExplainabilityData;
}

// ─── PROFITABILITY GATE ──────────────────────────────────────────────────────

export type ProfitabilityVerdict = "PROFITTEVOLE" | "BORDERLINE" | "PERICOLOSA";

export interface CostBreakdownItem {
  categoria: string;
  importoStimato: number;
  percentualeImporto: number;
  note: string;
}

export interface ProfitabilityGateResult {
  verdict: ProfitabilityVerdict;
  scoreProfittabilita: number;
  margineAttesoPercent: number;
  margineAttesoEuro: number;
  breakdownCosti: CostBreakdownItem[];
  costoTotaleStimato: number;
  rischioEconomico: "basso" | "medio" | "alto";
  motivazione: string;
  alertMargineInsufficiente: boolean;
  alertMargineNegativo: boolean;
  alertText: string | null;
  scenarioOttimistico: number;
  scenarioRealistico: number;
  scenarioPessimistico: number;
  puntiAttenzione: string[];
  generatedAt: string;
  explainability?: ExplainabilityData;
}

// ─── BID/NO-BID ENGINE ──────────────────────────────────────────────────────

export type BidDecision = "GO" | "CAUTELA" | "NO-GO";

export interface SOADecisionDetail {
  categorieRichieste: string[];
  categorieImpresa: string[];
  categorieCompatibili: string[];
  categorieGap: string[];
  classificaAdeguata: boolean;
  classificaRichiesta: string;
  classificaPosseduta: string;
  incrementoQuintoApplicabile: boolean;
  esito: "PIENA_COPERTURA" | "COPERTURA_PARZIALE" | "GAP_COLMABILE" | "GAP_CRITICO";
  motivazione: string;
  azioneConsigliata: string;
}

export interface CapacityDecisionDetail {
  squadreDisponibili: number;
  cantierInCorso: number;
  dipendentiLiberi: number;
  caricoAttualePercent: number;
  caricoDopoGaraPercent: number;
  fabbisognoSquadreGara: number;
  rischioSaturazione: "basso" | "medio" | "alto";
  esito: "CAPACITA_PIENA" | "CAPACITA_SUFFICIENTE" | "CAPACITA_LIMITATA" | "CAPACITA_INSUFFICIENTE";
  motivazione: string;
  azioneConsigliata: string;
}

export interface LavoriInCorsoDecisionDetail {
  numeroCantieriAttivi: number;
  cantieriCritici: string[];
  cantieriCompatibili: string[];
  impattoCaricoLavoro: "nessuno" | "lieve" | "moderato" | "critico";
  rischioInterferenza: boolean;
  risorseSottratte: string[];
  esito: "NESSUN_CONFLITTO" | "CONFLITTO_GESTIBILE" | "CONFLITTO_CRITICO" | "CONFLITTO_BLOCCANTE";
  motivazione: string;
  azioneConsigliata: string;
}

export interface TempiDecisionDetail {
  durataGaraStimataSettimane: number;
  scadenzaOffertaGiorni: number;
  tempoPreparazioneNecessarioGiorni: number;
  tempoPreparazioneDisponibileGiorni: number;
  preparazioneRealistica: boolean;
  sovrapposizioneCantieri: "nessuna" | "parziale" | "totale";
  esito: "TEMPI_OTTIMALI" | "TEMPI_ACCETTABILI" | "TEMPI_STRETTI" | "TEMPI_IMPOSSIBILI";
  motivazione: string;
  azioneConsigliata: string;
}

export interface RischioOperativoDecisionDetail {
  complessitaEsecutiva: "bassa" | "media" | "alta" | "molto_alta";
  rischioLogistico: "basso" | "medio" | "alto";
  rischioTempistico: "basso" | "medio" | "alto";
  rischioSubappalto: "basso" | "medio" | "alto";
  fattoriRischio: string[];
  fattoriMitigazione: string[];
  scoreRischioOperativo: number;
  esito: "RISCHIO_BASSO" | "RISCHIO_ACCETTABILE" | "RISCHIO_ELEVATO" | "RISCHIO_CRITICO";
  motivazione: string;
  azioneConsigliata: string;
}

export interface RischioDocumentaleDecisionDetail {
  complessitaDocumentale: "bassa" | "media" | "alta" | "molto_alta";
  documentiCritici: string[];
  rischioEsclusione: "basso" | "medio" | "alto";
  requisitiDifficili: string[];
  tempoPreparazioneDocumenti: "sufficiente" | "stretto" | "critico";
  scoreRischioDocumentale: number;
  esito: "DOCUMENTAZIONE_SEMPLICE" | "DOCUMENTAZIONE_GESTIBILE" | "DOCUMENTAZIONE_COMPLESSA" | "DOCUMENTAZIONE_CRITICA";
  motivazione: string;
  azioneConsigliata: string;
}

export interface StoricoSimileDecisionDetail {
  gareSimilariTrovate: number;
  tassoDiSuccessoCategoria: number;
  ribassoMedioCategoria: number;
  margineAttesoStorico: number;
  garePertinenti: {
    anno: number;
    importo: number;
    ribasso: number;
    esito: TenderOutcome;
    categoria: string;
  }[];
  confidenzaAnalisi: "alta" | "media" | "bassa" | "nessuna";
  esito: "STORICO_FAVOREVOLE" | "STORICO_NEUTRO" | "STORICO_SFAVOREVOLE" | "STORICO_ASSENTE";
  motivazione: string;
  azioneConsigliata: string;
}

export interface BidNoBidResult {
  decision: BidDecision;
  scoreComplessivo: number;
  motivazioneSintetica: string;
  motiviPro: string[];
  motiviContro: string[];
  criticitaPrincipale: string;
  suggerimento: string;
  soaCompatibile: boolean;
  soaDetail: SOADecisionDetail;
  capacitaSufficiente: boolean;
  capacitaDetail: CapacityDecisionDetail;
  lavoriInCorsoDetail: LavoriInCorsoDecisionDetail;
  tempiDetail: TempiDecisionDetail;
  rischioOperativoDetail: RischioOperativoDecisionDetail;
  rischioDocumentaleDetail: RischioDocumentaleDecisionDetail;
  storicoSimileDetail: StoricoSimileDecisionDetail;
  areaGeograficaOk: boolean;
  importoInTarget: boolean;
  generatedAt: string;
  explainability?: ExplainabilityData;
}

// ─── RTI & AVVALIMENTO CONFIGURATOR ─────────────────────────────────────────

export type RtiAvvalimentoRaccomandazione =
  | "RTI"
  | "AVVALIMENTO"
  | "LASCIARE_PERDERE"
  | "PARTECIPARE_DIRETTA";

export interface RtiAvvalimentoPercorso {
  consigliato: boolean;
  motivazione: string;
  documenti: string[];
}

export interface RtiAvvalimentoRtiDetail extends RtiAvvalimentoPercorso {
  struttura: string;
  capogruppo: string;
  quotePartecipazione: string;
  partnerSuggeriti: string[];
}

export interface RtiAvvalimentoAvvalimentoDetail extends RtiAvvalimentoPercorso {
  riferimentoNormativo: string;
  requisitiDaAvvalere: string[];
  impreseAusiliarie: string[];
  limiti: string;
}

export interface RtiAvvalimentoLasciareDetail extends RtiAvvalimentoPercorso {
  rischiPrincipali: string[];
}

export interface RtiAvvalimentoResult {
  raccomandazioneFinale: RtiAvvalimentoRaccomandazione;
  sintesi: string;
  gapSoa: string[];
  rti: RtiAvvalimentoRtiDetail;
  avvalimento: RtiAvvalimentoAvvalimentoDetail;
  lasciarePerdere: RtiAvvalimentoLasciareDetail;
  perche: string;
  datiUsati: string;
  verifica: string;
  confidenza: string;
  generatedAt?: string;
}
