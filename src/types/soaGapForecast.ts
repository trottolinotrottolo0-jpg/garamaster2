export interface SoaMancanteItem {
  categoria: string;
  classifica: string;
  priorita?: "alta" | "media" | "bassa";
  frequenzaGareStimate?: number;
  motivazione?: string;
}

export interface SoaGapForecastResult {
  coperturaTargetPercent: number;
  messaggioPrincipale: string;
  soaMancanti: SoaMancanteItem[];
  costoStimatoOttenimentoEuro: number;
  gareSbloccate: number;
  roiStimatoPercent: number;
  sintesi: string;
  regioneAnalisi: string;
  gareAnacAnalizzate: number;
  garePerseOSaltateSoa: number;
  model: string;
}
