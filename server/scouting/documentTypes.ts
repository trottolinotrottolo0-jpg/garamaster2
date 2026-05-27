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
