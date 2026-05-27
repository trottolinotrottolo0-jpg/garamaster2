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
} from "../types";

function parseGeminiJson<T extends Record<string, unknown>>(
  text: string
): T & { explainability?: ExplainabilityData } {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
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

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });

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
  const costiStimati =
    importoOfferto * (1 - profile.avgMarginPercent / 100) +
    importoOfferto * (profile.incidenzaSpeseGenerali / 100) +
    importoOfferto * (profile.incidenzaRischioMedio / 100);
  const margineEuro = importoOfferto - costiStimati;
  const margineStimato = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;
  const rischioAlert = margineStimato < profile.minMargineAccettabile;
  return { ribasso, importoOfferto, margineStimato, margineEuro, label, rischioAlert };
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
  ${EXPLAINABILITY_JSON_INLINE}
}

Logica per il range:
- rangeMin = ribasso sotto cui il margine scende sotto minMargineAccettabile
- rangeMax = ribasso massimo sostenibile mantenendo margine accettabile
- ribassoOttimale = punto di equilibrio tra competitività e margine
- alertMargine = true se anche ribassoOttimale porta margine vicino al limite (< minMargine + 2%)
- winRatePrudente: considera storico impresa, fit gara, complessità — rimani prudente

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- Importo base: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti: ${JSON.stringify(tender.requirements)}
- Anomalie: ${tender.anomalies.join(", ") || "nessuna"}

SCENARI PRE-CALCOLATI (per contesto):
${JSON.stringify(scenari, null, 2)}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsed = parseGeminiJson<Omit<BidPricingResult, "scenari" | "generatedAt" | "explainability">>(
      text
    );
    return { ...parsed, scenari, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runRedFlagAnalysis(
  tender: TenderDocument
): Promise<RedFlagAnalysisResult> {
  const prompt = `Sei un esperto legale specializzato in gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Analizza i dati della gara e individua clausole problematiche, requisiti sproporzionati, anomalie e red flag.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.

Struttura JSON richiesta:
{
  "redFlags": [
    {
      "title": string,
      "type": string,
      "clause": string (citazione breve della clausola problematica, max 200 caratteri),
      "articleRef": string (riferimento normativo preciso),
      "severity": "high" | "medium" | "low",
      "simpleExplanation": string (3-4 frasi in linguaggio semplice per un imprenditore edile),
      "remedy": string (azione concreta da intraprendere),
      "clarificationText": string (bozza lettera/quesito formale pronto per il portale gare, 80-120 parole, in italiano formale, includi CIG della gara)
    }
  ],
  "rischioComplessivo": "high" | "medium" | "low",
  "conteggioHigh": number,
  "conteggioMedium": number,
  "conteggioLow": number,
  "sintesiRischio": string (2-3 frasi di sintesi sul profilo di rischio complessivo della gara),
  ${EXPLAINABILITY_JSON_INLINE}
}

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
  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsed = parseGeminiJson<Omit<RedFlagAnalysisResult, "generatedAt" | "explainability">>(
      text
    );
    return { ...parsed, generatedAt: new Date().toISOString() };
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
  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsedCap = parseGeminiJson<
      Omit<CapacityAnalysisResult, "generatedAt" | "explainability">
    >(text);
    return { ...parsedCap, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runProfitabilityGate(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<ProfitabilityGateResult> {
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

Logica breakdown costi (6 voci obbligatorie, somma deve avvicinarsi all'importo offerto):
1. Manodopera: stima basata su costoOraOperaio, costoOraCaposquadra, complessità gara
2. Materiali: stima basata su categoria lavori e importo
3. Noli/Mezzi: stima basata su tipo lavori
4. Spese generali: profile.incidenzaSpeseGenerali% dell'importo
5. Accantonamento rischio: profile.incidenzaRischioMedio% dell'importo
6. Utile atteso: differenza tra importo offerto e somma costi precedenti

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
- Requisiti: ${JSON.stringify(tender.requirements)}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsed = parseGeminiJson<
      Omit<ProfitabilityGateResult, "generatedAt" | "explainability">
    >(text);
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}
