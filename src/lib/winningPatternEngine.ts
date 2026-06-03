import type {
  TenderOutcomeDetailed,
  WinningPattern,
  SimilarityScore,
  TenderDocument,
} from "../types";
import { parseTenderValue } from "./bidCalculations";

function slugClusterId(key: string): string {
  return `pattern-${key.replace(/[^a-zA-Z0-9|]+/g, "-").toLowerCase()}`;
}

function marginPercent(gara: TenderOutcomeDetailed): number | undefined {
  if (gara.marginRealePercent != null) return gara.marginRealePercent;
  if (gara.margineRealizzato != null) return gara.margineRealizzato;
  return undefined;
}

/**
 * Clustering gare vinte per attributi comuni
 */
export function generateWinningPatterns(storico: TenderOutcomeDetailed[]): WinningPattern[] {
  const gareVinte = storico.filter((g) => g.esito === "vinta");
  if (gareVinte.length < 3) return [];

  const patterns: WinningPattern[] = [];

  const byRegioneCategoriaImporto = groupByAttributes(storico, ["regione", "categoria"]);
  for (const [key, gare] of byRegioneCategoriaImporto.entries()) {
    const vinte = gare.filter((g) => g.esito === "vinta");
    if (vinte.length < 2) continue;
    const pattern = buildPattern(key, gare, vinte, "regione-categoria");
    if (pattern) patterns.push(pattern);
  }

  const byProceduraSettore = groupByAttributes(storico, ["procedura", "settore"]);
  for (const [key, gare] of byProceduraSettore.entries()) {
    const vinte = gare.filter((g) => g.esito === "vinta");
    if (vinte.length < 2) continue;
    const pattern = buildPattern(key, gare, vinte, "procedura-settore");
    if (pattern) patterns.push(pattern);
  }

  return deduplicatePatterns(patterns);
}

function groupByAttributes(
  gare: TenderOutcomeDetailed[],
  attributes: string[]
): Map<string, TenderOutcomeDetailed[]> {
  const map = new Map<string, TenderOutcomeDetailed[]>();

  for (const gara of gare) {
    const keyParts = attributes.map((attr) => {
      if (attr === "regione") return gara.regioneGara || "unknown";
      if (attr === "categoria") return gara.categoriaSOA || "unknown";
      if (attr === "procedura") return gara.tipoProcedura || "unknown";
      if (attr === "settore") return gara.settore || "unknown";
      return "unknown";
    });

    const key = keyParts.join("|");
    const current = map.get(key) || [];
    current.push(gara);
    map.set(key, current);
  }

  return map;
}

function buildPattern(
  key: string,
  gare: TenderOutcomeDetailed[],
  vinte: TenderOutcomeDetailed[],
  clusterKind: "regione-categoria" | "procedura-settore"
): WinningPattern | null {
  if (vinte.length === 0) return null;

  const parts = key.split("|");
  const importi = gare.map((g) => g.importoGara);
  const ribassi = vinte.map((g) => g.ribasso);
  const margini = vinte.map((g) => marginPercent(g)).filter((m): m is number => m !== undefined);

  const importoMin = Math.min(...importi);
  const importoMax = Math.max(...importi);

  let nome: string;
  let attributi: WinningPattern["attributi"];

  if (clusterKind === "regione-categoria") {
    const [regione, categoria] = parts;
    nome = `${regione} — ${categoria} (€${importoMin.toLocaleString("it-IT")}–€${importoMax.toLocaleString("it-IT")})`;
    attributi = {
      regioniTarget: [regione],
      categorieSoa: [categoria],
      importoMin,
      importoMax,
    };
  } else {
    const [procedura, settore] = parts;
    const regioni = [...new Set(vinte.map((g) => g.regioneGara))];
    const categorie = [...new Set(vinte.map((g) => g.categoriaSOA))];
    nome = `${procedura} / ${settore}`;
    attributi = {
      regioniTarget: regioni,
      categorieSoa: categorie,
      importoMin,
      importoMax,
      tipiProcedura: procedura !== "unknown" ? [procedura] : undefined,
      settori: settore !== "unknown" ? [settore] : undefined,
    };
  }

  const durataSum = vinte.reduce((sum, g) => sum + (g.tempoEsecuzioneMesi || 0), 0);
  const durataMedia = vinte.length > 0 ? durataSum / vinte.length : 0;

  return {
    clusterId: slugClusterId(`${clusterKind}-${key}`),
    nome,
    attributi,
    gareVinteInCluster: vinte,
    statsVittoria: {
      numeroGarePartecipate: gare.length,
      numeroGareVinte: vinte.length,
      tassoDiSuccesso: gare.length > 0 ? (vinte.length / gare.length) * 100 : 0,
    },
    statsEconomiche: {
      ribassoMedioVincente: ribassi.reduce((a, b) => a + b, 0) / ribassi.length,
      ribassoMinVincente: Math.min(...ribassi),
      ribassoMaxVincente: Math.max(...ribassi),
      margineAttesoMedioPercent: margini.length
        ? margini.reduce((a, b) => a + b, 0) / margini.length
        : 0,
      margineRealiMedi: margini,
    },
    statsTempi: {
      durataMediaMesi: durataMedia,
      tempoDecisioneMediGiorni: 7,
    },
    statsRischio: {
      percentualeRiskFlag:
        vinte.length > 0
          ? (vinte.filter((g) => g.hasRedFlags).length / vinte.length) * 100
          : 0,
      mediaComplessita:
        vinte.reduce((sum, g) => sum + (g.complessita ?? 50), 0) / vinte.length,
    },
    confidence: Math.min(100, vinte.length * 15),
  };
}

