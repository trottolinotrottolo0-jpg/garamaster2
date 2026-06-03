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
  estimatedDurationDays?: number;
  estimatedDurationMonths?: number;
  estimatedStartDate?: string;
  estimatedEndDate?: string;
  timelineNotes?: string;
  regionalPriceListReference?: string;
  regionalPriceListYear?: number;
  regionalPriceListRegion?: string;
  procedureType?: string;
  sector?: string;
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

/** Categoria SOA estratta da attestazione CCIAA / file importato */
export interface SOACategoria {
  id: string;
  codice: string;
  descrizione: string;
  importoMaxRealizzato: number;
  annoUltimaRealizzazione: number;
  confidenza: number;
}

export type SOAStructuredFonte = "PDF_CCIAA" | "EXCEL" | "MANUALE";
export type SOAStructuredStatoValidazione = "NUOVO" | "VALIDATO" | "RESPINTO";

export interface SOAStructured {
  id: string;
  dataImportazione: string;
  fonte: SOAStructuredFonte;
  fileName: string;
  categorie: SOACategoria[];
  totalCategorie: number;
  importoTotaleMassimoRealizzabile: number;
  noteParsing: string[];
  statoValidazione: SOAStructuredStatoValidazione;
  validazioneManualeNote?: string;
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

export interface TenderOutcomeDetailed extends HistoricalTender {
  marginRealePercent?: number;
  tempoEsecuzioneMesi?: number;
  complessita?: number;
  hasRedFlags?: boolean;
  offertaTecnicaScore?: number;
  tipoProcedura?: string;
  settore?: string;
}

export interface WinningPattern {
  clusterId: string;
  nome: string;
  attributi: {
    regioniTarget: string[];
    categorieSoa: string[];
    importoMin: number;
    importoMax: number;
    tipiProcedura?: string[];
    settori?: string[];
  };
  gareVinteInCluster: TenderOutcomeDetailed[];
  statsVittoria: {
    numeroGarePartecipate: number;
    numeroGareVinte: number;
    tassoDiSuccesso: number;
  };
  statsEconomiche: {
    ribassoMedioVincente: number;
    ribassoMinVincente: number;
    ribassoMaxVincente: number;
    margineAttesoMedioPercent: number;
    margineRealiMedi: number[];
  };
  statsTempi: {
    durataMediaMesi: number;
    tempoDecisioneMediGiorni: number;
  };
  statsRischio: {
    percentualeRiskFlag: number;
    mediaComplessita: number;
  };
  confidence: number;
}

export type WinningPatternRecommendation = "GO_SICURO" | "GO_CAUTO" | "SKIP";

export interface SimilarityScore {
  clusterId: string;
  clusterNome: string;
  similarita: number;
  fattoriMatching: {
    regione: boolean;
    categoria: boolean;
    importoRange: boolean;
    procedura: boolean;
    settore: boolean;
  };
  recomandazione: WinningPatternRecommendation;
  motivazione: string;
  predictionWinRate: number;
}

export interface WinningPatternAnalysis {
  gara: TenderDocument;
  patternsSimilari: SimilarityScore[];
  bestMatchCluster?: SimilarityScore;
  recommendedRibasso?: {
    min: number;
    consigliato: number;
    max: number;
    spiegazione: string;
  };
  recommendedMargin?: {
    min: number;
    target: number;
    max: number;
  };
}

export interface PatternInsights {
  keySuccessFactors: string[];
  risksToAvoid: string[];
  recommendations: string[];
  explanation: string;
}

export interface NicchiaStrategica {
  id: string;
  nome: string;
  descrizione: string;
  priorita: number;
  targetImportoMedio: number;
  targetMargineMedio: number;
}

export interface AreaGeografica {
  id: string;
  regione: string;
  priorita: number;
  hasLogisticsHub: boolean;
}

export interface StrategiaGrowth {
  periodo: "2025" | "2026" | "2027";
  nicchieTarget: NicchiaStrategica[];
  areeTarget: AreaGeografica[];
  importoTargetAnnuale: number;
  margineTargetMedio: number;
  descrizioneVersione: string;
}

export interface FitStrategicProfile {
  id: string;
  strategiaAttiva: StrategiaGrowth;
  storicoStrategie?: StrategiaGrowth[];
  dataCreazione: string;
  dataUltimaModifica: string;
}

export type AwardCriterioTipo =
  | "TECNICO"
  | "ECONOMICO"
  | "SOSTENIBILITA"
  | "GESTIONALE"
  | "ALTRO";

export interface AwardCriterio {
  id: string;
  titolo: string;
  descrizione: string;
  puntiTotali: number;
  peso: number;
  tipoCriterio: AwardCriterioTipo;
  sogliaMinima?: number;
  confidenza: number;
}

export type ReverseMapTipologia =
  | "CERTIFICAZIONE"
  | "ESPERIENZA"
  | "RISORSE"
  | "PIANO"
  | "ALTRA";

export type ReverseMapImpatto = "CRITICO" | "IMPORTANTE" | "UTILE";

export interface ReverseMapVoce {
  id: string;
  criterioId: string;
  descrizione: string;
  tipologia: ReverseMapTipologia;
  obbligatorio: boolean;
  impatto: ReverseMapImpatto;
  note: string;
}

export interface AwardCriteriaAnalysis {
  id: string;
  tender: TenderDocument;
  dataAnalisi: string;
  criteri: AwardCriterio[];
  /** Serializzabile JSON: criterioId → voci reverse mapping */
  reverseMap: Record<string, ReverseMapVoce[]>;
  puntiMassimiTotali: number;
  complessitaValutazione: number;
  fattoriDecisivi: string[];
  note: string[];
}

export interface CompetitorProfile {
  id: string;
  nome: string;
  ragioneSociale: string;
  settoriOperativi: string[];
  regioni: string[];
  importoMedioGare: number;
  winRate: number;
  numeroGareVinte: number;
  numeroGarePartecipate: number;
  garaUltimaVittoria?: string;
  dataUltimoRilevamento: string;
  notaProfilazioneManuale?: string;
}

export interface MarketTrend {
  id: string;
  periodo: string;
  categoria: string;
  regione: string;
  numeroGareEmesse: number;
  importoMedioGara: number;
  importoTotaleMercato: number;
  trendDirezione: "UP" | "DOWN" | "STABILE";
  trendPercent: number;
  prezzomedioBanda: number;
  ribassoMedioPercent: number;
  concentrazioneWinner: number;
}

export type GaraSimilareAggiudicazione =
  | "VINTA"
  | "PERSA"
  | "NON_PARTECIPATA"
  | "SOSPESA";

export interface GaraSimilareHistorica {
  id: string;
  gara: TenderDocument;
  dataEmissione: string;
  dataRisultato: string;
  aggiudicazione: GaraSimilareAggiudicazione;
  winnerName?: string;
  offerteRicevute: number;
  ribassoVincente: number;
  puntiTecnici: number;
  importoAggiudicato: number;
  notaRisultato?: string;
}

export interface MarketIntelligenceSnapshot {
  id: string;
  dataSnapshot: string;
  numeroGareAttiveMonitorate: number;
  numeroCompetitorsTracciati: number;
  trendsMercato: MarketTrend[];
  competitorsTop5: CompetitorProfile[];
  gareSimiliHistoriche: GaraSimilareHistorica[];
  insightsDeepSeek?: {
    summary: string;
    opportunita: string[];
    minacce: string[];
    raccomandazioni: string[];
  };
}

export interface MarketIntelligenceConfig {
  monitoraCategorieTarget: string[];
  regioniTarget: string[];
  competitorsToTrack: string[];
  frequenzaUpdateGiorni: number;
  dataUltimoUpdate: string;
}

export type ComplianceRequirementCategoria =
  | "DOCUMENTALE"
  | "ASSICURATIVA"
  | "CERTIFICAZIONE"
  | "ORGANIZZATIVA"
  | "ALTRO";

export interface ComplianceRequirement {
  id: string;
  titolo: string;
  descrizione: string;
  categoria: ComplianceRequirementCategoria;
  obbligatorio: boolean;
  deadline?: string;
  note: string;
  confidenza: number;
}

export type RiskFattoreCategoria =
  | "LEGALE"
  | "REPUTAZIONALE"
  | "OPERATIVO"
  | "FINANZIARIO"
  | "ALTRO";

export interface RiskFattore {
  id: string;
  nome: string;
  descrizione: string;
  categoria: RiskFattoreCategoria;
  probabilita: number;
  impatto: number;
  score: number;
  mitigazione: string[];
  confidenza: number;
}

export type ComplianceScadenzaStato = "OK" | "ATTENZIONE" | "CRITICA";

export interface ComplianceChecklist {
  id: string;
  gara: TenderDocument;
  dataCreazione: string;
  requirements: ComplianceRequirement[];
  progressoCompletamento: number;
  itemsCompletati: string[];
  scadenze: Array<{
    requirementId: string;
    dataScadenza: string;
    giorni: number;
    stato: ComplianceScadenzaStato;
  }>;
  documentazioneAllegata: Array<{
    requirementId: string;
    fileName: string;
    dataUpload: string;
    nota?: string;
  }>;
}

export type RiskClasse = "BASSO" | "MEDIO" | "ALTO" | "CRITICO";

export interface RiskComplianceProfile {
  id: string;
  gara: TenderDocument;
  dataAnalisi: string;
  riskFactori: RiskFattore[];
  riskComplessivo: number;
  riskClasse: RiskClasse;
  complianceRequirements: ComplianceRequirement[];
  checklist: ComplianceChecklist;
  insightsDeepSeek?: {
    riepilogo: string;
    principaliRischi: string[];
    requisitiCritici: string[];
    raccomandazioni: string[];
  };
}

export type CAMCategoriaTipologia =
  | "MATERIALE"
  | "PROCESSO"
  | "ENERGIA"
  | "RIFIUTI"
  | "TRASPORTO"
  | "ALTRO";

export interface CAMCategoria {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  tipologia: CAMCategoriaTipologia;
  obbligatorio: boolean;
  percentualeMinimaApplicazione?: number;
  scorePunti: number;
  documentazionerichiesta: string[];
  note: string;
}

export interface CAMRequirement {
  id: string;
  titolo: string;
  descrizione: string;
  categoria: CAMCategoria;
  obbligatorio: boolean;
  deadline?: string;
  confidenza: number;
}

export type CAMAssessmentStato =
  | "NON_INIZIATO"
  | "IN_VALUTAZIONE"
  | "CONFORME"
  | "NON_CONFORME";

export interface CAMAssessmentItem {
  requirementId: string;
  titolo: string;
  puntiMassimi: number;
  puntiOttenuti: number;
  stato: CAMAssessmentStato;
  evidenza?: string;
  dataValutazione?: string;
}

export type CAMConformitaComplessiva =
  | "PIENAMENTE_CONFORME"
  | "CONFORME"
  | "PARZIALMENTE_CONFORME"
  | "NON_CONFORME";

export interface CAMComplianceScore {
  id: string;
  gara: TenderDocument;
  dataValutazione: string;
  assessmentItems: CAMAssessmentItem[];
  scoreTotale: number;
  scorePercentuale: number;
  conformitaComplessiva: CAMConformitaComplessiva;
  requisitiObbligatoriCoperti: number;
  totalRequisitiObbligatori: number;
  requisitiMancanti: CAMRequirement[];
  azioniCorrettive: Array<{
    requirementId: string;
    azione: string;
    timeline: string;
    responsabile: string;
  }>;
  insightsDeepSeek?: {
    analisi: string;
    puntiForza: string[];
    puntiDeboli: string[];
    raccomandazioni: string[];
  };
}

export type CAMMiglioramentoEffort = "BASSO" | "MEDIO" | "ALTO";

export interface CAMComplianceProfile {
  id: string;
  gara: TenderDocument;
  dataCreazione: string;
  requirements: CAMRequirement[];
  assessment: CAMComplianceScore;
  miglioramentiPossibili: Array<{
    categoria: string;
    descrizione: string;
    puntiAggiuntivi: number;
    effort: CAMMiglioramentoEffort;
  }>;
}

export type PenaltyClauseTipo =
  | "GIORNALIERA"
  | "RAGGUAGLIATA"
  | "DECURTAZIONE_IMPORTO"
  | "RISOLUZIONE";

export interface PenaltyClause {
  id: string;
  tipo: PenaltyClauseTipo;
  importoGiornaliero: number;
  importoMassimo?: number;
  percentuale?: number;
  giorniToleranza: number;
  descrizione: string;
  note: string;
}

export interface CompanyDelayProfile {
  id: string;
  settore?: string;
  categoria?: string;
  percentualeRitardiStorici: number;
  giorninMedioRitardo: number;
  peggioreRitardo: number;
  confidenzaStima: number;
  fattoriRischio: string[];
}

export type DelayRiskClasse = "BASSO" | "MEDIO" | "ALTO" | "CRITICO";

export interface DelayPenaltyExposure {
  id: string;
  gara: TenderDocument;
  dataAnalisi: string;
  penaltyClauses: PenaltyClause[];
  companyProfile: CompanyDelayProfile;
  durationGiorni: number;
  giorniToleranzaTotale: number;
  probabilitaRitardo: number;
  giorniRitardoAttesi: number;
  penalitaAttesa: number;
  penalitaWorstCase: number;
  penalitaBestCase: number;
  margineStimato: number;
  margineDopoRitardo: number;
  margineDeltaPercent: number;
  riskClasse: DelayRiskClasse;
  recommendation: string;
  insightsDeepSeek?: {
    analisi: string;
    fattoriRischio: string[];
    azioni: string[];
  };
}

export interface DelayRiskIndicator {
  categoria: string;
  regione: string;
  delayRateStorico: number;
  gioriniMedioRitardo: number;
  dataRilevamento: string;
}

export type VariantClauseTipo =
  | "VARIANTE_AUTORIZZABILE"
  | "VARIANTE_DISCREZIONALE"
  | "VARIANTE_VIETATA";

export type ClaimsClauseTipo = "TOTALE" | "PARZIALE" | "LIMITATO" | "NEGATO";

export interface VariantClause {
  id: string;
  titolo: string;
  descrizione: string;
  tipoVariante: VariantClauseTipo;
  percentualeMaxImporto?: number;
  percentualeMaxQuantita?: number;
  proceduaAutorizzazione: string;
  consequenzeNegazione: string;
  note: string;
}

export interface ClaimsClause {
  id: string;
  titolo: string;
  descrizione: string;
  tipoClaimsAccettato: ClaimsClauseTipo;
  percentualeMaxCodifica?: number;
  tempoRivendicazione?: string;
  oneriProva: string;
  consequenze: string;
  note: string;
}

export interface CompanyVariantHistory {
  id: string;
  numeroVariantiRichieste: number;
  numeroVariantiApprovate: number;
  numeroVariantiNegate: number;
  importoMedioVariante: number;
  importoMedioVarianteNegata: number;
  tempoMedioApprovazione: number;
  contestazioniBySA: number;
}

export type VariantRiskClasse = "BASSO" | "MEDIO" | "ALTO" | "CRITICO";

export interface VariantRiskExposure {
  id: string;
  gara: TenderDocument;
  dataAnalisi: string;
  variantClauses: VariantClause[];
  claimsClauses: ClaimsClause[];
  companyProfile: CompanyVariantHistory;
  probabilitaVariantRichiesta: number;
  numeroVariantiStimate: number;
  importoMedioVariantaAttesa: number;
  importoTotaleVariantiAttese: number;
  percentualeApprovazione: number;
  importoVariantiNnegatteAtteso: number;
  probabilitaClaimsRivendicazione: number;
  numeroClaimsAttesi: number;
  importoMedioClaimsAtteso: number;
  importoTotaleClaimsAtteso: number;
  percentualeApprovazioneClaims: number;
  riskClasse: VariantRiskClasse;
  esposizioneTotale: number;
  recommendation: string;
  insightsDeepSeek?: {
    analisi: string;
    rischiPrincipali: string[];
    strategie: string[];
  };
}

export interface VariantClaimsRiskIndicator {
  categoria: string;
  regione: string;
  percentualeVariantiRichieste: number;
  percentualeVariantiApprovate: number;
  importoMedioVariante: number;
  percentualeClaimsRivendicati: number;
  importoMedioClaimsApprovato: number;
  dataRilevamento: string;
}

export type ComplianceChecklistCategoria =
  | "DOCUMENTALE"
  | "ASSICURATIVA"
  | "CERTIFICAZIONE"
  | "TECNICA"
  | "ORGANIZZATIVA";

export type ComplianceChecklistStato =
  | "NON_INIZIATO"
  | "IN_CORSO"
  | "COMPLETATO"
  | "NON_APPLICABILE";

export interface ComplianceChecklistItem {
  id: string;
  categoria: ComplianceChecklistCategoria;
  titolo: string;
  descrizione: string;
  obbligatorio: boolean;
  stato: ComplianceChecklistStato;
  scadenza?: string;
  giorniRimanenti?: number;
  evidenza?: {
    fileName: string;
    dataUpload: string;
    versione: number;
    note?: string;
    checksum?: string;
    fileSize?: number;
  };
  note: string;
}

export interface ComplianceCategory {
  nome: string;
  itemsTotal: number;
  itemsCompletati: number;
  progressoPercent: number;
  itemsCritici: ComplianceChecklistItem[];
}

export type PreSubmissionComplianceRisk = "VERDE" | "GIALLO" | "ROSSO" | "BLOCCANTE";

export type ComplianceIssueSeverity = "INFO" | "WARNING" | "CRITICAL" | "BLOCKING";

export interface ComplianceAuditIssue {
  severity: ComplianceIssueSeverity;
  categoria: string;
  messaggio: string;
  azione: string;
  deadline?: string;
}

export interface PreSubmissionComplianceAudit {
  id: string;
  gara: TenderDocument;
  dataCreazione: string;
  dataUltimaModifica: string;
  checklistItems: ComplianceChecklistItem[];
  categorieBreakdown: ComplianceCategory[];
  completamentoPercent: number;
  itemsObbligatori: number;
  itemsObbligatoriBlocchi: number;
  complianceRisk: PreSubmissionComplianceRisk;
  issuesFound: ComplianceAuditIssue[];
  readyForSubmission: boolean;
  blockingIssues: string[];
  warningIssues: string[];
  insightsDeepSeek?: {
    analisi: string;
    itemsCritici: string[];
    azioni: string[];
  };
}

export type ComplianceDocumentoTipo =
  | "CERTIFICATO"
  | "ASSICURAZIONE"
  | "CV"
  | "PROGETTO"
  | "DICHIARAZIONE"
  | "ALTRO";

export interface ComplianceDocumentation {
  id: string;
  tipoDocumento: ComplianceDocumentoTipo;
  titolo: string;
  descrizione: string;
  fileName: string;
  dataUpload: string;
  scadenza?: string;
  versione: number;
  checksum: string;
  note: string;
}

export interface AuditTrailEntry {
  dataOra: string;
  azione: string;
  utente: string;
  elementoModificato: string;
  statoPrecedente: string;
  statoNuovo: string;
  note?: string;
}

export type QualificationRequirementCategoria =
  | "SOA"
  | "CERTIFICAZIONE"
  | "ASSICURAZIONE"
  | "ESPERIENZA"
  | "CAPITALE"
  | "ORGANIZZATIVA";

export type QualificationRequirementTipo = "OBBLIGATORIO" | "PREFERENZIALE" | "ESCLUSORIO";

export interface QualificationRequirement {
  id: string;
  titolo: string;
  descrizione: string;
  categoria: QualificationRequirementCategoria;
  tipoRequisito: QualificationRequirementTipo;
  soaCategoria?: string;
  soaImportoMinimo?: number;
  certificazioneRichiesta?: string;
  importoAssicurazione?: number;
  anniiEsperienza?: number;
  numeroProgettSimilari?: number;
  capitaleMinimoRichiesto?: number;
  personaleMinimo?: number;
  confidenza: number;
  note: string;
}

export type QualificationMatchStatus = "CONFORME" | "NON_CONFORME" | "PARZIALE" | "VERIFICARE";

export interface CompanyQualificationStatus {
  requirementId: string;
  titolo: string;
  categoria: string;
  status: QualificationMatchStatus;
  evidenza?: string;
  gap?: string;
  azioni: string[];
}

export type QualificationVerdetto =
  | "QUALIFICATO"
  | "QUALIFICATO_PARZIALE"
  | "NON_QUALIFICATO"
  | "ESCLUSORIO";

export interface QualificationGapCritico {
  requirement: string;
  gap: string;
  timeline_colmamento?: string;
  effort: "BASSO" | "MEDIO" | "ALTO";
}

export interface QualificationAssessment {
  id: string;
  gara: TenderDocument;
  dataAnalisi: string;
  requirements: QualificationRequirement[];
  requirementsTotal: number;
  requirementsObbligatori: number;
  requirementsEsclusori: number;
  matchingStatus: CompanyQualificationStatus[];
  conformiObbligatori: number;
  conformiEsclusori: number;
  qualificazioneVerdetto: QualificationVerdetto;
  compliancePercent: number;
  gapsCritici: QualificationGapCritico[];
  poteRTI: boolean;
  requirementsPerRTI: string[];
  recommendation: string;
  insightsDeepSeek?: {
    analisi: string;
    gapsPrincipali: string[];
    pathToQualification: string[];
  };
}

export interface QualificationReadinessPath {
  requirementId: string;
  titolo: string;
  gapAttuali: string;
  azionePer_Colmare: string;
  timeline: string;
  effort: "BASSO" | "MEDIO" | "ALTO";
  costo?: number;
  partner_Necessario?: string;
  priorita: "CRITICA" | "ALTA" | "MEDIA";
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
  soaAttuale?: SOAStructured;
  storicoSOA?: SOAStructured[];

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
  historicalTenders?: TenderOutcomeDetailed[];

