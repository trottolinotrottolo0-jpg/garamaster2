import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import type { HistoricalTender } from "../types";
import { applyDecisionEngine } from "./calcoli";
import { getTopBlockingFactor, type BlockingFactorId } from "./approfondireFilter";
import { enrichGareWithConvenienza } from "./convenienzaScore";
import { daysUntilDeadline } from "./urgencyScore";

const DEFAULT_MARGINE_NEUTRAL = 45;

/** Input minimo per il calcolo dello score sintetico. */
export type ScoreSinteticoInput = Pick<
  Gara,
  "fit_score" | "margine_stimato" | "risk_score" | "urgency_score" | "carico_score"
>;

/**
 * Score sintetico master (0–100), ranking portfolio.
 * fit 30% · margine 20% · (100−rischio) 20% · urgenza 15% · (100−carico) 15%
 */
export function calcolaScoreSintetico(
  gara: ScoreSinteticoInput,
  _profilo?: ProfiloImpresaContext | null
): number {
  const margine = gara.margine_stimato ?? DEFAULT_MARGINE_NEUTRAL;
  const raw =
    gara.fit_score * 0.3 +
    margine * 0.2 +
    (100 - gara.risk_score) * 0.2 +
    gara.urgency_score * 0.15 +
    (100 - gara.carico_score) * 0.15;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function scoreSinteticoTier(score: number): "alto" | "medio" | "basso" {
  if (score >= 70) return "alto";
  if (score >= 40) return "medio";
  return "basso";
}

export function scoreSinteticoBadgeClasses(score: number): string {
  const tier = scoreSinteticoTier(score);
  switch (tier) {
    case "alto":
      return "text-emerald-300 bg-emerald-950/50 border-emerald-800/50";
    case "medio":
      return "text-amber-300 bg-amber-950/50 border-amber-800/50";
    default:
      return "text-red-300 bg-red-950/60 border-red-800/60";
  }
}

export function formatScoreSinteticoLabel(score: number, compact = false): string {
  return compact ? String(score) : `Score ${score}`;
}

export function sortByScoreSintetico(gare: Gara[], descending = true): Gara[] {
  const sorted = [...gare].sort((a, b) => {
    if (b.score_sintetico !== a.score_sintetico) {
      return b.score_sintetico - a.score_sintetico;
    }
    return b.fit_score - a.fit_score;
  });
  return descending ? sorted : sorted.reverse();
}

const RISK_REASON_PLAIN: Record<BlockingFactorId, string> = {
  soa_gap: "mancano le categorie SOA richieste dal bando",
  fit: "il profilo non è ben allineato alla gara",
  rischio: "ci sono clausole o penali da controllare con attenzione",
  margine: "il margine atteso è basso",
  carico: "le risorse operative potrebbero non bastare",
  storico: "non ci sono gare simili positive nello storico",
  bid_cautela: "la valutazione bid/no-bid è in cautela",
  urgenza: "i tempi per preparare l'offerta sono stretti",
  dati_mancanti: "mancano ancora dati per una valutazione completa",
};

function giorniFinoScadenza(scadenza?: string): number | null {
  if (!scadenza) return null;
  const deadline = new Date(scadenza);
  if (Number.isNaN(deadline.getTime())) return null;
  return daysUntilDeadline(deadline);
}

function fraseUrgenza(gara: Gara): string {
  const giorni = giorniFinoScadenza(gara.scadenza);
  if (giorni == null) {
    return "Scadenza imminente: è il momento di muoversi.";
  }
  if (giorni < 0) {
    return "La scadenza è passata: serve verificare se la gara è ancora aperta.";
  }
  if (giorni === 0) {
    return "Scadenza imminente: azione richiesta entro oggi.";
  }
  if (giorni === 1) {
    return "Scadenza imminente: azione richiesta entro 1 giorno.";
  }
  return `Scadenza imminente: azione richiesta entro ${giorni} giorni.`;
}

function motivoRischioInChiaro(gara: Gara, profilo: ProfiloImpresaContext | null): string {
  const factor = getTopBlockingFactor(gara, profilo);
  return RISK_REASON_PLAIN[factor.id] ?? "servono verifiche su requisiti e documentazione";
}

/**
 * Motivazione leggibile del ranking (max 3 frasi, ultima sempre lo score).
 */
export function generaMotivazione(
  gara: Gara,
  profilo?: ProfiloImpresaContext | null
): string {
  const candidati: { priority: number; text: string }[] = [];

  if (gara.fit_score >= 75) {
    candidati.push({
      priority: 100,
      text: "Ottimo fit con profilo SOA e area geografica.",
    });
  }

  if (gara.urgency_score >= 80) {
    candidati.push({
      priority: 95,
      text: fraseUrgenza(gara),
    });
  }

  if (gara.risk_score >= 70) {
    candidati.push({
      priority: 90,
      text: `Rischio elevato: ${motivoRischioInChiaro(gara, profilo ?? null)}.`,
    });
  }

  if (gara.margine_stimato != null && gara.margine_stimato < 30) {
    candidati.push({
      priority: 85,
      text: "Margine stimato insufficiente.",
    });
  }

  if (gara.carico_score > 70) {
    candidati.push({
      priority: 80,
      text: "Carico operativo alto: verificare disponibilità squadre.",
    });
  }

  candidati.sort((a, b) => b.priority - a.priority);

  const frasi = candidati.slice(0, 2).map((c) => c.text);

  if (frasi.length === 0) {
    frasi.push("Valutazione nella media rispetto al profilo aziendale.");
  }

  frasi.push(`Score complessivo: ${gara.score_sintetico}/100.`);

  return frasi.slice(0, 3).join(" ");
}

/** Applica convenienza/storico e decision engine (score, vista, motivazione). */
export function enrichPortfolioScores(
  gare: Gara[],
  profilo: ProfiloImpresaContext | null,
  historical: HistoricalTender[] = []
): Gara[] {
  const enriched = enrichGareWithConvenienza(gare, historical);
  return enriched.map((gara) => applyDecisionEngine(gara, profilo));
}
