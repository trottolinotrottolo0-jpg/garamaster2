import type {
  TenderDocument,
  ComplianceChecklistItem,
  ComplianceChecklistCategoria,
  ComplianceChecklistStato,
  PreSubmissionComplianceAudit,
  ComplianceCategory,
  ComplianceAuditIssue,
  PreSubmissionComplianceRisk,
  CompanyProfile,
  ComplianceRequirement,
} from "../types";
import { parseTenderValue } from "./bidCalculations";

export function requirementsToChecklistItems(
  requirements: ComplianceRequirement[]
): ComplianceChecklistItem[] {
  return requirements.map((req, index) => {
    const categoria = mapRequirementCategoria(req.categoria, req.titolo);
    const item: ComplianceChecklistItem = {
      id: `check-bando-${req.id || index + 1}`,
      categoria,
      titolo: req.titolo,
      descrizione: req.descrizione,
      obbligatorio: req.obbligatorio,
      stato: "NON_INIZIATO",
      scadenza: req.deadline,
      note: req.note || `Estratto da bando (confidenza ${req.confidenza}%)`,
    };
    return applyScadenzaDays(item);
  });
}

function mapRequirementCategoria(
  raw: string,
  titolo: string
): ComplianceChecklistCategoria {
  const t = `${raw} ${titolo}`.toUpperCase();
  if (t.includes("ASSICUR")) return "ASSICURATIVA";
  if (t.includes("CERTIF") || t.includes("ISO")) return "CERTIFICAZIONE";
  if (t.includes("ORGAN") || t.includes("CV") || t.includes("TEAM")) return "ORGANIZZATIVA";
  if (
    t.includes("TECNIC") ||
    t.includes("OFFERTA") ||
    t.includes("CME") ||
    t.includes("CRONO")
  ) {
    return "TECNICA";
  }
  return "DOCUMENTALE";
}

