import type { ProfiloImpresaContext } from "../types/database";
import type { StoricoGaraAiEntry } from "../types/storicoGare";

export interface PostGaraForensicsFormData {
  ribassoVincitore: number | null;
  motivazione: string;
  noteOperative: string;
}

export async function requestPostGaraForensics(params: {
  esito: "vinta" | "persa";
  entry: StoricoGaraAiEntry;
  form: PostGaraForensicsFormData;
  profilo?: ProfiloImpresaContext | null;
  storicoSnippet?: unknown[];
}): Promise<{ analisi: string; model: string }> {
  const response = await fetch("/api/post-gara-forensics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      esito: params.esito,
      cig: params.entry.cig,
      titoloGara: params.entry.titoloGara,
      ribassoVincitore: params.form.ribassoVincitore,
      ribassoOffertoStorico: params.entry.ribassoOfferto,
      motivazione: params.form.motivazione,
      noteOperative: params.form.noteOperative,
      noteAiPrecedenti: params.entry.noteAi,
      profilo: params.profilo ?? null,
      storicoSnippet: params.storicoSnippet,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Analisi post-gara non riuscita.");
  }

  return data as { analisi: string; model: string };
}
