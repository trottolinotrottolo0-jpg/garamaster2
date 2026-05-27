import type { ProfiloImpresaContext } from "../src/types/database";

export interface PostGaraForensicsRequestBody {
  esito: "vinta" | "persa";
  cig: string;
  titoloGara: string;
  ribassoVincitore?: number | null;
  ribassoOffertoStorico?: number | null;
  motivazione: string;
  noteOperative: string;
  noteAiPrecedenti?: string;
  profilo?: ProfiloImpresaContext | null;
  storicoSnippet?: unknown[];
}

export interface PostGaraForensicsResponseBody {
  analisi: string;
  model: string;
}
