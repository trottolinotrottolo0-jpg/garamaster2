import { getSupabaseClient } from "../lib/supabase/client";
import type { GaraAnacRow, GaraRow, GaraScoutingRow } from "../types/database";
import type {
  DailyFeedData,
  DailyFeedAnacMatchItem,
  DailyFeedExpiringItem,
  DailyFeedScoutingAlertItem,
  DailyFeedUrgentItem,
} from "../types/dailyFeed";
import { mockTenders } from "../mockData";

const SEEN_STORAGE_KEY = "gm_anac_viste";
const FIT_THRESHOLD = 60;
const DAYS_AHEAD = 7;

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveScadenzaOfferta(row: GaraRow): Date | null {
  const r = row as Record<string, unknown>;
  return (
    parseDate(r.scadenza_offerta) ??
    parseDate(r.scadenza_presentazione) ??
    parseDate(r.data_scadenza) ??
    parseDate(r.scadenza)
  );
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatImporto(value: unknown): string | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function loadSeenFromLocal(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${SEEN_STORAGE_KEY}_${userId}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeenToLocal(userId: string, ids: Set<string>): void {
  localStorage.setItem(`${SEEN_STORAGE_KEY}_${userId}`, JSON.stringify([...ids]));
}

async function fetchSeenAnacIds(userId: string): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const local = loadSeenFromLocal(userId);

  if (!supabase) return local;

  const { data, error } = await supabase
    .from("gare_anac_viste")
    .select("gare_anac_id")
    .eq("user_id", userId);

  if (error) {
    console.warn("[DailyFeed] gare_anac_viste non disponibile:", error.message);
    return local;
  }

  const merged = new Set(local);
  for (const row of data ?? []) {
    if (row.gare_anac_id) merged.add(String(row.gare_anac_id));
  }
  return merged;
}

export async function markAnacGaraAsSeen(userId: string, gareAnacId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const local = loadSeenFromLocal(userId);
  local.add(gareAnacId);
  saveSeenToLocal(userId, local);

  if (!supabase) return;

  const { error } = await supabase.from("gare_anac_viste").upsert(
    { user_id: userId, gare_anac_id: gareAnacId, visto_at: new Date().toISOString() },
    { onConflict: "user_id,gare_anac_id" }
  );

  if (error) {
    console.warn("[DailyFeed] mark seen:", error.message);
  }
}

function buildExpiringFromGare(gare: GaraRow[]): DailyFeedExpiringItem[] {
  const now = new Date();
  const limit = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

  const items: DailyFeedExpiringItem[] = [];
  for (const g of gare) {
    const scadenza = resolveScadenzaOfferta(g);
    if (!scadenza || scadenza < now || scadenza > limit) continue;
    items.push({
      id: `exp-${g.id}`,
      garaId: g.id,
      cig: String(g.cig ?? "N/D"),
      titolo: String(g.titolo ?? g.oggetto ?? "Gara"),
      scadenzaOfferta: scadenza.toISOString(),
      giorniRimanenti: daysUntil(scadenza),
      regione: g.regione ? String(g.regione) : undefined,
      importo: formatImporto(g.importo ?? g.importo_base),
      statoPratica: g.stato_pratica ? String(g.stato_pratica) : undefined,
    });
  }
  return items.sort((a, b) => a.giorniRimanenti - b.giorniRimanenti);
}

function buildUrgentFromGare(gare: GaraRow[]): DailyFeedUrgentItem[] {
  return gare
    .filter((g) => {
      const stato = String((g as Record<string, unknown>).stato_pratica ?? "").toLowerCase();
      return stato === "in preparazione";
    })
    .map((g) => {
      const scadenza = resolveScadenzaOfferta(g);
      const giorni = scadenza ? daysUntil(scadenza) : undefined;
      return {
        id: `urg-${g.id}`,
        garaId: g.id,
        cig: String(g.cig ?? "N/D"),
        titolo: String(g.titolo ?? g.oggetto ?? "Gara"),
        statoPratica: String((g as Record<string, unknown>).stato_pratica),
        scadenzaOfferta: scadenza?.toISOString(),
        giorniRimanenti: giorni,
      };
    });
}

function resolveFitScore(anac: GaraAnacRow, scouting?: GaraScoutingRow): number {
  const direct = Number((anac as Record<string, unknown>).fit_score);
  if (!Number.isNaN(direct) && direct > 0) return direct;
  if (scouting?.score != null) return Number(scouting.score);
  return 0;
}

function buildAnacMatches(
  anacRows: GaraAnacRow[],
  scoutingMap: Map<string, GaraScoutingRow>,
  seenIds: Set<string>
): DailyFeedAnacMatchItem[] {
  const items: DailyFeedAnacMatchItem[] = [];
  for (const a of anacRows) {
    const scouting = a.cig ? scoutingMap.get(a.cig) : undefined;
    const fitScore = resolveFitScore(a, scouting);
    if (fitScore <= FIT_THRESHOLD) continue;
    const gareAnacId = a.id;
    if (seenIds.has(gareAnacId)) continue;
    items.push({
      id: `anac-${gareAnacId}`,
      gareAnacId,
      cig: String(a.cig ?? "N/D"),
      titolo: String(a.titolo ?? a.oggetto ?? "Gara ANAC"),
      fitScore: Math.round(fitScore),
      regione: a.regione ? String(a.regione) : undefined,
      importo: formatImporto(a.importo ?? a.importo_base),
      dataScadenza: a.data_scadenza
        ? String(a.data_scadenza)
        : a.scadenza
          ? String(a.scadenza)
          : undefined,
      isNew: true,
    });
  }
  return items.sort((a, b) => b.fitScore - a.fitScore);
}

function buildScoutingAiAlerts(
  anacRows: GaraAnacRow[],
  scoutingMap: Map<string, GaraScoutingRow>
): DailyFeedScoutingAlertItem[] {
  const anacById = new Map(anacRows.map((a) => [a.id, a]));
  const items: DailyFeedScoutingAlertItem[] = [];

  for (const scouting of scoutingMap.values()) {
    const alertText = scouting.alert ? String(scouting.alert).trim() : "";
    if (!alertText) continue;

    const anac =
      (scouting.gare_anac_id ? anacById.get(String(scouting.gare_anac_id)) : undefined) ??
      (scouting.cig
        ? anacRows.find((a) => String(a.cig) === String(scouting.cig))
        : undefined);
    if (!anac) continue;

    const fitScore = Math.round(resolveFitScore(anac, scouting));
    if (fitScore < 50) continue;

    items.push({
      id: `scout-alert-${anac.id}`,
      gareAnacId: anac.id,
      cig: String(anac.cig ?? scouting.cig ?? "N/D"),
      titolo: String(anac.titolo ?? anac.oggetto ?? "Gara ANAC"),
      alert: alertText,
      strategia: scouting.strategia ? String(scouting.strategia) : undefined,
      fitScore,
    });
  }

  return items.sort((a, b) => b.fitScore - a.fitScore).slice(0, 12);
}

function buildMockDailyFeed(): DailyFeedData {
  const now = new Date();
  const in3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in5 = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  return {
    generatedAt: now.toISOString(),
    scadenzaProssimi7Giorni: mockTenders.slice(0, 2).map((t, i) => ({
      id: `mock-exp-${i}`,
      garaId: t.id,
      cig: t.cig,
      titolo: t.title,
      scadenzaOfferta: (i === 0 ? in3 : in5).toISOString(),
      giorniRimanenti: i === 0 ? 3 : 5,
      regione: t.region,
      importo: t.value,
      statoPratica: "In preparazione",
    })),
    nuoveGareAnac: [
      {
        id: "mock-anac-1",
        gareAnacId: "demo-anac-1",
        cig: "DEMO0000001",
        titolo: "Riqualificazione energetica edifici scolastici",
        fitScore: 72,
        regione: "Lombardia",
        importo: "€ 1.250.000",
        isNew: true,
      },
    ],
    azioniUrgenti: [
      {
        id: "mock-urg-1",
        garaId: mockTenders[0].id,
        cig: mockTenders[0].cig,
        titolo: mockTenders[0].title,
        statoPratica: "In preparazione",
        giorniRimanenti: 3,
      },
    ],
    scoutingAiAlerts: [
      {
        id: "mock-scout-alert-1",
        gareAnacId: "demo-anac-1",
        cig: "DEMO0000001",
        titolo: "Riqualificazione energetica edifici scolastici",
        alert: "Controllare penali e revisione prezzi nel disciplinare.",
        strategia: "Valuta RTI se manca classifica.",
        fitScore: 92,
      },
    ],
    totalAlerts: 5,
  };
}

export async function fetchDailyFeed(userId: string): Promise<DailyFeedData> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return buildMockDailyFeed();
  }

  const nowIso = new Date().toISOString();
  const in7Iso = new Date(Date.now() + DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString();

  const [gareResult, anacResult, seenIds] = await Promise.all([
    supabase
      .from("gare")
      .select("*")
      .eq("user_id", userId)
      .order("scadenza_offerta", { ascending: true, nullsFirst: false }),
    supabase.from("gare_anac").select("*").order("fit_score", { ascending: false, nullsFirst: false }).limit(120),
    fetchSeenAnacIds(userId),
  ]);

  let gare = (gareResult.data ?? []) as GaraRow[];
  if (gareResult.error) {
    console.warn("[DailyFeed] gare:", gareResult.error.message);
    const fallback = await supabase.from("gare").select("*").eq("user_id", userId);
    gare = (fallback.data ?? []) as GaraRow[];
  }

  let anacRows = (anacResult.data ?? []) as GaraAnacRow[];
  if (anacResult.error) {
    console.warn("[DailyFeed] gare_anac:", anacResult.error.message);
    const fallback = await supabase.from("gare_anac").select("*").limit(120);
    anacRows = (fallback.data ?? []) as GaraAnacRow[];
  }

  // Scouting "ANAC fit" si basa su colonne/valori che vengono setup tramite SQL:
  //   supabase/solo-daily-feed.sql
  // Se mancano (tipicamente durante il primo setup), la feed risulta "vuota" senza spiegazioni.
  const DEMO_CIGS = new Set(["DEMO0000001", "DEMO0000002"]);
  const demoAnacRows = anacRows.filter((a) => a.cig && DEMO_CIGS.has(String(a.cig)));
  if (
    demoAnacRows.length > 0 &&
    !demoAnacRows.some((a) => {
      const n = Number(a.fit_score);
      return !Number.isNaN(n) && n > 0;
    })
  ) {
    throw new Error(
      "Scouting gare non attivo: manca `fit_score`/scadenze demo in Supabase. Esegui `supabase/solo-daily-feed.sql` (SQL Alert & Daily Feed) nel tuo progetto."
    );
  }

  const cigs = anacRows.map((a) => a.cig).filter(Boolean) as string[];
  const scoutingMap = new Map<string, GaraScoutingRow>();
  if (cigs.length) {
    const { data: scoutingData } = await supabase.from("gare_scouting").select("*").in("cig", cigs);
    for (const row of (scoutingData ?? []) as GaraScoutingRow[]) {
      if (row.cig) scoutingMap.set(row.cig, row);
      if (row.gare_anac_id) scoutingMap.set(String(row.gare_anac_id), row);
    }
  }

  let scadenzaProssimi7Giorni = buildExpiringFromGare(gare);

  const withScadenzaOfferta = gare.filter((g) => {
    const d = parseDate((g as Record<string, unknown>).scadenza_offerta);
    if (!d) return false;
    const now = new Date();
    const limit = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
    return d >= now && d <= limit;
  });
  if (withScadenzaOfferta.length) {
    scadenzaProssimi7Giorni = buildExpiringFromGare(withScadenzaOfferta);
  }

  if (!scadenzaProssimi7Giorni.length && gare.length) {
    scadenzaProssimi7Giorni = buildExpiringFromGare(gare);
  }

  const nuoveGareAnac = buildAnacMatches(anacRows, scoutingMap, seenIds);
  const scoutingAiAlerts = buildScoutingAiAlerts(anacRows, scoutingMap);
  const azioniUrgenti = buildUrgentFromGare(gare);

  const feed: DailyFeedData = {
    generatedAt: new Date().toISOString(),
    scadenzaProssimi7Giorni,
    nuoveGareAnac,
    scoutingAiAlerts,
    azioniUrgenti,
    totalAlerts:
      scadenzaProssimi7Giorni.length +
      nuoveGareAnac.length +
      scoutingAiAlerts.length +
      azioniUrgenti.length,
  };

  console.log("[DailyFeed] Aggiornato:", {
    userId,
    scadenze: feed.scadenzaProssimi7Giorni.length,
    anac: feed.nuoveGareAnac.length,
    scoutingAlerts: feed.scoutingAiAlerts.length,
    urgenti: feed.azioniUrgenti.length,
    window: `${nowIso} → ${in7Iso}`,
  });

  return feed;
}
