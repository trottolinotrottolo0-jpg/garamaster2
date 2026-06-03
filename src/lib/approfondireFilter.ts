import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import {
  extractRequiredSoaTokens,
  hasSoaCategoryGap,
} from "./riskScore";

export const SCORE_APPROFONDIRE_MIN = 40;
export const SCORE_APPROFONDIRE_MAX = 74;

export type BlockingFactorId =
  | "soa_gap"
  | "fit"
  | "rischio"
  | "margine"
  | "carico"
  | "storico"
  | "bid_cautela"
  | "urgenza"
  | "dati_mancanti";

export type BlockingFactor = {
  id: BlockingFactorId;
  label: string;
  penalty: number;
  suggestedAction: string;
};

export function isGaraDaApprofondire(gara: Gara): boolean {
  return (
    gara.score_sintetico >= SCORE_APPROFONDIRE_MIN &&
    gara.score_sintetico <= SCORE_APPROFONDIRE_MAX
  );
}

export function evaluateBlockingFactors(
  gara: Gara,
  profilo: ProfiloImpresaContext | null
): BlockingFactor[] {
  const factors: BlockingFactor[] = [];
  const requiredSoa = extractRequiredSoaTokens(gara.categoria, gara.titolo);

  if (hasSoaCategoryGap({ categoria: gara.categoria, titolo: gara.titolo }, profilo)) {
    const token = requiredSoa[0] ?? gara.categoria?.slice(0, 12) ?? "richiesta";
    factors.push({
      id: "soa_gap",
      label: `Gap SOA — ${requiredSoa.length ? requiredSoa.join(", ") : "categoria da verificare"}`,
      penalty: 38,
      suggestedAction: `Verifica SOA ${token}`,
    });
  }

  if (gara.fit_score < 72) {
    factors.push({
      id: "fit",
      label: `Fit profilo non ottimale (${gara.fit_score}%)`,
      penalty: Math.max(8, 72 - gara.fit_score),
      suggestedAction: "Allinea profilo SOA, regioni e fascia importo",
    });
  }

  if (gara.risk_score >= 50) {
    factors.push({
      id: "rischio",
      label: `Rischio documentale/operativo (${gara.risk_score})`,
      penalty: Math.min(40, gara.risk_score - 40),
      suggestedAction: "Analizza clausole e penali nel disciplinare",
    });
  }

  const margine = gara.margine_stimato;
  if (margine == null) {
    factors.push({
      id: "margine",
      label: "Margine stimato non calcolabile",
      penalty: 22,
      suggestedAction: "Inserisci costo stimato e ribasso ipotizzato",
    });
  } else if (margine < 10) {
    factors.push({
      id: "margine",
      label: `Margine stimato basso (${margine}%)`,
      penalty: 18,
      suggestedAction: "Ricalcola pricing e costi interni",
    });
  }

  if (gara.carico_score >= 55) {
    factors.push({
      id: "carico",
      label: `Carico operativo elevato (${gara.carico_score}%)`,
      penalty: Math.min(30, gara.carico_score - 45),
      suggestedAction: "Controlla disponibilità squadre e mezzi",
    });
  }

  const storico = gara.storico_match ?? 50;
  if (storico < 48) {
    factors.push({
      id: "storico",
      label: `Pochi precedenti simili (${storico}%)`,
      penalty: 50 - storico,
      suggestedAction: "Consulta storico gare e referenze categoria",
    });
  }

  if (gara.bid_no_bid === "CAUTELA") {
    factors.push({
      id: "bid_cautela",
      label: "Bid/No-Bid in cautela",
      penalty: 20,
      suggestedAction: "Completa analisi Bid/No-Bid dedicata",
    });
  }

  if (gara.urgency_score >= 60 && gara.urgency_score < 80) {
    factors.push({
      id: "urgenza",
      label: "Scadenza in avvicinamento",
      penalty: 12,
      suggestedAction: "Verifica tempi per offerta e documentazione",
    });
  }

  if (factors.length === 0) {
    factors.push({
      id: "dati_mancanti",
      label: "Score in fascia intermedia — dati da completare",
      penalty: 10,
      suggestedAction: "Approfondisci disciplinare e profilo impresa",
    });
  }

  return factors.sort((a, b) => b.penalty - a.penalty);
}

export function getTopBlockingFactor(
  gara: Gara,
  profilo: ProfiloImpresaContext | null
): BlockingFactor {
  return evaluateBlockingFactors(gara, profilo)[0];
}

export type GaraApprofondireCandidate = {
  gara: Gara;
  blockingFactor: BlockingFactor;
  suggestedAction: string;
};

export function buildApprofondireCandidates(
  gare: Gara[],
  profilo: ProfiloImpresaContext | null
): GaraApprofondireCandidate[] {
  return gare
    .filter(isGaraDaApprofondire)
    .map((gara) => {
      const blockingFactor = getTopBlockingFactor(gara, profilo);
      return {
        gara,
        blockingFactor,
        suggestedAction: blockingFactor.suggestedAction,
      };
    })
    .sort((a, b) => a.gara.score_sintetico - b.gara.score_sintetico);
}
