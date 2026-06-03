import type { Gara } from "../types/gara";
import type { HistoricalTender } from "../types";

const DEFAULT_MARGINE_NEUTRAL = 45;
const DEFAULT_STORICO_NEUTRAL = 50;

export type StoricoMatchInput = {
  categoria?: string;
  importo?: number | null;
  regione?: string;
};

function normalizeCategory(value: string): string {
  return value.trim().toUpperCase();
}

function isSimilarToStorico(gara: StoricoMatchInput, storico: HistoricalTender): boolean {
  const catA = normalizeCategory(gara.categoria ?? "");
  const catB = normalizeCategory(storico.categoriaSOA ?? "");
  const catMatch =
    catA.length >= 2 &&
    catB.length >= 2 &&
    (catA.includes(catB) || catB.includes(catA) || catA.slice(0, 3) === catB.slice(0, 3));

  const importo = gara.importo;
  const importoMatch =
    importo != null &&
    importo > 0 &&
    storico.importoGara > 0 &&
    storico.importoGara >= importo * 0.5 &&
    storico.importoGara <= importo * 1.5;

  const regioneA = normalizeCategory(gara.regione ?? "");
  const regioneB = normalizeCategory(storico.regioneGara ?? "");
  const regionMatch =
    regioneA.length >= 3 &&
    regioneB.length >= 3 &&
    (regioneA.includes(regioneB) || regioneB.includes(regioneA));

  return catMatch || importoMatch || (catMatch && regionMatch);
}

/** 0–100: allineamento con storico gare simili (categoria SOA / importo ±50%). */
export function computeStoricoMatch(
  gara: StoricoMatchInput,
  historical: HistoricalTender[]
): number {
  if (historical.length === 0) return DEFAULT_STORICO_NEUTRAL;

  const similar = historical.filter((h) => isSimilarToStorico(gara, h));
  if (similar.length === 0) return 38;

  const decisive = similar.filter((s) => s.esito === "vinta" || s.esito === "persa");
  const wins = similar.filter((s) => s.esito === "vinta").length;
  const winRate = decisive.length > 0 ? wins / decisive.length : 0.5;

  let score = 40 + winRate * 48;
  score += Math.min(14, similar.length * 2.5);

  const margini = similar
    .map((s) => s.margineRealizzato)
    .filter((m): m is number => m != null && !Number.isNaN(m));
  if (margini.length > 0) {
    const avg = margini.reduce((a, b) => a + b, 0) / margini.length;
    if (avg >= 12) score += 8;
    if (avg < 5) score -= 12;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Probabilità di convenienza/vittoria (0–100), solo calcolo client-side.
 * convenienza = fit×0.35 + margine×0.25 + (100−rischio)×0.25 + storico×0.15
 */
export function computeConvenienza(
  gara: Pick<Gara, "fit_score" | "margine_stimato" | "risk_score"> & StoricoMatchInput,
  storicoMatch: number
): number {
  const margine = gara.margine_stimato ?? DEFAULT_MARGINE_NEUTRAL;
  const raw =
    gara.fit_score * 0.35 +
    margine * 0.25 +
    (100 - gara.risk_score) * 0.25 +
    storicoMatch * 0.15;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function enrichGareWithConvenienza(
  gare: Gara[],
  historical: HistoricalTender[] = []
): Gara[] {
  return gare.map((gara) => {
    const storico_match = computeStoricoMatch(gara, historical);
    const convenienza_score = computeConvenienza(gara, storico_match);

    return {
      ...gara,
      storico_match,
      convenienza_score,
    };
  });
}

export function sortByConvenienza(gare: Gara[]): Gara[] {
  return [...gare].sort((a, b) => {
    if (b.convenienza_score !== a.convenienza_score) {
      return b.convenienza_score - a.convenienza_score;
    }
    return b.fit_score - a.fit_score;
  });
}

export function formatConvenienzaLabel(score: number): string {
  return `Conv. ${score}%`;
}

export function convenienzaBadgeClasses(score: number): string {
  if (score >= 70) return "text-brand-gold bg-brand-gold/10 border-brand-gold/40";
  if (score >= 50) return "text-sky-300 bg-sky-950/40 border-sky-800/50";
  return "text-slate-400 bg-neutral-900 border-neutral-800";
}
