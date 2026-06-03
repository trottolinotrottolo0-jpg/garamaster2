import type { ExplainabilityData } from "../types";

export type { ExplainabilityData };

export const EXPLAINABILITY_PROMPT_BLOCK = `
EXPLAINABILITY (obbligatorio per ogni risposta analitica su gare, SOA, RTI, rischi, ribassi, penali, requisiti):
Concludi SEMPRE con questo blocco esatto (4 righe, etichette in maiuscolo):

PERCHÉ: [motivazione della conclusione]
DATI USATI: [campi profilo e gara effettivamente usati]
VERIFICA: [cosa controllare manualmente su disciplinare, visure, DGUE]
CONFIDENZA: [scrivi solo Alto, Medio o Basso]

Per saluti, conferme brevi o domande chiarificatrici senza analisi, ometti il blocco.
`;

import { EVIDENCE_JSON_INLINE, EVIDENCE_PROMPT_BLOCK } from "./evidence";

export { EVIDENCE_PROMPT_BLOCK, EVIDENCE_JSON_INLINE };

export const EXPLAINABILITY_JSON_INLINE = `"explainability": {
    "perche": "string — motivazione della conclusione",
    "datiUsati": "string — campi profilo/gara usati",
    "verifica": "string — controlli manuali consigliati",
    "confidenza": "Alto" | "Medio" | "Basso"
  }`;

function extractField(block: string, pattern: RegExp): string {
  const match = block.match(pattern);
  return match?.[1]?.trim().replace(/\*\*/g, "") ?? "";
}

export function parseExplainabilityFromText(text: string): {
  mainText: string;
  explainability: ExplainabilityData | null;
} {
  const markerMatch = text.match(/\n\s*(?:\*\*)?PERCH[EÉ]\s*(?:\*\*)?:/i);
  if (!markerMatch || markerMatch.index === undefined) {
    return { mainText: text, explainability: null };
  }

  const mainText = text.slice(0, markerMatch.index).trim();
  const block = text.slice(markerMatch.index);

  const perche = extractField(
    block,
    /(?:\*\*)?PERCH[EÉ]\s*(?:\*\*)?:\s*([\s\S]*?)(?=\n\s*(?:\*\*)?DATI USATI|$)/i
  );
  const datiUsati = extractField(
    block,
    /(?:\*\*)?DATI USATI\s*(?:\*\*)?:\s*([\s\S]*?)(?=\n\s*(?:\*\*)?VERIFICA|$)/i
  );
  const verifica = extractField(
    block,
    /(?:\*\*)?VERIFICA\s*(?:\*\*)?:\s*([\s\S]*?)(?=\n\s*(?:\*\*)?CONFIDENZA|$)/i
  );
  const confidenza = extractField(
    block,
    /(?:\*\*)?CONFIDENZA\s*(?:\*\*)?:\s*([\s\S]*?)$/i
  );

  if (!perche && !datiUsati && !verifica && !confidenza) {
    return { mainText: text, explainability: null };
  }

  return {
    mainText,
    explainability: { perche, datiUsati, verifica, confidenza },
  };
}

export function normalizeExplainability(
  raw?: Partial<ExplainabilityData> | null
): ExplainabilityData | null {
  if (!raw) return null;
  const perche = raw.perche?.trim() ?? "";
  const datiUsati = raw.datiUsati?.trim() ?? "";
  const verifica = raw.verifica?.trim() ?? "";
  const confidenza = raw.confidenza?.trim() ?? "";
  if (!perche && !datiUsati && !verifica && !confidenza) return null;
  return { perche, datiUsati, verifica, confidenza };
}

export function hasAnalysisContent(text: string): boolean {
  return /PERCH[EÉ]\s*:|DATI USATI\s*:|VERIFICA\s*:|CONFIDENZA\s*:/i.test(text);
}
