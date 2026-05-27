export type ScoutingStatoUtente = "vista" | "salvata" | "scartata";

export type ScoutingFilters = {
  query: string;
  regioni: string[];
  categorie: string[];
  importoMin: number | null;
  importoMax: number | null;
  scadenzaEntroGiorni: number | null;
  fitMin: number;
  nascondiScartate: boolean;
  soloSalvate: boolean;
  soloNuove: boolean;
  allineaProfilo: boolean;
};

export const DEFAULT_SCOUTING_FILTERS: ScoutingFilters = {
  query: "",
  regioni: [],
  categorie: [],
  importoMin: null,
  importoMax: null,
  scadenzaEntroGiorni: 90,
  fitMin: 0,
  nascondiScartate: true,
  soloSalvate: false,
  soloNuove: false,
  allineaProfilo: true,
};

export type ScoutingGaraItem = {
  id: string;
  gareAnacId: string;
  cig: string;
  titolo: string;
  regione?: string;
  provincia?: string;
  categoria?: string;
  cpv?: string;
  importo?: string;
  importoNumero?: number;
  dataScadenza?: string;
  giorniRimanenti?: number;
  fitScore: number;
  fitLabel: "alto" | "medio" | "basso";
  statoUtente?: ScoutingStatoUtente;
  isNew: boolean;
  urlPortale?: string;
  urlDisciplinare?: string;
  aiSummary?: string;
  aiStrategia?: string;
  aiAlert?: string;
};

export type ScoutingFacetOptions = {
  regioni: string[];
  categorie: string[];
};
