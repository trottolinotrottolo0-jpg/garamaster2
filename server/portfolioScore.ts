import { formatGeminiError } from "./geminiChat";
import { deepseekChatCompletion } from "./deepseekChat";
import type {
  PortfolioScoreRequestBody,
  PortfolioScoreResponseBody,
} from "./portfolioScoreTypes";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreToLivello(score: number): PortfolioScoreResponseBody["livello"] {
  if (score >= 70) return "Competitivo";
  if (score >= 40) return "Migliorabile";
  return "Critico";
}

function buildPrompt(body: PortfolioScoreRequestBody): string {
  const tendersSummary = body.tenders.slice(0, 60).map((t) => ({
    cig: t.cig,
    titolo: t.title,
    regione: t.region,
    importo: t.value,
    categoria: t.category,
  }));

  return `Sei un analista di portfolio gare d'appalto pubblico per imprese edili italiane (D.Lgs. 36/2023).

Calcola il TENDER PORTFOLIO SCORE (0-100): quanto il portfolio gare disponibile è allineato e competitivo rispetto al profilo impresa.

Criteri (peso indicativo):
1. SOA possedute vs categorie richieste dalle gare disponibili (35%)
2. Regioni operative vs regioni delle gare (25%)
3. Importi target impresa vs importi gare (25%)
4. Storico gare vinte/perse e win rate (15%)

PROFILO IMPRESA (Supabase):
${JSON.stringify(body.profilo ?? null, null, 2)}

PROFILO OPERATIVO DETTAGLIATO (se presente):
${JSON.stringify(body.companyProfile ?? null, null, 2)}

GARE DISPONIBILI NEL CATALOGO (${tendersSummary.length}):
${JSON.stringify(tendersSummary, null, 2)}

STORICO GARE IMPRESA (vinte/perse/note):
${JSON.stringify(body.gareStorico ?? [], null, 2)}

Rispondi SOLO con JSON valido, senza markdown:
{
  "score": number (0-100 intero),
  "sintesi": "string — 2 frasi sul livello di competitività del portfolio",
  "fattori": {
    "soa": "string — valutazione SOA vs gare",
    "regioni": "string — copertura geografica",
    "importi": "string — allineamento importi",
    "storico": "string — storico vinte/perse o dati mancanti"
  },
  "perche": "string — motivazione del punteggio",
  "datiUsati": "string — campi effettivamente usati",
  "verifica": "string — cosa verificare manualmente",
  "confidenza": "Alto" | "Medio" | "Basso"
}`;
}

export async function generatePortfolioScore(
  body: PortfolioScoreRequestBody
): Promise<PortfolioScoreResponseBody> {
  if (!body.tenders?.length) {
    throw new Error("Nessuna gara nel catalogo per calcolare il portfolio score.");
  }

  const prompt = buildPrompt(body);
  const { text } = await deepseekChatCompletion({
    prompt,
    model: process.env.OPENROUTER_MODEL,
    temperature: 0.25,
    maxTokens: 2048,
  });

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Risposta portfolio score non valida.");
  }

  const score = clampScore(Number(parsed.score));
  const fattori = parsed.fattori as PortfolioScoreResponseBody["fattori"] | undefined;

  return {
    score,
    livello: scoreToLivello(score),
    sintesi: String(parsed.sintesi ?? "Valutazione portfolio completata."),
    fattori: {
      soa: String(fattori?.soa ?? "—"),
      regioni: String(fattori?.regioni ?? "—"),
      importi: String(fattori?.importi ?? "—"),
      storico: String(fattori?.storico ?? "—"),
    },
    perche: String(parsed.perche ?? ""),
    datiUsati: String(parsed.datiUsati ?? ""),
    verifica: String(parsed.verifica ?? ""),
    confidenza: String(parsed.confidenza ?? "Medio"),
  };
}

export function computeLocalPortfolioScore(
  body: PortfolioScoreRequestBody
): PortfolioScoreResponseBody {
  const profiloSoa = (body.profilo?.soa ?? "").toUpperCase();
  const soaCodes = profiloSoa.match(/\b(OG\d{1,2}|OS\d{1,2}(?:-[AB])?)\b/gi) ?? [];
  const regioni = (body.profilo?.regioni ?? []).map((r) => r.toLowerCase());

  const sample = body.tenders.slice(0, 80);
  let soaMatch = 0;
  let regionMatch = 0;

  for (const t of sample) {
    const cat = `${t.category} ${t.title}`.toUpperCase();
    if (soaCodes.length === 0 || soaCodes.some((code) => cat.includes(code.toUpperCase()))) {
      soaMatch++;
    }
    if (
      !regioni.length ||
      regioni.some((r) => t.region.toLowerCase().includes(r) || r.includes(t.region.toLowerCase()))
    ) {
      regionMatch++;
    }
  }

  const n = Math.max(1, sample.length);
  const score = clampScore(Math.round((soaMatch / n) * 45 + (regionMatch / n) * 35 + 12));

  return {
    score,
    livello: scoreToLivello(score),
    sintesi:
      "[Stima locale — Gemini non disponibile] Valutazione euristica su SOA, regioni e catalogo gare caricato.",
    fattori: {
      soa: `${soaMatch}/${n} gare con categoria compatibile al profilo SOA`,
      regioni: `${regionMatch}/${n} gare nelle regioni operative`,
      importi: "Non valutato in modalità locale — verifica target importi in profilo",
      storico: body.gareStorico?.length
        ? `${body.gareStorico.length} record storico considerati`
        : "Storico non disponibile",
    },
    perche: "Punteggio calcolato localmente per evitare interruzione del servizio.",
    datiUsati: "profilo.soa, profilo.regioni, catalogo tenders (campione)",
    verifica: "Ricalcola quando Gemini è disponibile per analisi completa.",
    confidenza: "Basso",
  };
}

export async function safeGeneratePortfolioScore(
  body: PortfolioScoreRequestBody
): Promise<PortfolioScoreResponseBody> {
  try {
    return await generatePortfolioScore(body);
  } catch (error) {
    const msg = formatGeminiError(error);
    if (/429|503|sovraccarico|UNAVAILABLE|non disponib|rate limit/i.test(msg)) {
      console.warn("[PortfolioScore] Fallback locale:", msg);
      return computeLocalPortfolioScore(body);
    }
    throw new Error(msg);
  }
}
