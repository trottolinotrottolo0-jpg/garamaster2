import type { CAMRequirement, TenderDocument } from "../types";

export async function requestCAMRequirementsParse(params: {
  bandoPdfBase64: string;
  fileName: string;
  tender: TenderDocument;
}): Promise<CAMRequirement[]> {
  const response = await fetch("/api/parse-cam-requirements", {
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
      typeof data?.error === "string" ? data.error : "Errore parsing requisiti CAM."
    );
  }

  return (data.requirements ?? data) as CAMRequirement[];
}
