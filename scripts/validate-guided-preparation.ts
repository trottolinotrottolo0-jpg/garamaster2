/**
 * Autovalutazione Feature #11 — Guided Tender Preparation
 * Run: npx tsx scripts/validate-guided-preparation.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

type R = { pass: boolean; details: string[] };

async function main() {
  const results: Record<string, R> = {
    t1: { pass: true, details: [] },
    t2: { pass: true, details: [] },
    t3: { pass: true, details: [] },
    t4: { pass: true, details: [] },
    t5: { pass: true, details: [] },
    t6: { pass: true, details: [] },
  };

  console.log("\n=== Feature #11 — Autovalutazione ===\n");

  // TEST 1 — Tabelle esistono
  for (const table of ["tender_practices", "tender_documents", "tender_checklist_items"]) {
    const { error } = await sb.from(table).select("id").limit(1);
    if (error) {
      results.t1.pass = false;
      results.t1.details.push(`${table}: ${error.message}`);
    } else {
      console.log(`✓ Tabella ${table} OK`);
    }
  }

  // TEST 2 — Bucket storage
  const { data: buckets, error: bErr } = await sb.storage.listBuckets();
  if (bErr) {
    results.t2.pass = false;
    results.t2.details.push(bErr.message);
  } else if (!buckets?.some((b) => b.id === "tender-practice-files")) {
    results.t2.pass = false;
    results.t2.details.push('Bucket "tender-practice-files" non trovato');
  } else {
    console.log("✓ Bucket tender-practice-files OK");
  }

  // TEST 3 — Profilo + gara utente per test
  const { data: profili } = await sb
    .from("profili_impresa")
    .select("id, user_id")
    .limit(1);
  const userId = profili?.[0]?.user_id as string | undefined;
  const profiloId = profili?.[0]?.id as string | undefined;

  if (!userId) {
    results.t3.pass = false;
    results.t3.details.push("Nessun profili_impresa — registrati prima");
  } else {
    const { data: gare } = await sb.from("gare").select("id, cig, titolo").eq("user_id", userId).limit(1);
    let garaId = gare?.[0]?.id as string | undefined;

    if (!garaId) {
      const { data: ins, error: gIns } = await sb
        .from("gare")
        .insert({
          user_id: userId,
          cig: "TESTPREP001",
          titolo: "Test autovalutazione preparazione",
          stato_pratica: "Nuova",
        })
        .select("id")
        .single();
      if (gIns) {
        results.t3.pass = false;
        results.t3.details.push(`Insert gare: ${gIns.message}`);
      } else {
        garaId = String(ins.id);
        console.log("✓ Gara test creata");
      }
    } else {
      console.log(`✓ Gara utente: ${gare[0].titolo}`);
    }

    if (garaId && userId) {
      // TEST 4 — Insert pratica + documenti + checklist
      const { data: existing } = await sb
        .from("tender_practices")
        .select("id")
        .eq("user_id", userId)
        .eq("gara_id", garaId)
        .maybeSingle();

      let practiceId = existing?.id as string | undefined;

      if (!practiceId) {
        const { data: pr, error: pErr } = await sb
          .from("tender_practices")
          .insert({
            user_id: userId,
            gara_id: garaId,
            profilo_impresa_id: profiloId ?? null,
            stato: "DA_ANALIZZARE",
            autocompilazione: { ragioneSociale: "Test SRL" },
          })
          .select("id")
          .single();
        if (pErr) {
          results.t4.pass = false;
          results.t4.details.push(`Insert practice: ${pErr.message}`);
        } else {
          practiceId = String(pr.id);
        }
      }

      if (practiceId) {
        const { count: docCount } = await sb
          .from("tender_documents")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", practiceId);

        if ((docCount ?? 0) === 0) {
          const { error: dErr } = await sb.from("tender_documents").insert({
            practice_id: practiceId,
            user_id: userId,
            categoria: "amministrativa",
            nome: "DGUE test",
            stato: "MANCANTE",
            obbligatorio: true,
            ordine: 1,
          });
          if (dErr) {
            results.t4.pass = false;
            results.t4.details.push(`Insert document: ${dErr.message}`);
          }
        }

        const { count: chkCount } = await sb
          .from("tender_checklist_items")
          .select("id", { count: "exact", head: true })
          .eq("practice_id", practiceId);

        if ((chkCount ?? 0) === 0) {
          const { error: cErr } = await sb.from("tender_checklist_items").insert({
            practice_id: practiceId,
            user_id: userId,
            busta: "amministrativa",
            titolo: "Verifica busta amministrativa",
            stato: "TODO",
            obbligatorio: true,
            ordine: 1,
          });
          if (cErr) {
            results.t4.pass = false;
            results.t4.details.push(`Insert checklist: ${cErr.message}`);
          }
        }

        if (results.t4.pass) console.log("✓ Pratica + documenti + checklist OK");

        // TEST 5 — Update stato (transizione)
        const { error: uErr } = await sb
          .from("tender_practices")
          .update({ stato: "IN_LAVORAZIONE" })
          .eq("id", practiceId)
          .eq("user_id", userId);
        if (uErr) {
          results.t5.pass = false;
          results.t5.details.push(uErr.message);
        } else {
          const { data: after } = await sb
            .from("tender_practices")
            .select("stato")
            .eq("id", practiceId)
            .single();
          if (after?.stato !== "IN_LAVORAZIONE") {
            results.t5.pass = false;
            results.t5.details.push(`Expected IN_LAVORAZIONE, got ${after?.stato}`);
          } else {
            console.log("✓ Update stato pratica OK");
          }
        }

        // Cleanup test gara only if we created TESTPREP001
        if (gare?.[0]?.cig === "TESTPREP001" || !gare?.length) {
          await sb.from("tender_practices").delete().eq("id", practiceId);
          await sb.from("gare").delete().eq("id", garaId).eq("cig", "TESTPREP001");
        }
      }
    }
  }

  // TEST 6 — API suggest (server must be running)
  try {
    const health = await fetch("http://localhost:3000/api/health");
    if (!health.ok) throw new Error("health not ok");
    const suggestRes = await fetch("http://localhost:3000/api/tender-preparation/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tender: {
          id: "mock-1",
          cig: "TESTPREP001",
          title: "Gara test preparazione",
          region: "Lazio",
          value: "500000",
          category: "OG1",
          deadline: "2026-12-31",
          requirements: [],
          penalties: [],
          anomalies: [],
        },
        profilo: { id: "x", userId: "x", ragioneSociale: "Test", summary: "test" },
        existingDocuments: [],
        existingChecklist: [],
      }),
    });
    if (suggestRes.ok) {
      const body = await suggestRes.json();
      if (Array.isArray(body.documents) && Array.isArray(body.checklist)) {
        console.log(`✓ API suggest OK (${body.documents.length} doc, ${body.checklist.length} checklist)`);
      } else {
        results.t6.pass = false;
        results.t6.details.push("Risposta API senza documents/checklist");
      }
    } else {
      const errBody = await suggestRes.text();
      const creditsIssue = /credits|max_tokens|afford/i.test(errBody);
      if (creditsIssue) {
        results.t6.pass = false;
        results.t6.details.push(
          "OpenRouter senza crediti sufficienti — riavvia dev server dopo aggiornamento (fallback locale atteso)"
        );
      } else if (suggestRes.status === 503) {
        results.t6.pass = false;
        results.t6.details.push(`HTTP ${suggestRes.status}: ${errBody.slice(0, 120)}`);
      }
    }
  } catch (e) {
    results.t6.pass = false;
    results.t6.details.push(
      e instanceof Error ? e.message : "Server non raggiungibile — avvia npm run dev"
    );
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("REPORT AUTOVALUTAZIONE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const labels: Record<string, string> = {
    t1: "TEST 1 — Tabelle DB",
    t2: "TEST 2 — Bucket Storage",
    t3: "TEST 3 — Profilo + gara utente",
    t4: "TEST 4 — Insert pratica/documenti/checklist",
    t5: "TEST 5 — Update stato pratica",
    t6: "TEST 6 — API AI suggest (dev server)",
  };

  let allPass = true;
  for (const [k, label] of Object.entries(labels)) {
    const r = results[k];
    console.log(`${label}: ${r.pass ? "PASS" : "FAIL"}`);
    if (!r.pass) {
      allPass = false;
      r.details.forEach((d) => console.log(`  → ${d}`));
    }
  }

  console.log("\n--- Checklist manuale UI ---");
  console.log("1. Login su http://localhost:3000");
  console.log("2. Seleziona una gara → sidebar → «Prepara partecipazione»");
  console.log("3. Verifica wizard, barra avanzamento, upload documento");
  console.log("4. Clic «Suggerisci documenti con AI» (richiede OPENROUTER_API_KEY)\n");

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
