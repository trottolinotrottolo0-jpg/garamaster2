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

/** Upsert per CIG senza dipendere da UNIQUE constraint (PostgREST non usa indici parziali). */
async function upsertBatchByCig(
  supabase: ReturnType<typeof getAdminClient>,
  records: AnacGaraRecord[],
  syncedAt: string
): Promise<void> {
  const cigs = records.map((r) => r.cig).filter(Boolean);
  const idByCig = new Map<string, string>();

  if (cigs.length) {
    const { data: existing, error } = await supabase
      .from("gare_anac")
      .select("id, cig")
      .in("cig", cigs);
    if (error) throw new Error(`Lettura gare_anac fallita: ${error.message}`);
    for (const row of existing ?? []) {
      if (row.cig) idByCig.set(String(row.cig), String(row.id));
    }
  }

  for (const record of records) {
    const row = toRow(record, syncedAt);
    const existingId = idByCig.get(record.cig);

    if (existingId) {
      const { error } = await supabase.from("gare_anac").update(row).eq("id", existingId);
      if (error) throw new Error(`Update gare_anac (${record.cig}) fallito: ${error.message}`);
    } else {
      const { data: inserted, error } = await supabase
        .from("gare_anac")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(`Insert gare_anac (${record.cig}) fallito: ${error.message}`);
      if (inserted?.id) idByCig.set(record.cig, String(inserted.id));
    }
  }
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
    await upsertBatchByCig(supabase, batch, syncedAt);
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
