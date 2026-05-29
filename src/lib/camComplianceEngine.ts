import type {
  TenderDocument,
  CAMRequirement,
  CAMComplianceScore,
  CAMAssessmentItem,
  CAMComplianceProfile,
  CAMAssessmentStato,
  CAMConformitaComplessiva,
  CAMMiglioramentoEffort,
} from "../types";
import { CAM_CATEGORIE_STANDARD } from "./camCategoriesStandard";
import { parseTenderValue } from "./bidCalculations";

export type CAMSupplierStatusVerifica =
  | "VERIFICATO"
  | "IN_VERIFICA"
  | "NON_CONFORME"
  | "DA_VERIFICARE";

export interface CAMSupplier {
  id: string;
  nome: string;
  ragioneSociale: string;
  categoria: string;
  hasCAMCertification: boolean;
  certifications: string[];
  dataVerifica: string;
  statusVerifica: CAMSupplierStatusVerifica;
  scoreConformita: number;
  noteSostenibilita?: string;
}

export interface CAMSupplierVerificationReport {
  camRequirementId: string;
  titolo: string;
  categoria: string;
  suppliersRichiesti: number;
  suppliersVerificati: CAMSupplier[];
  complianceRate: number;
  riskSupplyChain: number;
  azioni: string[];
}

export interface CAMCostAnalysis {
  requirementId: string;
  titolo: string;
  importoBaseLine: number;
  importoCAM: number;
  deltaCosto: number;
  percentualeIncremento: number;
  ROI: {
    azioniGreenBonus: string[];
    puntiTecniAggiuntivi: number;
    valore: number;
    paybackMesi: number;
  };
  recommendation: string;
}

export type CAMDocumentoTipo =
  | "CERTIFICAZIONE"
  | "EPD"
  | "PIANO"
  | "AUDIT"
  | "DICHIARAZIONE"
  | "ALTRO";

export type CAMDocumentoStato = "BOZZA" | "SOTTOMESSA" | "VERIFICATA" | "RICHIESTA_MODIFICA";

export interface CAMDocumentation {
  id: string;
  requirementId: string;
  titolo: string;
  tipoDocumento: CAMDocumentoTipo;
  fileName: string;
  dataUpload: string;
  versione: number;
  stato: CAMDocumentoStato;
  verificatoBy?: string;
  notaVerifica?: string;
  dataValidazione?: string;
}

export interface CAMDocumentationTracker {
  gara: TenderDocument;
  documentiObbligatori: CAMDocumentation[];
  documentiBonus: CAMDocumentation[];
  progressoDocumentazione: number;
  dataScadenzaUltimaCertificazione?: string;
  auditTrail: Array<{
    dataOra: string;
    azione: string;
    utente: string;
    note: string;
  }>;
  complianceLog: Array<{
    dataOra: string;
    requirementId: string;
    statoPrecedente: string;
    statoNuovo: string;
  }>;
}

export const MOCK_CAM_SUPPLIERS: CAMSupplier[] = [
  {
    id: "supp-001",
    nome: "Italcementi",
    ragioneSociale: "Italcementi S.p.A.",
    categoria: "Cemento",
    hasCAMCertification: true,
    certifications: ["EPD", "ISO 14001", "ISO 50001"],
    dataVerifica: new Date().toISOString(),
    statusVerifica: "VERIFICATO",
    scoreConformita: 95,
    noteSostenibilita: "Cemento CSC con 40% scorie d'altoforno",
  },
  {
    id: "supp-002",
    nome: "Cementir",
    ragioneSociale: "Cementir Holding N.V.",
    categoria: "Cemento",
    hasCAMCertification: true,
    certifications: ["EPD", "ISO 14001"],
    dataVerifica: new Date().toISOString(),
    statusVerifica: "VERIFICATO",
    scoreConformita: 88,
    noteSostenibilita: "Cemento composito con materiali riciclati",
  },
  {
    id: "supp-003",
    nome: "ArcelorMittal",
    ragioneSociale: "ArcelorMittal Italia",
    categoria: "Acciaio",
    hasCAMCertification: true,
    certifications: ["EPD", "ISO 14001"],
    dataVerifica: new Date().toISOString(),
    statusVerifica: "VERIFICATO",
    scoreConformita: 92,
    noteSostenibilita: "Acciaio da riciclo, energia rinnovabile",
  },
  {
    id: "supp-004",
    nome: "Enel X",
    ragioneSociale: "Enel X Italia",
    categoria: "Energia",
    hasCAMCertification: true,
    certifications: ["ISO 14001", "ISO 50001"],
    dataVerifica: new Date().toISOString(),
    statusVerifica: "VERIFICATO",
    scoreConformita: 90,
    noteSostenibilita: "Soluzioni LED e fotovoltaico cantiere",
  },
];

