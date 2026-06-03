import type {
  TenderDocument,
  FitStrategicProfile,
  NicchiaStrategica,
  AreaGeografica,
  HistoricalTender,
  CompanyTenderHistoryItem,
} from "../types";
import { parseTenderValue } from "./bidCalculations";

export interface FitStrategicScore {
  scoreComplessivo: number;
  breakdownScore: {
    nicchiaMatch: number;
    areaMatch: number;
    importoMatch: number;
  };
  nicchieMatching: NicchiaStrategica[];
  areeMatching: AreaGeografica[];
  recommendation: "ALLINEATA_ALTA" | "ALLINEATA_MEDIA" | "OFF_STRATEGY" | "IRRILEVANTE";
  motivazione: string;
  percentualeAllineamento: number;
}

export function calculateStrategicFit(
  tender: TenderDocument,
  fitProfile: FitStrategicProfile | undefined
): FitStrategicScore {
  if (!fitProfile) {
    return {
      scoreComplessivo: 0,
      breakdownScore: { nicchiaMatch: 0, areaMatch: 0, importoMatch: 0 },
      nicchieMatching: [],
      areeMatching: [],
      recommendation: "IRRILEVANTE",
      motivazione: "Nessun profilo strategico definito",
      percentualeAllineamento: 0,
    };
  }

  const strategy = fitProfile.strategiaAttiva;
  let nicchiaScore = 0;
  let areaScore = 0;
  let importoScore = 0;

  const nicchieMatching: NicchiaStrategica[] = [];
  const areeMatching: AreaGeografica[] = [];

  const nNicchie = strategy.nicchieTarget.length;
  if (nNicchie > 0) {
    for (const nicchia of strategy.nicchieTarget) {
      if (isCategoryInNicchia(tender.category, nicchia)) {
        nicchieMatching.push(nicchia);
        nicchiaScore += (nicchia.priorita / 10) * (50 / nNicchie);
      }
    }
  }

  const nAree = strategy.areeTarget.length;
  if (nAree > 0 && tender.region) {
    const regionLower = tender.region.toLowerCase();
    for (const area of strategy.areeTarget) {
      if (area.regione && regionLower.includes(area.regione.toLowerCase())) {
        areeMatching.push(area);
        const hubBonus = area.hasLogisticsHub ? 1.1 : 1;
        areaScore += (area.priorita / 10) * (30 / nAree) * hubBonus;
      }
    }
    areaScore = Math.min(30, areaScore);
  }

  const importoGara = parseTenderValue(tender.value);
  const importoTargetMedio =
    nNicchie > 0
      ? strategy.nicchieTarget.reduce((sum, n) => sum + n.targetImportoMedio, 0) / nNicchie
      : strategy.importoTargetAnnuale > 0
        ? strategy.importoTargetAnnuale / 4
        : 0;

  if (importoTargetMedio > 0 && importoGara > 0) {
    const ratio = importoGara / importoTargetMedio;
    if (ratio >= 0.7 && ratio <= 1.3) {
      importoScore = 20;
    } else if (ratio >= 0.5 && ratio <= 1.5) {
      importoScore = 12;
    } else if (ratio >= 0.3 && ratio <= 2) {
      importoScore = 6;
    }
  }

  const scoreComplessivo = Math.round(Math.min(100, nicchiaScore + areaScore + importoScore));
  const breakdownScore = {
    nicchiaMatch: Math.round(nicchiaScore),
    areaMatch: Math.round(areaScore),
    importoMatch: Math.round(importoScore),
  };

  let recommendation: FitStrategicScore["recommendation"];
  if (scoreComplessivo >= 70 && nicchieMatching.length > 0) {
    recommendation = "ALLINEATA_ALTA";
  } else if (scoreComplessivo >= 45 && (nicchieMatching.length > 0 || areeMatching.length > 0)) {
    recommendation = "ALLINEATA_MEDIA";
  } else if (scoreComplessivo >= 20) {
    recommendation = "OFF_STRATEGY";
  } else {
    recommendation = "IRRILEVANTE";
  }

  const motivazione = buildMotivazioneFit(
    scoreComplessivo,
    nicchieMatching,
    areeMatching,
    recommendation
  );

  return {
    scoreComplessivo,
    breakdownScore,
    nicchieMatching,
    areeMatching,
    recommendation,
    motivazione,
    percentualeAllineamento: Math.min(100, scoreComplessivo),
  };
}

