import type {
  TenderDocument,
  VariantClause,
  ClaimsClause,
  CompanyVariantHistory,
  VariantRiskExposure,
  VariantRiskClasse,
  CompanyProfile,
  VariantClauseTipo,
} from "../types";
import { parseTenderValue } from "./bidCalculations";

export function defaultVariantClausesForTender(tender: TenderDocument): VariantClause[] {
  return [
    {
      id: "var-default-1",
      titolo: "Varianti ordinarie (art. 106 Codice Contratti)",
      descrizione:
        "Varianti su richiesta della Stazione Appaltante per modifiche tecniche, secondo normativa vigente.",
      tipoVariante: "VARIANTE_AUTORIZZABILE",
      percentualeMaxImporto: 10,
      proceduaAutorizzazione:
        "Su richiesta SA, entro termini contrattuali, con accordo impresa",
      consequenzeNegazione:
        "Se impresa rifiuta variante richiesta da SA: risoluzione contratto per inadempimento",
      note: "Default se bando non specifica varianti esplicite",
    },
  ];
}

export function defaultClaimsClausesForTender(): ClaimsClause[] {
  return [
    {
      id: "claim-default-1",
      titolo: "Claims generici (extra-costi)",
      descrizione:
        "Rivendicazioni per extra-costi da circostanze non previste (scavi inaspettati, servizi nascosti).",
      tipoClaimsAccettato: "PARZIALE",
      percentualeMaxCodifica: 5,
      tempoRivendicazione: "Entro 30 giorni da evento generante claim",
      oneriProva:
        "Impresa deve provare nesso causale diretto, documentazione contemporanea",
      consequenze: "Se claim negato per mancanza prove: impresa sostiene extra-costi",
      note: "Default standard italiano",
    },
  ];
}

export function defaultCompanyVariantHistory(
  tender: TenderDocument,
  companyProfile?: CompanyProfile | null
): CompanyVariantHistory {
  const importo = parseTenderValue(tender.value) || 500_000;
  const historical = companyProfile?.historicalTenders ?? [];
  const richieste = historical.length > 8 ? 14 : 10;
  const approvate = Math.round(richieste * 0.75);
  const negate = richieste - approvate;

  return {
    id: companyProfile?.vatNumber ?? "company-default",
    numeroVariantiRichieste: richieste,
    numeroVariantiApprovate: approvate,
    numeroVariantiNegate: negate,
    importoMedioVariante: Math.round(importo * 0.04),
    importoMedioVarianteNegata: Math.round(importo * 0.03),
    tempoMedioApprovazione: 25,
    contestazioniBySA: historical.length > 5 ? 2 : 1,
  };
}

export function createVariantClaimsRiskExposure(
  tender: TenderDocument,
  variantClauses: VariantClause[],
  claimsClauses: ClaimsClause[],
  companyProfile: CompanyVariantHistory
): VariantRiskExposure {
  const variants =
    variantClauses.length > 0 ? variantClauses : defaultVariantClausesForTender(tender);
  const claims =
    claimsClauses.length > 0 ? claimsClauses : defaultClaimsClausesForTender();

  const importoGara = parseTenderValue(tender.value) || 500_000;
  const probabilitaVariantRichiesta = estimateVariantProbability(tender.category);
  const numeroVariantiStimate = Math.max(
    1,
    Math.round((importoGara / 500_000) * (probabilitaVariantRichiesta / 100))
  );

  const importoMedioVariantaAttesa = Math.round(
    companyProfile.importoMedioVariante || importoGara * 0.05
  );
  const importoTotaleVariantiAttese = numeroVariantiStimate * importoMedioVariantaAttesa;

  const percentualeApprovazione =
    companyProfile.numeroVariantiRichieste > 0
      ? (companyProfile.numeroVariantiApprovate / companyProfile.numeroVariantiRichieste) * 100
      : 70;

  const importoVariantiNnegatteAtteso = Math.round(
    importoTotaleVariantiAttese * ((100 - percentualeApprovazione) / 100)
  );

  const probabilitaClaimsRivendicazione = estimateClaimsProbability(tender.category);
  const numeroClaimsAttesi = Math.max(
    1,
    Math.round((importoGara / 750_000) * (probabilitaClaimsRivendicazione / 100))
  );
  const importoMedioClaimsAtteso = Math.round(importoGara * 0.03);
  const importoTotaleClaimsAtteso = numeroClaimsAttesi * importoMedioClaimsAtteso;
  const percentualeApprovazioneClaims = 35;

  const esposizioneTotale =
    importoVariantiNnegatteAtteso +
    importoTotaleClaimsAtteso * (1 - percentualeApprovazioneClaims / 100);

  const riskClasse = classifyVariantRisk(
    variants,
    probabilitaVariantRichiesta,
    esposizioneTotale,
    importoGara
  );

  return {
    id: `var-${Date.now()}`,
    gara: tender,
    dataAnalisi: new Date().toISOString(),
    variantClauses: variants,
    claimsClauses: claims,
    companyProfile,
    probabilitaVariantRichiesta,
    numeroVariantiStimate,
    importoMedioVariantaAttesa,
    importoTotaleVariantiAttese,
    percentualeApprovazione: Math.round(percentualeApprovazione),
    importoVariantiNnegatteAtteso,
    probabilitaClaimsRivendicazione,
    numeroClaimsAttesi,
    importoMedioClaimsAtteso,
    importoTotaleClaimsAtteso,
    percentualeApprovazioneClaims,
    riskClasse,
    esposizioneTotale: Math.round(esposizioneTotale),
    recommendation: buildVariantRecommendation(
      riskClasse,
      Math.round(esposizioneTotale),
      variants,
      claims
    ),
  };
}