export function defaultCAMRequirementsForTender(_tender: TenderDocument): CAMRequirement[] {
  return CAM_CATEGORIE_STANDARD.map((cat) => ({
    id: `req-${cat.id}`,
    titolo: cat.nome,
    descrizione: cat.descrizione,
    categoria: cat,
    obbligatorio: cat.obbligatorio,
    confidenza: 70,
  }));
}

export function createCAMComplianceProfile(
  tender: TenderDocument,
  camRequirements: CAMRequirement[]
): CAMComplianceProfile {
  const requirements =
    camRequirements.length > 0 ? camRequirements : defaultCAMRequirementsForTender(tender);

  const assessmentItems: CAMAssessmentItem[] = requirements.map((req) => ({
    requirementId: req.id,
    titolo: req.titolo,
    puntiMassimi: req.categoria.scorePunti,
    puntiOttenuti: 0,
    stato: "NON_INIZIATO",
  }));

  const assessment = calculateCAMScore(tender, assessmentItems, requirements);
  const miglioramentiPossibili = identifyCAMImprovements(requirements, assessment);

  return {
    id: `cam-prof-${Date.now()}`,
    gara: tender,
    dataCreazione: new Date().toISOString(),
    requirements,
    assessment,
    miglioramentiPossibili,
  };
}

export function calculateCAMScore(
  tender: TenderDocument,
  items: CAMAssessmentItem[],
  requirements: CAMRequirement[]
): CAMComplianceScore {
  const puntiMassimiTotali = items.reduce((sum, i) => sum + i.puntiMassimi, 0);
  const puntiOttenuti = items.reduce((sum, i) => sum + i.puntiOttenuti, 0);
  const scorePercentuale =
    puntiMassimiTotali > 0 ? (puntiOttenuti / puntiMassimiTotali) * 100 : 0;

  const requisitiObbligatori = requirements.filter((r) => r.obbligatorio);
  const requisitiObbligatoriCoperti = items.filter((i) => {
    const req = requirements.find((r) => r.id === i.requirementId);
    return req?.obbligatorio && i.stato === "CONFORME";
  }).length;

  let conformitaComplessiva: CAMConformitaComplessiva = "NON_CONFORME";
  if (
    requisitiObbligatori.length > 0 &&
    requisitiObbligatoriCoperti === requisitiObbligatori.length &&
    scorePercentuale >= 80
  ) {
    conformitaComplessiva = "PIENAMENTE_CONFORME";
  } else if (
    requisitiObbligatori.length > 0 &&
    requisitiObbligatoriCoperti === requisitiObbligatori.length &&
    scorePercentuale >= 50
  ) {
    conformitaComplessiva = "CONFORME";
  } else if (
    requisitiObbligatori.length === 0
      ? scorePercentuale >= 50
      : requisitiObbligatoriCoperti >= requisitiObbligatori.length * 0.7
  ) {
    conformitaComplessiva = "PARZIALMENTE_CONFORME";
  }

  const requisitiMancanti = requirements.filter((req) => {
    const item = items.find((i) => i.requirementId === req.id);
    return item?.stato !== "CONFORME";
  });

  const azioniCorrettive = requisitiMancanti.map((req) => ({
    requirementId: req.id,
    azione: `Implementare: ${req.titolo}`,
    timeline: req.obbligatorio ? "Entro 2 settimane" : "Entro 1 mese",
    responsabile: mapResponsabile(req.categoria.tipologia),
  }));

  return {
    id: `cam-score-${Date.now()}`,
    gara: tender,
    dataValutazione: new Date().toISOString(),
    assessmentItems: items.map((i) => ({ ...i })),
    scoreTotale: Math.round(scorePercentuale),
    scorePercentuale: Math.round(scorePercentuale * 10) / 10,
    conformitaComplessiva,
    requisitiObbligatoriCoperti,
    totalRequisitiObbligatori: requisitiObbligatori.length,
    requisitiMancanti,
    azioniCorrettive,
  };
}

