import { getSupabaseClient } from "../lib/supabase/client";
import { mapProfiloToContext, mapRowToTender, isProfiloIncomplete } from "../lib/supabase/mappers";
import type {
  GaraAnacRow,
  GaraListItem,
  GaraRow,
  GaraScoutingRow,
  ProfiloImpresaContext,
  ProfiloImpresaRow,
  ProfiloOnboardingInput,
} from "../types/database";
import type { TenderDocument } from "../types";

function toListItem(row: GaraRow | GaraAnacRow, source: "gare" | "gare_anac"): GaraListItem {
  const record = row as Record<string, unknown>;
  return {
    id: `${source}-${row.id}`,
    source,
    cig: String(record.cig ?? "N/D"),
    title: String(record.titolo ?? record.oggetto ?? "Gara"),
    region: record.regione ? String(record.regione) : undefined,
    value: record.importo != null ? String(record.importo) : undefined,
    deadline: record.data_scadenza
      ? String(record.data_scadenza)
      : record.scadenza
        ? String(record.scadenza)
        : undefined,
    raw: row,
  };
}

export async function fetchProfiloImpresa(userId: string): Promise<ProfiloImpresaContext | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  console.log("[GaraMaster] Caricamento profilo_impresa per auth.user.id:", userId);

  const { data, error } = await supabase
    .from("profili_impresa")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[GaraMaster] Errore query profili_impresa:", error.message);
    throw new Error(`Errore profilo impresa: ${error.message}`);
  }

  if (!data) {
    console.log("[GaraMaster] Nessun profilo trovato per user_id:", userId);
    return null;
  }

  const row = data as ProfiloImpresaRow;
  if (row.user_id !== userId) {
    console.error("[GaraMaster] Mismatch user_id profilo:", {
      authUserId: userId,
      profiloUserId: row.user_id,
    });
    throw new Error("Profilo impresa non associato all'utente autenticato.");
  }

  const profilo = mapProfiloToContext(row);
  console.log("[GaraMaster] Profilo caricato da Supabase:", {
    authUserId: userId,
    profiloUserId: row.user_id,
    profiloId: profilo.id,
    ragioneSociale: profilo.ragioneSociale,
    partitaIva: profilo.partitaIva,
    soa: profilo.soa,
    regioni: profilo.regioni,
    summary: profilo.summary,
  });

  return profilo;
}

export async function saveProfiloOnboarding(
  userId: string,
  email: string,
  input: ProfiloOnboardingInput
): Promise<ProfiloImpresaContext> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase non configurato");

  console.log("[GaraMaster] Salvataggio profilo_impresa (upsert) per user_id:", userId, input);

  const { data, error } = await supabase
    .from("profili_impresa")
    .upsert(
      {
        user_id: userId,
        email,
        ragione_sociale: input.ragioneSociale,
        partita_iva: input.partitaIva ?? null,
        soa_prevalente: input.soaPrevalente ?? null,
        regioni: input.regioni?.length ? input.regioni : [],
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[GaraMaster] Errore salvataggio profilo:", error.message);
    throw new Error(`Impossibile salvare il profilo: ${error.message}`);
  }

  const row = data as ProfiloImpresaRow;
  if (row.user_id !== userId) {
    throw new Error("Profilo impresa non associato all'utente autenticato.");
  }

  const profilo = mapProfiloToContext(row);
  console.log("[GaraMaster] Profilo salvato:", profilo);
  return profilo;
}

export async function fetchGareForUser(userId: string): Promise<GaraRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("gare")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Errore caricamento gare: ${error.message}`);
  return (data ?? []) as GaraRow[];
}

export async function fetchGareAnac(limit = 80): Promise<GaraAnacRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("gare_anac")
    .select("*")
    .order("data_scadenza", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`Errore caricamento gare ANAC: ${error.message}`);
  return (data ?? []) as GaraAnacRow[];
}

export async function fetchScoutingByCig(cigs: string[]): Promise<Map<string, GaraScoutingRow>> {
  const supabase = getSupabaseClient();
  const map = new Map<string, GaraScoutingRow>();
  if (!supabase || cigs.length === 0) return map;

  const { data, error } = await supabase
    .from("gare_scouting")
    .select("*")
    .in("cig", cigs);

  if (error) {
    console.warn("Scouting non caricato:", error.message);
    return map;
  }

  for (const row of (data ?? []) as GaraScoutingRow[]) {
    if (row.cig) map.set(row.cig, row);
  }
  return map;
}

export async function loadGareCatalog(userId: string): Promise<{
  items: GaraListItem[];
  tenders: TenderDocument[];
}> {
  const [gareUtente, gareAnac] = await Promise.all([
    fetchGareForUser(userId),
    fetchGareAnac(),
  ]);

  const allCigs = [
    ...gareUtente.map((g) => g.cig).filter(Boolean),
    ...gareAnac.map((g) => g.cig).filter(Boolean),
  ] as string[];

  const scoutingMap = await fetchScoutingByCig(allCigs);

  const items: GaraListItem[] = [
    ...gareUtente.map((g) => toListItem(g, "gare")),
    ...gareAnac.map((g) => toListItem(g, "gare_anac")),
  ];

  const tenders: TenderDocument[] = [
    ...gareUtente.map((g) =>
      mapRowToTender(g, "gare", g.cig ? scoutingMap.get(g.cig) : undefined)
    ),
    ...gareAnac.map((g) =>
      mapRowToTender(g, "gare_anac", g.cig ? scoutingMap.get(g.cig) : undefined)
    ),
  ];

  return { items, tenders };
}

export async function fetchGaraById(
  listId: string,
  userId: string
): Promise<TenderDocument | null> {
  const { tenders } = await loadGareCatalog(userId);
  return tenders.find((t) => t.id === listId) ?? null;
}
