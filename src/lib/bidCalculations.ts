import type { ProfitabilityVerdict, ProfitabilityGateResult } from "../types";

export interface PricingLineItem {
  codice: string;
  descrizione: string;
  um: string;
  qta: number;
  prezzoPrezzario: number;
  produttivita: number;
}

export interface ProductivityImpactSummary {
  totalePrezzario: number;
  totaleInternoReale: number;
  deltaEuro: number;
  deltaPercentTender: number;
}

export function calcImportoOfferto(importoGara: number, ribassoPercent: number): number {
  return importoGara * (1 - ribassoPercent / 100);
}

export function calcMargine(
  importoOfferto: number,
  avgMarginPercent: number,
  incidenzaSpeseGenerali: number,
  incidenzaRischioMedio: number
): { margineEuro: number; marginePercent: number } {
  const costiStimati =
    importoOfferto * (1 - avgMarginPercent / 100) +
    importoOfferto * (incidenzaSpeseGenerali / 100) +
    importoOfferto * (incidenzaRischioMedio / 100);
  const margineEuro = importoOfferto - costiStimati;
  const marginePercent = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;
  return { margineEuro, marginePercent };
}

export function determineProfitabilityVerdict(
  marginePercent: number,
  minMargineAccettabile: number
): ProfitabilityVerdict {
  if (marginePercent >= minMargineAccettabile + 5) return "PROFITTEVOLE";
  if (marginePercent >= minMargineAccettabile) return "BORDERLINE";
  return "PERICOLOSA";
}

export function validateBreakdownSum(result: ProfitabilityGateResult, tolerance = 0.05): boolean {
  const sum = result.breakdownCosti.reduce((acc, item) => acc + item.importoStimato, 0);
  const importoOfferto = result.costoTotaleStimato;
  return Math.abs(sum - importoOfferto) / importoOfferto <= tolerance;
}

export function parseTenderValue(valueStr: string): number {
  const cleaned = valueStr
    .replace(/[€\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export function calcPrezzarioCost(item: Pick<PricingLineItem, "qta" | "prezzoPrezzario">): number {
  return item.qta * item.prezzoPrezzario;
}

export function calcInternalRealCost(
  item: Pick<PricingLineItem, "qta" | "prezzoPrezzario" | "produttivita">
): number {
  return item.qta * item.prezzoPrezzario * (item.produttivita / 100);
}

export function calcProductivityImpact(
  items: Array<Pick<PricingLineItem, "qta" | "prezzoPrezzario" | "produttivita">>,
  importoBaseAsta: number
): ProductivityImpactSummary {
  const totalePrezzario = items.reduce((acc, item) => acc + calcPrezzarioCost(item), 0);
  const totaleInternoReale = items.reduce((acc, item) => acc + calcInternalRealCost(item), 0);
  const deltaEuro = totalePrezzario - totaleInternoReale;
  const deltaPercentTender = importoBaseAsta > 0 ? (deltaEuro / importoBaseAsta) * 100 : 0;

  return {
    totalePrezzario,
    totaleInternoReale,
    deltaEuro,
    deltaPercentTender,
  };
}