function mapResponsabile(tipologia: string): string {
  const map: Record<string, string> = {
    MATERIALE: "Ufficio acquisti / tecnico",
    ENERGIA: "Capo cantiere",
    RIFIUTI: "HSE / ambiente",
    TRASPORTO: "Logistica",
    PROCESSO: "Project Manager",
    ALTRO: "Project Manager",
  };
  return map[tipologia] || "Project Manager";
}

function identifyCAMImprovements(
  requirements: CAMRequirement[],
  assessment: CAMComplianceScore
): Array<{
  categoria: string;
  descrizione: string;
  puntiAggiuntivi: number;
  effort: CAMMiglioramentoEffort;
}> {
  const miglioramenti: Array<{
    categoria: string;
    descrizione: string;
    puntiAggiuntivi: number;
    effort: CAMMiglioramentoEffort;
  }> = [];

  for (const opt of requirements.filter((r) => !r.obbligatorio)) {
    const item = assessment.assessmentItems.find((i) => i.requirementId === opt.id);
    if (item?.stato !== "CONFORME") {
      miglioramenti.push({
        categoria: opt.categoria.nome,
        descrizione: `Aggiungere: ${opt.titolo}`,
        puntiAggiuntivi: opt.categoria.scorePunti,
        effort: "MEDIO",
      });
    }
  }

  miglioramenti.push({
    categoria: "Sostenibilità avanzata",
    descrizione: "Audit ESG indipendente (bonus reputazionale)",
    puntiAggiuntivi: 5,
    effort: "ALTO",
  });

  return miglioramenti;
}

export function updateCAMAssessmentItem(
  profile: CAMComplianceProfile,
  itemId: string,
  puntiOttenuti: number,
  stato: CAMAssessmentStato,
  evidenza?: string
): CAMComplianceProfile {
  const assessmentItems = profile.assessment.assessmentItems.map((item) => {
    if (item.requirementId !== itemId) return item;
    const punti =
      stato === "CONFORME"
        ? item.puntiMassimi
        : stato === "IN_VALUTAZIONE"
          ? Math.round(item.puntiMassimi * 0.5)
          : puntiOttenuti;
    return {
      ...item,
      puntiOttenuti: punti,
      stato,
      evidenza,
      dataValutazione: new Date().toISOString(),
    };
  });

  const assessment = calculateCAMScore(
    profile.gara,
    assessmentItems,
    profile.requirements
  );

  return {
    ...profile,
    assessment,
    miglioramentiPossibili: identifyCAMImprovements(profile.requirements, assessment),
  };
}

export function analyzeCAMImpactOnBid(camScore: CAMComplianceScore): {
  bidAdvantage: number;
  marketDifferentiator: boolean;
  riskNonConformita: number;
  recommendation: string;
} {
  const { scorePercentuale, conformitaComplessiva } = camScore;

  let bidAdvantage = 0;
  if (conformitaComplessiva === "PIENAMENTE_CONFORME") {
    bidAdvantage = 30 + (scorePercentuale - 80) * 2;
  } else if (conformitaComplessiva === "CONFORME") {
    bidAdvantage = 15 + (scorePercentuale - 50);
  } else if (conformitaComplessiva === "PARZIALMENTE_CONFORME") {
    bidAdvantage = -10;
  } else {
    bidAdvantage = -30;
  }

  const marketDifferentiator =
    conformitaComplessiva === "PIENAMENTE_CONFORME" && scorePercentuale >= 85;

  let riskNonConformita = 0;
  if (conformitaComplessiva === "NON_CONFORME") riskNonConformita = 95;
  else if (conformitaComplessiva === "PARZIALMENTE_CONFORME") riskNonConformita = 60;
  else if (conformitaComplessiva === "CONFORME") riskNonConformita = 20;
  else riskNonConformita = 5;

  let recommendation = "";
  if (conformitaComplessiva === "PIENAMENTE_CONFORME") {
    recommendation = `✓ Forte vantaggio competitivo (${scorePercentuale.toFixed(0)}% CAM). Evidenziare in offerta tecnica.`;
  } else if (conformitaComplessiva === "CONFORME") {
    recommendation = `Buona conformità CAM. Target: portare da ${scorePercentuale.toFixed(0)}% a 80%+.`;
  } else if (conformitaComplessiva === "PARZIALMENTE_CONFORME") {
    recommendation = `⚠️ CAM incompleto (${scorePercentuale.toFixed(0)}%). Completare requisiti obbligatori prima della gara.`;
  } else {
    recommendation = `❌ NON CONFORME CAM. Rischio esclusione — non procedere senza correzioni.`;
  }

  return {
    bidAdvantage: Math.round(Math.max(-30, Math.min(50, bidAdvantage))),
    marketDifferentiator,
    riskNonConformita,
    recommendation,
  };
}

