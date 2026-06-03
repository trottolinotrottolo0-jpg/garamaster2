export type TenderPracticeStato =
  | "DA_ANALIZZARE"
  | "IN_LAVORAZIONE"
  | "DOCUMENTI_MANCANTI"
  | "PRONTA"
  | "INVIATA";

export type TenderDocumentStato = "MANCANTE" | "CARICATO" | "DA_REVISIONARE";

export type TenderChecklistStato = "TODO" | "IN_CORSO" | "FATTO" | "NON_APPLICABILE";

export type TenderBusta = "amministrativa" | "tecnica" | "economica";

export type TenderPreparationStep =
  | "panoramica"
  | "amministrativa"
  | "tecnica"
  | "economica"
  | "revisione";

export type TenderAutocompilazione = {
  ragioneSociale?: string;
  partitaIva?: string;
  codiceFiscale?: string;
  sedeLegale?: string;
  soa?: string;
  certificazioni?: string[];
  legaleRappresentante?: string;
  durc?: string;
  assicurazioni?: string;
  email?: string;
  telefono?: string;
};

export interface TenderPracticeRow {
  id: string;
  user_id: string;
  gara_id: string;
  profilo_impresa_id?: string | null;
  stato: TenderPracticeStato;
  autocompilazione: TenderAutocompilazione;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TenderDocumentRow {
  id: string;
  practice_id: string;
  user_id: string;
  categoria: TenderBusta | "generale";
  nome: string;
  stato: TenderDocumentStato;
  file_url?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  uploaded_at?: string | null;
  obbligatorio: boolean;
  note?: string | null;
  ordine: number;
}

export interface TenderChecklistItemRow {
  id: string;
  practice_id: string;
  user_id: string;
  busta: TenderBusta;
  titolo: string;
  stato: TenderChecklistStato;
  obbligatorio: boolean;
  note?: string | null;
  ordine: number;
}

export interface TenderPreparationBundle {
  practice: TenderPracticeRow;
  documents: TenderDocumentRow[];
  checklist: TenderChecklistItemRow[];
}

export interface TenderPreparationSuggestResult {
  documents: Array<{
    categoria: TenderBusta | "generale";
    nome: string;
    obbligatorio: boolean;
    note?: string;
  }>;
  checklist: Array<{
    busta: TenderBusta;
    titolo: string;
    obbligatorio: boolean;
    note?: string;
  }>;
  testiAmministrativi?: string[];
  documentiMancantiCritici?: string[];
}
