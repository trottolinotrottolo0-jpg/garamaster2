import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import type { StoricoGaraAiEntry } from "../types/storicoGare";

const SOA_GAP_KEYWORDS =
  /soa|qualificazione|classifica|og\d|os\d|requisit|avvalimento|rti|carenz|insufficient|mancant|non possed|gap/i;

export function isAnacTender(tender: TenderDocument): boolean {
  return tender.id.startsWith("gare_anac-");
}

export function tenderMatchesRegion(tender: TenderDocument, regioni: string[]): boolean {
  if (!regioni.length) return true;
  const hay = `${tender.region} ${tender.title}`.toLowerCase();
  return regioni.some((r) => {
    const norm = r.trim().toLowerCase();
    return norm.length > 1 && hay.includes(norm);
  });
}

export function isStoricoSoaGapEntry(entry: StoricoGaraAiEntry): boolean {
  if (entry.esito === "persa" || entry.esito === "non partecipato") {
    if (SOA_GAP_KEYWORDS.test(entry.noteAi)) return true;
    if (entry.patternVincenti.some((p) => SOA_GAP_KEYWORDS.test(p))) return true;
  }
  if (/soa|qualificazione|og\d|os\d/i.test(entry.titoloGara + entry.noteAi)) {
    if (entry.esito === "persa" || entry.esito === "non partecipato") return true;
  }
  return false;
}

export function buildSoaGapForecastPayload(params: {
  profilo: ProfiloImpresaContext | null;
  storico: StoricoGaraAiEntry[];
  tenders: TenderDocument[];
  targetCoveragePercent?: number;
}) {
  const regioni = params.profilo?.regioni ?? [];
  const regioneLabel =
    regioni.length > 0 ? regioni.slice(0, 3).join(", ") : "Italia (tutte le regioni)";

  const storicoSoa = params.storico.filter(isStoricoSoaGapEntry).slice(0, 25);

  let anacInArea = params.tenders
    .filter(isAnacTender)
    .filter((t) => tenderMatchesRegion(t, regioni))
    .slice(0, 100);

  if (!anacInArea.length) {
    anacInArea = params.tenders.filter(isAnacTender).slice(0, 80);
  }

  const profiloSoa = {
    attestazione: params.profilo?.soa ?? null,
    regioniOperative: regioni,
    certificazioni: params.profilo?.certificazioni ?? [],
    fatturatoTriennale: params.profilo?.fatturatoTriennale ?? null,
    ragioneSociale: params.profilo?.ragioneSociale ?? null,
  };

  return {
    targetCoveragePercent: params.targetCoveragePercent ?? 80,
    regioneAnalisi: regioneLabel,
    profiloSoa,
    garePerseOSaltate: storicoSoa.map((e) => ({
      cig: e.cig,
      titolo: e.titoloGara,
      esito: e.esito,
      tipoAnalisi: e.tipoAnalisi,
      ribasso: e.ribassoOfferto,
      sintesi: e.noteAi.slice(0, 800),
      pattern: e.patternVincenti,
    })),
    gareAnacArea: anacInArea.map((t) => ({
      cig: t.cig,
      titolo: t.title,
      regione: t.region,
      importo: t.value,
      categoriaSoa: t.category,
      requisitiSoa: t.requirements
        .filter((r) => r.category === "SOA" || /soa|og\d|os\d/i.test(r.description))
        .map((r) => ({
          descrizione: r.description,
          soddisfatto: r.satisfied,
        })),
    })),
    statisticheInput: {
      totaleAnacArea: anacInArea.length,
      totaleStoricoSoa: storicoSoa.length,
      totaleStorico: params.storico.length,
    },
  };
}
