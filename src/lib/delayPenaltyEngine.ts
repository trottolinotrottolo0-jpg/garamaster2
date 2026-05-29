import type {
  TenderDocument,
  PenaltyClause,
  CompanyDelayProfile,
  DelayPenaltyExposure,
  DelayRiskIndicator,
  DelayRiskClasse,
  CompanyProfile,
} from "../types";
import { parseTenderValue } from "./bidCalculations";

export function defaultPenaltyClausesForTender(tender: TenderDocument): PenaltyClause[] {
  const importo = parseTenderValue(tender.value) || 500_000;

  if (tender.penalties?.length > 0) {
    return tender.penalties.map((desc, index) => ({
      id: `penalty-tender-${index + 1}`,
      tipo: "GIORNALIERA",
      importoGiornaliero: Math.max(100, Math.round(importo * 0.001)),
      importoMassimo: Math.round(importo * 0.1),
      giorniToleranza: 5,
      descrizione: desc,
      note: "Estratto da scheda gara",
    }));
  }

  return [
    {
      id: "penalty-default-1",
      tipo: "GIORNALIERA",
      importoGiornaliero: Math.max(100, Math.round(importo * 0.005)),
      importoMassimo: Math.round(importo * 0.1),
      giorniToleranza: 5,
      descrizione:
        "Penalità giornaliera standard (stima): ~0,5% importo/gg, cap 10% importo contratto",
      note: "Default se bando non specifica penalità esplicite",
    },
  ];
}

export function estimateMargineForTender(
  tender: TenderDocument,
  companyProfile?: CompanyProfile | null
): number {
  const importo = parseTenderValue(tender.value) || 500_000;
  const marginPct = companyProfile?.avgMarginPercent ?? 12;
  return Math.round(importo * (marginPct / 100));
}

export function defaultCompanyDelayProfile(
  companyProfile?: CompanyProfile | null,
  tender?: TenderDocument
): CompanyDelayProfile {
  const historical = companyProfile?.historicalTenders ?? [];
  const fattori: string[] = [];
  if (tender?.category?.toLowerCase().includes("scav")) {
    fattori.push("Subappalti / subappalti frequenti");
  }
  if (tender?.region) fattori.push(`Cantiere in ${tender.region}`);
  if (fattori.length === 0) fattori.push("Complessità organizzativa standard");

  return {
    id: companyProfile?.vatNumber ?? "company-default",
    settore: tender?.category,
    categoria: tender?.category,
    percentualeRitardiStorici: historical.length > 10 ? 22 : 28,
    giorninMedioRitardo: historical.length > 10 ? 7 : 10,
    peggioreRitardo: historical.length > 10 ? 35 : 45,
    confidenzaStima: historical.length > 5 ? 80 : 55,
    fattoriRischio: fattori,
  };
}

export function createDelayPenaltyExposure(
  tender: TenderDocument,
  penaltyClauses: PenaltyClause[],
  companyProfile: CompanyDelayProfile,
  margineStimato: number
): DelayPenaltyExposure {
  const clauses =
    penaltyClauses.length > 0 ? penaltyClauses : defaultPenaltyClausesForTender(tender);
  const importoGara = parseTenderValue(tender.value) || 500_000;

  const durationGiorni = estimateDuration(tender);
  const giorniToleranzaTotale = clauses.reduce((sum, p) => sum + p.giorniToleranza, 0);
  const probabilitaRitardo = estimateDelayProbability(durationGiorni, companyProfile, tender);
  const giorniRitardoAttesi = Math.max(
    0,
    Math.round(companyProfile.giorninMedioRitardo * (probabilitaRitardo / 100))
  );

  const penalitaAttesa = calculatePenalty(clauses, giorniRitardoAttesi, importoGara);
  const penalitaWorstCase = calculatePenalty(
    clauses,
    companyProfile.peggioreRitardo,
    importoGara
  );

  const margineDopoRitardo = margineStimato - penalitaAttesa;
  const margineDeltaPercent =
    margineStimato > 0 ? ((margineDopoRitardo - margineStimato) / margineStimato) * 100 : 0;

  const riskClasse = classifyDelayRisk(penalitaAttesa, margineStimato, probabilitaRitardo);

  return {
    id: `delay-${Date.now()}`,
    gara: tender,
    dataAnalisi: new Date().toISOString(),
    penaltyClauses: clauses,
    companyProfile,
    durationGiorni,
    giorniToleranzaTotale,
    probabilitaRitardo,
    giorniRitardoAttesi,
    penalitaAttesa: Math.round(penalitaAttesa),
    penalitaWorstCase: Math.round(penalitaWorstCase),
    penalitaBestCase: 0,
    margineStimato,
    margineDopoRitardo: Math.round(margineDopoRitardo),
    margineDeltaPercent: Math.round(margineDeltaPercent * 10) / 10,
    riskClasse,
    recommendation: buildDelayRecommendation(riskClasse, penalitaAttesa, margineDopoRitardo),
  };
}

