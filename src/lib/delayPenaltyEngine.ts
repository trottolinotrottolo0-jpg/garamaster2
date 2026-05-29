import type {
  TenderDocument,
  PenaltyClause,
  CompanyDelayProfile,
  DelayPenaltyExposure,
  DelayRiskIndicator,
  DelayRiskClasse,
} from "../types";

function parseTenderImporto(value: string): number {
  const cleaned = value.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export function extractPenaltyClausesFromTender(tender: TenderDocument): PenaltyClause[] {
  const clauses: PenaltyClause[] = [];
  let idx = 0;

  for (const penalty of tender.penalties ?? []) {
    const lc = penalty.toLowerCase();
    const importo = parseTenderImporto(tender.value);

    if (lc.includes("ritardo") || lc.includes("giorno")) {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "ritardo_esecuzione",
        descrizione: penalty,
        importoGiornaliero: importo * 0.001,
        giorniTolleranza: 5,
        importoMassimo: importo * 0.1,
      });
    } else if (lc.includes("inadempimento") || lc.includes("rescissione")) {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "inadempimento",
        descrizione: penalty,
        importoFisso: importo * 0.05,
        giorniTolleranza: 0,
      });
    } else if (lc.includes("qualità") || lc.includes("difetto")) {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "qualita",
        descrizione: penalty,
        percentualeImporto: 2,
        giorniTolleranza: 0,
      });
    } else {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "altro",
        descrizione: penalty,
        percentualeImporto: 1,
        giorniTolleranza: 10,
      });
    }
  }

  if (clauses.length === 0) {
    const importo = parseTenderImporto(tender.value);
    clauses.push({
      id: "pen-default",
      tipo: "ritardo_esecuzione",
      descrizione: "Penale standard per ritardo esecuzione (1‰/giorno fino al 10%)",
      importoGiornaliero: importo * 0.001,
      giorniTolleranza: 5,
      importoMassimo: importo * 0.1,
    });
  }

  return clauses;
}

export function calculatePenalty(
  clause: PenaltyClause,
  giorniRitardo: number,
  importoContratto: number
): number {
  const giorniEccesso = Math.max(0, giorniRitardo - clause.giorniTolleranza);
  if (giorniEccesso === 0) return 0;

  let penale = 0;
  if (clause.importoGiornaliero) {
    penale = clause.importoGiornaliero * giorniEccesso;
  } else if (clause.importoFisso) {
    penale = clause.importoFisso;
  } else if (clause.percentualeImporto) {
    penale = (importoContratto * clause.percentualeImporto) / 100;
  }

  if (clause.importoMassimo) {
    penale = Math.min(penale, clause.importoMassimo);
  }

  return penale;
}

export function classifyDelayRisk(
  penalitaAttesa: number,
  margineStimato: number
): DelayRiskClasse {
  if (margineStimato <= 0) return "CRITICO";
  const ratio = penalitaAttesa / margineStimato;
  if (ratio < 0.1) return "BASSO";
  if (ratio < 0.3) return "MEDIO";
  if (ratio < 0.7) return "ALTO";
  return "CRITICO";
}

export function generateMitigationStrategies(
  exposure: Omit<DelayPenaltyExposure, "mitigazioni" | "generatedAt">
): string[] {
  const strats: string[] = [];
  if (exposure.riskClasse === "CRITICO" || exposure.riskClasse === "ALTO") {
    strats.push("Negoziare dilazione penali o franchigia contrattuale prima della firma");
    strats.push("Inserire clausola revisione prezzi per cause di forza maggiore");
    strats.push("Allocare buffer temporale del 15% sulla cronoprogramma");
  }
  strats.push("Attivare monitoraggio settimanale avanzamento lavori vs. cronoprogramma");
  strats.push("Identificare subappaltatori di riserva per attività critiche");
  if (exposure.penaltyClauses.some((c) => c.tipo === "qualita")) {
    strats.push("Implementare sistema di controllo qualità in corso d'opera");
  }
  const impattoCumulativo = Math.min(
    (exposure.penalitaWorstCase / Math.max(exposure.margineDopoRitardo, 1)) * 100,
    100
  );
  if (impattoCumulativo > 50) {
    strats.push("Valutare polizza assicurativa rischio penali contrattuali");
  }
  return strats;
}

