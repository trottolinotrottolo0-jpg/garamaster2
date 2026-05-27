import { getAdminClient } from "./adminClient";
import type { ScoutingAnalysisResult } from "./scoutingAnalysisTypes";

let enrichedAtColumnAvailable: boolean | null = null;

async function detectEnrichedAtColumn(
  supabase: ReturnType<typeof getAdminClient>
): Promise<boolean> {
  if (enrichedAtColumnAvailable != null) return enrichedAtColumnAvailable;
  const { error } = await supabase.from("gare_scouting").select("enriched_at").limit(1);
  enrichedAtColumnAvailable = !error || !/enriched_at/i.test(error.message);
  return enrichedAtColumnAvailable;
}

async function findExistingScoutingId(
  supabase: ReturnType<typeof getAdminClient>,
  gareAnacId: string,
  cig?: string
): Promise<string | null> {
  const { data: byAnac } = await supabase
    .from("gare_scouting")
    .select("id")
    .eq("gare_anac_id", gareAnacId)
    .maybeSingle();
  if (byAnac?.id) return String(byAnac.id);

  if (cig) {
    const { data: byCig } = await supabase
      .from("gare_scouting")
      .select("id")
      .eq("cig", cig)
      .maybeSingle();
    if (byCig?.id) return String(byCig.id);
  }

  return null;
}

async function writeScoutingRow(
  supabase: ReturnType<typeof getAdminClient>,
  existingId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  if (existingId) {
    const { error } = await supabase.from("gare_scouting").update(payload).eq("id", existingId);
    if (error) throw new Error(`Update gare_scouting fallito: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("gare_scouting").insert(payload);
  if (error) throw new Error(`Insert gare_scouting fallito: ${error.message}`);
}

export async function upsertGareScouting(params: {
  gareAnacId: string;
  cig?: string;
  analysis: ScoutingAnalysisResult;
}): Promise<void> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const existingId = await findExistingScoutingId(supabase, params.gareAnacId, params.cig);

  const basePayload: Record<string, unknown> = {
    gare_anac_id: params.gareAnacId,
    cig: params.cig ?? null,
    score: params.analysis.score,
    summary: params.analysis.summary,
    strategia: params.analysis.strategia,
    alert: params.analysis.alert,
  };

  const withEnriched = { ...basePayload, enriched_at: now };
  const hasEnrichedAt = await detectEnrichedAtColumn(supabase);

  try {
    await writeScoutingRow(supabase, existingId, hasEnrichedAt ? withEnriched : basePayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (hasEnrichedAt && /enriched_at/i.test(message)) {
      enrichedAtColumnAvailable = false;
      await writeScoutingRow(supabase, existingId, basePayload);
    } else {
      throw err;
    }
  }

  const { error: fitError } = await supabase
    .from("gare_anac")
    .update({ fit_score: params.analysis.score })
    .eq("id", params.gareAnacId);

  if (fitError && !/fit_score/i.test(fitError.message)) {
    console.warn("[Scouting enrich] fit_score:", fitError.message);
  }
}
