import type {
  TenderDocument,
  ComplianceChecklistItem,
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
