import { GoogleGenAI } from "@google/genai";
import { formatGeminiError } from "./geminiChat";
import type {
  RtiAvvalimentoRequestBody,
  RtiAvvalimentoResponseBody,
} from "./rtiAvvalimentoTypes";

function buildPrompt(body: RtiAvvalimentoRequestBody): string {
  return `Sei il modulo **RTI & Avvalimento Configurator** di GaraMaster AI per gare pubbliche italiane (D.Lgs. 36/2023).

L'impresa ha **requisiti SOA o qualificazione insufficienti** rispetto al bando. Devi analizzare tre percorsi e raccomandare il migliore.

GAP SOA / REQUISITI NON SODDISFATTI:
${JSON.stringify(body.soaGaps ?? [], null, 2)}

PROFILO IMPRESA (Supabase):
${JSON.stringify(body.profilo ?? null, null, 2)}

PROFILO OPERATIVO DETTAGLIATO:
${JSON.stringify(body.companyProfile ?? null, null, 2)}

GARA (disciplinare sintetico):
${JSON.stringify(
  {
    titolo: body.tender.title,
    cig: body.tender.cig,
    importo: body.tender.value,
    categoria: body.tender.category,
    regione: body.tender.region,
    requisiti: body.tender.requirements,
    anomalie: body.tender.anomalies,
    penali: body.tender.penalties,
  },
  null,
  2
)}

Valuta obbligatoriamente:
1. **RTI** — con chi, mandataria/mandante, quote %, responsabilità solidale, documenti (accordo RTI, DGUE, SOA del consorzio).
2. **Avvalimento art. 104** — quali requisiti economici/tecnici/organizzativi possono essere avvaluti, imprese ausiliarie, limiti (capacità professionale non trasferibile).
3. **Lasciare perdere** — se gap non colmabile, rischi esclusione, costi RTI eccessivi.

Rispondi SOLO con JSON valido, senza markdown:
{
  "raccomandazioneFinale": "RTI" | "AVVALIMENTO" | "LASCIARE_PERDERE" | "PARTECIPARE_DIRETTA",
  "sintesi": "string — 2-3 frasi decisionali",
  "gapSoa": ["string — elenco gap"],
  "rti": {
    "consigliato": boolean,
    "motivazione": "string",
    "struttura": "string — mandataria/mandante, forma RTI",
    "capogruppo": "string — chi deve essere capogruppo e perché",
    "quotePartecipazione": "string — ripartizione % indicativa",
    "partnerSuggeriti": ["string — tipologie imprese partner"],
    "documenti": ["string — documenti per formalizzare RTI"]
  },
  "avvalimento": {
    "consigliato": boolean,
    "motivazione": "string",
    "riferimentoNormativo": "art. 104 D.Lgs. 36/2023 — dettaglio operativo",
    "requisitiDaAvvalere": ["string"],
    "impreseAusiliarie": ["string — profili ausiliari indicativi"],
    "limiti": "string — cosa NON si può avvalere",
    "documenti": ["string"]
  },
  "lasciarePerdere": {
    "consigliato": boolean,
    "motivazione": "string",
    "rischiPrincipali": ["string"],
    "documenti": []
  },
  "perche": "string",
  "datiUsati": "string",
  "verifica": "string",
  "confidenza": "Alto" | "Medio" | "Basso"
}`;
}

export async function generateRtiAvvalimentoAnalysis(
  body: RtiAvvalimentoRequestBody
): Promise<RtiAvvalimentoResponseBody> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY non configurata.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(body);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { maxOutputTokens: 8192 },
    });

    const text = response.text?.trim() ?? "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as RtiAvvalimentoResponseBody;
    return parsed;
  } catch (error) {
    throw new Error(formatGeminiError(error));
  }
}

export async function safeGenerateRtiAvvalimento(
  body: RtiAvvalimentoRequestBody
): Promise<RtiAvvalimentoResponseBody> {
  try {
    return await generateRtiAvvalimentoAnalysis(body);
  } catch (firstError) {
    console.warn("[RTI/Avvalimento] Primo tentativo fallito:", firstError);
    return generateRtiAvvalimentoAnalysis(body);
  }
}
