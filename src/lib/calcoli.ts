import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import { calcolaVistaPortfolio } from "./portfolioVista";
import type { VistaPortfolio } from "../types/gara";
import {
  calcolaScoreSintetico,
  generaMotivazione,
  type ScoreSinteticoInput,
} from "./scoring";

export type { ScoreSinteticoInput };

export type DecisionEngineResult = {
  score_sintetico: number;
  vista_portfolio: VistaPortfolio;
  motivazione_ranking: string;
};

/**
 * Motore decisionale portfolio: score sintetico, vista e motivazione.
 * Base per persistenza su `gare` (Supabase).
 */
export function calcolaDecisionEngine(
  gara: ScoreSinteticoInput & Pick<Gara, "scartata">,
  profilo?: ProfiloImpresaContext | null
): DecisionEngineResult {
  const score_sintetico = calcolaScoreSintetico(gara, profilo);
  const vista_portfolio = calcolaVistaPortfolio(score_sintetico, Boolean(gara.scartata));
  const withScore: Gara = {
    ...(gara as Gara),
    score_sintetico,
    vista_portfolio,
  };
  const motivazione_ranking = generaMotivazione(withScore, profilo ?? null);
  return { score_sintetico, vista_portfolio, motivazione_ranking };
}

/** Applica decision engine su una Gara (score, vista, motivazione). */
export function applyDecisionEngine(
  gara: Gara,
  profilo?: ProfiloImpresaContext | null
): Gara {
  const decision = calcolaDecisionEngine(gara, profilo);
  return { ...gara, ...decision };
}
