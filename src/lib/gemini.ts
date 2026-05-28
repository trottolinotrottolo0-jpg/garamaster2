/// <reference types="vite/client" />
import { EXPLAINABILITY_JSON_INLINE, normalizeExplainability } from "./explainability";
import type {
  TenderDocument,
  CompanyProfile,
  BidNoBidResult,
  BidPricingResult,
  PricingScenario,
  RedFlagAnalysisResult,
  CapacityAnalysisResult,
  ProfitabilityGateResult,
  ExplainabilityData,
  RedFlag,
  RedFlagCategory,
  RedFlagSourceReference,
} from "../types";

function parseGeminiJson<T extends Record<string, unknown>>(
  text: string
): T & { explainability?: ExplainabilityData } {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const explainability = normalizeExplainability(
    parsed.explainability as Partial<ExplainabilityData> | undefined
  ) ?? undefined;
  delete parsed.explainability;
  return { ...(parsed as T), explainability };
}

async function callInternalLlm(prompt: string, opts?: { temperature?: number; maxTokens?: number }) {
  const response = await fetch("/api/internal-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      temperature: opts?.temperature ?? 0.35,
      maxTokens: opts?.maxTokens ?? 8000,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error ?? data?.message ?? "Errore internal-llm";
    throw new Error(String(message));
  }

  const text = data?.text;
  if (!text || typeof text !== "string") {
    throw new Error("LLM non ha restituito testo.");
  }
  return text.trim();
}

