import type { ParsePrezzarioPdfResponse, ExtractedVocePrezzario } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";

const PREZZARIO_PARSE_PROMPT = `Sei un esperto di estrazione dati da prezzari pubblici e regionali italiani.
Analizza il testo estratto da un PDF prezzario e restituisci TUTTE le voci in formato JSON.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Per ogni voce estrai:
- codice: codice della voce (es. "01.01.001")
- descrizione: descrizione completa della lavorazione/materiale
- um: unità di misura (m, m2, m3, kg, l, ore, giorno, etc)
- prezzo: prezzo unitario in € (numero)
- categoria: categoria merceologica (Manodopera, Materiali, Noli, Lavorazioni, Spese, Rischio, Altro)
- confidenza: 0-100, confidenza nell'estrazione (100 = certissimo, 50 = dubbioso)

Logica:
- Se il prezzo non è leggibile, metti confidenza < 50
- Se la UM è ambigua, scrivi la più probabile e marca bassa confidenza
- Estrai TUTTE le voci, anche quelle parziali o poco chiare
- Se non riesci a estrarre nulla, ritorna array vuoto con success false

Struttura JSON richiesta:
{
  "success": boolean,
  "vocieEstratte": [
    {
      "codice": string,
      "descrizione": string,
      "um": string,
      "prezzo": number,
      "categoria": string,
      "confidenza": number
    }
  ],
  "totaleVoci": number,
  "regioneRilevata": string | null,
  "annoRilevato": number | null,
  "erroriEstrazione": string[],
  "messaggioEsito": string
}`;

function normalizeVoce(raw: Record<string, unknown>): ExtractedVocePrezzario | null {
  const codice = String(raw.codice ?? "").trim();
  const descrizione = String(raw.descrizione ?? "").trim();
  const um = String(raw.um ?? "cad").trim();
  const prezzo = Number(raw.prezzo);
  if (!codice && !descrizione) return null;
  if (!Number.isFinite(prezzo)) return null;

  return {
    codice: codice || "N/D",
    descrizione: descrizione || codice,
    um: um || "cad",
    prezzo,
    categoria: raw.categoria ? String(raw.categoria) : "Altro",
    confidenza: Math.min(100, Math.max(0, Number(raw.confidenza) || 70)),
  };
}

function normalizeParseResponse(
  raw: Record<string, unknown>,
  fileName: string
): ParsePrezzarioPdfResponse {
  const vocieRaw = Array.isArray(raw.vocieEstratte) ? raw.vocieEstratte : [];
  const vocieEstratte = vocieRaw
    .map((item) =>
      normalizeVoce(item && typeof item === "object" ? (item as Record<string, unknown>) : {})
    )
    .filter((v): v is ExtractedVocePrezzario => v != null);

  const erroriEstrazione = Array.isArray(raw.erroriEstrazione)
    ? raw.erroriEstrazione.map(String)
    : [];

  const regioneRilevata =
    raw.regioneRilevata != null && String(raw.regioneRilevata).trim()
      ? String(raw.regioneRilevata).trim()
      : undefined;
  const annoNum = raw.annoRilevato != null ? Number(raw.annoRilevato) : NaN;
  const annoRilevato = Number.isFinite(annoNum) ? annoNum : undefined;

  const success = vocieEstratte.length > 0 && Boolean(raw.success !== false);
  const messaggioEsito =
    String(raw.messaggioEsito ?? "").trim() ||
    (success
      ? `Estratte ${vocieEstratte.length} voci da ${fileName}${regioneRilevata ? ` (${regioneRilevata})` : ""}.`
      : `Nessuna voce estratta da ${fileName}.`);

  return {
    success,
    vocieEstratte,
    totaleVoci: vocieEstratte.length,
    regioneRilevata,
    annoRilevato,
    erroriEstrazione,
    messaggioEsito,
  };
}

export async function parsePrezzarioPdf(params: {
  pdfBase64: string;
  fileName: string;
  mimeType?: string;
}): Promise<ParsePrezzarioPdfResponse> {
  const data = params.pdfBase64.replace(/^data:[^;]+;base64,/, "").trim();
  if (!data) {
    throw new Error("File PDF non valido o vuoto.");
  }

  const { default: pdfParse } = await import("pdf-parse");
  const pdfBuffer = Buffer.from(data, "base64");
  const parsedPdf = await pdfParse(pdfBuffer);
  const extractedText = String(parsedPdf?.text ?? "").trim();

  if (!extractedText) {
    return {
      success: false,
      vocieEstratte: [],
      totaleVoci: 0,
      erroriEstrazione: ["Testo PDF vuoto — possibile scansione solo immagine."],
      messaggioEsito: "Impossibile estrarre testo dal PDF.",
    };
  }

  const model = resolveOpenRouterModel();
  const limitedText = extractedText.slice(0, 150000);
  const prompt = `${PREZZARIO_PARSE_PROMPT}\n\nFILENAME: ${params.fileName}\n\nTESTO PREZZARIO:\n${limitedText}`;

  const { text } = await deepseekChatCompletion({
    model,
    prompt,
    temperature: 0.2,
    maxTokens: 16000,
  });

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return normalizeParseResponse(parsed, params.fileName);
}
