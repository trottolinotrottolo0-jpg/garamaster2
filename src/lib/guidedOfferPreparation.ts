export type OfferBusta = "amministrativa" | "tecnica" | "economica";

export type OfferDataFieldKey =
  | "ribassoPrevisto"
  | "subappaltatori"
  | "rtiAvvalimento"
  | "garanziaProvvisoria"
  | "durataEsecuzione"
  | "personaleChiave"
  | "offertaEconomica"
  | "offertaTecnica";

export interface OfferChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required?: boolean;
  note?: string;
}

export interface OfferPreparationState {
  collectedData: Partial<Record<OfferDataFieldKey, string>>;
  checklist: Record<OfferBusta, OfferChecklistItem[]>;
  currentStep?: string;
  lastUpdatedAt?: string;
}

export const OFFER_DATA_FIELDS: {
  key: OfferDataFieldKey;
  label: string;
  placeholder: string;
}[] = [
  { key: "ribassoPrevisto", label: "Ribasso previsto", placeholder: "es. 12,5%" },
  { key: "subappaltatori", label: "Subappaltatori", placeholder: "parti subappaltate o «nessuno»" },
  { key: "rtiAvvalimento", label: "RTI / Avvalimento", placeholder: "struttura consorzio o avvalimento" },
  { key: "garanziaProvvisoria", label: "Garanzia provvisoria", placeholder: "importo o modalità" },
  { key: "durataEsecuzione", label: "Durata esecuzione", placeholder: "giorni/mesi da offerta" },
  { key: "personaleChiave", label: "Personale chiave", placeholder: "ruoli nominati" },
  { key: "offertaEconomica", label: "Offerta economica", placeholder: "stato compilazione" },
  { key: "offertaTecnica", label: "Offerta tecnica", placeholder: "stato relazione tecnica" },
];

export const BUSTA_LABELS: Record<OfferBusta, string> = {
  amministrativa: "Busta amministrativa",
  tecnica: "Busta tecnica",
  economica: "Busta economica",
};

const GM_OFFER_STATE_RE = /<!--\s*GM_OFFER_STATE\s*([\s\S]*?)\s*-->/i;

export function createInitialOfferState(): OfferPreparationState {
  return {
    collectedData: {},
    checklist: {
      amministrativa: [],
      tecnica: [],
      economica: [],
    },
    currentStep: "avvio",
    lastUpdatedAt: new Date().toISOString(),
  };
}

function normalizeChecklistItem(raw: unknown, busta: OfferBusta, index: number): OfferChecklistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = String(o.label ?? o.nome ?? o.title ?? "").trim();
  if (!label) return null;
  const id = String(o.id ?? `${busta}-${index}-${label.slice(0, 24).replace(/\s+/g, "-")}`);
  return {
    id,
    label,
    done: Boolean(o.done ?? o.completato),
    required: o.required !== false,
    note: o.note ? String(o.note) : undefined,
  };
}

function mergeChecklistBusta(
  existing: OfferChecklistItem[],
  incoming: OfferChecklistItem[]
): OfferChecklistItem[] {
  const map = new Map(existing.map((i) => [i.id, { ...i }]));
  for (const item of incoming) {
    const prev = map.get(item.id);
    map.set(item.id, prev ? { ...prev, ...item, done: item.done || prev.done } : item);
  }
  return Array.from(map.values());
}

export function mergeOfferPreparationState(
  base: OfferPreparationState,
  patch: Partial<OfferPreparationState>
): OfferPreparationState {
  const next: OfferPreparationState = {
    ...base,
    collectedData: { ...base.collectedData, ...(patch.collectedData ?? {}) },
    checklist: { ...base.checklist },
    currentStep: patch.currentStep ?? base.currentStep,
    lastUpdatedAt: new Date().toISOString(),
  };

  if (patch.checklist) {
    for (const busta of Object.keys(patch.checklist) as OfferBusta[]) {
      const incoming = patch.checklist[busta];
      if (incoming?.length) {
        next.checklist[busta] = mergeChecklistBusta(base.checklist[busta] ?? [], incoming);
      }
    }
  }

  return next;
}

