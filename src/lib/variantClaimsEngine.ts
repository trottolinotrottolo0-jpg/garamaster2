import type {
  TenderDocument,
  VariantClause,
  ClaimsClause,
  CompanyVariantHistory,
  VariantRiskExposure,
  VariantClaimsRiskIndicator,
  VariantRiskClasse,
} from "../types";

function parseTenderImporto(value: string): number {
  const cleaned = value.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export function extractVariantClausesFromTender(tender: TenderDocument): VariantClause[] {
  const clauses: VariantClause[] = [];
  const anomaliesAndPenalties = [...tender.anomalies, ...tender.penalties];

  for (const item of anomaliesAndPenalties) {
    const lc = item.toLowerCase();
    if (lc.includes("variant")) {
      clauses.push({
        id: `var-${clauses.length}`,
        tipoVariante: "variante migliorativa",
        descrizione: item,
        percentualeMassima: 20,
        approvazioneDirettore: true,
        giustificazioneRichiesta: true,
        articoloRiferimento: "Art. 120 D.Lgs. 36/2023",
      });
    }
  }

  if (clauses.length === 0) {
    clauses.push({
      id: "var-default",
      tipoVariante: "variante per cause impreviste",
      descrizione: "Varianti ammesse per cause impreviste ex art. 120 D.Lgs. 36/2023",
      percentualeMassima: 20,
      approvazioneDirettore: true,
      giustificazioneRichiesta: true,
      articoloRiferimento: "Art. 120 D.Lgs. 36/2023",
    });
  }

  return clauses;
}

export function extractClaimsClausesFromTender(tender: TenderDocument): ClaimsClause[] {
  return [
    {
      id: "claim-default",
      tipoReclamo: "riserva contrattuale",
      descrizione: "Riserve iscritte nel registro di contabilità per eventi imprevedibili",
      terminePresentazione: 15,
      proceduraPresentazione: "Iscrizione nel registro di contabilità",
      articoloRiferimento: "Art. 200 D.Lgs. 36/2023",
    },
    {
      id: "claim-002",
      tipoReclamo: "claim per variazione prezzi",
      descrizione: "Claim per revisione prezzi in caso di aumento materiali > 5%",
      terminePresentazione: 30,
      articoloRiferimento: "Art. 60 D.Lgs. 36/2023",
    },
  ];
}

export function classifyVariantRisk(
  esposizioneTotale: number,
  importoContratto: number
): VariantRiskClasse {
  if (importoContratto <= 0) return "MEDIO";
  const pct = esposizioneTotale / importoContratto;
  if (pct < 0.05) return "BASSO";
  if (pct < 0.12) return "MEDIO";
  if (pct < 0.25) return "ALTO";
  return "CRITICO";
}

export function buildVariantRiskIndicators(
  tender: TenderDocument,
  variantClauses: VariantClause[]
): VariantClaimsRiskIndicator[] {
  const anomalieCount = tender.anomalies.length;
  return [
    {
      fattore: "Presenza clausole varianti",
      livello: variantClauses.length > 2 ? "ALTO" : variantClauses.length > 0 ? "MEDIO" : "BASSO",
      note: `${variantClauses.length} clausole variante rilevate`,
    },
    {
      fattore: "Anomalie contrattuali correlate",
      livello: anomalieCount > 3 ? "ALTO" : anomalieCount > 1 ? "MEDIO" : "BASSO",
      note: `${anomalieCount} anomalie rilevate nel disciplinare`,
    },
    {
      fattore: "Complessità tecnica gara",
      livello: tender.category?.includes("OS") ? "ALTO" : "MEDIO",
      note: `Categoria: ${tender.category ?? "N/D"}`,
    },
  ];
}

export function createVariantClaimsRiskExposure(
  tender: TenderDocument,
  variantHistory?: CompanyVariantHistory
): VariantRiskExposure {
  const history = variantHistory ?? {
    percentualeVariantiStoria: 12,
    percentualeClaimsApprovati: 45,
    importoMedioVarianti: 50_000,
  };

  const importo = parseTenderImporto(tender.value);
  const variantClauses = extractVariantClausesFromTender(tender);
  const claimsClauses = extractClaimsClausesFromTender(tender);

  const importoVariantiAtteso = (importo * history.percentualeVariantiStoria) / 100;
  const importoVariantiNnegatteAtteso =
    importoVariantiAtteso * (1 - history.percentualeClaimsApprovati / 100);
  const claimsNonApprovati =
    importo * 0.03 * (1 - history.percentualeClaimsApprovati / 100);
  const esposizioneTotale = importoVariantiNnegatteAtteso + claimsNonApprovati;
  const riskClasse = classifyVariantRisk(esposizioneTotale, importo);

  const strategie: string[] = [
    "Analizzare clausole varianti con legale specializzato prima della firma",
    "Documentare ogni variazione con perizia fotografica e relazione tecnica",
    "Iscrivere riserve nel registro contabilità entro i termini contrattuali",
  ];
  if (riskClasse === "ALTO" || riskClasse === "CRITICO") {
    strategie.push("Negoziare percentuale massima varianti al 25% in sede di offerta");
    strategie.push("Attivare consulenza legale dedicata per gestione claim");
  }

  return {
    gara: tender,
    variantClauses,
    claimsClauses,
    importoVariantiAtteso,
    importoVariantiNnegatteAtteso,
    claimsNonApprovati,
    esposizioneTotale,
    riskClasse,
    strategie,
    generatedAt: new Date().toISOString(),
  };
}

export function calculateVariantAdjustedBidPrice(
  prezzoBase: number,
  exposure: VariantRiskExposure
): number {
  const variantRiskPremium =
    exposure.riskClasse === "CRITICO" ? exposure.esposizioneTotale * 0.5 : exposure.esposizioneTotale * 0.25;
  const claimsRiskPremium = exposure.claimsNonApprovati * 0.3;
  return prezzoBase + variantRiskPremium + claimsRiskPremium;
}

export const VARIANT_RISK_CLASS: Record<VariantRiskClasse, string> = {
  BASSO: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  MEDIO: "text-blue-400 border-blue-800 bg-blue-950/40",
  ALTO: "text-amber-400 border-amber-800 bg-amber-950/40",
  CRITICO: "text-red-400 border-red-800 bg-red-950/40",
};
