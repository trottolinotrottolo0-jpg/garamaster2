/**
 * Feature #14 — end-to-end DB test (insert, graph edges, mark reviewed)
 * Run: npx tsx scripts/validate-evidence-db-flow.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { createClient } from "@supabase/supabase-js";
import { buildDefaultGraphEdges } from "../src/lib/evidence";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log("\n=== Feature #14 — DB flow test ===\n");

  const { data: profili } = await sb
    .from("profili_impresa")
    .select("id, user_id")
    .limit(1);
  const userId = profili?.[0]?.user_id as string | undefined;
  const profiloId = profili?.[0]?.id as string | undefined;
  if (!userId) {
    console.error("FAIL: nessun profili_impresa");
    process.exit(1);
  }

  const { data: gara } = await sb
    .from("gare")
    .select("id, cig")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const testOutputId = `EVTEST_${Date.now()}`;

  const { data: item, error: insErr } = await sb
    .from("evidence_items")
    .insert({
      user_id: userId,
      gara_id: gara?.id ?? null,
      profilo_id: profiloId ?? null,
      output_type: "bid_no_bid",
      output_id: testOutputId,
      source_document: "disciplinare",
      source_reference: "Art. 5.2",
      source_text: "Test evidenza Feature #14",
      rule_triggered: "SOA_QUALIFICATION_CHECK",
      company_data_used: { soa: "OG1 III", richiesto: "OG1 V" },
      conclusion: "SOA insufficiente (test autovalutazione)",
      confidence_score: 65,
      requires_human_review: true,
      review_reason: "Test — confidence sotto 70%",
    })
    .select("id")
    .single();

  if (insErr || !item) {
    console.error("FAIL insert evidence_items:", insErr?.message);
    process.exit(1);
  }
  console.log("✓ Insert evidence_items OK");

  const edges = buildDefaultGraphEdges({
    source_document: "disciplinare",
    source_reference: "Art. 5.2",
    source_text: "Test",
    rule_triggered: "SOA_QUALIFICATION_CHECK",
    company_data_used: { soa: "OG1 III" },
    conclusion: "Test conclusion",
    confidence_score: 65,
  });

  const { error: edgeErr } = await sb.from("evidence_graph_edges").insert(
    edges.map((e) => ({
      evidence_item_id: item.id,
      from_node: e.from_node,
      from_label: e.from_label,
      to_node: e.to_node,
      to_label: e.to_label,
      edge_type: e.edge_type ?? "causes",
    }))
  );
  if (edgeErr) {
    console.error("FAIL insert evidence_graph_edges:", edgeErr.message);
    process.exit(1);
  }
  console.log(`✓ Insert ${edges.length} graph edges OK`);

  const { data: readBack } = await sb
    .from("evidence_items")
    .select("id, conclusion, requires_human_review, human_reviewed")
    .eq("id", item.id)
    .single();

  if (readBack?.conclusion !== "SOA insufficiente (test autovalutazione)") {
    console.error("FAIL read back evidence");
    process.exit(1);
  }
  console.log("✓ Read evidence OK");

  const { error: revErr } = await sb
    .from("evidence_items")
    .update({
      human_reviewed: true,
      human_reviewed_at: new Date().toISOString(),
      requires_human_review: false,
    })
    .eq("id", item.id)
    .eq("user_id", userId);

  if (revErr) {
    console.error("FAIL mark reviewed:", revErr.message);
    process.exit(1);
  }
  console.log("✓ Mark human_reviewed OK");

  await sb.from("evidence_graph_edges").delete().eq("evidence_item_id", item.id);
  await sb.from("evidence_items").delete().eq("id", item.id);
  console.log("✓ Cleanup test row OK");

  console.log("\nFeature #14 DB flow: PASS\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
