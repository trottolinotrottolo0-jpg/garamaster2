import type { ProfiloImpresaContext } from "../src/types/database";
import type { CompanyProfile, TenderDocument } from "../src/types";

export interface GaraRoiRequestBody {
  tender: TenderDocument;
  profilo?: ProfiloImpresaContext | null;
  companyProfile?: CompanyProfile | null;
  importoGaraEuro: number;
}

export interface GaraRoiGeminiEstimate {
  marginePercentStimato: number;
  orePreparazioneStimate: number;
  tariffaOrariaEuro: number;
  costiAggiuntiviEuro: number;
  probabilitaVittoriaPercent: number;
  motivazioneMargine: string;
  motivazioneProbabilita: string;
}

export type GaraRoiVerdetto = "vale_la_pena" | "valuta_con_cautela" | "lascia_perdere";

export interface GaraRoiResponseBody extends GaraRoiGeminiEstimate {
  importoGaraEuro: number;
  costiPartecipazioneEuro: number;
  profittoAttesoEuro: number;
  roiPercent: number | null;
  formulaSintesi: string;
  // campi feature #56
  estimatedParticipationHours: number;
  internalHourlyCostEuro: number;
  participationInternalCostEuro: number;
  expectedMarginIfWonEuro: number;
  expectedValueEuro: number;
  roiPartecipazionePercent: number | null;
  verdetto: GaraRoiVerdetto;
  motivazioneLeggibile: string;
}
