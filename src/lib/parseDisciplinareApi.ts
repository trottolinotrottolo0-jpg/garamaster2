import type { ParseDisciplinareApiResponse } from "../types/disciplinareParse";

export async function requestParseDisciplinare(params: {
  pdfBase64: string;
  fileName: string;
  mimeType?: string;
}): Promise<ParseDisciplinareApiResponse> {
  const response = await fetch("/api/parse-disciplinare", {
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
    throw new Error(data.error ?? "Errore analisi disciplinare.");
  }

  return data as ParseDisciplinareApiResponse;
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Lettura file non riuscita."));
        return;
      }
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Impossibile leggere il file PDF."));
    reader.readAsDataURL(file);
  });
}