function isCategoryInNicchia(category: string, nicchia: NicchiaStrategica): boolean {
  const categoryLower = category.toLowerCase();
  const nomeLower = nicchia.nome.trim().toLowerCase();
  const descLower = nicchia.descrizione.trim().toLowerCase();

  if (nomeLower.length >= 3 && categoryLower.includes(nomeLower)) return true;
  if (descLower.length >= 4 && categoryLower.includes(descLower.slice(0, 20))) return true;

  const keywords: Record<string, string[]> = {
    "ristrutturazione sostenibile": ["ristruttur", "sostenibil", "eco", "green"],
    demolizione: ["demoliz"],
    scavi: ["scav"],
    fondazioni: ["fondaz"],
    impianti: ["impiant", "impianto"],
  };

  const keywordsForNicchia =
    keywords[nomeLower] ??
    Object.entries(keywords).find(([k]) => nomeLower.includes(k))?.[1] ??
    [];

  return keywordsForNicchia.some((kw) => categoryLower.includes(kw));
}

function buildMotivazioneFit(
  score: number,
  nicchie: NicchiaStrategica[],
  aree: AreaGeografica[],
  recommendation: FitStrategicScore["recommendation"]
): string {
  const parts: string[] = [];

  if (recommendation === "ALLINEATA_ALTA") {
    parts.push(`✓ Alta allineamento strategico (score ${score}/100)`);
    if (nicchie.length > 0) {
      parts.push(`Nicchia: ${nicchie.map((n) => n.nome).join(", ")}`);
    }
    if (aree.length > 0) {
      parts.push(`Regione target: ${aree.map((a) => a.regione).join(", ")}`);
    }
    parts.push("Consigliato partecipare anche con margine borderline");
  } else if (recommendation === "ALLINEATA_MEDIA") {
    parts.push(`Parziale allineamento (score ${score}/100)`);
    parts.push("Valutare caso per caso");
  } else if (recommendation === "OFF_STRATEGY") {
    parts.push(`⚠️ Gara non allineata al profilo strategico (score ${score}/100)`);
    parts.push("Valutare solo se economicamente molto conveniente");
  } else {
    parts.push(`Non rilevante per il profilo strategico (score ${score}/100)`);
  }

  return parts.join(" • ");
}

export function classifyTendersByFit(
  tenders: TenderDocument[],
  fitProfile: FitStrategicProfile | undefined
): Array<{ tender: TenderDocument; fit: FitStrategicScore }> {
  return tenders
    .map((tender) => ({
      tender,
      fit: calculateStrategicFit(tender, fitProfile),
    }))
    .sort((a, b) => b.fit.scoreComplessivo - a.fit.scoreComplessivo);
}

export const FIT_RECOMMENDATION_LABEL: Record<FitStrategicScore["recommendation"], string> = {
  ALLINEATA_ALTA: "Allineata alta",
  ALLINEATA_MEDIA: "Allineata media",
  OFF_STRATEGY: "Off strategy",
  IRRILEVANTE: "Irrilevante",
};

export const FIT_RECOMMENDATION_CLASS: Record<FitStrategicScore["recommendation"], string> = {
  ALLINEATA_ALTA: "text-emerald-400",
  ALLINEATA_MEDIA: "text-blue-400",
  OFF_STRATEGY: "text-amber-400",
  IRRILEVANTE: "text-slate-400",
};

export interface FitPortfolioCluster {
  categoria: FitStrategicScore["recommendation"];
  gare: Array<{ tender: TenderDocument; fit: FitStrategicScore }>;
  numeroGare: number;
  importoTotale: number;
  importoMedio: number;
  raccomandazione: string;
}