export const CAM_CONFORMITA_STYLES: Record<
  CAMConformitaComplessiva,
  { box: string; text: string; score: string }
> = {
  PIENAMENTE_CONFORME: {
    box: "bg-emerald-950/20 border-emerald-900/50",
    text: "text-emerald-400",
    score: "text-emerald-400",
  },
  CONFORME: {
    box: "bg-blue-950/20 border-blue-900/50",
    text: "text-blue-400",
    score: "text-blue-400",
  },
  PARZIALMENTE_CONFORME: {
    box: "bg-amber-950/20 border-amber-900/50",
    text: "text-amber-400",
    score: "text-amber-400",
  },
  NON_CONFORME: {
    box: "bg-red-950/20 border-red-900/50",
    text: "text-red-400",
    score: "text-red-400",
  },
};

export function formatConformitaLabel(value: CAMConformitaComplessiva): string {
  return value.replace(/_/g, " ");
}

function supplierMatchesRequirement(supplier: CAMSupplier, requirement: CAMRequirement): boolean {
  const reqNome = requirement.categoria.nome.toLowerCase();
  const reqTip = requirement.categoria.tipologia;
  const supCat = supplier.categoria.toLowerCase();

  if (reqNome.includes("cement") && supCat.includes("cement")) return true;
  if (reqNome.includes("acciaio") && supCat.includes("acciaio")) return true;
  if ((reqNome.includes("energ") || reqTip === "ENERGIA") && supCat.includes("energ")) return true;
  if ((reqNome.includes("rifiut") || reqTip === "RIFIUTI") && supCat.includes("rifiut")) return true;
  if ((reqNome.includes("trasport") || reqTip === "TRASPORTO") && supCat.includes("trasport"))
    return true;

  return supCat.includes(reqNome.split(" ")[0] ?? "");
}

export function verifySuppliersForCAMRequirement(
  requirement: CAMRequirement,
  suppliersDatabase?: CAMSupplier[]
): CAMSupplierVerificationReport {
  const database = suppliersDatabase ?? MOCK_CAM_SUPPLIERS;
  const suppliersRelevanti = database.filter((s) => supplierMatchesRequirement(s, requirement));
  const suppliersConformi = suppliersRelevanti.filter((s) => s.statusVerifica === "VERIFICATO");

  const complianceRate =
    suppliersRelevanti.length > 0
      ? (suppliersConformi.length / suppliersRelevanti.length) * 100
      : 0;

  let riskSupplyChain = Math.round(100 - complianceRate);
  if (suppliersRelevanti.length === 0) riskSupplyChain = 95;

  const azioni: string[] = [];
  if (suppliersConformi.length === 0) {
    azioni.push(
      `⚠️ Nessun fornitore CAM per ${requirement.categoria.nome}. Ampliare anagrafica fornitori.`
    );
  } else if (suppliersConformi.length === 1) {
    azioni.push(
      `⚠️ Un solo fornitore CAM (${suppliersConformi[0].nome}). Pianificare backup supply chain.`
    );
  } else {
    azioni.push(
      `✓ ${suppliersConformi.length} fornitori CAM disponibili — negoziare condizioni competitive.`
    );
  }

  if (complianceRate < 50 && suppliersRelevanti.length > 0) {
    azioni.push("Risk alto: <50% fornitori conformi. Valutare partnership o alternative.");
  }

  return {
    camRequirementId: requirement.id,
    titolo: requirement.titolo,
    categoria: requirement.categoria.nome,
    suppliersRichiesti: 3,
    suppliersVerificati: suppliersConformi,
    complianceRate: Math.round(complianceRate),
    riskSupplyChain,
    azioni,
  };
}

