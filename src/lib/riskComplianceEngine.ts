import type {
  TenderDocument,
  ComplianceRequirement,
  RiskFattore,
  RiskComplianceProfile,
  ComplianceChecklist,
  RiskClasse,
} from "../types";
import { parseTenderValue } from "./bidCalculations";

export interface AntimafiaComplianceCheck {
  requiresSOF: boolean;
  requiresDURC: boolean;
  requiresTracciabilita: boolean;
  requiresCertificatoCasellario: boolean;
  requiresAntincendio: boolean;
  riskSanzioni: number;
  riskEsclusione: number;
  checklistItems: Array<{
    titolo: string;
    descrizione: string;
    obbligatorio: boolean;
    riskIfMissing: string;
  }>;
}

export interface InsuranceFinancialRisk {
  richiediAssicurazioneFidelity: boolean;
  richiediAssicurazioneRC: boolean;
  richiediAssicurabilita: boolean;
  importoGaranziaRichiesto: number;
  percentualeGaranzia: number;
  riskFinanziario: number;
  riskLiquidazione: number;
  stimaCapitaleCircolante: number;
  raccomandazioni: string[];
}

export interface DocumentationVersion {
  id: string;
  fileName: string;
  dataUpload: string;
  version: number;
  fileSize: number;
  nota?: string;
  uploadedBy?: string;
}

export type DocumentationTrackerStato =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OVERDUE";

export interface ComplianceDocumentationTracker {
  requirementId: string;
  requirementTitolo: string;
  documents: DocumentationVersion[];
  latestVersion?: DocumentationVersion;
  isCompleted: boolean;
  deadlineData?: string;
  giorniRimanenti?: number;
  stato: DocumentationTrackerStato;
}

export function requirementsFromTender(tender: TenderDocument): ComplianceRequirement[] {
  return tender.requirements.map((req, index) => ({
    id: `req-tender-${index + 1}`,
    titolo: `${req.category}: ${req.description.slice(0, 80)}`,
    descrizione: req.details || req.description,
    categoria:
      req.category === "SOA" || req.category === "ISO"
        ? "CERTIFICAZIONE"
        : req.category === "Fatturato"
          ? "DOCUMENTALE"
          : "ALTRO",
    obbligatorio: !req.satisfied,
    deadline: tender.deadline || undefined,
    note: req.satisfied ? "Segnato come già soddisfatto nel profilo gara" : "Da verificare",
    confidenza: 70,
  }));
}

export function defaultRiskFactoriForTender(
  tender: TenderDocument,
  complianceRequirements: ComplianceRequirement[]
): RiskFattore[] {
  const unsatisfied = complianceRequirements.filter((r) => r.obbligatorio).length;
  const risks: RiskFattore[] = [
    {
      id: "risk-doc",
      nome: "Documentazione incompleta",
      descrizione:
        "Rischio di esclusione per allegati mancanti o dichiarazioni non conformi al disciplinare.",
      categoria: "LEGALE",
      probabilita: unsatisfied > 2 ? 70 : 45,
      impatto: 85,
      score: 0,
      mitigazione: [
        "Checklist documentale con revisione legale",
        "Verifica requisiti obbligatori 48h prima della scadenza",
      ],
      confidenza: 80,
    },
    {
      id: "risk-time",
      nome: "Timeline stretta",
      descrizione: `Scadenza gara ${tender.deadline} — rischio ritardi su raccolta documenti e firme.`,
      categoria: "OPERATIVO",
      probabilita: 55,
      impatto: 70,
      score: 0,
      mitigazione: [
        "Piano operativo con milestone giornaliere",
        "Responsabile unico per submission",
      ],
      confidenza: 75,
    },
    {
      id: "risk-org",
      nome: "Complessità organizzativa",
      descrizione: `Gara ${tender.category} in ${tender.region}: coordinamento squadre e referenze.`,
      categoria: "OPERATIVO",
      probabilita: 50,
      impatto: 60,
      score: 0,
      mitigazione: ["Assegnazione capo commessa dedicato", "Riunione allineamento interfunzionale"],
      confidenza: 70,
    },
  ];
  return risks.map((r) => ({
    ...r,
    score: Math.round((r.probabilita * r.impatto) / 100),
  }));
}

