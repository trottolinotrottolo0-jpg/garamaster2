import type {
  AwardCriterio,
  AwardCriteriaAnalysis,
  AwardCriterioTipo,
  TenderDocument,
} from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const AWARD_CRITERIA_PROMPT = `Sei un esperto di criteri di valutazione per appalti pubblici italiani.
Analizza la sezione "Valutazione offerta tecnica" (o equivalente) del bando e estrai TUTTI i criteri di valutazione con punteggio.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.

Struttura JSON:
{
  "criteri": [
    {
      "id": "crit-001",
      "titolo": "titolo criterio",
      "descrizione": "descrizione completa",
      "puntiTotali": 20,
      "tipoCriterio": "TECNICO",
      "sogliaMinima": null,
      "confidenza": 95
    }
  ],
  "complessitaValutazione": 65,
  "fattoriDecisivi": ["fattore 1", "fattore 2"],
  "note": ["nota 1"]
}

tipoCriterio: uno tra TECNICO, ECONOMICO, SOSTENIBILITA, GESTIONALE, ALTRO.
- TECNICO = qualità tecnica offerta
- ECONOMICO = prezzo / ribasso
- SOSTENIBILITA = ambiente, CAM, sociale
- GESTIONALE = organizzazione, tempi, sicurezza cantiere
- ALTRO = criteri non classificabili

Logica:
- Estrai OGNI criterio con punteggio; se assente stima 3-5 punti e abbassa confidenza
- sogliaMinima: numero solo se esplicita soglia minima per il criterio, altrimenti null
- complessitaValutazione 0-100 (100 = molti criteri soggettivi)
- fattoriDecisivi: cosa conta di più per vincere
- Cerca anche tabelle punteggi, "criterio", "sub-criterio", "massimo X punti"`;

const VALUTAZIONE_KEYWORDS = [
  "valutazione",
  "criteri di aggiudicazione",
  "offerta tecnica",
  "punteggio",
  "punti",
  "sub-criter",
  "sub criter",
  "oepv",
  "offerta economicamente",
  "graduatoria",
  "attribuzione puntegg",
];

function extractValutazioneFocusedText(fullText: string): string {
  const lower = fullText.toLowerCase();
  const windows: string[] = [];

  for (const kw of VALUTAZIONE_KEYWORDS) {
    let idx = 0;
    while (idx < lower.length) {
      const pos = lower.indexOf(kw, idx);
      if (pos === -1) break;
      const start = Math.max(0, pos - 800);
      const end = Math.min(fullText.length, pos + 4500);
      windows.push(fullText.slice(start, end));
      idx = pos + kw.length;
      if (windows.length >= 12) break;
    }
    if (windows.length >= 12) break;
  }

  if (windows.length === 0) {
    return fullText.slice(0, 80_000);
  }

  const merged = [...new Set(windows)].join("\n\n---\n\n");
  return merged.slice(0, 100_000);
}

function stripBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function normalizeTipoCriterio(raw: unknown): AwardCriterioTipo {
  const t = String(raw ?? "ALTRO").toUpperCase();
  if (t.includes("SOSTEN") || t.includes("CAM") || t.includes("AMBIENT")) return "SOSTENIBILITA";
  if (t.includes("GEST") || t.includes("ORGAN") || t.includes("TEMPI")) return "GESTIONALE";
  if (t.includes("ECON") || t.includes("PREZZO") || t.includes("RIBASSO")) return "ECONOMICO";
  if (t.includes("TECN")) return "TECNICO";
  if (
    t === "TECNICO" ||
    t === "ECONOMICO" ||
    t === "SOSTENIBILITA" ||
    t === "GESTIONALE" ||
    t === "ALTRO"
  ) {
    return t as AwardCriterioTipo;
  }
  return "ALTRO";
}

