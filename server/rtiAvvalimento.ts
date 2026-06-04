import { formatGeminiError } from "./geminiChat";
import type {
  RtiAvvalimentoRequestBody,
  RtiAvvalimentoResponseBody,
} from "./rtiAvvalimentoTypes";
import { deepseekChatCompletion } from "./deepseekChat";

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
    "partnerSuggeriti": [
      {
        "id": "string — identificativo breve es. P1",
        "nome": "string — tipologia partner es. Impresa specializzata OG3",
        "categorieSOA": ["string — es. OG3, OS28"],
        "areeGeografiche": ["string — regioni operative"],
        "capacita": "string — cosa copre operativamente",
        "affidabilita": "Alta" | "Media" | "Bassa",
        "tipoSupporto": "mandataria" | "mandante" | "ausiliaria",
        "motivazioneMatch": "string — perché è il profilo giusto per questa gara"
      }
    ],
    "scenarioSenzaPartner": {
      "titolo": "Partecipazione autonoma (senza RTI)",
      "probabilitaVittoria": number,
      "stimaMargine": number,
      "principaliRischi": ["string"],
      "principaliVantaggi": ["string"]
    },
    "scenarioConPartner": {
      "titolo": "RTI con partner ottimale",
      "probabilitaVittoria": number,
      "stimaMargine": number,
      "principaliRischi": ["string"],
      "principaliVantaggi": ["string"]
    },
    "impattoPartner": {
      "fitDelta": number,
      "rischioD": number,
      "marginalitaDelta": number,
      "note": "string"
    },
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
  "partecipaDiretto": {
    "consigliato": boolean,
    "motivazione": "string",
    "condizioniNecessarie": ["string — condizioni da soddisfare prima di partecipare da soli"],
    "rischioResiduo": "string — rischio principale anche se si partecipa da soli",
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
  const prompt = buildPrompt(body);

  try {
    const { text } = await deepseekChatCompletion({
      prompt,
      model: process.env.OPENROUTER_MODEL,
      temperature: 0.3,
      maxTokens: 8192,
    });

    const extracted = text.trim();
    let cleaned = extracted;
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
    const parsed = JSON.parse(jsonStr) as RtiAvvalimentoResponseBody;
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
