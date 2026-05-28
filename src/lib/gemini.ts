/// <reference types="vite/client" />
import { EXPLAINABILITY_JSON_INLINE, normalizeExplainability } from "./explainability";
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
  RedFlagCategory,
  RedFlagSourceReference,
} from "../types";
import { requestParsePrezzario } from "./parsePrezzarioApi";
import { summarizePrezzarioVoci } from "./bidCalculations";

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
export function parseGeminiJson<T extends Record<string, unknown>>(
  text: string
): T & { explainability?: ExplainabilityData } {
  const extracted = extractJsonFromLlmResponse(text);
  const parsed = JSON.parse(extracted) as Record<string, unknown>;
  const explainability = normalizeExplainability(
    parsed.explainability as Partial<ExplainabilityData> | undefined
  ) ?? undefined;
  delete parsed.explainability;
  return { ...(parsed as T), explainability };
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
  ${EXPLAINABILITY_JSON_INLINE}
}

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

function parseTenderValue(valueStr: string): number {
  const cleaned = valueStr
    .replace(/[€\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function calcScenario(
  ribasso: number,
  importoGara: number,
  profile: CompanyProfile,
  label: PricingScenario["label"]
): PricingScenario {
  const importoOfferto = importoGara * (1 - ribasso / 100);

  const fattoreProduttivita = (profile.rendimentoSquadrePercent || 100) / 100;
  const incidenzaManodopera = 0.35;

  const costoManodoperaBase = importoOfferto * incidenzaManodopera;
  const costoManodoperaStimato =
    fattoreProduttivita > 0 ? costoManodoperaBase / fattoreProduttivita : costoManodoperaBase;

  const altriCosti =
    importoOfferto *
    ((profile.incidenzaSpeseGenerali || 15) / 100 +
      (profile.incidenzaRischioMedio || 3) / 100 +
      (1 - incidenzaManodopera - (profile.avgMarginPercent || 10) / 100));

  const costoTotale = costoManodoperaStimato + altriCosti;
  const margineCorrettoEuro = importoOfferto - costoTotale;
  const margineCorrettoPercent =
    importoOfferto > 0 ? (margineCorrettoEuro / importoOfferto) * 100 : 0;

  const costiBase =
    importoOfferto * (1 - (profile.avgMarginPercent || 10) / 100) +
    importoOfferto * ((profile.incidenzaSpeseGenerali || 15) / 100) +
    importoOfferto * ((profile.incidenzaRischioMedio || 3) / 100);
  const margineEuro = importoOfferto - costiBase;
  const margineStimato = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;

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
  ribassoPersonalizzato: number
): Promise<BidPricingResult> {
  const importoGara = parseTenderValue(tender.value);

  const scenari: PricingScenario[] = [
    calcScenario(profile.avgRibassoPercent + 3, importoGara, profile, "Aggressivo"),
    calcScenario(profile.avgRibassoPercent, importoGara, profile, "Bilanciato"),
    calcScenario(Math.max(0, profile.avgRibassoPercent - 3), importoGara, profile, "Conservativo"),
    calcScenario(ribassoPersonalizzato, importoGara, profile, "Personalizzato"),
  ];

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
  const normalizeCategory = (value: unknown): RedFlagCategory | string => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!raw) return "altro";
    if (raw.includes("hyper") || raw.includes("iper") || raw.includes("detailed")) return "hyper_detailed_specs";
    if (raw.includes("unbalanced") || raw.includes("sbilanc")) return "unbalanced_award_criteria";
    if (raw.includes("timeline") || raw.includes("tempi")) return "anomalous_timeline";
    if (raw.includes("combination") || raw.includes("combinazione")) return "restrictive_requirement_combination";
    return raw;
  };

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
      type: normalizeCategory(item.type),
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
      "type": "hyper_detailed_specs" | "unbalanced_award_criteria" | "anomalous_timeline" | "restrictive_requirement_combination" | string,
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
  ${EXPLAINABILITY_JSON_INLINE}
}

Categorie da cercare in modo esplicito (se c'e evidenza testuale):
- hyper_detailed_specs: specifiche tecniche iper-dettagliate potenzialmente cucite su uno specifico operatore
- unbalanced_award_criteria: criteri OEPV/punteggi potenzialmente sbilanciati o opachi
- anomalous_timeline: tempi di gara/esecuzione anomali o compressi
- restrictive_requirement_combination: combinazioni di requisiti che riducono eccessivamente la platea

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
      ? parsed.redFlags.map((item) => normalizeRedFlagItem(item as Record<string, unknown>))
      : [];
    return {
      ...parsed,
      redFlags,
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
  ${EXPLAINABILITY_JSON_INLINE}
}

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
