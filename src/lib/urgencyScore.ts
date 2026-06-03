import type { Gara } from "../types/gara";

function parseDeadline(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Giorni fino a scadenza (0 = oggi, negativo = scaduta). */
export function daysUntilDeadline(deadline: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Urgenza da `data_scadenza` (o fallback scadenza), relativa a oggi.
 * 100 ≤3g · 80 ≤7g · 60 ≤14g · 40 ≤30g · 20 oltre · 0 senza data
 */
export function computeUrgencyScore(
  dataScadenza: string | null | undefined
): number {
  const deadline = parseDeadline(dataScadenza);
  if (!deadline) return 0;

  const giorni = daysUntilDeadline(deadline);

  if (giorni <= 3) return 100;
  if (giorni <= 7) return 80;
  if (giorni <= 14) return 60;
  if (giorni <= 30) return 40;
  return 20;
}

export function sortByUrgency(gare: Gara[]): Gara[] {
  return [...gare].sort((a, b) => {
    if (b.urgency_score !== a.urgency_score) {
      return b.urgency_score - a.urgency_score;
    }
    return b.fit_score - a.fit_score;
  });
}

export type UrgencyTier = "critical" | "high" | "medium" | "low" | "minimal" | "none";

export function urgencyTier(score: number): UrgencyTier {
  if (score >= 100) return "critical";
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  if (score >= 40) return "low";
  if (score >= 20) return "minimal";
  return "none";
}

export function urgencyBadgeClasses(score: number): string {
  const tier = urgencyTier(score);
  switch (tier) {
    case "critical":
      return "text-red-300 bg-red-950/60 border-red-800/60";
    case "high":
      return "text-orange-300 bg-orange-950/60 border-orange-800/60";
    case "medium":
      return "text-yellow-300 bg-yellow-950/50 border-yellow-800/50";
    case "low":
      return "text-lime-300 bg-lime-950/40 border-lime-800/50";
    case "minimal":
      return "text-emerald-300 bg-emerald-950/40 border-emerald-800/50";
    default:
      return "text-slate-500 bg-neutral-900 border-neutral-800";
  }
}

export function urgencyLabel(
  score: number,
  dataScadenza: string | null | undefined
): string {
  if (score === 0) return "—";
  const deadline = parseDeadline(dataScadenza);
  if (!deadline) return "—";

  const giorni = daysUntilDeadline(deadline);
  if (giorni < 0) return "Scaduta";
  if (giorni === 0) return "Oggi";
  if (giorni === 1) return "1g";
  return `${giorni}g`;
}
