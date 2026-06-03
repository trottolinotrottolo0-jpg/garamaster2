import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import type { TenderPreparationSuggestResult } from "../types/tenderPreparation";

export async function requestTenderPreparationSuggest(params: {
  tender: TenderDocument;
  profilo?: ProfiloImpresaContext | null;
  existingDocuments?: string[];
  existingChecklist?: string[];
}): Promise<TenderPreparationSuggestResult> {
  const res = await fetch("/api/tender-preparation/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = (await res.json()) as TenderPreparationSuggestResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Suggerimenti preparazione non disponibili");
  }
  return data;
}
