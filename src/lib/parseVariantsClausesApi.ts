import type { TenderDocument, VariantClause, ClaimsClause } from "../types";

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
