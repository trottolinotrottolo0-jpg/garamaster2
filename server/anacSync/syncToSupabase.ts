import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseServiceRoleKey, resolveSupabaseUrl } from "../resolveSupabaseUrl";
import type { AnacGaraRecord, AnacSyncResult } from "./anacRecordTypes";

function getAdminClient() {
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY mancante in .env.local (necessaria per import ANAC server-side)."
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function toRow(record: AnacGaraRecord, syncedAt: string) {
  return {
    cig: record.cig,
    titolo: record.titolo ?? record.oggetto ?? `Gara ${record.cig}`,
    oggetto: record.oggetto ?? record.titolo,
    importo: record.importo,
    importo_base: record.importo_base ?? record.importo,
    regione: record.regione,
    provincia: record.provincia,
    stazione_appaltante: record.stazione_appaltante,
    ente_appaltante: record.ente_appaltante,
    data_pubblicazione: record.data_pubblicazione,
    data_scadenza: record.data_scadenza ?? record.scadenza,
    scadenza: record.scadenza ?? record.data_scadenza,
    cpv: record.cpv,
    categoria: record.categoria,
    url_portale: record.url_portale,
    url_disciplinare: record.url_disciplinare,
    ocid: record.ocid,
    source_dataset: record.source_dataset,
    synced_at: syncedAt,
    raw_meta: record.raw_meta ?? {},
  };
}

export async function upsertAnacRecordsToSupabase(
  records: AnacGaraRecord[],
  source: string
): Promise<AnacSyncResult> {
  const supabase = getAdminClient();
  const syncedAt = new Date().toISOString();
  const warnings: string[] = [];

  const existingCigs = new Set<string>();
  if (records.length) {
    const cigs = records.map((r) => r.cig);
    const { data: existing } = await supabase.from("gare_anac").select("cig").in("cig", cigs);
    for (const row of existing ?? []) {
      if (row.cig) existingCigs.add(String(row.cig));
    }
  }

  const batchSize = 50;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const rows = batch.map((r) => toRow(r, syncedAt));

    const { error } = await supabase.from("gare_anac").upsert(rows, {
      onConflict: "cig",
      ignoreDuplicates: false,
    });

    if (error) {
      throw new Error(`Upsert gare_anac fallito: ${error.message}`);
    }
  }

  const imported = records.filter((r) => !existingCigs.has(r.cig)).length;
  const updated = records.length - imported;
  const skipped = 0;

  const logPayload = {
    finished_at: syncedAt,
    source,
    status: "completed",
    imported_count: imported,
    updated_count: updated,
    meta: { totalParsed: records.length, warnings },
  };

  const { error: logError } = await supabase.from("anac_sync_log").insert({
    started_at: syncedAt,
    ...logPayload,
  });

  if (logError) {
    warnings.push(`Log sync non salvato: ${logError.message}`);
  }

  return {
    source,
    imported,
    updated,
    skipped,
    totalParsed: records.length,
    syncedAt,
    warnings,
  };
}

export async function fetchLastAnacSyncLog(): Promise<{
  finished_at?: string;
  source?: string;
  imported_count?: number;
  updated_count?: number;
} | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("anac_sync_log")
    .select("finished_at, source, imported_count, updated_count, status")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[ANAC sync] log:", error.message);
    return null;
  }
  return data;
}
