import type { CompanyProfile, TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import type { PortfolioGaraStorico } from "../types/portfolio";

export interface PortfolioScoreResult {
  score: number;
  livello: "Competitivo" | "Migliorabile" | "Critico";
  sintesi: string;
  fattori: {
    soa: string;
    regioni: string;
    importi: string;
    storico: string;
  };
  perche: string;
  datiUsati: string;
  verifica: string;
  confidenza: string;
}

export function getPortfolioScoreTier(score: number): {
  emoji: string;
  label: "Competitivo" | "Migliorabile" | "Critico";
  className: string;
} {
  if (score >= 70) {
    return {
      emoji: "🟢",
      label: "Competitivo",
      className: "bg-emerald-950/60 border-emerald-600/50 text-emerald-300",
    };
  }
  if (score >= 40) {
    return {
      emoji: "🟡",
      label: "Migliorabile",
      className: "bg-amber-950/60 border-amber-600/50 text-amber-300",
    };
  }
  return {
    emoji: "🔴",
    label: "Critico",
    className: "bg-red-950/60 border-red-600/50 text-red-300",
  };
}

export async function fetchPortfolioScore(params: {
  profilo?: ProfiloImpresaContext | null;
  companyProfile?: CompanyProfile | null;
  tenders: TenderDocument[];
  gareStorico?: PortfolioGaraStorico[];
}): Promise<PortfolioScoreResult> {
  const tenders = params.tenders.map((t) => ({
    id: t.id,
    cig: t.cig,
    title: t.title,
    region: t.region,
    value: t.value,
    category: t.category,
  }));

  const response = await fetch("/api/portfolio-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profilo: params.profilo ?? null,
      companyProfile: params.companyProfile ?? null,
      tenders,
      gareStorico: params.gareStorico ?? [],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Errore calcolo portfolio score.");
  }

  return data as PortfolioScoreResult;
}
