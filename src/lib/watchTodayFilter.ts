import type { BidNoBidStatus, Gara } from "../types/gara";
import { daysUntilDeadline } from "./urgencyScore";

export function normalizeBidNoBid(value: unknown): BidNoBidStatus {
  if (value == null || value === "") return null;
  const raw = String(value).toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (raw.includes("NO") && raw.includes("GO")) return "NO-GO";
  if (raw === "GO" || raw.startsWith("GO ")) return "GO";
  if (raw.includes("CAUTELA")) return "CAUTELA";
  return null;
}

export function isBidNoGo(status: BidNoBidStatus | undefined): boolean {
  return status === "NO-GO";
}

/** Scadenza entro 7 giorni (urgency ≥ 70) oppure score sintetico alto. */
export function meetsUrgencyOrSynthetic(gara: Gara): boolean {
  return gara.urgency_score >= 70 || gara.score_sintetico >= 80;
}

export function isGaraDaGuardareOggi(gara: Gara): boolean {
  if (gara.fit_score < 75) return false;
  if (!meetsUrgencyOrSynthetic(gara)) return false;
  if (isBidNoGo(gara.bid_no_bid)) return false;
  return true;
}

export function filterGareDaGuardareOggi(gare: Gara[]): Gara[] {
  return gare
    .filter(isGaraDaGuardareOggi)
    .sort((a, b) => {
      if (b.score_sintetico !== a.score_sintetico) {
        return b.score_sintetico - a.score_sintetico;
      }
      return b.urgency_score - a.urgency_score;
    });
}

export function formatScadenzaCountdown(scadenza?: string): string {
  if (!scadenza) return "Scadenza da definire";
  const deadline = new Date(scadenza);
  if (Number.isNaN(deadline.getTime())) return scadenza;

  const giorni = daysUntilDeadline(deadline);
  if (giorni < 0) return `Scaduta da ${Math.abs(giorni)}g`;
  if (giorni === 0) return "Scade oggi";
  if (giorni === 1) return "Scade domani";
  return `Scade tra ${giorni}g`;
}

export type GaraTag = { id: string; label: string };

const TAG_RULES: Array<{
  id: string;
  label: string | ((g: Gara) => string);
  priority: number;
  when: (g: Gara) => boolean;
}> = [
  {
    id: "urgente",
    label: "Urgente",
    priority: 100,
    when: (g) => g.urgency_score >= 70,
  },
  {
    id: "fit-alto",
    label: "Fit alto",
    priority: 90,
    when: (g) => g.fit_score >= 75,
  },
  {
    id: "conv-alta",
    label: (g) => `Conv. ${g.convenienza_score}%`,
    priority: 85,
    when: (g) => g.convenienza_score >= 70,
  },
  {
    id: "margine",
    label: (g) => `Marg. ${Math.round(g.margine_stimato!)}%`,
    priority: 70,
    when: (g) => g.margine_stimato != null && g.margine_stimato >= 12,
  },
  {
    id: "go",
    label: "GO",
    priority: 65,
    when: (g) => g.bid_no_bid === "GO",
  },
  {
    id: "cautela",
    label: "Cautela",
    priority: 60,
    when: (g) => g.bid_no_bid === "CAUTELA",
  },
  {
    id: "regione",
    label: (g) => g.regione!.slice(0, 18),
    priority: 40,
    when: (g) => Boolean(g.regione?.trim()),
  },
  {
    id: "soa",
    label: (g) => g.categoria!.slice(0, 14),
    priority: 35,
    when: (g) => Boolean(g.categoria?.trim()),
  },
];

export function buildTopTags(gara: Gara, max = 2): GaraTag[] {
  const matched = TAG_RULES.filter((rule) => rule.when(gara))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, max);

  return matched.map((rule) => ({
    id: rule.id,
    label: typeof rule.label === "function" ? rule.label(gara) : rule.label,
  }));
}

export function pickEnte(
  enteAppaltante?: string | null,
  stazioneAppaltante?: string | null
): string | undefined {
  const ente = (enteAppaltante ?? stazioneAppaltante ?? "").trim();
  return ente || undefined;
}

export function resolveBidNoBidFromRow(record: Record<string, unknown>): BidNoBidStatus {
  const direct =
    record.bid_no_bid ??
    record.bid_no_bid_status ??
    record.decisione_bid ??
    record.decision_bid;
  const normalized = normalizeBidNoBid(direct);
  if (normalized) return normalized;

  return normalizeBidNoBid(record.stato_pratica);
}