export function verifySuppliersForCAMProfile(
  profile: CAMComplianceProfile,
  suppliersDatabase?: CAMSupplier[]
): CAMSupplierVerificationReport[] {
  return profile.requirements.map((req) =>
    verifySuppliersForCAMRequirement(req, suppliersDatabase)
  );
}

const INCREMENTI_CAM_BY_NOME: Record<string, number> = {
  "cemento a basse emissioni": 0.08,
  "acciaio riciclato": 0.05,
  "efficienza energetica cantiere": 0.12,
  "gestione rifiuti da demolizione": 0.06,
  "trasporto sostenibile materiali": 0.1,
};

export function estimateBaselineCostForRequirement(
  tender: TenderDocument,
  requirement: CAMRequirement,
  allRequirements: CAMRequirement[]
): number {
  const importoGara = parseTenderValue(tender.value) || 500_000;
  const totalPunti = allRequirements.reduce((s, r) => s + r.categoria.scorePunti, 0) || 1;
  const share = requirement.categoria.scorePunti / totalPunti;
  return Math.round(importoGara * 0.35 * share);
}

export function analyzeCAMCostImpact(
  requirement: CAMRequirement,
  baselineCost: number
): CAMCostAnalysis {
  const key = requirement.categoria.nome.toLowerCase();
  const percentualeIncremento =
    INCREMENTI_CAM_BY_NOME[key] ??
    (requirement.categoria.tipologia === "ENERGIA"
      ? 0.12
      : requirement.categoria.tipologia === "TRASPORTO"
        ? 0.1
        : 0.08);

  const importoCAM = Math.round(baselineCost * (1 + percentualeIncremento));
  const deltaCosto = importoCAM - baselineCost;
  const puntiTecniAggiuntivi = Math.max(4, Math.round(requirement.categoria.scorePunti / 3));
  const valorePerPunto = 1500;
  const valore = puntiTecniAggiuntivi * valorePerPunto;
  const paybackMesi =
    deltaCosto > 0 && valore > 0 ? Math.max(1, Math.round((deltaCosto / valore) * 12)) : 0;

  const azioniGreenBonus = [
    "Evidenziare in offerta tecnica: materiali e processi CAM conformi",
    "Allegare certificazioni EPD / ISO 14001 dei fornitori",
    "Proporre audit ESG indipendente per differenziazione reputazionale",
  ];

  let recommendation = "";
  if (paybackMesi <= 3) {
    recommendation = `✓ CAM conviene: payback ~${paybackMesi} mesi. Extra €${deltaCosto.toLocaleString("it-IT")} coperto dal valore tecnico.`;
  } else if (paybackMesi <= 6) {
    recommendation = `CAM marginale: payback ~${paybackMesi} mesi. Valutare se il punteggio tecnico giustifica l'investimento.`;
  } else {
    recommendation = `⚠️ CAM oneroso (payback ${paybackMesi}+ mesi). Prioritizzare solo se obbligatorio o margine elevato.`;
  }

  return {
    requirementId: requirement.id,
    titolo: requirement.titolo,
    importoBaseLine: baselineCost,
    importoCAM,
    deltaCosto,
    percentualeIncremento: Math.round(percentualeIncremento * 100),
    ROI: {
      azioniGreenBonus,
      puntiTecniAggiuntivi,
      valore,
      paybackMesi,
    },
    recommendation,
  };
}

export function analyzeCAMCostImpactForProfile(profile: CAMComplianceProfile): CAMCostAnalysis[] {
  return profile.requirements.map((req) =>
    analyzeCAMCostImpact(
      req,
      estimateBaselineCostForRequirement(profile.gara, req, profile.requirements)
    )
  );
}

function mapTipoDocumento(titolo: string): CAMDocumentoTipo {
  const t = titolo.toLowerCase();
  if (t.includes("certificazione") || t.includes("certificato")) return "CERTIFICAZIONE";
  if (t.includes("epd")) return "EPD";
  if (t.includes("piano")) return "PIANO";
  if (t.includes("audit")) return "AUDIT";
  if (t.includes("dichiaraz")) return "DICHIARAZIONE";
  return "ALTRO";
}

