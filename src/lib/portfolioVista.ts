import type { Gara, VistaPortfolio } from "../types/gara";

export type { VistaPortfolio };

/** Assegna vista portfolio da score sintetico e flag scarto. */
export function calcolaVistaPortfolio(
  scoreSintetico: number,
  scartata = false
): VistaPortfolio {
  if (scartata || scoreSintetico < 40) return "scartare";
  if (scoreSintetico >= 75) return "oggi";
  if (scoreSintetico >= 40) return "approfondire";
  return "scartare";
}

export function isVistaOggi(gara: Gara): boolean {
  return gara.vista_portfolio === "oggi" && !gara.scartata;
}

export function isVistaApprofondire(gara: Gara): boolean {
  return gara.vista_portfolio === "approfondire" && !gara.scartata;
}

export function isVistaScartare(gara: Gara): boolean {
  return gara.vista_portfolio === "scartare" || Boolean(gara.scartata);
}

export function filterByVistaOggi(gare: Gara[]): Gara[] {
  return gare
    .filter(isVistaOggi)
    .sort((a, b) => b.score_sintetico - a.score_sintetico || b.fit_score - a.fit_score);
}

export function filterByVistaApprofondire(gare: Gara[]): Gara[] {
  return gare
    .filter(isVistaApprofondire)
    .sort((a, b) => a.score_sintetico - b.score_sintetico);
}

export function filterByVistaScartare(gare: Gara[]): Gara[] {
  return gare.filter(isVistaScartare);
}
