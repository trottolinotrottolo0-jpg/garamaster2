export type AnacGaraRecord = {
  cig: string;
  titolo?: string;
  oggetto?: string;
  importo?: number | null;
  importo_base?: number | null;
  regione?: string | null;
  provincia?: string | null;
  stazione_appaltante?: string | null;
  ente_appaltante?: string | null;
  data_pubblicazione?: string | null;
  data_scadenza?: string | null;
  scadenza?: string | null;
  cpv?: string | null;
  categoria?: string | null;
  url_portale?: string | null;
  url_disciplinare?: string | null;
  ocid?: string | null;
  source_dataset?: string | null;
  raw_meta?: Record<string, unknown>;
};

export type AnacSyncResult = {
  source: string;
  imported: number;
  updated: number;
  skipped: number;
  totalParsed: number;
  syncedAt: string;
  warnings: string[];
};
