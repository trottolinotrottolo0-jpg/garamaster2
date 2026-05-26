import { getSupabaseClient } from "../lib/supabase/client";
import {
  entriesToPromptItems,
  inferPatternVincenti,
  mapStoricoRow,
  type StoricoGaraAiEntry,
  type StoricoGaraEsito,
  type StoricoGaraTipoAnalisi,
} from "../lib/storicoGare";
import type { StoricoGaraAiRow } from "../types/storicoGare";
import { resolveGaraUuid } from "./conversazioneService";

export async function listStoricoGareAi(
  userId: string,
  limit = 50
): Promise<StoricoGaraAiEntry[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("storico_gare_ai")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[StoricoGare] list:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapStoricoRow(row as StoricoGaraAiRow));
}

export async function fetchStoricoForPrompt(userId: string): Promise<unknown[]> {
  const entries = await listStoricoGareAi(userId, 40);
  return entriesToPromptItems(entries);
}

export async function saveStoricoAnalisi(params: {
  userId: string;
  tenderId?: string | null;
  cig: string;
  titoloGara: string;
  tipoAnalisi?: StoricoGaraTipoAnalisi;
  esito?: StoricoGaraEsito;
  ribassoOfferto?: number | null;
  noteAi: string;
  patternVincenti?: string[];
}): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const garaId = params.tenderId ? resolveGaraUuid(params.tenderId) : null;

  let patterns = params.patternVincenti ?? [];
  if (!patterns.length) {
    const existing = await listStoricoGareAi(params.userId, 30);
    patterns = inferPatternVincenti(existing);
  }

  const { data, error } = await supabase
    .from("storico_gare_ai")
    .insert({
      user_id: params.userId,
      gara_id: garaId,
      cig: params.cig,
      titolo_gara: params.titoloGara,
      tipo_analisi: params.tipoAnalisi ?? "chat",
      esito: params.esito ?? null,
      ribasso_offerto: params.ribassoOfferto ?? null,
      pattern_vincenti: patterns,
      note_ai: params.noteAi.slice(0, 12000),
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[StoricoGare] save:", error.message);
    return null;
  }

  console.log("[StoricoGare] Analisi salvata:", {
    id: data?.id,
    cig: params.cig,
    tipo: params.tipoAnalisi,
  });

  return data?.id ?? null;
}

export async function updateStoricoEsito(
  id: string,
  updates: {
    esito?: StoricoGaraEsito;
    ribassoOfferto?: number | null;
    patternVincenti?: string[];
    noteAi?: string;
    tipoAnalisi?: StoricoGaraTipoAnalisi;
  }
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const payload: Record<string, unknown> = {};
  if (updates.esito !== undefined) payload.esito = updates.esito;
  if (updates.ribassoOfferto !== undefined) payload.ribasso_offerto = updates.ribassoOfferto;
  if (updates.patternVincenti !== undefined) payload.pattern_vincenti = updates.patternVincenti;
  if (updates.noteAi !== undefined) payload.note_ai = updates.noteAi.slice(0, 12000);
  if (updates.tipoAnalisi !== undefined) payload.tipo_analisi = updates.tipoAnalisi;

  const { error } = await supabase.from("storico_gare_ai").update(payload).eq("id", id);

  if (error) {
    console.warn("[StoricoGare] update:", error.message);
    return false;
  }
  return true;
}

export async function savePostGaraForensicsResult(params: {
  storicoId: string;
  userId: string;
  esito: "vinta" | "persa";
  ribassoVincitore: number | null;
  noteAi: string;
  patternVincenti?: string[];
}): Promise<boolean> {
  let patterns = params.patternVincenti ?? [];
  if (!patterns.length) {
    const existing = await listStoricoGareAi(params.userId, 40);
    patterns = inferPatternVincenti(existing);
  }

  return updateStoricoEsito(params.storicoId, {
    esito: params.esito,
    ribassoOfferto: params.ribassoVincitore,
    noteAi: params.noteAi,
    patternVincenti: patterns,
    tipoAnalisi: "post_gara_forensics",
  });
}

export async function deleteStoricoEntry(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { error } = await supabase.from("storico_gare_ai").delete().eq("id", id);
  return !error;
}
