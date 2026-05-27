export type ScoutingAnalysisInput = {
  gareAnacId: string;
  cig?: string;
  titolo?: string;
  oggetto?: string;
  regione?: string;
  categoria?: string;
  importo?: string | number | null;
  dataScadenza?: string | null;
  ente?: string | null;
  profilo?: Record<string, unknown> | null;
  parseSummary?: Record<string, unknown> | null;
};

export type ScoutingAnalysisResult = {
  score: number;
  summary: string;
  strategia: string;
  alert: string;
  confidenza: "Alto" | "Medio" | "Basso";
};

export type ScoutingEnrichmentBatchResult = {
  enriched: number;
  skipped: number;
  failed: number;
  warnings: string[];
  items: Array<{ gareAnacId: string; cig?: string; score: number }>;
};
