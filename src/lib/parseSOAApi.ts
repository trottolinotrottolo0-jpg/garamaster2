import type { SOAStructured } from "../types";

export async function requestParseSOA(params: {
  pdfBase64?: string;
  excelBase64?: string;
  fileName: string;
  mimeType: string;
}): Promise<SOAStructured> {
  const fileBase64 = params.pdfBase64 ?? params.excelBase64;
  if (!fileBase64?.trim()) {
    throw new Error("File SOA mancante o non leggibile.");
  }

  const response = await fetch("/api/parse-soa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileBase64,
      fileName: params.fileName,
      mimeType: params.mimeType,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Errore parsing SOA."
    );
  }

  return data as SOAStructured;
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
    reader.onerror = () => reject(new Error("Impossibile leggere il file."));
    reader.readAsDataURL(file);
  });
}
