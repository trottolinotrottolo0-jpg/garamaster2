import { getSupabaseClient } from "../lib/supabase/client";
import { buildDefaultGraphEdges } from "../lib/evidence";
import type {
  EvidenceBundle,
  EvidenceGraphEdgeRow,
  EvidenceItemInput,
  EvidenceItemRow,
  EvidenceOutputType,
  SaveEvidenceParams,
} from "../types/evidence";

function rowFromDb(raw: Record<string, unknown>): EvidenceItemRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    gara_id: raw.gara_id ? String(raw.gara_id) : null,
    profilo_id: raw.profilo_id ? String(raw.profilo_id) : null,
    output_type: String(raw.output_type),
    output_id: raw.output_id ? String(raw.output_id) : null,
    source_document: raw.source_document ? String(raw.source_document) : null,
    source_reference: raw.source_reference ? String(raw.source_reference) : null,
    source_text: raw.source_text ? String(raw.source_text) : null,
    rule_triggered: raw.rule_triggered ? String(raw.rule_triggered) : null,
    company_data_used:
      raw.company_data_used && typeof raw.company_data_used === "object"
        ? (raw.company_data_used as Record<string, unknown>)
        : null,
    conclusion: raw.conclusion ? String(raw.conclusion) : null,
    confidence_score: Number(raw.confidence_score) || 0,
    requires_human_review: raw.requires_human_review === true,
    review_reason: raw.review_reason ? String(raw.review_reason) : null,
    human_reviewed: raw.human_reviewed === true,
    human_reviewed_at: raw.human_reviewed_at ? String(raw.human_reviewed_at) : null,
    created_at: String(raw.created_at),
  };
}

export async function getEvidenceForOutput(
  userId: string,
  outputType: EvidenceOutputType,
  outputId?: string | null,
  garaId?: string | null
): Promise<EvidenceBundle> {
  const supabase = getSupabaseClient();
  if (!supabase) return { items: [], edges: [] };

  let query = supabase
    .from("evidence_items")
    .select("*")
    .eq("user_id", userId)
    .eq("output_type", outputType)
    .order("created_at", { ascending: true });

  if (outputId) query = query.eq("output_id", outputId);
  if (garaId) query = query.eq("gara_id", garaId);

  const { data: items, error } = await query;
  if (error) {
    console.warn("[evidence] fetch items:", error.message);
    return { items: [], edges: [] };
  }

  const itemRows = (items ?? []).map((r) => rowFromDb(r as Record<string, unknown>));
  if (itemRows.length === 0) return { items: [], edges: [] };

  const ids = itemRows.map((i) => i.id);
  const { data: edgeData, error: edgeErr } = await supabase
    .from("evidence_graph_edges")
    .select("*")
    .in("evidence_item_id", ids);

  if (edgeErr) {
    console.warn("[evidence] fetch edges:", edgeErr.message);
    return { items: itemRows, edges: [] };
  }

  const edges: EvidenceGraphEdgeRow[] = (edgeData ?? []).map((e) => ({
    id: String(e.id),
    evidence_item_id: String(e.evidence_item_id),
    from_node: String(e.from_node),
    from_label: String(e.from_label),
    to_node: String(e.to_node),
    to_label: String(e.to_label),
    edge_type: String(e.edge_type),
  }));

  return { items: itemRows, edges };
}

export async function saveEvidenceItems(params: SaveEvidenceParams): Promise<EvidenceItemRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !params.items.length) return [];

  const { outputType, outputId, userId, garaId, profiloId } = params;

  if (outputId) {
    await supabase
      .from("evidence_items")
      .delete()
      .eq("user_id", userId)
      .eq("output_type", outputType)
      .eq("output_id", outputId);
  }

  const saved: EvidenceItemRow[] = [];

  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    const itemOutputId = outputId ?? `${outputType}_${i}`;

    const { data: inserted, error } = await supabase
      .from("evidence_items")
      .insert({
        user_id: userId,
        gara_id: garaId ?? null,
        profilo_id: profiloId ?? null,
        output_type: outputType,
        output_id: itemOutputId,
        source_document: item.source_document ?? null,
        source_reference: item.source_reference ?? null,
        source_text: item.source_text ?? null,
        rule_triggered: item.rule_triggered ?? null,
        company_data_used: item.company_data_used ?? {},
        conclusion: item.conclusion ?? null,
        confidence_score: item.confidence_score ?? 85,
        requires_human_review: item.requires_human_review ?? false,
        review_reason: item.review_reason ?? null,
      })
      .select("*")
      .single();

    if (error || !inserted) {
      console.warn("[evidence] insert:", error?.message);
      continue;
    }

    const row = rowFromDb(inserted as Record<string, unknown>);
    saved.push(row);

    const graphEdges = buildDefaultGraphEdges(item);
    if (graphEdges.length) {
      const { error: gErr } = await supabase.from("evidence_graph_edges").insert(
        graphEdges.map((e) => ({
          evidence_item_id: row.id,
          from_node: e.from_node,
          from_label: e.from_label,
          to_node: e.to_node,
          to_label: e.to_label,
          edge_type: e.edge_type ?? "causes",
        }))
      );
      if (gErr) console.warn("[evidence] edges:", gErr.message);
    }
  }

  return saved;
}

export async function markEvidenceAsReviewed(
  userId: string,
  evidenceId: string
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("evidence_items")
    .update({
      human_reviewed: true,
      human_reviewed_at: new Date().toISOString(),
      requires_human_review: false,
    })
    .eq("id", evidenceId)
    .eq("user_id", userId);

  if (error) {
    console.warn("[evidence] mark reviewed:", error.message);
    return false;
  }
  return true;
}
