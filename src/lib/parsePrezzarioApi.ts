import type { ParsePrezzarioPdfResponse } from "../types";

export { readFileAsBase64 } from "./parseDisciplinareApi";

export async function requestParsePrezzario(params: {
  pdfBase64: string;
  fileName: string;
  mimeType?: string;
}): Promise<ParsePrezzarioPdfResponse> {
  const response = await fetch("/api/parse-prezzario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdfBase64: params.pdfBase64,
      fileName: params.fileName,
      mimeType: params.mimeType ?? "application/pdf",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Errore parsing prezzario PDF.");
  }

  return data as ParsePrezzarioPdfResponse;
}