function deduplicatePatterns(patterns: WinningPattern[]): WinningPattern[] {
  const seen = new Set<string>();
  return patterns.filter((p) => {
    const sig = `${p.attributi.regioniTarget[0] ?? ""}-${p.attributi.categorieSoa[0] ?? ""}-${p.attributi.importoMin}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/**
 * Calcola similarità gara nuova vs pattern vincente
 */
export function matchGaraToPatterns(
  gara: TenderDocument,
  patterns: WinningPattern[]
): SimilarityScore[] {
  const matches: SimilarityScore[] = [];

  for (const pattern of patterns) {
    const sim = calcolaSimilaritaGara(gara, pattern);
    if (sim.similarita > 40) {
      matches.push(sim);
    }
  }

  return matches.sort((a, b) => b.similarita - a.similarita);
}

function calcolaSimilaritaGara(gara: TenderDocument, pattern: WinningPattern): SimilarityScore {
  let score = 0;
  const fattori = {
    regione: false,
    categoria: false,
    importoRange: false,
    procedura: false,
    settore: false,
  };

  const importoGara = parseTenderValue(gara.value);

  if (pattern.attributi.regioniTarget.includes(gara.region)) {
    score += 20;
    fattori.regione = true;
  }

  if (pattern.attributi.categorieSoa.includes(gara.category)) {
    score += 25;
    fattori.categoria = true;
  }

  if (
    importoGara >= pattern.attributi.importoMin &&
    importoGara <= pattern.attributi.importoMax * 1.2
  ) {
    score += 20;
    fattori.importoRange = true;
  }

  if (
    gara.procedureType &&
    pattern.attributi.tipiProcedura?.some(
      (p) => p.toLowerCase() === gara.procedureType?.toLowerCase()
    )
  ) {
    score += 15;
    fattori.procedura = true;
  }

  if (
    gara.sector &&
    pattern.attributi.settori?.some((s) => s.toLowerCase() === gara.sector?.toLowerCase())
  ) {
    score += 20;
    fattori.settore = true;
  }

  const similarita = Math.min(100, score);
  const recomandazione: SimilarityScore["recomandazione"] =
    similarita >= 75 ? "GO_SICURO" : similarita >= 50 ? "GO_CAUTO" : "SKIP";

  const predictionWinRate = pattern.statsVittoria.tassoDiSuccesso * (similarita / 100);

  return {
    clusterId: pattern.clusterId,
    clusterNome: pattern.nome,
    similarita,
    fattoriMatching: fattori,
    recomandazione,
    motivazione: buildMotivazione(pattern, fattori, similarita),
    predictionWinRate,
  };
}

function buildMotivazione(
  pattern: WinningPattern,
  fattori: SimilarityScore["fattoriMatching"],
  score: number
): string {
  const parts: string[] = [];

  if (fattori.regione && fattori.categoria) {
    parts.push(
      `Gare simili: ${pattern.statsVittoria.numeroGareVinte}/${pattern.statsVittoria.numeroGarePartecipate} vinte`
    );
  }

  if (score >= 75) {
    parts.push(
      `Ribasso medio vincente: ${pattern.statsEconomiche.ribassoMedioVincente.toFixed(1)}%`
    );
    parts.push(
      `Margine atteso: ${pattern.statsEconomiche.margineAttesoMedioPercent.toFixed(1)}%`
    );
  }

  if (pattern.statsRischio.percentualeRiskFlag > 50) {
    parts.push(
      `Attenzione: ${pattern.statsRischio.percentualeRiskFlag.toFixed(0)}% delle gare vinte simili avevano red flag`
    );
  }

  if (parts.length === 0) {
    parts.push(
      `Pattern con win rate ${pattern.statsVittoria.tassoDiSuccesso.toFixed(0)}% su cluster storico`
    );
  }

  return parts.join(" • ");
}

/**
 * Suggerisce ribasso ottimale basato su pattern vincenti
 */
export function suggerisciRibassoFromPattern(pattern: WinningPattern): {
  min: number;
  consigliato: number;
  max: number;
  spiegazione: string;
} {
  const ribassoConsigliato = pattern.statsEconomiche.ribassoMedioVincente;
  const ribassoMin = Math.max(0, ribassoConsigliato - 1);
  const ribassoMax = ribassoConsigliato + 2;

  return {
    min: ribassoMin,
    consigliato: ribassoConsigliato,
    max: ribassoMax,
    spiegazione: `Su ${pattern.statsVittoria.numeroGareVinte} gare vinte simili, il ribasso medio era ${ribassoConsigliato.toFixed(1)}%`,
  };
}

export interface HeatmapPoint {
  x: number;
  y: number;
  clusterId: string;
  clusterNome: string;
  numeroGare: number;
  colore: string;
}

export function generateHeatmapData(patterns: WinningPattern[]): HeatmapPoint[] {
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  return patterns.map((pattern, idx) => ({
    x: pattern.statsEconomiche.ribassoMedioVincente,
    y: pattern.statsEconomiche.margineAttesoMedioPercent,
    clusterId: pattern.clusterId,
    clusterNome: pattern.nome,
    numeroGare: pattern.statsVittoria.numeroGareVinte,
    colore: colors[idx % colors.length],
  }));
}

export interface PatternTrend {
  clusterId: string;
  clusterNome: string;
  trend: "UP" | "DOWN" | "STABLE";
  ribassoTrend: number;
  margineTrend: number;
  winRateTrend: number;
  motivazione: string;
}

function garaReferenceDate(gara: TenderOutcomeDetailed): Date {
  return new Date(gara.anno, 6, 1);
}

export function analyzePatternsTimeTrend(patterns: WinningPattern[]): PatternTrend[] {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  return patterns.map((pattern) => {
    const gareVinte = pattern.gareVinteInCluster;
    const recent = gareVinte.filter((g) => garaReferenceDate(g) > sixMonthsAgo);
    const older = gareVinte.filter((g) => garaReferenceDate(g) <= sixMonthsAgo);

    if (older.length === 0) {
      return {
        clusterId: pattern.clusterId,
        clusterNome: pattern.nome,
        trend: "STABLE",
        ribassoTrend: 0,
        margineTrend: 0,
        winRateTrend: 0,
        motivazione: "Dati insufficienti per trend",
      };
    }

    const avgRibassoOlder = older.reduce((sum, g) => sum + g.ribasso, 0) / older.length;
    const avgRibassoRecent =
      recent.length > 0
        ? recent.reduce((sum, g) => sum + g.ribasso, 0) / recent.length
        : avgRibassoOlder;
    const ribassoTrend =
      avgRibassoOlder > 0 ? ((avgRibassoRecent - avgRibassoOlder) / avgRibassoOlder) * 100 : 0;

    const marginOf = (list: TenderOutcomeDetailed[]) => {
      const vals = list.map((g) => marginPercent(g)).filter((m): m is number => m !== undefined);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const avgMargineOlder = marginOf(older);
    const avgMargineRecent = recent.length > 0 ? marginOf(recent) : avgMargineOlder;
    const margineTrend =
      avgMargineOlder > 0.1
        ? ((avgMargineRecent - avgMargineOlder) / avgMargineOlder) * 100
        : 0;

    const winRateOlder = (older.filter((g) => g.esito === "vinta").length / older.length) * 100;
    const winRateRecent =
      recent.length > 0
        ? (recent.filter((g) => g.esito === "vinta").length / recent.length) * 100
        : winRateOlder;
    const winRateTrend = winRateRecent - winRateOlder;

    let trend: PatternTrend["trend"] = "STABLE";
    if (winRateTrend > 5 || margineTrend > 10) trend = "UP";
    else if (winRateTrend < -5 || margineTrend < -10) trend = "DOWN";

    return {
      clusterId: pattern.clusterId,
      clusterNome: pattern.nome,
      trend,
      ribassoTrend,
      margineTrend,
      winRateTrend,
      motivazione:
        trend === "UP"
          ? `Trend positivo: win rate ${winRateTrend >= 0 ? "+" : ""}${winRateTrend.toFixed(1)}%, margine ${margineTrend >= 0 ? "+" : ""}${margineTrend.toFixed(1)}%`
          : trend === "DOWN"
            ? `Trend negativo: win rate ${winRateTrend.toFixed(1)}%, mercato in compressione`
            : "Pattern stabile nel tempo",
    };
  });
}

export interface PatternConfidenceBreakdown {
  clusterId: string;
  scoreComplessivo: number;
  breakdownScore: {
    dimensioneCampione: number;
    consistenzaRisultati: number;
    recencyBonus: number;
    stabilita: number;
  };
  interpretazione: string;
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

export function calculatePatternConfidence(pattern: WinningPattern): PatternConfidenceBreakdown {
  const numGare = pattern.statsVittoria.numeroGareVinte;

  if (numGare === 0) {
    return {
      clusterId: pattern.clusterId,
      scoreComplessivo: 0,
      breakdownScore: {
        dimensioneCampione: 0,
        consistenzaRisultati: 0,
        recencyBonus: 0,
        stabilita: 0,
      },
      interpretazione: "Pattern debole — insufficienti gare per decisioni sicure",
    };
  }

  const dimensioneCampione = Math.min(30, (numGare / 10) * 30);

  const ribassi = pattern.gareVinteInCluster.map((g) => g.ribasso);
  const stdDevRibasso = stdDev(ribassi);
  const consistenzaRisultati = Math.max(0, 25 - stdDevRibasso * 2);

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const gareRecenti = pattern.gareVinteInCluster.filter((g) => garaReferenceDate(g) > sixMonthsAgo);
  const recencyBonus = Math.min(20, (gareRecenti.length / numGare) * 20);

  const trend = pattern.statsVittoria.tassoDiSuccesso;
  const stabilita = trend > 70 ? 25 : trend > 50 ? 15 : 5;

  const scoreComplessivo = Math.round(
    dimensioneCampione + consistenzaRisultati + recencyBonus + stabilita
  );

  let interpretazione = "";
  if (scoreComplessivo >= 80) {
    interpretazione = "Pattern molto affidabile — usa tranquillamente per decisioni";
  } else if (scoreComplessivo >= 60) {
    interpretazione = "Pattern affidabile — con alcune riserve";
  } else if (scoreComplessivo >= 40) {
    interpretazione = "Pattern suggestivo — dati limitati, usare con cautela";
  } else {
    interpretazione = "Pattern debole — insufficienti gare per decisioni sicure";
  }

  return {
    clusterId: pattern.clusterId,
    scoreComplessivo,
    breakdownScore: {
      dimensioneCampione,
      consistenzaRisultati,
      recencyBonus,
      stabilita,
    },
    interpretazione,
  };
}

export interface RibassoAdaptiveRecommendation {
  consigliato: number;
  range: { min: number; max: number };
  aggressivita: "conservativa" | "normale" | "aggressiva";
  motivazione: string;
  fattoriAggiunti: {
    margineTaget: number;
    costo: number;
    profitTarget: number;
  };
}

export function recommendRibassoAdaptive(
  pattern: WinningPattern,
  margineTarget = 8,
  costoPrevisto = 0
): RibassoAdaptiveRecommendation {
  const ribassoMedio = pattern.statsEconomiche.ribassoMedioVincente;
  const margineAttesoMedio = pattern.statsEconomiche.margineAttesoMedioPercent;

  const spread = margineAttesoMedio - margineTarget;
  const ribassoAdattato = ribassoMedio + spread * 0.5;

  let aggressivita: RibassoAdaptiveRecommendation["aggressivita"] = "normale";
  if (ribassoAdattato < ribassoMedio - 1) aggressivita = "conservativa";
  if (ribassoAdattato > ribassoMedio + 1.5) aggressivita = "aggressiva";

  const consigliato = Math.max(0, ribassoAdattato);
  const range = {
    min: Math.max(0, consigliato - 1),
    max: consigliato + 2,
  };

  return {
    consigliato,
    range,
    aggressivita,
    motivazione: `Basato su ${pattern.statsVittoria.numeroGareVinte} gare vinte: ribasso medio ${ribassoMedio.toFixed(1)}%, adattato per margine target ${margineTarget.toFixed(1)}%`,
    fattoriAggiunti: {
      margineTaget: margineTarget,
      costo: costoPrevisto,
      profitTarget: costoPrevisto * (1 - consigliato / 100) * (margineTarget / 100),
    },
  };
}

export interface PatternReport {
  generatedAt: string;
  patterns: WinningPattern[];
  trends: PatternTrend[];
  insights: string[];
  recommendations: string[];
  csvExport: string;
}

export function generatePatternReport(
  patterns: WinningPattern[],
  trends: PatternTrend[]
): PatternReport {
  const insights = patterns
    .filter((p) => p.statsVittoria.numeroGareVinte >= 3)
    .map(
      (p) =>
        `${p.nome}: ${p.statsVittoria.tassoDiSuccesso.toFixed(0)}% win rate, ribasso medio ${p.statsEconomiche.ribassoMedioVincente.toFixed(1)}%`
    );

  const recommendations = trends
    .filter((t) => t.trend !== "STABLE")
    .map(
      (t) =>
        `${t.clusterNome}: ${t.trend === "UP" ? "Trend positivo" : "Trend negativo"} - ${t.motivazione}`
    );

  const csvHeaders = [
    "Cluster",
    "Gare Vinte",
    "Win Rate %",
    "Ribasso Medio %",
    "Margine Atteso %",
  ];
  const csvRows = patterns.map((p) => [
    `"${p.nome.replace(/"/g, '""')}"`,
    String(p.statsVittoria.numeroGareVinte),
    p.statsVittoria.tassoDiSuccesso.toFixed(1),
    p.statsEconomiche.ribassoMedioVincente.toFixed(2),
    p.statsEconomiche.margineAttesoMedioPercent.toFixed(2),
  ]);

  const csv = [csvHeaders.join(","), ...csvRows.map((row) => row.join(","))].join("\n");

  return {
    generatedAt: new Date().toISOString(),
    patterns,
    trends,
    insights,
    recommendations,
    csvExport: csv,
  };
}