export function createCAMDocumentationTracker(profile: CAMComplianceProfile): CAMDocumentationTracker {
  const documentiObbligatori: CAMDocumentation[] = profile.requirements
    .filter((req) => req.obbligatorio)
    .map((req) => {
      const item = profile.assessment.assessmentItems.find((i) => i.requirementId === req.id);
      return {
        id: `doc-${req.id}`,
        requirementId: req.id,
        titolo: item?.titolo ?? req.titolo,
        tipoDocumento: mapTipoDocumento(req.titolo),
        fileName: "",
        dataUpload: "",
        versione: 0,
        stato: "BOZZA" as CAMDocumentoStato,
      };
    });

  const optionalReqs = profile.requirements.filter((r) => !r.obbligatorio);
  const documentiBonus: CAMDocumentation[] = optionalReqs.map((req) => ({
    id: `doc-bonus-${req.id}`,
    requirementId: req.id,
    titolo: req.titolo,
    tipoDocumento: mapTipoDocumento(req.titolo),
    fileName: "",
    dataUpload: "",
    versione: 0,
    stato: "BOZZA",
  }));

  return {
    gara: profile.gara,
    documentiObbligatori,
    documentiBonus,
    progressoDocumentazione: 0,
    dataScadenzaUltimaCertificazione: profile.requirements.find((r) => r.deadline)?.deadline,
    auditTrail: [
      {
        dataOra: new Date().toISOString(),
        azione: "CAM Documentation Tracker creato",
        utente: "System",
        note: `${documentiObbligatori.length} documenti obbligatori inizializzati`,
      },
    ],
    complianceLog: [],
  };
}

function recalcDocProgress(tracker: CAMDocumentationTracker): number {
  if (tracker.documentiObbligatori.length === 0) return 0;
  const done = tracker.documentiObbligatori.filter((d) => d.stato !== "BOZZA").length;
  return Math.round((done / tracker.documentiObbligatori.length) * 100);
}

export function addCAMDocument(
  tracker: CAMDocumentationTracker,
  requirementId: string,
  doc: { fileName: string; tipoDocumento?: CAMDocumentoTipo; nota?: string }
): CAMDocumentationTracker {
  const documentiObbligatori = tracker.documentiObbligatori.map((d) => {
    if (d.requirementId !== requirementId) return d;
    return {
      ...d,
      fileName: doc.fileName,
      dataUpload: new Date().toISOString(),
      versione: (d.versione || 0) + 1,
      tipoDocumento: doc.tipoDocumento ?? d.tipoDocumento,
      stato: "SOTTOMESSA" as CAMDocumentoStato,
    };
  });

  const auditTrail = [
    ...tracker.auditTrail,
    {
      dataOra: new Date().toISOString(),
      azione: `Documento caricato: ${doc.fileName}`,
      utente: "User",
      note: doc.nota ?? "",
    },
  ];

  const updated = { ...tracker, documentiObbligatori, auditTrail };
  return { ...updated, progressoDocumentazione: recalcDocProgress(updated) };
}

export function updateCAMDocumentStato(
  tracker: CAMDocumentationTracker,
  docIndex: number,
  nuovoStato: CAMDocumentoStato,
  utente = "User"
): CAMDocumentationTracker {
  const doc = tracker.documentiObbligatori[docIndex];
  if (!doc) return tracker;

  const statoPrecedente = doc.stato;
  const documentiObbligatori = tracker.documentiObbligatori.map((d, i) =>
    i === docIndex
      ? {
          ...d,
          stato: nuovoStato,
          dataValidazione: nuovoStato === "VERIFICATA" ? new Date().toISOString() : d.dataValidazione,
          verificatoBy: nuovoStato === "VERIFICATA" ? utente : d.verificatoBy,
        }
      : d
  );

  const complianceLog = [
    ...tracker.complianceLog,
    {
      dataOra: new Date().toISOString(),
      requirementId: doc.requirementId,
      statoPrecedente,
      statoNuovo: nuovoStato,
    },
  ];

  const auditTrail = [
    ...tracker.auditTrail,
    {
      dataOra: new Date().toISOString(),
      azione: `Stato documento → ${nuovoStato}`,
      utente,
      note: doc.titolo,
    },
  ];

  const updated = { ...tracker, documentiObbligatori, complianceLog, auditTrail };
  return { ...updated, progressoDocumentazione: recalcDocProgress(updated) };
}

