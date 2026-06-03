import type { CompanyProfile, TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import { parseTenderImporto } from "./tenderValue";

export type GaraRoiVerdetto = "vale_la_pena" | "valuta_con_cautela" | "lascia_perdere";

export interface GaraRoiResult {
  marginePercentStimato: number;
  orePreparazioneStimate: number;
  tariffaOrariaEuro: number;
  costiAggiuntiviEuro: number;
  probabilitaVittoriaPercent: number;
  motivazioneMargine: string;
  motivazionoProbabilita: string;
  importoGaraEuro: number;
  costiPartecipazioneEuro: number;
  profittoAttesoEuro: number;
  roiPercent: number | null;
  formulaSintesi: string;
  generatedAt: string;
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

export async function fetchGaraRoi(params: {
  tender: TenderDocument;
  profilo?: ProfiloImpresaContext | null;
  companyProfile?: CompanyProfile | null;
}): Promise<GaraRoiResult> {
  const importoGaraEuro = parseTenderImporto(params.tender.value);

  const response = await fetch("/api/gara-roi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tender: params.tender,
      profilo: params.profilo ?? null,
      companyProfile: params.companyProfile ?? null,
      importoGaraEuro,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Errore calcolo ROI gara.");
  }

  return { ...data, generatedAt: new Date().toISOString() } as GaraRoiResult;
}

export function roiTier(roiPercent: number | null): {
  label: string;
  className: string;
  verdetto: GaraRoiVerdetto;
} {
  if (roiPercent == null) {
    return { label: "N/D", className: "text-slate-400", verdetto: "lascia_perdere" };
  }
  if (roiPercent >= 200) {
    return { label: "Vale la pena", className: "text-emerald-400", verdetto: "vale_la_pena" };
  }
  if (roiPercent >= 50) {
    return { label: "Valuta con cautela", className: "text-amber-400", verdetto: "valuta_con_cautela" };
  }
  return { label: "Lascia perdere", className: "text-red-400", verdetto: "lascia_perdere" };
}
