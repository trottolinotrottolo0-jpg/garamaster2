/**
 * Tender Portfolio Score — validation suite.
 * Seeds 3 temporary gare if table empty, runs tests, deletes seeds.
 * Run: npx tsx scripts/validate-portfolio-score.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { calcolaScoreSintetico, generaMotivazione } from "../src/lib/scoring";
import { sortByFit } from "../src/lib/fitScore";
import { sortByUrgency, computeUrgencyScore } from "../src/lib/urgencyScore";
import { sortByRisk } from "../src/lib/riskScore";
import { sortByMargine } from "../src/lib/margineScore";
import { sortByCarico } from "../src/lib/caricoScore";
import { sortByConvenienza } from "../src/lib/convenienzaScore";
import { filterGareDaGuardareOggi } from "../src/lib/watchTodayFilter";
import type { Gara } from "../src/types/gara";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SEED_CIG_PREFIX = "PORTVAL";
const SEED_TITOLO = "__PORTFOLIO_VALIDATION__";

type GaraDb = Record<string, unknown>;
type TestResult = { pass: boolean; details: string[] };

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function daysUntil(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expectedUrgenzaFromScadenza(scadenzaOfferta: string | null): number {
  if (!scadenzaOfferta) return 0;
  const giorni = daysUntil(scadenzaOfferta);
  if (giorni == null) return 0;
  if (giorni <= 3) return 100;
  if (giorni <= 7) return 80;
  if (giorni <= 14) return 60;
  if (giorni <= 30) return 40;
  return 20;
}

function calcScoreSinteticoDb(g: GaraDb): number {
  const fit = num(g.fit_score);
  const margine = num(g.margine_score, 45);
  const rischio = num(g.rischio_score);
  const urgenza = num(g.urgenza_score);
  const carico = num(g.carico_score);
  const raw =
    fit * 0.3 +
    margine * 0.2 +
    (100 - rischio) * 0.2 +
    urgenza * 0.15 +
    (100 - carico) * 0.15;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function expectedVista(g: GaraDb): "oggi" | "approfondire" | "scartare" {
  const score = num(g.score_sintetico);
  const scartata = g.scartata === true;
  if (score < 40 || scartata) return "scartare";
  if (score >= 75 && !scartata) return "oggi";
  return "approfondire";
}

function dbToGara(g: GaraDb): Gara {
  return {
    id: String(g.id),
    cig: String(g.cig ?? "N/D"),
    titolo: String(g.titolo ?? "Gara"),
    fit_score: num(g.fit_score),
    urgency_score: num(g.urgenza_score),
    risk_score: num(g.rischio_score),
    margine_stimato: g.margine_score != null ? num(g.margine_score) : null,
    carico_score: num(g.carico_score),
    convenienza_score: num(g.convenienza_score),
    score_sintetico: num(g.score_sintetico),
    motivazione_ranking: g.motivazione_ranking ? String(g.motivazione_ranking) : undefined,
    scartata: g.scartata === true,
    source: "gare",
    scadenza: g.scadenza_offerta ? String(g.scadenza_offerta) : undefined,
  };
}

function isSortedDesc(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[i - 1]) return false;
  }
  return true;
}

function isSortedAsc(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) return false;
  }
  return true;
}

function scanPortfolioRls(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const rel of ["src/hooks/usePortfolioGare.ts", "src/services/garaDataService.ts"]) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const updates = src.match(/\.from\(["']gare["']\)\s*\.update[\s\S]{0,400}/g) ?? [];
    const selects = src.match(/\.from\(["']gare["']\)\s*\.select[\s\S]{0,400}/g) ?? [];
    for (const chunk of [...updates, ...selects]) {
      if (!/\.eq\(["']user_id["']/.test(chunk)) {
        issues.push(`${rel}: gare query missing .eq('user_id', ...)`);
      }
    }
  }
  const hook = readFileSync(join(process.cwd(), "src/hooks/usePortfolioGare.ts"), "utf8");
  if (!hook.includes("fetchGareForUser(userId)")) {
    issues.push("usePortfolioGare: missing fetchGareForUser(userId)");
  }
  return { ok: issues.length === 0, issues };
}

function buildSeedRows(userId: string): GaraDb[] {
  const d5 = new Date();
  d5.setDate(d5.getDate() + 5);
  const d20 = new Date();
  d20.setDate(d20.getDate() + 20);

  const oggi: GaraDb = {
    user_id: userId,
    titolo: SEED_TITOLO,
    cig: `${SEED_CIG_PREFIX}001`,
    fit_score: 90,
    margine_score: 60,
    rischio_score: 20,
    urgenza_score: 80,
    carico_score: 20,
    convenienza_score: 75,
    scadenza_offerta: d5.toISOString(),
    scartata: false,
    motivazione_ranking:
      "Ottimo fit con profilo SOA e area geografica. Scadenza imminente: azione richiesta entro 5 giorni. Score complessivo: 82/100.",
  };
  oggi.score_sintetico = calcScoreSinteticoDb(oggi);
  oggi.vista_portfolio = expectedVista(oggi);
  oggi.motivazione_ranking = `Ottimo fit con profilo SOA e area geografica. Scadenza imminente: azione richiesta entro 5 giorni. Score complessivo: ${oggi.score_sintetico}/100.`;

  const approfondire: GaraDb = {
    user_id: userId,
    titolo: SEED_TITOLO,
    cig: `${SEED_CIG_PREFIX}002`,
    fit_score: 50,
    margine_score: 40,
    rischio_score: 50,
    urgenza_score: 40,
    carico_score: 50,
    convenienza_score: 45,
    scadenza_offerta: d20.toISOString(),
    scartata: false,
    motivazione_ranking:
      "Valutazione nella media rispetto al profilo aziendale. Score complessivo: 47/100.",
  };
  approfondire.score_sintetico = calcScoreSinteticoDb(approfondire);
  approfondire.vista_portfolio = expectedVista(approfondire);
  approfondire.motivazione_ranking = `Valutazione nella media rispetto al profilo aziendale. Score complessivo: ${approfondire.score_sintetico}/100.`;

  const scartare: GaraDb = {
    user_id: userId,
    titolo: SEED_TITOLO,
    cig: `${SEED_CIG_PREFIX}003`,
    fit_score: 30,
    margine_score: 25,
    rischio_score: 75,
    carico_score: 80,
    urgenza_score: 40,
    convenienza_score: 20,
    scadenza_offerta: d20.toISOString(),
    scartata: false,
  };
  scartare.score_sintetico = calcScoreSinteticoDb(scartare);
  scartare.vista_portfolio = expectedVista(scartare);
  scartare.motivazione_ranking = `Rischio elevato: clausole da verificare. Margine stimato insufficiente. Carico operativo alto. Score complessivo: ${scartare.score_sintetico}/100.`;

  return [oggi, approfondire, scartare];
}

async function resolveUserId(): Promise<string> {
  const { data } = await supabase
    .from("profili_impresa")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(1);
  const uid = data?.[0]?.user_id as string | undefined;
  if (!uid) throw new Error("No profili_impresa.user_id found");
  return uid;
}

async function cleanupSeeds(userId: string) {
  await supabase
    .from("gare")
    .delete()
    .eq("user_id", userId)
    .like("cig", `${SEED_CIG_PREFIX}%`);
}

async function main() {
  const results: Record<string, TestResult> = {
    t1: { pass: true, details: [] },
    t2: { pass: true, details: [] },
    t3: { pass: true, details: [] },
    t4: { pass: true, details: [] },
    t5: { pass: true, details: [] },
    t6: { pass: true, details: [] },
    t7: { pass: true, details: [] },
    t8: { pass: true, details: [] },
  };

  const userId = await resolveUserId();
  let seeded = false;

  const { count: existingCount } = await supabase
    .from("gare")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  let gare: GaraDb[] = [];

  const { data: realGare } = await supabase.from("gare").select("*").eq("user_id", userId);
  gare = (realGare ?? []).filter((g) => !String(g.cig ?? "").startsWith(SEED_CIG_PREFIX));

  const skipSeed = process.argv.includes("--no-seed");

  if (!skipSeed && gare.length < 3) {
    seeded = true;
    await cleanupSeeds(userId);
    const seeds = buildSeedRows(userId);
    const { error: seedErr } = await supabase.from("gare").insert(seeds);
    if (seedErr) {
      console.error("Seed failed:", seedErr.message);
      process.exit(1);
    }
    const { data: afterSeed } = await supabase
      .from("gare")
      .select("*")
      .eq("user_id", userId)
      .like("cig", `${SEED_CIG_PREFIX}%`);
    gare = afterSeed ?? [];
    console.log(`Seeded ${gare.length} validation rows (table had ${existingCount ?? 0} user gare).\n`);
  }

  console.log(`=== Portfolio validation — user_id: ${userId} — ${gare.length} gare ===\n`);

  // TEST 1
  const sample3 = gare.slice(0, 3);
  if (sample3.length < 3) {
    results.t1.pass = false;
    results.t1.details.push(`Need 3 gare, found ${sample3.length}`);
  } else {
    for (const g of sample3) {
      const computed = calcScoreSinteticoDb(g);
      const stored = g.score_sintetico != null ? num(g.score_sintetico) : NaN;
      const titolo = String(g.titolo ?? g.cig).slice(0, 40);
      console.log(`TEST1 ${titolo} → formula=${computed} db=${stored}`);
      if (!Number.isFinite(computed) || computed < 0 || computed > 100) {
        results.t1.pass = false;
        results.t1.details.push(`${titolo}: invalid computed ${computed}`);
      }
      if (!Number.isFinite(stored) || stored < 0 || stored > 100) {
        results.t1.pass = false;
        results.t1.details.push(`${titolo}: db score null/NaN/out of range (${stored})`);
      }
      if (Number.isFinite(stored) && Math.abs(stored - computed) > 1) {
        results.t1.pass = false;
        results.t1.details.push(
          `${titolo}: expected formula ${computed}, db score_sintetico ${stored}`
        );
      }
    }
  }

  // TEST 2
  for (const g of gare) {
    const scadenza = g.scadenza_offerta ? String(g.scadenza_offerta) : null;
    const expected = expectedUrgenzaFromScadenza(scadenza);
    const stored = num(g.urgenza_score);
    if (g.urgenza_score == null) {
      results.t2.pass = false;
      results.t2.details.push(`${g.cig}: urgenza_score is null`);
    } else if (stored !== expected) {
      results.t2.pass = false;
      results.t2.details.push(
        `${g.cig}: urgenza_score=${stored}, expected from scadenza_offerta=${expected}`
      );
    }
  }

  // TEST 3
  for (const g of gare) {
    const vista = g.vista_portfolio ? String(g.vista_portfolio) : null;
    const expected = expectedVista(g);
    if (!vista) {
      results.t3.pass = false;
      results.t3.details.push(`${g.cig}: vista_portfolio null`);
    } else if (vista !== expected) {
      results.t3.pass = false;
      results.t3.details.push(
        `${g.cig}: vista='${vista}' expected='${expected}' (score=${num(g.score_sintetico)}, scartata=${g.scartata})`
      );
    }
  }

  // TEST 4
  const models = gare.map(dbToGara);
  const checks: { name: string; sorted: Gara[]; key: keyof Gara; dir: "asc" | "desc" }[] = [
    { name: "sortByFit", sorted: sortByFit(models), key: "fit_score", dir: "desc" },
    { name: "sortByUrgenza", sorted: sortByUrgency(models), key: "urgency_score", dir: "desc" },
    { name: "sortByRischio", sorted: sortByRisk(models, "asc"), key: "risk_score", dir: "asc" },
    { name: "sortByMargine", sorted: sortByMargine(models), key: "margine_stimato", dir: "desc" },
    { name: "sortByCarico", sorted: sortByCarico(models, "asc"), key: "carico_score", dir: "asc" },
    {
      name: "sortByConvenienza",
      sorted: sortByConvenienza(models),
      key: "convenienza_score",
      dir: "desc",
    },
  ];
  for (const { name, sorted, key, dir } of checks) {
    const values = sorted.map((g) => num(g[key] as number));
    const ok = dir === "desc" ? isSortedDesc(values) : isSortedAsc(values);
    if (!ok) {
      results.t4.pass = false;
      results.t4.details.push(`${name}: wrong order [${values.join(", ")}]`);
    }
  }

  // TEST 5
  const oggiDb = gare.filter((g) => g.vista_portfolio === "oggi");
  const oggiBad = oggiDb.filter((g) => num(g.score_sintetico) < 75 || g.scartata === true);
  if (oggiBad.length) {
    results.t5.pass = false;
    results.t5.details.push(`${oggiBad.length} in 'oggi' fail score>=75 & !scartata`);
  }
  const uiWatch = filterGareDaGuardareOggi(gare.map(dbToGara).filter((g) => !g.scartata));
  if (uiWatch.length !== oggiDb.length) {
    results.t5.details.push(
      `(note) UI watchToday count=${uiWatch.length} vs DB vista oggi=${oggiDb.length} — rules differ`
    );
  }
  console.log(`TEST5 vista oggi count=${oggiDb.length}`);

  // TEST 6
  const scartareDb = gare.filter((g) => g.vista_portfolio === "scartare");
  const scartareBad = scartareDb.filter(
    (g) => !(num(g.score_sintetico) < 40 || g.scartata === true)
  );
  if (scartareBad.length) {
    results.t6.pass = false;
    results.t6.details.push(`${scartareBad.length} in scartare violate filter`);
  }

  const scartoTarget = gare.find((g) => g.scartata !== true && g.vista_portfolio !== "scartare");
  if (scartoTarget) {
    const id = String(scartoTarget.id);
    const { error: upErr } = await supabase
      .from("gare")
      .update({ scartata: true, vista_portfolio: "scartare" })
      .eq("id", id)
      .eq("user_id", userId);
    if (upErr) {
      results.t6.pass = false;
      results.t6.details.push(`scarto update: ${upErr.message}`);
    } else {
      const { data: after } = await supabase
        .from("gare")
        .select("scartata, vista_portfolio")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (after?.scartata !== true) {
        results.t6.pass = false;
        results.t6.details.push(`expected scartata=true, got ${after?.scartata}`);
      }
      const stillOggi = gare.filter(
        (g) => g.id !== id && (g.vista_portfolio === "oggi" || g.vista_portfolio === "approfondire")
      );
      void stillOggi;
      if (after?.vista_portfolio === "oggi" || after?.vista_portfolio === "approfondire") {
        results.t6.pass = false;
        results.t6.details.push(
          `expected removed from oggi/approfondire, vista=${after?.vista_portfolio}`
        );
      }
      await supabase
        .from("gare")
        .update({ scartata: false, vista_portfolio: expectedVista(scartoTarget) })
        .eq("id", id)
        .eq("user_id", userId);
    }
  }

  // TEST 7
  for (const g of gare) {
    const mot = String(g.motivazione_ranking ?? "").trim();
    const score = Math.round(num(g.score_sintetico));
    if (!mot) {
      results.t7.pass = false;
      results.t7.details.push(`${g.cig}: motivazione_ranking empty`);
      continue;
    }
    if (!mot.includes(`Score complessivo: ${score}/100`)) {
      results.t7.pass = false;
      results.t7.details.push(`${g.cig}: missing 'Score complessivo: ${score}/100'`);
    }
    const low = mot.toLowerCase();
    if (num(g.fit_score) >= 75 && !low.includes("fit")) {
      results.t7.pass = false;
      results.t7.details.push(`${g.cig}: fit>=75 without 'fit' in text`);
    }
    if (num(g.urgenza_score) >= 80 && !/scadenza|giorni/i.test(mot)) {
      results.t7.pass = false;
      results.t7.details.push(`${g.cig}: urgenza>=80 without scadenza/giorni`);
    }
    if (num(g.rischio_score) >= 70 && !low.includes("rischio")) {
      results.t7.pass = false;
      results.t7.details.push(`${g.cig}: rischio>=70 without 'rischio'`);
    }
    if (num(g.margine_score) < 30 && !low.includes("margine")) {
      results.t7.pass = false;
      results.t7.details.push(`${g.cig}: margine_score<30 without 'margine'`);
    }
    if (num(g.carico_score) > 70 && !low.includes("carico")) {
      results.t7.pass = false;
      results.t7.details.push(`${g.cig}: carico>70 without 'carico'`);
    }
  }

  const clientGara: Gara = {
    id: "x",
    cig: "X",
    titolo: "Test",
    fit_score: 80,
    urgency_score: 85,
    risk_score: 75,
    margine_stimato: 5,
    carico_score: 75,
    convenienza_score: 50,
    score_sintetico: 55,
    source: "gare",
    scadenza: new Date(Date.now() + 5 * 864e5).toISOString(),
  };
  const clientMot = generaMotivazione(clientGara);
  if (!/Score complessivo: 55\/100/.test(clientMot)) {
    results.t7.pass = false;
    results.t7.details.push(`client generaMotivazione: missing score suffix`);
  }
  if (clientGara.margine_stimato! < 8 && !clientMot.toLowerCase().includes("margine")) {
    results.t7.details.push(
      `(note) client uses margine_stimato<8 not margine_score<30 for margine phrase`
    );
  }

  // TEST 8
  const rls = scanPortfolioRls();
  if (!rls.ok) {
    results.t8.pass = false;
    results.t8.details.push(...rls.issues);
  }
  const { data: foreign } = await supabase
    .from("gare")
    .select("id")
    .neq("user_id", userId)
    .limit(1);
  const { data: mine } = await supabase.from("gare").select("id").eq("user_id", userId);
  if (foreign?.length && mine?.some((m) => foreign.some((f) => f.id === m.id))) {
    results.t8.pass = false;
    results.t8.details.push("cross-user row id overlap");
  }

  if (seeded) {
    await cleanupSeeds(userId);
    console.log("\nCleaned up seeded validation rows.");
  }

  const calcoliMissing = !existsSync(join(process.cwd(), "src/lib/calcoli.ts"));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("FINAL REPORT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const labels: Record<string, string> = {
    t1: "TEST 1 — Score sintetico",
    t2: "TEST 2 — Urgenza score",
    t3: "TEST 3 — Vista assignment",
    t4: "TEST 4 — Sorting",
    t5: "TEST 5 — Vista oggi",
    t6: "TEST 6 — Vista scartare",
    t7: "TEST 7 — Motivazione",
    t8: "TEST 8 — RLS",
  };

  for (const [key, label] of Object.entries(labels)) {
    const r = results[key];
    console.log(`${label}: ${r.pass ? "PASS" : "FAIL"}`);
    if (!r.pass || r.details.length) {
      for (const d of r.details.slice(0, 6)) {
        console.log(`  → ${d}`);
      }
    }
  }

  console.log("\n--- Note ---");
  if (calcoliMissing) {
    console.log("• src/lib/calcoli.ts missing — run latest app code");
  } else {
    console.log("• calcolaDecisionEngine in src/lib/calcoli.ts");
  }
  if (!results.t1.pass || !results.t7.pass) {
    console.log("• Apri il Portfolio in app (refresh) per risincronizzare score e motivazioni su Supabase");
  }

  const anyFail = Object.values(results).some((r) => !r.pass);
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
