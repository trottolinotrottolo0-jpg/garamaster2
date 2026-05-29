import type { PenaltyClause, TenderDocument } from "../types";

export async function requestDelayPenaltiesParse(params: {
  bandoPdfBase64: string;
  fileName: string;
  tender: TenderDocument;
}): Promise<PenaltyClause[]> {
  const response = await fetch("/api/parse-delay-penalties", {
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
      typeof data?.error === "string" ? data.error : "Errore parsing penalità ritardo."
    );
  }

  return (data.penaltyClauses ?? data) as PenaltyClause[];
import type { TenderDocument, PenaltyClause } from "../types";

export async function parseDelayPenaltiesFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<PenaltyClause[]> {
  try {
    const response = await fetch("/api/parse-delay-penalties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandoPdfBase64, fileName, tender }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data ?? [];
  } catch (error) {
    console.error("[parseDelayPenaltiesApi] error:", error);
    return [];
  }
}
