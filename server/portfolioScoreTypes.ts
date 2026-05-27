import type { ProfiloImpresaContext } from "../src/types/database";
import type { CompanyProfile, TenderDocument } from "../src/types";
import type { PortfolioGaraStorico } from "../src/types/portfolio";

export type { PortfolioGaraStorico };

export interface PortfolioScoreRequestBody {
  profilo?: ProfiloImpresaContext | null;
  companyProfile?: CompanyProfile | null;
  tenders: Pick<TenderDocument, "id" | "cig" | "title" | "region" | "value" | "category">[];
  gareStorico?: PortfolioGaraStorico[];
}

export interface PortfolioScoreResponseBody {
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