export function clusterGareByFitStrategic(
  tenders: TenderDocument[],
  fitProfile: FitStrategicProfile | undefined
): FitPortfolioCluster[] {
  const classified = classifyTendersByFit(tenders, fitProfile);

  const clusters: Record<
    FitStrategicScore["recommendation"],
    Array<{ tender: TenderDocument; fit: FitStrategicScore }>
  > = {
    ALLINEATA_ALTA: [],
    ALLINEATA_MEDIA: [],
    OFF_STRATEGY: [],
    IRRILEVANTE: [],
  };

  for (const item of classified) {
    clusters[item.fit.recommendation].push(item);
  }

  const order: FitStrategicScore["recommendation"][] = [
    "ALLINEATA_ALTA",
    "ALLINEATA_MEDIA",
    "OFF_STRATEGY",
    "IRRILEVANTE",
  ];

  const result: FitPortfolioCluster[] = [];

  for (const categoria of order) {
    const gare = clusters[categoria];
    if (gare.length === 0) continue;

    const importoTotale = gare.reduce(
      (sum, g) => sum + parseTenderValue(g.tender.value),
      0
    );
    const importoMedio = importoTotale / gare.length;

    let raccomandazione = "";
    if (categoria === "ALLINEATA_ALTA") {
      raccomandazione = `Priorità massima: ${gare.length} gare allineate alla strategia`;
    } else if (categoria === "ALLINEATA_MEDIA") {
      raccomandazione = `Valutare: ${gare.length} gare parzialmente allineate`;
    } else if (categoria === "OFF_STRATEGY") {
      raccomandazione = `Bassa priorità: ${gare.length} gare non allineate`;
    } else {
      raccomandazione = `Irrilevanti: ${gare.length} gare fuori scope`;
    }

    result.push({
      categoria,
      gare,
      numeroGare: gare.length,
      importoTotale,
      importoMedio,
      raccomandazione,
    });
  }

  return result;
}

export interface FitPlusPatternScore {
  fitScore: number;
  patternScore: number;
  superScore: number;
  verdict: "GO_SICURO" | "GO_CAUTO" | "SKIP";
  motivazione: string;
}

export function combineFitWithPattern(
  fitScore: FitStrategicScore,
  patternScore?: number,
  patternWinRate?: number
): FitPlusPatternScore {
  const ps = patternScore ?? 0;
  const hasPattern = patternScore !== undefined && patternScore > 0;
  const winRateLabel =
    patternWinRate !== undefined ? `${Math.round(patternWinRate)}%` : "n/d";

  const superScore = Math.round(fitScore.scoreComplessivo * 0.6 + ps * 0.4);

  let verdict: FitPlusPatternScore["verdict"] = "SKIP";
  let motivazione = "";

  if (fitScore.recommendation === "ALLINEATA_ALTA" && hasPattern && ps >= 70) {
    verdict = "GO_SICURO";
    motivazione = `Allineamento strategico alto + pattern vincente simile (${ps}%) · win rate stimato ${winRateLabel}`;
  } else if (fitScore.recommendation === "ALLINEATA_ALTA" && hasPattern && ps >= 50) {
    verdict = "GO_CAUTO";
    motivazione = `Allineamento strategico alto + pattern simile moderato (${ps}%)`;
  } else if (fitScore.recommendation === "ALLINEATA_ALTA") {
    verdict = "GO_CAUTO";
    motivazione = "Allineamento strategico alto · nessun pattern storico forte";
  } else if (hasPattern && ps >= 75) {
    verdict = "GO_CAUTO";
    motivazione = `Pattern vincente simile (${ps}%) ma gara off-strategy`;
  } else if (fitScore.recommendation === "ALLINEATA_MEDIA") {
    verdict = "GO_CAUTO";
    motivazione = "Allineamento strategico medio — valutare caso per caso";
  } else {
    verdict = "SKIP";
    motivazione = "Basso allineamento strategico e nessun pattern vincente rilevante";
  }

  return {
    fitScore: fitScore.scoreComplessivo,
    patternScore: ps,
    superScore,
    verdict,
    motivazione,
  };
}

export const FIT_SUPER_VERDICT_CLASS: Record<FitPlusPatternScore["verdict"], string> = {
  GO_SICURO: "text-emerald-400",
  GO_CAUTO: "text-blue-400",
  SKIP: "text-slate-400",
};

export interface FitStrategicTrend {
  periodo: "2024" | "2025" | "2026" | string;
  numeroGarePartecipate: number;
  numeroGareAllineate: number;
  percentualeAllineamento: number;
  importoTotaleMedio: number;
  margineRealizatoMedio: number;
  trend: "MIGLIORANDO" | "PEGGIORANDO" | "STABILE";
  motivazione: string;
}

