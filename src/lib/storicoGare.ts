import type {
  StoricoGaraAiEntry,
  StoricoGaraAiRow,
  StoricoGaraEsito,
  StoricoGaraPromptItem,
  StoricoGaraTipoAnalisi,
} from "../types/storicoGare";

export function extractRibassoPercent(text: string): number | null {
  const match = text.match(/ribasso\s*(?:di|del|della)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
  if (match) return parseFloat(match[1].replace(",", "."));
  const pct = text.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:di\s*)?ribasso/i);
  if (pct) return parseFloat(pct[1].replace(",", "."));
  const alone = text.match(/\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  if (alone && /ribasso|offerta|economico/i.test(text)) {
    return parseFloat(alone[1].replace(",", "."));
  }
  return null;
}

export function mapStoricoRow(row: StoricoGaraAiRow): StoricoGaraAiEntry {
  const patterns = row.pattern_vincenti;
  let patternVincenti: string[] = [];
  if (Array.isArray(patterns)) {
    patternVincenti = patterns.map(String);
  } else if (typeof patterns === "string") {
    try {
      const parsed = JSON.parse(patterns);
      if (Array.isArray(parsed)) patternVincenti = parsed.map(String);
    } catch {
      patternVincenti = [];
    }
  }

  const esitoRaw = row.esito?.trim().toLowerCase();
  const esito: StoricoGaraEsito =
    esitoRaw === "vinta" || esitoRaw === "persa" || esitoRaw === "non partecipato"
      ? esitoRaw
      : null;

  return {
    id: row.id,
    garaId: row.gara_id ?? null,
    cig: row.cig ?? "N/D",
    titoloGara: row.titolo_gara ?? "Gara",
    tipoAnalisi: (row.tipo_analisi as StoricoGaraTipoAnalisi) ?? "chat",
    esito,
    ribassoOfferto:
      row.ribasso_offerto != null && row.ribasso_offerto !== ""
        ? Number(row.ribasso_offerto)
        : null,
    patternVincenti,
    noteAi: row.note_ai ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export function buildStoricoPromptBlock(entries: StoricoGaraPromptItem[]): string {
  if (!entries.length) {
    return `Storico gare precedenti: [] (nessun record — prima partecipazione tracciata)`;
  }

  return `Storico gare precedenti: ${JSON.stringify(entries, null, 2)}`;
}

export function entriesToPromptItems(entries: StoricoGaraAiEntry[]): StoricoGaraPromptItem[] {
  return entries.map((e) => ({
    cig: e.cig,
    titolo: e.titoloGara,
    esito: e.esito,
    ribassoOfferto: e.ribassoOfferto,
    tipoAnalisi: e.tipoAnalisi,
    patternVincenti: e.patternVincenti,
    sintesi: e.noteAi.slice(0, 600),
    data: e.createdAt.slice(0, 10),
  }));
}

export function inferPatternVincenti(entries: StoricoGaraAiEntry[]): string[] {
  const patterns: string[] = [];

  for (const e of entries) {
    if (e.tipoAnalisi === "post_gara_forensics" && e.patternVincenti.length) {
      patterns.push(...e.patternVincenti);
    }
  }

  const vinte = entries.filter((e) => e.esito === "vinta");
  const withRibasso = entries.filter((e) => e.ribassoOfferto != null);

  if (vinte.length >= 2) {
    const avgRibasso =
      vinte
        .filter((e) => e.ribassoOfferto != null)
        .reduce((s, e) => s + (e.ribassoOfferto ?? 0), 0) /
      Math.max(1, vinte.filter((e) => e.ribassoOfferto != null).length);
    if (!Number.isNaN(avgRibasso)) {
      patterns.push(`Ribasso medio su gare vinte: ~${avgRibasso.toFixed(1)}%`);
    }
  }

  if (withRibasso.length >= 3) {
    const ribassi = withRibasso.map((e) => e.ribassoOfferto!).sort((a, b) => a - b);
    patterns.push(`Range ribassi storici: ${ribassi[0]}% – ${ribassi[ribassi.length - 1]}%`);
  }

  const regioni = new Map<string, number>();
  for (const v of vinte) {
    const m = v.noteAi.match(/regione[:\s]+([A-Za-zÀ-ú\s]+)/i);
    if (m) regioni.set(m[1].trim(), (regioni.get(m[1].trim()) ?? 0) + 1);
  }
  const topRegione = [...regioni.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topRegione) {
    patterns.push(`Maggior successi in area: ${topRegione[0]}`);
  }

  return patterns.slice(0, 5);
}

export type { StoricoGaraAiEntry, StoricoGaraEsito, StoricoGaraTipoAnalisi };
