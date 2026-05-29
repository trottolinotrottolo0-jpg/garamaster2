import type {
  TenderDocument,
  MarketIntelligenceSnapshot,
  MarketTrend,
  CompetitorProfile,
  GaraSimilareHistorica,
  GaraSimilareAggiudicazione,
  CompanyProfile,
  HistoricalTender,
} from "../types";
import { parseTenderValue } from "./bidCalculations";

function tenderReferenceDate(tender: TenderDocument): Date {
  const raw = tender.estimatedStartDate || tender.deadline;
  const d = raw ? new Date(raw) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function tenderImportoEuro(tender: TenderDocument): number {
  return parseTenderValue(tender.value);
}

export function historicalTenderToGaraSimile(h: HistoricalTender): GaraSimilareHistorica {
  const aggiudicazione: GaraSimilareAggiudicazione =
    h.esito === "vinta"
      ? "VINTA"
      : h.esito === "persa"
        ? "PERSA"
        : h.esito === "ritirata"
          ? "SOSPESA"
          : "NON_PARTECIPATA";

  const gara: TenderDocument = {
    id: h.id,
    title: h.noteGara ?? `Gara ${h.anno} — ${h.categoriaSOA}`,
    cig: "",
    region: h.regioneGara || "N/D",
    value: String(h.importoGara),
    category: h.categoriaSOA,
    deadline: `${h.anno}-12-31`,
    requirements: [],
    sections: [],
    anomalies: [],
    penalties: [],
  };

  const ribasso = h.ribasso ?? 0;
  const importoAggiudicato = Math.round(h.importoGara * (1 - ribasso / 100));

  return {
    id: `hist-${h.id}`,
    gara,
    dataEmissione: `${h.anno}-01-01`,
    dataRisultato: `${h.anno}-06-30`,
    aggiudicazione,
    winnerName: aggiudicazione === "VINTA" ? undefined : "Aggiudicatario esterno",
    offerteRicevute: 5,
    ribassoVincente: ribasso,
    puntiTecnici: 70,
    importoAggiudicato,
    notaRisultato: h.noteGara,
  };
}

export function buildHistoricalFromCompanyProfile(
  profile: CompanyProfile | null | undefined
): GaraSimilareHistorica[] {
  if (!profile?.historicalTenders?.length) return [];
  return profile.historicalTenders.map(historicalTenderToGaraSimile);
}

export function mergeHistoricalSources(
  ...sources: GaraSimilareHistorica[][]
): GaraSimilareHistorica[] {
  const byId = new Map<string, GaraSimilareHistorica>();
  for (const list of sources) {
    for (const item of list) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

export function analyzeMarketIntelligence(
  allTenders: TenderDocument[],
  historicalData: GaraSimilareHistorica[]
): MarketIntelligenceSnapshot {
  const trends = calculateMarketTrends(allTenders, historicalData);
  const competitorsTop5 = identifyTopCompetitors(historicalData);
  const gareSimiliHistoriche = filterRecentHistoricalGares(historicalData, 365);

  return {
    id: `mkt-snap-${Date.now()}`,
    dataSnapshot: new Date().toISOString(),
    numeroGareAttiveMonitorate: allTenders.length,
    numeroCompetitorsTracciati: competitorsTop5.length,
    trendsMercato: trends,
    competitorsTop5,
    gareSimiliHistoriche,
  };
}

function calculateMarketTrends(
  tenders: TenderDocument[],
  historical: GaraSimilareHistorica[]
): MarketTrend[] {
  const trends: MarketTrend[] = [];
  const grouped = new Map<string, TenderDocument[]>();

  for (const tender of tenders) {
    const categoria = tender.category || "N/D";
    const regione = tender.region || "N/D";
    const key = `${categoria}|${regione}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(tender);
  }

  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const [key, tenderGroup] of grouped) {
    const [categoria, regione] = key.split("|");

    const importi = tenderGroup.map(tenderImportoEuro).filter((n) => n > 0);
    const importoMedio =
      importi.length > 0 ? importi.reduce((a, b) => a + b, 0) / importi.length : 0;
    const importoTotale = importi.reduce((a, b) => a + b, 0);

    const tenderLast30 = tenderGroup.filter((t) => tenderReferenceDate(t) > oneMonthAgo);
    const trendPercent =
      tenderGroup.length > 0
        ? Math.round((tenderLast30.length / tenderGroup.length) * 100 - 50)
        : 0;

    let trendDirezione: MarketTrend["trendDirezione"] = "STABILE";
    if (trendPercent > 15) trendDirezione = "UP";
    if (trendPercent < -15) trendDirezione = "DOWN";

    const historicalInCategory = historical.filter(
      (h) =>
        h.gara.category === categoria &&
        h.gara.region === regione &&
        h.aggiudicazione === "VINTA"
    );

    const ribassoMedioPercent =
      historicalInCategory.length > 0
        ? historicalInCategory.reduce((sum, h) => sum + h.ribassoVincente, 0) /
          historicalInCategory.length
        : 0;

    const winnerCounts = new Map<string, number>();
    historicalInCategory.forEach((h) => {
      if (h.winnerName) {
        winnerCounts.set(h.winnerName, (winnerCounts.get(h.winnerName) || 0) + 1);
      }
    });
    const top3Winners = Array.from(winnerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .reduce((sum, [, count]) => sum + count, 0);
    const concentrazioneWinner =
      historicalInCategory.length > 0
        ? (top3Winners / historicalInCategory.length) * 100
        : 0;

    trends.push({
      id: `trend-${categoria}-${regione}-${Date.now()}`,
      periodo: `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`,
      categoria,
      regione,
      numeroGareEmesse: tenderGroup.length,
      importoMedioGara: Math.round(importoMedio),
      importoTotaleMercato: Math.round(importoTotale),
      trendDirezione,
      trendPercent,
      prezzomedioBanda: Math.round(importoMedio * 0.85),
      ribassoMedioPercent: Math.round(ribassoMedioPercent * 100) / 100,
      concentrazioneWinner: Math.round(concentrazioneWinner),
    });
  }

  return trends.sort((a, b) => b.numeroGareEmesse - a.numeroGareEmesse);
}

function identifyTopCompetitors(historical: GaraSimilareHistorica[]): CompetitorProfile[] {
  const competitorStats = new Map<
    string,
    {
      vinte: number;
      partecipate: number;
      importi: number[];
      categorie: Set<string>;
      regioni: Set<string>;
      ultimaVittoria: string;
    }
  >();

  for (const h of historical) {
    const nome = h.winnerName?.trim();
    if (!nome || nome === "Aggiudicatario esterno") continue;

    if (!competitorStats.has(nome)) {
      competitorStats.set(nome, {
        vinte: 0,
        partecipate: 0,
        importi: [],
        categorie: new Set(),
        regioni: new Set(),
        ultimaVittoria: h.dataRisultato,
      });
    }

    const stats = competitorStats.get(nome)!;
    if (h.aggiudicazione === "VINTA") {
      stats.vinte++;
      stats.ultimaVittoria = h.dataRisultato;
    }
    stats.partecipate++;
    stats.importi.push(tenderImportoEuro(h.gara));
    stats.categorie.add(h.gara.category);
    stats.regioni.add(h.gara.region);
  }

  return Array.from(competitorStats.entries())
    .map(([nome, stats]) => {
      const importoMedio =
        stats.importi.length > 0
          ? stats.importi.reduce((a, b) => a + b, 0) / stats.importi.length
          : 0;
      return {
        id: `comp-${nome.replace(/\s+/g, "-").slice(0, 24)}`,
        nome,
        ragioneSociale: nome,
        settoriOperativi: Array.from(stats.categorie),
        regioni: Array.from(stats.regioni),
        importoMedioGare: Math.round(importoMedio),
        winRate: stats.partecipate > 0 ? (stats.vinte / stats.partecipate) * 100 : 0,
        numeroGareVinte: stats.vinte,
        numeroGarePartecipate: stats.partecipate,
        garaUltimaVittoria: stats.ultimaVittoria,
        dataUltimoRilevamento: new Date().toISOString(),
      };
    })
    .sort((a, b) => b.numeroGareVinte - a.numeroGareVinte)
    .slice(0, 5);
}

function filterRecentHistoricalGares(
  historical: GaraSimilareHistorica[],
  giorniIndietro: number
): GaraSimilareHistorica[] {
  const threshold = new Date(Date.now() - giorniIndietro * 24 * 60 * 60 * 1000);
  return historical
    .filter((h) => new Date(h.dataRisultato) > threshold)
    .sort((a, b) => new Date(b.dataRisultato).getTime() - new Date(a.dataRisultato).getTime());
}

export function findSimilarHistoricalGares(
  tender: TenderDocument,
  historical: GaraSimilareHistorica[],
  maxResults = 10
): GaraSimilareHistorica[] {
  const importo = tenderImportoEuro(tender);
  const importoMin = importo > 0 ? importo * 0.7 : 0;
  const importoMax = importo > 0 ? importo * 1.3 : Number.MAX_SAFE_INTEGER;

  return historical
    .filter((h) => {
      const hImporto = tenderImportoEuro(h.gara);
      const catMatch =
        h.gara.category === tender.category ||
        h.gara.category.slice(0, 2) === tender.category.slice(0, 2);
      const regionMatch =
        !tender.region ||
        !h.gara.region ||
        h.gara.region.toLowerCase().includes(tender.region.toLowerCase()) ||
        tender.region.toLowerCase().includes(h.gara.region.toLowerCase());
      const importoMatch = importo <= 0 || (hImporto >= importoMin && hImporto <= importoMax);
      return catMatch && regionMatch && importoMatch;
    })
    .sort((a, b) => new Date(b.dataRisultato).getTime() - new Date(a.dataRisultato).getTime())
    .slice(0, maxResults);
}

export function estimateWinProbability(
  tender: TenderDocument,
  snapshot: MarketIntelligenceSnapshot,
  yourWinRate: number
): {
  probabilitaVittoria: number;
  competitorStrength: number;
  marketCompetitiveness: number;
  reasoning: string;
} {
  const relevantTrend = snapshot.trendsMercato.find(
    (t) =>
      t.categoria === tender.category ||
      t.categoria.slice(0, 2) === tender.category.slice(0, 2)
  );

  const marketCompetitiveness = relevantTrend?.concentrazioneWinner ?? 50;

  const competitorStrength =
    snapshot.competitorsTop5.length > 0
      ? snapshot.competitorsTop5.reduce((sum, c) => sum + c.winRate, 0) /
        snapshot.competitorsTop5.length
      : 40;

  const baseWinRate = yourWinRate > 0 ? yourWinRate : 30;
  const adjustmentFactor = (100 - marketCompetitiveness) / 100;
  const competitorAdjustment = 1 - (competitorStrength / 100) * 0.3;

  const probabilitaVittoria = Math.round(
    baseWinRate * adjustmentFactor * competitorAdjustment
  );

  const reasoning =
    probabilitaVittoria >= 50
      ? `Buone chance. Capacità storica (${baseWinRate}%) e mercato con concentrazione ${marketCompetitiveness}% (più bassa = più opportunità).`
      : `Sfida elevata. Competitor forti (strength ${Math.round(competitorStrength)}%) e mercato concentrato.`;

  return {
    probabilitaVittoria: Math.max(5, Math.min(95, probabilitaVittoria)),
    competitorStrength: Math.round(competitorStrength),
    marketCompetitiveness: Math.round(marketCompetitiveness),
    reasoning,
  };
}
