export interface DisciplinareSoaRequisito {
  categoria: string;
  classifica: string;
  descrizione?: string;
}

export interface DisciplinareFatturatoMinimo {
  richiesto: boolean;
  importo_euro?: number | null;
  descrizione: string;
}

export interface DisciplinareImportoBase {
  importo_euro?: number | null;
  descrizione: string;
}

export type DisciplinareCriterioAggiudicazione =
  | "massimo_ribasso"
  | "offerta_economicamente_piu_vantaggiosa"
  | "misto"
  | "altro";

export interface DisciplinareParseResult {
  titolo?: string;
  cig?: string;
  regione?: string;
  ente_appaltante?: string;
  stazione_appaltante?: string;
  requisiti_soa: DisciplinareSoaRequisito[];
  fatturato_minimo: DisciplinareFatturatoMinimo;
  certificazioni_obbligatorie: string[];
  importo_base_gara: DisciplinareImportoBase;
  scadenza_presentazione_offerte: string;
  criterio_aggiudicazione: DisciplinareCriterioAggiudicazione | string;
  criterio_aggiudicazione_descrizione?: string;
  clausole_rischiose_penali: string[];
  requisiti_cam: string[];
}

export interface ParseDisciplinareApiResponse {
  parse: DisciplinareParseResult;
  model: string;
}
