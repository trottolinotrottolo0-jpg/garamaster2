import type { CompanyProfile, TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import { parseTenderImporto } from "./tenderValue";

export interface GaraRoiResult {
  marginePercentStimato: number;
  orePreparazioneStimate: number;
  tariffaOrariaEuro: number;
  costiAggiuntiviEuro: number;
  probabilitaVittoriaPercent: number;
  motivazioneMargine: string;
  motivazioneProbabilita: string;
  importoGaraEuro: number;
  costiPartecipazioneEuro: number;
  profittoAttesoEuro: number;
  roiPercent: number | null;
  formulaSintesi: string;
  generatedAt: string;
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
} {
  if (roiPercent == null) {
    return { label: "N/D", className: "text-slate-400" };
  }
  if (roiPercent >= 150) {
    return { label: "Eccellente", className: "text-emerald-400" };
  }
  if (roiPercent >= 50) {
    return { label: "Buono", className: "text-brand-gold" };
  }
  if (roiPercent >= 0) {
    return { label: "Moderato", className: "text-amber-400" };
  }
  return { label: "Negativo", className: "text-red-400" };
}
