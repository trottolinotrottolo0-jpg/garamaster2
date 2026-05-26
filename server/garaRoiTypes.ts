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

export interface GaraRoiResponseBody extends GaraRoiGeminiEstimate {
  importoGaraEuro: number;
  costiPartecipazioneEuro: number;
  profittoAttesoEuro: number;
  roiPercent: number | null;
  formulaSintesi: string;
}
