import { getAdminClient } from "./adminClient";
import { generateScoutingAnalysis } from "./generateScoutingAnalysis";
import type { ScoutingEnrichmentBatchResult } from "./scoutingAnalysisTypes";
import { upsertGareScouting } from "./upsertGareScouting";

type GaraCandidate = {
  id: string;
  cig?: string | null;
  titolo?: string | null;
  oggetto?: string | null;
  regione?: string | null;
  categoria?: string | null;
  importo?: string | number | null;
  importo_base?: string | number | null;
  data_scadenza?: string | null;
  scadenza?: string | null;
  ente_appaltante?: string | null;
  stazione_appaltante?: string | null;
};

async function loadProfilo(userId?: string): Promise<Record<string, unknown> | null> {
  if (!userId) return null;
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("profili_impresa")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    ragioneSociale: row.ragione_sociale ?? row.ragioneSociale,
    email: row.email,
    regioni: row.regioni ?? row.regione_operativa,
    soa: row.soa ?? row.categorie_soa,
    fatturato: row.fatturato_annuo ?? row.fatturato,
    dipendenti: row.numero_dipendenti ?? row.dipendenti,
    certificazioni: row.certificazioni,
    note: row.note,
  };
}

export async function runScoutingEnrichment(params: {
  limit?: number;
  gareAnacIds?: string[];
  userId?: string;
  force?: boolean;
}): Promise<ScoutingEnrichmentBatchResult> {
  const supabase = getAdminClient();
  const limit = Math.min(Math.max(params.limit ?? 15, 1), 40);
  const warnings: string[] = [];
  const items: ScoutingEnrichmentBatchResult["items"] = [];
  let skipped = 0;
  let failed = 0;

  let candidates: GaraCandidate[] = [];

  if (params.gareAnacIds?.length) {
    const { data, error } = await supabase
      .from("gare_anac")
      .select(
        "id, cig, titolo, oggetto, regione, categoria, importo, importo_base, data_scadenza, scadenza, ente_appaltante, stazione_appaltante"
      )
      .in("id", params.gareAnacIds);
    if (error) throw new Error(error.message);
    candidates = (data ?? []) as GaraCandidate[];
  } else {
    const { data, error } = await supabase
      .from("gare_anac")
      .select(
        "id, cig, titolo, oggetto, regione, categoria, importo, importo_base, data_scadenza, scadenza, ente_appaltante, stazione_appaltante"
      )
      .order("synced_at", { ascending: false, nullsFirst: false })
      .limit(limit * 4);
    if (error) throw new Error(error.message);
    candidates = (data ?? []) as GaraCandidate[];
  }

  if (!params.force) {
    const ids = candidates.map((c) => c.id);
    const enrichedIds = new Set<string>();
    if (ids.length) {
      const { data: scoutingRows, error } = await supabase
        .from("gare_scouting")
        .select("gare_anac_id, cig, enriched_at, score, summary, alert")
        .in("gare_anac_id", ids);

      if (error && /enriched_at/i.test(error.message)) {
        const { data: fallbackRows } = await supabase
          .from("gare_scouting")
          .select("gare_anac_id, cig, score, summary, alert")
          .in("gare_anac_id", ids);
        for (const row of fallbackRows ?? []) {
          const hasAi =
            row.score != null &&
            String(row.summary ?? "").trim().length > 20 &&
            String(row.alert ?? "").trim().length > 10;
          if (hasAi && row.gare_anac_id) enrichedIds.add(String(row.gare_anac_id));
        }
      } else {
        for (const row of scoutingRows ?? []) {
          if (row.enriched_at && row.score != null && row.gare_anac_id) {
            enrichedIds.add(String(row.gare_anac_id));
          }
        }
      }
    }
    candidates = candidates.filter((c) => !enrichedIds.has(c.id));
  }

  candidates = candidates.slice(0, limit);
  const profilo = await loadProfilo(params.userId);

  for (const gara of candidates) {
    try {
      const { data: doc } = await supabase
        .from("gare_documenti")
        .select("parse_result")
        .eq("gare_anac_id", gara.id)
        .eq("tipo", "disciplinare")
        .not("parsed_at", "is", null)
        .order("parsed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const analysis = await generateScoutingAnalysis({
        gareAnacId: gara.id,
        cig: gara.cig ? String(gara.cig) : undefined,
        titolo: gara.titolo ? String(gara.titolo) : undefined,
        oggetto: gara.oggetto ? String(gara.oggetto) : undefined,
        regione: gara.regione ? String(gara.regione) : undefined,
        categoria: gara.categoria ? String(gara.categoria) : undefined,
        importo: gara.importo ?? gara.importo_base,
        dataScadenza: gara.data_scadenza ?? gara.scadenza ?? null,
        ente: gara.ente_appaltante ?? gara.stazione_appaltante ?? null,
        profilo,
        parseSummary: (doc?.parse_result as Record<string, unknown> | null) ?? null,
      });

      await upsertGareScouting({
        gareAnacId: gara.id,
        cig: gara.cig ? String(gara.cig) : undefined,
        analysis,
      });

      items.push({
        gareAnacId: gara.id,
        cig: gara.cig ? String(gara.cig) : undefined,
        score: analysis.score,
      });
    } catch (err) {
      failed += 1;
      warnings.push(
        `Gara ${gara.cig ?? gara.id}: ${err instanceof Error ? err.message : "Errore enrichment"}`
      );
    }
  }

  skipped = Math.max(0, (params.gareAnacIds?.length ?? 0) - items.length - failed);

  return {
    enriched: items.length,
    skipped,
    failed,
    warnings,
    items,
  };
}
