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
  squadre_disponibili?: number | string | null;
  mezzi_disponibili?: number | string | null;
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
  fit_score?: number | string | null;
  urgenza_score?: number | string | null;
  rischio_score?: number | string | null;
  margine_score?: number | string | null;
  carico_score?: number | string | null;
  convenienza_score?: number | string | null;
  motivazione_ranking?: string | null;
  vista_portfolio?: string | null;
  risk_score?: number | string | null;
  red_flag_count?: number | string | null;
  carico_operativo?: number | string | null;
  margine_stimato?: number | string | null;
  costo_stimato_interno?: number | string | null;
  ribasso_ipotizzato?: number | string | null;
  bid_no_bid?: string | null;
  score_sintetico?: number | string | null;
  scartata?: boolean | null;
  squadre_richieste?: number | string | null;
  durata_mesi?: number | string | null;
  durata_gara_settimane?: number | string | null;
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
  risk_score?: number | string | null;
  red_flag_count?: number | string | null;
  carico_operativo?: number | string | null;
  margine_stimato?: number | string | null;
  costo_stimato_interno?: number | string | null;
  ribasso_ipotizzato?: number | string | null;
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
  enriched_at?: string | null;
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
  squadreDisponibili?: number;
  mezziDisponibili?: number;
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