export async function runBidNoBid(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<BidNoBidResult> {
  const prompt = `Sei un motore decisionale esperto in gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Prima di rispondere, ragiona internamente in modo approfondito su tutti i fattori rilevanti.
Analizza la compatibilità tra il profilo dell'impresa e la gara con massima precisione.

Il tuo output deve essere SOLO un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo prima o dopo.
Ogni campo stringa deve essere dettagliato e motivato, non generico.
motiviPro e motiviContro devono avere almeno 3 elementi ciascuno quando i dati lo consentono.
motivazioneSintetica deve essere 2-3 frasi precise, non una riga vaga.
suggerimento deve essere un'azione operativa concreta (es. "Attiva avvalimento per OG3 classifica IV tramite impresa ausiliaria — verifica art. 104 D.Lgs. 36/2023").

Il JSON deve rispettare esattamente questa struttura:
{
  "decision": "GO" | "CAUTELA" | "NO-GO",
  "scoreComplessivo": number (0-100),
  "motivazioneSintetica": string,
  "motiviPro": string[],
  "motiviContro": string[],
  "criticitaPrincipale": string,
  "suggerimento": string,
  "soaCompatibile": boolean,
  "capacitaSufficiente": boolean,
  "areaGeograficaOk": boolean,
  "importoInTarget": boolean,
  ${EXPLAINABILITY_JSON_INLINE}
}

Logica decisionale:
- GO: impresa compatibile, nessun blocco critico, score >= 70
- CAUTELA: compatibile con riserve o gap colmabili (avvalimento/RTI), score 40-69
- NO-GO: incompatibilità strutturale (SOA mancante non colmabile, area geografica fuori scope, importo fuori range), score < 40

Considera questi fattori nell'ordine:
1. Compatibilità SOA (categorie e classifiche richieste vs possedute) — peso 35%
2. Area geografica gara vs aree operative impresa — peso 20%
3. Importo gara vs range target impresa — peso 20%
4. Capacità operativa (cantieri aperti, squadre disponibili) — peso 15%
5. Anomalie e penali rilevate nel disciplinare — peso 10%

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- CIG: ${tender.cig}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti richiesti: ${JSON.stringify(tender.requirements, null, 2)}
- Anomalie rilevate: ${tender.anomalies.join(", ") || "nessuna"}
- Penali: ${tender.penalties.join(", ") || "nessuna"}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });

  try {
    const parsed = parseGeminiJson<Omit<BidNoBidResult, "generatedAt" | "explainability">>(text);
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta Gemini non valida — riprova");
  }
}

function parseTenderValue(valueStr: string): number {
  const cleaned = valueStr
    .replace(/[€\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function calcScenario(
  ribasso: number,
  importoGara: number,
  profile: CompanyProfile,
  label: PricingScenario["label"]
): PricingScenario {
  const importoOfferto = importoGara * (1 - ribasso / 100);
  const costiStimati =
    importoOfferto * (1 - profile.avgMarginPercent / 100) +
    importoOfferto * (profile.incidenzaSpeseGenerali / 100) +
    importoOfferto * (profile.incidenzaRischioMedio / 100);
  const margineEuro = importoOfferto - costiStimati;
  const margineStimato = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;
  const rischioAlert = margineStimato < profile.minMargineAccettabile;
  return { ribasso, importoOfferto, margineStimato, margineEuro, label, rischioAlert };
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function estimateOrganizationalCostsEuro(importoOfferto: number, profile: CompanyProfile): number {
  const explicit = safeNumber(profile.organizationalCostsEuro, 0);
  if (explicit > 0) return explicit;

  const efficiency = profile.productivityData?.organizationalEfficiency;
  const pct =
    efficiency === "alta" ? 0.02 :
    efficiency === "bassa" ? 0.035 :
    0.025;
  return Math.max(0, importoOfferto * pct);
}

function estimateAdministrativeCostsEuro(importoOfferto: number, profile: CompanyProfile): number {
  const explicit = safeNumber(profile.administrativeCostsEuro, 0);
  if (explicit > 0) return explicit;

  const tenderOpsCapacity = safeNumber(profile.productivityData?.concurrentTenderManagementCapacity, 0);
  const pct = tenderOpsCapacity >= 4 ? 0.0125 : 0.0175;
  return Math.max(0, importoOfferto * pct);
}

function adjustRiskLevel(
  risk: ProfitabilityGateResult["rischioEconomico"],
  delta: -1 | 0 | 1
): ProfitabilityGateResult["rischioEconomico"] {
  const levels: ProfitabilityGateResult["rischioEconomico"][] = ["basso", "medio", "alto"];
  const currentIndex = levels.indexOf(risk);
  const nextIndex = Math.max(0, Math.min(levels.length - 1, currentIndex + delta));
  return levels[nextIndex];
}

function normalizeRiskLevel(risk: unknown): ProfitabilityGateResult["rischioEconomico"] {
  if (risk === "basso" || risk === "medio" || risk === "alto") return risk;
  return "medio";
}

function evaluateProductivityImpact(profile: CompanyProfile): {
  level: "alta" | "media" | "bassa" | "non_configurata";
  laborMultiplier: number;
  riskDelta: -1 | 0 | 1;
  warning: string | null;
  explanation: string;
} {
  const efficiency = profile.productivityData?.organizationalEfficiency;
  const speed = profile.productivityData?.executionSpeed;
  const teamProductivity = safeNumber(profile.productivityData?.averageTeamProductivity, 0);
  const squads = safeNumber(profile.activeSquads, 0);

  const hasProductivityData =
    !!efficiency ||
    !!speed ||
    teamProductivity > 0 ||
    squads > 0;

  if (!hasProductivityData) {
    return {
      level: "non_configurata",
      laborMultiplier: 1,
      riskDelta: 1,
      warning: "Produttivita squadra non configurata: stima meno affidabile.",
      explanation: "Dati di produttivita interna mancanti: nessun beneficio operativo applicato e rischio prudenzialmente aumentato.",
    };
  }

  if (efficiency === "alta" || speed === "veloce" || teamProductivity >= 1.1) {
    return {
      level: "alta",
      laborMultiplier: 0.97,
      riskDelta: -1,
      warning: null,
      explanation: "Produttivita interna elevata: lieve riduzione prudente dei costi manodopera e rischio operativo piu contenuto.",
    };
  }

  if (efficiency === "bassa" || speed === "lenta" || (teamProductivity > 0 && teamProductivity < 0.9)) {
    return {
      level: "bassa",
      laborMultiplier: 1.05,
      riskDelta: 1,
      warning: "Produttivita squadra bassa: valutare rinforzo operativo prima della gara.",
      explanation: "Produttivita interna sotto soglia: incremento prudente della manodopera stimata e rischio economico piu elevato.",
    };
  }

  return {
    level: "media",
    laborMultiplier: 1,
    riskDelta: 0,
    warning: null,
    explanation: "Produttivita squadra in fascia media: stime economiche mantenute in linea con scenario base.",
  };
}

function evaluateEstimatedTimeImpact(
  tender: TenderDocument,
  importoOfferto: number
): {
  durationDays: number | null;
  durationLabel: "breve" | "media" | "lunga" | "non_configurata";
  costAdjustmentEuro: number;
  riskDelta: -1 | 0 | 1;
  warning: string | null;
  explanation: string;
} {
  const durationDaysFromInput = safeNumber(tender.estimatedDurationDays, 0);
  const durationMonthsFromInput = safeNumber(tender.estimatedDurationMonths, 0);
  const start = tender.estimatedStartDate ? Date.parse(tender.estimatedStartDate) : NaN;
  const end = tender.estimatedEndDate ? Date.parse(tender.estimatedEndDate) : NaN;
  const durationFromDates =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) / (1000 * 60 * 60 * 24))
      : 0;
  const derivedDurationDays =
    durationDaysFromInput > 0
      ? durationDaysFromInput
      : durationMonthsFromInput > 0
        ? durationMonthsFromInput * 30
        : durationFromDates > 0
          ? durationFromDates
          : 0;

  if (derivedDurationDays <= 0) {
    return {
      durationDays: null,
      durationLabel: "non_configurata",
      costAdjustmentEuro: 0,
      riskDelta: 1,
      warning: "Tempi stimati non configurati: stima economica piu prudente.",
      explanation: "Durata commessa non disponibile, applicata prudenza sul rischio operativo.",
    };
  }

  if (derivedDurationDays <= 45) {
    return {
      durationDays: derivedDurationDays,
      durationLabel: "breve",
      costAdjustmentEuro: importoOfferto * 0.01,
      riskDelta: 1,
      warning: "Tempi molto compressi: possibile pressione operativa su squadre e coordinamento.",
      explanation: "Durata breve/compressa: aggiustamento prudente dei costi per accelerazioni e coordinamento.",
    };
  }

  if (derivedDurationDays > 300) {
    return {
      durationDays: derivedDurationDays,
      durationLabel: "lunga",
      costAdjustmentEuro: importoOfferto * 0.015,
      riskDelta: 1,
      warning: null,
      explanation: "Durata lunga: incremento prudente dei costi per presidio operativo prolungato e variabilita.",
    };
  }

  return {
    durationDays: derivedDurationDays,
    durationLabel: "media",
    costAdjustmentEuro: 0,
    riskDelta: 0,
    warning: null,
    explanation: "Durata stimata in fascia media: nessun impatto economico significativo oltre la baseline.",
  };
}

function evaluateRegionalPriceListReference(tender: TenderDocument): {
  reference: string | null;
  year: number | null;
  region: string | null;
  isConfigured: boolean;
  confidenceImpact: "alta" | "media" | "bassa";
  warning: string | null;
  explanation: string;
  riskDelta: -1 | 0 | 1;
} {
  const reference = String(tender.regionalPriceListReference ?? "").trim() || null;
  const yearRaw = safeNumber(tender.regionalPriceListYear, 0);
  const year = yearRaw > 0 ? Math.round(yearRaw) : null;
  const region = String(tender.regionalPriceListRegion ?? tender.region ?? "").trim() || null;
  const hasAny = !!reference || !!year || !!region;

  if (!hasAny) {
    return {
      reference: null,
      year: null,
      region: null,
      isConfigured: false,
      confidenceImpact: "bassa",
      warning: "Prezzario regionale non indicato: stima costi con confidenza ridotta.",
      explanation: "Costi stimati senza riferimento esplicito a prezzario regionale.",
      riskDelta: 1,
    };
  }

  if (reference && year) {
    return {
      reference,
      year,
      region,
      isConfigured: true,
      confidenceImpact: "alta",
      warning: null,
      explanation: "Stima ancorata a riferimento prezzario regionale esplicito.",
      riskDelta: 0,
    };
  }

  return {
    reference,
    year,
    region,
    isConfigured: true,
    confidenceImpact: "media",
    warning: "Prezzario regionale parziale: utile completare riferimento e anno.",
    explanation: "Riferimento prezzario presente ma incompleto, confidenza stima intermedia.",
    riskDelta: 0,
  };
}

function normalizeProfitabilityResult(
  parsed: Omit<ProfitabilityGateResult, "generatedAt" | "explainability">,
  tender: TenderDocument,
  profile: CompanyProfile
): Omit<ProfitabilityGateResult, "generatedAt" | "explainability"> {
  const importoGara = parseTenderValue(tender.value);
  const importoOfferto = Math.max(0, importoGara * (1 - safeNumber(profile.avgRibassoPercent, 0) / 100));

  const organizationalCostsEuro = estimateOrganizationalCostsEuro(importoOfferto, profile);
  const organizationalIncidence = importoOfferto > 0 ? (organizationalCostsEuro / importoOfferto) * 100 : 0;
  const administrativeCostsEuro = estimateAdministrativeCostsEuro(importoOfferto, profile);
  const administrativeIncidence = importoOfferto > 0 ? (administrativeCostsEuro / importoOfferto) * 100 : 0;
  const productivityImpact = evaluateProductivityImpact(profile);
  const estimatedTimeImpact = evaluateEstimatedTimeImpact(tender, importoOfferto);
  const regionalPriceListReference = evaluateRegionalPriceListReference(tender);

  const normalizedBreakdown = (Array.isArray(parsed.breakdownCosti) ? parsed.breakdownCosti : [])
    .map((item) => ({
      ...item,
      importoStimato: Math.max(0, safeNumber(item?.importoStimato, 0)),
      percentualeImporto: Math.max(0, safeNumber(item?.percentualeImporto, 0)),
      categoria: String(item?.categoria ?? "").trim(),
      note: String(item?.note ?? "").trim(),
    }))
    .filter((item) => item.categoria.length > 0);

  const nonUtileNonOrg = normalizedBreakdown.filter((item) => {
    const lower = item.categoria.toLowerCase();
    return !lower.includes("utile") && !lower.includes("organizzativ");
  });

  const nonUtileNonOrgNonAdmin = nonUtileNonOrg.filter((item) => {
    const lower = item.categoria.toLowerCase();
    return !lower.includes("amministrativ");
  });

  const adjustedCoreCosts = nonUtileNonOrgNonAdmin.map((item) => {
    const isLabor = item.categoria.toLowerCase().includes("manodopera");
    if (!isLabor) return item;
    const adjustedLabor = Math.max(0, item.importoStimato * productivityImpact.laborMultiplier);
    return {
      ...item,
      importoStimato: adjustedLabor,
      note: `${item.note}${item.note ? " " : ""}Adeguamento produttivita squadra ${productivityImpact.level} (${((productivityImpact.laborMultiplier - 1) * 100).toFixed(1)}%).`,
    };
  });

  const rawOperational = adjustedCoreCosts.reduce((acc, item) => acc + item.importoStimato, 0);
  const timeAdjustmentEuro = Math.max(0, estimatedTimeImpact.costAdjustmentEuro);
  const costiOperativi = rawOperational + organizationalCostsEuro + administrativeCostsEuro + timeAdjustmentEuro;
  const margineEuro = importoOfferto - costiOperativi;
  const marginePercent = importoOfferto > 0 ? (margineEuro / importoOfferto) * 100 : 0;

  const breakdownCosti = [
    ...adjustedCoreCosts.map((item) => ({
      ...item,
      percentualeImporto: importoOfferto > 0 ? (item.importoStimato / importoOfferto) * 100 : 0,
    })),
    {
      categoria: "Costi organizzativi",
      importoStimato: organizationalCostsEuro,
      percentualeImporto: organizationalIncidence,
      note:
        safeNumber(profile.organizationalCostsEuro, 0) > 0
          ? "Voce esplicita da profilo aziendale (coordinamento, pianificazione e supervisione interna)."
          : "Stima prudente su organizzazione interna (coordinamento, pianificazione e gestione risorse).",
    },
    {
      categoria: "Costi amministrativi",
      importoStimato: administrativeCostsEuro,
      percentualeImporto: administrativeIncidence,
      note:
        safeNumber(profile.administrativeCostsEuro, 0) > 0
          ? "Voce esplicita da profilo aziendale (ufficio gare, pratiche e gestione documentale)."
          : "Stima prudente su attività amministrative (pratiche gara, portali e controlli documentali).",
    },
    {
      categoria: "Impatto tempi stimati",
      importoStimato: timeAdjustmentEuro,
      percentualeImporto: importoOfferto > 0 ? (timeAdjustmentEuro / importoOfferto) * 100 : 0,
      note: estimatedTimeImpact.explanation,
    },
    {
      categoria: "Utile atteso",
      importoStimato: margineEuro,
      percentualeImporto: marginePercent,
      note: "Differenza tra importo offerto e costi complessivi inclusi i costi organizzativi e amministrativi.",
    },
  ];

  const existingMotivazione = String(parsed.motivazione ?? "").trim();
  const lowerMotivazione = existingMotivazione.toLowerCase();
  const hasOrg = lowerMotivazione.includes("organizzativ");
  const hasAdmin = lowerMotivazione.includes("amministrativ");
  const hasProd = lowerMotivazione.includes("produttivit");
  const hasTempi = lowerMotivazione.includes("temp");
  const hasPrezzario = lowerMotivazione.includes("prezzar");
  const motivazioneWithFullContext = hasOrg && hasAdmin && hasProd && hasTempi && hasPrezzario
    ? existingMotivazione
    : `${existingMotivazione}${existingMotivazione ? " " : ""}Include costi organizzativi (coordinamento interno, pianificazione operativa, supervisione tecnica) e costi amministrativi (ufficio gare, pratiche documentali, caricamento portali). Impatto produttivita squadra: ${productivityImpact.explanation} Impatto tempi stimati: ${estimatedTimeImpact.explanation} Prezzario regionale: ${regionalPriceListReference.explanation}`;

  const combinedRiskDeltaRaw =
    productivityImpact.riskDelta + estimatedTimeImpact.riskDelta + regionalPriceListReference.riskDelta;
  const combinedRiskDelta: -1 | 0 | 1 =
    combinedRiskDeltaRaw > 0 ? 1 :
    combinedRiskDeltaRaw < 0 ? -1 :
    0;

  return {
    ...parsed,
    breakdownCosti,
    costoTotaleStimato: costiOperativi,
    margineAttesoEuro: margineEuro,
    margineAttesoPercent: marginePercent,
    rischioEconomico: adjustRiskLevel(normalizeRiskLevel(parsed.rischioEconomico), combinedRiskDelta),
    organizationalCosts: {
      amountEuro: organizationalCostsEuro,
      incidencePercentage: organizationalIncidence,
      explanation:
        safeNumber(profile.organizationalCostsEuro, 0) > 0
          ? "Valore inserito esplicitamente nel profilo impresa."
          : "Valore stimato in fallback prudente sulla base dell'efficienza organizzativa e dell'importo offerto.",
    },
    administrativeCosts: {
      amountEuro: administrativeCostsEuro,
      incidencePercentage: administrativeIncidence,
      explanation:
        safeNumber(profile.administrativeCostsEuro, 0) > 0
          ? "Valore inserito esplicitamente nel profilo impresa."
          : "Valore stimato in fallback prudente sulla base della capacità ufficio gare e dell'importo offerto.",
    },
    productivityImpact: {
      efficiencyLevel: productivityImpact.level,
      laborCostAdjustmentPercentage: (productivityImpact.laborMultiplier - 1) * 100,
      riskAdjustment:
        productivityImpact.riskDelta < 0 ? "riduzione" :
        productivityImpact.riskDelta > 0 ? "aumento" :
        "neutro",
      warning: productivityImpact.warning,
      explanation: productivityImpact.explanation,
    },
    estimatedTimeImpact: {
      durationDays: estimatedTimeImpact.durationDays,
      durationLabel: estimatedTimeImpact.durationLabel,
      costAdjustmentEuro: timeAdjustmentEuro,
      riskAdjustment:
        estimatedTimeImpact.riskDelta < 0 ? "riduzione" :
        estimatedTimeImpact.riskDelta > 0 ? "aumento" :
        "neutro",
      warning: estimatedTimeImpact.warning,
      explanation: estimatedTimeImpact.explanation,
    },
    regionalPriceListReference: {
      reference: regionalPriceListReference.reference,
      year: regionalPriceListReference.year,
      region: regionalPriceListReference.region,
      isConfigured: regionalPriceListReference.isConfigured,
      confidenceImpact: regionalPriceListReference.confidenceImpact,
      warning: regionalPriceListReference.warning,
      explanation: regionalPriceListReference.explanation,
    },
    motivazione: motivazioneWithFullContext,
  };
}

export async function runBidPricing(
  tender: TenderDocument,
  profile: CompanyProfile,
  ribassoPersonalizzato: number
): Promise<BidPricingResult> {
  const importoGara = parseTenderValue(tender.value);

  const scenari: PricingScenario[] = [
    calcScenario(profile.avgRibassoPercent + 3, importoGara, profile, "Aggressivo"),
    calcScenario(profile.avgRibassoPercent, importoGara, profile, "Bilanciato"),
    calcScenario(Math.max(0, profile.avgRibassoPercent - 3), importoGara, profile, "Conservativo"),
    calcScenario(ribassoPersonalizzato, importoGara, profile, "Personalizzato"),
  ];

  const prompt = `Sei un esperto di pricing per gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Analizza la situazione e restituisci SOLO un oggetto JSON valido, senza markdown, senza backtick.

Struttura JSON richiesta:
{
  "rangeMinRibasso": number,
  "rangeMaxRibasso": number,
  "ribassoOttimale": number,
  "motivazioneRange": string (3-4 frasi precise con riferimenti ai dati aziendali),
  "alertMargine": boolean,
  "alertText": string (vuoto se alertMargine false, altrimenti descrivi il rischio concreto),
  "winRatePrudente": number (% stima prudente, NON ottimistica),
  "winRateMotivazione": string (2-3 frasi che spiegano la stima),
  ${EXPLAINABILITY_JSON_INLINE}
}

Logica per il range:
- rangeMin = ribasso sotto cui il margine scende sotto minMargineAccettabile
- rangeMax = ribasso massimo sostenibile mantenendo margine accettabile
- ribassoOttimale = punto di equilibrio tra competitività e margine
- alertMargine = true se anche ribassoOttimale porta margine vicino al limite (< minMargine + 2%)
- winRatePrudente: considera storico impresa, fit gara, complessità — rimani prudente

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- Importo base: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti: ${JSON.stringify(tender.requirements)}
- Anomalie: ${tender.anomalies.join(", ") || "nessuna"}

SCENARI PRE-CALCOLATI (per contesto):
${JSON.stringify(scenari, null, 2)}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsed = parseGeminiJson<Omit<BidPricingResult, "scenari" | "generatedAt" | "explainability">>(
      text
    );
    return { ...parsed, scenari, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runRedFlagAnalysis(
  tender: TenderDocument
): Promise<RedFlagAnalysisResult> {
  const normalizeCategory = (value: unknown): RedFlagCategory | string => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!raw) return "altro";
    if (raw.includes("hyper") || raw.includes("iper") || raw.includes("detailed")) return "hyper_detailed_specs";
    if (raw.includes("unbalanced") || raw.includes("sbilanc")) return "unbalanced_award_criteria";
    if (raw.includes("timeline") || raw.includes("tempi")) return "anomalous_timeline";
    if (raw.includes("combination") || raw.includes("combinazione")) return "restrictive_requirement_combination";
    return raw;
  };

  const normalizeSourceReference = (value: unknown): RedFlagSourceReference | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const pageNumber = Number(source.pageNumber);
    return {
      documentName: String(source.documentName ?? "").trim() || undefined,
      pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.round(pageNumber) : undefined,
      article: String(source.article ?? "").trim() || undefined,
      clauseTitle: String(source.clauseTitle ?? "").trim() || undefined,
      excerpt: String(source.excerpt ?? "").trim() || undefined,
      anchorId: String(source.anchorId ?? "").trim() || undefined,
    };
  };

  const normalizeRedFlagItem = (item: Record<string, unknown>): RedFlag => {
    return {
      title: String(item.title ?? "Rischio da verificare").trim(),
      type: normalizeCategory(item.type),
      clause: String(item.clause ?? "Estratto non disponibile").trim(),
      articleRef: String(item.articleRef ?? "Verifica disciplinare").trim(),
      severity:
        item.severity === "high" || item.severity === "medium" || item.severity === "low"
          ? item.severity
          : "medium",
      simpleExplanation: String(item.simpleExplanation ?? "Elemento potenzialmente restrittivo da verificare con revisione umana.").trim(),
      remedy: String(item.remedy ?? "Richiedere chiarimenti alla stazione appaltante e verificare proporzionalita del requisito.").trim(),
      clarificationText: String(item.clarificationText ?? "Oggetto: richiesta chiarimenti in merito a clausola potenzialmente restrittiva del disciplinare.").trim(),
      sourceReference: normalizeSourceReference(item.sourceReference),
    };
  };

  const prompt = `Sei un esperto legale specializzato in gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Analizza i dati della gara e individua clausole problematiche, requisiti sproporzionati, anomalie e red flag.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.

Struttura JSON richiesta:
{
  "redFlags": [
    {
      "title": string,
      "type": "hyper_detailed_specs" | "unbalanced_award_criteria" | "anomalous_timeline" | "restrictive_requirement_combination" | string,
      "clause": string (citazione breve della clausola problematica, max 200 caratteri),
      "articleRef": string (riferimento normativo preciso),
      "severity": "high" | "medium" | "low",
      "simpleExplanation": string (3-4 frasi in linguaggio semplice per un imprenditore edile),
      "remedy": string (azione concreta da intraprendere),
      "clarificationText": string (bozza lettera/quesito formale pronto per il portale gare, 80-120 parole, in italiano formale, includi CIG della gara),
      "sourceReference": {
        "documentName": string,
        "pageNumber": number,
        "article": string,
        "clauseTitle": string,
        "excerpt": string,
        "anchorId": string
      }
    }
  ],
  "rischioComplessivo": "high" | "medium" | "low",
  "conteggioHigh": number,
  "conteggioMedium": number,
  "conteggioLow": number,
  "sintesiRischio": string (2-3 frasi di sintesi sul profilo di rischio complessivo della gara),
  ${EXPLAINABILITY_JSON_INLINE}
}

Categorie da cercare in modo esplicito (se c'e evidenza testuale):
- hyper_detailed_specs: specifiche tecniche iper-dettagliate potenzialmente cucite su uno specifico operatore
- unbalanced_award_criteria: criteri OEPV/punteggi potenzialmente sbilanciati o opachi
- anomalous_timeline: tempi di gara/esecuzione anomali o compressi
- restrictive_requirement_combination: combinazioni di requisiti che riducono eccessivamente la platea

Per ogni red flag usa linguaggio prudente: "potenzialmente restrittivo", "da verificare", "richiede revisione umana".
Non usare formulazioni di illegittimita certa senza base documentale forte.

Logica severity:
- high: clausola illegittima (contra legem), requisito chiaramente sproporzionato, esclusione automatica ingiustificata
- medium: clausola rischiosa ma contestabile, requisito al limite della proporzionalità, anomalia operativa rilevante
- low: elemento da monitorare, clausola inusuale ma non necessariamente illegittima

Logica rischioComplessivo:
- high: almeno 1 red flag high
- medium: solo red flag medium/low ma almeno 2 medium
- low: solo red flag low o nessun red flag

Trova tra 2 e 5 red flag. Se i dati sono insufficienti per identificare problemi specifici, genera almeno 2 osservazioni prudenziali generali sulla gara.
Ogni clarificationText deve iniziare con "Oggetto:" e includere il CIG della gara.
Compila sourceReference quando hai evidenza su sezione/clausola; se non disponibile, ometti sourceReference.

DATI GARA:
- Titolo: ${tender.title}
- CIG: ${tender.cig}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti richiesti: ${JSON.stringify(tender.requirements, null, 2)}
- Anomalie già rilevate: ${tender.anomalies.join(", ") || "nessuna"}
- Penali già rilevate: ${tender.penalties.join(", ") || "nessuna"}
- Sezioni disciplinare: ${JSON.stringify(tender.sections?.map((s) => ({ title: s.title, summary: s.summary })), null, 2)}`;
  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsed = parseGeminiJson<Omit<RedFlagAnalysisResult, "generatedAt" | "explainability">>(
      text
    );
    const redFlags = Array.isArray(parsed.redFlags)
      ? parsed.redFlags.map((item) => normalizeRedFlagItem(item as Record<string, unknown>))
      : [];
    return {
      ...parsed,
      redFlags,
      conteggioHigh: redFlags.filter((r) => r.severity === "high").length,
      conteggioMedium: redFlags.filter((r) => r.severity === "medium").length,
      conteggioLow: redFlags.filter((r) => r.severity === "low").length,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runCapacityAnalysis(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<CapacityAnalysisResult> {
  const prompt = `Sei un esperto di organizzazione aziendale per imprese edili italiane.
Analizza la capacità operativa dell'impresa di sostenere una nuova gara d'appalto senza andare in saturazione.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Struttura JSON:
{
  "verdict": "SOSTENIBILE" | "CRITICA" | "NON_SOSTENIBILE",
  "scoreCapacita": number (0-100),
  "rischioSaturazione": "basso" | "medio" | "alto",
  "motivazioneSintetica": string (2-3 frasi),
  "squadreDisponibili": number (stima squadre libere dopo acquisizione gara),
  "caricoAttualePercent": number (% carico operativo attuale stimato 0-100),
  "caricoDopoGaraPercent": number (% carico stimato se si prende la gara 0-100),
  "puntiForza": string[] (almeno 2),
  "criticitaOperative": string[] (almeno 1),
  "analisiCompatibilita": string (paragrafo di 3-4 frasi sull'analisi organizzativa),
  "rischioAlert": string | null,
  "suggerimentoOperativo": string (azione concreta, es. "Assumi 2 operai prima di partecipare" o "Chiudi cantiere X prima di aprire questo"),
  ${EXPLAINABILITY_JSON_INLINE}
}

Logica verdict:
- SOSTENIBILE: score >= 65, carico dopo gara < 85%, squadre disponibili > 0
- CRITICA: score 35-64, carico dopo gara 85-100%, o squadre disponibili = 0 ma colmabile
- NON_SOSTENIBILE: score < 35, carico dopo gara > 100% (impossibile gestire), o zero dipendenti/squadre senza possibilità di recupero

Logica capacità (NON applicare meccanicamente, ragiona sul contesto):
- Squadre disponibili stimate = activeSquads - (activeJobsites * 1.2), mai sotto 0
- I dipendenti sono una riserva: ogni 4 dipendenti liberi = 1 squadra potenziale formabile
- Dipendenti liberi stimati = employeesCount - (activeJobsites * 3)
- Se dipendenti liberi > 3, considera che l'impresa può formare squadre aggiuntive
- SOSTENIBILE richiede: score >= 65 E (squadreDisponibili > 0 OPPURE dipendenti liberi >= 4)
- CRITICA: score 35-64, o squadre = 0 ma dipendenti liberi tra 2 e 3
- NON_SOSTENIBILE: score < 35, dipendenti = 0, o carico fisicamente impossibile
- Un'impresa con 8 dipendenti e 2 cantieri aperti ha dipendenti liberi stimati = 8-(2*3) = 2, quindi CRITICA non NON_SOSTENIBILE
- Importo gara > fatturato annuo è un segnale di sovraccarico finanziario-organizzativo

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Durata stimata: da requisiti e sezioni disciplinare
- Requisiti: ${JSON.stringify(tender.requirements)}`;
  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsedCap = parseGeminiJson<
      Omit<CapacityAnalysisResult, "generatedAt" | "explainability">
    >(text);
    return { ...parsedCap, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}

export async function runProfitabilityGate(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<ProfitabilityGateResult> {
  const prompt = `Sei un esperto di analisi economica per imprese edili italiane.
Analizza la profittabilità di questa gara d'appalto per l'impresa specifica.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick.

Struttura JSON:
{
  "verdict": "PROFITTEVOLE" | "BORDERLINE" | "PERICOLOSA",
  "scoreProfittabilita": number (0-100),
  "margineAttesoPercent": number (% margine sul ribasso storico medio dell'impresa),
  "margineAttesoEuro": number (€ assoluto),
  "breakdownCosti": [
    {
      "categoria": string,
      "importoStimato": number,
      "percentualeImporto": number,
      "note": string
    }
  ],
  "costoTotaleStimato": number,
  "organizationalCosts": {
    "amountEuro": number,
    "incidencePercentage": number,
    "explanation": string
  },
  "administrativeCosts": {
    "amountEuro": number,
    "incidencePercentage": number,
    "explanation": string
  },
  "productivityImpact": {
    "efficiencyLevel": "alta" | "media" | "bassa" | "non_configurata",
    "laborCostAdjustmentPercentage": number,
    "riskAdjustment": "riduzione" | "neutro" | "aumento",
    "warning": string | null,
    "explanation": string
  },
  "estimatedTimeImpact": {
    "durationDays": number | null,
    "durationLabel": "breve" | "media" | "lunga" | "non_configurata",
    "costAdjustmentEuro": number,
    "riskAdjustment": "riduzione" | "neutro" | "aumento",
    "warning": string | null,
    "explanation": string
  },
  "regionalPriceListReference": {
    "reference": string | null,
    "year": number | null,
    "region": string | null,
    "isConfigured": boolean,
    "confidenceImpact": "alta" | "media" | "bassa",
    "warning": string | null,
    "explanation": string
  },
  "rischioEconomico": "basso" | "medio" | "alto",
  "motivazione": string (3-4 frasi analisi economica precisa),
  "alertMargineInsufficiente": boolean (true se margine atteso < minMargineAccettabile),
  "alertMargineNegativo": boolean (true se margine atteso < 0),
  "alertText": string | null,
  "scenarioOttimistico": number (% margine scenario favorevole),
  "scenarioRealistico": number (% margine scenario base),
  "scenarioPessimistico": number (% margine scenario avverso),
  "puntiAttenzione": string[] (3-5 elementi che possono erodere il margine),
  ${EXPLAINABILITY_JSON_INLINE}
}

Logica verdict:
- PROFITTEVOLE: margineAttesoPercent >= minMargineAccettabile + 5%, score >= 65
- BORDERLINE: margineAttesoPercent tra minMargineAccettabile e minMargineAccettabile + 5%, score 35-64
- PERICOLOSA: margineAttesoPercent < minMargineAccettabile o negativo, score < 35

Logica breakdown costi (includi esplicitamente Costi organizzativi e Costi amministrativi come voci autonome):
1. Manodopera: stima basata su costoOraOperaio, costoOraCaposquadra, complessità gara
2. Materiali: stima basata su categoria lavori e importo
3. Noli/Mezzi: stima basata su tipo lavori
4. Spese generali: profile.incidenzaSpeseGenerali% dell'importo
5. Accantonamento rischio: profile.incidenzaRischioMedio% dell'importo
6. Costi organizzativi: coordinamento interno, pianificazione operativa, supervisione tecnica, riunioni operative
7. Costi amministrativi: gestione documentale gara, pratiche amministrative, personale ufficio gare, caricamento portali
8. Utile atteso: differenza tra importo offerto e somma costi precedenti

Regola costi organizzativi:
- se profile.organizationalCostsEuro è presente e > 0, usalo direttamente;
- altrimenti stima in modo prudente con una % dell'importo offerto (2% efficienza alta, 2.5% media, 3.5% bassa).

Regola costi amministrativi:
- se profile.administrativeCostsEuro è presente e > 0, usalo direttamente;
- altrimenti stima in modo prudente con una % dell'importo offerto (1.25% se capacità ufficio gare elevata, 1.75% altrimenti).

Impatto produttivita squadra:
- usa productivityData (organizationalEfficiency, executionSpeed, averageTeamProductivity) e activeSquads per regolare prudentemente manodopera e rischio;
- produttivita alta: lieve riduzione manodopera e rischio;
- produttivita media: nessuna variazione significativa;
- produttivita bassa o non configurata: lieve aumento manodopera/rischio e warning esplicito.

Impatto tempi stimati:
- usa estimatedDurationDays / estimatedDurationMonths / estimatedStartDate+estimatedEndDate;
- tempi compressi o molto lunghi: aumento prudente costo/rischio;
- tempi mancanti: warning e rischio prudenziale.

Riferimento prezzario regionale:
- usa regionalPriceListReference / regionalPriceListYear / regionalPriceListRegion se disponibili;
- se mancante, warning e confidenza stima ridotta;
- non fare parsing completo del prezzario, solo riferimento leggero.

Calcola importo offerto = importoGara * (1 - profile.avgRibassoPercent/100)
Scenari:
- Ottimistico: produttività alta, nessun imprevisto, materiali stabili
- Realistico: condizioni standard con profilo impresa
- Pessimistico: ritardi 10%, caro materiali 5%, imprevisti operativi

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- Importo base: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Penali: ${tender.penalties.join(", ") || "nessuna"}
- Anomalie: ${tender.anomalies.join(", ") || "nessuna"}
- Requisiti: ${JSON.stringify(tender.requirements)}`;

  const text = await callInternalLlm(prompt, { temperature: 0.35, maxTokens: 8000 });
  try {
    const parsed = parseGeminiJson<
      Omit<ProfitabilityGateResult, "generatedAt" | "explainability">
    >(text);
    const normalized = normalizeProfitabilityResult(parsed, tender, profile);
    return { ...normalized, generatedAt: new Date().toISOString() };
  } catch {
    throw new Error("Risposta LLM non valida — riprova");
  }
}
