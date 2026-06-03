import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import type { CompanyProfile } from "../types";

export const CARICO_ALTO_THRESHOLD = 70;

export type ProfiloCapacity = {
  squadreDisponibili: number;
  mezziDisponibili: number;
};

export type CaricoScoreInput = {
  carico_operativo?: number | string | null;
  importo?: number | string | null;
  importo_base?: number | string | null;
  durata_mesi?: number | string | null;
  durata_settimane?: number | string | null;
  squadre_richieste?: number | string | null;
  scadenza?: string | null;
  data_inizio?: string | null;
};

function parseNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  const cleaned = String(value).replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Capacità da `profili_impresa` (squadre/mezzi) con fallback profilo locale app. */
export function resolveProfiloCapacity(
  profilo: ProfiloImpresaContext | null,
  company?: CompanyProfile | null
): ProfiloCapacity {
  let squadre = profilo?.squadreDisponibili;
  let mezzi = profilo?.mezziDisponibili;

  if ((squadre == null || squadre <= 0) && company) {
    const jobsites = company.activeJobsites ?? 0;
    squadre = Math.max(1, Math.round((company.activeSquads ?? 1) - jobsites * 1.2));
  }

  if ((mezzi == null || mezzi <= 0) && company?.availableResources?.length) {
    mezzi = company.availableResources.filter(
      (r) =>
        r.availability === "disponibile" ||
        r.availability === "parzialmente_disponibile"
    ).length;
  }

  return {
    squadreDisponibili: Math.max(1, squadre ?? 4),
    mezziDisponibili: Math.max(1, mezzi ?? 2),
  };
}

export function estimateSquadreRichieste(importo: number | null): number {
  if (importo == null || importo <= 0) return 1;
  return Math.max(1, Math.ceil(importo / 500_000));
}

export function estimateDurataMesi(input: CaricoScoreInput): number {
  const stored = parseNum(input.durata_mesi);
  if (stored != null && stored > 0) return stored;

  const weeks = parseNum(input.durata_settimane);
  if (weeks != null && weeks > 0) return weeks / 4.33;

  if (input.data_inizio && input.scadenza) {
    const start = new Date(String(input.data_inizio));
    const end = new Date(String(input.scadenza));
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      const months =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      if (months > 0) return Math.min(48, months);
    }
  }

  const importo = parseNum(input.importo) ?? parseNum(input.importo_base);
  if (importo != null && importo > 0) {
    return Math.max(3, Math.min(36, importo / 100_000));
  }

  return 6;
}

/**
 * Carico operativo 0–100: quota di capacità impresa assorbita dalla gara.
 * Usa `carico_operativo` da DB se presente, altrimenti stima da squadre, durata, importo.
 */
export function computeCaricoScore(
  input: CaricoScoreInput,
  profilo: ProfiloImpresaContext | null,
  company?: CompanyProfile | null
): number {
  const stored = parseNum(input.carico_operativo);
  if (stored != null && stored >= 0) {
    return Math.round(Math.min(100, Math.max(0, stored)));
  }

  const capacity = resolveProfiloCapacity(profilo, company);
  const importo = parseNum(input.importo) ?? parseNum(input.importo_base) ?? 0;
  const squadreRichieste =
    parseNum(input.squadre_richieste) ?? estimateSquadreRichieste(importo);
  const durataMesi = estimateDurataMesi(input);

  const squadreLoad = (squadreRichieste / capacity.squadreDisponibili) * 100;
  const mezziRichiesti = Math.max(1, Math.ceil(squadreRichieste * 0.5));
  const mezziLoad = (mezziRichiesti / capacity.mezziDisponibili) * 100;

  const fatturato = parseNum(profilo?.fatturatoTriennale);
  const capacitaImporto =
    fatturato != null && fatturato > 0
      ? fatturato / 3
      : (company?.targetImportMax ?? 2_000_000);
  const importoLoad =
    capacitaImporto > 0 && importo > 0 ? (importo / capacitaImporto) * 100 : 35;

  const durataLoad = Math.min(100, (durataMesi / 18) * 100);

  const composite =
    squadreLoad * 0.45 + mezziLoad * 0.15 + importoLoad * 0.25 + durataLoad * 0.15;

  return Math.round(Math.min(100, Math.max(0, composite)));
}

export function isCaricoAlto(score: number): boolean {
  return score > CARICO_ALTO_THRESHOLD;
}

export type CaricoSortDirection = "asc" | "desc";

export function sortByCarico(gare: Gara[], direction: CaricoSortDirection = "asc"): Gara[] {
  const sorted = [...gare].sort((a, b) => {
    if (a.carico_score !== b.carico_score) {
      return a.carico_score - b.carico_score;
    }
    return a.fit_score - b.fit_score;
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

export function caricoBarColor(score: number): string {
  if (score > CARICO_ALTO_THRESHOLD) return "bg-red-500";
  if (score > 45) return "bg-amber-500";
  return "bg-emerald-500";
}

export function caricoInputFromRecord(
  record: Record<string, unknown>,
  importo?: number | null,
  scadenza?: string
): CaricoScoreInput {
  return {
    carico_operativo: record.carico_operativo as CaricoScoreInput["carico_operativo"],
    importo: importo ?? (record.importo as CaricoScoreInput["importo"]),
    importo_base: record.importo_base as CaricoScoreInput["importo_base"],
    durata_mesi: (record.durata_mesi ?? record.durata_gara_mesi) as CaricoScoreInput["durata_mesi"],
    durata_settimane: (record.durata_settimane ??
      record.durata_gara_settimane) as CaricoScoreInput["durata_settimane"],
    squadre_richieste: record.squadre_richieste as CaricoScoreInput["squadre_richieste"],
    scadenza,
    data_inizio: (record.data_inizio ?? record.data_pubblicazione) as CaricoScoreInput["data_inizio"],
  };
}
