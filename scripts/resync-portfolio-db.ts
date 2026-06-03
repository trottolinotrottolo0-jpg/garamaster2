/**
 * Allinea score, urgenza, vista e motivazione su `gare` con la logica app (calcoli.ts / scoring.ts).
 * Run: npx tsx scripts/resync-portfolio-db.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { createClient } from "@supabase/supabase-js";
import { calcolaScoreSintetico, generaMotivazione } from "../src/lib/scoring";
import { calcolaVistaPortfolio } from "../src/lib/portfolioVista";
import { computeUrgencyScore } from "../src/lib/urgencyScore";
import { resolveScadenzaPortfolio } from "../src/lib/portfolioDb";
import type { Gara } from "../src/types/gara";

const DEFAULT_MARGINE = 45;

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function rowToGara(row: Record<string, unknown>): Gara {
  const scadenza = resolveScadenzaPortfolio(row as Parameters<typeof resolveScadenzaPortfolio>[0]);
  const urgency_score = computeUrgencyScore(scadenza);
  const margine_stimato =
    row.margine_score != null && row.margine_score !== ""
      ? num(row.margine_score)
      : DEFAULT_MARGINE;

  const base: Gara = {
    id: String(row.id),
    cig: String(row.cig ?? "N/D"),
    titolo: String(row.titolo ?? "Gara"),
    fit_score: num(row.fit_score),
    urgency_score,
    risk_score: num(row.rischio_score),
    margine_stimato,
    carico_score: num(row.carico_score),
    convenienza_score: num(row.convenienza_score, 50),
    score_sintetico: 0,
    scartata: row.scartata === true,
    source: "gare",
    scadenza,
  };

  const score_sintetico = calcolaScoreSintetico(base);
  const vista_portfolio = calcolaVistaPortfolio(score_sintetico, base.scartata);
  const withScore: Gara = { ...base, score_sintetico, vista_portfolio };
  const motivazione_ranking = generaMotivazione(withScore);

  return { ...withScore, motivazione_ranking };
}

async function main() {
  const { data: profili } = await supabase
    .from("profili_impresa")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(1);
  const userId = profili?.[0]?.user_id as string | undefined;
  if (!userId) {
    console.error("Nessun profili_impresa");
    process.exit(1);
  }

  const { data: rows, error } = await supabase.from("gare").select("*").eq("user_id", userId);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let updated = 0;
  for (const row of rows ?? []) {
    const g = rowToGara(row as Record<string, unknown>);
    const { error: upErr } = await supabase
      .from("gare")
      .update({
        urgenza_score: g.urgency_score,
        margine_score: g.margine_stimato,
        score_sintetico: g.score_sintetico,
        vista_portfolio: g.vista_portfolio,
        motivazione_ranking: g.motivazione_ranking,
      })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (upErr) {
      console.warn(row.cig, upErr.message);
    } else {
      updated++;
    }
  }

  console.log(`Risincronizzate ${updated}/${rows?.length ?? 0} gare per user ${userId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
