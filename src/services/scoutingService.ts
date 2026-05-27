import { getSupabaseClient } from "../lib/supabase/client";
import type { GaraAnacRow, GaraScoutingRow, ProfiloImpresaContext } from "../types/database";
import type {
  ScoutingFacetOptions,
  ScoutingFilters,
  ScoutingGaraItem,
  ScoutingStatoUtente,
} from "../types/scouting";

type ScoutingUtenteRow = {
  gare_anac_id: string;
  stato: ScoutingStatoUtente;
};

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseImporto(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function formatImporto(value: number | null): string | undefined {
  if (value == null) return undefined;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function extractSoaTokens(profilo: ProfiloImpresaContext | null): string[] {
  if (!profilo?.soa) return [];
  return profilo.soa
    .split(/[,;/|]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function computeFitScore(
  row: GaraAnacRow,
  profilo: ProfiloImpresaContext | null,
  scouting?: GaraScoutingRow | null
): number {
  const stored = Number(row.fit_score ?? scouting?.score);
  if (!Number.isNaN(stored) && stored > 0) return Math.round(stored);

  let score = 45;
  const record = row as Record<string, unknown>;
  const regione = String(record.regione ?? "").toLowerCase();
  const categoria = String(record.categoria ?? record.cpv ?? "").toUpperCase();
  const titolo = String(record.titolo ?? record.oggetto ?? "").toUpperCase();

  const regioniProfilo = (profilo?.regioni ?? []).map((r) => r.toLowerCase());
  if (regione && regioniProfilo.some((r) => regione.includes(r) || r.includes(regione))) {
    score += 25;
  }

  const soaTokens = extractSoaTokens(profilo);
  for (const token of soaTokens) {
    if (categoria.includes(token) || titolo.includes(token)) {
      score += 18;
      break;
    }
  }

  const importo = parseImporto(record.importo ?? record.importo_base);
  if (importo != null && importo >= 150_000 && importo <= 5_000_000) {
    score += 10;
  }

  const scadenza = parseDate(record.data_scadenza ?? record.scadenza);
  if (scadenza) {
    const giorni = daysUntil(scadenza);
    if (giorni >= 7 && giorni <= 60) score += 8;
    if (giorni < 0) score -= 30;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function fitLabel(score: number): ScoutingGaraItem["fitLabel"] {
  if (score >= 70) return "alto";
  if (score >= 45) return "medio";
  return "basso";
}

function mapRowToItem(
  row: GaraAnacRow,
  params: {
    profilo: ProfiloImpresaContext | null;
    scouting?: GaraScoutingRow;
    statoUtente?: ScoutingStatoUtente;
    isNew: boolean;
    documentStatus?: string;
    documentParsed?: boolean;
  }
): ScoutingGaraItem {
  const record = row as Record<string, unknown>;
  const scadenza = parseDate(record.data_scadenza ?? record.scadenza);
  const importoNumero = parseImporto(record.importo ?? record.importo_base);
  const fitScore = computeFitScore(row, params.profilo, params.scouting);

  return {
    id: `scout-${row.id}`,
    gareAnacId: row.id,
    cig: String(record.cig ?? "N/D"),
    titolo: String(record.titolo ?? record.oggetto ?? "Gara ANAC"),
    regione: record.regione ? String(record.regione) : undefined,
    provincia: record.provincia ? String(record.provincia) : undefined,
    categoria: record.categoria ? String(record.categoria) : undefined,
    cpv: record.cpv ? String(record.cpv) : undefined,
    importo: formatImporto(importoNumero),
    importoNumero: importoNumero ?? undefined,
    dataScadenza: scadenza?.toISOString(),
    giorniRimanenti: scadenza ? daysUntil(scadenza) : undefined,
    fitScore,
    fitLabel: fitLabel(fitScore),
    statoUtente: params.statoUtente,
    isNew: params.isNew,
    urlPortale: record.url_portale ? String(record.url_portale) : undefined,
    urlDisciplinare: record.url_disciplinare ? String(record.url_disciplinare) : undefined,
    aiSummary: params.scouting?.summary ? String(params.scouting.summary) : undefined,
    aiStrategia: params.scouting?.strategia ? String(params.scouting.strategia) : undefined,
    aiAlert: params.scouting?.alert ? String(params.scouting.alert) : undefined,
    documentStatus: params.documentStatus,
    documentParsed: params.documentParsed,
  };
}

function applyFilters(
  items: ScoutingGaraItem[],
  filters: ScoutingFilters,
  profilo: ProfiloImpresaContext | null
): ScoutingGaraItem[] {
  return items.filter((item) => {
    if (filters.soloSalvate && item.statoUtente !== "salvata") return false;
    if (filters.nascondiScartate && item.statoUtente === "scartata") return false;
    if (filters.soloNuove && !item.isNew) return false;
    if (item.fitScore < filters.fitMin) return false;

    if (filters.regioni.length && item.regione) {
      const match = filters.regioni.some(
        (r) => normalizeText(item.regione!) === normalizeText(r) || item.regione!.includes(r)
      );
      if (!match) return false;
    } else if (filters.allineaProfilo && profilo?.regioni?.length && item.regione) {
      const match = profilo.regioni.some(
        (r) =>
          normalizeText(item.regione!).includes(normalizeText(r)) ||
          normalizeText(r).includes(normalizeText(item.regione!))
      );
      if (!match) return false;
    }

    if (filters.categorie.length && item.categoria) {
      const match = filters.categorie.some((c) =>
        normalizeText(item.categoria!).includes(normalizeText(c))
      );
      if (!match) return false;
    }

    if (filters.importoMin != null && (item.importoNumero ?? 0) < filters.importoMin) return false;
    if (filters.importoMax != null && (item.importoNumero ?? Infinity) > filters.importoMax) return false;

    if (filters.scadenzaEntroGiorni != null && item.giorniRimanenti != null) {
      if (item.giorniRimanenti < 0 || item.giorniRimanenti > filters.scadenzaEntroGiorni) {
        return false;
      }
    }

    if (filters.query.trim()) {
      const q = normalizeText(filters.query);
      const haystack = normalizeText(
        [item.titolo, item.cig, item.regione, item.categoria, item.cpv].filter(Boolean).join(" ")
      );
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export async function fetchScoutingFacets(): Promise<ScoutingFacetOptions> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { regioni: ["Lombardia", "Veneto", "Lazio"], categorie: ["OG1", "OG3", "OS3"] };
  }

  const { data, error } = await supabase.from("gare_anac").select("regione, categoria").limit(500);
  if (error) {
    console.warn("[Scouting] facets:", error.message);
    return { regioni: [], categorie: [] };
  }

  const regioni = new Set<string>();
  const categorie = new Set<string>();
  for (const row of data ?? []) {
    if (row.regione) regioni.add(String(row.regione));
    if (row.categoria) categorie.add(String(row.categoria));
  }

  return {
    regioni: [...regioni].sort((a, b) => a.localeCompare(b, "it")),
    categorie: [...categorie].sort((a, b) => a.localeCompare(b, "it")),
  };
}

export async function searchScoutingGare(
  userId: string,
  filters: ScoutingFilters,
  profilo: ProfiloImpresaContext | null
): Promise<ScoutingGaraItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const [anacResult, scoutingResult, utenteResult, visteResult, documentiResult] = await Promise.all([
    supabase
      .from("gare_anac")
      .select("*")
      .order("data_scadenza", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase.from("gare_scouting").select("*").limit(500),
    supabase.from("gare_scouting_utente").select("gare_anac_id, stato").eq("user_id", userId),
    supabase.from("gare_anac_viste").select("gare_anac_id").eq("user_id", userId),
    supabase
      .from("gare_documenti")
      .select("gare_anac_id, status, parsed_at")
      .eq("tipo", "disciplinare")
      .limit(500),
  ]);

  if (anacResult.error) {
    throw new Error(`Errore caricamento gare ANAC: ${anacResult.error.message}`);
  }
  if (utenteResult.error) {
    console.warn("[Scouting] gare_scouting_utente:", utenteResult.error.message);
  }
  if (visteResult.error) {
    console.warn("[Scouting] gare_anac_viste:", visteResult.error.message);
  }
  if (documentiResult.error) {
    console.warn("[Scouting] gare_documenti:", documentiResult.error.message);
  }

  const documentMap = new Map<string, { status?: string; parsed: boolean }>();
  for (const row of (documentiResult.data ?? []) as {
    gare_anac_id: string;
    status?: string;
    parsed_at?: string | null;
  }[]) {
    documentMap.set(row.gare_anac_id, {
      status: row.status ? String(row.status) : undefined,
      parsed: Boolean(row.parsed_at),
    });
  }

  const scoutingMap = new Map<string, GaraScoutingRow>();
  for (const row of (scoutingResult.data ?? []) as GaraScoutingRow[]) {
    if (row.cig) scoutingMap.set(String(row.cig), row);
    if (row.gare_anac_id) scoutingMap.set(String(row.gare_anac_id), row);
  }

  const statoMap = new Map<string, ScoutingStatoUtente>();
  for (const row of (utenteResult.data ?? []) as ScoutingUtenteRow[]) {
    statoMap.set(row.gare_anac_id, row.stato);
  }

  const seenIds = new Set(
    ((visteResult.data ?? []) as { gare_anac_id: string }[]).map((r) => r.gare_anac_id)
  );

  const items = ((anacResult.data ?? []) as GaraAnacRow[]).map((row) => {
    const cig = row.cig ? String(row.cig) : undefined;
    const scouting = scoutingMap.get(row.id) ?? (cig ? scoutingMap.get(cig) : undefined);
    const doc = documentMap.get(row.id);
    return mapRowToItem(row, {
      profilo,
      scouting,
      statoUtente: statoMap.get(row.id),
      isNew: !seenIds.has(row.id),
      documentStatus: doc?.status,
      documentParsed: doc?.parsed,
    });
  });

  const filtered = applyFilters(items, filters, profilo);
  return filtered.sort((a, b) => b.fitScore - a.fitScore || (a.giorniRimanenti ?? 999) - (b.giorniRimanenti ?? 999));
}

export async function setScoutingStatoUtente(
  userId: string,
  gareAnacId: string,
  stato: ScoutingStatoUtente
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.from("gare_scouting_utente").upsert(
    {
      user_id: userId,
      gare_anac_id: gareAnacId,
      stato,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,gare_anac_id" }
  );

  if (error) {
    throw new Error(`Impossibile aggiornare stato scouting: ${error.message}`);
  }
}

export async function markScoutingGaraSeen(userId: string, gareAnacId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  await supabase.from("gare_anac_viste").upsert(
    { user_id: userId, gare_anac_id: gareAnacId, visto_at: new Date().toISOString() },
    { onConflict: "user_id,gare_anac_id" }
  );

  await setScoutingStatoUtente(userId, gareAnacId, "vista").catch(() => undefined);
}
