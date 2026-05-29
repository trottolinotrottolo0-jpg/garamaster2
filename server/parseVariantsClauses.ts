import type { TenderDocument, VariantClause, ClaimsClause } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";

export interface VariantsClausesResult {
  variantClauses: VariantClause[];
  claimsClauses: ClaimsClause[];
}

const VARIANTS_PROMPT = `Sei un esperto legale in clausole di variante e claim per appalti pubblici italiani (D.Lgs. 36/2023).
Analizza il disciplinare e identifica le clausole varianti e claims.
Rispondi SOLO con un oggetto JSON valido senza markdown.

Struttura JSON:
{
  "variantClauses": [ { "id": "var-001", "tipoVariante": "...", "descrizione": "...", "percentualeMassima": 20, "approvazioneDirettore": true, "giustificazioneRichiesta": true, "articoloRiferimento": "Art. 120" } ],
  "claimsClauses": [ { "id": "claim-001", "tipoReclamo": "...", "descrizione": "...", "terminePresentazione": 15, "proceduraPresentazione": "...", "articoloRiferimento": "Art. 200" } ]
}

DATI GARA:`;

export async function parseVariantsClausesFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<VariantsClausesResult> {
  const model = resolveOpenRouterModel();
  const pdfContent = Buffer.from(bandoPdfBase64, "base64").toString("utf-8").slice(0, 6000);

  const prompt = `${VARIANTS_PROMPT}
Titolo: ${tender.title}
Anomalie: ${tender.anomalies.join(", ") || "nessuna"}
Testo estratto: ${pdfContent}`;

  try {
    const { text } = await deepseekChatCompletion({ model, prompt, maxTokens: 2000 });
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as VariantsClausesResult;
    return {
      variantClauses: Array.isArray(parsed.variantClauses) ? parsed.variantClauses : [],
      claimsClauses: Array.isArray(parsed.claimsClauses) ? parsed.claimsClauses : [],
    };
  } catch (err) {
    console.error("[parseVariantsClauses] error:", err);
    return { variantClauses: [], claimsClauses: [] };
  }
}