export function buildDelayRiskIndicators(
  tender: TenderDocument,
  delayProfile: CompanyDelayProfile
): DelayRiskIndicator[] {
  const importo = parseTenderImporto(tender.value);
  const indicators: DelayRiskIndicator[] = [
    {
      fattore: "Storico ritardi azienda",
      peso: 0.3,
      valore: delayProfile.percentualeGareConRitardo / 100,
      contributo: (delayProfile.percentualeGareConRitardo / 100) * 0.3,
    },
    {
      fattore: "Complessità gara",
      peso: 0.25,
      valore: importo > 2_000_000 ? 0.8 : importo > 500_000 ? 0.5 : 0.3,
      contributo:
        (importo > 2_000_000 ? 0.8 : importo > 500_000 ? 0.5 : 0.3) * 0.25,
    },
    {
      fattore: "Severità penali",
      peso: 0.25,
      valore: tender.penalties.length > 3 ? 0.9 : tender.penalties.length > 1 ? 0.6 : 0.3,
      contributo:
        (tender.penalties.length > 3 ? 0.9 : tender.penalties.length > 1 ? 0.6 : 0.3) * 0.25,
    },
    {
      fattore: "Anomalie contrattuali",
      peso: 0.2,
      valore: tender.anomalies.length > 2 ? 0.8 : tender.anomalies.length > 0 ? 0.5 : 0.1,
      contributo:
        (tender.anomalies.length > 2 ? 0.8 : tender.anomalies.length > 0 ? 0.5 : 0.1) * 0.2,
    },
  ];
  return indicators;
}

export function createDelayPenaltyExposure(
  tender: TenderDocument,
  margineStimato: number = 100_000,
  delayProfile?: CompanyDelayProfile
): DelayPenaltyExposure {
  const profile = delayProfile ?? {
    mediaGiorniRitardo: 15,
    percentualeGareConRitardo: 25,
    ritardoMaxStorico: 45,
    causeRitardoFrequenti: ["Meteo avverso", "Problemi fornitura materiali"],
  };

  const importo = parseTenderImporto(tender.value);
  const penaltyClauses = extractPenaltyClausesFromTender(tender);
  const riskIndicators = buildDelayRiskIndicators(tender, profile);

  const giorniRitardoProbabili = Math.round(profile.mediaGiorniRitardo * 1.2);
  const penalitaAttesa = penaltyClauses.reduce(
    (sum, c) => sum + calculatePenalty(c, giorniRitardoProbabili, importo),
    0
  );
  const penalitaWorstCase = penaltyClauses.reduce(
    (sum, c) => sum + calculatePenalty(c, profile.ritardoMaxStorico, importo),
    0
  );
  const margineDopoRitardo = margineStimato - penalitaAttesa;
  const riskClasse = classifyDelayRisk(penalitaAttesa, margineStimato);

  const partial: Omit<DelayPenaltyExposure, "mitigazioni" | "generatedAt"> = {
    gara: tender,
    penaltyClauses,
    giorniRitardoProbabili,
    penalitaAttesa,
    penalitaWorstCase,
    margineDopoRitardo,
    riskIndicators,
    riskClasse,
  };

  return {
    ...partial,
    mitigazioni: generateMitigationStrategies(partial),
    generatedAt: new Date().toISOString(),
  };
}

export function calculateDelayAdjustedBidPrice(
  prezzoBase: number,
  exposure: DelayPenaltyExposure
): number {
  const premium =
    exposure.riskClasse === "CRITICO"
      ? exposure.penalitaAttesa * 1.5
      : exposure.riskClasse === "ALTO"
      ? exposure.penalitaAttesa * 1.2
      : exposure.penalitaAttesa * 0.5;
  return prezzoBase + premium;
}

export const DELAY_RISK_CLASS: Record<DelayRiskClasse, string> = {
  BASSO: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  MEDIO: "text-blue-400 border-blue-800 bg-blue-950/40",
  ALTO: "text-amber-400 border-amber-800 bg-amber-950/40",
  CRITICO: "text-red-400 border-red-800 bg-red-950/40",
};
