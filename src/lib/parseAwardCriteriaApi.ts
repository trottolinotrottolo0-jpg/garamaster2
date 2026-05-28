import type { AwardCriteriaAnalysis, TenderDocument } from "../types";

export async function requestParseAwardCriteria(params: {
  bandoPdfBase64: string;
  fileName: string;
  tender: TenderDocument;
}): Promise<AwardCriteriaAnalysis> {
  const response = await fetch("/api/parse-award-criteria", {
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
      typeof data?.error === "string" ? data.error : "Errore parsing Award Criteria."
    );
  }

  return data as AwardCriteriaAnalysis;
}
