import type {
  GaraAnacRow,
  GaraRow,
  GaraScoutingRow,
  GaraSource,
  JsonValue,
  ProfiloImpresaContext,
  ProfiloImpresaRow,
} from "../../types/database";
import type { TenderDocument, TenderRequirement } from "../../types";

function pickString(row: Record<string, JsonValue | undefined>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function pickNumberAsCurrency(row: Record<string, JsonValue | undefined>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === "") continue;
    const num = typeof value === "number" ? value : Number(String(value).replace(/[^\d.,]/g, "").replace(",", "."));
    if (!Number.isNaN(num)) {
      return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(num);
    }
    return String(value);
  }
  return "N/D";
}

function toStringArray(value: JsonValue | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseRequirements(row: Record<string, JsonValue | undefined>): TenderRequirement[] {
  const raw = row.requisiti ?? row.requirements;
  if (Array.isArray(raw)) {
    return raw.map((item, index) => {
      if (typeof item === "object" && item && !Array.isArray(item)) {
        const obj = item as Record<string, JsonValue>;
        return {
          category: (obj.category ?? obj.categoria ?? "Altro") as TenderRequirement["category"],
          description: String(obj.description ?? obj.descrizione ?? `Requisito ${index + 1}`),
          satisfied: Boolean(obj.satisfied ?? obj.conforme ?? false),
          details: String(obj.details ?? obj.dettagli ?? ""),
        };
      }
      return {
        category: "Altro",
        description: String(item),
        satisfied: false,
        details: "",
      };
    });
  }
  return [];
}

function parseOptionalNumber(value: JsonValue | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.,]/g, "").replace(",", "."));
  return Number.isNaN(n) ? undefined : n;
}

export function isProfiloIncomplete(profilo: ProfiloImpresaContext | null): boolean {
  if (!profilo) return true;
  return !profilo.partitaIva && !profilo.soa;
}

export function mapProfiloToContext(row: ProfiloImpresaRow): ProfiloImpresaContext {
  const ragioneSociale =
    row.ragione_sociale ?? row.denominazione ?? "Impresa non denominata";

  const regioni = [
    ...toStringArray(row.regioni),
    ...toStringArray(row.regioni_operative),
  ];

  const certificazioni = toStringArray(row.certificazioni);
  if (row.iso_9001) certificazioni.push("ISO 9001");
  if (row.iso_14001) certificazioni.push("ISO 14001");
  if (row.iso_45001) certificazioni.push("ISO 45001");

  const soaParts = [row.soa_prevalente, row.soa_classifica].filter(Boolean);
  const categorieSoa = toStringArray(row.categorie_soa);
  if (categorieSoa.length) soaParts.push(...categorieSoa);

  const fatturato =
    row.fatturato_triennale != null
      ? String(row.fatturato_triennale)
      : row.fatturato_medio != null
        ? String(row.fatturato_medio)
        : undefined;

  const squadreDisponibili = parseOptionalNumber(row.squadre_disponibili);
  const mezziDisponibili = parseOptionalNumber(row.mezzi_disponibili);

  const summary = [
    `Ragione sociale: ${ragioneSociale}`,
    row.partita_iva ? `P.IVA: ${row.partita_iva}` : null,
    soaParts.length ? `SOA: ${soaParts.join(", ")}` : null,
    fatturato ? `Fatturato (triennio/medio): € ${fatturato}` : null,
    regioni.length ? `Regioni operative: ${regioni.join(", ")}` : null,
    squadreDisponibili != null ? `Squadre disponibili: ${squadreDisponibili}` : null,
    mezziDisponibili != null ? `Mezzi disponibili: ${mezziDisponibili}` : null,
    certificazioni.length ? `Certificazioni: ${certificazioni.join(", ")}` : null,
    row.note ? `Note: ${row.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: row.id,
    userId: row.user_id ?? "",
    ragioneSociale,
    partitaIva: row.partita_iva ?? undefined,
    soa: soaParts.join(", ") || undefined,
    fatturatoTriennale: fatturato,
    squadreDisponibili,
    mezziDisponibili,
    regioni: regioni.length ? regioni : undefined,
    certificazioni: certificazioni.length ? certificazioni : undefined,
    summary,
  };
}

export function mapRowToTender(
  row: GaraRow | GaraAnacRow,
  source: GaraSource,
  scouting?: GaraScoutingRow | null
): TenderDocument {
  const record = row as Record<string, JsonValue | undefined>;
  const id = `${source}-${row.id ?? pickString(record, ["cig"], "unknown")}`;

  const scoutingAnomalies = scouting?.alert ? [String(scouting.alert)] : [];
  const scoutingNotes = scouting?.summary ? [String(scouting.summary)] : [];

  return {
    id,
    title: pickString(record, ["titolo", "oggetto", "denominazione"], "Gara senza titolo"),
    cig: pickString(record, ["cig", "codice_cig"], "N/D"),
    region: pickString(record, ["regione", "provincia"], "Italia"),
    value: pickNumberAsCurrency(record, ["importo", "importo_base", "valore", "importo_gara"]),
    category: pickString(record, ["categoria_soa", "categoria", "cpv"], "Appalto pubblico"),
    deadline: pickString(
      record,
      ["scadenza_presentazione", "data_scadenza", "scadenza", "deadline"],
      "Da verificare"
    ),
    requirements: parseRequirements(record),
    sections: [],
    penalties: toStringArray(record.penali),
    anomalies: [...toStringArray(record.anomalie), ...scoutingAnomalies, ...scoutingNotes],
  };
}
