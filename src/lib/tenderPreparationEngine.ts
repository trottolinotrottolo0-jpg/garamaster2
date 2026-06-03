import type { ProfiloImpresaContext } from "../types/database";
import type { TenderDocument } from "../types";
import type {
  TenderAutocompilazione,
  TenderBusta,
  TenderChecklistItemRow,
  TenderChecklistStato,
  TenderDocumentRow,
  TenderDocumentStato,
  TenderPracticeStato,
} from "../types/tenderPreparation";

export const PRACTICE_STATO_LABELS: Record<TenderPracticeStato, string> = {
  DA_ANALIZZARE: "Da analizzare",
  IN_LAVORAZIONE: "In lavorazione",
  DOCUMENTI_MANCANTI: "Documenti mancanti",
  PRONTA: "Pronta per invio",
  INVIATA: "Inviata",
};

export const BUSTA_LABELS: Record<TenderBusta, string> = {
  amministrativa: "Busta amministrativa",
  tecnica: "Busta tecnica",
  economica: "Busta economica",
};

export const WIZARD_STEPS: { id: import("../types/tenderPreparation").TenderPreparationStep; label: string }[] = [
  { id: "panoramica", label: "Panoramica" },
  { id: "amministrativa", label: "Busta amministrativa" },
  { id: "tecnica", label: "Busta tecnica" },
  { id: "economica", label: "Busta economica" },
  { id: "revisione", label: "Revisione finale" },
];

export function buildAutocompilazioneFromProfilo(
  profilo: ProfiloImpresaContext | null
): TenderAutocompilazione {
  if (!profilo) return {};
  return {
    ragioneSociale: profilo.ragioneSociale,
    partitaIva: profilo.partitaIva,
    soa: profilo.soa,
    certificazioni: profilo.certificazioni,
    email: undefined,
    sedeLegale: profilo.regioni?.length ? `Regioni operative: ${profilo.regioni.join(", ")}` : undefined,
  };
}

type SeedDoc = {
  categoria: TenderBusta | "generale";
  nome: string;
  obbligatorio?: boolean;
  note?: string;
  ordine: number;
};

type SeedCheck = {
  busta: TenderBusta;
  titolo: string;
  obbligatorio?: boolean;
  note?: string;
  ordine: number;
};

/** Documenti e checklist di default per una gara. */
export function buildDefaultPreparationSeeds(
  tender: TenderDocument,
  profilo: ProfiloImpresaContext | null
): { documents: SeedDoc[]; checklist: SeedCheck[] } {
  const hasPenali = (tender.penalties?.length ?? 0) > 0;
  const hasRequisiti = (tender.requirements?.length ?? 0) > 0;
  const soaNote = profilo?.soa ? `SOA impresa: ${profilo.soa}` : undefined;

  const documents: SeedDoc[] = [
    { categoria: "amministrativa", nome: "DGUE / Documento di gara unificato europeo", ordine: 10 },
    { categoria: "amministrativa", nome: "DURC in corso di validità", ordine: 20 },
    { categoria: "amministrativa", nome: "Attestazione SOA (categorie richieste)", ordine: 30, note: soaNote },
    { categoria: "amministrativa", nome: "Garanzia provvisoria", ordine: 40 },
    {
      categoria: "amministrativa",
      nome: "Dichiarazione sostitutiva antimafia",
      ordine: 50,
    },
    {
      categoria: "amministrativa",
      nome: "Dichiarazione requisiti di ordine speciale",
      ordine: 60,
    },
    { categoria: "tecnica", nome: "Relazione tecnica / Offerta tecnica", ordine: 70 },
    { categoria: "tecnica", nome: "Cronoprogramma lavori", ordine: 80 },
    { categoria: "tecnica", nome: "Elenco prezzi / Computo (se richiesto)", ordine: 90 },
    { categoria: "economica", nome: "Offerta economica / Modello di offerta", ordine: 100 },
    { categoria: "economica", nome: "RIBA / Garanzia definitiva (se prevista)", ordine: 110, obbligatorio: false },
  ];

  if (hasRequisiti) {
    documents.push({
      categoria: "generale",
      nome: "Documentazione requisiti di partecipazione",
      ordine: 15,
      note: `${tender.requirements.length} requisiti da verificare`,
    });
  }

  const checklist: SeedCheck[] = [
    { busta: "amministrativa", titolo: "Verifica completezza busta amministrativa", ordine: 10 },
    { busta: "amministrativa", titolo: "Firma digitale legale rappresentante", ordine: 20 },
    { busta: "amministrativa", titolo: "Controllo scadenze certificazioni", ordine: 30 },
    { busta: "tecnica", titolo: "Allineamento relazione tecnica al capitolato", ordine: 40 },
    { busta: "tecnica", titolo: "Verifica personale chiave / idoneità", ordine: 50 },
    { busta: "economica", titolo: "Controllo ribasso e offerta economica", ordine: 60 },
    { busta: "economica", titolo: "Verifica congruità prezzi", ordine: 70 },
  ];

  if (hasPenali) {
    checklist.push({
      busta: "tecnica",
      titolo: "Analisi penali e clausole vessatorie",
      ordine: 35,
      note: `${tender.penalties.length} penali nel bando`,
    });
  }

  return { documents, checklist };
}

