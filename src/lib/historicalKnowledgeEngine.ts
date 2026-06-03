import type { StoricoGaraAiEntry } from "../types/storicoGare";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeKPIs {
  totaleGare: number;
  gareVinte: number;
  garePerse: number;
  gareNonPartecipato: number;
  winRateGlobal: number | null;
  ribassoMedio: number | null;
  ribassoVincente: number | null;
  ribassoPerdente: number | null;
}

export interface WinRateByDimension {
  key: string;
  totale: number;
  vinte: number;
  winRate: number;
}

export interface CategoriaRanking {
  categoria: string;
  vinte: number;
  totale: number;
  winRate: number;
  ribassoMedio: number | null;
}

export interface RecurringError {
  tipo: string;
  descrizione: string;
  occorrenze: number;
}

export interface KnowledgeInsight {
  id: string;
  testo: string;
  tipo: "positivo" | "negativo" | "neutro";
}

export interface Raccomandazione {
  id: string;
  titolo: string;
  descrizione: string;
  priorita: "alta" | "media" | "bassa";
}

export interface BenchmarkPeriod {
  label: string;
  garePartecipate: number;
  gareVinte: number;
  winRate: number | null;
}

export interface HistoricalAnalytics {
  kpis: KnowledgeKPIs;
  winRateByCategoria: WinRateByDimension[];
  winRateByRegione: WinRateByDimension[];
  winRateByFascia: WinRateByDimension[];
  topCategorie: CategoriaRanking[];
  bottomCategorie: CategoriaRanking[];
  erroriRicorrenti: RecurringError[];
  insights: KnowledgeInsight[];
  raccomandazioni: Raccomandazione[];
  trend: BenchmarkPeriod[];
  isDemoMode: boolean;
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

const REGIONI = [
  "Lombardia","Lazio","Campania","Sicilia","Veneto","Piemonte",
  "Emilia-Romagna","Puglia","Toscana","Calabria","Sardegna","Liguria",
  "Marche","Abruzzo","Friuli","Umbria","Basilicata","Molise",
  "Valle d'Aosta","Trentino",
];

function extractCategoria(text: string): string | null {
  const m = text.match(/\b(OG\s*\d+[A-Z]?|OS\s*\d+[A-Z]?)\b/i);
  return m ? m[1].replace(/\s+/, "").toUpperCase() : null;
}

function extractRegione(text: string): string | null {
  for (const r of REGIONI) {
    if (new RegExp(`\\b${r.split("'")[0]}\\b`, "i").test(text)) return r;
  }
  return null;
}

function extractImporto(text: string): number | null {
  const m = text.match(/(?:importo|€|euro)\s*:?\s*([\d.,]+)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function fasciaImporto(importo: number | null): string {
  if (importo == null) return "Importo non noto";
  if (importo < 150_000) return "< 150K";
  if (importo < 500_000) return "150K – 500K";
  if (importo < 1_000_000) return "500K – 1M";
  if (importo < 5_000_000) return "1M – 5M";
  return "> 5M";
}

function safe(n: number | null, decimals = 1): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

function computeKPIs(entries: StoricoGaraAiEntry[]): KnowledgeKPIs {
  const vinte = entries.filter((e) => e.esito === "vinta");
  const perse = entries.filter((e) => e.esito === "persa");
  const nonPart = entries.filter((e) => e.esito === "non partecipato");
  const decisive = vinte.length + perse.length;

  const allRibassi = entries.filter((e) => e.ribassoOfferto != null).map((e) => e.ribassoOfferto!);
  const ribassiVinte = vinte.filter((e) => e.ribassoOfferto != null).map((e) => e.ribassoOfferto!);
  const ribassiPerse = perse.filter((e) => e.ribassoOfferto != null).map((e) => e.ribassoOfferto!);

  return {
    totaleGare: entries.length,
    gareVinte: vinte.length,
    garePerse: perse.length,
    gareNonPartecipato: nonPart.length,
    winRateGlobal: decisive > 0 ? safe((vinte.length / decisive) * 100) : null,
    ribassoMedio: safe(avg(allRibassi)),
    ribassoVincente: safe(avg(ribassiVinte)),
    ribassoPerdente: safe(avg(ribassiPerse)),
  };
}

// ─── Win Rate by dimension ────────────────────────────────────────────────────

function winRateByKey(
  entries: StoricoGaraAiEntry[],
  keyFn: (e: StoricoGaraAiEntry) => string | null
): WinRateByDimension[] {
  const map = new Map<string, { vinte: number; totale: number }>();

  for (const e of entries) {
    if (e.esito !== "vinta" && e.esito !== "persa") continue;
    const fullText = `${e.titoloGara} ${e.noteAi}`;
    const key = keyFn(e) ?? fullText.match(/[A-Za-zÀ-ú]{4,}/)?.[0] ?? "N/D";
    const cur = map.get(key) ?? { vinte: 0, totale: 0 };
    cur.totale++;
    if (e.esito === "vinta") cur.vinte++;
    map.set(key, cur);
  }

  return [...map.entries()]
    .map(([key, { vinte, totale }]) => ({
      key,
      totale,
      vinte,
      winRate: safe((vinte / totale) * 100) ?? 0,
    }))
    .filter((d) => d.totale >= 1)
    .sort((a, b) => b.winRate - a.winRate);
}

// ─── Categoria ranking ────────────────────────────────────────────────────────

function buildCategoriaRanking(entries: StoricoGaraAiEntry[]): CategoriaRanking[] {
  const map = new Map<string, { vinte: number; totale: number; ribassi: number[] }>();

  for (const e of entries) {
    if (e.esito !== "vinta" && e.esito !== "persa") continue;
    const cat = extractCategoria(`${e.titoloGara} ${e.noteAi}`) ?? "Altro";
    const cur = map.get(cat) ?? { vinte: 0, totale: 0, ribassi: [] };
    cur.totale++;
    if (e.esito === "vinta") cur.vinte++;
    if (e.ribassoOfferto != null) cur.ribassi.push(e.ribassoOfferto);
    map.set(cat, cur);
  }

  return [...map.entries()]
    .map(([categoria, { vinte, totale, ribassi }]) => ({
      categoria,
      vinte,
      totale,
      winRate: safe((vinte / totale) * 100) ?? 0,
      ribassoMedio: safe(avg(ribassi)),
    }))
    .sort((a, b) => b.winRate - a.winRate);
}

// ─── Errori ricorrenti ────────────────────────────────────────────────────────

const ERROR_PATTERNS: { regex: RegExp; tipo: string; descrizione: string }[] = [
  { regex: /document|dgue|allegat|mancant/i, tipo: "Documentazione", descrizione: "Documentazione incompleta o mancante" },
  { regex: /ribasso.{0,30}(alto|aggressiv|eccessi)/i, tipo: "Ribasso aggressivo", descrizione: "Ribasso troppo aggressivo rispetto ai vincitori" },
  { regex: /fit.{0,20}(basso|insufficiente)/i, tipo: "Fit basso", descrizione: "Fit con il profilo impresa insufficiente" },
  { regex: /margin[ei].{0,20}(basso|insufficiente|negativ)/i, tipo: "Margine basso", descrizione: "Margine atteso insufficiente per la partecipazione" },
  { regex: /rischio.{0,20}(operativ|alto|critic)/i, tipo: "Rischio operativo", descrizione: "Rischio operativo elevato non adeguatamente valutato" },
  { regex: /SOA|classifica.{0,20}(mancant|insufficiente)/i, tipo: "Gap SOA", descrizione: "Classificazione SOA inadeguata per la gara" },
  { regex: /scadenz.{0,20}(mancata|persa|tarde)/i, tipo: "Scadenze", descrizione: "Scadenza mancata o gestione tempi insufficiente" },
  { regex: /ente.{0,30}(difficil|sfidant|restrittiv)/i, tipo: "Ente difficile", descrizione: "Ente appaltante con storico sfidante" },
];

function detectErrors(entries: StoricoGaraAiEntry[]): RecurringError[] {
  const perse = entries.filter((e) => e.esito === "persa");
  const counts = new Map<string, { count: number; tipo: string; descrizione: string }>();

  for (const e of perse) {
    const text = `${e.noteAi} ${e.titoloGara}`;
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(text)) {
        const cur = counts.get(pattern.tipo) ?? { count: 0, tipo: pattern.tipo, descrizione: pattern.descrizione };
        cur.count++;
        counts.set(pattern.tipo, cur);
      }
    }
  }

  return [...counts.values()]
    .map((c) => ({ tipo: c.tipo, descrizione: c.descrizione, occorrenze: c.count }))
    .sort((a, b) => b.occorrenze - a.occorrenze);
}

// ─── Trend (periodi) ─────────────────────────────────────────────────────────

function buildTrend(entries: StoricoGaraAiEntry[]): BenchmarkPeriod[] {
  const now = Date.now();
  const periods: { label: string; days: number }[] = [
    { label: "Ultimi 30 gg", days: 30 },
    { label: "Ultimi 90 gg", days: 90 },
    { label: "Ultimo anno", days: 365 },
    { label: "Tutto", days: 99999 },
  ];

  return periods.map(({ label, days }) => {
    const since = now - days * 86_400_000;
    const sub = entries.filter((e) => new Date(e.createdAt).getTime() >= since);
    const vinte = sub.filter((e) => e.esito === "vinta").length;
    const perse = sub.filter((e) => e.esito === "persa").length;
    const decisive = vinte + perse;
    return {
      label,
      garePartecipate: sub.length,
      gareVinte: vinte,
      winRate: decisive > 0 ? safe((vinte / decisive) * 100) : null,
    };
  });
}

// ─── Insights automatici ─────────────────────────────────────────────────────

function generateInsights(
  kpis: KnowledgeKPIs,
  byCategoria: WinRateByDimension[],
  byRegione: WinRateByDimension[],
  byFascia: WinRateByDimension[]
): KnowledgeInsight[] {
  const insights: KnowledgeInsight[] = [];
  let id = 0;

  // Win rate globale
  if (kpis.winRateGlobal != null) {
    const tipo = kpis.winRateGlobal >= 40 ? "positivo" : kpis.winRateGlobal >= 20 ? "neutro" : "negativo";
    insights.push({
      id: `ins-${id++}`,
      testo: `Win rate globale: ${kpis.winRateGlobal}% su ${kpis.gareVinte + kpis.garePerse} gare decisive.`,
      tipo,
    });
  }

  // Migliore categoria
  const topCat = byCategoria[0];
  if (topCat && topCat.totale >= 2) {
    insights.push({
      id: `ins-${id++}`,
      testo: `La categoria ${topCat.key} mostra il win rate più alto: ${topCat.winRate}% (${topCat.vinte}/${topCat.totale} gare).`,
      tipo: "positivo",
    });
  }

  // Peggiore categoria
  const botCat = byCategoria[byCategoria.length - 1];
  if (botCat && botCat.key !== topCat?.key && botCat.totale >= 2 && botCat.winRate < 30) {
    insights.push({
      id: `ins-${id++}`,
      testo: `La categoria ${botCat.key} ha il win rate più basso: ${botCat.winRate}% — valuta se conviene continuare a partecipare.`,
      tipo: "negativo",
    });
  }

  // Migliore regione
  const topReg = byRegione[0];
  if (topReg && topReg.totale >= 2) {
    insights.push({
      id: `ins-${id++}`,
      testo: `${topReg.key} è la regione con il miglior win rate: ${topReg.winRate}%.`,
      tipo: "positivo",
    });
  }

  // Fascia importo migliore
  const topFascia = byFascia[0];
  if (topFascia && topFascia.totale >= 2) {
    insights.push({
      id: `ins-${id++}`,
      testo: `Le gare nella fascia ${topFascia.key} mostrano il miglior win rate: ${topFascia.winRate}%.`,
      tipo: "positivo",
    });
  }

  // Ribassi
  if (kpis.ribassoVincente != null && kpis.ribassoPerdente != null) {
    const diff = kpis.ribassoVincente - kpis.ribassoPerdente;
    const tipo = Math.abs(diff) > 3 ? "positivo" : "neutro";
    insights.push({
      id: `ins-${id++}`,
      testo: `Ribasso medio vincente ${kpis.ribassoVincente}% vs perdente ${kpis.ribassoPerdente}% (delta: ${diff > 0 ? "+" : ""}${diff.toFixed(1)}%).`,
      tipo,
    });
  } else if (kpis.ribassoMedio != null) {
    insights.push({
      id: `ins-${id++}`,
      testo: `Ribasso medio storico: ${kpis.ribassoMedio}%.`,
      tipo: "neutro",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: `ins-${id++}`,
      testo: "Aggiungi esiti alle gare nello storico per generare insight automatici.",
      tipo: "neutro",
    });
  }

  return insights;
}

// ─── Raccomandazioni ─────────────────────────────────────────────────────────

function generateRaccomandazioni(
  kpis: KnowledgeKPIs,
  byCategoria: WinRateByDimension[],
  byRegione: WinRateByDimension[],
  byFascia: WinRateByDimension[],
  errori: RecurringError[]
): Raccomandazione[] {
  const recs: Raccomandazione[] = [];
  let id = 0;

  const topCat = byCategoria[0];
  if (topCat && topCat.winRate > 40) {
    recs.push({
      id: `rec-${id++}`,
      titolo: `Concentrati su ${topCat.key}`,
      descrizione: `Win rate ${topCat.winRate}% in questa categoria — prioritizza i bandi con questa classificazione SOA.`,
      priorita: "alta",
    });
  }

  const topReg = byRegione[0];
  if (topReg && topReg.winRate > 40) {
    recs.push({
      id: `rec-${id++}`,
      titolo: `Presidia ${topReg.key}`,
      descrizione: `Win rate ${topReg.winRate}% in questa regione — considera di ampliare la presenza locale.`,
      priorita: "alta",
    });
  }

  const topFascia = byFascia[0];
  if (topFascia) {
    recs.push({
      id: `rec-${id++}`,
      titolo: `Fascia importo ottimale: ${topFascia.key}`,
      descrizione: `Storicamente il tuo win rate è più alto in questa fascia. Concentra le risorse di partecipazione qui.`,
      priorita: "media",
    });
  }

  if (kpis.ribassoVincente != null) {
    recs.push({
      id: `rec-${id++}`,
      titolo: `Calibra il ribasso attorno a ${kpis.ribassoVincente}%`,
      descrizione: `Il ribasso medio delle gare vinte è ${kpis.ribassoVincente}%. Usa questo come ancora per i prossimi calcoli Bid Pricing.`,
      priorita: "alta",
    });
  }

  if (errori.length > 0) {
    const topErr = errori[0];
    recs.push({
      id: `rec-${id++}`,
      titolo: `Riduci: ${topErr.tipo}`,
      descrizione: `Errore più ricorrente nelle gare perse (${topErr.occorrenze} volte). Implementa una checklist preventiva.`,
      priorita: "alta",
    });
  }

  if (kpis.winRateGlobal != null && kpis.winRateGlobal < 25) {
    recs.push({
      id: `rec-${id++}`,
      titolo: "Win rate basso — seleziona meglio le gare",
      descrizione: "Con un win rate sotto il 25% è strategico essere più selettivi. Usa il Bid/No-Bid Engine come filtro obbligatorio.",
      priorita: "alta",
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: `rec-${id++}`,
      titolo: "Completa lo storico",
      descrizione: "Segna l'esito (Vinta/Persa) su almeno 5 gare per ricevere raccomandazioni personalizzate.",
      priorita: "media",
    });
  }

  return recs;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

function buildDemoEntries(): StoricoGaraAiEntry[] {
  const now = new Date();
  const ago = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();

  return [
    { id: "demo-1", garaId: null, cig: "DEMO001", titoloGara: "Riqualificazione edifici OG1 Lombardia", tipoAnalisi: "post_gara_forensics", esito: "vinta", ribassoOfferto: 12.5, patternVincenti: [], noteAi: "Gara vinta. Categoria OG1 Lombardia importo €850000. Buona offerta tecnica.", createdAt: ago(15) },
    { id: "demo-2", garaId: null, cig: "DEMO002", titoloGara: "Strade comunali OG3 Veneto", tipoAnalisi: "bid_no_bid", esito: "persa", ribassoOfferto: 18.2, patternVincenti: [], noteAi: "Gara persa. Categoria OG3 Veneto importo €450000. Ribasso insufficiente. Documentazione incompleta allegati.", createdAt: ago(30) },
    { id: "demo-3", garaId: null, cig: "DEMO003", titoloGara: "Impianti termici OS28 Lombardia", tipoAnalisi: "bid_pricing", esito: "vinta", ribassoOfferto: 10.8, patternVincenti: [], noteAi: "Gara vinta. Categoria OS28 Lombardia importo €320000. Offerta tecnica eccellente.", createdAt: ago(45) },
    { id: "demo-4", garaId: null, cig: "DEMO004", titoloGara: "Manutenzione scuole OG1 Piemonte", tipoAnalisi: "chat", esito: "persa", ribassoOfferto: 22.1, patternVincenti: [], noteAn: "Gara persa. OG1 Piemonte importo €180000. Ribasso aggressivo. Margine basso insufficiente.", createdAt: ago(60) } as unknown as StoricoGaraAiEntry,
    { id: "demo-5", garaId: null, cig: "DEMO005", titoloGara: "Verde urbano OS24 Lombardia", tipoAnalisi: "bid_no_bid", esito: "vinta", ribassoOfferto: 9.5, patternVincenti: [], noteAi: "Gara vinta. OS24 Lombardia importo €650000. Ottima performance.", createdAt: ago(75) },
    { id: "demo-6", garaId: null, cig: "DEMO006", titoloGara: "Consolidamento frane OG4 Toscana", tipoAnalisi: "post_gara_forensics", esito: "persa", ribassoOfferto: 15.0, patternVincenti: [], noteAi: "Gara persa. OG4 Toscana importo €1200000. Fit basso profilo. Gap SOA classifica insufficiente.", createdAt: ago(90) },
    { id: "demo-7", garaId: null, cig: "DEMO007", titoloGara: "Impianti elettrici OS30 Veneto", tipoAnalisi: "bid_pricing", esito: "vinta", ribassoOfferto: 11.3, patternVincenti: [], noteAi: "Gara vinta. OS30 Veneto importo €290000. Buon margine.", createdAt: ago(120) },
    { id: "demo-8", garaId: null, cig: "DEMO008", titoloGara: "Manutenzione strade OG3 Lombardia", tipoAnalisi: "chat", esito: "persa", ribassoOfferto: 19.8, patternVincenti: [], noteAi: "Gara persa. OG3 Lombardia importo €3500000. Rischio operativo alto. Documentazione mancante allegati.", createdAt: ago(150) },
    { id: "demo-9", garaId: null, cig: "DEMO009", titoloGara: "Coperture edifici OG6 Piemonte", tipoAnalisi: "bid_no_bid", esito: "vinta", ribassoOfferto: 13.2, patternVincenti: [], noteAi: "Gara vinta. OG6 Piemonte importo €520000. Performance solida.", createdAt: ago(180) },
    { id: "demo-10", garaId: null, cig: "DEMO010", titoloGara: "Fognature OG6 Lazio", tipoAnalisi: "post_gara_forensics", esito: "persa", ribassoOfferto: 16.5, patternVincenti: [], noteAi: "Gara persa. OG6 Lazio importo €4200000. Scadenza mancata tardiva. Ente difficile restrittivo.", createdAt: ago(200) },
  ];
}

// ─── Main function ────────────────────────────────────────────────────────────

export function computeHistoricalAnalytics(
  entries: StoricoGaraAiEntry[]
): HistoricalAnalytics {
  const isDemoMode = entries.filter((e) => e.esito != null).length < 3;
  const data = isDemoMode ? buildDemoEntries() : entries;

  const kpis = computeKPIs(data);

  const byCategoria = winRateByKey(data, (e) =>
    extractCategoria(`${e.titoloGara} ${e.noteAi}`)
  );
  const byRegione = winRateByKey(data, (e) =>
    extractRegione(`${e.titoloGara} ${e.noteAi}`)
  );
  const byFascia = winRateByKey(data, (e) =>
    fasciaImporto(extractImporto(`${e.titoloGara} ${e.noteAi}`))
  );

  const categoriaRanking = buildCategoriaRanking(data);
  const topCategorie = categoriaRanking.slice(0, 5);
  const bottomCategorie = categoriaRanking.length > 5
    ? categoriaRanking.slice(-Math.min(3, categoriaRanking.length)).reverse()
    : [];

  const erroriRicorrenti = detectErrors(data);
  const trend = buildTrend(data);

  const insights = generateInsights(kpis, byCategoria, byRegione, byFascia);
  const raccomandazioni = generateRaccomandazioni(kpis, byCategoria, byRegione, byFascia, erroriRicorrenti);

  return {
    kpis,
    winRateByCategoria: byCategoria,
    winRateByRegione: byRegione,
    winRateByFascia: byFascia,
    topCategorie,
    bottomCategorie,
    erroriRicorrenti,
    insights,
    raccomandazioni,
    trend,
    isDemoMode,
  };
}
