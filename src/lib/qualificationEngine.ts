import type {
  TenderDocument,
  QualificationRequirement,
  QualificationAssessment,
  CompanyQualificationStatus,
  CompanyProfile,
  QualificationVerdetto,
  QualificationGapCritico,
  QualificationReadinessPath,
} from "../types";
import { parseTenderValue } from "./bidCalculations";
import { checkSOAQualificationForTender } from "./bidQualificationEngine";

export function defaultQualificationRequirementsForTender(
  tender: TenderDocument
): QualificationRequirement[] {
  const importo = parseTenderValue(tender.value) || 500_000;
  const cat = (tender.category || "03").substring(0, 2);

  return [
    {
      id: "qual-default-1",
      titolo: "SOA — categoria e importo minimo",
      descrizione:
        "Attestazione SOA con categoria idonea e importo massimo realizzato coerente con la gara",
      categoria: "SOA",
      tipoRequisito: "OBBLIGATORIO",
      soaCategoria: cat,
      soaImportoMinimo: Math.round(importo * 0.5),
      confidenza: 95,
      note: "Standard: capacità SOA almeno ~50% importo gara",
    },
    {
      id: "qual-default-2",
      titolo: "DURC e antimafia (SOF)",
      descrizione: "DURC e certificazioni antimafia",
      categoria: "CERTIFICAZIONE",
      tipoRequisito: "ESCLUSORIO",
      certificazioneRichiesta: "DURC + SOF",
      confidenza: 100,
      note: "Obbligatorio appalti pubblici",
    },
    {
      id: "qual-default-3",
      titolo: "Polizza RC generale",
      descrizione: "Copertura RC adeguata",
      categoria: "ASSICURAZIONE",
      tipoRequisito: "OBBLIGATORIO",
      importoAssicurazione: Math.max(100_000, Math.round(importo * 0.1)),
      confidenza: 90,
      note: "~10% importo gara",
    },
    {
      id: "qual-default-4",
      titolo: "Esperienza lavori simili",
      descrizione: "Esperienza nel settore",
      categoria: "ESPERIENZA",
      tipoRequisito: "OBBLIGATORIO",
      anniiEsperienza: 3,
      numeroProgettSimilari: 2,
      confidenza: 75,
      note: "Stima tipica",
    },
    {
      id: "qual-default-5",
      titolo: "Capacità economico-finanziaria",
      descrizione: "Solidità economica",
      categoria: "CAPITALE",
      tipoRequisito: "OBBLIGATORIO",
      capitaleMinimoRichiesto: Math.round(importo * 0.1),
      confidenza: 70,
      note: "Proxy da verificare in bando",
    },
  ];
}

export const QUALIFICATION_VERDICT_STYLES: Record<
  QualificationVerdetto,
  { bg: string; border: string; text: string; label: string }
> = {
  QUALIFICATO: {
    bg: "bg-emerald-950/40",
    border: "border-emerald-800",
    text: "text-emerald-400",
    label: "Qualificato",
  },
  QUALIFICATO_PARZIALE: {
    bg: "bg-amber-950/40",
    border: "border-amber-800",
    text: "text-amber-400",
    label: "Qualificato parziale",
  },
  NON_QUALIFICATO: {
    bg: "bg-orange-950/40",
    border: "border-orange-800",
    text: "text-orange-400",
    label: "Non qualificato",
  },
  ESCLUSORIO: {
    bg: "bg-red-950/40",
    border: "border-red-800",
    text: "text-red-400",
    label: "Esclusorio",
  },
};

export const QUALIFICATION_MATCH_STYLES: Record<
  CompanyQualificationStatus["status"],
  { border: string; text: string; icon: string }
> = {
  CONFORME: { border: "border-l-emerald-500", text: "text-emerald-400", icon: "✓" },
  PARZIALE: { border: "border-l-amber-500", text: "text-amber-400", icon: "⚠" },
  NON_CONFORME: { border: "border-l-red-500", text: "text-red-400", icon: "✗" },
  VERIFICARE: { border: "border-l-slate-500", text: "text-slate-400", icon: "?" },
};

function normalizeSoaCode(code: string): string {
  return code.replace(/\s/g, "").toUpperCase();
}

function soaCategoryMatches(required: string, companyCode: string): boolean {
  const r = normalizeSoaCode(required);
  const c = normalizeSoaCode(companyCode);
  if (!r || !c) return false;
  if (c === r || c.startsWith(r) || r.startsWith(c)) return true;
  if (r.length >= 2 && c.length >= 2 && c.slice(0, 2) === r.slice(0, 2)) return true;
  return false;
}

