import type { StoricoGaraEsito } from "../types/storicoGare";
import type { PostGaraForensicsFormData } from "./postGaraForensicsApi";

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
