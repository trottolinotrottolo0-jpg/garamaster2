/**
 * Feature #14 — validation evidence tables + lib
 * Run: npm run test:evidence
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { createClient } from "@supabase/supabase-js";
import {
  buildDefaultGraphEdges,
  buildFitScoreEvidence,
  buildReasoningChain,
  normalizeEvidenceItem,
} from "../src/lib/evidence";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  let pass = true;

  const sample = normalizeEvidenceItem({
    source_document: "disciplinare",
    source_reference: "Art. 5.2",
    source_text: "SOA OG1 classe V",
    rule_triggered: "SOA_CHECK",
    company_data_used: { soa: "OG1 III" },
    conclusion: "SOA insufficiente",
    confidence_score: 65,
  });
  if (!sample?.conclusion) {
    console.error("FAIL normalizeEvidenceItem");
    pass = false;
  } else {
    console.log("✓ normalizeEvidenceItem");
  }

  const chain = buildReasoningChain(sample!);
  if (chain.length < 2) {
    console.error("FAIL buildReasoningChain");
    pass = false;
  } else {
    console.log("✓ buildReasoningChain", chain.length, "steps");
  }

  const edges = buildDefaultGraphEdges(sample!);
  if (edges.length < 3) {
    console.error("FAIL buildDefaultGraphEdges");
    pass = false;
  } else {
    console.log("✓ buildDefaultGraphEdges", edges.length, "edges");
  }

  const fit = buildFitScoreEvidence(
    {
      id: "x",
      cig: "TEST",
      titolo: "Test",
      fit_score: 80,
      urgency_score: 40,
      risk_score: 30,
      margine_stimato: 25,
      carico_score: 20,
      convenienza_score: 50,
      score_sintetico: 55,
      source: "gare",
    },
    { id: "p", userId: "u", ragioneSociale: "Test SRL", summary: "" }
  );
  if (fit.length < 2) {
    console.error("FAIL buildFitScoreEvidence");
    pass = false;
  } else {
    console.log("✓ buildFitScoreEvidence", fit.length, "items");
  }

  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    for (const table of ["evidence_items", "evidence_graph_edges"]) {
      const { error } = await sb.from(table).select("id").limit(1);
      if (error) {
        console.error(`FAIL table ${table}:`, error.message);
        console.log("→ Esegui supabase/solo-evidence-layer.sql nel SQL Editor");
        pass = false;
      } else {
        console.log(`✓ Tabella ${table}`);
      }
    }
  } else {
    console.log("⚠ Skip DB (manca SUPABASE_SERVICE_ROLE_KEY)");
  }

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