export function assessQualification(
  tender: TenderDocument,
  requirements: QualificationRequirement[],
  companyProfile: CompanyProfile
): QualificationAssessment {
  const matchingStatus = requirements.map((req) =>
    matchRequirementToCompany(req, companyProfile, tender)
  );

  const requirementsObbligatori = requirements.filter(
    (r) => r.tipoRequisito === "OBBLIGATORIO"
  ).length;
  const requirementsEsclusori = requirements.filter(
    (r) => r.tipoRequisito === "ESCLUSORIO"
  ).length;

  const conformiObbligatori = matchingStatus.filter((m) => {
    const req = requirements.find((r) => r.id === m.requirementId);
    return (
      req?.tipoRequisito === "OBBLIGATORIO" &&
      (m.status === "CONFORME" || m.status === "PARZIALE")
    );
  }).length;

  const conformiEsclusori = matchingStatus.filter((m) => {
    const req = requirements.find((r) => r.id === m.requirementId);
    return req?.tipoRequisito === "ESCLUSORIO" && m.status === "CONFORME";
  }).length;

  const nonConformiObbligatori = matchingStatus.filter((m) => {
    const req = requirements.find((r) => r.id === m.requirementId);
    return req?.tipoRequisito === "OBBLIGATORIO" && m.status === "NON_CONFORME";
  }).length;

  let qualificazioneVerdetto: QualificationVerdetto = "QUALIFICATO";

  if (requirementsEsclusori > 0 && conformiEsclusori < requirementsEsclusori) {
    qualificazioneVerdetto = "ESCLUSORIO";
  } else if (nonConformiObbligatori >= 2) {
    qualificazioneVerdetto = "NON_QUALIFICATO";
  } else if (conformiObbligatori < requirementsObbligatori) {
    qualificazioneVerdetto = "QUALIFICATO_PARZIALE";
  } else if (
    matchingStatus.some((m) => m.status === "PARZIALE" || m.status === "VERIFICARE")
  ) {
    qualificazioneVerdetto = "QUALIFICATO_PARZIALE";
  }

  const compliancePercent =
    requirements.length > 0
      ? Math.round(
          (matchingStatus.filter((m) => m.status === "CONFORME").length /
            requirements.length) *
            100
        )
      : 0;

  const gapsCritici: QualificationGapCritico[] = matchingStatus
    .filter((m) => m.status !== "CONFORME")
    .map((m) => {
      const req = requirements.find((r) => r.id === m.requirementId)!;
      return {
        requirement: m.titolo,
        gap: m.gap || "Gap da verificare",
        timeline_colmamento:
          req.tipoRequisito === "ESCLUSORIO" ? "URGENTE" : "2-4 settimane",
        effort:
          (req.soaImportoMinimo ?? 0) > 1_000_000
            ? "ALTO"
            : req.tipoRequisito === "ESCLUSORIO"
              ? "MEDIO"
              : "BASSO",
      };
    });

  const poteRTI = qualificazioneVerdetto !== "ESCLUSORIO";
  const requirementsPerRTI = matchingStatus
    .filter((m) => m.status !== "CONFORME")
    .map((m) => m.titolo);

  const recommendation = buildQualificationRecommendation(
    qualificazioneVerdetto,
    gapsCritici,
    poteRTI
  );

  return {
    id: `qual-${Date.now()}`,
    gara: tender,
    dataAnalisi: new Date().toISOString(),
    requirements,
    requirementsTotal: requirements.length,
    requirementsObbligatori,
    requirementsEsclusori,
    matchingStatus,
    conformiObbligatori,
    conformiEsclusori,
    qualificazioneVerdetto,
    compliancePercent,
    gapsCritici,
    poteRTI,
    requirementsPerRTI,
    recommendation,
  };
}

