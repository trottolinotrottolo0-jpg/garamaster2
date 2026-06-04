import type { SOAStructured, SOACategoria, SOAStructuredFonte } from "../src/types";
import {
  validateSOA,
  compareSoaVersions,
  type SOAValidationResult,
} from "../src/lib/soaValidationEngine";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const SOA_PARSE_PROMPT = `Sei un esperto di SOA (Sistema di Qualificazione delle Attrezzature) italiano e attestazioni CCIAA.
Analizza il testo estratto da un documento SOA dell'impresa e identifica TUTTE le categorie di lavori con importi massimi realizzati.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.

Struttura JSON:
{
  "categorie": [
    {
      "id": "cat-001",
      "codice": "01.01",
      "descrizione": "descrizione categoria",
      "importoMaxRealizzato": 500000,
      "annoUltimaRealizzazione": 2023,
      "confidenza": 95
    }
  ],
  "totalCategorie": number,
  "noteParsing": ["nota 1"],
  "importoTotaleMassimoRealizzabile": number
}

Logica:
- Estrai tutte le categorie SOA presenti (codici ANCE tipo "01.01", "OG1", "OS3", ecc.)
- importoMaxRealizzato in euro (numero, senza simbolo €)
- annoUltimaRealizzazione: anno a 4 cifre; se assente usa l'anno corrente stimato
- confidenza 0-100: abbassa se la riga è ambigua
- importoTotaleMassimoRealizzabile = somma degli importoMaxRealizzato delle categorie estratte
- Se non trovi categorie affidabili, categorie = [] e spiega in noteParsing`;

function stripBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function extractExcelRoughText(buffer: Buffer): string {
  const slice = buffer.subarray(0, Math.min(buffer.length, 400_000));
  const raw = slice.toString("latin1");
  const chunks = raw.match(/[\x20-\x7E\u00C0-\u024F]{4,}/g);
  return chunks ? chunks.join(" ") : "";
}

async function extractTextFromSoaFile(
  fileBase64: string,
  mimeType: string
): Promise<{ text: string; fonte: SOAStructuredFonte }> {
  const data = stripBase64(fileBase64);
  if (!data) {
    throw new Error("File SOA non valido o vuoto.");
  }

  const buffer = Buffer.from(data, "base64");
  const isPdf =
    mimeType === "application/pdf" || mimeType.toLowerCase().includes("pdf");

  if (isPdf) {
    let parsedPdf;
    try {
      parsedPdf = await pdfParse(buffer);
    } catch (pdfError) {
      const msg = pdfError instanceof Error ? pdfError.message : String(pdfError);
      console.error("❌ PDF PARSE ERROR:", {
        message: msg,
        code: (pdfError as NodeJS.ErrnoException).code,
        stack: pdfError instanceof Error ? pdfError.stack : undefined,
        bufferLength: buffer.length,
        bufferStart: buffer.slice(0, 10).toString("hex"),
      });
      throw new Error(
        `Impossibile leggere il PDF: ${msg}. ` +
        `Verifica che il file sia un PDF valido, non corrotto, non password-protected.`
      );
    }
    const text = String(parsedPdf?.text ?? "").trim();
    if (!text) {
      throw new Error(
        "Testo estratto dal PDF vuoto. Il file potrebbe essere scansione: prova un PDF testuale CCIAA."
      );
    }
    return { text, fonte: "PDF_CCIAA" };
  }

  const isSpreadsheet =
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "application/vnd.ms-excel";

  if (isSpreadsheet) {
    const text = extractExcelRoughText(buffer);
    if (text.length < 80) {
      throw new Error(
        "Impossibile estrarre testo dall'Excel. Esporta il foglio in PDF CCIAA e riprova."
      );
    }
    return { text, fonte: "EXCEL" };
  }

  throw new Error("Formato file non supportato. Usa PDF CCIAA o Excel (.xls, .xlsx).");
}