export type FitParticipationRecord = {
  tender: TenderDocument;
  fit: FitStrategicScore;
  anno: number;
  marginRealized?: number;
};

export function analyzeFitStrategicTrend(
  storicoGarePartecipate: FitParticipationRecord[]
): FitStrategicTrend[] {
  const byYear = new Map<number, FitParticipationRecord[]>();

  for (const gara of storicoGarePartecipate) {
    const year = gara.anno;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(gara);
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);
  const trends: FitStrategicTrend[] = [];

  for (const year of sortedYears) {
    const gare = byYear.get(year)!;
    if (gare.length === 0) continue;

    const allineate = gare.filter(
      (g) =>
        g.fit.recommendation === "ALLINEATA_ALTA" ||
        g.fit.recommendation === "ALLINEATA_MEDIA"
    );

    const importoTotale = gare.reduce(
      (sum, g) => sum + parseTenderValue(g.tender.value),
      0
    );
    const withMargin = gare.filter((g) => g.marginRealized !== undefined);
    const margineMedio =
      withMargin.length > 0
        ? withMargin.reduce((sum, g) => sum + (g.marginRealized ?? 0), 0) / withMargin.length
        : 0;

    trends.push({
      periodo: String(year),
      numeroGarePartecipate: gare.length,
      numeroGareAllineate: allineate.length,
      percentualeAllineamento: (allineate.length / gare.length) * 100,
      importoTotaleMedio: importoTotale / gare.length,
      margineRealizatoMedio: margineMedio,
      trend: "STABILE",
      motivazione: year === sortedYears[0] ? "Anno base di riferimento" : "",
    });
  }

  for (let i = 1; i < trends.length; i++) {
    const prev = trends[i - 1];
    const curr = trends[i];

    const deltaAllineamento =
      curr.percentualeAllineamento - prev.percentualeAllineamento;
    const deltaMargineMedio = curr.margineRealizatoMedio - prev.margineRealizatoMedio;

    let trend: FitStrategicTrend["trend"] = "STABILE";
    if (deltaAllineamento > 10 || deltaMargineMedio > 1) {
      trend = "MIGLIORANDO";
    } else if (deltaAllineamento < -10 || deltaMargineMedio < -1) {
      trend = "PEGGIORANDO";
    }

    trends[i].trend = trend;
    trends[i].motivazione =
      trend === "MIGLIORANDO"
        ? `Allineamento in aumento (+${deltaAllineamento.toFixed(1)} pp), margine ${deltaMargineMedio >= 0 ? "+" : ""}${deltaMargineMedio.toFixed(1)} pp`
        : trend === "PEGGIORANDO"
          ? `Allineamento in calo (${deltaAllineamento.toFixed(1)} pp), margine ${deltaMargineMedio.toFixed(1)} pp`
          : "Allineamento stabile, performance coerente con il periodo precedente";
  }

  return trends;
}

function stubTenderFromHistory(
  id: string,
  title: string,
  category: string,
  region: string,
  value: string
): TenderDocument {
  return {
    id,
    title,
    cig: "",
    region,
    value,
    category,
    deadline: "",
    requirements: [],
    sections: [],
    anomalies: [],
    penalties: [],
  };
}

export function buildFitParticipationHistory(
  fitProfile: FitStrategicProfile | undefined,
  historicalTenders?: HistoricalTender[],
  tenderHistory?: CompanyTenderHistoryItem[]
): FitParticipationRecord[] {
  const records: FitParticipationRecord[] = [];

  for (const h of historicalTenders ?? []) {
    const tender = stubTenderFromHistory(
      h.id,
      h.noteGara ?? `Gara ${h.anno}`,
      h.categoriaSOA,
      h.regioneGara,
      String(h.importoGara)
    );
    records.push({
      tender,
      fit: calculateStrategicFit(tender, fitProfile),
      anno: h.anno,
      marginRealized: h.margineRealizzato,
    });
  }

  for (const h of tenderHistory ?? []) {
    if (!h.year) continue;
    const tender = stubTenderFromHistory(
      h.id,
      h.title,
      h.category,
      h.ente,
      h.amount != null ? String(h.amount) : "0"
    );
    records.push({
      tender,
      fit: calculateStrategicFit(tender, fitProfile),
      anno: h.year,
    });
  }

  return records;
}
