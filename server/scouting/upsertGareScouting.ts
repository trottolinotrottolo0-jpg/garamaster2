import { getAdminClient } from "./adminClient";
import type { ScoutingAnalysisResult } from "./scoutingAnalysisTypes";

export async function upsertGareScouting(params: {
  gareAnacId: string;
  cig?: string;
  analysis: ScoutingAnalysisResult;
}): Promise<void> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();

  const payload = {
    gare_anac_id: params.gareAnacId,
    cig: params.cig ?? null,
    score: params.analysis.score,
    summary: params.analysis.summary,
    strategia: params.analysis.strategia,
    alert: params.analysis.alert,
    enriched_at: now,
  };

  const { data: existing } = await supabase
    .from("gare_scouting")
    .select("id")
    .eq("gare_anac_id", params.gareAnacId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("gare_scouting").update(payload).eq("id", existing.id);
    if (error) throw new Error(`Update gare_scouting fallito: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("gare_scouting").insert(payload);
  if (error) throw new Error(`Insert gare_scouting fallito: ${error.message}`);
}
