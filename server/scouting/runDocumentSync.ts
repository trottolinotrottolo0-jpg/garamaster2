import { getAdminClient } from "./adminClient";
import { processGaraDocumento } from "./processGaraDocumento";
import type { DocumentSyncBatchResult } from "./documentTypes";

export async function runDocumentSync(params: {
  limit?: number;
  gareAnacIds?: string[];
  force?: boolean;
}): Promise<DocumentSyncBatchResult> {
  const supabase = getAdminClient();
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
  const warnings: string[] = [];
  const items: DocumentSyncBatchResult["items"] = [];
  let failed = 0;

  let candidates: { id: string; url_disciplinare?: string | null }[] = [];

  if (params.gareAnacIds?.length) {
    const { data } = await supabase
      .from("gare_anac")
      .select("id, url_disciplinare")
      .in("id", params.gareAnacIds);
    candidates = (data ?? []) as typeof candidates;
  } else {
    const { data } = await supabase
      .from("gare_anac")
      .select("id, url_disciplinare")
      .not("url_disciplinare", "is", null)
      .neq("url_disciplinare", "")
      .order("synced_at", { ascending: false, nullsFirst: false })
      .limit(limit * 3);
    candidates = (data ?? []) as typeof candidates;
  }

  if (!params.force) {
    const ids = candidates.map((c) => c.id);
    const parsedIds = new Set<string>();
    if (ids.length) {
      const { data: docs } = await supabase
        .from("gare_documenti")
        .select("gare_anac_id, parsed_at")
        .in("gare_anac_id", ids)
        .eq("tipo", "disciplinare");
      for (const doc of docs ?? []) {
        if (doc.parsed_at) parsedIds.add(String(doc.gare_anac_id));
      }
    }
    candidates = candidates.filter((c) => !parsedIds.has(c.id));
  }

  candidates = candidates.slice(0, limit);

  for (const candidate of candidates) {
    if (!candidate.url_disciplinare?.trim()) {
      warnings.push(`Gara ${candidate.id}: url_disciplinare assente, saltata.`);
      failed += 1;
      continue;
    }
    try {
      const result = await processGaraDocumento({
        gareAnacId: candidate.id,
        sourceUrl: candidate.url_disciplinare,
      });
      items.push(result);
      warnings.push(...result.warnings);
    } catch (err) {
      failed += 1;
      warnings.push(
        `Gara ${candidate.id}: ${err instanceof Error ? err.message : "Errore processamento"}`
      );
    }
  }

  return {
    processed: items.length,
    parsed: items.filter((i) => i.parsed).length,
    failed,
    warnings,
    items,
  };
}