function estimateDuration(tender: TenderDocument): number {
  const importoM = parseTenderValue(tender.value) / 1_000_000;
  if (importoM < 0.5) return 90;
  if (importoM < 2) return 180;
  if (importoM < 5) return 270;
  return 365 + Math.round((importoM - 5) * 100);
}

function estimateDelayProbability(
  durationGiorni: number,
  profile: CompanyDelayProfile,
  tender: TenderDocument
): number {
  let probabilita = profile.percentualeRitardiStorici;

  const factors = profile.fattoriRischio.map((f) => f.toLowerCase());
  if (factors.some((f) => f.includes("subappalt") || f.includes("subiacen"))) {
    probabilita += 15;
  }
  if (factors.some((f) => f.includes("weather") || f.includes("meteo"))) {
    probabilita += 10;
  }
  if (durationGiorni > 365) probabilita += 20;
  if (tender.anomalies?.length) probabilita += 8;

  return Math.min(100, probabilita);
}

function calculatePenalty(
  clauses: PenaltyClause[],
  giorniRitardo: number,
  importoGara: number
): number {
  let penalitaTotal = 0;

  for (const clause of clauses) {
    if (giorniRitardo <= clause.giorniToleranza) continue;

    const giorniEccesso = giorniRitardo - clause.giorniToleranza;
    let penalita = 0;

    if (clause.tipo === "GIORNALIERA" || clause.tipo === "RAGGUAGLIATA") {
      penalita = clause.importoGiornaliero * giorniEccesso;
    } else if (clause.tipo === "DECURTAZIONE_IMPORTO") {
      const pct = clause.percentuale ?? 0.5;
      penalita = importoGara * (pct / 100) * giorniEccesso;
    } else if (clause.tipo === "RISOLUZIONE") {
      penalita = importoGara * 0.15;
    }

    if (clause.importoMassimo) {
      penalita = Math.min(penalita, clause.importoMassimo);
    }

    penalitaTotal += penalita;
  }

  return penalitaTotal;
}

function classifyDelayRisk(
  penalitaAttesa: number,
  margineStimato: number,
  probabilitaRitardo: number
): DelayRiskClasse {
  const ratioEsposizione = margineStimato > 0 ? penalitaAttesa / margineStimato : 2;

  if (probabilitaRitardo > 70 && ratioEsposizione > 0.5) return "CRITICO";
  if (ratioEsposizione > 0.5) return "ALTO";
  if (ratioEsposizione > 0.2 || probabilitaRitardo > 50) return "MEDIO";
  return "BASSO";
}

