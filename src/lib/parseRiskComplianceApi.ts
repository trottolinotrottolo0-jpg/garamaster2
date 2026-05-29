import type { ComplianceRequirement, RiskFattore, TenderDocument } from "../types";

export async function requestRiskComplianceParse(params: {
  bandoPdfBase64: string;
  fileName: string;
  tender: TenderDocument;
}): Promise<{ complianceRequirements: ComplianceRequirement[]; riskFactori: RiskFattore[] }> {
  const response = await fetch("/api/parse-risk-compliance", {
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
      typeof data?.error === "string" ? data.error : "Errore analisi risk & compliance."
    );
  }

  return data as { complianceRequirements: ComplianceRequirement[]; riskFactori: RiskFattore[] };
}
