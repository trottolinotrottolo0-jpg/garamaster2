import type { TenderDocument, CAMRequirement } from "../types";

export async function parseCAMRequirementsFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<CAMRequirement[]> {
  try {
    const response = await fetch("/api/parse-cam-requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandoPdfBase64, fileName, tender }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data ?? [];
  } catch (error) {
    console.error("[parseCAMApi] error:", error);
    return [];
  }
}
