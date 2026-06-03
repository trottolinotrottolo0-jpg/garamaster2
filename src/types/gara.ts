/** Gara nel portfolio — unifica `gare` utente, ANAC e mock per ordinamento fit. */
export type GaraSourceKind = "gare" | "gare_anac" | "mock";

export type VistaPortfolio = "oggi" | "approfondire" | "scartare";

export type BidNoBidStatus = "GO" | "CAUTELA" | "NO-GO" | null;

export type PortfolioViewMode = "all" | "watch_today" | "review" | "discard";

export interface Gara {
  id: string;
  /** Id lista tender (`gare-uuid` / `gare_anac-uuid`) per navigazione UI */
  listId?: string;
  cig: string;
  titolo: string;
  ente?: string;
  regione?: string;
  /** Categoria / SOA / CPV */
  categoria?: string;
  importo?: number | null;
  fit_score: number;
  /** Urgenza da `data_scadenza` (0–100), calcolata rispetto a oggi */
  urgency_score: number;
  /** Rischio composito SOA + clausole + operativo (0–100, più alto = più rischioso) */
  risk_score: number;
  /** Margine stimato % (da DB o calcolo importo/ribasso/costo) */
  margine_stimato: number | null;
  /** Carico operativo % capacità impresa (0–100) */
  carico_score: number;
  /** Probabilità convenienza/vittoria stimata (0–100), solo client-side */
  convenienza_score: number;
  /** Match con storico gare simili (0–100), componente convenienza */
  storico_match?: number;
  /** Score sintetico priorità (DB o convenienza) */
  score_sintetico: number;
  /** Spiegazione leggibile del ranking (client-side / DB) */
  motivazione_ranking?: string;
  /** Vista portfolio persistita o calcolata */
  vista_portfolio?: VistaPortfolio;
  /** Esito bid/no-bid normalizzato */
  bid_no_bid?: BidNoBidStatus;
  /** Confermata scartata — nascosta dalle altre viste portfolio */
  scartata?: boolean;
  source: GaraSourceKind;
  /** ISO o testo da `data_scadenza` / scadenza */
  scadenza?: string;
}

export type PortfolioSortMode =
  | "fit_desc"
  | "urgency_desc"
  | "risk_asc"
  | "risk_desc"
  | "margine_desc"
  | "carico_asc"
  | "carico_desc"
  | "convenienza_desc"
  | "score_sintetico_desc"
  | "default";
