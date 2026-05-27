import type { DisciplinareParseResult } from "../src/types/disciplinareParse";
import { DISCIPLINARE_PARSE_USER_PROMPT } from "./disciplinareParsePrompt";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";

function normalizeParse(raw: Record<string, unknown>): DisciplinareParseResult {
  const requisitiSoa = Array.isArray(raw.requisiti_soa)
    ? raw.requisiti_soa.map((item) => {
        const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          categoria: String(o.categoria ?? "N/D"),
          classifica: String(o.classifica ?? "N/D"),
          descrizione: o.descrizione ? String(o.descrizione) : undefined,
        };
      })
    : [];

  const fatturatoRaw =
    raw.fatturato_minimo && typeof raw.fatturato_minimo === "object"
      ? (raw.fatturato_minimo as Record<string, unknown>)
      : {};

  const importoRaw =
    raw.importo_base_gara && typeof raw.importo_base_gara === "object"
      ? (raw.importo_base_gara as Record<string, unknown>)
      : {};

  const criterio = String(raw.criterio_aggiudicazione ?? "altro").toLowerCase();
  let criterioNorm: DisciplinareParseResult["criterio_aggiudicazione"] = "altro";
  if (criterio.includes("ribasso") || criterio === "massimo_ribasso") {
    criterioNorm = "massimo_ribasso";
  } else if (
    criterio.includes("vantaggiosa") ||
    criterio.includes("oepv") ||
    criterio === "offerta_economicamente_piu_vantaggiosa"
  ) {
    criterioNorm = "offerta_economicamente_piu_vantaggiosa";
  } else if (criterio.includes("misto")) {
    criterioNorm = "misto";
  }

  return {
    titolo: raw.titolo ? String(raw.titolo) : undefined,
    cig: raw.cig ? String(raw.cig) : undefined,
    regione: raw.regione ? String(raw.regione) : undefined,
    ente_appaltante: raw.ente_appaltante ? String(raw.ente_appaltante) : undefined,
    stazione_appaltante: raw.stazione_appaltante ? String(raw.stazione_appaltante) : undefined,
    requisiti_soa: requisitiSoa,
    fatturato_minimo: {
      richiesto: Boolean(fatturatoRaw.richiesto ?? fatturatoRaw.importo_euro),
      importo_euro:
        fatturatoRaw.importo_euro != null ? Number(fatturatoRaw.importo_euro) : null,
      descrizione: String(fatturatoRaw.descrizione ?? "Non specificato nel disciplinare"),
    },
    certificazioni_obbligatorie: Array.isArray(raw.certificazioni_obbligatorie)
      ? raw.certificazioni_obbligatorie.map(String)
      : [],
    importo_base_gara: {
      importo_euro:
        importoRaw.importo_euro != null ? Number(importoRaw.importo_euro) : null,
      descrizione: String(importoRaw.descrizione ?? ""),
    },
    scadenza_presentazione_offerte: String(
      raw.scadenza_presentazione_offerte ?? "Da verificare"
    ),
    criterio_aggiudicazione: criterioNorm,
    criterio_aggiudicazione_descrizione: raw.criterio_aggiudicazione_descrizione
      ? String(raw.criterio_aggiudicazione_descrizione)
      : undefined,
    clausole_rischiose_penali: Array.isArray(raw.clausole_rischiose_penali)
      ? raw.clausole_rischiose_penali.map(String)
      : [],
    requisiti_cam: Array.isArray(raw.requisiti_cam) ? raw.requisiti_cam.map(String) : [],
  };
}

export async function parseDisciplinarePdf(params: {
  pdfBase64: string;
  fileName: string;
  mimeType?: string;
}): Promise<{ parse: DisciplinareParseResult; model: string }> {
  const data = params.pdfBase64.replace(/^data:[^;]+;base64,/, "").trim();
  if (!data) {
    throw new Error("File PDF non valido o vuoto.");
  }

  const { default: pdfParse } = await import("pdf-parse");
  const pdfBuffer = Buffer.from(data, "base64");
  const parsedPdf = await pdfParse(pdfBuffer);
  const extractedText = String(parsedPdf?.text ?? "").trim();

  if (!extractedText) {
    throw new Error(
      "Testo estratto dal PDF vuoto. Il PDF potrebbe essere solo immagine/scansione."
    );
  }

  const model = resolveOpenRouterModel();
  const limitedText = extractedText.slice(0, 120000);
  const prompt = `${DISCIPLINARE_PARSE_USER_PROMPT}\n\nTESTO DISCIPLINARE:\n${limitedText}`;

  const { text, modelUsed } = await deepseekChatCompletion({
    model,
    prompt,
    temperature: 0.15,
    maxTokens: 8192,
  });

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return { parse: normalizeParse(parsed), model: modelUsed };
}