function applyScadenzaDays(item: ComplianceChecklistItem): ComplianceChecklistItem {
  if (!item.scadenza) return item;
  const scadenza = new Date(item.scadenza);
  if (Number.isNaN(scadenza.getTime())) return item;
  const giorniRimanenti = Math.round(
    (scadenza.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return { ...item, giorniRimanenti };
}

export function createPreSubmissionAudit(
  tender: TenderDocument,
  companyProfile?: CompanyProfile | null,
  parsedRequirements?: ComplianceRequirement[]
): PreSubmissionComplianceAudit {
  let checklistItems = estimateComplianceChecklist(tender, companyProfile);

  if (parsedRequirements && parsedRequirements.length > 0) {
    const fromBando = requirementsToChecklistItems(parsedRequirements);
    checklistItems = mergeChecklistItems(checklistItems, fromBando);
  }

  checklistItems = enrichChecklistFromProfile(checklistItems, tender, companyProfile);
  checklistItems = checklistItems.map(applyScadenzaDays);

  return buildAuditFromChecklist(tender, checklistItems);
}

function mergeChecklistItems(
  base: ComplianceChecklistItem[],
  extra: ComplianceChecklistItem[]
): ComplianceChecklistItem[] {
  const merged = [...base];
  for (const item of extra) {
    const exists = merged.some(
      (b) => b.titolo.toLowerCase().slice(0, 30) === item.titolo.toLowerCase().slice(0, 30)
    );
    if (!exists) merged.push(item);
  }
  return merged;
}

function buildAuditFromChecklist(
  tender: TenderDocument,
  checklistItems: ComplianceChecklistItem[]
): PreSubmissionComplianceAudit {
  const total = checklistItems.length || 1;
  const completati = checklistItems.filter((i) => i.stato === "COMPLETATO").length;
  const completamentoPercent = Math.round((completati / total) * 100);
  const categorieBreakdown = buildCategoryBreakdown(checklistItems);
  const itemsObbligatori = checklistItems.filter((i) => i.obbligatorio).length;
  const itemsObbligatoriBlocchi = checklistItems.filter(
    (i) => i.obbligatorio && i.stato !== "COMPLETATO" && i.stato !== "NON_APPLICABILE"
  ).length;

  const issuesFound = identifyComplianceIssues(checklistItems, tender);
  const blockingIssues = issuesFound
    .filter((i) => i.severity === "BLOCKING")
    .map((i) => i.messaggio);
  const warningIssues = issuesFound
    .filter((i) => i.severity === "CRITICAL" || i.severity === "WARNING")
    .map((i) => i.messaggio);

  let complianceRisk: PreSubmissionComplianceRisk = "VERDE";
  if (blockingIssues.length > 0) complianceRisk = "BLOCCANTE";
  else if (itemsObbligatoriBlocchi > 0) complianceRisk = "ROSSO";
  else if (completamentoPercent < 80 || warningIssues.length > 3) complianceRisk = "GIALLO";

  const readyForSubmission = blockingIssues.length === 0 && itemsObbligatoriBlocchi === 0;

  return {
    id: `audit-${Date.now()}`,
    gara: tender,
    dataCreazione: new Date().toISOString(),
    dataUltimaModifica: new Date().toISOString(),
    checklistItems,
    categorieBreakdown,
    completamentoPercent,
    itemsObbligatori,
    itemsObbligatoriBlocchi,
    complianceRisk,
    issuesFound,
    readyForSubmission,
    blockingIssues,
    warningIssues,
  };
}

function estimateComplianceChecklist(
  tender: TenderDocument,
  _companyProfile?: CompanyProfile | null
): ComplianceChecklistItem[] {
  const importo = parseTenderValue(tender.value) || 0;
  const durcScadenza = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const items: ComplianceChecklistItem[] = [
    {
      id: "check-001",
      categoria: "DOCUMENTALE",
      titolo: "SOA (Dichiarazione di Idonea Capacità Tecnica)",
      descrizione:
        "Dichiarazione SOA con categorie e importi idonei per la gara",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: "Deve coprire categoria gara + importo. Se manca → esclusione automatica",
    },
    {
      id: "check-002",
      categoria: "DOCUMENTALE",
      titolo: "Certificazione DURC",
      descrizione: "DURC valido al momento invio offerta",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      scadenza: durcScadenza,
      note: "Controllare data scadenza PRIMA di inviare",
    },
    {
      id: "check-003",
      categoria: "DOCUMENTALE",
      titolo: "CIG (Codice Identificativo Gara)",
      descrizione: `CIG corretto: ${tender.cig || "verificare da bando"}`,
      obbligatorio: true,
      stato: tender.cig ? "IN_CORSO" : "NON_INIZIATO",
      note: "CIG errato = offerta respinta",
    },
    {
      id: "check-004",
      categoria: "ASSICURATIVA",
      titolo: "Polizza RC Civile Generale",
      descrizione: "Polizza RC adeguata all'importo gara, valida in esecuzione",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: `Importo minimo RC indicativo: ${importo > 0 ? `€${Math.round(importo * 0.1).toLocaleString("it-IT")}` : "10% importo"}`,
    },
    {
      id: "check-005",
      categoria: "ASSICURATIVA",
      titolo: "Copertura Cauzione / Performance Bond",
      descrizione: "Garanzia cauzione provvisoria o definitiva",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: "Solitamente 5–10% importo gara",
    },
    {
      id: "check-006",
      categoria: "CERTIFICAZIONE",
      titolo: "Certificazioni ISO (9001, 14001, 45001)",
      descrizione: "Se richieste nel bando",
      obbligatorio: false,
      stato: "NON_APPLICABILE",
      note: "Verificare disciplinare",
    },
    {
      id: "check-007",
      categoria: "TECNICA",
      titolo: "Offerta Tecnica completa e coerente",
      descrizione:
        "Sezione tecnica risponde a tutti i criteri e reverse-mapping award criteria",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: "Usare Award Criteria Analyzer",
    },
    {
      id: "check-008",
      categoria: "TECNICA",
      titolo: "Computo Metrico Estimativo (CME)",
      descrizione: "CME dettagliato e coerente con offerta tecnica",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: "Verificare UM e prezzi unitari",
    },
    {
      id: "check-009",
      categoria: "TECNICA",
      titolo: "Cronoprogramma esecuzione",
      descrizione: "Timeline realistica della gara",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: "Validare con Delay & Penalty Engine",
    },
    {
      id: "check-010",
      categoria: "ORGANIZZATIVA",
      titolo: "Curriculum Responsabile Tecnico",
      descrizione: "CV RT con esperienza idonea",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: "Esperienze simili alla gara",
    },
    {
      id: "check-011",
      categoria: "ORGANIZZATIVA",
      titolo: "Organigramma cantiere e team",
      descrizione: "Team, ruoli e responsabilità",
      obbligatorio: true,
      stato: "NON_INIZIATO",
      note: "Requisiti minimi da bando",
    },
    {
      id: "check-012",
      categoria: "DOCUMENTALE",
      titolo: "Dichiarazione Antimafia / SOF",
      descrizione: "SOF o dichiarazione sostitutiva antimafia",
      obbligatorio: importo >= 40_000 || importo === 0,
      stato: "NON_INIZIATO",
      note: "Obbligatorio per gare >40k€",
    },
    {
      id: "check-013",
      categoria: "CERTIFICAZIONE",
      titolo: "CAM Compliance",
      descrizione: "Conformità Criteri Ambientali Minimi",
      obbligatorio: false,
      stato: importo >= 140_000 ? "NON_INIZIATO" : "NON_APPLICABILE",
      note: "Se gara >140k€ e CAM in disciplinare",
    },
    {
      id: "check-014",
      categoria: "DOCUMENTALE",
      titolo: "Visura Camera di Commercio",
      descrizione: "Visura CCIAA recente se richiesta",
      obbligatorio: false,
      stato: "NON_APPLICABILE",
      note: "Alcuni bandi richiedono visura <3 mesi",
    },
    {
      id: "check-015",
      categoria: "DOCUMENTALE",
      titolo: "Bilanci ultimi 3 anni",
      descrizione: "Capacità economico-finanziaria",
      obbligatorio: false,
      stato: "NON_APPLICABILE",
      note: "Se richiesta capacità economica",
    },
  ];

  return items;
}

function enrichChecklistFromProfile(
  items: ComplianceChecklistItem[],
  tender: TenderDocument,
  profile?: CompanyProfile | null
): ComplianceChecklistItem[] {
  if (!profile) return items;

  return items.map((item) => {
    const next = { ...item };
    const titleLower = item.titolo.toLowerCase();

    if (titleLower.includes("soa") && profile.soaAttuale?.categorie?.length) {
      next.stato = "COMPLETATO";
      next.evidenza = {
        fileName: profile.soaAttuale.fileName || "SOA attestazione",
        dataUpload: profile.soaAttuale.dataImportazione,
        versione: 1,
        note: `${profile.soaAttuale.categorie.length} categorie in profilo`,
      };
    }

    if (titleLower.includes("cig") && tender.cig) {
      next.stato = "IN_CORSO";
    }

    return next;
  });
}

function buildCategoryBreakdown(items: ComplianceChecklistItem[]): ComplianceCategory[] {
  const categorie = new Map<string, ComplianceChecklistItem[]>();

  for (const item of items) {
    const list = categorie.get(item.categoria) ?? [];
    list.push(item);
    categorie.set(item.categoria, list);
  }

  const breakdown: ComplianceCategory[] = [];
  for (const [nome, itemsCat] of categorie) {
    const completati = itemsCat.filter((i) => i.stato === "COMPLETATO").length;
    const itemsCritici = itemsCat.filter(
      (i) => i.giorniRimanenti != null && i.giorniRimanenti < 14 && i.giorniRimanenti >= 0
    );
    breakdown.push({
      nome,
      itemsTotal: itemsCat.length,
      itemsCompletati: completati,
      progressoPercent:
        itemsCat.length > 0 ? Math.round((completati / itemsCat.length) * 100) : 0,
      itemsCritici,
    });
  }

  return breakdown;
}

function identifyComplianceIssues(
  items: ComplianceChecklistItem[],
  _tender: TenderDocument
): ComplianceAuditIssue[] {
  const issues: ComplianceAuditIssue[] = [];

  for (const item of items.filter(
    (i) => i.obbligatorio && i.stato !== "COMPLETATO" && i.stato !== "NON_APPLICABILE"
  )) {
    issues.push({
      severity: "BLOCKING",
      categoria: item.categoria,
      messaggio: `❌ BLOCCANTE: ${item.titolo} non completato. Offerta a rischio esclusione.`,
      azione: `Completare: ${item.descrizione}`,
      deadline: item.scadenza,
    });
  }

  for (const item of items.filter(
    (i) => i.giorniRimanenti != null && i.giorniRimanenti < 7 && i.giorniRimanenti >= 0
  )) {
    issues.push({
      severity: "CRITICAL",
      categoria: item.categoria,
      messaggio: `⚠️ CRITICO: ${item.titolo} scade tra ${item.giorniRimanenti} giorni`,
      azione: `Rinnovare subito: ${item.descrizione}`,
      deadline: item.scadenza,
    });
  }

  for (const item of items.filter(
    (i) => i.giorniRimanenti != null && i.giorniRimanenti < 30 && i.giorniRimanenti >= 7
  )) {
    issues.push({
      severity: "WARNING",
      categoria: item.categoria,
      messaggio: `⚠️ ATTENZIONE: ${item.titolo} scade tra ${item.giorniRimanenti} giorni`,
      azione: `Programmare rinnovo: ${item.descrizione}`,
      deadline: item.scadenza,
    });
  }

  const completati = items.filter((i) => i.stato === "COMPLETATO").length;
  if (items.length > 0 && completati / items.length < 0.8) {
    issues.push({
      severity: "INFO",
      categoria: "GENERALE",
      messaggio: `ℹ️ Completion audit ${Math.round((completati / items.length) * 100)}% — revisione consigliata`,
      azione: "Completare gli item in corso",
    });
  }

  return issues;
}

export function updateComplianceItem(
  audit: PreSubmissionComplianceAudit,
  itemId: string,
  nuovoStato: ComplianceChecklistStato,
  evidenza?: ComplianceChecklistItem["evidenza"]
): PreSubmissionComplianceAudit {
  const checklistItems = audit.checklistItems.map((item) => {
    if (item.id !== itemId) return item;
    const updated: ComplianceChecklistItem = {
      ...item,
      stato: nuovoStato,
      evidenza: evidenza ?? item.evidenza,
    };
    return applyScadenzaDays(updated);
  });

  const rebuilt = buildAuditFromChecklist(audit.gara, checklistItems);
  return {
    ...rebuilt,
    id: audit.id,
    dataCreazione: audit.dataCreazione,
    insightsDeepSeek: audit.insightsDeepSeek,
  };
}

export function generatePreSubmissionSummary(audit: PreSubmissionComplianceAudit): string {
  if (audit.complianceRisk === "BLOCCANTE") {
    return `❌ NON INVIARE: ${audit.blockingIssues.length} blocchi critici. Correggere prima dell'invio.`;
  }
  if (audit.complianceRisk === "ROSSO") {
    return `🔴 STOP: ${audit.itemsObbligatoriBlocchi} item obbligatori mancanti. Completare prima dell'invio.`;
  }
  if (audit.complianceRisk === "GIALLO") {
    return `🟡 CAUTELA: completion ${audit.completamentoPercent}%. ${audit.warningIssues.length} avvisi — completare item in corso prima dell'invio.`;
  }
  return `✅ PRONTO PER INVIO: audit superato (${audit.completamentoPercent}% completion).`;
}

export interface DocumentVersion {
  id: string;
  checksum: string;
  fileName: string;
  fileSize: number;
  dataUpload: string;
  versione: number;
  cambiaDescrizione?: string;
}

export interface DocumentVersionControl {
  itemId: string;
  titolo: string;
  versioni: DocumentVersion[];
  versioneAttuale: number;
  ultimaModifica: string;
  checksumAttuale: string;
  isDuplicate: boolean;
  duplicateOf?: string;
}

export interface ManageDocumentVersionInput {
  fileName: string;
  fileSize: number;
  checksum: string;
  cambiaDescrizione?: string;
}

export function manageDocumentVersion(
  audit: PreSubmissionComplianceAudit,
  itemId: string,
  newDoc: ManageDocumentVersionInput
): {
  audit: PreSubmissionComplianceAudit;
  isDuplicate: boolean;
  duplicateMsg?: string;
  versioneNuova: number;
} {
  const existingItem = audit.checklistItems.find((i) => i.id === itemId);
  if (!existingItem) {
    return { audit, isDuplicate: false, versioneNuova: 0 };
  }

  const checksumDup = audit.checklistItems.find(
    (i) =>
      i.id !== itemId &&
      i.evidenza?.checksum &&
      i.evidenza.checksum === newDoc.checksum
  );
  if (checksumDup) {
    return {
      audit,
      isDuplicate: true,
      duplicateMsg: `⚠️ Checksum identico a "${checksumDup.titolo}". Possibile duplicato.`,
      versioneNuova: existingItem.evidenza?.versione ?? 0,
    };
  }

  const sameNameDup =
    existingItem.evidenza?.fileName === newDoc.fileName &&
    existingItem.evidenza?.checksum === newDoc.checksum;
  if (sameNameDup) {
    return {
      audit,
      isDuplicate: true,
      duplicateMsg: `⚠️ Documento "${newDoc.fileName}" già caricato (stessa versione).`,
      versioneNuova: existingItem.evidenza?.versione ?? 1,
    };
  }

  const nuovaVersione = (existingItem.evidenza?.versione ?? 0) + 1;
  const checklistItems = audit.checklistItems.map((item) => {
    if (item.id !== itemId) return item;
    const updated: ComplianceChecklistItem = {
      ...item,
      stato: "COMPLETATO",
      evidenza: {
        fileName: newDoc.fileName,
        dataUpload: new Date().toISOString(),
        versione: nuovaVersione,
        note: newDoc.cambiaDescrizione,
        checksum: newDoc.checksum,
        fileSize: newDoc.fileSize,
      },
    };
    return applyScadenzaDays(updated);
  });

  const rebuilt = buildAuditFromChecklist(audit.gara, checklistItems);
  return {
    audit: {
      ...rebuilt,
      id: audit.id,
      dataCreazione: audit.dataCreazione,
      insightsDeepSeek: audit.insightsDeepSeek,
    },
    isDuplicate: false,
    versioneNuova: nuovaVersione,
  };
}

export function buildDocumentVersionControls(
  items: ComplianceChecklistItem[]
): DocumentVersionControl[] {
  const byChecksum = new Map<string, string>();
  for (const item of items) {
    if (item.evidenza?.checksum) byChecksum.set(item.evidenza.checksum, item.id);
  }

  return items
    .filter((i) => i.evidenza)
    .map((item) => {
      const checksum = item.evidenza!.checksum ?? "";
      const dupOf = checksum && byChecksum.get(checksum) !== item.id
        ? byChecksum.get(checksum)
        : undefined;
      return {
        itemId: item.id,
        titolo: item.titolo,
        versioni: [
          {
            id: `${item.id}-v${item.evidenza!.versione}`,
            checksum,
            fileName: item.evidenza!.fileName,
            fileSize: item.evidenza!.fileSize ?? 0,
            dataUpload: item.evidenza!.dataUpload,
            versione: item.evidenza!.versione,
            cambiaDescrizione: item.evidenza!.note,
          },
        ],
        versioneAttuale: item.evidenza!.versione,
        ultimaModifica: item.evidenza!.dataUpload,
        checksumAttuale: checksum,
        isDuplicate: Boolean(dupOf),
        duplicateOf: dupOf,
      };
    });
}

export function generateDocumentAuditTrail(
  items: ComplianceChecklistItem[]
): Array<{
  itemId: string;
  titolo: string;
  dataUpload: string;
  versione: number;
  fileName: string;
  azione: string;
}> {
  const trail = items
    .filter((i) => i.evidenza)
    .map((item) => ({
      itemId: item.id,
      titolo: item.titolo,
      dataUpload: item.evidenza!.dataUpload,
      versione: item.evidenza!.versione,
      fileName: item.evidenza!.fileName,
      azione: `Upload v${item.evidenza!.versione}`,
    }));

  return trail.sort(
    (a, b) => new Date(b.dataUpload).getTime() - new Date(a.dataUpload).getTime()
  );
}

export type ExpiryReminderSeverity = "INFO" | "WARNING" | "CRITICAL" | "URGENT";

export interface ExpiryReminder {
  itemId: string;
  titolo: string;
  scadenza: string;
  giorniRimanenti: number;
  severity: ExpiryReminderSeverity;
  messaggio: string;
  azioni: string[];
}

export interface ReminderSchedule {
  reminders: ExpiryReminder[];
  prossimoCritical?: ExpiryReminder;
  schedulaNotifiche: Array<{
    dataNotifica: string;
    tipoNotifica: "EMAIL" | "IN_APP" | "SMS";
    itemId: string;
  }>;
}

export function generateExpiryReminders(items: ComplianceChecklistItem[]): ReminderSchedule {
  const reminders: ExpiryReminder[] = [];
  const now = new Date();
  const schedulaNotifiche: ReminderSchedule["schedulaNotifiche"] = [];

  for (const item of items) {
    if (!item.scadenza) continue;

    const scadenza = new Date(item.scadenza);
    if (Number.isNaN(scadenza.getTime())) continue;

    const giorniRimanenti = Math.round(
      (scadenza.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    let severity: ExpiryReminderSeverity = "INFO";
    let messaggio = "";
    let azioni: string[] = [];

    if (giorniRimanenti < 0) {
      severity = "URGENT";
      messaggio = `🚨 URGENTE: ${item.titolo} scaduto ${Math.abs(giorniRimanenti)} giorni fa`;
      azioni = [
        "Rinnovare immediatamente",
        "Contattare fornitore/banca per nuova certificazione",
        "Verificare partecipabilità gara",
      ];
    } else if (giorniRimanenti < 7) {
      severity = "CRITICAL";
      messaggio = `⚠️ CRITICO: ${item.titolo} scade tra ${giorniRimanenti} giorni`;
      azioni = [
        "Rinnovare entro questa settimana",
        `Scadenza: ${scadenza.toLocaleDateString("it-IT")}`,
      ];
    } else if (giorniRimanenti < 30) {
      severity = "WARNING";
      messaggio = `⚠️ ATTENZIONE: ${item.titolo} scade tra ${giorniRimanenti} giorni`;
      azioni = ["Programmare rinnovo entro 2 settimane"];
    } else {
      severity = "INFO";
      messaggio = `ℹ️ ${item.titolo} scade tra ${giorniRimanenti} giorni`;
      azioni = ["Pianificare rinnovo"];
    }

    reminders.push({
      itemId: item.id,
      titolo: item.titolo,
      scadenza: item.scadenza,
      giorniRimanenti,
      severity,
      messaggio,
      azioni,
    });

    for (const daysBefore of [30, 7, 1] as const) {
      if (giorniRimanenti > daysBefore) {
        const notifyDate = new Date(scadenza);
        notifyDate.setDate(notifyDate.getDate() - daysBefore);
        if (notifyDate >= now) {
          schedulaNotifiche.push({
            dataNotifica: notifyDate.toISOString(),
            tipoNotifica: daysBefore === 1 ? "IN_APP" : "EMAIL",
            itemId: item.id,
          });
        }
      }
    }
  }

  const severityOrder: Record<ExpiryReminderSeverity, number> = {
    URGENT: 0,
    CRITICAL: 1,
    WARNING: 2,
    INFO: 3,
  };
  reminders.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const prossimoCritical = reminders.find(
    (r) => r.severity === "URGENT" || r.severity === "CRITICAL"
  );

  return { reminders, prossimoCritical, schedulaNotifiche };
}

export type FinalSubmissionVerdict = "GO" | "GO_WITH_CAUTION" | "STOP";

export interface FinalSubmissionChecklist {
  auditPassato: boolean;
  itemsObbligatori_OK: boolean;
  scadenzeValide: boolean;
  documentiUploadati: boolean;
  offertaTecnicaCompleta: boolean;
  prezziCoerenti: boolean;
  firmeDigitali_OK: boolean;
  checklistItems: Array<{
    check: string;
    status: "✓" | "✗" | "⚠️";
    messaggio: string;
    azione?: string;
  }>;
  verdictFinal: FinalSubmissionVerdict;
  raccomandazione: string;
}

export function generateFinalSubmissionChecklist(
  audit: PreSubmissionComplianceAudit,
  bidPrice?: number,
  estimatedProfit?: number
): FinalSubmissionChecklist {
  const checks: FinalSubmissionChecklist["checklistItems"] = [];

  const auditPassato = audit.readyForSubmission;
  checks.push({
    check: "Compliance Audit",
    status: auditPassato ? "✓" : "✗",
    messaggio: auditPassato
      ? "Audit completato senza blocchi"
      : `${audit.blockingIssues.length} blocchi attivi`,
    azione: auditPassato ? undefined : "Completare audit prima invio",
  });

  const obbligatori_OK = audit.itemsObbligatoriBlocchi === 0;
  checks.push({
    check: "Items Obbligatori",
    status: obbligatori_OK ? "✓" : "✗",
    messaggio: obbligatori_OK
      ? `Tutti ${audit.itemsObbligatori} obbligatori completati`
      : `${audit.itemsObbligatoriBlocchi} obbligatori mancanti`,
    azione: obbligatori_OK ? undefined : "Completare items mancanti",
  });

  const scadenzeValide = audit.checklistItems.every(
    (i) => i.giorniRimanenti == null || i.giorniRimanenti > 0
  );
  checks.push({
    check: "Scadenze Documenti",
    status: scadenzeValide ? "✓" : "⚠️",
    messaggio: scadenzeValide
      ? "Nessun documento scaduto"
      : "Documenti scaduti o in scadenza imminente",
    azione: scadenzeValide ? undefined : "Programmare rinnovi",
  });

  const obbligatoriConEvidenza = audit.checklistItems.filter(
    (i) => i.obbligatorio && i.evidenza
  ).length;
  const documentiUploadati = obbligatoriConEvidenza >= audit.itemsObbligatori;
  checks.push({
    check: "Documenti Uploadati",
    status: documentiUploadati ? "✓" : "⚠️",
    messaggio: documentiUploadati
      ? "Evidenze caricate per obbligatori"
      : `${audit.itemsObbligatori - obbligatoriConEvidenza} documenti da caricare`,
    azione: documentiUploadati ? undefined : "Caricare file per item MUST",
  });

  const offertaTecnica = audit.checklistItems.find((i) =>
    i.titolo.toLowerCase().includes("offerta tecnica")
  );
  const offertaTecnicaCompleta =
    Boolean(offertaTecnica) && offertaTecnica!.stato === "COMPLETATO";
  checks.push({
    check: "Offerta Tecnica",
    status: offertaTecnicaCompleta ? "✓" : "⚠️",
    messaggio: offertaTecnicaCompleta
      ? "Offerta tecnica completa"
      : "Offerta tecnica da completare",
    azione: offertaTecnicaCompleta ? undefined : "Revisionare offerta tecnica",
  });

  const prezziCoerenti =
    bidPrice !== undefined && bidPrice > 0 && estimatedProfit !== undefined;
  const profitOk = (estimatedProfit ?? 0) > 0;
  checks.push({
    check: "Prezzi & Profitto",
    status: prezziCoerenti && profitOk ? "✓" : "⚠️",
    messaggio:
      prezziCoerenti && profitOk
        ? `Prezzo €${bidPrice!.toLocaleString("it-IT")}, margine €${estimatedProfit!.toLocaleString("it-IT")}`
        : "Prezzi/margine non definiti in engine",
    azione: profitOk ? undefined : "Verificare bid price e margine",
  });

  checks.push({
    check: "Firme Digitali",
    status: "✓",
    messaggio: "Offerta pronta per firma digitale (verifica finale manuale)",
  });

  let verdictFinal: FinalSubmissionVerdict = "GO";
  if (!auditPassato || !obbligatori_OK) verdictFinal = "STOP";
  else if (!offertaTecnicaCompleta || !scadenzeValide) verdictFinal = "GO_WITH_CAUTION";

  const raccomandazione =
    verdictFinal === "GO"
      ? "✅ VIA LIBERA: tutti i check passati. Offerta pronta per invio."
      : verdictFinal === "GO_WITH_CAUTION"
        ? "⚠️ CAUTO: procedi con cautela. Completa warning prima dell'invio definitivo."
        : `❌ STOP: ${audit.blockingIssues.length} blocchi critici. Non inviare.`;

  return {
    auditPassato,
    itemsObbligatori_OK: obbligatori_OK,
    scadenzeValide,
    documentiUploadati,
    offertaTecnicaCompleta,
    prezziCoerenti: prezziCoerenti && profitOk,
    firmeDigitali_OK: true,
    checklistItems: checks,
    verdictFinal,
    raccomandazione,
  };
}

export const EXPIRY_SEVERITY_STYLES: Record<
  ExpiryReminderSeverity,
  { box: string; text: string; border: string }
> = {
  URGENT: {
    box: "bg-red-950/20 border-red-900/50",
    text: "text-red-400",
    border: "border-l-red-500",
  },
  CRITICAL: {
    box: "bg-orange-950/20 border-orange-900/50",
    text: "text-orange-400",
    border: "border-l-orange-500",
  },
  WARNING: {
    box: "bg-amber-950/20 border-amber-900/50",
    text: "text-amber-400",
    border: "border-l-amber-500",
  },
  INFO: {
    box: "bg-blue-950/20 border-blue-900/50",
    text: "text-blue-400",
    border: "border-l-blue-500",
  },
};

export const FINAL_VERDICT_STYLES: Record<
  FinalSubmissionVerdict,
  { box: string; text: string; sub: string }
> = {
  GO: {
    box: "bg-emerald-950/20 border-emerald-900/50",
    text: "text-emerald-400",
    sub: "text-emerald-300",
  },
  GO_WITH_CAUTION: {
    box: "bg-amber-950/20 border-amber-900/50",
    text: "text-amber-400",
    sub: "text-amber-300",
  },
  STOP: {
    box: "bg-red-950/20 border-red-900/50",
    text: "text-red-400",
    sub: "text-red-300",
  },
};

export const PRE_SUBMISSION_RISK_STYLES: Record<
  PreSubmissionComplianceRisk,
  { box: string; text: string; progress: string; button: string }
> = {
  VERDE: {
    box: "bg-emerald-950/20 border-emerald-900/50",
    text: "text-emerald-400",
    progress: "bg-emerald-500",
    button: "bg-emerald-600 hover:bg-emerald-700",
  },
  GIALLO: {
    box: "bg-amber-950/20 border-amber-900/50",
    text: "text-amber-400",
    progress: "bg-amber-500",
    button: "bg-amber-600 hover:bg-amber-700",
  },
  ROSSO: {
    box: "bg-orange-950/20 border-orange-900/50",
    text: "text-orange-400",
    progress: "bg-orange-500",
    button: "bg-orange-600 hover:bg-orange-700",
  },
  BLOCCANTE: {
    box: "bg-red-950/20 border-red-900/50",
    text: "text-red-400",
    progress: "bg-red-500",
    button: "bg-red-600 hover:bg-red-700",
  },
  PreSubmissionComplianceAuditResult,
  AuditTrailEntry,
  ComplianceDocumentation,
  ComplianceCategory,
} from "../types";

const DEFAULT_ITEMS: Omit<ComplianceChecklistItem, "completato">[] = [
  { id: "psa-001", categoria: "documentazione", titolo: "DGUE", descrizione: "Documento di Gara Unico Europeo compilato e firmato digitalmente.", obbligatorio: true, documentiRichiesti: ["DGUE firmato"] },
  { id: "psa-002", categoria: "qualificazioni", titolo: "Attestazione SOA", descrizione: "Attestazione SOA in corso di validità per la categoria e classifica richiesta.", obbligatorio: true, documentiRichiesti: ["Attestazione SOA"] },
  { id: "psa-003", categoria: "dichiarazioni", titolo: "Dichiarazione antimafia", descrizione: "Dichiarazione sostitutiva antimafia ex art. 80 D.Lgs. 50/2016.", obbligatorio: true, documentiRichiesti: ["Modulo antimafia"] },
  { id: "psa-004", categoria: "cauzione", titolo: "Cauzione provvisoria", descrizione: "Cauzione provvisoria pari al 2% dell'importo a base di gara.", obbligatorio: true, documentiRichiesti: ["Polizza fideiussoria o bonifico"] },
  { id: "psa-005", categoria: "economico_finanziario", titolo: "Dichiarazione fatturato", descrizione: "Dichiarazione del fatturato globale e specifico del triennio.", obbligatorio: true, documentiRichiesti: ["Bilanci o dichiarazione IVA"] },
  { id: "psa-006", categoria: "tecnico_professionale", titolo: "Elenco lavori simili", descrizione: "Elenco lavori analoghi eseguiti nel quinquennio con importi e committenti.", obbligatorio: true, documentiRichiesti: ["Certificati di esecuzione lavori"] },
  { id: "psa-007", categoria: "dichiarazioni", titolo: "Passoe ANAC", descrizione: "Documento di partecipazione rilasciato dal Sistema AVCpass ANAC.", obbligatorio: true, documentiRichiesti: ["PASSOE scaricato da AVCpass"] },
  { id: "psa-008", categoria: "documentazione", titolo: "Offerta economica", descrizione: "Modulo offerta economica con ribasso espresso in lettere e cifre.", obbligatorio: true, documentiRichiesti: ["Modulo offerta firmato"] },
  { id: "psa-009", categoria: "tecnico_professionale", titolo: "Offerta tecnica (se richiesta)", descrizione: "Elaborati tecnici richiesti per valutazione offerta tecnica.", obbligatorio: false, documentiRichiesti: ["Relazione tecnica", "Elaborati progettuali"] },
  { id: "psa-010", categoria: "dichiarazioni", titolo: "Dichiarazione sopralluogo", descrizione: "Attestato di presa visione dei luoghi (se previsto dal bando).", obbligatorio: false, documentiRichiesti: ["Attestato sopralluogo"] },
  { id: "psa-011", categoria: "qualificazioni", titolo: "Iscrizione CCIAA", descrizione: "Visura camerale aggiornata (non più vecchia di 6 mesi).", obbligatorio: true, documentiRichiesti: ["Visura CCIAA"] },
  { id: "psa-012", categoria: "cauzione", titolo: "Impegno cauzione definitiva", descrizione: "Impegno del fideiussore a rilasciare cauzione definitiva in caso di aggiudicazione.", obbligatorio: true, documentiRichiesti: ["Lettera impegno fideiussore"] },
  { id: "psa-013", categoria: "dichiarazioni", titolo: "Dichiarazione regolarità contributiva", descrizione: "DURC in corso di validità (max 120 giorni).", obbligatorio: true, documentiRichiesti: ["DURC online"] },
  { id: "psa-014", categoria: "documentazione", titolo: "Piano di sicurezza sostitutivo", descrizione: "POS o PSS ove previsto dal disciplinare.", obbligatorio: false, documentiRichiesti: ["PSS o POS"] },
  { id: "psa-015", categoria: "altro", titolo: "Eventuale subappalto", descrizione: "Dichiarazione delle lavorazioni da affidare in subappalto.", obbligatorio: false, documentiRichiesti: ["Dichiarazione subappalto"] },
];

export function createPreSubmissionAudit(
  gara: TenderDocument
): PreSubmissionComplianceAuditResult {
  const items: ComplianceChecklistItem[] = DEFAULT_ITEMS.map((item) => ({
    ...item,
    completato: false,
  }));

  return {
    gara,
    items,
    completamentoPercent: 0,
    verdetto: "STOP",
    criticitaBloccanti: items
      .filter((i) => i.obbligatorio)
      .map((i) => `${i.titolo}: da completare`),
    promemoria: generateExpiryReminders(items),
    auditTrail: [
      { timestamp: new Date().toISOString(), azione: "Audit creato", utente: "system" },
    ],
    documentazione: [],
    generatedAt: new Date().toISOString(),
  };
}

export function updateComplianceItem(
  audit: PreSubmissionComplianceAuditResult,
  itemId: string,
  completato: boolean,
  note?: string
): PreSubmissionComplianceAuditResult {
  const items = audit.items.map((item) =>
    item.id === itemId ? { ...item, completato, note: note ?? item.note } : item
  );

  const total = items.length;
  const completati = items.filter((i) => i.completato).length;
  const completamentoPercent = Math.round((completati / total) * 100);

  const obbligatoriNonCompleti = items.filter((i) => i.obbligatorio && !i.completato);
  const verdetto =
    obbligatoriNonCompleti.length === 0
      ? "GO"
      : obbligatoriNonCompleti.length <= 2
      ? "GO_WITH_CAUTION"
      : "STOP";

  const newEntry: AuditTrailEntry = {
    timestamp: new Date().toISOString(),
    azione: `Item "${itemId}" ${completato ? "completato" : "de-completato"}`,
    itemId,
  };

  return {
    ...audit,
    items,
    completamentoPercent,
    verdetto,
    criticitaBloccanti: obbligatoriNonCompleti.map((i) => `${i.titolo}: da completare`),
    promemoria: generateExpiryReminders(items),
    auditTrail: [...audit.auditTrail, newEntry],
  };
}

export function generateFinalSubmissionChecklist(
  audit: PreSubmissionComplianceAuditResult
): { verdetto: PreSubmissionComplianceAuditResult["verdetto"]; bloccanti: string[] } {
  const bloccanti = audit.items
    .filter((i) => i.obbligatorio && !i.completato)
    .map((i) => i.titolo);

  const verdetto = bloccanti.length === 0 ? "GO" : bloccanti.length <= 2 ? "GO_WITH_CAUTION" : "STOP";
  return { verdetto, bloccanti };
}

export function generateExpiryReminders(items: ComplianceChecklistItem[]): string[] {
  const now = Date.now();
  return items
    .filter((i) => i.dataScadenza)
    .map((i) => {
      const giorniRimanenti = Math.ceil(
        (new Date(i.dataScadenza!).getTime() - now) / 86_400_000
      );
      if (giorniRimanenti < 0) return `${i.titolo}: SCADUTO`;
      if (giorniRimanenti <= 7) return `${i.titolo}: scade tra ${giorniRimanenti} giorni — URGENTE`;
      if (giorniRimanenti <= 30) return `${i.titolo}: scade tra ${giorniRimanenti} giorni`;
      return null;
    })
    .filter((r): r is string => r !== null);
}

export const AUDIT_VERDETTO_CLASS: Record<PreSubmissionComplianceAuditResult["verdetto"], string> = {
  GO: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  GO_WITH_CAUTION: "text-amber-400 border-amber-800 bg-amber-950/40",
  STOP: "text-red-400 border-red-800 bg-red-950/40",
};

export const COMPLIANCE_CATEGORY_LABEL: Record<ComplianceCategory, string> = {
  documentazione: "Documentazione",
  qualificazioni: "Qualificazioni",
  economico_finanziario: "Economico-Finanziario",
  tecnico_professionale: "Tecnico-Professionale",
  dichiarazioni: "Dichiarazioni",
  cauzione: "Cauzioni",
  altro: "Altro",
};
