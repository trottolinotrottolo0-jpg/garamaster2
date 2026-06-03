import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import type { CompanyProfile, TenderDocument, TenderRequirement } from "../types";

export type RiskLevel = "low" | "medium" | "high";

export type RiskScoreInput = {
  categoria?: string | null;
  titolo?: string | null;
  oggetto?: string | null;
  importo?: number | null;
  red_flag_count?: number | string | null;
  carico_operativo?: number | string | null;
  risk_score?: number | string | null;
  anomalies?: string[] | null;
  penalties?: string[] | null;
  requirements?: TenderRequirement[] | null;
};

function parseNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

const SOA_TOKEN_RE = /\b(OG\d{1,2}|OS\d{1,2}(?:-[AB])?)\b/gi;

function extractSoaTokens(profilo: ProfiloImpresaContext | null): string[] {
  if (!profilo?.soa) return [];
  return profilo.soa
    .split(/[,;/|]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function extractRequiredSoaTokens(
  categoria?: string | null,
  titolo?: string | null
): string[] {
  const hay = `${categoria ?? ""} ${titolo ?? ""}`.toUpperCase();
  const matches = hay.match(SOA_TOKEN_RE);
  return matches ? [...new Set(matches.map((m) => m.toUpperCase()))] : [];
}

/** 0–100: gap SOA richiesto vs attestazioni impresa. */
export function computeSoaGapRisk(
  input: RiskScoreInput,
  profilo: ProfiloImpresaContext | null
): number {
  const required = extractRequiredSoaTokens(input.categoria, input.titolo ?? input.oggetto);
  const owned = extractSoaTokens(profilo);

  if (required.length === 0) {
    return owned.length === 0 ? 45 : 25;
  }
  if (owned.length === 0) return 90;

  const covered = required.filter((r) =>
    owned.some((o) => o === r || o.startsWith(r) || r.startsWith(o))
  );

  if (covered.length === required.length) return 15;
  if (covered.length > 0) return 55;
  return 88;
}

/** Categoria SOA richiesta dalla gara assente nel profilo impresa. */
export function hasSoaCategoryGap(
  input: Pick<RiskScoreInput, "categoria" | "titolo" | "oggetto">,
  profilo: ProfiloImpresaContext | null
): boolean {
  const required = extractRequiredSoaTokens(input.categoria, input.titolo ?? input.oggetto);
  if (required.length === 0) return false;

  const owned = extractSoaTokens(profilo);
  if (owned.length === 0) return true;

  const covered = required.filter((r) =>
    owned.some((o) => o === r || o.startsWith(r) || r.startsWith(o))
  );
  return covered.length < required.length;
}

/** 0–100: clausole critiche / red flag. */
export function computeClauseRisk(input: RiskScoreInput): number {
  const stored = parseNum(input.red_flag_count);
  if (stored != null && stored >= 0) {
    if (stored === 0) return 12;
    if (stored <= 2) return 35 + stored * 15;
    return Math.min(100, 55 + stored * 12);
  }

  const anomalies = input.anomalies?.length ?? 0;
  const penalties = input.penalties?.length ?? 0;
  const unsatisfiedSoa =
    input.requirements?.filter(
      (r) =>
        !r.satisfied &&
        (r.category === "SOA" || /soa|penale|clausol|avvalimento|rti|subappalt/i.test(r.description))
    ).length ?? 0;

  const flags = anomalies + penalties + unsatisfiedSoa;
  if (flags === 0) return 15;
  if (flags <= 2) return 40;
  if (flags <= 4) return 62;
  return Math.min(100, 70 + (flags - 4) * 8);
}

/** 0–100: carico operativo vs capacità disponibile. */
export function computeOperationalRisk(
  input: RiskScoreInput,
  company?: CompanyProfile | null
): number {
  const storedLoad = parseNum(input.carico_operativo);
  if (storedLoad != null) {
    return Math.max(0, Math.min(100, Math.round(storedLoad)));
  }

  if (company) {
    const squads = Math.max(company.activeSquads ?? 0, 1);
    const jobsites = company.activeJobsites ?? 0;
    let risk = Math.min(100, Math.round((jobsites / squads) * 80));

    const capacity =
      company.productivityData?.concurrentProjectsCapacity ??
      company.productivityData?.concurrentTenderManagementCapacity ??
      squads;
    const activeCount = company.activeProjects?.length ?? jobsites;
    if (capacity > 0 && activeCount >= capacity) {
      risk = Math.min(100, risk + 22);
    }

    const importo = input.importo ?? 0;
    const maxTarget = company.targetImportMax ?? 0;
    if (importo > 0 && maxTarget > 0 && importo > maxTarget * 1.2) {
      risk = Math.min(100, risk + 18);
    } else if (importo > 3_000_000) {
      risk = Math.min(100, risk + 12);
    }

    return Math.max(0, Math.min(100, Math.round(risk)));
  }

  const importo = input.importo ?? 0;
  if (importo > 5_000_000) return 48;
  if (importo > 1_500_000) return 38;
  return 32;
}

export function computeRiskScore(
  input: RiskScoreInput,
  profilo: ProfiloImpresaContext | null,
  company?: CompanyProfile | null
): number {
  const stored = parseNum(input.risk_score);
  if (stored != null && stored >= 0) {
    return Math.max(0, Math.min(100, Math.round(stored)));
  }

  const soa = computeSoaGapRisk(input, profilo);
  const clause = computeClauseRisk(input);
  const operational = computeOperationalRisk(input, company);

  const composite = Math.round(soa * 0.4 + clause * 0.35 + operational * 0.25);
  return Math.max(0, Math.min(100, composite));
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export function riskBadgeClasses(level: RiskLevel): string {
  switch (level) {
    case "high":
      return "text-red-300 bg-red-950/60 border-red-800/60";
    case "medium":
      return "text-amber-300 bg-amber-950/50 border-amber-800/50";
    default:
      return "text-emerald-300 bg-emerald-950/40 border-emerald-800/50";
  }
}

export function riskBadgeLabel(level: RiskLevel): string {
  switch (level) {
    case "high":
      return "Alto";
    case "medium":
      return "Medio";
    default:
      return "Basso";
  }
}

export type RiskSortDirection = "asc" | "desc";

export function sortByRisk(gare: Gara[], direction: RiskSortDirection = "asc"): Gara[] {
  const sorted = [...gare].sort((a, b) => {
    if (a.risk_score !== b.risk_score) {
      return a.risk_score - b.risk_score;
    }
    return b.urgency_score - a.urgency_score;
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

export function riskInputFromTender(tender: TenderDocument): RiskScoreInput {
  return {
    categoria: tender.category,
    titolo: tender.title,
    importo: parseTenderImporto(tender.value),
    anomalies: tender.anomalies,
    penalties: tender.penalties,
    requirements: tender.requirements,
  };
}

function parseTenderImporto(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function readCompanyProfileFromStorage(): CompanyProfile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("gm_company_profile");
    if (!raw) return null;
    return JSON.parse(raw) as CompanyProfile;
  } catch {
    return null;
  }
}
