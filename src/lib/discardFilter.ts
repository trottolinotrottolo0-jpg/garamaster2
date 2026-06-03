import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import { hasSoaCategoryGap } from "./riskScore";
import { isBidNoGo } from "./watchTodayFilter";

export type DiscardReasonId =
  | "score_basso"
  | "fit_basso"
  | "rischio_alto"
  | "no_go"
  | "gap_soa";

export type DiscardFlag = {
  id: DiscardReasonId;
  label: string;
  priority: number;
};

export function evaluateDiscardFlags(
  gara: Gara,
  profilo: ProfiloImpresaContext | null
): DiscardFlag[] {
  const flags: DiscardFlag[] = [];

  if (gara.score_sintetico < 40) {
    flags.push({
      id: "score_basso",
      label: `Score sintetico basso (${gara.score_sintetico})`,
      priority: 95,
    });
  }

  if (gara.fit_score < 30) {
    flags.push({
      id: "fit_basso",
      label: `Fit insufficiente (${gara.fit_score}%)`,
      priority: 90,
    });
  }

  if (gara.risk_score >= 80) {
    flags.push({
      id: "rischio_alto",
      label: `Rischio elevato (${gara.risk_score})`,
      priority: 88,
    });
  }

  if (isBidNoGo(gara.bid_no_bid)) {
    flags.push({
      id: "no_go",
      label: "Bid/No-Bid: NO-GO",
      priority: 100,
    });
  }

  if (
    hasSoaCategoryGap(
      { categoria: gara.categoria, titolo: gara.titolo },
      profilo
    )
  ) {
    flags.push({
      id: "gap_soa",
      label: "Gap SOA — categoria non in profilo",
      priority: 92,
    });
  }

  return flags.sort((a, b) => b.priority - a.priority);
}

export function getPrimaryDiscardReason(flags: DiscardFlag[]): string {
  return flags[0]?.label ?? "Da valutare";
}

export function isGaraDaScartare(
  gara: Gara,
  profilo: ProfiloImpresaContext | null
): boolean {
  return evaluateDiscardFlags(gara, profilo).length > 0;
}

export type GaraDiscardCandidate = {
  gara: Gara;
  flags: DiscardFlag[];
  primaryReason: string;
};

export function buildDiscardCandidates(
  gare: Gara[],
  profilo: ProfiloImpresaContext | null
): GaraDiscardCandidate[] {
  return gare
    .filter((g) => !g.scartata && isGaraDaScartare(g, profilo))
    .map((gara) => {
      const flags = evaluateDiscardFlags(gara, profilo);
      return {
        gara,
        flags,
        primaryReason: getPrimaryDiscardReason(flags),
      };
    })
    .sort((a, b) => {
      const prio = (c: GaraDiscardCandidate) => c.flags[0]?.priority ?? 0;
      return prio(b) - prio(a);
    });
}
