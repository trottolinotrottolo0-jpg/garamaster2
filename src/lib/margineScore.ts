import type { Gara } from "../types/gara";

export type MargineScoreInput = {
  margine_stimato?: number | string | null;
  importo?: number | string | null;
  importo_base?: number | string | null;
  costo_stimato_interno?: number | string | null;
  ribasso_ipotizzato?: number | string | null;
};

function parseNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  const cleaned = String(value).replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function ribassoToFraction(ribasso: number): number {
  if (ribasso > 1) return ribasso / 100;
  return ribasso;
}

/**
 * Margine stimato % (0–100). Da DB `margine_stimato` oppure:
 * ((importo × (1 − ribasso)) − costo_stimato) / importo × 100
 */
export function computeMargineStimato(input: MargineScoreInput): number | null {
  const stored = parseNum(input.margine_stimato);
  if (stored != null) {
    return Math.round(Math.max(-100, Math.min(100, stored)) * 10) / 10;
  }

  const importo = parseNum(input.importo_base) ?? parseNum(input.importo);
  const costo = parseNum(input.costo_stimato_interno);
  const ribassoRaw = parseNum(input.ribasso_ipotizzato);

  if (importo == null || importo <= 0 || costo == null || ribassoRaw == null) {
    return null;
  }

  const ribasso = ribassoToFraction(ribassoRaw);
  const importoOfferta = importo * (1 - ribasso);
  const margin = ((importoOfferta - costo) / importo) * 100;
  return Math.round(margin * 10) / 10;
}

export function sortByMargine(gare: Gara[]): Gara[] {
  return [...gare].sort((a, b) => {
    const ma = a.margine_stimato ?? -Infinity;
    const mb = b.margine_stimato ?? -Infinity;
    if (mb !== ma) return mb - ma;
    return b.fit_score - a.fit_score;
  });
}

export function formatMargineLabel(margine: number | null | undefined): string {
  if (margine == null || Number.isNaN(margine)) return "Est. —";
  const rounded = Math.round(margine * 10) / 10;
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `Est. ${display}%`;
}

export function margineBadgeClasses(margine: number | null | undefined): string {
  if (margine == null || Number.isNaN(margine)) {
    return "text-slate-500 bg-neutral-900 border-neutral-800";
  }
  if (margine > 15) {
    return "text-emerald-300 bg-emerald-950/50 border-emerald-800/50";
  }
  if (margine >= 8) {
    return "text-amber-300 bg-amber-950/50 border-amber-800/50";
  }
  return "text-red-300 bg-red-950/60 border-red-800/60";
}

export function margineInputFromRecord(
  record: Record<string, unknown>,
  importo?: number | null,
  importoBase?: number | null
): MargineScoreInput {
  return {
    margine_stimato: (record.margine_score ??
      record.margine_stimato) as MargineScoreInput["margine_stimato"],
    importo: importo ?? (record.importo as MargineScoreInput["importo"]),
    importo_base: importoBase ?? (record.importo_base as MargineScoreInput["importo_base"]),
    costo_stimato_interno: record.costo_stimato_interno as MargineScoreInput["costo_stimato_interno"],
    ribasso_ipotizzato: record.ribasso_ipotizzato as MargineScoreInput["ribasso_ipotizzato"],
  };
}