function estimateVariantProbability(category: string): number {
  const patterns: Record<string, number> = {
    "01": 70,
    "02": 65,
    "03": 50,
    "04": 40,
    "05": 35,
  };
  const catKey = (category || "03").substring(0, 2);
  return patterns[catKey] ?? 50;
}

function estimateClaimsProbability(category: string): number {
  const patterns: Record<string, number> = {
    "01": 80,
    "02": 70,
    "03": 50,
    "04": 30,
    "05": 20,
  };
  const catKey = (category || "03").substring(0, 2);
  return patterns[catKey] ?? 40;
}

function classifyVariantRisk(
  clauses: VariantClause[],
  probabilita: number,
  esposizione: number,
  importoGara: number
): VariantRiskClasse {
  const variantiVietate = clauses.filter((c) => c.tipoVariante === "VARIANTE_VIETATA").length;
  if (variantiVietate > 0 && probabilita > 40) return "CRITICO";

  const esposizionePct = importoGara > 0 ? (esposizione / importoGara) * 100 : 0;
  if (esposizionePct > 20) return "CRITICO";
  if (esposizionePct > 10) return "ALTO";
  if (esposizionePct > 5 || probabilita > 60) return "MEDIO";
  return "BASSO";
}

function buildVariantRecommendation(
  riskClasse: VariantRiskClasse,
  esposizione: number,
  variantClauses: VariantClause[],
  claimsClauses: ClaimsClause[]
): string {
  const variantiVietate = variantClauses.filter((c) => c.tipoVariante === "VARIANTE_VIETATA");
  const claimsNegati = claimsClauses.filter((c) => c.tipoClaimsAccettato === "NEGATO");

  if (riskClasse === "CRITICO") {
    return `❌ RISK CRITICO: esposizione €${esposizione.toLocaleString("it-IT")} troppo alta.${
      variantiVietate.length > 0
        ? ` Varianti vietate: ${variantiVietate.map((v) => v.titolo).join(", ")}.`
        : ""
    } Valuta no-bid o negozia clausole prima dell'offerta.`;
  }
  if (riskClasse === "ALTO") {
    return `⚠️ RISK ALTO: esposizione €${esposizione.toLocaleString("it-IT")} da varianti/claims. Negozia procedure autorizzazione, cap claims e tempi rivendicazione.${
      claimsNegati.length > 0 ? " Attenzione: claims sostanzialmente negati nel bando." : ""
    }`;
  }
  if (riskClasse === "MEDIO") {
    return `Varianti/claims possibili (€${esposizione.toLocaleString("it-IT")}). Accettabile se varianti autorizzabili e oneri prova chiari.`;
  }
  return `✓ Risk basso su varianti/claims (€${esposizione.toLocaleString("it-IT")}). Procedere con cautela su conteggio quantità.`;
}

