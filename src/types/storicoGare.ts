export type StoricoGaraEsito = "vinta" | "persa" | "non partecipato" | null;

export type StoricoGaraTipoAnalisi =
  | "chat"
  | "preparazione_offerta"
  | "bid_no_bid"
  | "bid_pricing"
  | "roi"
  | "rti_avvalimento"
  | "post_gara_forensics"
  | "altro";

export interface StoricoGaraAiRow {
  id: string;
  user_id: string;
  gara_id?: string | null;
  cig?: string | null;
  titolo_gara?: string | null;
  tipo_analisi?: string | null;
  esito?: string | null;
  ribasso_offerto?: number | string | null;
  pattern_vincenti?: string[] | null;
  note_ai?: string | null;
  created_at?: string | null;
}

export interface StoricoGaraAiEntry {
  id: string;
  garaId: string | null;
  cig: string;
  titoloGara: string;
  tipoAnalisi: StoricoGaraTipoAnalisi;
  esito: StoricoGaraEsito;
  ribassoOfferto: number | null;
  patternVincenti: string[];
  noteAi: string;
  createdAt: string;
}

export interface StoricoGaraPromptItem {
  cig: string;
  titolo: string;
  esito: string | null;
  ribassoOfferto: number | null;
  tipoAnalisi: string;
  patternVincenti: string[];
  sintesi: string;
  data: string;
}