export function generateCAMComplianceReport(tracker: CAMDocumentationTracker): {
  reportId: string;
  dataReport: string;
  numeroDocumentiSubmessi: number;
  numeroDocumentiVerificati: number;
  compliancePercentuale: number;
  ultimiCambiamenti: CAMDocumentationTracker["auditTrail"];
  readyForAudit: boolean;
} {
  const documentiSubmessi = tracker.documentiObbligatori.filter((d) => d.stato !== "BOZZA").length;
  const documentiVerificati = tracker.documentiObbligatori.filter(
    (d) => d.stato === "VERIFICATA"
  ).length;
  const total = tracker.documentiObbligatori.length;

  return {
    reportId: `cam-report-${Date.now()}`,
    dataReport: new Date().toISOString(),
    numeroDocumentiSubmessi: documentiSubmessi,
    numeroDocumentiVerificati: documentiVerificati,
    compliancePercentuale: tracker.progressoDocumentazione,
    ultimiCambiamenti: tracker.auditTrail.slice(-5),
    readyForAudit:
      total > 0 &&
      documentiSubmessi === total &&
      documentiVerificati >= Math.ceil(total * 0.8),
  };
}

export const SUPPLIER_COMPLIANCE_STYLES = {
  high: { box: "bg-emerald-950/20 border-emerald-900/50", rate: "text-emerald-400" },
  mid: { box: "bg-amber-950/20 border-amber-900/50", rate: "text-amber-400" },
  low: { box: "bg-red-950/20 border-red-900/50", rate: "text-red-400" },
};

export function supplierComplianceStyle(rate: number) {
  if (rate >= 70) return SUPPLIER_COMPLIANCE_STYLES.high;
  if (rate >= 40) return SUPPLIER_COMPLIANCE_STYLES.mid;
  return SUPPLIER_COMPLIANCE_STYLES.low;
}
  CAMAssessmentItem,
  CAMComplianceScore,
  CAMComplianceProfile,
  CAMCategoria,
} from "../types";

export function defaultCAMRequirementsForTender(tender: TenderDocument): CAMRequirement[] {
  const base: CAMRequirement[] = [
    {
      id: "cam-001",
      categoria: "ambientale",
      titolo: "Materiali con basso impatto ambientale",
      descrizione: "Utilizzo di materiali certificati con ridotto impatto ambientale (es. EPD, Ecolabel UE).",
      obbligatorio: true,
      normaRiferimento: "D.M. 11/10/2017",
    },
    {
      id: "cam-002",
      categoria: "ambientale",
      titolo: "Gestione rifiuti da costruzione",
      descrizione: "Piano di gestione rifiuti da cantiere con target riciclaggio ≥ 70%.",
      obbligatorio: true,
      normaRiferimento: "D.Lgs. 152/2006",
    },
    {
      id: "cam-003",
      categoria: "energetica",
      titolo: "Efficienza energetica impianti",
      descrizione: "Rispetto dei requisiti minimi di prestazione energetica.",
      obbligatorio: true,
      normaRiferimento: "D.Lgs. 192/2005",
    },
    {
      id: "cam-004",
      categoria: "energetica",
      titolo: "Illuminazione LED o classe A+",
      descrizione: "Impiego di corpi illuminanti ad alta efficienza.",
      obbligatorio: false,
      puntiPremiali: 3,
    },
    {
      id: "cam-005",
      categoria: "sociale",
      titolo: "Clausole sociali occupazione",
      descrizione: "Impegno assunzione lavoratori svantaggiati o disoccupati di lunga durata.",
      obbligatorio: false,
      puntiPremiali: 5,
      normaRiferimento: "Art. 57 D.Lgs. 36/2023",
    },
    {
      id: "cam-006",
      categoria: "qualita",
      titolo: "Sistema di gestione qualità ISO 9001",
      descrizione: "Certificazione ISO 9001 o sistema equivalente.",
      obbligatorio: false,
      puntiPremiali: 2,
    },
    {
      id: "cam-007",
      categoria: "ambientale",
      titolo: "Sistema di gestione ambientale ISO 14001 / EMAS",
      descrizione: "Certificazione ISO 14001 o registrazione EMAS.",
      obbligatorio: false,
      puntiPremiali: 4,
    },
  ];

  // Aggiungi requisiti specifici per categoria gara
  const cat = tender.category?.toUpperCase() ?? "";
  if (cat.includes("OG1") || cat.includes("EDILIZIA")) {
    base.push({
      id: "cam-008",
      categoria: "ambientale",
      titolo: "Aggregati riciclati ≥ 30%",
      descrizione: "Impiego di aggregati riciclati o recuperati per almeno il 30% in peso.",
      obbligatorio: true,
      normaRiferimento: "D.M. 11/10/2017 all. 2",
    });
  }

  return base;
}

