import type { TenderDocument, VariantClause, ClaimsClause } from "../types";

export async function requestVariantsClausesParse(params: {
  bandoPdfBase64: string;
  fileName: string;
  tender: TenderDocument;
}): Promise<{ variants: VariantClause[]; claims: ClaimsClause[] }> {
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
export interface VariantsClausesResult {
  variantClauses: VariantClause[];
  claimsClauses: ClaimsClause[];
}

export async function parseVariantsClausesFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<VariantsClausesResult> {
  try {
    const response = await fetch("/api/parse-variants-clauses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandoPdfBase64, fileName, tender }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data ?? { variantClauses: [], claimsClauses: [] };
  } catch (error) {
    console.error("[parseVariantsClausesApi] error:", error);
    return { variantClauses: [], claimsClauses: [] };
  }
}
