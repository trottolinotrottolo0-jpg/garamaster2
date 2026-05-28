import type {
  ProfitabilityVerdict,
  ProfitabilityGateResult,
  PricingLineItem,
  VocePrezzario,
  Prezzario,
  ScorporoResult,
  MappingVociSimilari,
  ComputoMetricoVoce,
  ColllegamentoComputoPrezzario,
  TenderDocument,
} from "../types";

export type { ScorporoResult, MappingVociSimilari };

export type { PricingLineItem };

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

export function calcPrezzarioCost(item: Pick<PricingLineItem, "qta" | "prezzo">): number {
  return item.qta * item.prezzo;
}

export function calcInternalRealCost(
  item: Pick<PricingLineItem, "qta" | "prezzo" | "produttivita">
): number {
  return item.qta * item.prezzo * (item.produttivita / 100);
}

export interface PrezzarioCategoriaSummary {
  categoria: string;
  numeroVoci: number;
  sommaPrezziUnitari: number;
}

export function summarizePrezzarioVoci(voci: VocePrezzario[]): PrezzarioCategoriaSummary[] {
  const map = new Map<string, { numeroVoci: number; sommaPrezziUnitari: number }>();

  for (const voce of voci) {
    const categoria = voce.categoria?.trim() || "Altro";
    const current = map.get(categoria) ?? { numeroVoci: 0, sommaPrezziUnitari: 0 };
    current.numeroVoci += 1;
    current.sommaPrezziUnitari += voce.prezzo;
    map.set(categoria, current);
  }

  return Array.from(map.entries()).map(([categoria, stats]) => ({
    categoria,
    numeroVoci: stats.numeroVoci,
    sommaPrezziUnitari: Math.round(stats.sommaPrezziUnitari * 100) / 100,
  }));
}

