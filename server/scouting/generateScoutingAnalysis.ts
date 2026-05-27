import { deepseekChatCompletion } from "../deepseekChat";
import type { ScoutingAnalysisInput, ScoutingAnalysisResult } from "./scoutingAnalysisTypes";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildPrompt(input: ScoutingAnalysisInput): string {
  return `Sei un analista di gare d'appalto pubblico italiane (D.Lgs. 36/2023) per imprese edili.

Valuta l'opportunità di partecipazione alla gara ANAC e produci un'analisi scouting strutturata.

GARA ANAC:
${JSON.stringify(
  {
    cig: input.cig,
    titolo: input.titolo,
    oggetto: input.oggetto,
    regione: input.regione,
    categoria: input.categoria,
    importo: input.importo,
    scadenza: input.dataScadenza,
    ente: input.ente,
  },
  null,
  2
)}

PROFILO IMPRESA (se disponibile):
${JSON.stringify(input.profilo ?? null, null, 2)}

ESTRATTO DISCIPLINARE (se parsato):
${JSON.stringify(input.parseSummary ?? null, null, 2)}

Rispondi SOLO con JSON valido, senza markdown:
{
  "score": number (0-100 intero — fit competitivo per l'impresa),
  "summary": "string — 2 frasi sintetiche sull'opportunità",
  "strategia": "string — azione consigliata (RTI, SOA, tempistiche)",
  "alert": "string — rischio o verifica urgente (penali, classifica, scadenza)",
  "confidenza": "Alto" | "Medio" | "Basso"
}`;
}

export async function generateScoutingAnalysis(
  input: ScoutingAnalysisInput
): Promise<ScoutingAnalysisResult> {
  const { text } = await deepseekChatCompletion({
    prompt: buildPrompt(input),
    model: process.env.OPENROUTER_MODEL,
    temperature: 0.3,
    maxTokens: 1200,
  });

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonMatch?.[0] ?? cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Risposta analisi scouting non valida (JSON atteso).");
  }

  return {
    score: clampScore(Number(raw.score ?? 50)),
    summary: String(raw.summary ?? "Opportunità da valutare manualmente."),
    strategia: String(raw.strategia ?? "Verificare requisiti SOA e scadenza."),
    alert: String(raw.alert ?? "Controllare disciplinare e penali."),
    confidenza:
      raw.confidenza === "Alto" || raw.confidenza === "Medio" || raw.confidenza === "Basso"
        ? raw.confidenza
        : "Medio",
  };
}
