export type AnacSyncResult = {
  source: string;
  imported: number;
  updated: number;
  skipped: number;
  totalParsed: number;
  syncedAt: string;
  warnings: string[];
};

export type AnacSyncStatusResponse = {
  configured: boolean;
  demoExpand: boolean;
  hasJsonUrl: boolean;
  hasCkanPackage: boolean;
  intervalMinutes: number;
  last: {
    finished_at?: string;
    source?: string;
    imported_count?: number;
    updated_count?: number;
    status?: string;
  } | null;
};