function normalizeCategorie(raw: unknown): SOACategoria[] {
  if (!Array.isArray(raw)) return [];

  const yearNow = new Date().getFullYear();

  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const importo = Number(o.importoMaxRealizzato ?? o.importo ?? 0);
    const anno = Number(o.annoUltimaRealizzazione ?? o.anno ?? yearNow);
    const confidenza = Number(o.confidenza ?? 70);

    return {
      id: String(o.id ?? `cat-${index + 1}`),
      codice: String(o.codice ?? o.code ?? "N/D").trim(),
      descrizione: String(o.descrizione ?? o.description ?? "").trim() || "Categoria SOA",
      importoMaxRealizzato: Number.isFinite(importo) ? Math.max(0, importo) : 0,
      annoUltimaRealizzazione:
        Number.isFinite(anno) && anno > 1990 && anno < 2100 ? Math.round(anno) : yearNow,
      confidenza: Number.isFinite(confidenza)
        ? Math.min(100, Math.max(0, Math.round(confidenza)))
        : 70,
    };
  });
}

function normalizeParseResult(
  parsed: Record<string, unknown>,
  meta: { fileName: string; fonte: SOAStructuredFonte }
): SOAStructured {
  const categorie = normalizeCategorie(parsed.categorie);
  const sommaImporti = categorie.reduce((acc, c) => acc + c.importoMaxRealizzato, 0);
  const importoTotale =
    Number(parsed.importoTotaleMassimoRealizzabile) > 0
      ? Number(parsed.importoTotaleMassimoRealizzabile)
      : sommaImporti;

  const noteParsing = Array.isArray(parsed.noteParsing)
    ? parsed.noteParsing.map(String)
    : [];

  if (categorie.length === 0 && noteParsing.length === 0) {
    noteParsing.push("Nessuna categoria SOA estratta con sufficiente confidenza.");
  }

  return {
    id: `soa-${Date.now()}`,
    dataImportazione: new Date().toISOString(),
    fonte: meta.fonte,
    fileName: meta.fileName,
    categorie,
    totalCategorie: categorie.length,
    importoTotaleMassimoRealizzabile: importoTotale,
    noteParsing,
    statoValidazione: "NUOVO",
  };
}

export async function parseSOAFile(params: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<SOAStructured> {
  const { text, fonte } = await extractTextFromSoaFile(params.fileBase64, params.mimeType);
  const limitedText = text.slice(0, 120_000);

  const prompt = `${SOA_PARSE_PROMPT}

File: ${params.fileName}
Fonte: ${fonte}

TESTO DOCUMENTO SOA:
${limitedText}`;

  const model = resolveOpenRouterModel();
  const { text: llmText } = await deepseekChatCompletion({
    model,
    prompt,
    temperature: 0.2,
    maxTokens: 4096,
  });

  const cleaned = llmText
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const normalized = normalizeParseResult(parsed, {
      fileName: params.fileName,
      fonte,
    });
    return enrichSOAWithValidation(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON non valido";
    throw new Error(`Parsing SOA fallito: ${message}`);
  }
}

export async function parseSOAPdf(fileBase64: string, fileName: string): Promise<SOAStructured> {
  return parseSOAFile({
    fileBase64,
    fileName,
    mimeType: "application/pdf",
  });
}

export async function parseSOAExcel(fileBase64: string, fileName: string): Promise<SOAStructured> {
  return parseSOAFile({
    fileBase64,
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Validazione completezza lato server (stesse regole del client). */
export function validateParsedSOA(soa: SOAStructured): SOAValidationResult {
  return validateSOA(soa);
}

export function compareSOAVersions(
  soaOld: SOAStructured,
  soaNew: SOAStructured
) {
  return compareSoaVersions(soaOld, soaNew);
}

function enrichSOAWithValidation(soa: SOAStructured): SOAStructured {
  const validation = validateSOA(soa);
  const extraNotes = [
    `Validazione automatica: completezza ${validation.completenessScore}%`,
    ...validation.recommendations,
  ];
  return {
    ...soa,
    noteParsing: [...soa.noteParsing, ...extraNotes],
    statoValidazione: validation.isComplete ? "VALIDATO" : "NUOVO",
  };
}
