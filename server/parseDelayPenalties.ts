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
