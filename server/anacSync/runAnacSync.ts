import { fetchAnacRecords } from "./fetchAnacOpenData";
import { upsertAnacRecordsToSupabase } from "./syncToSupabase";
import type { AnacSyncResult } from "./anacRecordTypes";

export type RunAnacSyncParams = {
  limit?: number;
  preferDemoExpand?: boolean;
};

export async function runAnacSync(params: RunAnacSyncParams = {}): Promise<AnacSyncResult> {
  const envLimit = Number(process.env.ANAC_SYNC_LIMIT);
  const defaultLimit = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 200;
  const requested = params.limit ?? defaultLimit;
  const limit = Math.min(Math.max(requested, 1), 5000);

  console.log(`[ANAC sync] Avvio import (limit=${limit})…`);

  const { records, source, warnings } = await fetchAnacRecords({
    limit,
    preferDemoExpand: params.preferDemoExpand,
  });

  if (!records.length) {
    throw new Error(
      warnings.join(" ") || "Nessun record ANAC da importare."
    );
  }

  console.log(`[ANAC sync] Parsed ${records.length} record da ${source}`);

  const result = await upsertAnacRecordsToSupabase(records, source);
  result.warnings = [...warnings, ...result.warnings];

  console.log(
    `[ANAC sync] Completato: +${result.imported} nuove, ${result.updated} aggiornate`
  );

  return result;
}
