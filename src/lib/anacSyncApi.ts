import type { AnacSyncResult, AnacSyncStatusResponse } from "../types/anacSync";

export type { AnacSyncResult, AnacSyncStatusResponse };

export async function fetchAnacSyncStatus(): Promise<AnacSyncStatusResponse> {
  const response = await fetch("/api/scouting/sync-status");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? "Errore status sync ANAC");
  }
  return data as AnacSyncStatusResponse;
}

export async function triggerAnacSync(params?: {
  limit?: number;
  demoExpand?: boolean;
  enrichAfter?: boolean;
}): Promise<AnacSyncResult> {
  const response = await fetch("/api/scouting/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? "Sync ANAC fallito");
  }
  return data as AnacSyncResult;
}