export function parseOfferStateFromAssistantText(text: string): {
  displayText: string;
  statePatch: Partial<OfferPreparationState> | null;
} {
  const match = text.match(GM_OFFER_STATE_RE);
  if (!match) {
    return { displayText: text, statePatch: null };
  }

  const displayText = text.replace(GM_OFFER_STATE_RE, "").trim();

  try {
    const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
    const patch: Partial<OfferPreparationState> = {};

    if (raw.data && typeof raw.data === "object") {
      patch.collectedData = raw.data as Partial<Record<OfferDataFieldKey, string>>;
    } else if (raw.collectedData && typeof raw.collectedData === "object") {
      patch.collectedData = raw.collectedData as Partial<Record<OfferDataFieldKey, string>>;
    }

    if (typeof raw.currentStep === "string") {
      patch.currentStep = raw.currentStep;
    }

    const checklistRaw = raw.checklist;
    if (checklistRaw && typeof checklistRaw === "object") {
      const checklist: Record<OfferBusta, OfferChecklistItem[]> = {
        amministrativa: [],
        tecnica: [],
        economica: [],
      };
      for (const busta of ["amministrativa", "tecnica", "economica"] as OfferBusta[]) {
        const arr = (checklistRaw as Record<string, unknown>)[busta];
        if (Array.isArray(arr)) {
          checklist[busta] = arr
            .map((item, idx) => normalizeChecklistItem(item, busta, idx))
            .filter((x): x is OfferChecklistItem => x !== null);
        }
      }
      patch.checklist = checklist;
    }

    return { displayText, statePatch: patch };
  } catch {
    return { displayText, statePatch: null };
  }
}

export function computeOfferProgress(state: OfferPreparationState): {
  overallPercent: number;
  dataPercent: number;
  checklistPercent: number;
  filledDataCount: number;
  totalDataFields: number;
  doneChecklistCount: number;
  totalChecklistCount: number;
} {
  const totalDataFields = OFFER_DATA_FIELDS.length;
  const filledDataCount = OFFER_DATA_FIELDS.filter((f) =>
    Boolean(state.collectedData[f.key]?.trim())
  ).length;

  const allItems = (["amministrativa", "tecnica", "economica"] as OfferBusta[]).flatMap(
    (b) => state.checklist[b] ?? []
  );
  const totalChecklistCount = allItems.length;
  const doneChecklistCount = allItems.filter((i) => i.done).length;

  const dataPercent =
    totalDataFields > 0 ? Math.round((filledDataCount / totalDataFields) * 100) : 0;
  const checklistPercent =
    totalChecklistCount > 0 ? Math.round((doneChecklistCount / totalChecklistCount) * 100) : 0;

  const overallPercent =
    totalChecklistCount > 0
      ? Math.round(dataPercent * 0.4 + checklistPercent * 0.6)
      : dataPercent;

  return {
    overallPercent,
    dataPercent,
    checklistPercent,
    filledDataCount,
    totalDataFields,
    doneChecklistCount,
    totalChecklistCount,
  };
}

export function getMissingOfferAlerts(state: OfferPreparationState): string[] {
  const alerts: string[] = [];

  for (const field of OFFER_DATA_FIELDS) {
    if (!state.collectedData[field.key]?.trim()) {
      alerts.push(`Dato mancante: ${field.label}`);
    }
  }

  for (const busta of ["amministrativa", "tecnica", "economica"] as OfferBusta[]) {
    const pending = (state.checklist[busta] ?? []).filter((i) => !i.done && i.required !== false);
    for (const item of pending.slice(0, 5)) {
      alerts.push(`${BUSTA_LABELS[busta]}: ${item.label}`);
    }
    if (pending.length > 5) {
      alerts.push(`${BUSTA_LABELS[busta]}: altri ${pending.length - 5} documenti da completare`);
    }
  }

  return alerts.slice(0, 12);
}

export const OFFER_PREPARATION_GEMINI_INSTRUCTIONS = `
## ISTRUZIONI MODALITÀ PREPARAZIONE OFFERTA (obbligatorie)
Sei in modalità **PREPARAZIONE OFFERTA**.
Guida l'utente **step-by-step** nella preparazione dell'offerta per la gara nel JSON.
- Chiedi **un'informazione alla volta** (ribasso, subappalti, RTI/avvalimento, garanzie, ecc.).
- Sii **preciso** sui documenti richiesti dal disciplinare (DGUE, SOA, offerta tecnica, offerta economica, ecc.).
- Quando hai abbastanza contesto, proponi la **checklist documenti** suddivisa in: Busta Amministrativa, Busta Tecnica, Busta Economica.
- Aggiorna lo stato dopo ogni risposta dell'utente.

Alla fine di **ogni** tuo messaggio aggiungi SEMPRE (invisibile all'utente nel rendering) questo blocco JSON:

<!-- GM_OFFER_STATE
{
  "currentStep": "nome_step_corrente",
  "data": {
    "ribassoPrevisto": "valore se noto",
    "subappaltatori": "valore se noto"
  },
  "checklist": {
    "amministrativa": [{"id":"adm-1","label":"DGUE","done":false,"required":true}],
    "tecnica": [{"id":"tec-1","label":"Relazione tecnica","done":false}],
    "economica": [{"id":"eco-1","label":"Offerta economica","done":false}]
  }
}
-->

Regole JSON:
- Includi in "data" solo i campi già raccolti o aggiornati in questo turno.
- In "checklist" elenca tutti i documenti pertinenti finora identificati (mantieni gli id stabili).
- Imposta "done": true solo se l'utente ha confermato il documento pronto.
- Non ripetere il blocco GM_OFFER_STATE nel testo visibile; solo nel commento HTML finale.
`;
