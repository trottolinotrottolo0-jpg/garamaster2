/// <reference types="vite/client" />
import { EXPLAINABILITY_JSON_INLINE, normalizeExplainability } from "./explainability";
import { EVIDENCE_JSON_INLINE, EVIDENCE_PROMPT_BLOCK, peelEvidenceFromParsed } from "./evidence";
import type { EvidenceItemInput } from "../types/evidence";
import type {
  TenderDocument,
  CompanyProfile,
  BidNoBidResult,
  BidPricingResult,
  PricingScenario,
  RedFlagAnalysisResult,
  CapacityAnalysisResult,
  ProfitabilityGateResult,
  ExplainabilityData,
  ParsePrezzarioPdfResponse,
  VocePrezzario,
  ScorporoResult,
  RedFlag,
  RedFlagSourceReference,
  WinningPattern,
  PatternInsights,
  FitStrategicProfile,
  AwardCriterio,
  ReverseMapVoce,
  MarketIntelligenceSnapshot,
  RiskComplianceProfile,
  CAMComplianceProfile,
  DelayPenaltyExposure,
  VariantRiskExposure,
  PreSubmissionComplianceAudit,
  QualificationAssessment,
} from "../types";
import type {
  AntimafiaComplianceCheck,
  InsuranceFinancialRisk,
  ComplianceDocumentationTracker,
} from "./riskComplianceEngine";
import { parseTenderValue } from "./bidCalculations";
import { requestParsePrezzario } from "./parsePrezzarioApi";
import {
  calcolaBreakdownDaPrezzario,
  calcProductivityImpact,
  summarizePrezzarioVoci,
  vociDaPrezzarioPerPricing,
} from "./bidCalculations";
import type { PricingLineItem } from "../types";
import { mergeEvidenceLists, redFlagToEvidence } from "./evidence";
import {
  normalizeRedFlagCategory,
  resolveRedFlagExplainability,
} from "./redFlagNormalization";

/**
 * Parser robusto per JSON da DeepSeek
 * Estrae primo { } o [ ] anche se la risposta ha testo/markdown/fence
 * Gestisce ```json, ```, spazi, prefissi vari
 */
function extractJsonFromLlmResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  return cleaned;
}

/**
 * Parse JSON con fallback robusto
 */
export function parseGeminiJson<T extends object>(
  text: string
): T & { explainability?: ExplainabilityData; evidence?: EvidenceItemInput[] } {
  const extracted = extractJsonFromLlmResponse(text);
  const parsed = JSON.parse(extracted) as Record<string, unknown>;
  const explainability = normalizeExplainability(
    parsed.explainability as Partial<ExplainabilityData> | undefined
  ) ?? undefined;
  delete parsed.explainability;
  const evidence = peelEvidenceFromParsed(parsed);
  return { ...(parsed as T), explainability, evidence: evidence.length ? evidence : undefined };
}

async function callInternalLlm(prompt: string, opts?: { temperature?: number; maxTokens?: number }) {
  const response = await fetch("/api/internal-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      temperature: opts?.temperature ?? 0.35,
      maxTokens: opts?.maxTokens ?? 8000,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error ?? data?.message ?? "Errore internal-llm";
    throw new Error(String(message));
  }

  const text = data?.text;
  if (!text || typeof text !== "string") {
    throw new Error("LLM non ha restituito testo.");
  }
  return text.trim();
}

