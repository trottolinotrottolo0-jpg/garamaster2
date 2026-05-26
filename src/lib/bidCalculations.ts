import type { ProfitabilityVerdict, ProfitabilityGateResult } from "../types";

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