function buildDelayRecommendation(
  riskClasse: DelayRiskClasse,
  penalitaAttesa: number,
  margineDopoRitardo: number
): string {
  if (riskClasse === "CRITICO") {
    return `❌ RISK CRITICO: penalità attesa €${penalitaAttesa.toLocaleString("it-IT")} erode il margine. Residuo €${margineDopoRitardo.toLocaleString("it-IT")}. Valutare no-bid o negoziazione timeline e cap penalità.`;
  }
  if (riskClasse === "ALTO") {
    return `⚠️ RISK ALTO: penalità €${penalitaAttesa.toLocaleString("it-IT")}. Margine residuo €${margineDopoRitardo.toLocaleString("it-IT")}. Negoziare extension, buffer giorni e cap penalità.`;
  }
  if (riskClasse === "MEDIO") {
    return `Penalità possibile (€${penalitaAttesa.toLocaleString("it-IT")}). Margine residuo €${margineDopoRitardo.toLocaleString("it-IT")}. Accettabile con timeline realistica e subappalti confermati.`;
  }
  return `✓ Risk basso: penalità limitata (€${penalitaAttesa.toLocaleString("it-IT")}). Margine protetto.`;
}

export interface HistoricalGaraDelayRecord {
  categoria: string;
  regione: string;
  dataFineEffettiva: string;
  dataFineContrattuale: string;
}

