import type { TenderDocument, VariantClause, ClaimsClause } from "../types";

export interface VariantsClausesResult {
  variants: VariantClause[];
  claims: ClaimsClause[];
}

export async function requestVariantsClausesParse(params: {
  bandoPdfBase64: string;
  fileName: string;
  tender: TenderDocument;
}): Promise<VariantsClausesResult> {
  const response = await fetch("/api/parse-variants-clauses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileBase64: params.bandoPdfBase64,
      fileName: params.fileName,
      tender: params.tender,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Errore parsing varianti/claims."
    );
  }

  return {
    variants: (data.variants ?? []) as VariantClause[],
    claims: (data.claims ?? []) as ClaimsClause[],
  };
}

export async function parseVariantsClausesFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<VariantsClausesResult> {
  return requestVariantsClausesParse({ bandoPdfBase64, fileName, tender });
}