function matchRequirementToCompany(
  req: QualificationRequirement,
  company: CompanyProfile,
  tender: TenderDocument
): CompanyQualificationStatus {
  let status: CompanyQualificationStatus["status"] = "VERIFICARE";
  let evidenza = "";
  let gap = "";
  let azioni: string[] = [];

  if (req.categoria === "SOA") {
    const soaCheck = checkSOAQualificationForTender(company.soaAttuale, tender);
    const importoMin =
      req.soaImportoMinimo ?? parseTenderValue(tender.value) * 0.5;

    if (!company.soaAttuale?.categorie.length) {
      status = "NON_CONFORME";
      gap = "SOA non importato nel profilo impresa";
      azioni = [
        "Carica attestazione SOA nel profilo",
        "Valuta RTI con impresa idonea",
      ];
    } else if (req.soaCategoria) {
      const cat = company.soaAttuale.categorie.find((c) =>
        soaCategoryMatches(req.soaCategoria!, c.codice)
      );
      if (!cat) {
        status = "NON_CONFORME";
        gap = `Categoria SOA ${req.soaCategoria} non presente`;
        azioni = [
          "Richiedere ampliamento SOA a CCIAA (3-4 settimane)",
          "RTI con partner nella categoria richiesta",
        ];
      } else if (cat.importoMaxRealizzato >= importoMin) {
        status = "CONFORME";
        evidenza = `SOA ${cat.codice}: €${cat.importoMaxRealizzato.toLocaleString("it-IT")}`;
      } else {
        status = "PARZIALE";
        gap = `Importo SOA insufficiente: €${cat.importoMaxRealizzato.toLocaleString("it-IT")} vs €${importoMin.toLocaleString("it-IT")}`;
        azioni = ["Aumentare importo SOA tramite CCIAA", "RTI con partner"];
      }
    } else if (soaCheck.isQualified) {
      status = "CONFORME";
      evidenza = soaCheck.recommendation.slice(0, 120);
    } else if (soaCheck.gap.importo && !soaCheck.gap.categoria) {
      status = "PARZIALE";
      gap = soaCheck.recommendation;
      azioni = ["Aumentare importo SOA", "RTI"];
    } else {
      status = "NON_CONFORME";
      gap = soaCheck.recommendation;
      azioni = ["Verificare categoria SOA", "RTI"];
    }
  }

  if (req.categoria === "CERTIFICAZIONE") {
    const label = (req.certificazioneRichiesta || req.titolo).toLowerCase();
    if (label.includes("durc") || label.includes("antimafia") || label.includes("sof")) {
      status = company.vatNumber ? "CONFORME" : "VERIFICARE";
      evidenza = company.vatNumber
        ? "Profilo impresa attivo — verificare scadenze DURC/SOF"
        : undefined;
      if (status === "VERIFICARE") {
        gap = "Completa profilo impresa e allega certificazioni";
        azioni = ["Richiedere DURC e SOF aggiornati"];
      }
    } else {
      status = "VERIFICARE";
      evidenza = `Verificare: ${req.certificazioneRichiesta || req.titolo}`;
      azioni = ["Confrontare certificazioni in possesso con bando"];
    }
  }

  if (req.categoria === "ASSICURAZIONE" && req.importoAssicurazione) {
    const coperturaStimata = Math.max(
      company.lastYearRevenue * 0.05,
      parseTenderValue(tender.value) * 0.08
    );
    if (coperturaStimata >= req.importoAssicurazione) {
      status = "CONFORME";
      evidenza = `Copertura stimata €${Math.round(coperturaStimata).toLocaleString("it-IT")} (proxy da fatturato)`;
    } else {
      status = "PARZIALE";
      gap = `Copertura RC stimata insufficiente vs €${req.importoAssicurazione.toLocaleString("it-IT")}`;
      azioni = ["Aumentare polizza RC con broker (1-2 settimane)"];
    }
  }

  if (req.categoria === "ESPERIENZA") {
    const anni =
      new Date().getFullYear() - (company.foundedYear || new Date().getFullYear());
    const progetti =
      (company.historicalTenders?.length ?? 0) +
      (company.tenderHistory?.length ?? 0) +
      (company.similarWorks?.length ?? 0);
    const minAnni = req.anniiEsperienza ?? 0;
    const minProgetti = req.numeroProgettSimilari ?? 0;

    if (anni >= minAnni && progetti >= minProgetti) {
      status = "CONFORME";
      evidenza = `${anni} anni attività, ${progetti} referenze in profilo`;
    } else if (progetti >= minProgetti || anni >= minAnni) {
      status = "PARZIALE";
      gap = `Esperienza parziale: ${anni} anni, ${progetti} progetti (richiesti ${minAnni}a / ${minProgetti} opere)`;
      azioni = ["Integrare elenco lavori simili nel profilo", "RTI con partner esperto"];
    } else {
      status = "NON_CONFORME";
      gap = `Esperienza insufficiente (${anni} anni, ${progetti} referenze)`;
      azioni = ["Documentare lavori simili", "RTI"];
    }
  }

  if (req.categoria === "CAPITALE" && req.capitaleMinimoRichiesto) {
    const capacita = company.lastYearRevenue || company.targetImportMax;
    if (capacita >= req.capitaleMinimoRichiesto) {
      status = "CONFORME";
      evidenza = `Capacità economica stimata €${capacita.toLocaleString("it-IT")}`;
    } else {
      status = "NON_CONFORME";
      gap = `Capacità €${capacita.toLocaleString("it-IT")} vs €${req.capitaleMinimoRichiesto.toLocaleString("it-IT")} richiesti`;
      azioni = ["Documentare bilanci", "RTI"];
    }
  }

  if (req.categoria === "ORGANIZZATIVA" && req.personaleMinimo) {
    if (company.employeesCount >= req.personaleMinimo) {
      status = "CONFORME";
      evidenza = `${company.employeesCount} dipendenti`;
    } else {
      status = "PARZIALE";
      gap = `${company.employeesCount} dipendenti vs ${req.personaleMinimo} richiesti`;
      azioni = ["Verificare requisito organico in bando", "Subappalto specializzato"];
    }
  }

  return {
    requirementId: req.id,
    titolo: req.titolo,
    categoria: req.categoria,
    status,
    evidenza: evidenza || undefined,
    gap: gap || undefined,
    azioni,
  };
}