export function createRiskComplianceProfile(
  tender: TenderDocument,
  complianceRequirements: ComplianceRequirement[],
  riskFactori: RiskFattore[]
): RiskComplianceProfile {
  const normalizedRisks = riskFactori.map((r) => ({
    ...r,
    score: r.score || Math.round((r.probabilita * r.impatto) / 100),
  }));

  const riskComplessivo = calculateAggregateRisk(normalizedRisks);
  const riskClasse = classifyRiskLevel(riskComplessivo);
  const checklist = createComplianceChecklist(tender, complianceRequirements);

  return {
    id: `rcp-${Date.now()}`,
    gara: tender,
    dataAnalisi: new Date().toISOString(),
    riskFactori: normalizedRisks,
    riskComplessivo,
    riskClasse,
    complianceRequirements,
    checklist,
  };
}

function calculateAggregateRisk(riskFactori: RiskFattore[]): number {
  if (riskFactori.length === 0) return 0;

  const weighted =
    riskFactori.reduce((sum, r) => {
      const weight = 1 + (r.impatto / 100) * 0.5;
      return sum + r.score * weight;
    }, 0) / riskFactori.length;

  const maxScore = Math.max(...riskFactori.map((r) => r.score));
  return Math.round(Math.max(weighted, maxScore * 0.85));
}

export function classifyRiskLevel(score: number): RiskClasse {
  if (score >= 75) return "CRITICO";
  if (score >= 50) return "ALTO";
  if (score >= 25) return "MEDIO";
  return "BASSO";
}

