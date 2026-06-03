import type { TenderDocument, QualificationRequirement } from "../types";

export async function parseQualificationRequirementsFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<QualificationRequirement[]> {
  try {
    const response = await fetch("/api/parse-qualification-requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandoPdfBase64, fileName, tender }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data ?? [];
  } catch (error) {
    console.error("[parseQualificationApi] error:", error);
    return [];
  }
}
