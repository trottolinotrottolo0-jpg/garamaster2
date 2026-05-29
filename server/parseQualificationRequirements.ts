import type { TenderDocument, QualificationRequirement } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";

const QUALIFICATION_PROMPT = `Sei un esperto di qualificazione per appalti pubblici italiani (D.Lgs. 36/2023).
Analizza il disciplinare e identifica tutti i requisiti di qualificazione richiesti.
Rispondi SOLO con un array JSON valido senza markdown.

Struttura JSON:
[
  {
    "id": "qr-001",
    "tipo": "SOA" | "ISO" | "fatturato" | "referenze" | "personale" | "attrezzature" | "assicurazioni" | "antimafia" | "altro",
    "descrizione": "Descrizione requisito",
    "soglia": "valore soglia se presente",
    "obbligatorio": true,
    "articoloRiferimento": "Art. X"
  }
]

DATI GARA:`;

export async function parseQualificationRequirementsFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<QualificationRequirement[]> {
  const model = resolveOpenRouterModel();
  const pdfContent = Buffer.from(bandoPdfBase64, "base64").toString("utf-8").slice(0, 6000);

  const prompt = `${QUALIFICATION_PROMPT}
Titolo: ${tender.title}
Categoria: ${tender.category}
Requisiti noti: ${JSON.stringify(tender.requirements.slice(0, 5))}
Testo estratto: ${pdfContent}`;

  try {
    const { text } = await deepseekChatCompletion({ model, prompt, maxTokens: 2000 });
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr as QualificationRequirement[];
  } catch (err) {
    console.error("[parseQualificationRequirements] error:", err);
    return [];
  }
}
