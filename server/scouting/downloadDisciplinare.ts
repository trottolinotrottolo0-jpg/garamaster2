import { Buffer } from "node:buffer";

const MAX_BYTES = 12 * 1024 * 1024;

export async function downloadDisciplinarePdf(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new Error("URL disciplinare non valido.");
  }

  const response = await fetch(trimmed, {
    headers: { Accept: "application/pdf,*/*" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Download disciplinare fallito (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    throw new Error("PDF disciplinare troppo grande (max 12 MB).");
  }
  if (buffer.length < 100) {
    throw new Error("File scaricato troppo piccolo o vuoto.");
  }
  if (contentType.includes("html") || buffer.slice(0, 15).toString("utf8").includes("<!DOCTYPE")) {
    throw new Error("URL disciplinare restituisce HTML, non un PDF.");
  }

  return buffer.toString("base64");
}