export function identifyProblematicVariantClauses(clauses: VariantClause[]): VariantClause[] {
  return clauses.filter(
    (c) =>
      c.tipoVariante === "VARIANTE_VIETATA" ||
      (c.percentualeMaxImporto != null && c.percentualeMaxImporto < 3) ||
      c.descrizione.toLowerCase().includes("escluso") ||
      c.descrizione.toLowerCase().includes("vietato")
  );
}

function extractDaysFromText(text: string): number | null {
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function identifyUnfavorableClaimsClauses(clauses: ClaimsClause[]): ClaimsClause[] {
  return clauses.filter((c) => {
    const days = c.tempoRivendicazione
      ? extractDaysFromText(c.tempoRivendicazione)
      : null;
    return (
      c.tipoClaimsAccettato === "NEGATO" ||
      c.tipoClaimsAccettato === "LIMITATO" ||
      (c.percentualeMaxCodifica != null && c.percentualeMaxCodifica < 3) ||
      (days != null && days < 20)
    );
  });
}

export type NegotiationEffort = "BASSO" | "MEDIO" | "ALTO";

export interface VariantNegotiationStrategy {
  id: string;
  titolo: string;
  descrizione: string;
  tipoClausola: VariantClauseTipo;
  azione: string;
  testoProposto: string;
  impatto: number;
  effort: NegotiationEffort;
  successRate: number;
  note: string;
}

export interface VariantNegotiationPlan {
  strategieDisponibili: VariantNegotiationStrategy[];
  riskReductionPotenziale: number;
  esposizioneDoponegoziazione: number;
  raccomandazioni: string[];
}

export function generateVariantNegotiationStrategies(
  exposure: VariantRiskExposure
): VariantNegotiationPlan {
  const hasVietate = exposure.variantClauses.some(
    (c) => c.tipoVariante === "VARIANTE_VIETATA"
  );
  const catKey = (exposure.gara.category || "03").substring(0, 2);
  const isScaviFondazioni = catKey === "01" || catKey === "02";

  const strategie: VariantNegotiationStrategy[] = [
    {
      id: "neg-var-001",
      titolo: "Aumentare % max importo varianti",
      descrizione:
        "Bando limita varianti a percentuali basse: chiedere almeno 8–10% (standard di mercato).",
      tipoClausola: "VARIANTE_AUTORIZZABILE",
      azione:
        "In offerta: articolo modificativo — varianti autorizzabili fino al 10% dell'importo.",
      testoProposto:
        "Le varianti richieste dalla Stazione Appaltante potranno interessare fino al 10% dell'importo iniziale, con oneri a carico della SA ove superi le soglie contrattuali.",
      impatto: 35,
      effort: "BASSO",
      successRate: 60,
      note: "PA spesso accetta se ben giustificato (es. scavi inaspettati).",
    },
    {
      id: "neg-var-002",
      titolo: "Procedure varianti accelerate",
      descrizione:
        "Varianti entro soglia (es. <5%) approvate automaticamente in tempi certi.",
      tipoClausola: "VARIANTE_DISCREZIONALE",
      azione:
        "Proporre: varianti <5% importo approvate automaticamente in 10 giorni lavorativi.",
      testoProposto:
        "Varianti richieste da SA di importo inferiore al 5% dell'importo contratto sono approvate automaticamente, con comunicazione entro 10 gg.",
      impatto: 30,
      effort: "MEDIO",
      successRate: 45,
      note: "Richiede negoziazione con ufficio appalti.",
    },
    {
      id: "neg-var-003",
      titolo: "Eccezioni a varianti vietate (cause esterne)",
      descrizione:
        "Sbloccare varianti vietate per scavi, servizi nascosti o norme sopravvenute.",
      tipoClausola: "VARIANTE_VIETATA",
      azione:
        "Proporre eccezioni per scavi/servizi nascosti e disposizioni normative sopravvenute.",
      testoProposto:
        "Fatto salvo il divieto generale, le varianti sono autorizzabili se derivanti da scavi o servizi non prevedibili, norme sopravvenute o richieste di enti terzi.",
      impatto: 40,
      effort: "ALTO",
      successRate: isScaviFondazioni ? 40 : 35,
      note: "Prioritario per scavi/fondazioni.",
    },
    {
      id: "neg-var-004",
      titolo: "Claims con oneri prova semplificati",
      descrizione:
        "Computo metrico redatto entro X giorni dall'evento come prova principale.",
      tipoClausola: "VARIANTE_AUTORIZZABILE",
      azione:
        "Proporre ammissione claims supportati da computo metrico entro 20 gg dall'evento.",
      testoProposto:
        "Le rivendicazioni di extra-costi sono ammesse se supportate da computo metrico redatto entro 20 gg dall'evento, salvo documentazione integrativa su richiesta della SA.",
      impatto: 25,
      effort: "MEDIO",
      successRate: 50,
      note: "Utile se il bando impone oneri prova pesanti.",
    },
    {
      id: "neg-var-005",
      titolo: "Compensazione se SA nega variante già avviata",
      descrizione:
        "Se la SA richiede una variante poi la nega, i costi parziali restano a carico SA.",
      tipoClausola: "VARIANTE_AUTORIZZABILE",
      azione:
        "Proporre compensazione costi per varianti richieste da SA e successivamente negate.",
      testoProposto:
        "Qualora la SA richieda una variante e l'Impresa ne inizi l'esecuzione, la successiva negazione comporta compensazione dei costi sostenuti per la realizzazione parziale.",
      impatto: 20,
      effort: "MEDIO",
      successRate: 40,
      note: "Equità contrattuale — PA può resistere.",
    },
  ];

  const riskReductionPotenziale = Math.min(
    80,
    Math.round(
      strategie.reduce((sum, s) => sum + s.impatto * (s.successRate / 100), 0) * 0.4
    )
  );

  const esposizioneDoponegoziazione = Math.round(
    exposure.esposizioneTotale * ((100 - riskReductionPotenziale) / 100)
  );

  const budgetLegaleK = Math.max(
    1,
    Math.round((exposure.esposizioneTotale * riskReductionPotenziale) / 100 / 1000)
  );

  const raccomandazioni = [
    `Priorità 1: Strategia 1 (max % varianti) — success rate ~${strategie[0].successRate}%`,
    isScaviFondazioni
      ? "Priorità 2: Strategie 3–4 (eccezioni vietate / claims semplificati) — categoria ad alto rischio"
      : "Priorità 2: Strategia 4 (claims semplificati) se oneri prova sono onerosi",
    hasVietate
      ? "CRITICO: varianti vietate presenti — negoziare eccezioni prima della firma"
      : "Valutare negoziazione preventiva in sede di offerta",
    `Budget indicativo: ~${budgetLegaleK}k€ per supporto legale pre-firma`,
  ];

  return {
    strategieDisponibili: strategie,
    riskReductionPotenziale,
    esposizioneDoponegoziazione,
    raccomandazioni,
  };
}

export interface ClaimsHistoricalPattern {
  categoria: string;
  regione: string;
  percentualeProgetti_ConClaims: number;
  mediaClaimsPerProgetto: number;
  importoMedioClaim: number;
  percentualeClaimsApprovati: number;
  tempoMedioRisoluzioneGiorni: number;
  principaliTipiClaims: string[];
  dataRilevamento: string;
}

export interface ClaimsRiskIndicator {
  gara: TenderDocument;
  historicoSimilari: ClaimsHistoricalPattern;
  riskClaimsAlti: boolean;
  fattoriAggravanti: string[];
  fattoriMitiganti: string[];
  estimatedClaimsCount: number;
  estimatedClaimsValue: number;
  recommendation: string;
}

const DEFAULT_CLAIMS_PATTERNS: Record<string, ClaimsHistoricalPattern> = {
  "01": {
    categoria: "01",
    regione: "IT",
    percentualeProgetti_ConClaims: 85,
    mediaClaimsPerProgetto: 3.2,
    importoMedioClaim: 45_000,
    percentualeClaimsApprovati: 35,
    tempoMedioRisoluzioneGiorni: 120,
    principaliTipiClaims: [
      "Scavi inaspettati",
      "Servizi sotterranei",
      "Sottofondi variabili",
    ],
    dataRilevamento: new Date().toISOString(),
  },
  "02": {
    categoria: "02",
    regione: "IT",
    percentualeProgetti_ConClaims: 70,
    mediaClaimsPerProgetto: 2.1,
    importoMedioClaim: 38_000,
    percentualeClaimsApprovati: 40,
    tempoMedioRisoluzioneGiorni: 100,
    principaliTipiClaims: ["Cedimento sottofondi", "Roccia inaspettata"],
    dataRilevamento: new Date().toISOString(),
  },
  "03": {
    categoria: "03",
    regione: "IT",
    percentualeProgetti_ConClaims: 50,
    mediaClaimsPerProgetto: 1.5,
    importoMedioClaim: 28_000,
    percentualeClaimsApprovati: 42,
    tempoMedioRisoluzioneGiorni: 90,
    principaliTipiClaims: ["Varianti quantità", "Prezzi unitari"],
    dataRilevamento: new Date().toISOString(),
  },
};

function fallbackClaimsPattern(gara: TenderDocument): ClaimsHistoricalPattern {
  const catKey = (gara.category || "03").substring(0, 2);
  return (
    DEFAULT_CLAIMS_PATTERNS[catKey] ?? {
      categoria: catKey,
      regione: gara.region || "IT",
      percentualeProgetti_ConClaims: 45,
      mediaClaimsPerProgetto: 1.2,
      importoMedioClaim: 25_000,
      percentualeClaimsApprovati: 38,
      tempoMedioRisoluzioneGiorni: 90,
      principaliTipiClaims: ["Extra-costi non previsti"],
      dataRilevamento: new Date().toISOString(),
    }
  );
}

export function analyzeClaimsRisk(
  gara: TenderDocument,
  historicoGareSimili?: ClaimsHistoricalPattern[]
): ClaimsRiskIndicator {
  const catKey = (gara.category || "03").substring(0, 2);
  const historicoSimilare =
    historicoGareSimili?.find(
      (h) => h.categoria === catKey && h.regione === gara.region
    ) ?? null;

  const pattern = historicoSimilare ?? fallbackClaimsPattern(gara);
  const importoGara = parseTenderValue(gara.value) || 500_000;
  const titleLower = gara.title.toLowerCase();

  const fattoriAggravanti: string[] = [];
  if (titleLower.includes("scav")) {
    fattoriAggravanti.push("Categoria scavi: alta probabilità claims");
  }
  if (titleLower.includes("centro storico")) {
    fattoriAggravanti.push("Centro storico: alta complessità, molti claims");
  }
  if (titleLower.includes("risanamento")) {
    fattoriAggravanti.push("Risanamento: variabilità sottofondi, claims frequenti");
  }
  if (importoGara > 2_000_000) {
    fattoriAggravanti.push("Importo alto: più fasi, più probabilità claims");
  }

  const fattoriMitiganti: string[] = [];
  if (titleLower.includes("nuova costruzione")) {
    fattoriMitiganti.push("Nuova costruzione: prevedibilità maggiore");
  }
  if (titleLower.includes("finiture")) {
    fattoriMitiganti.push("Finiture: basso rischio claims");
  }

  const estimatedClaimsCount = Math.max(
    1,
    Math.round(
      pattern.mediaClaimsPerProgetto *
        ((fattoriAggravanti.length + 1) / (fattoriMitiganti.length + 1))
    )
  );
  const estimatedClaimsValue = estimatedClaimsCount * pattern.importoMedioClaim;

  const riskClaimsAlti =
    pattern.percentualeProgetti_ConClaims > 70 ||
    (importoGara > 0 && estimatedClaimsValue > importoGara * 0.1);

  const recommendation =
    riskClaimsAlti && pattern.percentualeClaimsApprovati < 50
      ? `⚠️ RISK CLAIMS ALTO: ${pattern.percentualeProgetti_ConClaims}% progetti simili hanno claims. Solo ${pattern.percentualeClaimsApprovati}% approvati. Budgetta €${estimatedClaimsValue.toLocaleString("it-IT")} come esposizione e negozia le clausole claims.`
      : `Claims possibili (€${estimatedClaimsValue.toLocaleString("it-IT")} stimati). Prepara computi metrici e documentazione contemporanea.`;

  return {
    gara,
    historicoSimilari: pattern,
    riskClaimsAlti,
    fattoriAggravanti,
    fattoriMitiganti,
    estimatedClaimsCount,
    estimatedClaimsValue,
    recommendation,
  };
}

export interface VariantAdjustedBidPrice {
  prezzoBase: number;
  variantRiskPremium: number;
  claimsRiskPremium: number;
  prezzoFinal: number;
  premiumPercent: number;
  ribasso: number;
  raccomandazione: string;
}

export function calculateVariantAdjustedBidPrice(
  exposure: VariantRiskExposure,
  prezzoBaseInput?: number
): VariantAdjustedBidPrice {
  const importoGara = parseTenderValue(exposure.gara.value) || 500_000;
  const prezzoBase = prezzoBaseInput ?? Math.round(importoGara * 0.92);

  const variantRiskPremium = Math.round(exposure.importoVariantiNnegatteAtteso * 1.3);
  const claimsNonApprovati =
    exposure.importoTotaleClaimsAtteso *
    ((100 - exposure.percentualeApprovazioneClaims) / 100);
  const claimsRiskPremium = Math.round(claimsNonApprovati * 1.5);

  const prezzoFinal = prezzoBase + variantRiskPremium + claimsRiskPremium;
  const premiumTotal = variantRiskPremium + claimsRiskPremium;
  const premiumPercent = prezzoBase > 0 ? (premiumTotal / prezzoBase) * 100 : 0;

  const ribasso =
    exposure.riskClasse === "CRITICO"
      ? 1
      : exposure.riskClasse === "ALTO"
        ? 2.5
        : exposure.riskClasse === "MEDIO"
          ? 4.5
          : 6;

  let raccomandazione = "";
  if (exposure.riskClasse === "CRITICO") {
    raccomandazione = `❌ Prezzo non sostenibile: rischio varianti/claims (€${premiumTotal.toLocaleString("it-IT")}) erode il margine. Ribasso ${ribasso}% molto rischioso — valuta no-bid o negozia clausole prima.`;
  } else if (exposure.riskClasse === "ALTO") {
    raccomandazione = `⚠️ Aggiungi €${premiumTotal.toLocaleString("it-IT")} al prezzo (varianti + claims). Ribasso conservativo ${ribasso}%.`;
  } else {
    raccomandazione = `Premium €${premiumTotal.toLocaleString("it-IT")} per coprire il rischio. Ribasso ${ribasso}% sostenibile se la negoziazione riesce.`;
  }

  return {
    prezzoBase,
    variantRiskPremium,
    claimsRiskPremium,
    prezzoFinal: Math.round(prezzoFinal),
    premiumPercent: Math.round(premiumPercent * 10) / 10,
    ribasso,
    raccomandazione,
  };
}

export function isVariantTrapGara(exposure: VariantRiskExposure): boolean {
  if (exposure.riskClasse === "CRITICO") return true;
  const importoGara = parseTenderValue(exposure.gara.value) || 1;
  if (importoGara > 0 && exposure.esposizioneTotale / importoGara > 0.15) return true;
  const vietate = exposure.variantClauses.filter(
    (c) => c.tipoVariante === "VARIANTE_VIETATA"
  ).length;
  return vietate > 0 && exposure.probabilitaVariantRichiesta > 50;
}

export const CLAIMS_RISK_LEVEL_STYLES = {
  alto: { box: "bg-red-950/20 border-red-900/50", text: "text-red-400" },
  medio: { box: "bg-amber-950/20 border-amber-900/50", text: "text-amber-400" },
} as const;

export const NEGOTIATION_EFFORT_CLASS: Record<NegotiationEffort, string> = {
  BASSO: "text-emerald-400",
  MEDIO: "text-amber-400",
  ALTO: "text-red-400",
};

export const VARIANT_RISK_STYLES: Record<
  VariantRiskClasse,
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
};

export const VARIANT_TIPO_BADGE: Record<string, string> = {
  VARIANTE_VIETATA: "bg-red-900/60 text-red-400",
  VARIANTE_AUTORIZZABILE: "bg-emerald-900/60 text-emerald-400",
  VARIANTE_DISCREZIONALE: "bg-amber-900/60 text-amber-400",
};

export const CLAIMS_TIPO_BADGE: Record<string, string> = {
  TOTALE: "bg-emerald-900/60 text-emerald-400",
  PARZIALE: "bg-amber-900/60 text-amber-400",
  LIMITATO: "bg-orange-900/60 text-orange-400",
  NEGATO: "bg-red-900/60 text-red-400",
};
