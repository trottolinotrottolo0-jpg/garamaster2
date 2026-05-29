import type { TenderDocument, CAMRequirement } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";

const CAM_PROMPT = `Sei un esperto CAM (Criteri Ambientali Minimi) per appalti pubblici italiani (D.M. 11/10/2017 e D.M. 23/06/2022).
Analizza il disciplinare di gara e identifica tutti i requisiti CAM presenti.
Rispondi SOLO con un array JSON valido senza markdown.

Struttura JSON:
[
  {
    "id": "cam-001",
    "categoria": "ambientale" | "energetica" | "sociale" | "qualita",
    "titolo": "Titolo requisito",
    "descrizione": "Descrizione dettagliata",
    "obbligatorio": true,
    "puntiPremiali": null,
    "normaRiferimento": "D.M. ..."
  }
]

DATI GARA:`;

export async function parseCAMRequirementsFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<CAMRequirement[]> {
  const model = resolveOpenRouterModel();
  const pdfContent = Buffer.from(bandoPdfBase64, "base64").toString("utf-8").slice(0, 6000);

  const prompt = `${CAM_PROMPT}
Titolo: ${tender.title}
Categoria: ${tender.category}
Testo estratto: ${pdfContent}`;

  try {
    const { text } = await deepseekChatCompletion({ model, prompt, maxTokens: 2000 });
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr as CAMRequirement[];
  } catch (err) {
    console.error("[parseCAMRequirements] error:", err);
    return [];
  }
}
