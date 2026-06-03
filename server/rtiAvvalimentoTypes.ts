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

export interface PartnerPotenziale {
  id: string;
  nome: string;
  categorieSOA: string[];
  areeGeografiche: string[];
  capacita: string;
  affidabilita: "Alta" | "Media" | "Bassa";
  tipoSupporto: "mandataria" | "mandante" | "ausiliaria";
  motivazioneMatch: string;
}

export interface ImpattoPartner {
  fitDelta: number;       // +/- 0-100
  rischioD: number;       // +/- 0-100
  marginalitaDelta: number; // +/- 0-100
  note: string;
}

export interface ScenarioAnalysis {
  titolo: string;
  probabilitaVittoria: number; // 0-100
  stimaMargine: number;        // %
  principaliRischi: string[];
  principaliVantaggi: string[];
}

export interface RtiAvvalimentoRtiDetail extends RtiAvvalimentoPercorso {
  struttura: string;
  capogruppo: string;
  quotePartecipazione: string;
  partnerSuggeriti: PartnerPotenziale[];
  scenarioSenzaPartner: ScenarioAnalysis;
  scenarioConPartner: ScenarioAnalysis;
  impattoPartner: ImpattoPartner;
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

export interface RtiAvvalimentoPartecipaDirettoDetail extends RtiAvvalimentoPercorso {
  condizioniNecessarie: string[];
  rischioResiduo: string;
}

export interface RtiAvvalimentoResponseBody {
  raccomandazioneFinale: RtiAvvalimentoRaccomandazione;
  sintesi: string;
  gapSoa: string[];
  rti: RtiAvvalimentoRtiDetail;
  avvalimento: RtiAvvalimentoAvvalimentoDetail;
  lasciarePerdere: RtiAvvalimentoLasciareDetail;
  partecipaDiretto: RtiAvvalimentoPartecipaDirettoDetail;
  perche: string;
  datiUsati: string;
  verifica: string;
  confidenza: "Alto" | "Medio" | "Basso";
}
