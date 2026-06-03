import { deepseekChatCompletion } from "./deepseekChat";
import { buildTenderContext } from "./buildTenderContext";
import { buildDefaultPreparationSeeds } from "../src/lib/tenderPreparationEngine";
import type { TenderDocument } from "../src/types";
import type { ProfiloImpresaContext } from "../src/types/database";
import type { TenderPreparationSuggestResult } from "../src/types/tenderPreparation";

const SUGGEST_MAX_TOKENS = 1200;

function isOpenRouterCreditsError(message: string): boolean {
  return /credits|max_tokens|afford/i.test(message);
}

function localFallbackSuggest(
  body: TenderPreparationSuggestBody
): TenderPreparationSuggestResult {
  const { documents, checklist } = buildDefaultPreparationSeeds(body.tender, body.profilo ?? null);
  const existingDocs = new Set((body.existingDocuments ?? []).map((s) => s.toLowerCase()));
  const existingChk = new Set((body.existingChecklist ?? []).map((s) => s.toLowerCase()));

  const critici: string[] = [];
  if (!body.profilo?.soa) critici.push("Attestazione SOA");
  if (!body.profilo?.ragioneSociale) critici.push("Dati anagrafici impresa nel profilo");

  return {
    documents: documents
      .filter((d) => !existingDocs.has(d.nome.toLowerCase()))
      .map((d) => ({
        categoria: d.categoria,
        nome: d.nome,
        obbligatorio: d.obbligatorio !== false,
        note: d.note,
      })),
    checklist: checklist
      .filter((c) => !existingChk.has(`${c.busta}: ${c.titolo}`.toLowerCase()))
      .map((c) => ({
        busta: c.busta,
        titolo: c.titolo,
        obbligatorio: c.obbligatorio !== false,
        note: c.note,
      })),
    testiAmministrativi: [
      `Il sottoscritto legale rappresentante di ${body.profilo?.ragioneSociale ?? "…"} dichiara di possedere i requisiti di partecipazione previsti dal bando ${body.tender.cig}.`,
      "Dichiaro di non trovarmi in alcuna delle cause di esclusione di cui agli artt. 94 e 95 del D.Lgs. 36/2023.",
    ],
    documentiMancantiCritici: critici,
  };
}

export type TenderPreparationSuggestBody = {
  tender: TenderDocument;
  profilo?: ProfiloImpresaContext | null;
  existingDocuments?: string[];
  existingChecklist?: string[];
};

function buildPrompt(body: TenderPreparationSuggestBody): string {
  const profilo = body.profilo;
  const tenderCtx = buildTenderContext(body.tender);

  return `Sei un consulente gare d'appalto pubblico italiano (D.Lgs. 36/2023).

PROFILO IMPRESA:
${profilo ? JSON.stringify(profilo, null, 2) : "Non disponibile"}

GARA:
${tenderCtx}

Documenti già in lista: ${(body.existingDocuments ?? []).join("; ") || "nessuno"}
Checklist già presente: ${(body.existingChecklist ?? []).join("; ") || "nessuna"}

Genera suggerimenti per la preparazione dell'offerta.

Rispondi SOLO con JSON valido:
{
  "documents": [
    { "categoria": "amministrativa|tecnica|economica|generale", "nome": "string", "obbligatorio": true, "note": "opzionale" }
  ],
  "checklist": [
    { "busta": "amministrativa|tecnica|economica", "titolo": "string", "obbligatorio": true, "note": "opzionale" }
  ],
  "testiAmministrativi": ["bozza dichiarazione 1", "bozza autocertificazione 2"],
  "documentiMancantiCritici": ["documento critico 1"]
}

Regole:
- documents: max 12 voci pertinenti al bando
- checklist: max 10 voci operative
- testiAmministrativi: 2-4 frasi standard italiane per busta amministrativa (DGUE, antimafia, requisiti)
- documentiMancantiCritici: solo i più critici se profilo incompleto`;
}

export async function suggestTenderPreparation(
  body: TenderPreparationSuggestBody
): Promise<TenderPreparationSuggestResult> {
  try {
    const { text } = await deepseekChatCompletion({
      prompt: buildPrompt(body),
      temperature: 0.2,
      maxTokens: SUGGEST_MAX_TOKENS,
    });

    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as TenderPreparationSuggestResult;

    return {
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
      testiAmministrativi: parsed.testiAmministrativi ?? [],
      documentiMancantiCritici: parsed.documentiMancantiCritici ?? [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const useLocal =
      isOpenRouterCreditsError(message) ||
      message.includes("JSON") ||
      message.includes("OpenRouter");
    if (useLocal) {
      console.warn(`[tender-preparation/suggest] ${message.slice(0, 80)} — fallback locale`);
      return localFallbackSuggest(body);
    }
    throw error;
  }
}
