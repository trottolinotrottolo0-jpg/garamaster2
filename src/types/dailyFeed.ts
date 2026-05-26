export interface DailyFeedExpiringItem {
  id: string;
  garaId: string;
  cig: string;
  titolo: string;
  scadenzaOfferta: string;
  giorniRimanenti: number;
  regione?: string;
  importo?: string;
  statoPratica?: string;
}

export interface DailyFeedAnacMatchItem {
  id: string;
  gareAnacId: string;
  cig: string;
  titolo: string;
  fitScore: number;
  regione?: string;
  importo?: string;
  dataScadenza?: string;
  isNew: boolean;
}

export interface DailyFeedUrgentItem {
  id: string;
  garaId: string;
  cig: string;
  titolo: string;
  statoPratica: string;
  scadenzaOfferta?: string;
  giorniRimanenti?: number;
}

export interface DailyFeedData {
  generatedAt: string;
  scadenzaProssimi7Giorni: DailyFeedExpiringItem[];
  nuoveGareAnac: DailyFeedAnacMatchItem[];
  azioniUrgenti: DailyFeedUrgentItem[];
  totalAlerts: number;
}
