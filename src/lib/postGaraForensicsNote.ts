import type { StoricoGaraEsito } from "../types/storicoGare";
import type { PostGaraForensicsFormData } from "./postGaraForensicsApi";

// ─── Structured forensics types (#18) ────────────────────────────────────────

export type ForensicsTag =
  | "DOCUMENTAZIONE"
  | "RIBASSO"
  | "FIT"
  | "TIMING"
  | "OFFERTA_TECNICA"
  | "RISCHIO"
  | "CAPACITA"
  | "SOA"
  | "PREZZO"
  | "CONCORRENZA"
  | "REQUISITI";

export interface CausaProbabile {
  categoria: string;
  etichetta: string;
  score: number; // 0-100
}

export interface ForensicsStructured {
  riepilogoEsito: string;
  causeProbabili: CausaProbabile[];
  tagApprendimento: ForensicsTag[];
  lezioniApprese: string[];
  azioniCorrettive: string[];
  cosaContinuare: string[];
  cosaSmettere: string[];
  cosaMigliorare: string[];
  modelUpdate: {
    ribassoMin?: number;
    ribassoMax?: number;
    categorieConsigliate: string[];
    regioniConsigliate: string[];
    note: string;
  };
}

// ─── Cause detection ──────────────────────────────────────────────────────────

const CAUSE_PATTERNS: { categoria: string; etichetta: string; regex: RegExp }[] = [
  { categoria: "PREZZO",         etichetta: "Prezzo / Ribasso",        regex: /ribasso|prezzo|economico|offerta.econ/i },
  { categoria: "DOCUMENTAZIONE", etichetta: "Documentazione",          regex: /document|allegat|dgue|mancant|carenza.doc/i },
  { categoria: "FIT",            etichetta: "Fit con il profilo",       regex: /fit|profilo.impresa|coerenz|aderenz/i },
  { categoria: "SOA",            etichetta: "Classifica SOA",           regex: /SOA|classifica|categori[ae].SOA/i },
  { categoria: "TEMPI",          etichetta: "Timing / Scadenze",        regex: /scadenz|tempi|tardiv|ritardo/i },
  { categoria: "CAPACITA",       etichetta: "Capacità operativa",       regex: /capacit[àa]|organizzativ|risorse|squadr/i },
  { categoria: "RISCHIO",        etichetta: "Rischio",                  regex: /rischio|penali|garanzi/i },
  { categoria: "CONCORRENZA",    etichetta: "Concorrenza",              regex: /concorren|aggiudicatar|competitor|operatore/i },
  { categoria: "REQUISITI",      etichetta: "Requisiti speciali",       regex: /requisit|qualificaz|esperienza.pregressa/i },
  { categoria: "OFFERTA_TECNICA",etichetta: "Offerta tecnica",          regex: /offerta.tecnica|punteggio.tecnico|qualit[àa].tecnica|OEPV/i },
];

function extractCause(text: string, esito: "vinta" | "persa"): CausaProbabile[] {
  const lower = text.toLowerCase();
  const results: CausaProbabile[] = [];

  for (const { categoria, etichetta, regex } of CAUSE_PATTERNS) {
    const matches = (text.match(new RegExp(regex.source, "gi")) ?? []).length;
    if (matches === 0) continue;
    // rough score: more mentions = higher probability
    const raw = Math.min(95, 25 + matches * 18);
    // for "vinta" flip the framing: higher score = more impactful for victory
    results.push({ categoria, etichetta, score: raw });
  }

  if (!results.length) {
    // fallback generic
    results.push({ categoria: "PREZZO", etichetta: "Prezzo / Ribasso", score: esito === "persa" ? 60 : 40 });
    results.push({ categoria: "OFFERTA_TECNICA", etichetta: "Offerta tecnica", score: 35 });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 6);
}

function extractTags(cause: CausaProbabile[]): ForensicsTag[] {
  const TAG_MAP: Record<string, ForensicsTag> = {
    PREZZO: "RIBASSO",
    DOCUMENTAZIONE: "DOCUMENTAZIONE",
    FIT: "FIT",
    SOA: "SOA",
    TEMPI: "TIMING",
    CAPACITA: "CAPACITA",
    RISCHIO: "RISCHIO",
    CONCORRENZA: "CONCORRENZA",
    REQUISITI: "REQUISITI",
    OFFERTA_TECNICA: "OFFERTA_TECNICA",
  };
  return cause
    .filter((c) => c.score >= 30)
    .map((c) => TAG_MAP[c.categoria])
    .filter((t): t is ForensicsTag => t != null);
}

// ─── Section extraction ───────────────────────────────────────────────────────

function extractSection(text: string, patterns: RegExp[]): string[] {
  const lines = text.split("\n");
  const items: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (inSection) inSection = false; continue; }

    const isHeader = patterns.some((p) => p.test(t));
    if (isHeader) { inSection = true; continue; }

    if (inSection) {
      if (/^#{1,4}\s/.test(t) && !isHeader) { inSection = false; continue; }
      if (/^[-*•]\s+/.test(t)) items.push(t.replace(/^[-*•]\s+/, "").trim());
      else if (/^\d+[.)]\s+/.test(t)) items.push(t.replace(/^\d+[.)]\s+/, "").trim());
      else if (t.length > 20 && !t.startsWith("#")) items.push(t);
    }
  }
  return items.filter((s) => s.length > 8).slice(0, 6);
}

function extractRiepilogo(text: string): string {
  const firstPara = text
    .split("\n\n")
    .find((p) => p.trim().length > 30 && !p.trim().startsWith("#"));
  return (firstPara ?? "").trim().slice(0, 400);
}

