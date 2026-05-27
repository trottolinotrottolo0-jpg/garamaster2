import type { ProfiloImpresaContext } from "../src/types/database";
import type { CompanyProfile, TenderDocument } from "../src/types";

export interface RtiAvvalimentoRequestBody {
  tender: TenderDocument;
  profilo?: ProfiloImpresaContext | null;
  companyProfile?: CompanyProfile | null;
  soaGaps?: { description: string; details: string; category: string }[];
}

export type RtiAvvalimentoRaccomandazione =
  | "RTI"
  | "AVVALIMENTO"
  | "LASCIARE_PERDERE"
  | "PARTECIPARE_DIRETTA";

export interface RtiAvvalimentoPercorso {
  consigliato: boolean;
  motivazione: string;
  documenti: string[];
}

export interface RtiAvvalimentoRtiDetail extends RtiAvvalimentoPercorso {
  struttura: string;
  capogruppo: string;
  quotePartecipazione: string;
  partnerSuggeriti: string[];
}

export interface RtiAvvalimentoAvvalimentoDetail extends RtiAvvalimentoPercorso {
  riferimentoNormativo: string;
  requisitiDaAvvalere: string[];
  impreseAusiliarie: string[];
  limiti: string;
}

export interface RtiAvvalimentoLasciareDetail extends RtiAvvalimentoPercorso {
  rischiPrincipali: string[];
}

export interface RtiAvvalimentoResponseBody {
  raccomandazioneFinale: RtiAvvalimentoRaccomandazione;
  sintesi: string;
  gapSoa: string[];
  rti: RtiAvvalimentoRtiDetail;
  avvalimento: RtiAvvalimentoAvvalimentoDetail;
  lasciarePerdere: RtiAvvalimentoLasciareDetail;
  perche: string;
  datiUsati: string;
  verifica: string;
  confidenza: "Alto" | "Medio" | "Basso";
}
