/// <reference types="vite/client" />
import { GoogleGenerativeAI } from "@google/generative-ai";
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

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY as string);

export async function runBidNoBid(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<BidNoBidResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
  "capacitaSufficiente": boolean,
  "areaGeograficaOk": boolean,
  "importoInTarget": boolean,
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
- Penali: ${tender.penalties.join(", ") || "nessuna"}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 8000,
      },
      maxOutputTokens: 8000,
    },
  } as Parameters<typeof model.generateContent>[0]);
  const text = result.response.text().trim();

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
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 8000 },
      maxOutputTokens: 8000,
    },
  } as Parameters<typeof model.generateContent>[0]);

  const text = result.response.text().trim();
  try {
    const parsed = parseGeminiJson<Omit<BidPricingResult, "scenari" | "generatedAt" | "explainability">>(
      text
    );
    return { ...parsed, scenari, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta Gemini non valida — riprova");
  }
}

export async function runRedFlagAnalysis(
  tender: TenderDocument
): Promise<RedFlagAnalysisResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 8000 },
      maxOutputTokens: 8000,
    },
  } as Parameters<typeof model.generateContent>[0]);

  const text = result.response.text().trim();
  try {
    const parsed = parseGeminiJson<Omit<RedFlagAnalysisResult, "generatedAt" | "explainability">>(
      text
    );
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta Gemini non valida — riprova");
  }
}

export async function runCapacityAnalysis(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<CapacityAnalysisResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Durata stimata: da requisiti e sezioni disciplinare
- Requisiti: ${JSON.stringify(tender.requirements)}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 8000 },
      maxOutputTokens: 8000,
    },
  } as Parameters<typeof model.generateContent>[0]);

  const text = result.response.text().trim();
  try {
    const parsedCap = parseGeminiJson<
      Omit<CapacityAnalysisResult, "generatedAt" | "explainability">
    >(text);
    return { ...parsedCap, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta Gemini non valida — riprova");
  }
}

export async function runProfitabilityGate(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<ProfitabilityGateResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 8000 },
      maxOutputTokens: 8000,
    },
  } as Parameters<typeof model.generateContent>[0]);

  const text = result.response.text().trim();
  try {
    const parsed = parseGeminiJson<
      Omit<ProfitabilityGateResult, "generatedAt" | "explainability">
    >(text);
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta Gemini non valida — riprova");
  }
}
