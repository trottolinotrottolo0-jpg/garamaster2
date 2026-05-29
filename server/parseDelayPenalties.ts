import type { TenderDocument, PenaltyClause, PenaltyClauseTipo } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";
import { parseTenderValue } from "../src/lib/bidCalculations";

const PENALTY_PROMPT = `Sei un esperto di diritto dei contratti pubblici italiani.
Analizza il bando e estrai TUTTE le clausole di penalità per ritardo nell'esecuzione.

Rispondi SOLO con JSON valido, senza markdown:
{
  "penaltyClauses": [
    {
      "id": "penalty-001",
      "tipo": "GIORNALIERA",
      "importoGiornaliero": 500,
      "importoMassimo": 50000,
      "percentuale": null,
      "giorniToleranza": 10,
      "descrizione": "descrizione clausola",
      "note": ""
    }
  ]
}

tipo: GIORNALIERA | RAGGUAGLIATA | DECURTAZIONE_IMPORTO | RISOLUZIONE.
giorniToleranza = giorni di tolleranza prima che scatti la penalità (0 se immediata).`;

const PENALTY_KEYWORDS = [
  "penal",
  "ritard",
  "mora",
  "decurtaz",
  "risoluz",
  "giorn",
  "sal",
  "consegna",
  "termin",
];

function stripBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function extractPenaltyFocusedText(fullText: string): string {
  const lower = fullText.toLowerCase();
  const windows: string[] = [];
  for (const kw of PENALTY_KEYWORDS) {
    let idx = 0;
    while (idx < lower.length) {
      const pos = lower.indexOf(kw, idx);
      if (pos === -1) break;
      windows.push(fullText.slice(Math.max(0, pos - 600), Math.min(fullText.length, pos + 4000)));
      idx = pos + kw.length;
      if (windows.length >= 10) break;
    }
    if (windows.length >= 10) break;
  }
  return windows.length > 0
    ? [...new Set(windows)].join("\n\n---\n\n").slice(0, 100_000)
    : fullText.slice(0, 80_000);
}

function normalizeTipo(raw: unknown): PenaltyClauseTipo {
  const t = String(raw ?? "GIORNALIERA").toUpperCase();
  if (t.includes("DECURT") || t.includes("PERCENT")) return "DECURTAZIONE_IMPORTO";
  if (t.includes("RISOLUZ")) return "RISOLUZIONE";
  if (t.includes("RAGG")) return "RAGGUAGLIATA";
  return "GIORNALIERA";
}

export function defaultPenaltyClausesForTender(tender: TenderDocument): PenaltyClause[] {
  const importo = parseTenderValue(tender.value) || 500_000;

  if (tender.penalties?.length > 0) {
    return tender.penalties.map((desc, index) => ({
      id: `penalty-tender-${index + 1}`,
      tipo: "GIORNALIERA" as PenaltyClauseTipo,
      importoGiornaliero: Math.max(100, Math.round(importo * 0.001)),
      importoMassimo: Math.round(importo * 0.1),
      giorniToleranza: 5,
      descrizione: desc,
      note: "Estratto da scheda gara",
    }));
  }

  return [
    {
      id: "penalty-default-1",
      tipo: "GIORNALIERA",
      importoGiornaliero: Math.max(100, Math.round(importo * 0.005)),
      importoMassimo: Math.round(importo * 0.1),
      giorniToleranza: 5,
      descrizione:
        "Penalità giornaliera standard (stima): importo giornaliero ~0,5% importo contratto, cap 10%",
      note: "Default se bando non specifica penalità esplicite",
    },
  ];
}

function normalizePenaltyClauses(raw: unknown, tender: TenderDocument): PenaltyClause[] {
  if (!Array.isArray(raw)) return defaultPenaltyClausesForTender(tender);

  const importo = parseTenderValue(tender.value) || 500_000;

  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const tipo = normalizeTipo(o.tipo);
    const importoGiornaliero = Number(o.importoGiornaliero ?? 0);
    const percentuale = o.percentuale != null ? Number(o.percentuale) : undefined;

    return {
      id: String(o.id ?? `penalty-${String(index + 1).padStart(3, "0")}`),
      tipo,
      importoGiornaliero:
        importoGiornaliero > 0
          ? importoGiornaliero
          : tipo === "DECURTAZIONE_IMPORTO"
            ? 0
            : Math.max(100, Math.round(importo * 0.005)),
      importoMassimo:
        o.importoMassimo != null ? Number(o.importoMassimo) : Math.round(importo * 0.1),
      percentuale:
        percentuale != null && !Number.isNaN(percentuale)
          ? percentuale > 1
            ? percentuale
            : percentuale * 100
          : tipo === "DECURTAZIONE_IMPORTO"
            ? 0.5
            : undefined,
      giorniToleranza: Math.max(0, Number(o.giorniToleranza ?? 5)),
      descrizione: String(o.descrizione ?? `Penalità ${tipo}`),
      note: String(o.note ?? ""),
    };
  });
}
import type { TenderDocument, PenaltyClause } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";

const DELAY_PROMPT = `Sei un esperto legale in penali contrattuali per appalti pubblici italiani.
Analizza il disciplinare e identifica tutte le clausole penali presenti.
Rispondi SOLO con un array JSON valido senza markdown.

Struttura JSON:
[
  {
    "id": "pen-001",
    "tipo": "ritardo_consegna" | "ritardo_esecuzione" | "inadempimento" | "qualita" | "sicurezza" | "altro",
    "descrizione": "Descrizione della penale",
    "importoGiornaliero": null,
    "importoFisso": null,
    "percentualeImporto": null,
    "giorniTolleranza": 0,
    "importoMassimo": null,
    "articoloRiferimento": "Art. X"
  }
]

DATI GARA:`;

export async function parseDelayPenaltiesFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<PenaltyClause[]> {
  const data = stripBase64(bandoPdfBase64);
  if (!data) throw new Error("PDF bando non valido.");

  const { default: pdfParse } = await import("pdf-parse");
  const text = String((await pdfParse(Buffer.from(data, "base64")))?.text ?? "").trim();
  if (!text) throw new Error("Testo PDF vuoto — usa un PDF testuale.");

  const importo = parseTenderValue(tender.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : tender.value;
  const durationStimata = Math.max(90, Math.round(importo / 50_000));

  const model = resolveOpenRouterModel();
  const focused = extractPenaltyFocusedText(text);
  const prompt = `${PENALTY_PROMPT}

Documento: ${fileName}
Durata stimata: ${durationStimata} giorni
Importo: ${importoLabel}
Categoria: ${tender.category}

TESTO:
${focused}`;

  const { text: responseText } = await deepseekChatCompletion({
    model,
    prompt,
    temperature: 0.2,
    maxTokens: 3500,
  });

  let jsonText = responseText.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);

  const parsed = JSON.parse(jsonText.trim()) as { penaltyClauses?: unknown };
  const normalized = normalizePenaltyClauses(parsed.penaltyClauses, tender);
  return normalized.length > 0 ? normalized : defaultPenaltyClausesForTender(tender);
  const model = resolveOpenRouterModel();
  const pdfContent = Buffer.from(bandoPdfBase64, "base64").toString("utf-8").slice(0, 6000);

  const prompt = `${DELAY_PROMPT}
Titolo: ${tender.title}
Penali già note: ${tender.penalties.join(", ") || "nessuna"}
Testo estratto: ${pdfContent}`;

  try {
    const { text } = await deepseekChatCompletion({ model, prompt, maxTokens: 2000 });
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr as PenaltyClause[];
  } catch (err) {
    console.error("[parseDelayPenalties] error:", err);
    return [];
  }
}
