import type {
  DocumentSyncBatchResult,
  GaraDocumentoProcessResult,
  ScoutingEnrichmentBatchResult,
} from "../types/scoutingDocuments";

export async function uploadGaraDocument(params: {
  gareAnacId: string;
  pdfBase64: string;
  fileName?: string;
}): Promise<GaraDocumentoProcessResult> {
  const response = await fetch("/api/scouting/documents/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Upload documento fallito");
  }
  return data as GaraDocumentoProcessResult;
}

export async function processGaraDocumentFromUrl(params: {
  gareAnacId: string;
  sourceUrl?: string;
}): Promise<GaraDocumentoProcessResult> {
  const response = await fetch("/api/scouting/documents/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Process documento fallito");
  }
  return data as GaraDocumentoProcessResult;
}

export async function syncGaraDocuments(params?: {
  limit?: number;
  gareAnacIds?: string[];
  force?: boolean;
}): Promise<DocumentSyncBatchResult> {
  const response = await fetch("/api/scouting/documents/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Sync documenti fallito");
  }
  return data as DocumentSyncBatchResult;
}

export async function enrichScoutingGare(params?: {
  limit?: number;
  gareAnacIds?: string[];
  userId?: string;
  force?: boolean;
}): Promise<ScoutingEnrichmentBatchResult> {
  const response = await fetch("/api/scouting/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Enrichment scouting fallito");
  }
  return data as ScoutingEnrichmentBatchResult;
}

export async function readPdfAsBase64(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("PDF troppo grande (max 12 MB).");
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