function createComplianceChecklist(
  tender: TenderDocument,
  requirements: ComplianceRequirement[]
): ComplianceChecklist {
  const now = new Date();
  const deadlineGara = new Date(tender.deadline);
  const giorniRimanenti = Number.isNaN(deadlineGara.getTime())
    ? 30
    : Math.ceil((deadlineGara.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const scadenze = requirements
    .filter((r) => r.deadline)
    .map((r) => {
      const dataScadenza = new Date(r.deadline!);
      const giorni = Math.ceil((dataScadenza.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let stato: "OK" | "ATTENZIONE" | "CRITICA" = "OK";
      if (giorni <= 3) stato = "CRITICA";
      else if (giorni <= 7) stato = "ATTENZIONE";

      return {
        requirementId: r.id,
        dataScadenza: r.deadline!,
        giorni,
        stato,
      };
    });

  if (requirements.length > 0 && scadenze.length === 0 && tender.deadline) {
    let stato: "OK" | "ATTENZIONE" | "CRITICA" = "OK";
    if (giorniRimanenti <= 3) stato = "CRITICA";
    else if (giorniRimanenti <= 7) stato = "ATTENZIONE";
    requirements.slice(0, 3).forEach((r) => {
      scadenze.push({
        requirementId: r.id,
        dataScadenza: tender.deadline,
        giorni: giorniRimanenti,
        stato,
      });
    });
  }

  return {
    id: `checklist-${Date.now()}`,
    gara: tender,
    dataCreazione: new Date().toISOString(),
    requirements,
    progressoCompletamento: 0,
    itemsCompletati: [],
    scadenze,
    documentazioneAllegata: [],
  };
}

export function markRequirementCompleted(
  checklist: ComplianceChecklist,
  requirementId: string,
  fileName?: string
): ComplianceChecklist {
  const updated = { ...checklist };
  const itemsCompletati = updated.itemsCompletati.includes(requirementId)
    ? [...updated.itemsCompletati]
    : [...updated.itemsCompletati, requirementId];

  let documentazioneAllegata = [...updated.documentazioneAllegata];
  if (fileName) {
    const exists = documentazioneAllegata.some((d) => d.requirementId === requirementId);
    if (!exists) {
      documentazioneAllegata = [
        ...documentazioneAllegata,
        {
          requirementId,
          fileName,
          dataUpload: new Date().toISOString(),
        },
      ];
    }
  }

  const progressoCompletamento =
    updated.requirements.length > 0
      ? Math.round((itemsCompletati.length / updated.requirements.length) * 100)
      : 0;

  return {
    ...updated,
    itemsCompletati,
    documentazioneAllegata,
    progressoCompletamento,
  };
}

export function identifyCriticalComplianceItems(
  profile: RiskComplianceProfile
): ComplianceRequirement[] {
  const now = new Date();
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return profile.complianceRequirements.filter((req) => {
    if (!req.obbligatorio) return false;
    if (req.deadline && new Date(req.deadline) < sevenDaysAhead) return true;
    if (!profile.checklist.itemsCompletati.includes(req.id)) return true;
    return false;
  });
}

export function generateRiskMitigationPlan(profile: RiskComplianceProfile): Array<{
  riskId: string;
  riskNome: string;
  azioni: string[];
  responsabile: string;
  timeline: string;
}> {
  return profile.riskFactori
    .filter((r) => r.score >= 50)
    .map((risk) => ({
      riskId: risk.id,
      riskNome: risk.nome,
      azioni: risk.mitigazione,
      responsabile: determineResponsabile(risk.categoria),
      timeline: estimateTimeline(risk.categoria),
    }));
}

function determineResponsabile(categoria: string): string {
  const map: Record<string, string> = {
    LEGALE: "Legal / Compliance",
    REPUTAZIONALE: "Project Management",
    OPERATIVO: "Operations Lead",
    FINANZIARIO: "Finance Director",
    ALTRO: "Project Manager",
  };
  return map[categoria] || "Project Manager";
}

function estimateTimeline(categoria: string): string {
  const map: Record<string, string> = {
    LEGALE: "Entro 5 giorni",
    REPUTAZIONALE: "Entro 2 settimane",
    OPERATIVO: "Entro 1 settimana",
    FINANZIARIO: "Entro 3 giorni",
    ALTRO: "Entro 1 settimana",
  };
  return map[categoria] || "Entro 1 settimana";
}

/**
 * Compliance antimafia e requisiti legali (ANAC / D.Lgs. 81/2008).
 */
export function analyzeAntimafiaCompliance(tender: TenderDocument): AntimafiaComplianceCheck {
  const importoGara = parseTenderValue(tender.value);
  const requiresFullCompliance = importoGara >= 40_000 || importoGara === 0;

  const checklistItems = [
    {
      titolo: "Sottoscrizione Opportunità Finanziaria (SOF)",
      descrizione: "Dichiarazione che le risorse non provengono da riciclaggio o infiltrazioni mafiose",
      obbligatorio: requiresFullCompliance,
      riskIfMissing: "Esclusione automatica dalla gara",
    },
    {
      titolo: "DURC — Documento Unico Regolarità Contributiva",
      descrizione: "Certificazione contributi INPS/INAIL in regola",
      obbligatorio: requiresFullCompliance,
      riskIfMissing: "Esclusione; sanzioni amministrative €5k–€50k",
    },
    {
      titolo: "Tracciabilità flussi finanziari",
      descrizione: "Conformità art. 3 D.Lgs. 231/2002: pagamenti tracciabili, divieto contanti oltre soglie",
      obbligatorio: requiresFullCompliance,
      riskIfMissing: "Esclusione; confisca importi; rischio penale",
    },
    {
      titolo: "Certificato Casellario Giudiziale",
      descrizione: "Assenza condanne per reati gravi (mafia, frode, corruzione)",
      obbligatorio: requiresFullCompliance,
      riskIfMissing: "Esclusione automatica; impugnazione aggiudicazione",
    },
    {
      titolo: "Certificato Prevenzione Incendi",
      descrizione: "Per cantieri > 100 addetti o strutture ad alto rischio incendio",
      obbligatorio: importoGara > 500_000,
      riskIfMissing: "Sospensione cantiere; multa €10k–€200k",
    },
  ];

  return {
    requiresSOF: requiresFullCompliance,
    requiresDURC: requiresFullCompliance,
    requiresTracciabilita: requiresFullCompliance,
    requiresCertificatoCasellario: requiresFullCompliance,
    requiresAntincendio: importoGara > 500_000,
    riskSanzioni: requiresFullCompliance ? 60 : 20,
    riskEsclusione: requiresFullCompliance ? 80 : 30,
    checklistItems,
  };
}

/**
 * Requisiti assicurativi e rischi finanziari (garanzia, liquidità PA).
 */
export function analyzeInsuranceFinancialRisk(
  tender: TenderDocument,
  vostroCapitale: number
): InsuranceFinancialRisk {
  const importoGara = parseTenderValue(tender.value) || 100_000;

  const percentualeGaranzia = importoGara <= 100_000 ? 0.05 : 0.1;
  const importoGaranziaRichiesto = Math.round(importoGara * percentualeGaranzia);

  const ratioCapitalVsGara = vostroCapitale > 0 ? vostroCapitale / importoGara : 0;
  let riskFinanziario = 50;
  if (ratioCapitalVsGara >= 0.5) riskFinanziario = 20;
  else if (ratioCapitalVsGara >= 0.3) riskFinanziario = 45;
  else if (ratioCapitalVsGara >= 0.1) riskFinanziario = 70;
  else riskFinanziario = 85;

  const durataGaraEstimata = 90;
  const giorniLiquidazione = 75;
  const totaleDaysMoneyTied = durataGaraEstimata + giorniLiquidazione;
  let riskLiquidazione = Math.min(100, (totaleDaysMoneyTied / 180) * 100);

  const costiGiornalieri = importoGara * 0.002;
  const stimaCapitaleCircolante = Math.round(costiGiornalieri * totaleDaysMoneyTied);

  const raccomandazioni: string[] = [];

  if (importoGara > vostroCapitale) {
    raccomandazioni.push(
      `⚠️ Gara (€${importoGara.toLocaleString("it-IT")}) > capitale disponibile (€${vostroCapitale.toLocaleString("it-IT")}). Valutare RTI o finanziamento.`
    );
  }

  if (riskFinanziario > 60) {
    raccomandazioni.push(
      `Risk finanziario ALTO. Linea di credito ~€${importoGaranziaRichiesto.toLocaleString("it-IT")}, polizza RC, o co-impresa RTI.`
    );
  }

  if (riskLiquidazione > 70) {
    raccomandazioni.push(
      `Risk liquidazione ALTO (PA ~${Math.round(giorniLiquidazione)} gg). Anticipi fatture / factoring.`
    );
  }

  raccomandazioni.push(
    `Procurare RC triennale ~€${Math.round(importoGara / 10_000) * 100}k e garanzia fideiussoria €${importoGaranziaRichiesto.toLocaleString("it-IT")}.`
  );

  return {
    richiediAssicurazioneFidelity: true,
    richiediAssicurazioneRC: true,
    richiediAssicurabilita: importoGara > 150_000,
    importoGaranziaRichiesto,
    percentualeGaranzia: percentualeGaranzia * 100,
    riskFinanziario,
    riskLiquidazione,
    stimaCapitaleCircolante,
    raccomandazioni,
  };
}

function computeTrackerStato(
  deadlineData: string | undefined,
  isCompleted: boolean,
  documentCount: number
): DocumentationTrackerStato {
  const now = new Date();
  if (deadlineData) {
    const deadline = new Date(deadlineData);
    if (!Number.isNaN(deadline.getTime()) && now > deadline && !isCompleted) {
      return "OVERDUE";
    }
  }
  if (isCompleted) return "COMPLETED";
  if (documentCount > 0) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export function buildDocumentationTrackers(
  requirements: ComplianceRequirement[],
  checklist: ComplianceChecklist
): ComplianceDocumentationTracker[] {
  const now = new Date();

  return requirements.map((req) => {
    const allegati = checklist.documentazioneAllegata.filter((d) => d.requirementId === req.id);
    const documents: DocumentationVersion[] = allegati.map((a, index) => ({
      id: `doc-${req.id}-v${index + 1}`,
      fileName: a.fileName,
      dataUpload: a.dataUpload,
      version: index + 1,
      fileSize: 0,
      nota: a.nota,
    }));

    const deadlineData = req.deadline;
    let giorniRimanenti: number | undefined;
    if (deadlineData) {
      const d = new Date(deadlineData);
      if (!Number.isNaN(d.getTime())) {
        giorniRimanenti = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    const isCompleted = checklist.itemsCompletati.includes(req.id);

    return {
      requirementId: req.id,
      requirementTitolo: req.titolo,
      documents,
      latestVersion: documents.length > 0 ? documents[documents.length - 1] : undefined,
      isCompleted,
      deadlineData,
      giorniRimanenti,
      stato: computeTrackerStato(deadlineData, isCompleted, documents.length),
    };
  });
}

export function updateDocumentationTracker(
  tracker: ComplianceDocumentationTracker,
  newFile: { fileName: string; fileSize: number; nota?: string }
): ComplianceDocumentationTracker {
  const nextVersion = tracker.documents.length + 1;
  const newDoc: DocumentationVersion = {
    id: `doc-${tracker.requirementId}-v${nextVersion}`,
    fileName: newFile.fileName,
    dataUpload: new Date().toISOString(),
    version: nextVersion,
    fileSize: newFile.fileSize,
    nota: newFile.nota,
  };

  const documents = [...tracker.documents, newDoc];
  const isCompleted = true;

  const updated: ComplianceDocumentationTracker = {
    ...tracker,
    documents,
    latestVersion: newDoc,
    isCompleted,
    stato: computeTrackerStato(tracker.deadlineData, isCompleted, documents.length),
  };

  return updated;
}

export function generateDocumentationReport(trackers: ComplianceDocumentationTracker[]): {
  completedCount: number;
  overdueCount: number;
  inProgressCount: number;
  notStartedCount: number;
  summary: string;
} {
  const stats = {
    completedCount: trackers.filter((t) => t.stato === "COMPLETED").length,
    overdueCount: trackers.filter((t) => t.stato === "OVERDUE").length,
    inProgressCount: trackers.filter((t) => t.stato === "IN_PROGRESS").length,
    notStartedCount: trackers.filter((t) => t.stato === "NOT_STARTED").length,
  };

  const summary =
    stats.overdueCount > 0
      ? `⚠️ ${stats.overdueCount} item scaduti — azione immediata richiesta`
      : stats.notStartedCount > 0
        ? `📋 ${stats.notStartedCount} item non iniziati — iniziare subito`
        : `✅ ${stats.completedCount}/${trackers.length} completati`;

  return { ...stats, summary };
}

export const RISK_CLASSE_STYLES: Record<
  RiskClasse,
  { box: string; text: string; icon: string }
> = {
  BASSO: {
    box: "bg-emerald-950/20 border-emerald-900/50",
    text: "text-emerald-400",
    icon: "text-emerald-400",
  },
  MEDIO: {
    box: "bg-amber-950/20 border-amber-900/50",
    text: "text-amber-400",
    icon: "text-amber-400",
  },
  ALTO: {
    box: "bg-orange-950/20 border-orange-900/50",
    text: "text-orange-400",
    icon: "text-orange-400",
  },
  CRITICO: {
    box: "bg-red-950/20 border-red-900/50",
    text: "text-red-400",
    icon: "text-red-400",
  },
};
