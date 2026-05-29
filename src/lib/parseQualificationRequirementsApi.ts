import type { QualificationRequirement, TenderDocument } from "../types";

export async function requestQualificationRequirementsParse(params: {
  bandoPdfBase64: string;
  fileName: string;
  tender: TenderDocument;
}): Promise<QualificationRequirement[]> {
  const response = await fetch("/api/parse-qualification-requirements", {
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
      typeof data?.error === "string"
        ? data.error
        : "Errore parsing requisiti qualificazione."
    );
  }

  if (Array.isArray(data)) return data as QualificationRequirement[];
  return (data.requirements ?? []) as QualificationRequirement[];
}
