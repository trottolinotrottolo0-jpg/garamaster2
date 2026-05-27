import type { CompanyProfile, RtiAvvalimentoResult, TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import type { SoaGapItem } from "./soaGapAnalysis";

export async function fetchRtiAvvalimentoAnalysis(params: {
  tender: TenderDocument;
  profilo?: ProfiloImpresaContext | null;
  companyProfile?: CompanyProfile | null;
  soaGaps?: SoaGapItem[];
}): Promise<RtiAvvalimentoResult> {
  const response = await fetch("/api/rti-avvalimento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tender: params.tender,
      profilo: params.profilo ?? null,
      companyProfile: params.companyProfile ?? null,
      soaGaps: params.soaGaps ?? [],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Errore analisi RTI/Avvalimento.");
  }

  return { ...data, generatedAt: new Date().toISOString() } as RtiAvvalimentoResult;
}

export function raccomandazioneLabel(
  rac: RtiAvvalimentoResult["raccomandazioneFinale"]
): string {
  const map: Record<RtiAvvalimentoResult["raccomandazioneFinale"], string> = {
    RTI: "Costituire RTI",
    AVVALIMENTO: "Avvalimento (art. 104)",
    LASCIARE_PERDERE: "Lasciare perdere la gara",
    PARTECIPARE_DIRETTA: "Partecipare direttamente",
  };
  return map[rac] ?? rac;
}