  winningPatterns?: WinningPattern[];
  lastPatternAnalysisDate?: string;

  fitStrategicProfile?: FitStrategicProfile;

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
  organizationalCostsEuro?: number;
  administrativeCostsEuro?: number;

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
export type RedFlagCategory =
  | "hyper_detailed_specs"
  | "unbalanced_award_criteria"
  | "anomalous_timeline"
  | "restrictive_requirement_combination"
  | "requisito_sproporzionato"
  | "clausola_sensibile"
  | "rischio_operativo"
  | "rischio_esclusione"
  | "altro";

export interface RedFlagSourceReference {
  documentName?: string;
  pageNumber?: number;
  article?: string;
  clauseTitle?: string;
  excerpt?: string;
  anchorId?: string;
}

export interface RedFlag {
  title: string;
  type: RedFlagCategory | string;
  clause: string;
  articleRef: string;
  severity: RiskLevel;
  simpleExplanation: string;
  remedy: string;
  clarificationText: string;
  sourceReference?: RedFlagSourceReference;
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
  evidence?: import("./types/evidence").EvidenceItemInput[];
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
  organizationalCosts?: {
    amountEuro: number;
    incidencePercentage: number;
    explanation: string;
  };
  administrativeCosts?: {
    amountEuro: number;
    incidencePercentage: number;
    explanation: string;
  };
  productivityImpact?: {
    efficiencyLevel: "alta" | "media" | "bassa" | "non_configurata";
    laborCostAdjustmentPercentage: number;
    riskAdjustment: "riduzione" | "neutro" | "aumento";
    warning: string | null;
    explanation: string;
  };
  estimatedTimeImpact?: {
    durationDays: number | null;
    durationLabel: "breve" | "media" | "lunga" | "non_configurata";
    costAdjustmentEuro: number;
    riskAdjustment: "riduzione" | "neutro" | "aumento";
    warning: string | null;
    explanation: string;
  };
  regionalPriceListReference?: {
    reference: string | null;
    year: number | null;
    region: string | null;
    isConfigured: boolean;
    confidenceImpact: "alta" | "media" | "bassa";
    warning: string | null;
    explanation: string;
  };
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
  evidence?: import("./types/evidence").EvidenceItemInput[];
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
  evidence?: import("./types/evidence").EvidenceItemInput[];
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

// ─── MARKET INTELLIGENCE — COMPETITIVE POSITIONING ──────────────────────────

export interface CompetitivePositioning {
  companyId?: string;
  companyName: string;
  posizione: "LEADER" | "CHALLENGER" | "FOLLOWER" | "NICHE";
  quotaMercato?: number;
  forza: "ALTA" | "MEDIA" | "BASSA";
  fattoriDifferenzianti: string[];
  vulnerabilita: string[];
}

// ─── RISK COMPLIANCE — RISK FACTORS ─────────────────────────────────────────

export interface RiskFactore {
  id: string;
  nome: string;
  categoria: string;
  probabilita: "BASSA" | "MEDIA" | "ALTA";
  impatto: "BASSO" | "MEDIO" | "ALTO";
  descrizione: string;
  mitigazione?: string;
}

// ─── CAM COMPLIANCE ──────────────────────────────────────────────────────────

export type CAMCategoria = "ambientale" | "energetica" | "sociale" | "qualita";

export interface CAMRequirement {
  id: string;
  categoria: CAMCategoria;
  titolo: string;
  descrizione: string;
  obbligatorio: boolean;
  puntiPremiali?: number;
  normaRiferimento?: string;
}

export interface CAMAssessmentItem {
  requirementId: string;
  titolo: string;
  stato: "conforme" | "non_conforme" | "parziale" | "non_applicabile";
  noteConformita?: string;
  documentiNecessari: string[];
}

export interface CAMComplianceScore {
  gara: TenderDocument;
  requirements: CAMRequirement[];
  assessmentItems: CAMAssessmentItem[];
  scoreConformita: number;
  livelloConformita: "ALTO" | "MEDIO" | "BASSO" | "NON_CONFORME";
  criticitaRilevate: string[];
  raccomandazioni: string[];
  generatedAt: string;
}

export interface CAMComplianceProfile {
  gara: TenderDocument;
  score: CAMComplianceScore;
  categoriePresenti: CAMCategoria[];
  rischio: "basso" | "medio" | "alto";
  note?: string;
}

// ─── DELAY & PENALTY EXPOSURE ────────────────────────────────────────────────

export type PenaltyClauseType =
  | "ritardo_consegna"
  | "ritardo_esecuzione"
  | "inadempimento"
  | "qualita"
  | "sicurezza"
  | "altro";

export interface PenaltyClause {
  id: string;
  tipo: PenaltyClauseType;
  descrizione: string;
  importoGiornaliero?: number;
  importoFisso?: number;
  percentualeImporto?: number;
  giorniTolleranza: number;
  importoMassimo?: number;
  articoloRiferimento?: string;
}

export interface CompanyDelayProfile {
  mediaGiorniRitardo: number;
  percentualeGareConRitardo: number;
  ritardoMaxStorico: number;
  causeRitardoFrequenti: string[];
}

export interface DelayRiskIndicator {
  fattore: string;
  peso: number;
  valore: number;
  contributo: number;
}

export type DelayRiskClasse = "BASSO" | "MEDIO" | "ALTO" | "CRITICO";

export interface DelayPenaltyExposure {
  gara: TenderDocument;
  penaltyClauses: PenaltyClause[];
  giorniRitardoProbabili: number;
  penalitaAttesa: number;
  penalitaWorstCase: number;
  margineDopoRitardo: number;
  riskIndicators: DelayRiskIndicator[];
  riskClasse: DelayRiskClasse;
  mitigazioni: string[];
  generatedAt: string;
}

// ─── VARIANTS & CLAIMS RISK ──────────────────────────────────────────────────

export interface VariantClause {
  id: string;
  tipoVariante: string;
  descrizione: string;
  percentualeMassima?: number;
  approvazioneDirettore: boolean;
  giustificazioneRichiesta: boolean;
  articoloRiferimento?: string;
}

export interface ClaimsClause {
  id: string;
  tipoReclamo: string;
  descrizione: string;
  terminePresentazione: number;
  proceduraPresentazione?: string;
  articoloRiferimento?: string;
}

export interface CompanyVariantHistory {
  percentualeVariantiStoria: number;
  percentualeClaimsApprovati: number;
  importoMedioVarianti: number;
}

export type VariantRiskClasse = "BASSO" | "MEDIO" | "ALTO" | "CRITICO";

export interface VariantRiskExposure {
  gara: TenderDocument;
  variantClauses: VariantClause[];
  claimsClauses: ClaimsClause[];
  importoVariantiAtteso: number;
  importoVariantiNnegatteAtteso: number;
  claimsNonApprovati: number;
  esposizioneTotale: number;
  riskClasse: VariantRiskClasse;
  strategie: string[];
  generatedAt: string;
}

export interface VariantClaimsRiskIndicator {
  fattore: string;
  livello: VariantRiskClasse;
  note: string;
}

// ─── PRE-SUBMISSION COMPLIANCE AUDIT ────────────────────────────────────────

export type ComplianceCategory =
  | "documentazione"
  | "qualificazioni"
  | "economico_finanziario"
  | "tecnico_professionale"
  | "dichiarazioni"
  | "cauzione"
  | "altro";

export interface ComplianceChecklistItem {
  id: string;
  categoria: ComplianceCategory;
  titolo: string;
  descrizione: string;
  obbligatorio: boolean;
  completato: boolean;
  note?: string;
  dataScadenza?: string;
  documentiRichiesti: string[];
}

export interface AuditTrailEntry {
  timestamp: string;
  azione: string;
  itemId?: string;
  utente?: string;
}

export interface ComplianceDocumentation {
  itemId: string;
  fileName: string;
  uploadedAt: string;
  verificato: boolean;
}

export interface PreSubmissionComplianceAuditResult {
  gara: TenderDocument;
  items: ComplianceChecklistItem[];
  completamentoPercent: number;
  verdetto: "GO" | "GO_WITH_CAUTION" | "STOP";
  criticitaBloccanti: string[];
  promemoria: string[];
  auditTrail: AuditTrailEntry[];
  documentazione: ComplianceDocumentation[];
  generatedAt: string;
}

// ─── QUALIFICATION READINESS ─────────────────────────────────────────────────

export type QualificationRequirementTipo =
  | "SOA"
  | "ISO"
  | "fatturato"
  | "referenze"
  | "personale"
  | "attrezzature"
  | "assicurazioni"
  | "antimafia"
  | "altro";

export interface QualificationRequirement {
  id: string;
  tipo: QualificationRequirementTipo;
  descrizione: string;
  soglia?: string;
  obbligatorio: boolean;
  articoloRiferimento?: string;
}

export type QualificationStatusValore =
  | "SODDISFATTO"
  | "PARZIALE"
  | "MANCANTE"
  | "NON_VERIFICABILE";

export interface CompanyQualificationStatus {
  requirementId: string;
  status: QualificationStatusValore;
  note?: string;
  documentoDisponibile?: boolean;
}

export interface QualificationAssessment {
  gara: TenderDocument;
  requirements: QualificationRequirement[];
  matchingStatus: CompanyQualificationStatus[];
  compliancePercent: number;
  requirementsTotal: number;
  gapsCritici: string[];
  gapsColmabili: string[];
  raccomandazioneFinale:
    | "PARTECIPA"
    | "PARTECIPA_CON_RTI"
    | "AVVALIMENTO"
    | "NON_PARTECIPARE";
  generatedAt: string;
}

export interface QualificationReadinessPath {
  stepId: string;
  azione: string;
  priorita: "alta" | "media" | "bassa";
  tempoStimato: string;
  gapColmato: string;
}