export interface PatternAlert {
  id: string;
  tipo: "VERY_SIMILAR" | "OPPORTUNITY" | "RISK" | "TREND_WARNING";
  severity: "BASSA" | "MEDIA" | "ALTA";
  titolo: string;
  descrizione: string;
  actionUrl?: string;
  actionLabel?: string;
  clusterId?: string;
  timestamp: string;
  dismissible: boolean;
}

export function generatePatternAlerts(
  similarityScores: SimilarityScore[],
  patterns: WinningPattern[],
  trends: PatternTrend[]
): PatternAlert[] {
  const alerts: PatternAlert[] = [];

  const verySimilar = similarityScores.filter((s) => s.similarita >= 75);
  for (const sim of verySimilar) {
    const pattern = patterns.find((p) => p.clusterId === sim.clusterId);
    if (!pattern) continue;

    alerts.push({
      id: `alert-very-similar-${sim.clusterId}`,
      tipo: "VERY_SIMILAR",
      severity: "MEDIA",
      titolo: "Gara molto simile a pattern vincente",
      descrizione: `Questa gara è ${sim.similarita.toFixed(0)}% simile a "${pattern.nome}". Avete vinto ${pattern.statsVittoria.numeroGareVinte} su ${pattern.statsVittoria.numeroGarePartecipate} gare simili (${pattern.statsVittoria.tassoDiSuccesso.toFixed(0)}% win rate). Ribasso medio vincente: ${pattern.statsEconomiche.ribassoMedioVincente.toFixed(1)}%.`,
      actionLabel: "Vedi pattern details",
      clusterId: sim.clusterId,
      timestamp: new Date().toISOString(),
      dismissible: true,
    });
  }

  const opportunities = similarityScores.filter((s) => {
    const pattern = patterns.find((p) => p.clusterId === s.clusterId);
    return (
      s.similarita >= 60 &&
      s.predictionWinRate >= 70 &&
      pattern != null &&
      pattern.statsRischio.mediaComplessita < 50
    );
  });
  for (const opp of opportunities) {
    const pattern = patterns.find((p) => p.clusterId === opp.clusterId);
    if (!pattern) continue;

    alerts.push({
      id: `alert-opportunity-${opp.clusterId}`,
      tipo: "OPPORTUNITY",
      severity: "BASSA",
      titolo: "Opportunità ad alta probabilità di vittoria",
      descrizione: `Gara simile a pattern con probabilità stimata ${opp.predictionWinRate.toFixed(0)}% e complessità contenuta (${pattern.statsRischio.mediaComplessita.toFixed(0)}/100). Valutare partecipazione con analisi Bid/No-Bid.`,
      actionLabel: "Vai a Bid/No-Bid",
      clusterId: opp.clusterId,
      timestamp: new Date().toISOString(),
      dismissible: true,
    });
  }

  const risks = similarityScores.filter((s) => {
    const pattern = patterns.find((p) => p.clusterId === s.clusterId);
    return (
      s.similarita >= 60 &&
      pattern != null &&
      (pattern.statsRischio.mediaComplessita > 70 ||
        pattern.statsRischio.percentualeRiskFlag > 40)
    );
  });
  for (const risk of risks) {
    const pattern = patterns.find((p) => p.clusterId === risk.clusterId);
    if (!pattern) continue;

    alerts.push({
      id: `alert-risk-${risk.clusterId}`,
      tipo: "RISK",
      severity: "ALTA",
      titolo: "Attenzione: pattern con rischi noti",
      descrizione: `Gara simile a "${pattern.nome}" con complessità media ${pattern.statsRischio.mediaComplessita.toFixed(0)}/100 e ${pattern.statsRischio.percentualeRiskFlag.toFixed(0)}% delle vittorie storiche con red flag. Verificare disciplinare e clausole prima di partecipare.`,
      actionLabel: "Apri Red Flag Engine",
      clusterId: risk.clusterId,
      timestamp: new Date().toISOString(),
      dismissible: true,
    });
  }

  for (const trend of trends.filter((t) => t.trend === "DOWN")) {
    alerts.push({
      id: `alert-trend-${trend.clusterId}`,
      tipo: "TREND_WARNING",
      severity: "MEDIA",
      titolo: "Trend negativo rilevato",
      descrizione: `Il pattern "${trend.clusterNome}" mostra trend negativo: win rate ${trend.winRateTrend >= 0 ? "+" : ""}${trend.winRateTrend.toFixed(1)}% YoY, margine ${trend.margineTrend >= 0 ? "+" : ""}${trend.margineTrend.toFixed(1)}% YoY. Il mercato può essere in compressione.`,
      clusterId: trend.clusterId,
      timestamp: new Date().toISOString(),
      dismissible: true,
    });
  }

  const severityOrder: Record<PatternAlert["severity"], number> = {
    ALTA: 0,
    MEDIA: 1,
    BASSA: 2,
  };

  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