export function computePracticeProgress(
  documents: TenderDocumentRow[],
  checklist: TenderChecklistItemRow[]
): {
  percent: number;
  documentsDone: number;
  documentsTotal: number;
  checklistDone: number;
  checklistTotal: number;
} {
  const docsRequired = documents.filter((d) => d.obbligatorio);
  const docsDone = docsRequired.filter((d) => d.stato === "CARICATO").length;
  const docsTotal = docsRequired.length;

  const checkRequired = checklist.filter((c) => c.obbligatorio && c.stato !== "NON_APPLICABILE");
  const checkDone = checkRequired.filter((c) => c.stato === "FATTO").length;
  const checkTotal = checkRequired.length;

  const docPct = docsTotal > 0 ? (docsDone / docsTotal) * 50 : 25;
  const checkPct = checkTotal > 0 ? (checkDone / checkTotal) * 50 : 25;
  const percent = Math.round(docPct + checkPct);

  return {
    percent: Math.min(100, percent),
    documentsDone: docsDone,
    documentsTotal: docsTotal,
    checklistDone: checkDone,
    checklistTotal: checkTotal,
  };
}

/** Calcola stato pratica da documenti e checklist. */
export function derivePracticeStato(
  current: TenderPracticeStato,
  documents: TenderDocumentRow[],
  checklist: TenderChecklistItemRow[],
  manualInviata = false
): TenderPracticeStato {
  if (manualInviata || current === "INVIATA") return "INVIATA";

  const progress = computePracticeProgress(documents, checklist);
  const hasInCorso = checklist.some((c) => c.stato === "IN_CORSO");
  const missingDoc = documents.some((d) => d.obbligatorio && d.stato === "MANCANTE");
  const reviewDoc = documents.some((d) => d.stato === "DA_REVISIONARE");
  const pendingCheck = checklist.some(
    (c) => c.obbligatorio && c.stato !== "FATTO" && c.stato !== "NON_APPLICABILE"
  );

  if (progress.percent >= 100 && !missingDoc && !reviewDoc && !pendingCheck) {
    return "PRONTA";
  }

  if (missingDoc || reviewDoc || pendingCheck) {
    if (current === "DA_ANALIZZARE" && !hasInCorso && progress.percent === 0) {
      return "DA_ANALIZZARE";
    }
    return "DOCUMENTI_MANCANTI";
  }

  if (hasInCorso || progress.percent > 0) {
    return "IN_LAVORAZIONE";
  }

  return current === "DA_ANALIZZARE" ? "DA_ANALIZZARE" : "IN_LAVORAZIONE";
}

export function practiceStatoBadgeClasses(stato: TenderPracticeStato): string {
  switch (stato) {
    case "DA_ANALIZZARE":
      return "text-slate-300 bg-slate-900/80 border-slate-700";
    case "IN_LAVORAZIONE":
      return "text-sky-300 bg-sky-950/50 border-sky-800/50";
    case "DOCUMENTI_MANCANTI":
      return "text-amber-300 bg-amber-950/50 border-amber-800/50";
    case "PRONTA":
      return "text-emerald-300 bg-emerald-950/50 border-emerald-800/50";
    case "INVIATA":
      return "text-violet-300 bg-violet-950/50 border-violet-800/50";
    default:
      return "text-slate-400 bg-neutral-900 border-neutral-800";
  }
}

export function documentStatoLabel(stato: TenderDocumentStato): string {
  switch (stato) {
    case "CARICATO":
      return "Caricato";
    case "DA_REVISIONARE":
      return "Da revisionare";
    default:
      return "Mancante";
  }
}

export function documentStatoClasses(stato: TenderDocumentStato): string {
  switch (stato) {
    case "CARICATO":
      return "text-emerald-400 border-emerald-900/50 bg-emerald-950/30";
    case "DA_REVISIONARE":
      return "text-amber-400 border-amber-900/50 bg-amber-950/30";
    default:
      return "text-red-400 border-red-900/50 bg-red-950/30";
  }
}

export function checklistStatoLabel(stato: TenderChecklistStato): string {
  switch (stato) {
    case "FATTO":
      return "Fatto";
    case "IN_CORSO":
      return "In corso";
    case "NON_APPLICABILE":
      return "N/A";
    default:
      return "Da fare";
  }
}