export function calcProductivityImpact(
  items: Array<Pick<PricingLineItem, "qta" | "prezzo" | "produttivita">>,
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

const SCORPORO_PATTERNS = [
  {
    pattern: /scavo.*carico|carico.*scavo/i,
    split: ["Scavo", "Carico materiale"],
    ratio: [0.6, 0.4],
  },
  {
    pattern: /demoliz.*rimozione|rimozione.*demoliz/i,
    split: ["Demolizione", "Rimozione macerie"],
    ratio: [0.5, 0.5],
  },
  {
    pattern: /preparazione.*compattazione|compattazione.*preparazione/i,
    split: ["Preparazione terreno", "Compattazione"],
    ratio: [0.4, 0.6],
  },
  {
    pattern: /posa.*sigillatura|sigillatura.*posa/i,
    split: ["Posa", "Sigillatura"],
    ratio: [0.7, 0.3],
  },
];

export function scorporaVoceComposita(voce: VocePrezzario): ScorporoResult {
  const pattern = SCORPORO_PATTERNS.find((p) => p.pattern.test(voce.descrizione));

  if (!pattern) {
    return {
      voceOriginaleId: voce.id,
      voceOriginale: voce,
      vocieScorprate: [voce],
      successoScorporo: false,
      motivazione: "Voce non riconosciuta come composita",
    };
  }

  const vocieScorprate: VocePrezzario[] = pattern.split.map((desc, idx) => ({
    id: `${voce.id}-scorporata-${idx}`,
    codice: `${voce.codice}-${String.fromCharCode(97 + idx)}`,
    descrizione: desc,
    um: voce.um,
    prezzo: voce.prezzo * pattern.ratio[idx],
    categoria: voce.categoria,
  }));

  return {
    voceOriginaleId: voce.id,
    voceOriginale: voce,
    vocieScorprate,
    successoScorporo: true,
    motivazione: `Scorporata in ${pattern.split.length} voci: ${pattern.split.join(", ")}`,
  };
}

export function applicaScorporoMassivo(voci: VocePrezzario[]): VocePrezzario[] {
  const vocieEsplase: VocePrezzario[] = [];
  for (const voce of voci) {
    const result = scorporaVoceComposita(voce);
    vocieEsplase.push(...result.vocieScorprate);
  }
  return vocieEsplase;
}

function calcolaSimilarita(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 100 : ((maxLen - matrix[len1][len2]) / maxLen) * 100;
}

export function matchVociSimili(
  prezzario1: Prezzario,
  prezzario2: Prezzario,
  sogliaSimilarita = 70
): MappingVociSimilari[] {
  const matches: MappingVociSimilari[] = [];

  for (const voce1 of prezzario1.voci) {
    for (const voce2 of prezzario2.voci) {
      const similarita = calcolaSimilarita(voce1.descrizione, voce2.descrizione);

      if (similarita >= sogliaSimilarita) {
        const deltaPrezzoPercent =
          voce1.prezzo > 0 ? ((voce2.prezzo - voce1.prezzo) / voce1.prezzo) * 100 : 0;

        matches.push({
          vocePrezzario1Id: voce1.id,
          vocePrezzario2Id: voce2.id,
          prezzario1Nome: prezzario1.nome,
          prezzario2Nome: prezzario2.nome,
          descrizione1: voce1.descrizione,
          descrizione2: voce2.descrizione,
          prezzo1: voce1.prezzo,
          prezzo2: voce2.prezzo,
          deltaPrezzoPercent,
          similarita,
          suggerimentoUnificazione: similarita > 85 && Math.abs(deltaPrezzoPercent) < 10,
        });
      }
    }
  }

  return matches.sort((a, b) => b.similarita - a.similarita);
}

function umCompatibili(um1: string, um2: string): boolean {
  const normalize = (um: string) => um.toLowerCase().trim();
  const n1 = normalize(um1);
  const n2 = normalize(um2);

  if (n1 === n2) return true;

  const mappature: Record<string, string[]> = {
    m: ["metro", "mt"],
    m2: ["mq", "metro quadro"],
    m3: ["mc", "metro cubo"],
    kg: ["chilogrammo", "chilo"],
    ore: ["ora", "h"],
    giorno: ["gg", "giornata"],
  };

  for (const [key, values] of Object.entries(mappature)) {
    const all = [key, ...values].map(normalize);
    if (all.includes(n1) && all.includes(n2)) return true;
  }

  return false;
}

export function matchComputoConPrezzario(
  computoVoci: ComputoMetricoVoce[],
  prezzario: Prezzario,
  sogliaSimilarita = 60
): ColllegamentoComputoPrezzario[] {
  const collegamenti: ColllegamentoComputoPrezzario[] = [];

  for (const computoVoce of computoVoci) {
    for (const prezzarioVoce of prezzario.voci) {
      if (!umCompatibili(computoVoce.um, prezzarioVoce.um)) continue;

      const similarita = calcolaSimilarita(computoVoce.descrizione, prezzarioVoce.descrizione);

      if (similarita >= sogliaSimilarita) {
        const deltaPercent =
          computoVoce.prezzoUnitarioStimato > 0
            ? ((prezzarioVoce.prezzo - computoVoce.prezzoUnitarioStimato) /
                computoVoce.prezzoUnitarioStimato) *
              100
            : 0;

        collegamenti.push({
          computoVoceId: computoVoce.id,
          prezzarioVoceId: prezzarioVoce.id,
          computoDescrizione: computoVoce.descrizione,
          prezzarioDescrizione: prezzarioVoce.descrizione,
          um: computoVoce.um,
          quantita: computoVoce.quantita,
          prezzoComputo: computoVoce.prezzoUnitarioStimato,
          prezzoPrezzario: prezzarioVoce.prezzo,
          deltaPercent,
          similarita,
          collegato: false,
        });
      }
    }
  }

  return collegamenti.sort((a, b) => b.similarita - a.similarita);
}

/** Miglior collegamento per ogni voce di computo (evita duplicati in UI). */
export function matchComputoConPrezzarioBest(
  computoVoci: ComputoMetricoVoce[],
  prezzario: Prezzario,
  sogliaSimilarita = 60
): ColllegamentoComputoPrezzario[] {
  const all = matchComputoConPrezzario(computoVoci, prezzario, sogliaSimilarita);
  const bestByComputo = new Map<string, ColllegamentoComputoPrezzario>();

  for (const coll of all) {
    const existing = bestByComputo.get(coll.computoVoceId);
    if (!existing || coll.similarita > existing.similarita) {
      bestByComputo.set(coll.computoVoceId, coll);
    }
  }

  return Array.from(bestByComputo.values()).sort((a, b) => b.similarita - a.similarita);
}

export function applicaCollegamentiComputo(
  computoVoci: ComputoMetricoVoce[],
  collegamenti: ColllegamentoComputoPrezzario[],
  prezzario: Prezzario
): ComputoMetricoVoce[] {
  const collegatiMap = new Map(
    collegamenti.filter((c) => c.collegato).map((c) => [c.computoVoceId, c.prezzarioVoceId])
  );

  return computoVoci.map((voce) => {
    const prezzarioVoceId = collegatiMap.get(voce.id);
    if (!prezzarioVoceId) return voce;

    const prezzarioVoce = prezzario.voci.find((v) => v.id === prezzarioVoceId);
    if (!prezzarioVoce) return voce;

    return {
      ...voce,
      prezzoUnitarioStimato: prezzarioVoce.prezzo,
    };
  });
}

export function buildComputoFromTender(tender: TenderDocument): ComputoMetricoVoce[] {
  return tender.sections.slice(0, 12).map((section, i) => ({
    id: `computo-${tender.id}-${i}`,
    codice: `CM.${String(i + 1).padStart(3, "0")}`,
    descrizione: section.title,
    um: "cad",
    quantita: 1,
    prezzoUnitarioStimato: 0,
  }));
}