function buildQualificationRecommendation(
  verdetto: QualificationVerdetto,
  gaps: QualificationGapCritico[],
  poteRTI: boolean
): string {
  const gapNames = gaps.slice(0, 2).map((g) => g.requirement).join(", ");

  if (verdetto === "ESCLUSORIO") {
    return `Esclusorio: requisiti a esclusione automatica non soddisfatti. Non partecipare senza regolarizzare.${gapNames ? ` Critici: ${gapNames}.` : ""}`;
  }
  if (verdetto === "NON_QUALIFICATO") {
    return `Non qualificato: gap significativi su obbligatori.${poteRTI ? " Valuta RTI per coprire capacità mancanti." : " Partecipazione sconsigliata."}`;
  }
  if (verdetto === "QUALIFICATO_PARZIALE") {
    return `Qualificato parziale: ${gaps.length} gap da colmare. Pianifica azioni o RTI prima dell'analisi Bid/No-Bid.`;
  }
  return "Qualificato: requisiti principali rispettati. Puoi procedere con analisi Bid/No-Bid.";
}

export function generateQualificationPath(
  assessment: QualificationAssessment
): QualificationReadinessPath[] {
  return assessment.matchingStatus
    .filter((m) => m.status !== "CONFORME")
    .map((m) => {
      const req = assessment.requirements.find((r) => r.id === m.requirementId);
      const gapEntry = assessment.gapsCritici.find((g) => g.requirement === m.titolo);

      let priorita: QualificationReadinessPath["priorita"] = "MEDIA";
      if (req?.tipoRequisito === "ESCLUSORIO") priorita = "CRITICA";
      else if (req?.tipoRequisito === "OBBLIGATORIO") priorita = "ALTA";

      return {
        requirementId: m.requirementId,
        titolo: m.titolo,
        gapAttuali: m.gap || "Gap da verificare",
        azionePer_Colmare: m.azioni[0] || "Verificare con esperti",
        timeline: gapEntry?.timeline_colmamento || "2-4 settimane",
        effort: gapEntry?.effort || "MEDIO",
        priorita,
        partner_Necessario:
          assessment.poteRTI && m.status === "NON_CONFORME"
            ? "Partner RTI nella categoria"
            : undefined,
      };
    });
}

// ─── Part 2: RTI, acceleration, progress ───────────────────────────────────

export interface PartnerProfile {
  id: string;
  nome: string;
  settoriSpecializzazione: string[];
  regioni: string[];
  soa?: {
    categorie: Array<{
      codice: string;
      importoMaxRealizzato: number;
    }>;
  };
  certificazioni: string[];
  importoRCGeneale?: number;
  winRate?: number;
  numeroProgetti?: number;
  reputazione: "OTTIMA" | "BUONA" | "ACCETTABILE";
  dataUltimoAggiornamento: string;
}

export interface RTIRecommendation {
  requirementId: string;
  requirementGap: string;
  partnerProfiloIdoneo: {
    specializzazione: string[];
    caretteristiche: string[];
  };
  partnerSuggeriti?: PartnerProfile[];
  strategiaRTI: string;
  vantaggiRTI: string[];
  rischiRTI: string[];
  timeline_formazione: string;
}

export type AccelerationFeasibility = "ALTA" | "MEDIA" | "BASSA";

export interface TimelineAccelerationOption {
  gap: string;
  strategia: string;
  timeline: string;
  costo_stimato?: number;
  rischi: string[];
  feasibility: AccelerationFeasibility;
  note: string;
}

export type QualificationProgressStatus = "NON_INIZIATO" | "IN_CORSO" | "COMPLETATO";

export interface QualificationProgressItem {
  gapId: string;
  titolo: string;
  status: QualificationProgressStatus;
  dataInizio?: string;
  dataScadenza?: string;
  percentualeProgresso: number;
  tasksCompleted?: Array<{
    task: string;
    dataComplezione: string;
    note?: string;
  }>;
  riskiResidui?: string[];
}

export type QualificationReadinessStatus = "PRONTO" | "IN_PROGRESSO" | "NOT_READY";

export type MilestoneCriticita = "BASSA" | "MEDIA" | "ALTA";
export type MilestoneStatus = "ON_TRACK" | "AT_RISK" | "DELAYED";

export interface QualificationProgressTracker {
  assessmentId: string;
  gara: TenderDocument;
  dataCreazione: string;
  dataUltimoAggiornamento: string;
  progressItems: QualificationProgressItem[];
  progressComplessivo: number;
  gapsCriticheRemote: number;
  milestonesRimanenti: Array<{
    milestone: string;
    dataTarget: string;
    criticita: MilestoneCriticita;
    status: MilestoneStatus;
  }>;
  readinessStatus: QualificationReadinessStatus;
}

export const ACCELERATION_FEASIBILITY_STYLES: Record<
  AccelerationFeasibility,
  { border: string; badge: string }
> = {
  ALTA: {
    border: "border-l-emerald-500",
    badge: "bg-emerald-900/60 text-emerald-400",
  },
  MEDIA: {
    border: "border-l-amber-500",
    badge: "bg-amber-900/60 text-amber-400",
  },
  BASSA: {
    border: "border-l-red-500",
    badge: "bg-red-900/60 text-red-400",
  },
};

export const URGENZA_IMPLEMENTAZIONE_STYLES: Record<
  "BASSA" | "MEDIA" | "ALTA" | "CRITICA",
  { box: string; border: string; text: string }
