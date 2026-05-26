export interface SoaGapForecastRequestBody {
  targetCoveragePercent?: number;
  regioneAnalisi: string;
  profiloSoa: unknown;
  garePerseOSaltate: unknown[];
  gareAnacArea: unknown[];
  statisticheInput: {
    totaleAnacArea: number;
    totaleStoricoSoa: number;
    totaleStorico: number;
  };
}

export interface SoaGapForecastResponseBody {
  coperturaTargetPercent: number;
  messaggioPrincipale: string;
  soaMancanti: {
    categoria: string;
    classifica: string;
    priorita?: string;
    frequenzaGareStimate?: number;
    motivazione?: string;
  }[];
  costoStimatoOttenimentoEuro: number;
  gareSbloccate: number;
  roiStimatoPercent: number;
  sintesi: string;
  regioneAnalisi: string;
  gareAnacAnalizzate: number;
  garePerseOSaltateSoa: number;
  model: string;
}