export async function runBidNoBid(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<BidNoBidResult> {
  const prompt = `Sei un motore decisionale esperto in gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Prima di rispondere, ragiona internamente in modo approfondito su tutti i fattori rilevanti.
Analizza la compatibilità tra il profilo dell'impresa e la gara con massima precisione.

Il tuo output deve essere SOLO un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo prima o dopo.
Ogni campo stringa deve essere dettagliato e motivato, non generico.
motiviPro e motiviContro devono avere almeno 3 elementi ciascuno quando i dati lo consentono.
motivazioneSintetica deve essere 2-3 frasi precise, non una riga vaga.
suggerimento deve essere un'azione operativa concreta (es. "Attiva avvalimento per OG3 classifica IV tramite impresa ausiliaria — verifica art. 104 D.Lgs. 36/2023").

Il JSON deve rispettare esattamente questa struttura:
{
  "decision": "GO" | "CAUTELA" | "NO-GO",
  "scoreComplessivo": number (0-100),
  "motivazioneSintetica": string,
  "motiviPro": string[],
  "motiviContro": string[],
  "criticitaPrincipale": string,
  "suggerimento": string,
  "soaCompatibile": boolean,
  "soaDetail": {
    "categorieRichieste": string[] (categorie SOA che la gara richiede, estrai dai requisiti),
    "categorieImpresa": string[] (categorie SOA del profilo impresa, lista codici),
    "categorieCompatibili": string[] (intersezione: categorie richieste che l'impresa ha),
    "categorieGap": string[] (categorie richieste che mancano all'impresa),
    "classificaAdeguata": boolean (la classifica copre l'importo gara?),
    "classificaRichiesta": string (es. "III-bis" basata sull'importo gara),
    "classificaPosseduta": string (classifica più alta posseduta per la categoria prevalente),
    "incrementoQuintoApplicabile": boolean (il +20% ex art. 104 D.Lgs. 36/2023 copre il gap di classifica?),
    "esito": "PIENA_COPERTURA" | "COPERTURA_PARZIALE" | "GAP_COLMABILE" | "GAP_CRITICO",
    "motivazione": string (2-3 frasi leggibili sull'analisi SOA),
    "azioneConsigliata": string (azione concreta: avvalimento, RTI, nessuna, non partecipare)
  },
  "capacitaSufficiente": boolean,
  "capacitaDetail": {
    "squadreDisponibili": number (stima squadre libere = activeSquads - activeJobsites*1.2, mai sotto 0),
    "cantierInCorso": number (activeJobsites dal profilo),
    "dipendentiLiberi": number (employeesCount - activeJobsites*3, mai sotto 0),
    "caricoAttualePercent": number (% carico attuale 0-100),
    "caricoDopoGaraPercent": number (% carico se si prende la gara 0-100),
    "fabbisognoSquadreGara": number (squadre necessarie stimate per questa gara basandoti su importo e durata),
    "rischioSaturazione": "basso" | "medio" | "alto",
    "esito": "CAPACITA_PIENA" | "CAPACITA_SUFFICIENTE" | "CAPACITA_LIMITATA" | "CAPACITA_INSUFFICIENTE",
    "motivazione": string (2-3 frasi leggibili sulla capacità operativa),
    "azioneConsigliata": string (es. "Chiudi un cantiere prima di partecipare" o "Capacità sufficiente, procedi")
  },
  "areaGeograficaOk": boolean,
  "importoInTarget": boolean,
  "lavoriInCorsoDetail": {
    "numeroCantieriAttivi": number (activeJobsites dal profilo),
    "cantieriCritici": string[] (descrizioni brevi cantieri che interferiscono — usa ["Cantiere generico attivo"] per ogni cantiere critico se non hai dettagli),
    "cantieriCompatibili": string[] (cantieri che non interferiscono),
    "impattoCaricoLavoro": "nessuno" | "lieve" | "moderato" | "critico",
    "rischioInterferenza": boolean,
    "risorseSottratte": string[] (es. ["2 operai specializzati", "1 caposquadra"] — risorse che i cantieri attuali assorbono),
    "esito": "NESSUN_CONFLITTO" | "CONFLITTO_GESTIBILE" | "CONFLITTO_CRITICO" | "CONFLITTO_BLOCCANTE",
    "motivazione": string (2-3 frasi),
    "azioneConsigliata": string
  },
  "tempiDetail": {
    "durataGaraStimataSettimane": number (ogni €100k ≈ 4 settimane OG standard),
    "scadenzaOffertaGiorni": number (stima 30 giorni se non specificato nei requisiti),
    "tempoPreparazioneNecessarioGiorni": number (stima basata su complessità gara: semplice=7, media=14, complessa=21),
    "tempoPreparazioneDisponibileGiorni": number (scadenzaOffertaGiorni - 3 giorni buffer),
    "preparazioneRealistica": boolean (tempoDisponibile >= tempoNecessario),
    "sovrapposizioneCantieri": "nessuna" | "parziale" | "totale",
    "esito": "TEMPI_OTTIMALI" | "TEMPI_ACCETTABILI" | "TEMPI_STRETTI" | "TEMPI_IMPOSSIBILI",
    "motivazione": string (2-3 frasi),
    "azioneConsigliata": string
  },
  "rischioOperativoDetail": {
    "complessitaEsecutiva": "bassa" | "media" | "alta" | "molto_alta",
    "rischioLogistico": "basso" | "medio" | "alto",
    "rischioTempistico": "basso" | "medio" | "alto",
    "rischioSubappalto": "basso" | "medio" | "alto",
    "fattoriRischio": string[] (3-5 fattori concreti basati su categoria lavori, area, penali, anomalie),
    "fattoriMitigazione": string[] (2-4 elementi che riducono il rischio),
    "scoreRischioOperativo": number (0-100, più alto = più rischioso),
    "esito": "RISCHIO_BASSO" | "RISCHIO_ACCETTABILE" | "RISCHIO_ELEVATO" | "RISCHIO_CRITICO",
    "motivazione": string (2-3 frasi),
    "azioneConsigliata": string
  },
  "rischioDocumentaleDetail": {
    "complessitaDocumentale": "bassa" | "media" | "alta" | "molto_alta",
    "documentiCritici": string[] (documenti difficili da produrre per questa specifica gara),
    "rischioEsclusione": "basso" | "medio" | "alto",
    "requisitiDifficili": string[] (requisiti di partecipazione difficili da soddisfare),
    "tempoPreparazioneDocumenti": "sufficiente" | "stretto" | "critico",
    "scoreRischioDocumentale": number (0-100),
    "esito": "DOCUMENTAZIONE_SEMPLICE" | "DOCUMENTAZIONE_GESTIBILE" | "DOCUMENTAZIONE_COMPLESSA" | "DOCUMENTAZIONE_CRITICA",
    "motivazione": string (2-3 frasi),
    "azioneConsigliata": string
  },
  "storicoSimileDetail": {
    "gareSimilariTrovate": number (gare in historicalTenders con stessa categoria SOA o importo ±50% rispetto a importoGara),
    "tassoDiSuccessoCategoria": number (% gare vinte sul totale similari — 0 se nessuna similare),
    "ribassoMedioCategoria": number (ribasso medio storico delle gare similari — 0 se nessuna),
    "margineAttesoStorico": number (margine medio realizzato delle gare vinte similari — 0 se nessuna vinta),
    "garePertinenti": array max 3 gare più recenti tra le similari, ogni elemento: { "anno": number, "importo": number, "ribasso": number, "esito": string, "categoria": string } — array vuoto se nessuna,
    "confidenzaAnalisi": "alta" | "media" | "bassa" | "nessuna",
    "esito": "STORICO_FAVOREVOLE" | "STORICO_NEUTRO" | "STORICO_SFAVOREVOLE" | "STORICO_ASSENTE",
    "motivazione": string (2-3 frasi sul pattern storico),
    "azioneConsigliata": string
  },
  ${EXPLAINABILITY_JSON_INLINE},
  ${EVIDENCE_JSON_INLINE}
}

${EVIDENCE_PROMPT_BLOCK}

Logica decisionale:
- GO: impresa compatibile, nessun blocco critico, score >= 70
- CAUTELA: compatibile con riserve o gap colmabili (avvalimento/RTI), score 40-69
- NO-GO: incompatibilità strutturale (SOA mancante non colmabile, area geografica fuori scope, importo fuori range), score < 40

Considera questi fattori nell'ordine:
1. Compatibilità SOA (categorie e classifiche richieste vs possedute) — peso 35%
2. Area geografica gara vs aree operative impresa — peso 20%
3. Importo gara vs range target impresa — peso 20%
4. Capacità operativa (cantieri aperti, squadre disponibili) — peso 15%
5. Anomalie e penali rilevate nel disciplinare — peso 10%

Logica SOADecisionDetail:
- Estrai categorieRichieste dai requisiti gara (campo category SOA nei requirements)
- Estrai categorieImpresa dalle soaCategories del profilo (lista dei code)
- classificaRichiesta: basati sull'importo gara usando la tabella classifiche SOA italiana:
  I: fino a €258k, II: fino a €516k, III: fino a €1.033M, III-bis: fino a €1.5M,
  IV: fino a €2.582M, IV-bis: fino a €3.5M, V: fino a €5.165M, VI: fino a €10.329M,
  VII: fino a €15.494M, VIII: oltre €15.494M
- incrementoQuintoApplicabile: true se classificaPosseduta + 20% copre l'importo (art. 104 D.Lgs. 36/2023)
- esito:
  - PIENA_COPERTURA: tutte le categorie richieste presenti e classifica adeguata
  - COPERTURA_PARZIALE: categorie presenti ma classifica al limite (incremento quinto necessario)
  - GAP_COLMABILE: categorie mancanti ma recuperabili con avvalimento o RTI
  - GAP_CRITICO: gap SOA strutturale non colmabile o impresa priva di qualsiasi categoria richiesta

Logica CapacityDecisionDetail:
- fabbisognoSquadreGara: ogni €500k importo ≈ 1 squadra dedicata per tutta la durata
- esito:
  - CAPACITA_PIENA: squadreDisponibili >= fabbisognoSquadreGara*1.5 e carico dopo gara < 70%
  - CAPACITA_SUFFICIENTE: squadreDisponibili >= fabbisognoSquadreGara e carico dopo gara < 85%
  - CAPACITA_LIMITATA: squadreDisponibili < fabbisognoSquadreGara ma dipendentiLiberi >= 4 (squadra formabile)
  - CAPACITA_INSUFFICIENTE: squadreDisponibili = 0 e dipendentiLiberi < 4, o carico dopo gara > 100%
- rischioSaturazione: basso se carico < 70%, medio se 70-85%, alto se > 85%

Logica LavoriInCorsoDetail:
- Se activeJobsites = 0: esito NESSUN_CONFLITTO, cantieriCritici vuoto
- Se activeJobsites = 1-2 e squadre sufficienti: CONFLITTO_GESTIBILE
- Se activeJobsites >= 3 o squadre = 0: CONFLITTO_CRITICO
- Se carico attuale > 90%: CONFLITTO_BLOCCANTE
- risorseSottratte: stima concreta basata su dipendenti e squadre impegnate nei cantieri attivi

Logica TempiDetail:
- TEMPI_OTTIMALI: preparazioneRealistica true e scadenza > 21 giorni
- TEMPI_ACCETTABILI: preparazioneRealistica true e scadenza 14-21 giorni
- TEMPI_STRETTI: preparazioneRealistica borderline (disponibile < necessario + 3gg)
- TEMPI_IMPOSSIBILI: tempoDisponibile < tempoNecessario
- sovrapposizioneCantieri: considera durata gara stimata vs durata media cantieri in corso

Logica RischioOperativoDetail:
- scoreRischioOperativo considera: complessità categoria lavori, penali rilevate, anomalie, area geografica remota, durata
- RISCHIO_BASSO: score < 25, categoria semplice, nessuna penale critica
- RISCHIO_ACCETTABILE: score 25-50, complessità media, penali standard
- RISCHIO_ELEVATO: score 50-75, alta complessità o penali severe o anomalie operative
- RISCHIO_CRITICO: score > 75, combinazione di fattori critici (penali + anomalie + complessità alta)
- rischioSubappalto: alto se categoria prevalente ha limiti subappalto stringenti (OG, OS specialistiche)

Logica RischioDocumentaleDetail:
- scoreRischioDocumentale considera: numero requisiti, difficoltà produzione documenti, SOA gap, certificazioni richieste
- DOCUMENTAZIONE_SEMPLICE: score < 25, requisiti standard, SOA ok
- DOCUMENTAZIONE_GESTIBILE: score 25-50, qualche documento complesso ma ottenibile
- DOCUMENTAZIONE_COMPLESSA: score 50-75, più documenti difficili o SOA gap da colmare
- DOCUMENTAZIONE_CRITICA: score > 75, requisiti molto stringenti, alto rischio esclusione formale
- documentiCritici: basati su anomalie e requisiti della gara (es. "Referenze specifiche settore", "Fatturato triennale certificato")

Logica StoricoSimileDetail:
- gareSimilariTrovate: conta gare in historicalTenders con categoriaSOA uguale alla categoria della gara, OPPURE con importoGara ±50% rispetto all'importo della gara attuale
- Se gareSimilariTrovate = 0: esito STORICO_ASSENTE, confidenzaAnalisi "nessuna", tutti i numeri a 0, garePertinenti []
- tassoDiSuccessoCategoria: (count gare "vinta" tra similari / gareSimilariTrovate) * 100
- ribassoMedioCategoria: media aritmetica dei campo ribasso delle gare similari
- margineAttesoStorico: media dei margineRealizzato delle gare similari con esito "vinta" (0 se nessuna vinta)
- garePertinenti: le 3 gare più recenti (anno più alto) tra le similari
- confidenzaAnalisi: "alta" se gareSimilariTrovate >= 5, "media" se 2-4, "bassa" se 1, "nessuna" se 0
- STORICO_FAVOREVOLE: tassoDiSuccessoCategoria >= 50 e margineAttesoStorico > 0
- STORICO_NEUTRO: tassoDiSuccessoCategoria 25-49, oppure dati insufficienti per valutazione netta
- STORICO_SFAVOREVOLE: tassoDiSuccessoCategoria < 25 o tutte le gare similari perse
- STORICO_ASSENTE: gareSimilariTrovate = 0

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- CIG: ${tender.cig}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti richiesti: ${JSON.stringify(tender.requirements, null, 2)}
- Anomalie rilevate: ${tender.anomalies.join(", ") || "nessuna"}
- Penali: ${tender.penalties.join(", ") || "nessuna"}
- Storico gare passate: ${JSON.stringify(profile.historicalTenders || [], null, 2)}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 10000 });

  try {
    const parsed = parseGeminiJson<Omit<BidNoBidResult, "generatedAt" | "explainability">>(text);
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta Gemini non valida — riprova");
  }
}

function calcScenario(
  ribasso: number,
  importoGara: number,
  profile: CompanyProfile,
  label: PricingScenario["label"],
  pricingItems?: PricingLineItem[]
): PricingScenario {
  const importoOfferto = importoGara * (1 - ribasso / 100);

  const fattoreProduttivita = (profile.rendimentoSquadrePercent || 100) / 100;
  const incidenzaManodopera = 0.35;

  const speseGeneraliEuro = importoOfferto * ((profile.incidenzaSpeseGenerali || 15) / 100);
  const rischioEuro = importoOfferto * ((profile.incidenzaRischioMedio || 3) / 100);

  let costoManodoperaStimato: number;
  let costoTotale: number;
  let margineEuro: number;
  let margineStimato: number;
  let margineCorrettoEuro: number;
  let margineCorrettoPercent: number;

  if (pricingItems && pricingItems.length > 0) {
    const impact = calcProductivityImpact(pricingItems, importoGara);
    costoManodoperaStimato = impact.totaleInternoReale;
    const costoPrezzario = impact.totalePrezzario + speseGeneraliEuro + rischioEuro;
    costoTotale = impact.totaleInternoReale + speseGeneraliEuro + rischioEuro;
    margineEuro = importoOfferto - costoPrezzario;
    margineStimato = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;
    margineCorrettoEuro = importoOfferto - costoTotale;
    margineCorrettoPercent =
      importoOfferto > 0 ? (margineCorrettoEuro / importoOfferto) * 100 : 0;
  } else {
    const costoManodoperaBase = importoOfferto * incidenzaManodopera;
    costoManodoperaStimato =
      fattoreProduttivita > 0 ? costoManodoperaBase / fattoreProduttivita : costoManodoperaBase;

    const altriCosti =
      importoOfferto *
      ((profile.incidenzaSpeseGenerali || 15) / 100 +
        (profile.incidenzaRischioMedio || 3) / 100 +
        (1 - incidenzaManodopera - (profile.avgMarginPercent || 10) / 100));

    costoTotale = costoManodoperaStimato + altriCosti;
    margineCorrettoEuro = importoOfferto - costoTotale;
    margineCorrettoPercent =
      importoOfferto > 0 ? (margineCorrettoEuro / importoOfferto) * 100 : 0;

    const costiBase =
      importoOfferto * (1 - (profile.avgMarginPercent || 10) / 100) +
      speseGeneraliEuro +
      rischioEuro;
    margineEuro = importoOfferto - costiBase;
    margineStimato = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;
  }

  return {
    ribasso,
    importoOfferto,
    margineStimato,
    margineEuro,
    label,
    rischioAlert: margineCorrettoPercent < (profile.minMargineAccettabile || 8),
    fattoreProduttivita,
    costoManodoperaStimato,
    margineCorrettoPercent,
    margineCorrettoEuro,
  };
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function estimateOrganizationalCostsEuro(importoOfferto: number, profile: CompanyProfile): number {
  const explicit = safeNumber(profile.organizationalCostsEuro, 0);
  if (explicit > 0) return explicit;

  const efficiency = profile.productivityData?.organizationalEfficiency;
  const pct =
    efficiency === "alta" ? 0.02 :
    efficiency === "bassa" ? 0.035 :
    0.025;
  return Math.max(0, importoOfferto * pct);
}

function estimateAdministrativeCostsEuro(importoOfferto: number, profile: CompanyProfile): number {
  const explicit = safeNumber(profile.administrativeCostsEuro, 0);
  if (explicit > 0) return explicit;

  const tenderOpsCapacity = safeNumber(profile.productivityData?.concurrentTenderManagementCapacity, 0);
  const pct = tenderOpsCapacity >= 4 ? 0.0125 : 0.0175;
  return Math.max(0, importoOfferto * pct);
}

function adjustRiskLevel(
  risk: ProfitabilityGateResult["rischioEconomico"],
  delta: -1 | 0 | 1
): ProfitabilityGateResult["rischioEconomico"] {
  const levels: ProfitabilityGateResult["rischioEconomico"][] = ["basso", "medio", "alto"];
  const currentIndex = levels.indexOf(risk);
  const nextIndex = Math.max(0, Math.min(levels.length - 1, currentIndex + delta));
  return levels[nextIndex];
}

function normalizeRiskLevel(risk: unknown): ProfitabilityGateResult["rischioEconomico"] {
  if (risk === "basso" || risk === "medio" || risk === "alto") return risk;
  return "medio";
}

function evaluateProductivityImpact(profile: CompanyProfile): {
  level: "alta" | "media" | "bassa" | "non_configurata";
  laborMultiplier: number;
  riskDelta: -1 | 0 | 1;
  warning: string | null;
  explanation: string;
} {
  const efficiency = profile.productivityData?.organizationalEfficiency;
  const speed = profile.productivityData?.executionSpeed;
  const teamProductivity = safeNumber(profile.productivityData?.averageTeamProductivity, 0);
  const squads = safeNumber(profile.activeSquads, 0);

  const hasProductivityData =
    !!efficiency ||
    !!speed ||
    teamProductivity > 0 ||
    squads > 0;

  if (!hasProductivityData) {
    return {
      level: "non_configurata",
      laborMultiplier: 1,
      riskDelta: 1,
      warning: "Produttivita squadra non configurata: stima meno affidabile.",
      explanation: "Dati di produttivita interna mancanti: nessun beneficio operativo applicato e rischio prudenzialmente aumentato.",
    };
  }

  if (efficiency === "alta" || speed === "veloce" || teamProductivity >= 1.1) {
    return {
      level: "alta",
      laborMultiplier: 0.97,
      riskDelta: -1,
      warning: null,
      explanation: "Produttivita interna elevata: lieve riduzione prudente dei costi manodopera e rischio operativo piu contenuto.",
    };
  }

  if (efficiency === "bassa" || speed === "lenta" || (teamProductivity > 0 && teamProductivity < 0.9)) {
    return {
      level: "bassa",
      laborMultiplier: 1.05,
      riskDelta: 1,
      warning: "Produttivita squadra bassa: valutare rinforzo operativo prima della gara.",
      explanation: "Produttivita interna sotto soglia: incremento prudente della manodopera stimata e rischio economico piu elevato.",
    };
  }

  return {
    level: "media",
    laborMultiplier: 1,
    riskDelta: 0,
    warning: null,
    explanation: "Produttivita squadra in fascia media: stime economiche mantenute in linea con scenario base.",
  };
}

function evaluateEstimatedTimeImpact(
  tender: TenderDocument,
  importoOfferto: number
): {
  durationDays: number | null;
  durationLabel: "breve" | "media" | "lunga" | "non_configurata";
  costAdjustmentEuro: number;
  riskDelta: -1 | 0 | 1;
  warning: string | null;
  explanation: string;
} {
  const durationDaysFromInput = safeNumber(tender.estimatedDurationDays, 0);
  const durationMonthsFromInput = safeNumber(tender.estimatedDurationMonths, 0);
  const start = tender.estimatedStartDate ? Date.parse(tender.estimatedStartDate) : NaN;
  const end = tender.estimatedEndDate ? Date.parse(tender.estimatedEndDate) : NaN;
  const durationFromDates =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) / (1000 * 60 * 60 * 24))
      : 0;
  const derivedDurationDays =
    durationDaysFromInput > 0
      ? durationDaysFromInput
      : durationMonthsFromInput > 0
        ? durationMonthsFromInput * 30
        : durationFromDates > 0
          ? durationFromDates
          : 0;

  if (derivedDurationDays <= 0) {
    return {
      durationDays: null,
      durationLabel: "non_configurata",
      costAdjustmentEuro: 0,
      riskDelta: 1,
      warning: "Tempi stimati non configurati: stima economica piu prudente.",
      explanation: "Durata commessa non disponibile, applicata prudenza sul rischio operativo.",
    };
  }

  if (derivedDurationDays <= 45) {
    return {
      durationDays: derivedDurationDays,
      durationLabel: "breve",
      costAdjustmentEuro: importoOfferto * 0.01,
      riskDelta: 1,
      warning: "Tempi molto compressi: possibile pressione operativa su squadre e coordinamento.",
      explanation: "Durata breve/compressa: aggiustamento prudente dei costi per accelerazioni e coordinamento.",
    };
  }

  if (derivedDurationDays > 300) {
    return {
      durationDays: derivedDurationDays,
      durationLabel: "lunga",
      costAdjustmentEuro: importoOfferto * 0.015,
      riskDelta: 1,
      warning: null,
      explanation: "Durata lunga: incremento prudente dei costi per presidio operativo prolungato e variabilita.",
    };
  }

  return {
    durationDays: derivedDurationDays,
    durationLabel: "media",
    costAdjustmentEuro: 0,
    riskDelta: 0,
    warning: null,
    explanation: "Durata stimata in fascia media: nessun impatto economico significativo oltre la baseline.",
  };
}

function evaluateRegionalPriceListReference(tender: TenderDocument): {
  reference: string | null;
  year: number | null;
  region: string | null;
  isConfigured: boolean;
  confidenceImpact: "alta" | "media" | "bassa";
  warning: string | null;
  explanation: string;
  riskDelta: -1 | 0 | 1;
} {
  const reference = String(tender.regionalPriceListReference ?? "").trim() || null;
  const yearRaw = safeNumber(tender.regionalPriceListYear, 0);
  const year = yearRaw > 0 ? Math.round(yearRaw) : null;
  const region = String(tender.regionalPriceListRegion ?? tender.region ?? "").trim() || null;
  const hasAny = !!reference || !!year || !!region;

  if (!hasAny) {
    return {
      reference: null,
      year: null,
      region: null,
      isConfigured: false,
      confidenceImpact: "bassa",
      warning: "Prezzario regionale non indicato: stima costi con confidenza ridotta.",
      explanation: "Costi stimati senza riferimento esplicito a prezzario regionale.",
      riskDelta: 1,
    };
  }

  if (reference && year) {
    return {
      reference,
      year,
      region,
      isConfigured: true,
      confidenceImpact: "alta",
      warning: null,
      explanation: "Stima ancorata a riferimento prezzario regionale esplicito.",
      riskDelta: 0,
    };
  }

  return {
    reference,
    year,
    region,
    isConfigured: true,
    confidenceImpact: "media",
    warning: "Prezzario regionale parziale: utile completare riferimento e anno.",
    explanation: "Riferimento prezzario presente ma incompleto, confidenza stima intermedia.",
    riskDelta: 0,
  };
}

function normalizeProfitabilityResult(
  parsed: Omit<ProfitabilityGateResult, "generatedAt" | "explainability">,
  tender: TenderDocument,
  profile: CompanyProfile
): Omit<ProfitabilityGateResult, "generatedAt" | "explainability"> {
  const importoGara = parseTenderValue(tender.value);
  const importoOfferto = Math.max(0, importoGara * (1 - safeNumber(profile.avgRibassoPercent, 0) / 100));

  const organizationalCostsEuro = estimateOrganizationalCostsEuro(importoOfferto, profile);
  const organizationalIncidence = importoOfferto > 0 ? (organizationalCostsEuro / importoOfferto) * 100 : 0;
  const administrativeCostsEuro = estimateAdministrativeCostsEuro(importoOfferto, profile);
  const administrativeIncidence = importoOfferto > 0 ? (administrativeCostsEuro / importoOfferto) * 100 : 0;
  const productivityImpact = evaluateProductivityImpact(profile);
  const estimatedTimeImpact = evaluateEstimatedTimeImpact(tender, importoOfferto);
  const regionalPriceListReference = evaluateRegionalPriceListReference(tender);

  const normalizedBreakdown = (Array.isArray(parsed.breakdownCosti) ? parsed.breakdownCosti : [])
    .map((item) => ({
      ...item,
      importoStimato: Math.max(0, safeNumber(item?.importoStimato, 0)),
      percentualeImporto: Math.max(0, safeNumber(item?.percentualeImporto, 0)),
      categoria: String(item?.categoria ?? "").trim(),
      note: String(item?.note ?? "").trim(),
    }))
    .filter((item) => item.categoria.length > 0);

  const nonUtileNonOrg = normalizedBreakdown.filter((item) => {
    const lower = item.categoria.toLowerCase();
    return !lower.includes("utile") && !lower.includes("organizzativ");
  });

  const nonUtileNonOrgNonAdmin = nonUtileNonOrg.filter((item) => {
    const lower = item.categoria.toLowerCase();
    return !lower.includes("amministrativ");
  });

  const adjustedCoreCosts = nonUtileNonOrgNonAdmin.map((item) => {
    const isLabor = item.categoria.toLowerCase().includes("manodopera");
    if (!isLabor) return item;
    const adjustedLabor = Math.max(0, item.importoStimato * productivityImpact.laborMultiplier);
    return {
      ...item,
      importoStimato: adjustedLabor,
      note: `${item.note}${item.note ? " " : ""}Adeguamento produttivita squadra ${productivityImpact.level} (${((productivityImpact.laborMultiplier - 1) * 100).toFixed(1)}%).`,
    };
  });

  const rawOperational = adjustedCoreCosts.reduce((acc, item) => acc + item.importoStimato, 0);
  const timeAdjustmentEuro = Math.max(0, estimatedTimeImpact.costAdjustmentEuro);
  const costiOperativi = rawOperational + organizationalCostsEuro + administrativeCostsEuro + timeAdjustmentEuro;
  const margineEuro = importoOfferto - costiOperativi;
  const marginePercent = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;

  const breakdownCosti = [
    ...adjustedCoreCosts.map((item) => ({
      ...item,
      percentualeImporto: importoOfferto > 0 ? (item.importoStimato / importoOfferto) * 100 : 0,
    })),
    {
      categoria: "Costi organizzativi",
      importoStimato: organizationalCostsEuro,
      percentualeImporto: organizationalIncidence,
      note:
        safeNumber(profile.organizationalCostsEuro, 0) > 0
          ? "Voce esplicita da profilo aziendale (coordinamento, pianificazione e supervisione interna)."
          : "Stima prudente su organizzazione interna (coordinamento, pianificazione e gestione risorse).",
    },
    {
      categoria: "Costi amministrativi",
      importoStimato: administrativeCostsEuro,
      percentualeImporto: administrativeIncidence,
      note:
        safeNumber(profile.administrativeCostsEuro, 0) > 0
          ? "Voce esplicita da profilo aziendale (ufficio gare, pratiche e gestione documentale)."
          : "Stima prudente su attività amministrative (pratiche gara, portali e controlli documentali).",
    },
    {
      categoria: "Impatto tempi stimati",
      importoStimato: timeAdjustmentEuro,
      percentualeImporto: importoOfferto > 0 ? (timeAdjustmentEuro / importoOfferto) * 100 : 0,
      note: estimatedTimeImpact.explanation,
    },
    {
      categoria: "Utile atteso",
      importoStimato: margineEuro,
      percentualeImporto: marginePercent,
      note: "Differenza tra importo offerto e costi complessivi inclusi i costi organizzativi e amministrativi.",
    },
  ];

  const existingMotivazione = String(parsed.motivazione ?? "").trim();
  const lowerMotivazione = existingMotivazione.toLowerCase();
  const hasOrg = lowerMotivazione.includes("organizzativ");
  const hasAdmin = lowerMotivazione.includes("amministrativ");
  const hasProd = lowerMotivazione.includes("produttivit");
  const hasTempi = lowerMotivazione.includes("temp");
  const hasPrezzario = lowerMotivazione.includes("prezzar");
  const motivazioneWithFullContext = hasOrg && hasAdmin && hasProd && hasTempi && hasPrezzario
    ? existingMotivazione
    : `${existingMotivazione}${existingMotivazione ? " " : ""}Include costi organizzativi (coordinamento interno, pianificazione operativa, supervisione tecnica) e costi amministrativi (ufficio gare, pratiche documentali, caricamento portali). Impatto produttivita squadra: ${productivityImpact.explanation} Impatto tempi stimati: ${estimatedTimeImpact.explanation} Prezzario regionale: ${regionalPriceListReference.explanation}`;

  const combinedRiskDeltaRaw =
    productivityImpact.riskDelta + estimatedTimeImpact.riskDelta + regionalPriceListReference.riskDelta;
  const combinedRiskDelta: -1 | 0 | 1 =
    combinedRiskDeltaRaw > 0 ? 1 :
    combinedRiskDeltaRaw < 0 ? -1 :
    0;

  return {
    ...parsed,
    breakdownCosti,
    costoTotaleStimato: costiOperativi,
    margineAttesoEuro: margineEuro,
    margineAttesoPercent: marginePercent,
    rischioEconomico: adjustRiskLevel(normalizeRiskLevel(parsed.rischioEconomico), combinedRiskDelta),
    organizationalCosts: {
      amountEuro: organizationalCostsEuro,
      incidencePercentage: organizationalIncidence,
      explanation:
        safeNumber(profile.organizationalCostsEuro, 0) > 0
          ? "Valore inserito esplicitamente nel profilo impresa."
          : "Valore stimato in fallback prudente sulla base dell'efficienza organizzativa e dell'importo offerto.",
    },
    administrativeCosts: {
      amountEuro: administrativeCostsEuro,
      incidencePercentage: administrativeIncidence,
      explanation:
        safeNumber(profile.administrativeCostsEuro, 0) > 0
          ? "Valore inserito esplicitamente nel profilo impresa."
          : "Valore stimato in fallback prudente sulla base della capacità ufficio gare e dell'importo offerto.",
    },
    productivityImpact: {
      efficiencyLevel: productivityImpact.level,
      laborCostAdjustmentPercentage: (productivityImpact.laborMultiplier - 1) * 100,
      riskAdjustment:
        productivityImpact.riskDelta < 0 ? "riduzione" :
        productivityImpact.riskDelta > 0 ? "aumento" :
        "neutro",
      warning: productivityImpact.warning,
      explanation: productivityImpact.explanation,
    },
    estimatedTimeImpact: {
      durationDays: estimatedTimeImpact.durationDays,
      durationLabel: estimatedTimeImpact.durationLabel,
      costAdjustmentEuro: timeAdjustmentEuro,
      riskAdjustment:
        estimatedTimeImpact.riskDelta < 0 ? "riduzione" :
        estimatedTimeImpact.riskDelta > 0 ? "aumento" :
        "neutro",
      warning: estimatedTimeImpact.warning,
      explanation: estimatedTimeImpact.explanation,
    },
    regionalPriceListReference: {
      reference: regionalPriceListReference.reference,
      year: regionalPriceListReference.year,
      region: regionalPriceListReference.region,
      isConfigured: regionalPriceListReference.isConfigured,
      confidenceImpact: regionalPriceListReference.confidenceImpact,
      warning: regionalPriceListReference.warning,
      explanation: regionalPriceListReference.explanation,
    },
    motivazione: motivazioneWithFullContext,
  };
}

export async function runBidPricing(
  tender: TenderDocument,
  profile: CompanyProfile,
  ribassoPersonalizzato: number,
  vociPrezzario?: VocePrezzario[],
  pricingItems?: PricingLineItem[]
): Promise<BidPricingResult> {
  const importoGara = parseTenderValue(tender.value);

  const itemsForScenario =
    pricingItems && pricingItems.length > 0
      ? pricingItems
      : vociPrezzario && vociPrezzario.length > 0
        ? vociPrezzario.map((v) => ({
            ...v,
            qta: 1,
            produttivita: profile.rendimentoSquadrePercent || 100,
          }))
        : undefined;

  const scenari: PricingScenario[] = [
    calcScenario(profile.avgRibassoPercent + 3, importoGara, profile, "Aggressivo", itemsForScenario),
    calcScenario(profile.avgRibassoPercent, importoGara, profile, "Bilanciato", itemsForScenario),
    calcScenario(
      Math.max(0, profile.avgRibassoPercent - 3),
      importoGara,
      profile,
      "Conservativo",
      itemsForScenario
    ),
    calcScenario(ribassoPersonalizzato, importoGara, profile, "Personalizzato", itemsForScenario),
  ];

  const breakdownBlock =
    vociPrezzario && vociPrezzario.length > 0
      ? (() => {
          const breakdown = calcolaBreakdownDaPrezzario(
            pricingItems?.length
              ? pricingItems
              : vociPrezzario.map((v) => ({ ...v, qta: 1 }))
          );
          return `
BREAKDOWN COSTI DA PREZZARIO REGIONALE (reale, non stimato):
Costo previsto voci: €${breakdown.costoPrevisto.toFixed(2)}
- Manodopera: ${breakdown.incidenzaManodopera.toFixed(1)}%
- Materiali: ${breakdown.incidenzaMateriali.toFixed(1)}%
- Noli: ${breakdown.incidenzaNoli.toFixed(1)}%
- Altro: ${breakdown.incidenzaAltro.toFixed(1)}%

Usa questi valori REALI nel calcolo margini e scenari, non percentuali stimate.
`;
        })()
      : `
BREAKDOWN COSTI STIMATO (nessun prezzario disponibile — usa medie storiche):
- Manodopera: 35%
- Materiali: 40%
- Noli: 15%
- Contingenze: 10%
`;

  const prompt = `Sei un esperto di pricing per gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Analizza la situazione e restituisci SOLO un oggetto JSON valido, senza markdown, senza backtick.

Struttura JSON richiesta:
{
  "rangeMinRibasso": number,
  "rangeMaxRibasso": number,
  "ribassoOttimale": number,
  "motivazioneRange": string (3-4 frasi precise con riferimenti ai dati aziendali),
  "alertMargine": boolean,
  "alertText": string (vuoto se alertMargine false, altrimenti descrivi il rischio concreto),
  "winRatePrudente": number (% stima prudente, NON ottimistica),
  "winRateMotivazione": string (2-3 frasi che spiegano la stima),
  "impattoProduttivita": string (2-3 frasi su come il rendimento squadre impatta il ribasso sostenibile),
  "fattoreProduttivitaGlobale": number (0-1, rendimentoSquadrePercent/100 del profilo),
  "avvertenzaProduttivita": boolean (true se rendimento < 85% e comprime il margine di oltre 3 punti),
  ${EXPLAINABILITY_JSON_INLINE}
}

Logica per il range:
- rangeMin = ribasso sotto cui il margine scende sotto minMargineAccettabile
- rangeMax = ribasso massimo sostenibile mantenendo margine accettabile
- ribassoOttimale = punto di equilibrio tra competitività e margine
- alertMargine = true se anche ribassoOttimale porta margine vicino al limite (< minMargine + 2%)
- winRatePrudente: considera storico impresa, fit gara, complessità — rimani prudente

${breakdownBlock}

Logica calcolo margine:
Se prezzario disponibile:
  margineStimato = (importoOfferta - costoPrezzario) / importoOfferta * 100
  Più accurato perché usa costi reali
Se NO prezzario:
  margineStimato = (importoOfferta - costoStimato percentuale) / importoOfferta * 100
  Meno affidabile perché usa medie

Logica produttività nel ribasso:
- fattoreProduttivitaGlobale = profile.rendimentoSquadrePercent / 100
- Se fattore < 0.85: la manodopera costa di più del teorico → il rangeMax si abbassa
- Se fattore < 0.70: avvertenzaProduttivita = true, impatto significativo sul margine
- Il rangeMin deve essere alzato di (1 - fattoreProduttivitaGlobale) * 5 punti percentuali se produttività bassa
- Esempio: produttività 80% → manodopera costa 25% in più → rangeMin sale di ~2%
- impattoProduttivita deve citare i valori reali del profilo (ore/giorno, rendimento %)

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

PRODUTTIVITÀ OPERATIVA:
- Produttività squadre: ${profile.rendimentoSquadrePercent || 100}%
- Ore/giorno per squadra: ${profile.oreGiornaliereSquadra || 8}
- Giorni lavorativi/settimana: ${profile.giorniLavorativiSettimana || 5}

DATI GARA:
- Titolo: ${tender.title}
- Importo base: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti: ${JSON.stringify(tender.requirements)}
- Anomalie: ${tender.anomalies.join(", ") || "nessuna"}

SCENARI PRE-CALCOLATI (per contesto):
${JSON.stringify(scenari, null, 2)}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 10000 });
  try {
    const parsed = parseGeminiJson<Omit<BidPricingResult, "scenari" | "generatedAt" | "explainability">>(
      text
    );
    const fattoreProduttivitaGlobale =
      parsed.fattoreProduttivitaGlobale ?? (profile.rendimentoSquadrePercent || 100) / 100;
    const scenarioBilanciato = scenari.find((s) => s.label === "Bilanciato");
    const compressioneMargine =
      scenarioBilanciato != null
        ? scenarioBilanciato.margineStimato - scenarioBilanciato.margineCorrettoPercent
        : 0;

    return {
      ...parsed,
      scenari,
      generatedAt: new Date().toISOString(),
      impattoProduttivita: parsed.impattoProduttivita ?? "",
      fattoreProduttivitaGlobale,
      avvertenzaProduttivita:
        parsed.avvertenzaProduttivita ??
        (fattoreProduttivitaGlobale < 0.7 ||
          (fattoreProduttivitaGlobale < 0.85 && compressioneMargine > 3)),
    };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runRedFlagAnalysis(
  tender: TenderDocument
): Promise<RedFlagAnalysisResult> {
  const normalizeSourceReference = (value: unknown): RedFlagSourceReference | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const pageNumber = Number(source.pageNumber);
    return {
      documentName: String(source.documentName ?? "").trim() || undefined,
      pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.round(pageNumber) : undefined,
      article: String(source.article ?? "").trim() || undefined,
      clauseTitle: String(source.clauseTitle ?? "").trim() || undefined,
      excerpt: String(source.excerpt ?? "").trim() || undefined,
      anchorId: String(source.anchorId ?? "").trim() || undefined,
    };
  };

  const normalizeRedFlagItem = (item: Record<string, unknown>): RedFlag => {
    return {
      title: String(item.title ?? "Rischio da verificare").trim(),
      type: normalizeRedFlagCategory(item.type),
      clause: String(item.clause ?? "Estratto non disponibile").trim(),
      articleRef: String(item.articleRef ?? "Verifica disciplinare").trim(),
      severity:
        item.severity === "high" || item.severity === "medium" || item.severity === "low"
          ? item.severity
          : "medium",
      simpleExplanation: String(item.simpleExplanation ?? "Elemento potenzialmente restrittivo da verificare con revisione umana.").trim(),
      remedy: String(item.remedy ?? "Richiedere chiarimenti alla stazione appaltante e verificare proporzionalita del requisito.").trim(),
      clarificationText: String(item.clarificationText ?? "Oggetto: richiesta chiarimenti in merito a clausola potenzialmente restrittiva del disciplinare.").trim(),
      sourceReference: normalizeSourceReference(item.sourceReference),
    };
  };

  const prompt = `Sei un esperto legale specializzato in gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Analizza i dati della gara e individua clausole problematiche, requisiti sproporzionati, anomalie e red flag.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.

Struttura JSON richiesta:
{
  "redFlags": [
    {
      "title": string,
      "type": "hyper_detailed_specs" | "unbalanced_award_criteria" | "anomalous_timeline" | "restrictive_requirement_combination" | "requisito_sproporzionato" | "clausola_sensibile" | "rischio_operativo" | "rischio_esclusione" | "altro",
      "clause": string (citazione breve della clausola problematica, max 200 caratteri),
      "articleRef": string (riferimento normativo preciso),
      "severity": "high" | "medium" | "low",
      "simpleExplanation": string (3-4 frasi in linguaggio semplice per un imprenditore edile),
      "remedy": string (azione concreta da intraprendere),
      "clarificationText": string (bozza lettera/quesito formale pronto per il portale gare, 80-120 parole, in italiano formale, includi CIG della gara),
      "sourceReference": {
        "documentName": string,
        "pageNumber": number,
        "article": string,
        "clauseTitle": string,
        "excerpt": string,
        "anchorId": string
      }
    }
  ],
  "rischioComplessivo": "high" | "medium" | "low",
  "conteggioHigh": number,
  "conteggioMedium": number,
  "conteggioLow": number,
  "sintesiRischio": string (2-3 frasi di sintesi sul profilo di rischio complessivo della gara),
  ${EXPLAINABILITY_JSON_INLINE},
  ${EVIDENCE_JSON_INLINE}
}

${EVIDENCE_PROMPT_BLOCK}

Categorie da cercare in modo esplicito (se c'e evidenza testuale; usa esattamente questi valori nel campo type):
- requisito_sproporzionato: requisiti economici/tecnici/organizzativi potenzialmente sproporzionati rispetto a oggetto/importo
- clausola_sensibile: clausole da approfondire rispetto a schemi standard o potenziale restrittivita
- rischio_operativo: clausole che aumentano rischio operativo/esecutivo/cantiere
- rischio_esclusione: requisiti o condizioni che aumentano rischio di esclusione formale/documentale
- hyper_detailed_specs: specifiche tecniche iper-dettagliate potenzialmente cucite su uno specifico operatore
- unbalanced_award_criteria: criteri OEPV/punteggi potenzialmente sbilanciati o opachi
- anomalous_timeline: tempi di gara/esecuzione anomali o compressi
- restrictive_requirement_combination: combinazioni di requisiti che riducono eccessivamente la platea
- altro: solo se nessuna categoria precedente e applicabile (motiva nel title/simpleExplanation)

Per ogni red flag usa linguaggio prudente: "potenzialmente restrittivo", "da verificare", "richiede revisione umana".
Non usare formulazioni di illegittimita certa senza base documentale forte.

Logica severity:
- high: clausola illegittima (contra legem), requisito chiaramente sproporzionato, esclusione automatica ingiustificata
- medium: clausola rischiosa ma contestabile, requisito al limite della proporzionalità, anomalia operativa rilevante
- low: elemento da monitorare, clausola inusuale ma non necessariamente illegittima

Logica rischioComplessivo:
- high: almeno 1 red flag high
- medium: solo red flag medium/low ma almeno 2 medium
- low: solo red flag low o nessun red flag

Trova tra 2 e 5 red flag. Se i dati sono insufficienti per identificare problemi specifici, genera almeno 2 osservazioni prudenziali generali sulla gara.
Ogni clarificationText deve iniziare con "Oggetto:" e includere il CIG della gara.
Compila sourceReference quando hai evidenza su sezione/clausola; se non disponibile, ometti sourceReference.

DATI GARA:
- Titolo: ${tender.title}
- CIG: ${tender.cig}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti richiesti: ${JSON.stringify(tender.requirements, null, 2)}
- Anomalie già rilevate: ${tender.anomalies.join(", ") || "nessuna"}
- Penali già rilevate: ${tender.penalties.join(", ") || "nessuna"}
- Sezioni disciplinare: ${JSON.stringify(tender.sections?.map((s) => ({ title: s.title, summary: s.summary })), null, 2)}`;
  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 10000 });
  try {
    const parsed = parseGeminiJson<Omit<RedFlagAnalysisResult, "generatedAt" | "explainability">>(
      text
    );
    const redFlags = Array.isArray(parsed.redFlags)
      ? parsed.redFlags.map((item) => normalizeRedFlagItem(item as unknown as Record<string, unknown>))
      : [];
    const explainability = resolveRedFlagExplainability(parsed.explainability, redFlags, {
      sintesiRischio: parsed.sintesiRischio,
      rischioComplessivo: parsed.rischioComplessivo,
      tender,
    });
    const flagEvidence = redFlags.map((f, i) => redFlagToEvidence(f, i));
    const evidence = mergeEvidenceLists(parsed.evidence ?? [], flagEvidence);

    return {
      ...parsed,
      redFlags,
      explainability,
      evidence: evidence.length ? evidence : undefined,
      conteggioHigh: redFlags.filter((r) => r.severity === "high").length,
      conteggioMedium: redFlags.filter((r) => r.severity === "medium").length,
      conteggioLow: redFlags.filter((r) => r.severity === "low").length,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runCapacityAnalysis(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<CapacityAnalysisResult> {
  const prompt = `Sei un esperto di organizzazione aziendale per imprese edili italiane.
Analizza la capacità operativa dell'impresa di sostenere una nuova gara d'appalto senza andare in saturazione.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Struttura JSON:
{
  "verdict": "SOSTENIBILE" | "CRITICA" | "NON_SOSTENIBILE",
  "scoreCapacita": number (0-100),
  "rischioSaturazione": "basso" | "medio" | "alto",
  "motivazioneSintetica": string (2-3 frasi),
  "squadreDisponibili": number (stima squadre libere dopo acquisizione gara),
  "caricoAttualePercent": number (% carico operativo attuale stimato 0-100),
  "caricoDopoGaraPercent": number (% carico stimato se si prende la gara 0-100),
  "puntiForza": string[] (almeno 2),
  "criticitaOperative": string[] (almeno 1),
  "analisiCompatibilita": string (paragrafo di 3-4 frasi sull'analisi organizzativa),
  "produttivitaAnalisi": string (2-3 frasi su come la produttività delle squadre impatta la fattibilità),
  "oreDisponibiliStimate": number (ore totali che le squadre libere possono dedicare entro la durata stimata della gara),
  "oreRichiesteStimate": number (ore stimate per completare i lavori basandosi su importo e categoria),
  "produttivitaSufficiente": boolean,
  "tempiAnalisi": string (2-3 frasi sulla compatibilità temporale tra gara e cantieri in corso),
  "durataGaraStimataSettimane": number (stima durata gara in settimane basata su importo e categoria),
  "meseLiberazioneRisorse": number (mesi prima che i cantieri attuali si liberino in media),
  "compatibilitaTemporale": "ottima" | "accettabile" | "critica" | "incompatibile",
  "sovrapposizioneRischio": boolean,
  "rischioAlert": string | null,
  "suggerimentoOperativo": string (azione concreta, es. "Assumi 2 operai prima di partecipare" o "Chiudi cantiere X prima di aprire questo"),
  ${EXPLAINABILITY_JSON_INLINE}
}

Logica verdict:
- SOSTENIBILE: score >= 65, carico dopo gara < 85%, squadre disponibili > 0
- CRITICA: score 35-64, carico dopo gara 85-100%, o squadre disponibili = 0 ma colmabile
- NON_SOSTENIBILE: score < 35, carico dopo gara > 100% (impossibile gestire), o zero dipendenti/squadre senza possibilità di recupero

Logica capacità (NON applicare meccanicamente, ragiona sul contesto):
- Squadre disponibili stimate = activeSquads - (activeJobsites * 1.2), mai sotto 0
- I dipendenti sono una riserva: ogni 4 dipendenti liberi = 1 squadra potenziale formabile
- Dipendenti liberi stimati = employeesCount - (activeJobsites * 3)
- Se dipendenti liberi > 3, considera che l'impresa può formare squadre aggiuntive
- SOSTENIBILE richiede: score >= 65 E (squadreDisponibili > 0 OPPURE dipendenti liberi >= 4)
- CRITICA: score 35-64, o squadre = 0 ma dipendenti liberi tra 2 e 3
- NON_SOSTENIBILE: score < 35, dipendenti = 0, o carico fisicamente impossibile
- Un'impresa con 8 dipendenti e 2 cantieri aperti ha dipendenti liberi stimati = 8-(2*3) = 2, quindi CRITICA non NON_SOSTENIBILE
- Importo gara > fatturato annuo è un segnale di sovraccarico finanziario-organizzativo

Logica produttività:
- Ore disponibili = squadreDisponibili × oreGiornaliereSquadra × giorniLavorativiSettimana × (durata_stimata_settimane) × (rendimentoSquadrePercent/100)
- Durata stimata settimane: stimala dall'importo (ogni €100k ≈ 4 settimane per lavori OG standard)
- Ore richieste: stimale dall'importo (ogni €100k ≈ 500 ore uomo per lavori OG standard)
- Se profile.oreGiornaliereSquadra = 0, usa default 8
- Se profile.rendimentoSquadrePercent = 0, usa default 100
- produttivitaSufficiente = oreDisponibiliStimate >= oreRichiesteStimate

Logica tempi:
- durataGaraStimataSettimane: ogni €100k importo ≈ 4 settimane (OG standard), arrotonda al multiplo di 2
- meseLiberazioneRisorse = durataMediaCantieriMesi del profilo (se 0 usa 3 come default)
- durataGaraStimataSettimane in mesi = durataGaraStimataSettimane / 4.3
- compatibilitaTemporale:
  - "ottima": cantieri si liberano prima dell'inizio stimato gara (meseLib < 1)
  - "accettabile": sovrapposizione < 50% della durata gara
  - "critica": sovrapposizione >= 50% della durata gara
  - "incompatibile": cantieri durano più della gara intera (meseLib >= durataGaraMesi)
- sovrapposizioneRischio = compatibilitaTemporale è "critica" o "incompatibile"

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

- Ore/giorno per squadra: ${profile.oreGiornaliereSquadra || 8}
- Rendimento squadre: ${profile.rendimentoSquadrePercent || 100}%
- Giorni lavorativi/settimana: ${profile.giorniLavorativiSettimana || 5}
- Durata media cantieri in corso: ${profile.durataMediaCantieriMesi || 6} mesi

DATI GARA:
- Titolo: ${tender.title}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Durata stimata: da requisiti e sezioni disciplinare
- Requisiti: ${JSON.stringify(tender.requirements)}`;
  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 10000 });
  try {
    const parsedCap = parseGeminiJson<
      Omit<CapacityAnalysisResult, "generatedAt" | "explainability">
    >(text);
    return { ...parsedCap, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runParsePrezzarioPdf(
  pdfBase64: string,
  fileName: string
): Promise<ParsePrezzarioPdfResponse> {
  try {
    return await requestParsePrezzario({ pdfBase64, fileName });
  } catch {
    throw new Error("Parsing PDF prezzario fallito — riprova");
  }
}

function cleanLlmJsonText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

interface ScorporoLlmSuggestion {
  voceId: string;
  scorporo: string[];
  ratio: number[];
  confidenza: number;
  motivazione: string;
}

export async function suggerisciAggiornamentoPrezzario(
  voceAttuale: VocePrezzario,
  nuoviDati: {
    prezzoGareRecenti: number[];
    regioneRiferimento: string;
    anno: number;
  }
): Promise<{
  suggerimentoPrezzo: number;
  motivazione: string;
  confidenza: number;
}> {
  const media =
    nuoviDati.prezzoGareRecenti.length > 0
      ? nuoviDati.prezzoGareRecenti.reduce((a, b) => a + b, 0) / nuoviDati.prezzoGareRecenti.length
      : voceAttuale.prezzo;

  const prompt = `Sei un esperto di prezzari edili italiani.
Analizza il prezzo attuale di una voce prezzario e i dati recenti da gare, suggerisci un aggiornamento.

Voce prezzario:
- Codice: ${voceAttuale.codice}
- Descrizione: ${voceAttuale.descrizione}
- UM: ${voceAttuale.um}
- Prezzo attuale: €${voceAttuale.prezzo}

Dati da gare recenti nella stessa regione:
- Prezzo medio: €${media.toFixed(2)}
- Prezzi individuali: ${nuoviDati.prezzoGareRecenti.map((p) => `€${p}`).join(", ") || "nessuno"}
- Regione: ${nuoviDati.regioneRiferimento}
- Anno: ${nuoviDati.anno}

Rispondi SOLO con JSON valido, niente markdown, niente backtick:
{
  "suggerimentoPrezzo": number (prezzo suggerito, in €),
  "motivazione": string (2-3 frasi spiega perché),
  "confidenza": number (0-100, quanto sei sicuro)
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.3, maxTokens: 1000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    return parseGeminiJson<{
      suggerimentoPrezzo: number;
      motivazione: string;
      confidenza: number;
    }>(cleaned);
  } catch {
    throw new Error("Suggerimento aggiornamento fallito");
  }
}

export async function runScorporoIntelligente(voci: VocePrezzario[]): Promise<ScorporoResult[]> {
  const prompt = `Sei un esperto di prezzari edili italiani.
Analizza queste voci e identifica quali sono composite (combinano più lavorazioni).
Per ogni voce composita, suggerisci come scorporarla in voci elementari.

Rispondi SOLO con un JSON array valido, niente markdown, niente backtick, niente commenti.

Esempi di voci composite:
- "Scavo a mano e carico materiale" → splitta in "Scavo a mano" + "Carico materiale"
- "Demolizione e rimozione macerie" → splitta in "Demolizione" + "Rimozione macerie"
- "Preparazione terreno e compattazione" → splitta in "Preparazione" + "Compattazione"

Per ogni voce in input, produci questo JSON:
{
  "voceId": id della voce originale,
  "descrizioneOriginale": descrizione originale,
  "isComposita": true se riconosci come composita, false altrimenti,
  "scorporo": array di stringhe (nuove descrizioni se composita, array vuoto se no),
  "ratio": array di numeri (rapporti percentuali 0-1 per ogni descrizione scorporata, somma deve = 1.0),
  "confidenza": numero 0-100 (quanto sei sicuro dello scorporo),
  "motivazione": stringa breve spiegazione
}

Ritorna un array JSON con una riga per ogni voce input.

VOCI INPUT:
${JSON.stringify(voci, null, 2)}`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 6000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const geminiSuggestions = (Array.isArray(parsed) ? parsed : []) as ScorporoLlmSuggestion[];

    const results: ScorporoResult[] = [];
    for (const suggestion of geminiSuggestions) {
      const voceOriginale = voci.find((v) => v.id === suggestion.voceId);
      if (!voceOriginale) continue;

      const scorporo = Array.isArray(suggestion.scorporo) ? suggestion.scorporo : [];
      const ratio = Array.isArray(suggestion.ratio) ? suggestion.ratio : [];

      if (scorporo.length > 0 && ratio.length === scorporo.length) {
        const ratioSum = ratio.reduce((acc, r) => acc + r, 0) || 1;
        const vocieScorprate: VocePrezzario[] = scorporo.map((desc, idx) => ({
          id: `${voceOriginale.id}-deepseek-${idx}`,
          codice: `${voceOriginale.codice}-${String.fromCharCode(97 + idx)}`,
          descrizione: desc,
          um: voceOriginale.um,
          prezzo: (voceOriginale.prezzo * ratio[idx]) / ratioSum,
          categoria: voceOriginale.categoria,
        }));

        results.push({
          voceOriginaleId: voceOriginale.id,
          voceOriginale,
          vocieScorprate,
          successoScorporo: true,
          motivazione: suggestion.motivazione || "Scorporo LLM",
        });
      } else {
        results.push({
          voceOriginaleId: voceOriginale.id,
          voceOriginale,
          vocieScorprate: [voceOriginale],
          successoScorporo: false,
          motivazione: suggestion.motivazione || "Non composita",
        });
      }
    }

    const handledIds = new Set(results.map((r) => r.voceOriginaleId));
    for (const voce of voci) {
      if (!handledIds.has(voce.id)) {
        results.push({
          voceOriginaleId: voce.id,
          voceOriginale: voce,
          vocieScorprate: [voce],
          successoScorporo: false,
          motivazione: "Nessuna risposta LLM per questa voce",
        });
      }
    }

    return results;
  } catch (e) {
    throw new Error(
      `Analisi scorporo fallita: ${e instanceof Error ? e.message : "JSON non valido"}`
    );
  }
}

export async function runProfitabilityGate(
  tender: TenderDocument,
  profile: CompanyProfile,
  vociPrezzario?: VocePrezzario[]
): Promise<ProfitabilityGateResult> {
  const prezzarioSummary =
    vociPrezzario && vociPrezzario.length > 0 ? summarizePrezzarioVoci(vociPrezzario) : null;

  const prezzarioBlock =
    prezzarioSummary != null
      ? `
VOCI PREZZARIO REGIONALE (${vociPrezzario!.length} voci — usa questi prezzi reali per il breakdown):
${JSON.stringify(prezzarioSummary, null, 2)}

Dettaglio voci (campione fino a 80 righe):
${JSON.stringify(vociPrezzario!.slice(0, 80), null, 2)}

Logica breakdown con prezzario:
- Usa i prezzi dalle voci prezzario per stimare il calcolo costi materiali
- Somma i prezzi delle voci per categoria "Materiali" per ottenere incidenza materiali reale
- Incidenza manodopera: somma delle voci categoria "Manodopera"
- Incidenza noli: somma delle voci categoria "Noli"
- Scala proporzionalmente al rapporto importoGara / somma prezzi unitari se necessario
- Questo fornisce breakdown più accurato rispetto a percentuali stimate`
      : `
Nessun prezzario regionale collegato — usa i valori storici dell'impresa (percentuali profilo) per il breakdown.`;

  const prompt = `Sei un esperto di analisi economica per imprese edili italiane.
Analizza la profittabilità di questa gara d'appalto per l'impresa specifica.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Struttura JSON:
{
  "verdict": "PROFITTEVOLE" | "BORDERLINE" | "PERICOLOSA",
  "scoreProfittabilita": number (0-100),
  "margineAttesoPercent": number (% margine sul ribasso storico medio dell'impresa),
  "margineAttesoEuro": number (€ assoluto),
  "breakdownCosti": [
    {
      "categoria": string,
      "importoStimato": number,
      "percentualeImporto": number,
      "note": string
    }
  ],
  "costoTotaleStimato": number,
  "organizationalCosts": {
    "amountEuro": number,
    "incidencePercentage": number,
    "explanation": string
  },
  "administrativeCosts": {
    "amountEuro": number,
    "incidencePercentage": number,
    "explanation": string
  },
  "productivityImpact": {
    "efficiencyLevel": "alta" | "media" | "bassa" | "non_configurata",
    "laborCostAdjustmentPercentage": number,
    "riskAdjustment": "riduzione" | "neutro" | "aumento",
    "warning": string | null,
    "explanation": string
  },
  "estimatedTimeImpact": {
    "durationDays": number | null,
    "durationLabel": "breve" | "media" | "lunga" | "non_configurata",
    "costAdjustmentEuro": number,
    "riskAdjustment": "riduzione" | "neutro" | "aumento",
    "warning": string | null,
    "explanation": string
  },
  "regionalPriceListReference": {
    "reference": string | null,
    "year": number | null,
    "region": string | null,
    "isConfigured": boolean,
    "confidenceImpact": "alta" | "media" | "bassa",
    "warning": string | null,
    "explanation": string
  },
  "rischioEconomico": "basso" | "medio" | "alto",
  "motivazione": string (3-4 frasi analisi economica precisa),
  "alertMargineInsufficiente": boolean (true se margine atteso < minMargineAccettabile),
  "alertMargineNegativo": boolean (true se margine atteso < 0),
  "alertText": string | null,
  "scenarioOttimistico": number (% margine scenario favorevole),
  "scenarioRealistico": number (% margine scenario base),
  "scenarioPessimistico": number (% margine scenario avverso),
  "puntiAttenzione": string[] (3-5 elementi che possono erodere il margine),
  ${EXPLAINABILITY_JSON_INLINE},
  ${EVIDENCE_JSON_INLINE}
}

${EVIDENCE_PROMPT_BLOCK}

Logica verdict:
- PROFITTEVOLE: margineAttesoPercent >= minMargineAccettabile + 5%, score >= 65
- BORDERLINE: margineAttesoPercent tra minMargineAccettabile e minMargineAccettabile + 5%, score 35-64
- PERICOLOSA: margineAttesoPercent < minMargineAccettabile o negativo, score < 35

Logica breakdown costi (includi esplicitamente Costi organizzativi e Costi amministrativi come voci autonome):
1. Manodopera: stima basata su costoOraOperaio, costoOraCaposquadra, complessità gara
2. Materiali: stima basata su categoria lavori e importo
3. Noli/Mezzi: stima basata su tipo lavori
4. Spese generali: profile.incidenzaSpeseGenerali% dell'importo
5. Accantonamento rischio: profile.incidenzaRischioMedio% dell'importo
6. Costi organizzativi: coordinamento interno, pianificazione operativa, supervisione tecnica, riunioni operative
7. Costi amministrativi: gestione documentale gara, pratiche amministrative, personale ufficio gare, caricamento portali
8. Utile atteso: differenza tra importo offerto e somma costi precedenti

Regola costi organizzativi:
- se profile.organizationalCostsEuro è presente e > 0, usalo direttamente;
- altrimenti stima in modo prudente con una % dell'importo offerto (2% efficienza alta, 2.5% media, 3.5% bassa).

Regola costi amministrativi:
- se profile.administrativeCostsEuro è presente e > 0, usalo direttamente;
- altrimenti stima in modo prudente con una % dell'importo offerto (1.25% se capacità ufficio gare elevata, 1.75% altrimenti).

Impatto produttivita squadra:
- usa productivityData (organizationalEfficiency, executionSpeed, averageTeamProductivity) e activeSquads per regolare prudentemente manodopera e rischio;
- produttivita alta: lieve riduzione manodopera e rischio;
- produttivita media: nessuna variazione significativa;
- produttivita bassa o non configurata: lieve aumento manodopera/rischio e warning esplicito.

Impatto tempi stimati:
- usa estimatedDurationDays / estimatedDurationMonths / estimatedStartDate+estimatedEndDate;
- tempi compressi o molto lunghi: aumento prudente costo/rischio;
- tempi mancanti: warning e rischio prudenziale.

Riferimento prezzario regionale:
- usa regionalPriceListReference / regionalPriceListYear / regionalPriceListRegion se disponibili;
- se mancante, warning e confidenza stima ridotta;
- non fare parsing completo del prezzario, solo riferimento leggero.

Calcola importo offerto = importoGara * (1 - profile.avgRibassoPercent/100)
Scenari:
- Ottimistico: produttività alta, nessun imprevisto, materiali stabili
- Realistico: condizioni standard con profilo impresa
- Pessimistico: ritardi 10%, caro materiali 5%, imprevisti operativi

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- Importo base: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Penali: ${tender.penalties.join(", ") || "nessuna"}
- Anomalie: ${tender.anomalies.join(", ") || "nessuna"}
- Requisiti: ${JSON.stringify(tender.requirements)}

${prezzarioBlock}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 10000 });
  try {
    const parsed = parseGeminiJson<
      Omit<ProfitabilityGateResult, "generatedAt" | "explainability">
    >(text);
    const normalized = normalizeProfitabilityResult(parsed, tender, profile);
    return { ...normalized, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function analyzePatternInsights(pattern: WinningPattern): Promise<PatternInsights> {
  const regione = pattern.attributi.regioniTarget.join(", ") || "n/d";
  const categoria = pattern.attributi.categorieSoa.join(", ") || "n/d";

  const prompt = `Sei un esperto di appalti pubblici edili italiani.
Analizza questo pattern di gare vinte e identifica fattori di successo.

Pattern dati:
- Regione: ${regione}
- Categoria SOA: ${categoria}
- Importo range: €${pattern.attributi.importoMin}-${pattern.attributi.importoMax}
- Gare vinte: ${pattern.statsVittoria.numeroGareVinte}/${pattern.statsVittoria.numeroGarePartecipate}
- Tasso successo: ${pattern.statsVittoria.tassoDiSuccesso.toFixed(1)}%
- Ribasso medio vincente: ${pattern.statsEconomiche.ribassoMedioVincente.toFixed(1)}%
- Margine medio realizzato: ${pattern.statsEconomiche.margineAttesoMedioPercent.toFixed(1)}%
- Durata media progetti: ${pattern.statsTempi.durataMediaMesi.toFixed(0)} mesi
- Complessità media: ${pattern.statsRischio.mediaComplessita.toFixed(0)}/100

Rispondi SOLO con JSON valido, senza markdown, senza backtick:
{
  "keySuccessFactors": [string array, 3-4 fattori di successo principali],
  "risksToAvoid": [string array, 3-4 rischi riscontrati],
  "recommendations": [string array, 3-4 azioni consigliate per gare future],
  "explanation": "paragrafo 3-4 frasi che sintetizza il pattern"
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1500 });

  try {
    return parseGeminiJson<PatternInsights>(text);
  } catch {
    return {
      keySuccessFactors: [
        "Ribasso competitivo ma sostenibile",
        "Solidità tecnica e referenze coerenti",
      ],
      risksToAvoid: [
        "Sottostima dei costi operativi",
        "Sottovalutazione della complessità esecutiva",
      ],
      recommendations: [
        "Mantieni il ribasso vicino alla media storica vincente",
        "Rafforza l'offerta tecnica sui criteri premiali",
      ],
      explanation:
        "Pattern con dati limitati: usa le medie storiche con prudenza e verifica sempre disciplinare e capacità operativa.",
    };
  }
}

export interface CompetitorPatternAnalysis {
  estimatedCompetitorRibasso: number;
  estimatedCompetitorMargin: number;
  competitorAdvantages: string[];
  competitorWeaknesses: string[];
  strategyToCounterCompetitor: string[];
  riskAssessment: string;
}

export interface SOACategoryANCEMapping {
  locale: string;
  anceStandard: string;
  codiceANCE: string;
  confidenza: number;
}

function parseLlmJsonArray<T>(text: string): T[] {
  try {
    const extracted = extractJsonFromLlmResponse(text);
    const parsed = JSON.parse(extracted) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export interface FitStrategicInsights {
  opportunita: string[];
  rischi: string[];
  azioni: string[];
  spiegazione: string;
}

export interface MarketIntelligenceInsights {
  summary: string;
  opportunita: string[];
  minacce: string[];
  raccomandazioni: string[];
}

export async function analyzeMarketIntelligenceInsights(
  snapshot: MarketIntelligenceSnapshot,
  selectedTender?: TenderDocument
): Promise<MarketIntelligenceInsights> {
  const trendsSummary = snapshot.trendsMercato
    .slice(0, 5)
    .map(
      (t) =>
        `${t.categoria}/${t.regione}: ${t.numeroGareEmesse} gare, trend ${t.trendDirezione} ${t.trendPercent}%`
    )
    .join("\n");

  const competitorsSummary = snapshot.competitorsTop5
    .map((c) => `${c.nome}: ${c.numeroGareVinte} vittorie, win rate ${c.winRate.toFixed(0)}%`)
    .join("\n");

  const garaBlock = selectedTender
    ? `\nGARA IN ANALISI:\n- ${selectedTender.title}\n- Categoria: ${selectedTender.category}\n- Regione: ${selectedTender.region}\n- Importo: ${selectedTender.value}\n`
    : "";

  const prompt = `Sei un analista di market intelligence per appalti pubblici italiani.
Interpreta questo snapshot di mercato e fornisci intelligence operativa.

GARE MONITORATE: ${snapshot.numeroGareAttiveMonitorate}
COMPETITOR TRACCIATI: ${snapshot.numeroCompetitorsTracciati}

TREND MERCATO:
${trendsSummary || "Nessun trend calcolato"}

TOP COMPETITOR:
${competitorsSummary || "Nessun competitor in storico"}
${garaBlock}

Rispondi SOLO con JSON valido, senza markdown:
{
  "summary": "2-3 frasi executive summary",
  "opportunita": ["opportunità 1", "opportunità 2", "opportunità 3"],
  "minacce": ["minaccia 1", "minaccia 2"],
  "raccomandazioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1500 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<MarketIntelligenceInsights>(cleaned);
    return {
      summary: parsed.summary || "",
      opportunita: Array.isArray(parsed.opportunita) ? parsed.opportunita : [],
      minacce: Array.isArray(parsed.minacce) ? parsed.minacce : [],
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
    };
  } catch {
    return {
      summary:
        "Mercato attivo con competitor consolidati nelle categorie monitorate. Valutare differenziazione tecnica e pricing.",
      opportunita: ["Focus su nicchie con trend UP", "Partnership in regioni target"],
      minacce: ["Concentrazione aggiudicazioni su top player", "Ribassi aggressivi"],
      raccomandazioni: [
        "Monitorare bandi simili ultimi 12 mesi",
        "Allineare offerta tecnica ai criteri premianti",
      ],
    };
  }
}

export type RiskComplianceInsights = NonNullable<RiskComplianceProfile["insightsDeepSeek"]>;

export async function analyzeRiskComplianceInsights(
  profile: RiskComplianceProfile
): Promise<RiskComplianceInsights> {
  const risksSummary = profile.riskFactori
    .slice(0, 8)
    .map((r) => `${r.nome} (score ${r.score}, ${r.categoria})`)
    .join("\n");

  const reqsSummary = profile.complianceRequirements
    .filter((r) => r.obbligatorio)
    .slice(0, 10)
    .map((r) => `- ${r.titolo}`)
    .join("\n");

  const prompt = `Sei un consulente compliance e risk management per appalti pubblici italiani.
Analizza questo profilo risk & compliance.

GARA: ${profile.gara.title}
RISK CLASSE: ${profile.riskClasse} (${profile.riskComplessivo}/100)
PROGRESSO CHECKLIST: ${profile.checklist.progressoCompletamento}%

RISCHI:
${risksSummary || "Nessun rischio identificato"}

REQUISITI OBBLIGATORI:
${reqsSummary || "Nessun requisito"}

Rispondi SOLO con JSON valido, senza markdown:
{
  "riepilogo": "2-3 frasi executive",
  "principaliRischi": ["rischio 1", "rischio 2"],
  "requisitiCritici": ["requisito 1", "requisito 2"],
  "raccomandazioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 1500 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<RiskComplianceInsights>(cleaned);
    return {
      riepilogo: parsed.riepilogo || "",
      principaliRischi: Array.isArray(parsed.principaliRischi) ? parsed.principaliRischi : [],
      requisitiCritici: Array.isArray(parsed.requisitiCritici) ? parsed.requisitiCritici : [],
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
    };
  } catch {
    return {
      riepilogo: `Profilo ${profile.riskClasse}: monitorare requisiti obbligatori e timeline submission.`,
      principaliRischi: profile.riskFactori.slice(0, 3).map((r) => r.nome),
      requisitiCritici: profile.complianceRequirements
        .filter((r) => r.obbligatorio)
        .slice(0, 3)
        .map((r) => r.titolo),
      raccomandazioni: [
        "Completare checklist documentale",
        "Verifica legale requisiti antimafia e SOA",
        "Piano mitigation per rischi score ≥ 50",
      ],
    };
  }
}

export interface DeepRiskAnalysisResult {
  riepilogo: string;
  principaliRischi: string[];
  requisitiCritici: string[];
  raccomandazioni: string[];
  scoreRischioBest: number;
  scoreRischioWorst: number;
}

export async function generateDeepRiskAnalysis(
  profile: RiskComplianceProfile,
  antimafiaCheck: AntimafiaComplianceCheck,
  insuranceRisk: InsuranceFinancialRisk
): Promise<DeepRiskAnalysisResult> {
  const importo = parseTenderValue(profile.gara.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : profile.gara.value;

  const topRisks = profile.riskFactori
    .slice(0, 5)
    .map((r) => `${r.nome} (score ${r.score})`);
  const criticalCompliance = profile.complianceRequirements
    .filter((c) => c.obbligatorio)
    .slice(0, 5)
    .map((c) => c.titolo);

  const prompt = `Sei un esperto di risk management e compliance per appalti pubblici italiani.
Analizza questo profilo e genera un assessment approfondito.

GARA:
- Titolo: ${profile.gara.title}
- Valore: ${importoLabel}
- Categoria: ${profile.gara.category}
- Regione: ${profile.gara.region}

RISK PROFILE:
- Risk complessivo: ${profile.riskComplessivo}/100 (${profile.riskClasse})
- Top rischi: ${topRisks.join(" | ") || "nessuno"}

COMPLIANCE CRITICA:
- Antimafia: SOF=${antimafiaCheck.requiresSOF}, DURC=${antimafiaCheck.requiresDURC}, tracciabilità=${antimafiaCheck.requiresTracciabilita}
- Garanzia richiesta: €${insuranceRisk.importoGaranziaRichiesto.toLocaleString("it-IT")}
- Capitale circolante stimato: €${insuranceRisk.stimaCapitaleCircolante.toLocaleString("it-IT")}
- Risk finanziario: ${insuranceRisk.riskFinanziario}/100
- Items critici: ${criticalCompliance.join(", ") || "nessuno"}

Rispondi SOLO con JSON valido, senza markdown:
{
  "riepilogo": "paragrafo 3-4 frasi",
  "principaliRischi": ["rischio 1", "rischio 2", "rischio 3"],
  "requisitiCritici": ["requisito 1", "requisito 2"],
  "raccomandazioni": ["azione 1", "azione 2", "azione 3"],
  "scoreRischioBest": 25,
  "scoreRischioWorst": 85
}

scoreRischioBest = scenario ottimistico con mitigazione completa (0-100).
scoreRischioWorst = scenario pessimistico senza mitigazione (0-100).`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 2000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<DeepRiskAnalysisResult>(cleaned);
    const best = Math.min(100, Math.max(0, Number(parsed.scoreRischioBest ?? 25)));
    const worst = Math.min(100, Math.max(0, Number(parsed.scoreRischioWorst ?? 85)));
    return {
      riepilogo: parsed.riepilogo || "",
      principaliRischi: Array.isArray(parsed.principaliRischi) ? parsed.principaliRischi : [],
      requisitiCritici: Array.isArray(parsed.requisitiCritici) ? parsed.requisitiCritici : [],
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
      scoreRischioBest: best,
      scoreRischioWorst: Math.max(best, worst),
    };
  } catch {
    return {
      riepilogo:
        profile.insightsDeepSeek?.riepilogo ||
        `Profilo ${profile.riskClasse}: attenzione a compliance antimafia e garanzie finanziarie.`,
      principaliRischi:
        profile.riskFactori.slice(0, 3).map((r) => r.nome) || ["Documentazione incompleta"],
      requisitiCritici: ["SOF", "DURC", "Tracciabilità flussi"],
      raccomandazioni: [
        "Completare documentazione antimafia",
        "Procurare garanzia e polizza RC",
        "Piano mitigation per rischi score ≥ 50",
      ],
      scoreRischioBest: Math.max(0, profile.riskComplessivo - 20),
      scoreRischioWorst: Math.min(100, profile.riskComplessivo + 25),
    };
  }
}

export interface ComplianceDocumentationInsights {
  summary: string;
  priorita: string[];
  alertScadenze: string[];
}

export async function analyzeComplianceDocumentationInsights(
  profile: RiskComplianceProfile,
  trackers: ComplianceDocumentationTracker[],
  docReport: { summary: string; overdueCount: number; notStartedCount: number }
): Promise<ComplianceDocumentationInsights> {
  const overdue = trackers
    .filter((t) => t.stato === "OVERDUE")
    .map((t) => t.requirementTitolo);
  const pending = trackers
    .filter((t) => t.stato === "NOT_STARTED" && profile.complianceRequirements.find((r) => r.id === t.requirementId)?.obbligatorio)
    .slice(0, 5)
    .map((t) => t.requirementTitolo);

  const prompt = `Sei un compliance officer per appalti pubblici italiani.
Sintetizza lo stato documentazione per questa gara.

GARA: ${profile.gara.title}
PROGRESSO CHECKLIST: ${profile.checklist.progressoCompletamento}%
REPORT: ${docReport.summary}
SCADUTI: ${overdue.join(", ") || "nessuno"}
NON INIZIATI OBBLIGATORI: ${pending.join(", ") || "nessuno"}

Rispondi SOLO con JSON:
{
  "summary": "2 frasi stato documentale",
  "priorita": ["azione 1", "azione 2", "azione 3"],
  "alertScadenze": ["alert 1"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 1200 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<ComplianceDocumentationInsights>(cleaned);
    return {
      summary: parsed.summary || docReport.summary,
      priorita: Array.isArray(parsed.priorita) ? parsed.priorita : [],
      alertScadenze: Array.isArray(parsed.alertScadenze) ? parsed.alertScadenze : [],
    };
  } catch {
    return {
      summary: docReport.summary,
      priorita: pending.length > 0 ? [`Completare: ${pending[0]}`] : ["Mantenere documentazione aggiornata"],
      alertScadenze:
        overdue.length > 0 ? overdue.map((t) => `Scaduto: ${t}`) : [],
    };
  }
}

export type CAMComplianceInsights = NonNullable<
  CAMComplianceProfile["assessment"]["insightsDeepSeek"]
>;

export async function analyzeCAMComplianceInsights(
  profile: CAMComplianceProfile
): Promise<CAMComplianceInsights> {
  const reqsSummary = profile.requirements
    .map(
      (r) =>
        `- ${r.titolo} (${r.categoria.codice}, obbl=${r.obbligatorio}, ${r.categoria.scorePunti} pt)`
    )
    .join("\n");

  const itemsSummary = profile.assessment.assessmentItems
    .map((i) => `${i.titolo}: ${i.stato} (${i.puntiOttenuti}/${i.puntiMassimi})`)
    .join("\n");

  const prompt = `Sei un esperto CAM (Criteri Ambientali Minimi) per appalti pubblici italiani.
Analizza questo profilo di conformità ambientale.

GARA: ${profile.gara.title}
Categoria: ${profile.gara.category}
CAM Score: ${profile.assessment.scoreTotale}%
Conformità: ${profile.assessment.conformitaComplessiva}
Obbligatori coperti: ${profile.assessment.requisitiObbligatoriCoperti}/${profile.assessment.totalRequisitiObbligatori}

REQUISITI:
${reqsSummary}

ASSESSMENT:
${itemsSummary}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "2-3 frasi executive",
  "puntiForza": ["punto 1", "punto 2"],
  "puntiDeboli": ["debole 1", "debole 2"],
  "raccomandazioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1500 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<CAMComplianceInsights>(cleaned);
    return {
      analisi: parsed.analisi || "",
      puntiForza: Array.isArray(parsed.puntiForza) ? parsed.puntiForza : [],
      puntiDeboli: Array.isArray(parsed.puntiDeboli) ? parsed.puntiDeboli : [],
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
    };
  } catch {
    return {
      analisi: `Profilo CAM ${profile.assessment.conformitaComplessiva.replace(/_/g, " ")} al ${profile.assessment.scoreTotale}%.`,
      puntiForza:
        profile.assessment.requisitiObbligatoriCoperti > 0
          ? ["Requisiti obbligatori parzialmente coperti"]
          : [],
      puntiDeboli: profile.assessment.requisitiMancanti.slice(0, 3).map((r) => r.titolo),
      raccomandazioni: [
        "Completare documentazione EPD e piani rifiuti",
        "Attivare CAM opzionali per bonus punteggio",
        "Allineare offerta tecnica ai criteri premianti green",
      ],
    };
  }
}

export type DelayPenaltyInsights = NonNullable<DelayPenaltyExposure["insightsDeepSeek"]>;

export interface DelayRiskDeepInsights {
  analisi: string;
  fattoriRischio: string[];
  fattoriMitigazione: string[];
  probabilitaRealistica: number;
  raccomandazioni: string[];
}

export async function analyzeDelayRiskDeep(
  exposure: DelayPenaltyExposure,
  timelineAnalysis?: import("./delayPenaltyEngine").TimelineRiskAnalysis
): Promise<DelayRiskDeepInsights> {
  const importo = parseTenderValue(exposure.gara.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : exposure.gara.value;

  const pericoliFasi = timelineAnalysis?.faseRischiosa
    ? `Fase più rischiosa: ${timelineAnalysis.faseRischiosa.nome} (+${Math.round(timelineAnalysis.faseRischiosa.deltaPercent * 100)}% overrun)`
    : "Timeline non analizzata";

  const prompt = `Sei un esperto di rischi costruttivi e penalty management per appalti pubblici italiani.
Analizza il profilo di rischio ritardo.

GARA: ${exposure.gara.title}
Valore: ${importoLabel}
Durata: ${exposure.durationGiorni} giorni (~${Math.round(exposure.durationGiorni / 30)} mesi)

COMPANY:
- Ritardi storici: ${exposure.companyProfile.percentualeRitardiStorici}%
- Ritardo medio: ${exposure.companyProfile.giorninMedioRitardo} gg
- Peggiore: ${exposure.companyProfile.peggioreRitardo} gg
- Fattori: ${exposure.companyProfile.fattoriRischio.join(", ")}

PENALITÀ:
- P(ritardo): ${exposure.probabilitaRitardo}%
- Penalità attesa: €${exposure.penalitaAttesa.toLocaleString("it-IT")}
- Worst: €${exposure.penalitaWorstCase.toLocaleString("it-IT")}
- Margine residuo: €${exposure.margineDopoRitardo.toLocaleString("it-IT")}
- ${pericoliFasi}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "4-5 frasi assessment",
  "fattoriRischio": ["fattore 1", "fattore 2"],
  "fattoriMitigazione": ["mitigazione 1", "mitigazione 2"],
  "probabilitaRealistica": 45,
  "raccomandazioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 2000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<DelayRiskDeepInsights>(cleaned);
    return {
      analisi: parsed.analisi || "",
      fattoriRischio: Array.isArray(parsed.fattoriRischio) ? parsed.fattoriRischio : [],
      fattoriMitigazione: Array.isArray(parsed.fattoriMitigazione)
        ? parsed.fattoriMitigazione
        : [],
      probabilitaRealistica: Math.min(
        100,
        Math.max(0, Number(parsed.probabilitaRealistica ?? exposure.probabilitaRitardo))
      ),
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
    };
  } catch {
    return {
      analisi: `Rischio ${exposure.riskClasse}: penalità attesa €${exposure.penalitaAttesa.toLocaleString("it-IT")} su margine €${exposure.margineStimato.toLocaleString("it-IT")}.`,
      fattoriRischio: exposure.companyProfile.fattoriRischio,
      fattoriMitigazione: ["Extension clause", "Cap penalità 5%", "Subappalti garantiti"],
      probabilitaRealistica: exposure.probabilitaRitardo,
      raccomandazioni: [
        "Negoziare buffer temporale in contratto",
        "Formalizzare cap penalità",
        exposure.riskClasse === "CRITICO" ? "Valutare no-bid" : "Monitorare SAL critici",
      ],
    };
  }
}

export type VariantClaimsInsights = NonNullable<VariantRiskExposure["insightsDeepSeek"]>;

export interface VariantsClaimsDeepInsights {
  analisi: string;
  rischiPrincipali: string[];
  strategieNegoziazione: string[];
  documentazioneRichiesta: string[];
  raccomandazioni: string[];
}

export async function analyzeVariantsClaimsDeep(
  exposure: VariantRiskExposure
): Promise<VariantsClaimsDeepInsights> {
  const importo = parseTenderValue(exposure.gara.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : exposure.gara.value;
  const variantiVietate = exposure.variantClauses.filter(
    (c) => c.tipoVariante === "VARIANTE_VIETATA"
  ).length;

  const prompt = `Sei un esperto legale su varianti e claims negli appalti pubblici italiani.
Analizza il profilo di rischio varianti/claims.

GARA: ${exposure.gara.title}
Valore: ${importoLabel}
Categoria: ${exposure.gara.category}

VARIANTS:
- Varianti vietate: ${variantiVietate}
- P(variante): ${exposure.probabilitaVariantRichiesta}%
- Varianti stimate: ${exposure.numeroVariantiStimate}
- Esposizione varianti negate: €${exposure.importoVariantiNnegatteAtteso.toLocaleString("it-IT")}

CLAIMS:
- P(claims): ${exposure.probabilitaClaimsRivendicazione}%
- Claims stimati: ${exposure.numeroClaimsAttesi}
- Esposizione claims: €${exposure.importoTotaleClaimsAtteso.toLocaleString("it-IT")}
- Approval rate: ${exposure.percentualeApprovazioneClaims}%
- Risk classe: ${exposure.riskClasse}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "4-5 frasi assessment",
  "rischiPrincipali": ["rischio 1", "rischio 2"],
  "strategieNegoziazione": ["strategia 1", "strategia 2"],
  "documentazioneRichiesta": ["doc 1", "doc 2"],
  "raccomandazioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 2000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<VariantsClaimsDeepInsights>(cleaned);
    return {
      analisi: parsed.analisi || "",
      rischiPrincipali: Array.isArray(parsed.rischiPrincipali) ? parsed.rischiPrincipali : [],
      strategieNegoziazione: Array.isArray(parsed.strategieNegoziazione)
        ? parsed.strategieNegoziazione
        : [],
      documentazioneRichiesta: Array.isArray(parsed.documentazioneRichiesta)
        ? parsed.documentazioneRichiesta
        : [],
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
    };
  } catch {
    return {
      analisi: `Rischio ${exposure.riskClasse}: esposizione totale €${exposure.esposizioneTotale.toLocaleString("it-IT")} tra varianti negate e claims non approvati.`,
      rischiPrincipali: [
        "Varianti complesse o vietate",
        "Claims con oneri prova pesanti",
        "Bassa percentuale approvazione claims storica",
      ],
      strategieNegoziazione: [
        "Allargare % max varianti",
        "Semplificare oneri prova claims",
        "Eccezioni per cause esterne",
      ],
      documentazioneRichiesta: [
        "Template computo metrico varianti",
        "Protocollo documentazione claims",
      ],
      raccomandazioni: [
        "Negoziare clausole in sede di offerta",
        "Preparare computi per scenari claims",
        exposure.riskClasse === "CRITICO" ? "Valutare no-bid" : "Allineare PM e legale pre-firma",
      ],
    };
  }
}

export type PreSubmissionComplianceInsights = NonNullable<
  PreSubmissionComplianceAudit["insightsDeepSeek"]
>;

export interface ComplianceAuditDeepInsights {
  analisi: string;
  itemsCritici: string[];
  itemsAttenzione: string[];
  raccomandazioni: string[];
  priorityActions: Array<{ azione: string; timeline: string; impact: string }>;
}

export async function analyzeComplianceAuditDeep(
  audit: PreSubmissionComplianceAudit
): Promise<ComplianceAuditDeepInsights> {
  const importo = parseTenderValue(audit.gara.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : audit.gara.value;

  const blockingItems = audit.checklistItems.filter(
    (i) => i.obbligatorio && i.stato !== "COMPLETATO" && i.stato !== "NON_APPLICABILE"
  );
  const warningItems = audit.checklistItems.filter(
    (i) =>
      i.giorniRimanenti != null && i.giorniRimanenti < 30 && i.giorniRimanenti >= 0
  );

  const prompt = `Sei un esperto di compliance per appalti pubblici italiani.
Analizza questo pre-submission audit.

GARA: ${audit.gara.title}
Valore: ${importoLabel}
Risk: ${audit.complianceRisk} | Completion: ${audit.completamentoPercent}%
Blocchi: ${blockingItems.length} | Scadenze <30gg: ${warningItems.length}

ITEMS BLOCCANTI:
${blockingItems.map((i) => `- ${i.titolo}`).join("\n") || "nessuno"}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "4-5 frasi assessment",
  "itemsCritici": ["item 1"],
  "itemsAttenzione": ["item 1"],
  "raccomandazioni": ["rac 1"],
  "priorityActions": [{ "azione": "...", "timeline": "...", "impact": "high" }]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 2000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<ComplianceAuditDeepInsights>(cleaned);
    return {
      analisi: parsed.analisi || "",
      itemsCritici: Array.isArray(parsed.itemsCritici) ? parsed.itemsCritici : [],
      itemsAttenzione: Array.isArray(parsed.itemsAttenzione) ? parsed.itemsAttenzione : [],
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
      priorityActions: Array.isArray(parsed.priorityActions) ? parsed.priorityActions : [],
    };
  } catch {
    return {
      analisi: `Audit ${audit.complianceRisk}: ${audit.completamentoPercent}% completato, ${audit.itemsObbligatoriBlocchi} obbligatori aperti.`,
      itemsCritici: blockingItems.map((i) => i.titolo),
      itemsAttenzione: warningItems.map((i) => i.titolo),
      raccomandazioni: [
        "Completare items obbligatori bloccanti",
        "Rinnovare certificazioni in scadenza",
        "Caricare evidenze documentali",
      ],
      priorityActions: [
        { azione: "Chiudere obbligatori", timeline: "3-5 giorni", impact: "high" },
        { azione: "Rinnovare scadenze critiche", timeline: "7 giorni", impact: "high" },
        { azione: "Revisione offerta tecnica", timeline: "2 settimane", impact: "medium" },
      ],
    };
  }
}

export async function analyzePreSubmissionComplianceInsights(
  audit: PreSubmissionComplianceAudit
): Promise<PreSubmissionComplianceInsights> {
  const blocking = audit.blockingIssues.slice(0, 5).join("; ") || "nessuno";
  const pending = audit.checklistItems
    .filter((i) => i.obbligatorio && i.stato !== "COMPLETATO" && i.stato !== "NON_APPLICABILE")
    .map((i) => i.titolo)
    .slice(0, 8)
    .join(", ");

  const prompt = `Sei un esperto di compliance documentale per offerte in appalti pubblici italiani.
Analizza lo stato pre-invio di questa gara.

GARA: ${audit.gara.title}
Risk: ${audit.complianceRisk}
Completion: ${audit.completamentoPercent}%
Obbligatori mancanti: ${audit.itemsObbligatoriBlocchi}
Pronto invio: ${audit.readyForSubmission ? "sì" : "no"}

Blocchi: ${blocking}
Item obbligatori pendenti: ${pending || "nessuno"}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "2-3 frasi executive",
  "itemsCritici": ["item 1", "item 2"],
  "azioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1500 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<PreSubmissionComplianceInsights>(cleaned);
    return {
      analisi: parsed.analisi || "",
      itemsCritici: Array.isArray(parsed.itemsCritici) ? parsed.itemsCritici : [],
      azioni: Array.isArray(parsed.azioni) ? parsed.azioni : [],
    };
  } catch {
    return {
      analisi: `Audit ${audit.complianceRisk}: ${audit.completamentoPercent}% completato, ${audit.itemsObbligatoriBlocchi} obbligatori da chiudere.`,
      itemsCritici: audit.checklistItems
        .filter((i) => i.obbligatorio && i.stato !== "COMPLETATO")
        .map((i) => i.titolo)
        .slice(0, 5),
      azioni: [
        "Completare tutti gli item MUST",
        "Verificare scadenze DURC e assicurazioni",
        audit.readyForSubmission ? "Procedere con invio" : "Non inviare finché BLOCCANTE/ROSSO",
      ],
    };
  }
}

export type QualificationInsights = NonNullable<
  QualificationAssessment["insightsDeepSeek"]
>;

export async function analyzeQualificationInsights(
  assessment: QualificationAssessment
): Promise<QualificationInsights> {
  const gaps = assessment.gapsCritici
    .slice(0, 6)
    .map((g) => `${g.requirement}: ${g.gap}`)
    .join("; ");
  const nonConformi = assessment.matchingStatus
    .filter((m) => m.status !== "CONFORME")
    .map((m) => m.titolo)
    .slice(0, 8)
    .join(", ");

  const prompt = `Sei un esperto di qualificazione impresa per appalti pubblici italiani.
Analizza lo stato di idoneità alla gara.

GARA: ${assessment.gara.title}
Verdetto: ${assessment.qualificazioneVerdetto}
Compliance: ${assessment.compliancePercent}%
Obbligatori OK: ${assessment.conformiObbligatori}/${assessment.requirementsObbligatori}
Esclusori OK: ${assessment.conformiEsclusori}/${assessment.requirementsEsclusori}
RTI possibile: ${assessment.poteRTI ? "sì" : "no"}

Gap: ${gaps || "nessuno"}
Non conformi: ${nonConformi || "nessuno"}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "2-3 frasi executive",
  "gapsPrincipali": ["gap 1", "gap 2"],
  "pathToQualification": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1500 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<QualificationInsights>(cleaned);
    return {
      analisi: parsed.analisi || assessment.recommendation,
      gapsPrincipali: parsed.gapsPrincipali?.length
        ? parsed.gapsPrincipali
        : assessment.gapsCritici.map((g) => g.requirement).slice(0, 5),
      pathToQualification: parsed.pathToQualification?.length
        ? parsed.pathToQualification
        : assessment.requirementsPerRTI.slice(0, 3).map((r) => `RTI: ${r}`),
    };
  } catch {
    return {
      analisi: assessment.recommendation,
      gapsPrincipali: assessment.gapsCritici.map((g) => g.requirement).slice(0, 5),
      pathToQualification: [
        assessment.poteRTI
          ? "Valutare RTI per requisiti mancanti"
          : "Regolarizzare requisiti esclusori prima di partecipare",
        "Aggiornare profilo impresa con SOA e referenze",
      ],
    };
  }
}

export type QualificationDeepInsights = {
  analisi: string;
  gapsPrincipali: string[];
  pathToQualification: string[];
  urgenzaImplementazione: "BASSA" | "MEDIA" | "ALTA" | "CRITICA";
  raccomandazioni: string[];
};

export async function analyzeQualificationDeep(
  assessment: QualificationAssessment
): Promise<QualificationDeepInsights> {
  const criticalGaps = assessment.gapsCritici
    .filter((g) => g.effort === "ALTO")
    .map((g) => g.requirement);
  const totalGaps = assessment.gapsCritici.length;

  const prompt = `Sei un esperto di procurement e qualification aziendale per appalti pubblici.
Analizza questo profilo di qualificazione e genera pathway strategico.

GARA:
- Titolo: ${assessment.gara.title}
- Valore: ${assessment.gara.value}

ASSESSMENT:
- Verdict: ${assessment.qualificazioneVerdetto}
- Compliance: ${assessment.compliancePercent}%
- Obbligatori coperti: ${assessment.conformiObbligatori} / ${assessment.requirementsObbligatori}
- Esclusori coperti: ${assessment.conformiEsclusori} / ${assessment.requirementsEsclusori}
- Total gaps: ${totalGaps}
- Critical gaps (effort alto): ${criticalGaps.length}

GAPS PRINCIPALI:
${assessment.gapsCritici
  .slice(0, 3)
  .map((g) => `- ${g.requirement}: ${g.gap}`)
  .join("\n")}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "paragrafo 4-5 frasi assessment qualification pathway",
  "gapsPrincipali": ["gap principale 1", "gap principale 2"],
  "pathToQualification": ["azione 1", "azione 2", "azione 3"],
  "urgenzaImplementazione": "BASSA",
  "raccomandazioni": ["raccomandazione 1", "raccomandazione 2", "raccomandazione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 2000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<QualificationDeepInsights>(cleaned);
    const urgenza = parsed.urgenzaImplementazione;
    const validUrgenza =
      urgenza === "BASSA" ||
      urgenza === "MEDIA" ||
      urgenza === "ALTA" ||
      urgenza === "CRITICA"
        ? urgenza
        : criticalGaps.length > 0
          ? "ALTA"
          : "MEDIA";

    return {
      analisi: parsed.analisi || assessment.recommendation,
      gapsPrincipali: parsed.gapsPrincipali?.length
        ? parsed.gapsPrincipali
        : criticalGaps.slice(0, 3),
      pathToQualification: parsed.pathToQualification?.length
        ? parsed.pathToQualification
        : [
            "Identificare gap prioritario",
            "Scegliere accelerazione vs RTI",
            "Verificare compliance pre-invio",
          ],
      urgenzaImplementazione: validUrgenza,
      raccomandazioni: parsed.raccomandazioni?.length
        ? parsed.raccomandazioni
        : [
            assessment.poteRTI ? "Contattare partner RTI oggi" : "Regolarizzare esclusori",
            "Aggiornare profilo impresa (SOA, referenze)",
          ],
    };
  } catch {
    return {
      analisi:
        assessment.recommendation ||
        "Pathway di qualificazione dipende dal colmamento dei gap critici.",
      gapsPrincipali: criticalGaps.length
        ? criticalGaps
        : assessment.gapsCritici.map((g) => g.requirement).slice(0, 3),
      pathToQualification: [
        "Identificare gap prioritario",
        "Selezionare strategia (accelerazione vs RTI)",
        "Implementare in parallelo",
        "Verificare compliance finale prima invio offerta",
      ],
      urgenzaImplementazione:
        assessment.qualificazioneVerdetto === "ESCLUSORIO"
          ? "CRITICA"
          : criticalGaps.length > 0
            ? "ALTA"
            : "MEDIA",
      raccomandazioni: [
        assessment.poteRTI ? "Contattare partner RTI oggi" : "Regolarizzare requisiti esclusori",
        "Gap SOA: CCIAA fast-track o RTI",
        "Gap RC: broker per ampliamento urgente",
      ],
    };
  }
}

export async function analyzeVariantClaimsInsights(
  exposure: VariantRiskExposure
): Promise<VariantClaimsInsights> {
  const variantsSummary = exposure.variantClauses
    .map((v) => `${v.tipoVariante}: ${v.titolo} — max ${v.percentualeMaxImporto ?? "?"}%`)
    .join("\n");
  const claimsSummary = exposure.claimsClauses
    .map((c) => `${c.tipoClaimsAccettato}: ${c.titolo}`)
    .join("\n");

  const prompt = `Sei un esperto di varianti contrattuali e claims in appalti pubblici italiani.
Analizza l'esposizione varianti/claims di questa gara.

GARA: ${exposure.gara.title}
Esposizione totale: €${exposure.esposizioneTotale.toLocaleString("it-IT")}
Risk: ${exposure.riskClasse}
P(variante): ${exposure.probabilitaVariantRichiesta}% · P(claims): ${exposure.probabilitaClaimsRivendicazione}%
Varianti negate attese: €${exposure.importoVariantiNnegatteAtteso.toLocaleString("it-IT")}
Claims attesi: €${exposure.importoTotaleClaimsAtteso.toLocaleString("it-IT")}

VARIANTI:
${variantsSummary}

CLAIMS:
${claimsSummary}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "2-3 frasi executive",
  "rischiPrincipali": ["rischio 1", "rischio 2"],
  "strategie": ["strategia 1", "strategia 2", "strategia 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1500 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<VariantClaimsInsights>(cleaned);
    return {
      analisi: parsed.analisi || "",
      rischiPrincipali: Array.isArray(parsed.rischiPrincipali) ? parsed.rischiPrincipali : [],
      strategie: Array.isArray(parsed.strategie) ? parsed.strategie : [],
    };
  } catch {
    return {
      analisi: `Esposizione ${exposure.riskClasse}: €${exposure.esposizioneTotale.toLocaleString("it-IT")} tra varianti negate e claims non approvati.`,
      rischiPrincipali: [
        "Varianti non autorizzate",
        "Claims con oneri prova onerosi",
        "Tempi rivendicazione stretti",
      ],
      strategie: [
        "Negoziare procedure autorizzazione varianti in contratto",
        "Formalizzare cap claims e tempi rivendicazione",
        exposure.riskClasse === "CRITICO" ? "Valutare no-bid" : "Documentare SAL e varianti in corso d'opera",
      ],
    };
  }
}

export async function analyzeDelayPenaltyInsights(
  exposure: DelayPenaltyExposure
): Promise<DelayPenaltyInsights> {
  const clausesSummary = exposure.penaltyClauses
    .map(
      (c) =>
        `${c.tipo}: €${c.importoGiornaliero}/gg, tolleranza ${c.giorniToleranza}gg — ${c.descrizione.slice(0, 80)}`
    )
    .join("\n");

  const prompt = `Sei un esperto di risk management per appalti pubblici italiani (ritardi e penalità).
Analizza l'esposizione a penalità per ritardo di questa gara.

GARA: ${exposure.gara.title}
Durata stimata: ${exposure.durationGiorni} giorni
Probabilità ritardo: ${exposure.probabilitaRitardo}%
Giorni ritardo attesi: ${exposure.giorniRitardoAttesi}
Penalità attesa: €${exposure.penalitaAttesa.toLocaleString("it-IT")}
Worst case: €${exposure.penalitaWorstCase.toLocaleString("it-IT")}
Margine stimato: €${exposure.margineStimato.toLocaleString("it-IT")}
Margine dopo ritardo: €${exposure.margineDopoRitardo.toLocaleString("it-IT")}
Risk classe: ${exposure.riskClasse}

CLAUSOLE:
${clausesSummary}

Fattori rischio azienda: ${exposure.companyProfile.fattoriRischio.join(", ")}

Rispondi SOLO con JSON valido, senza markdown:
{
  "analisi": "2-3 frasi executive",
  "fattoriRischio": ["fattore 1", "fattore 2"],
  "azioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1500 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<DelayPenaltyInsights>(cleaned);
    return {
      analisi: parsed.analisi || "",
      fattoriRischio: Array.isArray(parsed.fattoriRischio) ? parsed.fattoriRischio : [],
      azioni: Array.isArray(parsed.azioni) ? parsed.azioni : [],
    };
  } catch {
    return {
      analisi: `Esposizione ${exposure.riskClasse}: penalità attesa €${exposure.penalitaAttesa.toLocaleString("it-IT")} su margine €${exposure.margineStimato.toLocaleString("it-IT")}.`,
      fattoriRischio: exposure.companyProfile.fattoriRischio,
      azioni: [
        "Negoziare cap penalità e giorni di tolleranza",
        "Buffer operativo su timeline critica",
        exposure.riskClasse === "CRITICO" ? "Valutare no-bid" : "Monitorare SAL e subappalti",
      ],
    };
  }
}

export interface CAMStrategicInsights {
  strategia: string;
  puntiForza: string[];
  puntiDeboli: string[];
  opportunita: string[];
  minacce: string[];
  raccomandazioni: string[];
}

export async function generateCAMStrategicInsights(
  profile: CAMComplianceProfile,
  costAnalysis: import("./camComplianceEngine").CAMCostAnalysis[] = []
): Promise<CAMStrategicInsights> {
  const importo = parseTenderValue(profile.gara.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : profile.gara.value;

  const topMissing = profile.assessment.requisitiMancanti.slice(0, 3);
  const miglioramenti = profile.miglioramentiPossibili.slice(0, 2);
  const costoTotaleExtra = costAnalysis.reduce((sum, c) => sum + c.deltaCosto, 0);

  const prompt = `Sei un consulente di sostenibilità per imprese edili italiane.
Analizza il profilo CAM compliance e genera strategia di posizionamento green.

GARA: ${profile.gara.title}
Valore: ${importoLabel}
CAM Score: ${profile.assessment.scorePercentuale}%
Conformità: ${profile.assessment.conformitaComplessiva}
Obbligatori: ${profile.assessment.requisitiObbligatoriCoperti}/${profile.assessment.totalRequisitiObbligatori}
Mancanti: ${topMissing.map((r) => r.titolo).join(", ") || "nessuno"}
Investimento extra stimato: €${costoTotaleExtra.toLocaleString("it-IT")}
Miglioramenti: ${miglioramenti.map((m) => m.categoria).join(", ") || "nessuno"}

Rispondi SOLO con JSON valido, senza markdown:
{
  "strategia": "3-4 frasi",
  "puntiForza": ["forza 1", "forza 2"],
  "puntiDeboli": ["debole 1", "debole 2"],
  "opportunita": ["opportunità 1", "opportunità 2"],
  "minacce": ["minaccia 1", "minaccia 2"],
  "raccomandazioni": ["azione 1", "azione 2", "azione 3"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.55, maxTokens: 2000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<CAMStrategicInsights>(cleaned);
    return {
      strategia: parsed.strategia || "",
      puntiForza: Array.isArray(parsed.puntiForza) ? parsed.puntiForza : [],
      puntiDeboli: Array.isArray(parsed.puntiDeboli) ? parsed.puntiDeboli : [],
      opportunita: Array.isArray(parsed.opportunita) ? parsed.opportunita : [],
      minacce: Array.isArray(parsed.minacce) ? parsed.minacce : [],
      raccomandazioni: Array.isArray(parsed.raccomandazioni) ? parsed.raccomandazioni : [],
    };
  } catch {
    return {
      strategia:
        "Posizionarsi come impresa green completando i requisiti CAM obbligatori e comunicando EPD/certificazioni in offerta tecnica.",
      puntiForza: [`Score CAM attuale ${profile.assessment.scoreTotale}%`],
      puntiDeboli: topMissing.map((r) => r.titolo),
      opportunita: ["Accesso committenti con criteri premianti ambientali"],
      minacce: ["Competitor già certificati", `Investimento €${costoTotaleExtra.toLocaleString("it-IT")}`],
      raccomandazioni: [
        "Completare gap CAM obbligatori",
        "Formalizzare documentazione fornitori",
        "Evidenziare CAM nel capitolato tecnico",
      ],
    };
  }
}

export async function analyzeCAMDocumentationAudit(
  tracker: import("./camComplianceEngine").CAMDocumentationTracker,
  profile: CAMComplianceProfile
): Promise<{
  summary: string;
  gapCritici: string[];
  azioniImmediate: string[];
}> {
  const missing = tracker.documentiObbligatori.filter((d) => d.stato === "BOZZA");
  const prompt = `Sei auditor CAM per appalti pubblici italiani.
Valuta lo stato documentale CAM.

GARA: ${profile.gara.title}
Progresso: ${tracker.progressoDocumentazione}%
Documenti obbligatori: ${tracker.documentiObbligatori.length}
Non sottomessi: ${missing.map((d) => d.titolo).join(", ") || "nessuno"}
Audit trail (ultime): ${tracker.auditTrail
    .slice(-3)
    .map((a) => a.azione)
    .join("; ")}

Rispondi SOLO con JSON:
{
  "summary": "2 frasi",
  "gapCritici": ["gap 1"],
  "azioniImmediate": ["azione 1", "azione 2"]
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 1000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<{
      summary: string;
      gapCritici: string[];
      azioniImmediate: string[];
    }>(cleaned);
    return {
      summary: parsed.summary || "",
      gapCritici: Array.isArray(parsed.gapCritici) ? parsed.gapCritici : [],
      azioniImmediate: Array.isArray(parsed.azioniImmediate) ? parsed.azioniImmediate : [],
    };
  } catch {
    return {
      summary: `${tracker.progressoDocumentazione}% documentazione CAM completata.`,
      gapCritici: missing.slice(0, 3).map((d) => d.titolo),
      azioniImmediate: ["Caricare certificazioni EPD mancanti", "Allineare piani rifiuti/energia"],
    };
  }
}

export async function analyzeFitStrategicInsights(
  tender: TenderDocument,
  fitProfile: FitStrategicProfile
): Promise<FitStrategicInsights> {
  const importoGara = parseTenderValue(tender.value);
  const importoLabel =
    importoGara > 0 ? `€${importoGara.toLocaleString("it-IT")}` : tender.value;

  const prompt = `Sei un consulente strategico per imprese edili italiane.
Analizza l'allineamento di una gara con il profilo strategico di crescita dell'impresa.

PROFILO STRATEGICO:
- Nicchie target: ${fitProfile.strategiaAttiva.nicchieTarget.map((n) => n.nome).join(", ") || "non definite"}
- Aree target: ${fitProfile.strategiaAttiva.areeTarget.map((a) => a.regione).join(", ") || "non definite"}
- Target fatturato annuale: €${(fitProfile.strategiaAttiva.importoTargetAnnuale / 1_000_000).toFixed(1)}M
- Margine target: ${fitProfile.strategiaAttiva.margineTargetMedio}%

GARA ANALIZZATA:
- Titolo: ${tender.title}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Importo: ${importoLabel}
- Procedura: ${tender.procedureType || "non specificata"}

Rispondi SOLO con JSON valido, senza markdown, senza backtick:
{
  "opportunita": ["string", "..."],
  "rischi": ["string", "..."],
  "azioni": ["string", "..."],
  "spiegazione": "paragrafo 3-4 frasi"
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.4, maxTokens: 1800 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<FitStrategicInsights>(cleaned);
    return {
      opportunita: Array.isArray(parsed.opportunita) ? parsed.opportunita : [],
      rischi: Array.isArray(parsed.rischi) ? parsed.rischi : [],
      azioni: Array.isArray(parsed.azioni) ? parsed.azioni : [],
      spiegazione: parsed.spiegazione || "",
    };
  } catch {
    return {
      opportunita: ["Accesso a nuovo segmento di mercato", "Diversificazione del portfolio commesse"],
      rischi: ["Impegno risorse su commessa non core", "Complessità organizzativa aggiuntiva"],
      azioni: ["Valutare partnership o RTI", "Pianificare timeline e capacità produttiva"],
      spiegazione:
        "Analisi strategica automatica non disponibile — valutare manualmente l'allineamento con il profilo di crescita.",
    };
  }
}

export interface ProposalGuidedTextResult {
  seczioneOfferta: string;
  noteRedazione: string[];
  wordCountTarget: number;
}

export async function generateProposalGuidedText(
  criterio: AwardCriterio,
  reverseMapVoci: ReverseMapVoce[],
  companyProfile?: CompanyProfile | null
): Promise<ProposalGuidedTextResult> {
  const obbligatorie = reverseMapVoci.filter((v) => v.obbligatorio);
  const critiche = reverseMapVoci.filter((v) => v.impatto === "CRITICO");

  const settore =
    companyProfile?.workSectors?.[0] ??
    companyProfile?.operationalPreferences?.preferredCategories?.[0] ??
    "Edilizia generale";
  const anniEsperienza = companyProfile?.foundedYear
    ? Math.max(1, new Date().getFullYear() - companyProfile.foundedYear)
    : 15;
  const companyName = companyProfile?.companyName?.trim() || "L'impresa";

  const prompt = `Sei un esperto di redazione offerte tecniche per appalti pubblici italiani.
Genera una sezione di offerta tecnica che massimizza i punti su un criterio di valutazione.

CRITERIO:
- Titolo: ${criterio.titolo}
- Descrizione: ${criterio.descrizione}
- Punti max: ${criterio.puntiTotali}

REQUISITI OBBLIGATORI (MUST HAVE):
${obbligatorie.length > 0 ? obbligatorie.map((v) => `- ${v.descrizione}`).join("\n") : "- Nessuno esplicito — coprire integralmente la descrizione del criterio"}

FATTORI CRITICI (DIFFERENZIAMENTO):
${critiche.length > 0 ? critiche.map((v) => `- ${v.descrizione}`).join("\n") : "- Evidenziare innovazione e track record"}

IMPRESA:
- Ragione sociale: ${companyName}
- Settore: ${settore}
- Anni di attività stimati: ${anniEsperienza}

Rispondi SOLO con JSON valido, senza markdown, senza backtick:
{
  "seczioneOfferta": "testo 300-400 parole, professionale, strutturato",
  "noteRedazione": ["nota 1", "nota 2", "nota 3"],
  "wordCountTarget": 350
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 2000 });
  const cleaned = cleanLlmJsonText(text);

  try {
    const parsed = parseGeminiJson<ProposalGuidedTextResult>(cleaned);
    return {
      seczioneOfferta: (parsed as { seczioneOfferta?: string }).seczioneOfferta || "",
      noteRedazione: Array.isArray(parsed.noteRedazione) ? parsed.noteRedazione : [],
      wordCountTarget: Number(parsed.wordCountTarget) || 350,
    };
  } catch {
    return {
      seczioneOfferta: `${companyName} presenta un'offerta tecnica strutturata su «${criterio.titolo}», coprendo i requisiti obbligatori e valorizzando elementi differenzianti coerenti con ${anniEsperienza} anni di esperienza nel settore.`,
      noteRedazione: [
        "Aggiungi certificazioni e referenze verificabili",
        "Includi almeno due case study pertinenti",
        "Allinea il testo ai paragrafi del bando",
      ],
      wordCountTarget: 350,
    };
  }
}

export async function mapSOACategoriesToANCE(
  categorieLocali: string[]
): Promise<SOACategoryANCEMapping[]> {
  if (categorieLocali.length === 0) return [];

  const prompt = `Sei un esperto di categorie SOA italiane e standard ANCE.
Mappa queste categorie locali estratte da un file SOA verso le categorie standard ANCE.

Categorie locali da mappare:
${categorieLocali.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Rispondi SOLO con un JSON array valido, senza markdown, senza backtick:
[
  {
    "locale": "descrizione locale esattamente come estratta",
    "anceStandard": "descrizione categoria ANCE standard equivalente",
    "codiceANCE": "codice ANCE (es. '01.01', '02.03', 'OG1')",
    "confidenza": 95
  }
]

Logica:
- Se categoria locale corrisponde perfettamente a ANCE, confidenza 95-100
- Se corrisponde parzialmente, confidenza 70-90
- Se dubbia, confidenza 50-70
- Se non mappabile, ometti dalla risposta

Standard ANCE principali:
01.xx = Scavi
02.xx = Fondazioni
03.xx = Murature
04.xx = Solai
05.xx = Coperture
06.xx = Impianti`;

  const text = await callInternalLlm(prompt, { temperature: 0.3, maxTokens: 2000 });

  try {
    return parseLlmJsonArray<SOACategoryANCEMapping>(text);
  } catch {
    return [];
  }
}

export async function reverseEngineerCompetitorPattern(
  pattern: WinningPattern,
  yourMargin = 8
): Promise<CompetitorPatternAnalysis> {
  const categoria = pattern.attributi.categorieSoa.join(", ") || "n/d";
  const regione = pattern.attributi.regioniTarget.join(", ") || "n/d";

  const prompt = `Sei un esperto strategico di appalti pubblici edili italiani.
Analizza questo pattern di gare vinte da un competitor (stimato) e reverse-engineer la loro strategia.

Pattern dati:
- Categoria: ${categoria}
- Regione: ${regione}
- Importo range: €${pattern.attributi.importoMin}-${pattern.attributi.importoMax}
- Win rate: ${pattern.statsVittoria.tassoDiSuccesso.toFixed(1)}%
- Ribasso medio: ${pattern.statsEconomiche.ribassoMedioVincente.toFixed(1)}%
- Margine medio realizzato: ${pattern.statsEconomiche.margineAttesoMedioPercent.toFixed(1)}%
- Complessità media: ${pattern.statsRischio.mediaComplessita.toFixed(0)}/100

Voi offrite margine target: ${yourMargin.toFixed(1)}%

Risposta SOLO JSON, senza markdown, senza backtick:
{
  "estimatedCompetitorRibasso": number,
  "estimatedCompetitorMargin": number,
  "competitorAdvantages": [string array, 3-4 vantaggi competitivi competitor],
  "competitorWeaknesses": [string array, 3-4 debolezze competitor],
  "strategyToCounterCompetitor": [string array, 3-4 strategie per battere competitor],
  "riskAssessment": "paragrafo 2-3 frasi valutazione rischio di competere contro questo competitor"
}`;

  const text = await callInternalLlm(prompt, { temperature: 0.5, maxTokens: 2000 });

  try {
    return parseGeminiJson<CompetitorPatternAnalysis>(text);
  } catch {
    return {
      estimatedCompetitorRibasso: pattern.statsEconomiche.ribassoMedioVincente + 1,
      estimatedCompetitorMargin: Math.max(
        0,
        pattern.statsEconomiche.margineAttesoMedioPercent - 1
      ),
      competitorAdvantages: [
        "Alta esperienza nella categoria",
        "Costi operativi potenzialmente più bassi",
      ],
      competitorWeaknesses: [
        "Possibile minore differenziazione tecnica",
        "Qualità offerta variabile su gare complesse",
      ],
      strategyToCounterCompetitor: [
        "Rafforzare offerta tecnica e referenze mirate",
        "Proteggere margine con pricing disciplinato",
      ],
      riskAssessment:
        "Competitor stimato competitivo su ribasso; superabile con differenziazione tecnica e controllo costi.",
    };
  }
}