> = {
  CRITICA: {
    box: "bg-red-950/30",
    border: "border-red-800/60",
    text: "text-red-400",
  },
  ALTA: {
    box: "bg-orange-950/30",
    border: "border-orange-800/60",
    text: "text-orange-400",
  },
  MEDIA: {
    box: "bg-amber-950/30",
    border: "border-amber-800/60",
    text: "text-amber-400",
  },
  BASSA: {
    box: "bg-emerald-950/30",
    border: "border-emerald-800/60",
    text: "text-emerald-400",
  },
};

export const MILESTONE_STATUS_STYLES: Record<
  MilestoneStatus,
  { border: string; badge: string }
> = {
  ON_TRACK: {
    border: "border-l-emerald-500",
    badge: "bg-emerald-900/60 text-emerald-400",
  },
  AT_RISK: {
    border: "border-l-amber-500",
    badge: "bg-amber-900/60 text-amber-400",
  },
  DELAYED: {
    border: "border-l-red-500",
    badge: "bg-red-900/60 text-red-400",
  },
};

/** Partner di esempio quando non c'è un database RTI collegato. */
export const SAMPLE_RTI_PARTNERS: PartnerProfile[] = [
  {
    id: "partner-demo-1",
    nome: "Edil Struttura Nord S.r.l.",
    settoriSpecializzazione: ["Strutture", "SOA OG1-OG3"],
    regioni: ["Lombardia", "Veneto"],
    soa: {
      categorie: [
        { codice: "03", importoMaxRealizzato: 8_500_000 },
        { codice: "OG3", importoMaxRealizzato: 12_000_000 },
      ],
    },
    certificazioni: ["ISO 9001", "ISO 14001", "ISO 45001"],
    importoRCGeneale: 5_000_000,
    winRate: 42,
    numeroProgetti: 28,
    reputazione: "OTTIMA",
    dataUltimoAggiornamento: new Date().toISOString(),
  },
  {
    id: "partner-demo-2",
    nome: "Impianti & Sicurezza Centro S.p.A.",
    settoriSpecializzazione: ["Impianti", "Certificazioni"],
    regioni: ["Lazio", "Toscana", "Umbria"],
    certificazioni: ["ISO 9001", "ISO 45001", "SOA OS30"],
    importoRCGeneale: 3_500_000,
    winRate: 35,
    numeroProgetti: 15,
    reputazione: "BUONA",
    dataUltimoAggiornamento: new Date().toISOString(),
  },
];

function gapProfileFromRequirement(requirement: string, gapText: string): {
  specializzazione: string[];
  caretteristiche: string[];
} {
  const r = requirement.toLowerCase();
  const g = gapText.toLowerCase();

  if (r.includes("soa") || g.includes("soa")) {
    return {
      specializzazione: ["Impresa specializzata nella categoria SOA richiesta"],
      caretteristiche: [
        "SOA con importo ≥150% base d'asta",
        "Track record positivo in gare analoghe",
      ],
    };
  }
  if (r.includes("certific") || r.includes("iso") || r.includes("durc")) {
    return {
      specializzazione: ["Impresa con certificazioni ambiente/qualità"],
      caretteristiche: ["ISO 9001/14001/45001", "Esperienza ≥3 anni nel settore"],
    };
  }
  if (r.includes("assicur") || r.includes("rc")) {
    return {
      specializzazione: ["Impresa con coperture assicurative ampie"],
      caretteristiche: ["RC ≥€5M", "Broker/partner assicurativo affidabile"],
    };
  }
  if (r.includes("capitale") || r.includes("economico")) {
    return {
      specializzazione: ["Impresa finanziariamente solida"],
      caretteristiche: ["Capitale/fatturato adeguato", "Rapporto debito/patrimonio <1"],
    };
  }
  if (r.includes("esperienza")) {
    return {
      specializzazione: ["Impresa con referenze simili"],
      caretteristiche: ["≥3 lavori analoghi", "Referenze verificabili"],
    };
  }
  return {
    specializzazione: ["Impresa complementare nel settore gara"],
    caretteristiche: ["Esperienza nella categoria", "Reputazione verificabile"],
  };
}

