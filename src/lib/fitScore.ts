import type { Gara } from "../types/gara";
import { caricoInputFromRecord, computeCaricoScore } from "./caricoScore";
import { resolveScadenzaPortfolio } from "./portfolioDb";
import { enrichPortfolioScores } from "./scoring";
import { isLocallyScartata } from "./portfolioScartoStorage";
import { pickEnte, resolveBidNoBidFromRow } from "./watchTodayFilter";
import {
  computeMargineStimato,
  margineInputFromRecord,
} from "./margineScore";
import { computeRiskScore, riskInputFromTender, type RiskScoreInput } from "./riskScore";
import { computeUrgencyScore } from "./urgencyScore";
import type {
  GaraAnacRow,
  GaraRow,
  GaraScoutingRow,
  JsonValue,
  ProfiloImpresaContext,
} from "../types/database";
import type { CompanyProfile, TenderDocument } from "../types";

export type FitScoreInput = {
  fit_score?: number | string | null;
  regione?: string | null;
  categoria?: string | null;
  cpv?: string | null;
  titolo?: string | null;
  oggetto?: string | null;
  importo?: number | string | null;
  importo_base?: number | string | null;
  scadenza?: string | null;
  data_scadenza?: string | null;
  scoutingScore?: number | null;
};

function parseImporto(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  const cleaned = String(value).replace(/[^\d.,]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function extractSoaTokens(profilo: ProfiloImpresaContext | null): string[] {
  if (!profilo?.soa) return [];
  return profilo.soa
    .split(/[,;/|]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function parseTenderValue(value: string): number | null {
  return parseImporto(value);
}

function resolveScartata(record: Record<string, unknown>, listId: string): boolean {
  if (record.scartata === true || record.scartata === "true") return true;
  return isLocallyScartata(listId);
}

function toStringArray(value: JsonValue | undefined): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value];
  return undefined;
}

function riskInputFromGaraRow(row: GaraRow, record: Record<string, unknown>): RiskScoreInput {
  return {
    categoria: row.categoria_soa,
    titolo: row.titolo,
    oggetto: row.oggetto,
    importo: parseImporto(row.importo ?? row.importo_base),
    red_flag_count: record.red_flag_count as RiskScoreInput["red_flag_count"],
    carico_operativo:
      (record.carico_score ?? record.carico_operativo) as RiskScoreInput["carico_operativo"],
    risk_score: (record.rischio_score ?? record.risk_score) as RiskScoreInput["risk_score"],
    anomalies: toStringArray(row.anomalie),
    penalties: toStringArray(row.penali),
  };
}

function riskInputFromAnacRow(row: GaraAnacRow, record: Record<string, unknown>): RiskScoreInput {
  return {
    categoria: row.categoria ?? row.cpv,
    titolo: row.titolo,
    oggetto: row.oggetto,
    importo: parseImporto(row.importo ?? row.importo_base),
    red_flag_count: record.red_flag_count as RiskScoreInput["red_flag_count"],
    carico_operativo: record.carico_operativo as RiskScoreInput["carico_operativo"],
    risk_score: record.risk_score as RiskScoreInput["risk_score"],
  };
}

/** Confronta SOA, area geografica e fascia importo con il profilo impresa. */
export function computeFitScore(
  input: FitScoreInput,
  profilo: ProfiloImpresaContext | null
): number {
  const stored = Number(input.fit_score ?? input.scoutingScore);
  if (!Number.isNaN(stored) && stored > 0) return Math.round(stored);

  let score = 45;
  const regione = String(input.regione ?? "").toLowerCase();
  const categoria = String(input.categoria ?? input.cpv ?? "").toUpperCase();
  const titolo = String(input.titolo ?? input.oggetto ?? "").toUpperCase();

  const regioniProfilo = (profilo?.regioni ?? []).map((r) => r.toLowerCase());
  if (regione && regioniProfilo.some((r) => regione.includes(r) || r.includes(regione))) {
    score += 25;
  }

  for (const token of extractSoaTokens(profilo)) {
    if (categoria.includes(token) || titolo.includes(token)) {
      score += 18;
      break;
    }
  }

  const importo = parseImporto(input.importo ?? input.importo_base);
  if (importo != null && importo >= 150_000 && importo <= 5_000_000) {
    score += 10;
  }

  const fatturato = parseImporto(profilo?.fatturatoTriennale);
  if (importo != null && fatturato != null && fatturato > 0) {
    const ratio = importo / fatturato;
    if (ratio >= 0.05 && ratio <= 1.5) score += 8;
    if (ratio > 2.5) score -= 12;
  }

  const scadenza = parseDate(input.data_scadenza ?? input.scadenza);
  if (scadenza) {
    const giorni = daysUntil(scadenza);
    if (giorni >= 7 && giorni <= 60) score += 8;
    if (giorni < 0) score -= 30;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function sortByFit(gare: Gara[]): Gara[] {
  return [...gare].sort((a, b) => b.fit_score - a.fit_score);
}

export function fitLabel(score: number): "alto" | "medio" | "basso" {
  if (score >= 70) return "alto";
  if (score >= 45) return "medio";
  return "basso";
}

export function garaRowToGara(
  row: GaraRow,
  profilo: ProfiloImpresaContext | null,
  scouting?: GaraScoutingRow | null,
  company?: CompanyProfile | null,
  tender?: TenderDocument | null
): Gara {
  const record = row as Record<string, unknown>;
  const fit_score = computeFitScore(
    {
      fit_score: record.fit_score as number | undefined,
      regione: row.regione,
      categoria: row.categoria_soa,
      titolo: row.titolo,
      oggetto: row.oggetto,
      importo: row.importo,
      importo_base: row.importo_base,
      scadenza: row.scadenza,
      data_scadenza: row.data_scadenza,
      scoutingScore: scouting?.score,
    },
    profilo
  );

  const scadenza = resolveScadenzaPortfolio(row);

  const rowRisk = riskInputFromGaraRow(row, record);
  const riskInput: RiskScoreInput = tender
    ? {
        ...rowRisk,
        categoria: row.categoria_soa ?? tender.category,
        titolo: row.titolo ?? tender.title,
        importo: parseImporto(row.importo ?? row.importo_base) ?? riskInputFromTender(tender).importo,
        anomalies: [...(rowRisk.anomalies ?? []), ...tender.anomalies],
        penalties: [...(rowRisk.penalties ?? []), ...tender.penalties],
        requirements: tender.requirements,
      }
    : rowRisk;

  const importoParsed = parseImporto(row.importo ?? row.importo_base);
  const margineInput = margineInputFromRecord(
    record,
    importoParsed,
    parseImporto(row.importo_base)
  );
  if (company?.avgRibassoPercent != null && margineInput.ribasso_ipotizzato == null) {
    margineInput.ribasso_ipotizzato = company.avgRibassoPercent;
  }

  const caricoInput = caricoInputFromRecord(record, importoParsed, scadenza);

  return {
    id: row.id,
    listId: `gare-${row.id}`,
    cig: String(row.cig ?? "N/D"),
    titolo: String(row.titolo ?? row.oggetto ?? "Gara"),
    ente: pickEnte(row.ente_appaltante, row.stazione_appaltante),
    regione: row.regione ? String(row.regione) : undefined,
    categoria: row.categoria_soa ? String(row.categoria_soa) : undefined,
    importo: importoParsed,
    fit_score,
    urgency_score: computeUrgencyScore(scadenza),
    risk_score: computeRiskScore(riskInput, profilo, company),
    margine_stimato: computeMargineStimato(margineInput),
    carico_score: computeCaricoScore(caricoInput, profilo, company),
    convenienza_score: 0,
    score_sintetico: 0,
    bid_no_bid: resolveBidNoBidFromRow(record),
    scartata: resolveScartata(record, `gare-${row.id}`),
    source: "gare",
    scadenza,
  };
}

export function garaAnacRowToGara(
  row: GaraAnacRow,
  profilo: ProfiloImpresaContext | null,
  scouting?: GaraScoutingRow | null,
  company?: CompanyProfile | null
): Gara {
  const record = row as Record<string, unknown>;
  const fit_score = computeFitScore(
    {
      fit_score: row.fit_score,
      regione: row.regione,
      categoria: row.categoria,
      cpv: row.cpv,
      titolo: row.titolo,
      oggetto: row.oggetto,
      importo: row.importo,
      importo_base: row.importo_base,
      scadenza: row.scadenza,
      data_scadenza: row.data_scadenza,
      scoutingScore: scouting?.score,
    },
    profilo
  );

  const scadenza = resolveScadenzaPortfolio(row);

  const riskInput = riskInputFromAnacRow(row, record);
  const importoParsed = parseImporto(row.importo ?? row.importo_base);
  const margineInput = margineInputFromRecord(
    record,
    importoParsed,
    parseImporto(row.importo_base)
  );
  if (company?.avgRibassoPercent != null && margineInput.ribasso_ipotizzato == null) {
    margineInput.ribasso_ipotizzato = company.avgRibassoPercent;
  }

  const caricoInput = caricoInputFromRecord(record, importoParsed, scadenza);

  return {
    id: row.id,
    listId: `gare_anac-${row.id}`,
    cig: String(row.cig ?? "N/D"),
    titolo: String(row.titolo ?? row.oggetto ?? "Gara ANAC"),
    ente: pickEnte(row.ente_appaltante, row.stazione_appaltante),
    regione: row.regione ? String(row.regione) : undefined,
    categoria: row.categoria ? String(row.categoria) : row.cpv ? String(row.cpv) : undefined,
    importo: importoParsed,
    fit_score,
    urgency_score: computeUrgencyScore(scadenza),
    risk_score: computeRiskScore(riskInput, profilo, company),
    margine_stimato: computeMargineStimato(margineInput),
    carico_score: computeCaricoScore(caricoInput, profilo, company),
    convenienza_score: 0,
    score_sintetico: 0,
    bid_no_bid: resolveBidNoBidFromRow(record),
    scartata: resolveScartata(record, `gare_anac-${row.id}`),
    source: "gare_anac",
    scadenza,
  };
}

export function tenderToGara(
  tender: TenderDocument,
  profilo: ProfiloImpresaContext | null,
  scouting?: GaraScoutingRow | null,
  company?: CompanyProfile | null
): Gara {
  const source = tender.id.startsWith("gare_anac-")
    ? "gare_anac"
    : tender.id.startsWith("gare-")
      ? "gare"
      : "mock";

  const rawId = tender.id.replace(/^(gare_anac-|gare-)/, "");

  const fit_score = computeFitScore(
    {
      regione: tender.region,
      categoria: tender.category,
      titolo: tender.title,
      importo: parseTenderValue(tender.value),
      scadenza: tender.deadline !== "Da verificare" ? tender.deadline : null,
      scoutingScore: scouting?.score,
    },
    profilo
  );

  const scadenza = tender.deadline !== "Da verificare" ? tender.deadline : undefined;

  const riskInput = riskInputFromTender(tender);
  const importoParsed = parseTenderValue(tender.value);
  const margineInput = margineInputFromRecord(
    {},
    importoParsed,
    importoParsed
  );
  if (company?.avgRibassoPercent != null) {
    margineInput.ribasso_ipotizzato = company.avgRibassoPercent;
  }

  const caricoInput = caricoInputFromRecord({}, importoParsed, scadenza);

  return {
    id: rawId,
    listId: tender.id,
    cig: tender.cig,
    titolo: tender.title,
    ente: undefined,
    regione: tender.region,
    categoria: tender.category,
    importo: importoParsed,
    fit_score,
    urgency_score: computeUrgencyScore(scadenza),
    risk_score: computeRiskScore(riskInput, profilo, company),
    margine_stimato: computeMargineStimato(margineInput),
    carico_score: computeCaricoScore(caricoInput, profilo, company),
    convenienza_score: 0,
    score_sintetico: 0,
    bid_no_bid: null,
    scartata: resolveScartata({}, tender.id),
    source,
    scadenza,
  };
}

export function buildPortfolioGare(
  profilo: ProfiloImpresaContext | null,
  tenders: TenderDocument[],
  gareUtente: GaraRow[],
  scoutingMap: Map<string, GaraScoutingRow>,
  company?: CompanyProfile | null
): Gara[] {
  const tenderByCig = new Map(tenders.map((t) => [t.cig, t]));
  const byCig = new Map<string, Gara>();

  for (const row of gareUtente) {
    const scouting = row.cig ? scoutingMap.get(String(row.cig)) : undefined;
    const tender = row.cig ? tenderByCig.get(String(row.cig)) : undefined;
    const gara = garaRowToGara(row, profilo, scouting, company, tender);
    byCig.set(gara.cig, gara);
  }

  for (const tender of tenders) {
    if (byCig.has(tender.cig)) continue;
    const scouting = scoutingMap.get(tender.cig);
    byCig.set(tender.cig, tenderToGara(tender, profilo, scouting, company));
  }

  return enrichPortfolioScores(
    Array.from(byCig.values()),
    profilo,
    company?.historicalTenders ?? []
  );
}
