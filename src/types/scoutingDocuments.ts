export type GaraDocumentoProcessResult = {
  documentId: string;
  gareAnacId: string;
  parsed: boolean;
  storagePath?: string;
  warnings: string[];
};

export type DocumentSyncBatchResult = {
  processed: number;
  parsed: number;
  failed: number;
  warnings: string[];
  items: GaraDocumentoProcessResult[];
};

export type ScoutingEnrichmentBatchResult = {
  enriched: number;
  skipped: number;
  failed: number;
  warnings: string[];
  items: Array<{ gareAnacId: string; cig?: string; score: number }>;
};