function rankPartnersForGap(
  partners: PartnerProfile[],
  requirement: string,
  requirements: QualificationRequirement[]
): PartnerProfile[] {
  return [...partners]
    .map((p) => ({ p, score: scorePartnerFitForRTI(p, requirements, requirement) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.p);
}

export function scorePartnerFitForRTI(
  partner: PartnerProfile,
  requirements: QualificationRequirement[],
  gapRequirement?: string
): number {
  let score = 50;

  if (partner.soa?.categorie.length) score += 20;
  if (partner.certificazioni.length > 3) score += 15;
  if (partner.reputazione === "OTTIMA") score += 15;
  else if (partner.reputazione === "BUONA") score += 8;
  if (partner.numeroProgetti && partner.numeroProgetti > 20) score += 10;
  if (partner.winRate && partner.winRate > 40) score += 10;

  if (gapRequirement) {
    const req = requirements.find(
      (r) =>
        r.titolo === gapRequirement ||
        r.id === gapRequirement ||
        gapRequirement.includes(r.titolo)
    );
    if (req?.categoria === "SOA" && partner.soa?.categorie.length) score += 10;
    if (req?.categoria === "CERTIFICAZIONE" && partner.certificazioni.length >= 2)
      score += 8;
    if (req?.categoria === "ASSICURAZIONE" && (partner.importoRCGeneale ?? 0) > 1_000_000)
      score += 8;
  }

  return Math.min(100, score);
}

export function generateRTIRecommendations(
  assessment: QualificationAssessment,
  partnerPool: PartnerProfile[] = SAMPLE_RTI_PARTNERS
): RTIRecommendation[] {
  if (!assessment.poteRTI || assessment.gapsCritici.length === 0) return [];

  const strategiaRTI =
    "RTI con capogruppo (vostra impresa) + partner specializzato sul gap. Il partner copre il requisito mancante; capogruppo coordina offerta ed esecuzione.";

  const vantaggiRTI = [
    "Accesso a gare altrimenti non partecipabili",
    "Condivisione del rischio con il partner",
    "Expertise specifica sul gap",
    "Possibili collaborazioni future",
  ];

  const rischiRTI = [
    "Margine diviso tra capogruppo e partner",
    "Complessità di coordinamento in cantiere",
    "Rischio reputazionale se il partner inadempiente",
    "Negoziazione ripartizione introiti (tipico 60/40–70/30)",
  ];

  return assessment.gapsCritici.map((gap) => {
    const profilo = gapProfileFromRequirement(gap.requirement, gap.gap);
    const partnerSuggeriti =
      partnerPool.length > 0
        ? rankPartnersForGap(partnerPool, gap.requirement, assessment.requirements)
        : undefined;

    return {
      requirementId: gap.requirement,
      requirementGap: gap.gap,
      partnerProfiloIdoneo: profilo,
      partnerSuggeriti,
      strategiaRTI,
      vantaggiRTI,
      rischiRTI,
      timeline_formazione: "2-3 settimane per formalizzare contratto RTI",
    };
  });
}

export function generateAccelerationStrategies(
  assessment: QualificationAssessment,
  urgenzaGiorni: number = 30
): TimelineAccelerationOption[] {
  const options: TimelineAccelerationOption[] = [];

  for (const gap of assessment.gapsCritici) {
    const r = gap.requirement.toLowerCase();

    if (r.includes("soa")) {
      options.push({
        gap: gap.requirement,
        strategia:
          "CCIAA: ampliamento SOA fast-track (5-7 giorni se documentazione completa)",
        timeline: "5-7 giorni",
        costo_stimato: 500,
        rischi: [
          "CCIAA può rifiutare fast-track",
          "Integrazioni documentali ritardano",
        ],
        feasibility: "MEDIA",
        note: "Contattare CCIAA il lunedì mattina con dossier pronto.",
      });
      options.push({
        gap: gap.requirement,
        strategia:
          "RTI con impresa SOA-idonea (solo formazione RTI, nessun ampliamento proprio)",
        timeline: "7-10 giorni",
        costo_stimato: 0,
        rischi: ["Margine condiviso", "Partner può rifiutare RTI last-minute"],
        feasibility: "ALTA",
        note: "Soluzione più rapida: avviare contatti partner oggi.",
      });
    }

    if (r.includes("certific") || r.includes("iso") || r.includes("durc")) {
      options.push({
        gap: gap.requirement,
        strategia: "Audit express certificazione (10-14 giorni con auditor noto)",
        timeline: "10-14 giorni",
        costo_stimato: 3000,
        rischi: ["Costo audit elevato", "Impegno interno per preparazione"],
        feasibility: "MEDIA",
        note: "Preparare documentazione in parallelo all'audit.",
      });
      options.push({
        gap: gap.requirement,
        strategia:
          "Attestati equivalenti / dichiarazioni sostitutive (solo se ammessi dal bando)",
        timeline: "5-7 giorni",
        costo_stimato: 0,
        rischi: ["Bando può non accettare equivalenti", "Rischio post-aggiudicazione"],
        feasibility: "BASSA",
        note: "Verificare testo bando prima di questa via.",
      });
    }

    if (r.includes("rc") || r.includes("assicur")) {
      options.push({
        gap: gap.requirement,
        strategia: "Broker: ampliamento polizza RC urgente",
        timeline: "2-3 giorni",
        costo_stimato: Math.max(200, Math.round(500 * (urgenzaGiorni / 365))),
        rischi: ["Premium maggiorato per urgenza", "Disponibilità broker"],
        feasibility: "ALTA",
        note: "Contattare il broker oggi.",
      });
    }

    if (r.includes("capitale") || r.includes("esperienza")) {
      options.push({
        gap: gap.requirement,
        strategia: "RTI con impresa che integra capacità economica o referenze",
        timeline: "7-14 giorni",
        costo_stimato: 0,
        rischi: ["Due diligence partner", "Tempo negoziazione RTI"],
        feasibility: assessment.poteRTI ? "ALTA" : "BASSA",
        note: "Preferibile se il bando consente avvalimento/RTI sui requisiti.",
      });
    }
  }

  return options;
}

function daysUntilTenderDeadline(tender: TenderDocument): number {
  if (!tender.deadline?.trim()) return 30;
  const d = new Date(tender.deadline);
  if (Number.isNaN(d.getTime())) return 30;
  return Math.max(7, Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function createQualificationProgressTracker(
  assessment: QualificationAssessment
): QualificationProgressTracker {
  const progressItems: QualificationProgressItem[] = assessment.gapsCritici.map((gap) => ({
    gapId: gap.requirement,
    titolo: gap.requirement,
    status: "NON_INIZIATO",
    dataScadenza: gap.timeline_colmamento,
    percentualeProgresso: 0,
    tasksCompleted: [],
    riskiResidui: gap.effort === "ALTO" ? ["Gap ad effort alto — priorità critica"] : [],
  }));

  const daysLeft = daysUntilTenderDeadline(assessment.gara);
  const garaDeadline = new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000);

  const milestonesRimanenti = [
    {
      milestone: "Identificare e contattare partner RTI (se necessario)",
      dataTarget: new Date(garaDeadline.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString(),
      criticita: "ALTA" as const,
      status: (assessment.poteRTI && assessment.gapsCritici.length > 0
        ? "ON_TRACK"
        : "ON_TRACK") as MilestoneStatus,
    },
    {
      milestone: "Completare ampliamenti SOA / certificazioni",
      dataTarget: new Date(garaDeadline.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      criticita: "ALTA" as const,
      status: "ON_TRACK" as MilestoneStatus,
    },
    {
      milestone: "Verifica compliance finale vs bando",
      dataTarget: new Date(garaDeadline.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      criticita: "MEDIA" as const,
      status: "ON_TRACK" as MilestoneStatus,
    },
  ];

  const readinessStatus: QualificationReadinessStatus =
    assessment.qualificazioneVerdetto === "QUALIFICATO"
      ? "PRONTO"
      : assessment.gapsCritici.length === 0
        ? "PRONTO"
        : "IN_PROGRESSO";

  return {
    assessmentId: assessment.id,
    gara: assessment.gara,
    dataCreazione: new Date().toISOString(),
    dataUltimoAggiornamento: new Date().toISOString(),
    progressItems,
    progressComplessivo: assessment.qualificazioneVerdetto === "QUALIFICATO" ? 100 : 0,
    gapsCriticheRemote: assessment.gapsCritici.length,
    milestonesRimanenti,
    readinessStatus:
      assessment.qualificazioneVerdetto === "ESCLUSORIO" ? "NOT_READY" : readinessStatus,
  };
}

export function updateProgressItem(
  tracker: QualificationProgressTracker,
  gapId: string,
  newStatus: QualificationProgressStatus,
  percentuale: number,
  taskCompletata?: string
): QualificationProgressTracker {
  const progressItems = tracker.progressItems.map((item) => {
    if (item.gapId !== gapId) return item;
    const tasksCompleted = [...(item.tasksCompleted ?? [])];
    if (taskCompletata) {
      tasksCompleted.push({
        task: taskCompletata,
        dataComplezione: new Date().toISOString(),
      });
    }
    return {
      ...item,
      status: newStatus,
      percentualeProgresso: Math.min(100, Math.max(0, percentuale)),
      tasksCompleted,
      dataInizio: item.dataInizio ?? (newStatus !== "NON_INIZIATO" ? new Date().toISOString() : undefined),
    };
  });

  const totalPct =
    progressItems.length > 0
      ? progressItems.reduce((sum, p) => sum + p.percentualeProgresso, 0) / progressItems.length
      : 0;
  const progressComplessivo = Math.round(totalPct);
  const gapsCriticheRemote = progressItems.filter((p) => p.percentualeProgresso < 100).length;

  let readinessStatus: QualificationReadinessStatus = "IN_PROGRESSO";
  if (progressComplessivo >= 100) readinessStatus = "PRONTO";
  else if (progressComplessivo < 25) readinessStatus = "NOT_READY";

  return {
    ...tracker,
    progressItems,
    progressComplessivo,
    gapsCriticheRemote,
    readinessStatus,
    dataUltimoAggiornamento: new Date().toISOString(),
  };
}

export function daysUntilTenderDeadlineForQualification(tender: TenderDocument): number {
  return daysUntilTenderDeadline(tender);
}
  CompanyProfile,
  TenderRequirement,
  QualificationRequirement,
  CompanyQualificationStatus,
  QualificationAssessment,
  QualificationReadinessPath,
  QualificationRequirementTipo,
  QualificationStatusValore,
} from "../types";

export function mapTenderRequirementToQualification(
  req: TenderRequirement,
  idx: number
): QualificationRequirement {
  const tipoMap: Record<TenderRequirement["category"], QualificationRequirementTipo> = {
    SOA: "SOA",
    ISO: "ISO",
    Fatturato: "fatturato",
    Referenze: "referenze",
    Altro: "altro",
  };

  return {
    id: `qr-${idx}`,
    tipo: tipoMap[req.category] ?? "altro",
    descrizione: req.description,
    soglia: req.details,
    obbligatorio: true,
    articoloRiferimento: req.category === "SOA" ? "Art. 100 D.Lgs. 36/2023" : undefined,
  };
}

export function matchRequirementToCompany(
  req: QualificationRequirement,
  company?: CompanyProfile
): CompanyQualificationStatus {
  if (!company) {
    return { requirementId: req.id, status: "NON_VERIFICABILE" };
  }

  let status: QualificationStatusValore = "NON_VERIFICABILE";

  if (req.tipo === "SOA") {
    const hasSOA = company.soaCategories && company.soaCategories.length > 0;
    status = hasSOA ? "SODDISFATTO" : "MANCANTE";
  } else if (req.tipo === "fatturato") {
    const revenue = company.lastYearRevenue ?? 0;
    status = revenue > 0 ? "SODDISFATTO" : "NON_VERIFICABILE";
  } else if (req.tipo === "ISO") {
    status = "NON_VERIFICABILE";
  } else {
    status = "NON_VERIFICABILE";
  }

  return {
    requirementId: req.id,
    status,
    documentoDisponibile: status === "SODDISFATTO",
  };
}

export function assessQualification(
  gara: TenderDocument,
  requirements: QualificationRequirement[],
  company?: CompanyProfile
): QualificationAssessment {
  const matchingStatus = requirements.map((r) => matchRequirementToCompany(r, company));

  const soddisfatti = matchingStatus.filter((s) => s.status === "SODDISFATTO").length;
  const compliancePercent =
    requirements.length > 0 ? Math.round((soddisfatti / requirements.length) * 100) : 0;

  const gapsCritici = matchingStatus
    .filter((s) => s.status === "MANCANTE")
    .map((s) => {
      const req = requirements.find((r) => r.id === s.requirementId);
      return req ? `${req.descrizione}: MANCANTE` : `Requisito ${s.requirementId}: MANCANTE`;
    });

  const gapsColmabili = matchingStatus
    .filter((s) => s.status === "PARZIALE" || s.status === "NON_VERIFICABILE")
    .map((s) => {
      const req = requirements.find((r) => r.id === s.requirementId);
      return req ? `${req.descrizione}: da verificare` : `Requisito ${s.requirementId}`;
    });

  const raccomandazioneFinale =
    gapsCritici.length === 0
      ? "PARTECIPA"
      : gapsCritici.length <= 1
      ? "PARTECIPA_CON_RTI"
      : gapsCritici.filter((g) => g.includes("SOA")).length > 0
      ? "AVVALIMENTO"
      : "NON_PARTECIPARE";

  return {
    gara,
    requirements,
    matchingStatus,
    compliancePercent,
    requirementsTotal: requirements.length,
    gapsCritici,
    gapsColmabili,
    raccomandazioneFinale,
    generatedAt: new Date().toISOString(),
  };
}

export function generateQualificationPath(
  assessment: QualificationAssessment,
  requirements: QualificationRequirement[]
): QualificationReadinessPath[] {
  const paths: QualificationReadinessPath[] = [];
  let stepIdx = 0;

  for (const gap of assessment.gapsCritici) {
    const reqId = assessment.matchingStatus.find(
      (s) => s.status === "MANCANTE"
    )?.requirementId;
    const req = reqId ? requirements.find((r) => r.id === reqId) : undefined;

    paths.push({
      stepId: `step-${stepIdx++}`,
      azione: req?.tipo === "SOA"
        ? `Attivare avvalimento SOA per ${req.descrizione}`
        : `Colmare gap: ${gap}`,
      priorita: "alta",
      tempoStimato: req?.tipo === "SOA" ? "2-4 settimane" : "1-2 settimane",
      gapColmato: gap,
    });
  }

  for (const gap of assessment.gapsColmabili) {
    paths.push({
      stepId: `step-${stepIdx++}`,
      azione: `Verificare e documentare: ${gap}`,
      priorita: "media",
      tempoStimato: "3-7 giorni",
      gapColmato: gap,
    });
  }

  return paths;
}

export function generateRTIRecommendations(assessment: QualificationAssessment): string[] {
  const seen = new Set<string>();
  const recs: string[] = [];

  for (const gap of assessment.gapsCritici) {
    const key = gap.split(":")[0].trim();
    if (seen.has(key)) continue;
    seen.add(key);
    recs.push(`Ricerca partner RTI per colmare: ${key}`);
  }

  if (assessment.raccomandazioneFinale === "PARTECIPA_CON_RTI") {
    recs.push("Strutturare RTI con impresa mandante che possiede i requisiti mancanti");
    recs.push("Definire quote partecipazione proporzionali ai lavori eseguiti");
  }

  return recs;
}

export const QUALIFICATION_VERDICT_CLASS: Record<QualificationAssessment["raccomandazioneFinale"], string> = {
  PARTECIPA: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  PARTECIPA_CON_RTI: "text-blue-400 border-blue-800 bg-blue-950/40",
  AVVALIMENTO: "text-amber-400 border-amber-800 bg-amber-950/40",
  NON_PARTECIPARE: "text-red-400 border-red-800 bg-red-950/40",
};
