import type { ProfiloImpresaContext } from "../src/types/database";
import type { TenderDocument } from "../src/types";
import { buildSoaGapSystemAddendum, detectSoaGaps } from "../src/lib/soaGapAnalysis";
import { buildStoricoPromptBlock } from "../src/lib/storicoGare";
import type { StoricoGaraPromptItem } from "../src/types/storicoGare";
import {
  EXPLAINABILITY_PROMPT_BLOCK,
  GARA_MASTER_CORE_INSTRUCTIONS,
} from "./garaMasterCorePrompt";

const OFFER_PREPARATION_MODE_BLOCK = `
## MODALITÀ PREPARAZIONE OFFERTA (guidata step-by-step)
Sei in modalità **PREPARAZIONE OFFERTA**.
Guida l'utente step-by-step nella preparazione dell'offerta per la gara nel JSON disciplinare.
- Chiedi **un'informazione alla volta** (ribasso previsto, subappaltatori, RTI/avvalimento, garanzia provvisoria, durata, personale chiave, ecc.).
- Sii **preciso** sui documenti richiesti dal disciplinare (DGUE, SOA, offerta tecnica, offerta economica, dichiarazioni, ecc.).
- Genera e aggiorna la **checklist documenti** suddivisa in: **Busta Amministrativa**, **Busta Tecnica**, **Busta Economica**.
- Segnala cosa manca ancora rispetto al bando.

Alla fine di ogni messaggio aggiungi un commento HTML con stato JSON (non ripeterlo nel testo visibile):

<!-- GM_OFFER_STATE
{"currentStep":"...","data":{"ribassoPrevisto":"..."},"checklist":{"amministrativa":[],"tecnica":[],"economica":[]}}
-->
`;

const GENERAL_CHAT_MODE_BLOCK = `
## MODALITÀ CHAT LIBERA (senza disciplinare selezionato)
L'utente sta conversando in stile ChatGPT: **nessun disciplinare è agganciato** a questa sessione.
- Rispondi su appalti, SOA, normativa, strategie, redazione documenti, grafici e PDF.
- Se serve un CIG o un disciplinare specifico, chiedi di collegare una gara dal catalogo o incollare estratti.
- Non inventare dati di bando non forniti dall'utente in questa conversazione.
`;

export type BuildPromptOptions = {
  chatMode?: "general" | "tender" | "offer_preparation";
  connectorsAddendum?: string;
  catalogSummary?: unknown;
  storicoGare?: StoricoGaraPromptItem[] | unknown[];
};

export function buildGaraMasterSystemPrompt(
  profilo?: ProfiloImpresaContext | null,
  gara?: TenderDocument | null,
  options?: BuildPromptOptions
): string {
  const chatMode =
    options?.chatMode ?? (gara?.id === "general-chat" ? "general" : "tender");

  const parts = [
    GARA_MASTER_CORE_INSTRUCTIONS,
    "",
    "## PROFILO IMPRESA (JSON — Supabase / contesto autenticato)",
    JSON.stringify(profilo ?? null, null, 2),
  ];

  if (chatMode === "general") {
    parts.push("", GENERAL_CHAT_MODE_BLOCK);
    if (options?.catalogSummary) {
      parts.push(
        "",
        "## CATALOGO GARE DISPONIBILI (sintesi — per riferimento)",
        JSON.stringify(options.catalogSummary, null, 2)
      );
    }
  } else if (gara) {
    parts.push(
      "",
      "## GARA SELEZIONATA (JSON — disciplinare / catalogo corrente)",
      JSON.stringify(gara, null, 2)
    );
    if (chatMode === "offer_preparation") {
      parts.push("", OFFER_PREPARATION_MODE_BLOCK);
    }

    const soaGapAnalysis = detectSoaGaps(gara, profilo);
    const soaGapAddendum = buildSoaGapSystemAddendum(gara, soaGapAnalysis);
    if (soaGapAddendum.trim()) {
      parts.push("", soaGapAddendum.trim());
    }
  }

  if (options?.connectorsAddendum?.trim()) {
    parts.push("", options.connectorsAddendum.trim());
  }

  if (options?.storicoGare && Array.isArray(options.storicoGare) && options.storicoGare.length > 0) {
    parts.push(
      "",
      "## STORICO KNOWLEDGE LAYER (gare precedenti dell'impresa)",
      buildStoricoPromptBlock(options.storicoGare as StoricoGaraPromptItem[]),
      "",
      "Usa lo storico per: ribassi vincenti, pattern di successo, gare perse da evitare, lezioni su RTI/avvalimento.",
      "Non contraddire i dati storici verificati; se mancano dati, dichiaralo."
    );
  } else if (chatMode !== "general") {
    parts.push(
      "",
      buildStoricoPromptBlock([]),
      "",
      "Nessuno storico gara salvato ancora per questo utente — proponi strategie conservative."
    );
  }

  parts.push("", "---", EXPLAINABILITY_PROMPT_BLOCK);

  return parts.join("\n");
}
