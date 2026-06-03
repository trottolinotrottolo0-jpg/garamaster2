import type { Gara } from "../types/gara";
import type { GaraRow } from "../types/database";

export function parseStoredScore(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(0, Math.min(100, n)));
}

/** Scadenza portfolio: priorità `scadenza_offerta`. */
export function resolveScadenzaPortfolio(row: {
  scadenza_offerta?: string | null;
  data_scadenza?: string | null;
  scadenza?: string | null;
}): string | undefined {
  if (row.scadenza_offerta) return String(row.scadenza_offerta);
  if (row.data_scadenza) return String(row.data_scadenza);
  if (row.scadenza) return String(row.scadenza);
  return undefined;
}

export function garaToPortfolioUpdate(gara: Gara) {
  return {
    fit_score: gara.fit_score,
    urgenza_score: gara.urgency_score,
    rischio_score: gara.risk_score,
    margine_score: gara.margine_stimato,
    carico_score: gara.carico_score,
    convenienza_score: gara.convenienza_score,
    score_sintetico: gara.score_sintetico,
    motivazione_ranking: gara.motivazione_ranking ?? null,
    vista_portfolio: gara.vista_portfolio ?? null,
    scartata: Boolean(gara.scartata),
  };
}

/** Legge snapshot portfolio da riga `gare` (se presente). */
export function readPortfolioSnapshotFromRow(row: GaraRow): Partial<Gara> {
  const record = row as Record<string, unknown>;
  return {
    fit_score: parseStoredScore(record.fit_score) ?? undefined,
    urgency_score: parseStoredScore(record.urgenza_score) ?? undefined,
    risk_score: parseStoredScore(record.rischio_score) ?? undefined,
    margine_stimato:
      record.margine_score != null
        ? parseStoredScore(record.margine_score)
        : row.margine_stimato != null
          ? Number(row.margine_stimato)
          : undefined,
    carico_score: parseStoredScore(record.carico_score) ?? undefined,
    convenienza_score: parseStoredScore(record.convenienza_score) ?? undefined,
    score_sintetico: parseStoredScore(record.score_sintetico) ?? undefined,
    motivazione_ranking: row.motivazione_ranking
      ? String(row.motivazione_ranking)
      : undefined,
    vista_portfolio: row.vista_portfolio as Gara["vista_portfolio"],
  };
}