function normalizeCriteri(raw: unknown): Omit<AwardCriterio, "peso">[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const punti = Math.max(0, Number(o.puntiTotali ?? o.punti ?? 0));
    const soglia = o.sogliaMinima;
    return {
      id: String(o.id ?? `crit-${String(index + 1).padStart(3, "0")}`),
      titolo: String(o.titolo ?? `Criterio ${index + 1}`),
      descrizione: String(o.descrizione ?? o.titolo ?? ""),
      puntiTotali: punti > 0 ? punti : 5,
      tipoCriterio: normalizeTipoCriterio(o.tipoCriterio),
      sogliaMinima:
        soglia != null && soglia !== "" && !Number.isNaN(Number(soglia))
          ? Number(soglia)
          : undefined,
      confidenza: Math.min(100, Math.max(0, Number(o.confidenza ?? 70))),
    };
  });
}

export async function parseAwardCriteriaFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<AwardCriteriaAnalysis> {
  const data = stripBase64(bandoPdfBase64);
  if (!data) {
    throw new Error("File PDF bando non valido o vuoto.");
  }

  const pdfBuffer = Buffer.from(data, "base64");
  let parsedPdf;
  try {
    parsedPdf = await pdfParse(pdfBuffer);
  } catch (pdfError) {
    const msg = pdfError instanceof Error ? pdfError.message : String(pdfError);
    console.error("❌ PDF PARSE ERROR:", {
      message: msg,
      code: (pdfError as NodeJS.ErrnoException).code,
      stack: pdfError instanceof Error ? pdfError.stack : undefined,
      bufferLength: pdfBuffer.length,
      bufferStart: pdfBuffer.slice(0, 10).toString("hex"),
    });
    throw new Error(
      `Impossibile leggere il PDF: ${msg}. ` +
      `Verifica che il file sia un PDF valido, non corrotto, non password-protected.`
    );
  }
  const extractedText = String(parsedPdf?.text ?? "").trim();

  if (!extractedText) {
    throw new Error(
      "Testo estratto dal PDF vuoto. Il bando potrebbe essere scansione: usa un PDF testuale."
    );
  }

  const model = resolveOpenRouterModel();
  const focusedText = extractValutazioneFocusedText(extractedText);
  const contextTail = extractedText.slice(-15_000);
  const prompt = `${AWARD_CRITERIA_PROMPT}

Documento: ${fileName}
Lunghezza testo totale estratto: ${extractedText.length} caratteri.

SEZIONI RILEVANTI (valutazione / punteggi / offerta tecnica):
${focusedText}

CONTEX FINALE DOCUMENTO (se utile per totali e allegati):
${contextTail}`;

  const { text } = await deepseekChatCompletion({
    model,
    prompt,
    temperature: 0.2,
    maxTokens: 6000,
  });

  let jsonText = text.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Parsing Award Criteria fallito: ${error instanceof Error ? error.message : "JSON non valido"}`
    );
  }

  const criteriBase = normalizeCriteri(parsed.criteri);
  const puntiMassimiTotali = criteriBase.reduce((sum, c) => sum + c.puntiTotali, 0);
  const divisor = puntiMassimiTotali > 0 ? puntiMassimiTotali : 1;

  const criteri: AwardCriterio[] = criteriBase.map((c) => ({
    ...c,
    peso: (c.puntiTotali / divisor) * 100,
  }));

  return {
    id: `awardana-${Date.now()}`,
    tender,
    dataAnalisi: new Date().toISOString(),
    criteri,
    reverseMap: {},
    puntiMassimiTotali: puntiMassimiTotali || criteri.reduce((s, c) => s + c.puntiTotali, 0),
    complessitaValutazione: Math.min(
      100,
      Math.max(0, Number(parsed.complessitaValutazione ?? 50))
    ),
    fattoriDecisivi: Array.isArray(parsed.fattoriDecisivi)
      ? parsed.fattoriDecisivi.map(String)
      : [],
    note: Array.isArray(parsed.note) ? parsed.note.map(String) : [],
  };
}
