// --- Alert Engine types (#16) ---

export type AlertSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export type AlertCategoria =
  | "SCADENZA"
  | "FIT"
  | "PRIORITA"
  | "DOCUMENTI"
  | "TASK"
  | "COMPLIANCE"
  | "GARA"
  | "OPERATIVO";

export interface AlertItem {
  id: string;
  titolo: string;
  descrizione: string;
  severity: AlertSeverity;
  categoria: AlertCategoria;
  data: string;
  garaId?: string;
  cig?: string;
  actionConsigliata?: string;
}

export interface DailyDigest {
  generatedAt: string;
  gareMonitorate: number;
  gareUrgenti: number;
  alertCritici: number;
  taskAperti: number;
  raccomandazione: string;
}

export interface WeeklyDigest {
  settimana: string;
  nuoveOpportunita: number;
  gareAnalizzate: number;
  alertRisolti: number;
  raccomandazione: string;
}

export interface NotifPrefs {
  gareUrgenti: boolean;
  gareAltaPriorita: boolean;
  documentiMancanti: boolean;
  task: boolean;
  compliance: boolean;
  alertCritici: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  gareUrgenti: true,
  gareAltaPriorita: true,
  documentiMancanti: true,
  task: true,
  compliance: true,
  alertCritici: true,
};

// --- Feed types (esistenti) ---

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

export interface DailyFeedScoutingAlertItem {
  id: string;
  gareAnacId: string;
  cig: string;
  titolo: string;
  alert: string;
  strategia?: string;
  fitScore: number;
}

export interface DailyFeedData {
  generatedAt: string;
  scadenzaProssimi7Giorni: DailyFeedExpiringItem[];
  nuoveGareAnac: DailyFeedAnacMatchItem[];
  scoutingAiAlerts: DailyFeedScoutingAlertItem[];
  azioniUrgenti: DailyFeedUrgentItem[];
  totalAlerts: number;
}