function extractModelUpdate(
  text: string
): ForensicsStructured["modelUpdate"] {
  const ribassoMatch = text.match(/ribasso.{0,30}(\d{1,2}(?:[.,]\d)?)\s*%.*?(\d{1,2}(?:[.,]\d)?)\s*%/i);
  const ribassoMin = ribassoMatch ? parseFloat(ribassoMatch[1].replace(",", ".")) : undefined;
  const ribassoMax = ribassoMatch ? parseFloat(ribassoMatch[2].replace(",", ".")) : undefined;

  const catMatches = [...text.matchAll(/\b(OG\d+[A-Z]?|OS\d+[A-Z]?)\b/gi)].map(
    (m) => m[1].toUpperCase()
  );
  const categorieConsigliate = [...new Set(catMatches)].slice(0, 4);

  const REGIONI = ["Lombardia","Lazio","Campania","Sicilia","Veneto","Piemonte",
    "Emilia-Romagna","Puglia","Toscana","Calabria","Sardegna","Liguria","Marche","Abruzzo"];
  const regioniConsigliate = REGIONI.filter((r) =>
    new RegExp(`\\b${r.split("'")[0]}\\b`, "i").test(text)
  ).slice(0, 3);

  const noteMatch = text.match(/(?:consiglio|raccomandazione)[^.]+\./i);
  return {
    ribassoMin: Number.isFinite(ribassoMin) ? ribassoMin : undefined,
    ribassoMax: Number.isFinite(ribassoMax) ? ribassoMax : undefined,
    categorieConsigliate,
    regioniConsigliate,
    note: noteMatch ? noteMatch[0].trim() : "",
  };
}

export function parseForensicsAnalysis(
  analisi: string,
  esito: "vinta" | "persa"
): ForensicsStructured {
  const causeProbabili = extractCause(analisi, esito);
  const tagApprendimento = extractTags(causeProbabili);
  const riepilogoEsito = extractRiepilogo(analisi);

  const lezioniApprese = extractSection(analisi, [
    /pattern da memorizzare|lezioni per lo storico|pattern vincen/i,
  ]);

  const azioniCorrettive = extractSection(analisi, [
    /azioni concrete|cosa fare|next step|prossima gara|azioni per la/i,
  ]);

  const funzionato = extractSection(analisi, [/cosa ha funzionato|punti di forza|aspetti positivi/i]);
  const nonFunzionato = extractSection(analisi, [/cosa non ha funzionato|punti deboli|criticità|errori/i]);

  const cosaContinuare = esito === "vinta" ? funzionato : [];
  const cosaSmettere = esito === "persa" ? nonFunzionato.slice(0, 3) : [];
  const cosaMigliorare = azioniCorrettive.slice(0, 4);

  const modelUpdate = extractModelUpdate(analisi);

  // Fallback lezioni from bullets at end
  if (!lezioniApprese.length) {
    const bullets = (analisi.match(/^[-*•]\s+.+$/gm) ?? []).slice(-4);
    for (const b of bullets) {
      const c = b.replace(/^[-*•]\s+/, "").trim();
      if (c.length > 15) lezioniApprese.push(c);
    }
  }

  return {
    riepilogoEsito,
    causeProbabili,
    tagApprendimento,
    lezioniApprese,
    azioniCorrettive,
    cosaContinuare,
    cosaSmettere,
    cosaMigliorare,
    modelUpdate,
  };
}

export function buildPostGaraForensicsNote(params: {
  esito: Exclude<StoricoGaraEsito, null | "non partecipato">;
  form: PostGaraForensicsFormData;
  analisiGemini: string;
  model: string;
}): string {
  const { esito, form, analisiGemini, model } = params;
  const esitoLabel = esito === "vinta" ? "Vinta" : "Persa";

  const operatorBlock = [
    "--- POST-GARA FORENSICS (operatore) ---",
    `Esito: ${esitoLabel}`,
    form.ribassoVincitore != null
      ? `Ribasso vincitore: ${form.ribassoVincitore}%`
      : "Ribasso vincitore: non indicato",
    `Motivazione: ${form.motivazione.trim() || "—"}`,
    `Note operative: ${form.noteOperative.trim() || "—"}`,
    "",
    "--- ANALISI GEMINI (Learning Loop) ---",
    `Modello: ${model}`,
    "",
    analisiGemini.trim(),
  ].join("\n");

  return operatorBlock.slice(0, 12000);
}

/** Estrae bullet "pattern" dalla chiusura dell'analisi Gemini */
export function extractPatternsFromForensics(analisi: string): string[] {
  const patterns: string[] = [];
  const lines = analisi.split("\n");
  let inPatterns = false;

  for (const line of lines) {
    const t = line.trim();
    if (/pattern da memorizzare|lezioni per lo storico|pattern vincent/i.test(t)) {
      inPatterns = true;
      continue;
    }
    if (inPatterns && /^[-*•]\s+/.test(t)) {
      patterns.push(t.replace(/^[-*•]\s+/, "").slice(0, 200));
    } else if (inPatterns && /^\d+[.)]\s+/.test(t)) {
      patterns.push(t.replace(/^\d+[.)]\s+/, "").slice(0, 200));
    }
  }

  if (patterns.length < 2) {
    const bullets = analisi.match(/^[-*•]\s+.+$/gm) ?? [];
    for (const b of bullets.slice(-4)) {
      const cleaned = b.replace(/^[-*•]\s+/, "").trim();
      if (cleaned.length > 15 && cleaned.length < 220) patterns.push(cleaned);
    }
  }

  return [...new Set(patterns)].slice(0, 5);
}
