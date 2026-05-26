/** Righe Supabase — campi flessibili per schema reale già popolato */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ProfiloImpresaRow {
  id: string;
  user_id?: string | null;
  ragione_sociale?: string | null;
  denominazione?: string | null;
  partita_iva?: string | null;
  email?: string | null;
  soa_prevalente?: string | null;
  soa_classifica?: string | null;
  categorie_soa?: JsonValue;
  fatturato_triennale?: number | string | null;
  fatturato_medio?: number | string | null;
  regioni?: JsonValue;
  regioni_operative?: JsonValue;
  certificazioni?: JsonValue;
  iso_9001?: boolean | null;
  iso_14001?: boolean | null;
  iso_45001?: boolean | null;
  note?: string | null;
  created_at?: string | null;
  [key: string]: JsonValue | undefined;
}

export interface GaraRow {
  id: string;
  user_id?: string | null;
  titolo?: string | null;
  oggetto?: string | null;
  cig?: string | null;
  importo?: number | string | null;
  importo_base?: number | string | null;
  regione?: string | null;
  ente_appaltante?: string | null;
  stazione_appaltante?: string | null;
  scadenza?: string | null;
  scadenza_presentazione?: string | null;
  scadenza_offerta?: string | null;
  data_scadenza?: string | null;
  stato_pratica?: string | null;
  categoria_soa?: string | null;
  criterio_aggiudicazione?: string | null;
  requisiti?: JsonValue;
  penali?: JsonValue;
  anomalie?: JsonValue;
  note?: string | null;
  created_at?: string | null;
  [key: string]: JsonValue | undefined;
}

export interface GaraAnacRow {
  id: string;
  cig?: string | null;
  titolo?: string | null;
  oggetto?: string | null;
  importo?: number | string | null;
  importo_base?: number | string | null;
  regione?: string | null;
  provincia?: string | null;
  stazione_appaltante?: string | null;
  ente_appaltante?: string | null;
  data_pubblicazione?: string | null;
  data_scadenza?: string | null;
  scadenza?: string | null;
  cpv?: string | null;
  categoria?: string | null;
  fit_score?: number | string | null;
  [key: string]: JsonValue | undefined;
}

export interface GaraAnacVistaRow {
  user_id: string;
  gare_anac_id: string;
  visto_at?: string | null;
}

export interface GaraScoutingRow {
  id: string;
  gara_id?: string | null;
  gare_anac_id?: string | null;
  cig?: string | null;
  score?: number | null;
  summary?: string | null;
  strategia?: string | null;
  alert?: string | null;
  created_at?: string | null;
  [key: string]: JsonValue | undefined;
}

export interface ConversazioneAiRow {
  id: string;
  user_id?: string | null;
  gara_id?: string | null;
  messages?: JsonValue;
  created_at?: string | null;
  [key: string]: JsonValue | undefined;
}

/** Payload serializzato inviato a Gemini */
export interface ProfiloImpresaContext {
  id: string;
  userId: string;
  ragioneSociale: string;
  partitaIva?: string;
  soa?: string;
  fatturatoTriennale?: string;
  regioni?: string[];
  certificazioni?: string[];
  summary: string;
}

export interface ProfiloOnboardingInput {
  ragioneSociale: string;
  partitaIva?: string;
  soaPrevalente?: string;
  regioni?: string[];
}

export type GaraSource = "gare" | "gare_anac" | "mock";

export interface GaraListItem {
  id: string;
  source: GaraSource;
  cig: string;
  title: string;
  region?: string;
  value?: string;
  deadline?: string;
  raw: GaraRow | GaraAnacRow;
}