export function createCAMAssessmentItems(requirements: CAMRequirement[]): CAMAssessmentItem[] {
  return requirements.map((req) => ({
    requirementId: req.id,
    titolo: req.titolo,
    stato: "non_applicabile" as const,
    documentiNecessari: req.obbligatorio
      ? ["Dichiarazione conformità", "Scheda tecnica prodotto"]
      : ["Documentazione facoltativa"],
  }));
}

export function calculateCAMScore(
  gara: TenderDocument,
  items: CAMAssessmentItem[],
  requirements: CAMRequirement[]
): CAMComplianceScore {
  const obbligatoriIds = requirements.filter((r) => r.obbligatorio).map((r) => r.id);
  const total = obbligatoriIds.length || 1;
  const conformi = items.filter(
    (i) => obbligatoriIds.includes(i.requirementId) && i.stato === "conforme"
  ).length;
  const parziali = items.filter(
    (i) => obbligatoriIds.includes(i.requirementId) && i.stato === "parziale"
  ).length;

  const scoreConformita = Math.round(((conformi + parziali * 0.5) / total) * 100);

  const livelloConformita =
    scoreConformita >= 80
      ? "ALTO"
      : scoreConformita >= 50
      ? "MEDIO"
      : scoreConformita >= 20
      ? "BASSO"
      : "NON_CONFORME";

  const criticitaRilevate = items
    .filter((i) => obbligatoriIds.includes(i.requirementId) && i.stato === "non_conforme")
    .map((i) => `${i.titolo}: non conforme`);

  const raccomandazioni: string[] = [];
  if (scoreConformita < 50) {
    raccomandazioni.push("Pianificare formazione interna su requisiti CAM obbligatori");
    raccomandazioni.push("Verificare conformità materiali con fornitori certificati");
  }
  if (scoreConformita < 80) {
    raccomandazioni.push("Ottenere certificazione ISO 14001 per punti premiali aggiuntivi");
  }

  return {
    gara,
    requirements,
    assessmentItems: items,
    scoreConformita,
    livelloConformita,
    criticitaRilevate,
    raccomandazioni,
    generatedAt: new Date().toISOString(),
  };
}

export function createCAMComplianceProfile(gara: TenderDocument): CAMComplianceProfile {
  const requirements = defaultCAMRequirementsForTender(gara);
  const assessmentItems = createCAMAssessmentItems(requirements);
  const score = calculateCAMScore(gara, assessmentItems, requirements);
  const categoriePresenti = [
    ...new Set(requirements.map((r) => r.categoria)),
  ] as CAMCategoria[];

  return {
    gara,
    score,
    categoriePresenti,
    rischio: score.livelloConformita === "NON_CONFORME" ? "alto" : score.livelloConformita === "BASSO" ? "medio" : "basso",
  };
}

export function updateCAMAssessmentItem(
  assessment: CAMComplianceScore,
  requirements: CAMRequirement[],
  itemId: string,
  stato: CAMAssessmentItem["stato"],
  note?: string
): CAMComplianceScore {
  const updated = assessment.assessmentItems.map((item) =>
    item.requirementId === itemId ? { ...item, stato, noteConformita: note } : item
  );
  return calculateCAMScore(assessment.gara, updated, requirements);
}

export const CAM_LIVELLO_CLASS: Record<CAMComplianceScore["livelloConformita"], string> = {
  ALTO: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  MEDIO: "text-blue-400 border-blue-800 bg-blue-950/40",
  BASSO: "text-amber-400 border-amber-800 bg-amber-950/40",
  NON_CONFORME: "text-red-400 border-red-800 bg-red-950/40",
};

export const CAM_LIVELLO_LABEL: Record<CAMComplianceScore["livelloConformita"], string> = {
  ALTO: "Conformità Alta",
  MEDIO: "Conformità Media",
  BASSO: "Conformità Bassa",
  NON_CONFORME: "Non Conforme",
};

export const CAM_CATEGORIA_LABEL: Record<CAMCategoria, string> = {
  ambientale: "Ambientale",
  energetica: "Energetica",
  sociale: "Sociale",
  qualita: "Qualità",
};
