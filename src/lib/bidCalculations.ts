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
  const sum = result.breakdownCosti.reduce((acc, item) => {
    const isUtile = item.categoria.toLowerCase().includes("utile");
    return acc + (isUtile ? 0 : item.importoStimato);
  }, 0);
  const totalCosts = result.costoTotaleStimato;
  if (totalCosts <= 0) return sum === 0;
  return Math.abs(sum - totalCosts) / totalCosts <= tolerance;
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

export type TenderUrgency = "oltre_10" | "3_10" | "sotto_3";
export type CompanySaturation = "bassa" | "media" | "alta";

export interface DynamicPricingInput {
  baseRibasso: number;
  concorrentiAttesi: number;
  urgenza: TenderUrgency;
  saturazione: CompanySaturation;
}

export interface DynamicPricingResult {
  ribassoSuggerito: number;
  aggiustamentoConcorrenza: number;
  aggiustamentoUrgenza: number;
  aggiustamentoSaturazione: number;
}

export interface MonteCarloInput {
  userRibasso: number;
  mu: number;
  sigma?: number;
  iterations?: number;
  maxRibassoSostenibile: number;
  binCount?: number;
  ribassoMin?: number;
  ribassoMax?: number;
}

export interface MonteCarloHistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  heightPercent: number;
}

export interface MonteCarloResult {
  winRate: number;
  wins: number;
  iterations: number;
  mu: number;
  sigma: number;
  histogram: MonteCarloHistogramBin[];
  competitorSamples: number[];
  userRibasso: number;
  maxRibassoSostenibile: number;
}

/** Box-Muller: R = μ + σ · √(−2 ln U₁) · cos(2π U₂) */
export function sampleNormalRibasso(mu: number, sigma: number): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 <= Number.EPSILON) u1 = Math.random();
  while (u2 <= Number.EPSILON) u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

export function clampRibasso(value: number, min = 0, max = 40): number {
  return Math.min(max, Math.max(min, value));
}

export function calcMaxRibassoSostenibile(
  baseRibasso: number,
  productivityDeltaPercent: number
): number {
  const extra = productivityDeltaPercent > 0 ? productivityDeltaPercent : 0;
  return clampRibasso(baseRibasso + extra);
}

export function calcDynamicPricing(input: DynamicPricingInput): DynamicPricingResult {
  const { baseRibasso, concorrentiAttesi, urgenza, saturazione } = input;
  const concorrenti = Math.min(20, Math.max(1, Math.round(concorrentiAttesi)));

  const aggiustamentoConcorrenza = concorrenti > 5 ? (concorrenti - 5) * 0.2 : 0;
  const aggiustamentoUrgenza = urgenza === "sotto_3" ? -0.5 : 0;
  const aggiustamentoSaturazione = saturazione === "alta" ? -1.5 : 0;

  const ribassoSuggerito = clampRibasso(
    baseRibasso + aggiustamentoConcorrenza + aggiustamentoUrgenza + aggiustamentoSaturazione
  );

  return {
    ribassoSuggerito,
    aggiustamentoConcorrenza,
    aggiustamentoUrgenza,
    aggiustamentoSaturazione,
  };
}

function buildHistogram(
  samples: number[],
  binCount: number,
  ribassoMin: number,
  ribassoMax: number
): MonteCarloHistogramBin[] {
  const span = ribassoMax - ribassoMin || 1;
  const bins: MonteCarloHistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const binStart = ribassoMin + (span * i) / binCount;
    const binEnd = ribassoMin + (span * (i + 1)) / binCount;
    return { binStart, binEnd, count: 0, heightPercent: 0 };
  });

  for (const sample of samples) {
    const clamped = clampRibasso(sample, ribassoMin, ribassoMax);
    const idx = Math.min(binCount - 1, Math.floor(((clamped - ribassoMin) / span) * binCount));
    bins[idx].count += 1;
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  return bins.map((b) => ({
    ...b,
    heightPercent: (b.count / maxCount) * 100,
  }));
}

export function runMonteCarloSimulation(input: MonteCarloInput): MonteCarloResult {
  const {
    userRibasso,
    mu,
    sigma = 3,
    iterations = 500,
    maxRibassoSostenibile,
    binCount = 24,
    ribassoMin = 0,
    ribassoMax = 40,
  } = input;

  const competitorSamples: number[] = [];
  let wins = 0;

  for (let i = 0; i < iterations; i += 1) {
    const competitorRibasso = clampRibasso(sampleNormalRibasso(mu, sigma), ribassoMin, ribassoMax);
    competitorSamples.push(competitorRibasso);

    const beatsCompetitor = userRibasso > competitorRibasso;
    const withinInternalFloor = userRibasso <= maxRibassoSostenibile;
    if (beatsCompetitor && withinInternalFloor) wins += 1;
  }

  return {
    winRate: (wins / iterations) * 100,
    wins,
    iterations,
    mu,
    sigma,
    histogram: buildHistogram(competitorSamples, binCount, ribassoMin, ribassoMax),
    competitorSamples,
    userRibasso,
    maxRibassoSostenibile,
  };
}