export function createDelayRiskIndicators(
  historicalGares: HistoricalGaraDelayRecord[]
): DelayRiskIndicator[] {
  const grouped = new Map<string, HistoricalGaraDelayRecord[]>();

  for (const gara of historicalGares) {
    const key = `${gara.categoria}|${gara.regione}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(gara);
  }

  const indicators: DelayRiskIndicator[] = [];

  for (const [key, gares] of grouped) {
    const [categoria, regione] = key.split("|");

    const ritardate = gares.filter((g) => {
      const fine = new Date(g.dataFineEffettiva);
      const fineContrattuale = new Date(g.dataFineContrattuale);
      return (
        !Number.isNaN(fine.getTime()) &&
        !Number.isNaN(fineContrattuale.getTime()) &&
        fine > fineContrattuale
      );
    });

    const delayRateStorico = gares.length > 0 ? (ritardate.length / gares.length) * 100 : 0;

    const giorniRitardi = ritardate.map((g) => {
      const fine = new Date(g.dataFineEffettiva).getTime();
      const fineContrattuale = new Date(g.dataFineContrattuale).getTime();
      return (fine - fineContrattuale) / (1000 * 60 * 60 * 24);
    });

    const gioriniMedioRitardo =
      giorniRitardi.length > 0
        ? giorniRitardi.reduce((a, b) => a + b, 0) / giorniRitardi.length
        : 0;

    indicators.push({
      categoria,
      regione,
      delayRateStorico: Math.round(delayRateStorico),
      gioriniMedioRitardo: Math.round(gioriniMedioRitardo * 10) / 10,
      dataRilevamento: new Date().toISOString(),
    });
  }

  return indicators;
}

export type PhaseCriticita = "BASSA" | "MEDIA" | "ALTA";
export type TimelineCriticita = "BASSA" | "MEDIA" | "ALTA" | "CRITICA";

export interface ProjectPhase {
  nome: string;
  giorniPlannati: number;
  giorniRealiStorici: number;
  deltaPercent: number;
  criticita: PhaseCriticita;
}

export interface TimelineRiskAnalysis {
  fasi: ProjectPhase[];
  durataCompletataPlanned: number;
  durataCompletataRealistica: number;
  bufferSuggerito: number;
  criticita: TimelineCriticita;
  faseRischiosa: ProjectPhase | null;
  raccomandazione: string;
}

export type MitigationEffort = "BASSO" | "MEDIO" | "ALTO";

export interface MitigationStrategy {
  id: string;
  titolo: string;
  descrizione: string;
  impatto: number;
  effort: MitigationEffort;
  tempoImplementazione: string;
  note: string;
}

export interface MitigationPlan {
  strategieDisponibili: MitigationStrategy[];
  impattoCumulativo: number;
  penalitaDopoMitigazione: number;
  raccomandazioni: string[];
}

export interface DelayAdjustedBidPrice {
  prezzoBase: number;
  delayRiskPremium: number;
  prezzoFinal: number;
  premiumPercent: number;
  ribasso: number;
  raccomandazione: string;
}

export function analyzeTimelineRisk(
  tender: TenderDocument,
  durataContrattoGiorni: number,
  companyProfile: CompanyDelayProfile
): TimelineRiskAnalysis {
  const fasi = estimateProjectPhases(tender.category, durataContrattoGiorni);
  const overrunStorico = companyProfile.percentualeRitardiStorici / 100;

  const fasiConRischio: ProjectPhase[] = fasi.map((fase) => {
    const giorniRealiStorici = Math.round(fase.giorniPlannati * (1 + overrunStorico));
    const deltaPercent =
      fase.giorniPlannati > 0
        ? (giorniRealiStorici - fase.giorniPlannati) / fase.giorniPlannati
        : 0;
    return {
      ...fase,
      giorniRealiStorici,
      deltaPercent,
    };
  });

  const durataPlanned = fasiConRischio.reduce((sum, f) => sum + f.giorniPlannati, 0);
  const durataReale = fasiConRischio.reduce((sum, f) => sum + f.giorniRealiStorici, 0);
  const bufferNeeded = Math.max(0, durataReale - durataPlanned);
  const bufferSuggerito = Math.round(bufferNeeded * 1.2);

  const faseRischiosa =
    fasiConRischio.length > 0
      ? fasiConRischio.reduce((prev, curr) => (curr.deltaPercent > prev.deltaPercent ? curr : prev))
      : null;

  let criticita: TimelineCriticita = "BASSA";
  const plannedRef = durataPlanned || durataContrattoGiorni || 1;
  if (bufferSuggerito > plannedRef * 0.3) criticita = "CRITICA";
  else if (bufferSuggerito > plannedRef * 0.2) criticita = "ALTA";
  else if (bufferSuggerito > plannedRef * 0.1) criticita = "MEDIA";

  return {
    fasi: fasiConRischio,
    durataCompletataPlanned: durataPlanned,
    durataCompletataRealistica: durataReale,
    bufferSuggerito,
    criticita,
    faseRischiosa,
    raccomandazione: buildTimelineRecommendation(criticita, bufferSuggerito, faseRischiosa, plannedRef),
  };
}

function estimateProjectPhases(category: string, durataGiorni: number): ProjectPhase[] {
  const catKey = (category || "03").substring(0, 2);
  const patterns: Record<string, { percentuale: number; criticita: PhaseCriticita }[]> = {
    "01": [
      { percentuale: 20, criticita: "ALTA" },
      { percentuale: 65, criticita: "MEDIA" },
      { percentuale: 15, criticita: "BASSA" },
    ],
    "02": [
      { percentuale: 25, criticita: "ALTA" },
      { percentuale: 55, criticita: "MEDIA" },
      { percentuale: 20, criticita: "BASSA" },
    ],
    "03": [
      { percentuale: 15, criticita: "MEDIA" },
      { percentuale: 55, criticita: "MEDIA" },
      { percentuale: 20, criticita: "BASSA" },
      { percentuale: 10, criticita: "BASSA" },
    ],
  };

  const pattern = patterns[catKey] ?? patterns["03"];
  const nomiByKey: Record<string, string[]> = {
    "01": ["Scavi e preparazione", "Esecuzione scavi", "Ripristini"],
    "02": ["Fondazioni", "Strutture fondazione", "Collaudo"],
    "03": ["Preparazione cantiere", "Corpo opera", "Finiture", "Collaudo"],
  };
  const nomi = nomiByKey[catKey] ?? nomiByKey["03"];

  return pattern.map((p, i) => ({
    nome: nomi[i] ?? `Fase ${i + 1}`,
    giorniPlannati: Math.max(1, Math.round((durataGiorni * p.percentuale) / 100)),
    giorniRealiStorici: 0,
    deltaPercent: 0,
    criticita: p.criticita,
  }));
}

function buildTimelineRecommendation(
  criticita: TimelineCriticita,
  bufferSuggerito: number,
  faseRischiosa: ProjectPhase | null,
  durataPlanned: number
): string {
  const faseNome = faseRischiosa?.nome ?? "fase critica";
  const overrunPct = faseRischiosa ? Math.round(faseRischiosa.deltaPercent * 100) : 0;
  const critica = criticita;

  if (critica === "CRITICA") {
    return `❌ TIMELINE CRITICA: "${faseNome}" con ~${overrunPct}% overrun storico. Buffer +${bufferSuggerito} gg. Rinegoziare durata contratto o valutare no-bid.`;
  }
  if (critica === "ALTA") {
    const pctBuffer = durataPlanned > 0 ? Math.round((bufferSuggerito / durataPlanned) * 100) : 0;
    return `⚠️ TIMELINE STRETTA: buffer +${bufferSuggerito} gg (~${pctBuffer}% sul planned). Negoziare extension o penalty relief con la PA.`;
  }
  if (critica === "MEDIA") {
    return `Timeline fattibile con cautela. Buffer +${bufferSuggerito} gg. Gestire con attenzione "${faseNome}".`;
  }
  return `✓ Timeline accettabile. Buffer +${bufferSuggerito} gg copre il rischio storico.`;
}

export function generateMitigationStrategies(exposure: DelayPenaltyExposure): MitigationPlan {
  const strategie: MitigationStrategy[] = [
    {
      id: "mit-001",
      titolo: "Extension clause: giorni aggiuntivi senza penalità",
      descrizione:
        'Negoziare: "Primi X giorni di ritardo non generano penalità" (es. +5–10 gg oltre la tolleranza).',
      impatto: Math.min(
        50,
        exposure.durationGiorni > 0
          ? (exposure.giorniRitardoAttesi / exposure.durationGiorni) * 30
          : 25
      ),
      effort: "BASSO",
      tempoImplementazione: "Prima firma",
      note: "La PA spesso accetta buffer espliciti in contratto.",
    },
    {
      id: "mit-002",
      titolo: "Cap penalità: max % importo contratto",
      descrizione: 'Negoziare cap penalità al 5% dell\'importo (vs 10% standard).',
      impatto: 40,
      effort: "BASSO",
      tempoImplementazione: "Prima firma",
      note: "Standard di mercato 5–10%.",
    },
    {
      id: "mit-003",
      titolo: "Penalità decrescente nel tempo",
      descrizione: "Penalità che calano negli anni successivi (gare >24 mesi).",
      impatto: 25,
      effort: "MEDIO",
      tempoImplementazione: "Prima firma",
      note: "Utile per gare lunghe.",
    },
    {
      id: "mit-004",
      titolo: "Force majeure e varianti ordinate",
      descrizione:
        "Estensione timeline per varianti PA; esenzione penalità per cause esterne documentate.",
      impatto: 30,
      effort: "MEDIO",
      tempoImplementazione: "Prima firma",
      note: "Critico per lavori outdoor o zone complesse.",
    },
    {
      id: "mit-005",
      titolo: "Subappalti garantiti pre-firma",
      descrizione: "Accordi binding con subappaltatori prima della firma del contratto.",
      impatto: 40,
      effort: "ALTO",
      tempoImplementazione: "3–4 settimane prima invio offerta",
      note: "Riduce rischio indisponibilità squadre.",
    },
  ];

  const impattoCumulativo = Math.min(
    70,
    Math.round(strategie.reduce((sum, s) => sum + s.impatto, 0) * 0.6)
  );
  const penalitaDopoMitigazione = Math.round(
    exposure.penalitaAttesa * ((100 - impattoCumulativo) / 100)
  );

  const hasSubappalti = exposure.companyProfile.fattoriRischio.some((f) =>
    f.toLowerCase().includes("subappalt")
  );

  const raccomandazioni = [
    `Priorità 1: extension clause +${Math.max(5, Math.round(exposure.giorniRitardoAttesi))} gg`,
    "Priorità 2: cap penalità al 5% dell'importo",
    exposure.giorniRitardoAttesi > 20
      ? "Priorità 3: penalità decrescente per gara lunga"
      : "Priorità 3: clausola force majeure / varianti ordinate",
    hasSubappalti
      ? "CRITICO: subappalti binding prima della firma"
      : "Valutare subappalti garantiti per ridurre il rischio",
  ];

  return {
    strategieDisponibili: strategie,
    impattoCumulativo,
    penalitaDopoMitigazione,
    raccomandazioni,
} from "../types";

function parseTenderImporto(value: string): number {
  const cleaned = value.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export function extractPenaltyClausesFromTender(tender: TenderDocument): PenaltyClause[] {
  const clauses: PenaltyClause[] = [];
  let idx = 0;

  for (const penalty of tender.penalties ?? []) {
    const lc = penalty.toLowerCase();
    const importo = parseTenderImporto(tender.value);

    if (lc.includes("ritardo") || lc.includes("giorno")) {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "ritardo_esecuzione",
        descrizione: penalty,
        importoGiornaliero: importo * 0.001,
        giorniTolleranza: 5,
        importoMassimo: importo * 0.1,
      });
    } else if (lc.includes("inadempimento") || lc.includes("rescissione")) {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "inadempimento",
        descrizione: penalty,
        importoFisso: importo * 0.05,
        giorniTolleranza: 0,
      });
    } else if (lc.includes("qualità") || lc.includes("difetto")) {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "qualita",
        descrizione: penalty,
        percentualeImporto: 2,
        giorniTolleranza: 0,
      });
    } else {
      clauses.push({
        id: `pen-${idx++}`,
        tipo: "altro",
        descrizione: penalty,
        percentualeImporto: 1,
        giorniTolleranza: 10,
      });
    }
  }

  if (clauses.length === 0) {
    const importo = parseTenderImporto(tender.value);
    clauses.push({
      id: "pen-default",
      tipo: "ritardo_esecuzione",
      descrizione: "Penale standard per ritardo esecuzione (1‰/giorno fino al 10%)",
      importoGiornaliero: importo * 0.001,
      giorniTolleranza: 5,
      importoMassimo: importo * 0.1,
    });
  }

  return clauses;
}

export function calculatePenalty(
  clause: PenaltyClause,
  giorniRitardo: number,
  importoContratto: number
): number {
  const giorniEccesso = Math.max(0, giorniRitardo - clause.giorniTolleranza);
  if (giorniEccesso === 0) return 0;

  let penale = 0;
  if (clause.importoGiornaliero) {
    penale = clause.importoGiornaliero * giorniEccesso;
  } else if (clause.importoFisso) {
    penale = clause.importoFisso;
  } else if (clause.percentualeImporto) {
    penale = (importoContratto * clause.percentualeImporto) / 100;
  }

  if (clause.importoMassimo) {
    penale = Math.min(penale, clause.importoMassimo);
  }

  return penale;
}

export function classifyDelayRisk(
  penalitaAttesa: number,
  margineStimato: number
): DelayRiskClasse {
  if (margineStimato <= 0) return "CRITICO";
  const ratio = penalitaAttesa / margineStimato;
  if (ratio < 0.1) return "BASSO";
  if (ratio < 0.3) return "MEDIO";
  if (ratio < 0.7) return "ALTO";
  return "CRITICO";
}

export function generateMitigationStrategies(
  exposure: Omit<DelayPenaltyExposure, "mitigazioni" | "generatedAt">
): string[] {
  const strats: string[] = [];
  if (exposure.riskClasse === "CRITICO" || exposure.riskClasse === "ALTO") {
    strats.push("Negoziare dilazione penali o franchigia contrattuale prima della firma");
    strats.push("Inserire clausola revisione prezzi per cause di forza maggiore");
    strats.push("Allocare buffer temporale del 15% sulla cronoprogramma");
  }
  strats.push("Attivare monitoraggio settimanale avanzamento lavori vs. cronoprogramma");
  strats.push("Identificare subappaltatori di riserva per attività critiche");
  if (exposure.penaltyClauses.some((c) => c.tipo === "qualita")) {
    strats.push("Implementare sistema di controllo qualità in corso d'opera");
  }
  const impattoCumulativo = Math.min(
    (exposure.penalitaWorstCase / Math.max(exposure.margineDopoRitardo, 1)) * 100,
    100
  );
  if (impattoCumulativo > 50) {
    strats.push("Valutare polizza assicurativa rischio penali contrattuali");
  }
  return strats;
}

export function buildDelayRiskIndicators(
  tender: TenderDocument,
  delayProfile: CompanyDelayProfile
): DelayRiskIndicator[] {
  const importo = parseTenderImporto(tender.value);
  const indicators: DelayRiskIndicator[] = [
    {
      fattore: "Storico ritardi azienda",
      peso: 0.3,
      valore: delayProfile.percentualeGareConRitardo / 100,
      contributo: (delayProfile.percentualeGareConRitardo / 100) * 0.3,
    },
    {
      fattore: "Complessità gara",
      peso: 0.25,
      valore: importo > 2_000_000 ? 0.8 : importo > 500_000 ? 0.5 : 0.3,
      contributo:
        (importo > 2_000_000 ? 0.8 : importo > 500_000 ? 0.5 : 0.3) * 0.25,
    },
    {
      fattore: "Severità penali",
      peso: 0.25,
      valore: tender.penalties.length > 3 ? 0.9 : tender.penalties.length > 1 ? 0.6 : 0.3,
      contributo:
        (tender.penalties.length > 3 ? 0.9 : tender.penalties.length > 1 ? 0.6 : 0.3) * 0.25,
    },
    {
      fattore: "Anomalie contrattuali",
      peso: 0.2,
      valore: tender.anomalies.length > 2 ? 0.8 : tender.anomalies.length > 0 ? 0.5 : 0.1,
      contributo:
        (tender.anomalies.length > 2 ? 0.8 : tender.anomalies.length > 0 ? 0.5 : 0.1) * 0.2,
    },
  ];
  return indicators;
}

export function createDelayPenaltyExposure(
  tender: TenderDocument,
  margineStimato: number = 100_000,
  delayProfile?: CompanyDelayProfile
): DelayPenaltyExposure {
  const profile = delayProfile ?? {
    mediaGiorniRitardo: 15,
    percentualeGareConRitardo: 25,
    ritardoMaxStorico: 45,
    causeRitardoFrequenti: ["Meteo avverso", "Problemi fornitura materiali"],
  };

  const importo = parseTenderImporto(tender.value);
  const penaltyClauses = extractPenaltyClausesFromTender(tender);
  const riskIndicators = buildDelayRiskIndicators(tender, profile);

  const giorniRitardoProbabili = Math.round(profile.mediaGiorniRitardo * 1.2);
  const penalitaAttesa = penaltyClauses.reduce(
    (sum, c) => sum + calculatePenalty(c, giorniRitardoProbabili, importo),
    0
  );
  const penalitaWorstCase = penaltyClauses.reduce(
    (sum, c) => sum + calculatePenalty(c, profile.ritardoMaxStorico, importo),
    0
  );
  const margineDopoRitardo = margineStimato - penalitaAttesa;
  const riskClasse = classifyDelayRisk(penalitaAttesa, margineStimato);

  const partial: Omit<DelayPenaltyExposure, "mitigazioni" | "generatedAt"> = {
    gara: tender,
    penaltyClauses,
    giorniRitardoProbabili,
    penalitaAttesa,
    penalitaWorstCase,
    margineDopoRitardo,
    riskIndicators,
    riskClasse,
  };

  return {
    ...partial,
    mitigazioni: generateMitigationStrategies(partial),
    generatedAt: new Date().toISOString(),
  };
}

export function calculateDelayAdjustedBidPrice(
  exposure: DelayPenaltyExposure,
  _margineTarget: number,
  prezzoBaseInput?: number
): DelayAdjustedBidPrice {
  const importoGara = parseTenderValue(exposure.gara.value) || 500_000;
  const prezzoBase = prezzoBaseInput ?? Math.round(importoGara * 0.92);
  const delayRiskPremium = Math.round(exposure.penalitaAttesa * 1.5);
  const prezzoFinal = prezzoBase + delayRiskPremium;
  const premiumPercent = prezzoBase > 0 ? (delayRiskPremium / prezzoBase) * 100 : 0;

  const ribasso =
    exposure.riskClasse === "CRITICO"
      ? 2
      : exposure.riskClasse === "ALTO"
        ? 3
        : exposure.riskClasse === "MEDIO"
          ? 5
          : 7;

  let raccomandazione = "";
  if (exposure.riskClasse === "CRITICO") {
    raccomandazione = `❌ Prezzo non sostenibile: penalità attesa €${exposure.penalitaAttesa.toLocaleString("it-IT")} erode il margine. Ribasso ${ribasso}% rischioso — valuta no-bid.`;
  } else if (exposure.riskClasse === "ALTO") {
    raccomandazione = `⚠️ Aggiungi premium €${delayRiskPremium.toLocaleString("it-IT")} al prezzo. Ribasso conservativo ${ribasso}%.`;
  } else {
    raccomandazione = `Premium €${delayRiskPremium.toLocaleString("it-IT")} per coprire il rischio ritardo. Ribasso ${ribasso}% sostenibile.`;
  }

  return {
    prezzoBase,
    delayRiskPremium,
    prezzoFinal: Math.round(prezzoFinal),
    premiumPercent: Math.round(premiumPercent * 10) / 10,
    ribasso,
    raccomandazione,
  };
}

export const TIMELINE_CRITICITA_STYLES: Record<
  TimelineCriticita,
  { box: string; text: string }
> = {
  BASSO: { box: "bg-emerald-950/20 border-emerald-900/50", text: "text-emerald-400" },
  MEDIA: { box: "bg-amber-950/20 border-amber-900/50", text: "text-amber-400" },
  ALTA: { box: "bg-orange-950/20 border-orange-900/50", text: "text-orange-400" },
  CRITICA: { box: "bg-red-950/20 border-red-900/50", text: "text-red-400" },
};

export function isDelayTrapGara(exposure: DelayPenaltyExposure): boolean {
  if (exposure.margineDopoRitardo < 0) return true;
  if (exposure.riskClasse === "CRITICO") return true;
  if (exposure.margineStimato > 0 && exposure.penalitaAttesa / exposure.margineStimato > 0.5) {
    return true;
  }
  return false;
}

export const DELAY_RISK_STYLES: Record<
  DelayRiskClasse,
  { box: string; text: string; score: string }
> = {
  BASSO: {
    box: "bg-emerald-950/20 border-emerald-900/50",
    text: "text-emerald-400",
    score: "text-emerald-400",
  },
  MEDIO: {
    box: "bg-amber-950/20 border-amber-900/50",
    text: "text-amber-400",
    score: "text-amber-400",
  },
  ALTO: {
    box: "bg-orange-950/20 border-orange-900/50",
    text: "text-orange-400",
    score: "text-orange-400",
  },
  CRITICO: {
    box: "bg-red-950/20 border-red-900/50",
    text: "text-red-400",
    score: "text-red-400",
  },
  prezzoBase: number,
  exposure: DelayPenaltyExposure
): number {
  const premium =
    exposure.riskClasse === "CRITICO"
      ? exposure.penalitaAttesa * 1.5
      : exposure.riskClasse === "ALTO"
      ? exposure.penalitaAttesa * 1.2
      : exposure.penalitaAttesa * 0.5;
  return prezzoBase + premium;
}

export const DELAY_RISK_CLASS: Record<DelayRiskClasse, string> = {
  BASSO: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  MEDIO: "text-blue-400 border-blue-800 bg-blue-950/40",
  ALTO: "text-amber-400 border-amber-800 bg-amber-950/40",
  CRITICO: "text-red-400 border-red-800 bg-red-950/40",
};
