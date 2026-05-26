import { getSupabaseClient } from "../lib/supabase/client";
import { mapParseToGareInsert } from "../lib/disciplinareParseMapper";
import { mapRowToTender } from "../lib/supabase/mappers";
import type { ProfiloImpresaContext } from "../types/database";
import type { GaraRow } from "../types/database";
import type { DisciplinareParseResult } from "../types/disciplinareParse";
import type { TenderDocument } from "../types";

export async function saveParsedDisciplinareToGare(params: {
  userId: string;
  parse: DisciplinareParseResult;
  fileName: string;
  profilo?: ProfiloImpresaContext | null;
}): Promise<{ garaId: string; tender: TenderDocument }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase non configurato: impossibile salvare la gara.");
  }

  const row = mapParseToGareInsert(
    params.userId,
    params.parse,
    params.fileName,
    params.profilo
  );

  const { data, error } = await supabase
    .from("gare")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Salvataggio gara fallito: ${error.message}`);
  }

  const garaRow = data as GaraRow;
  const tender = mapRowToTender(garaRow, "gare");

  console.log("[DisciplinareParser] Gara salvata:", {
    id: garaRow.id,
    cig: garaRow.cig,
    titolo: garaRow.titolo,
  });

  return { garaId: garaRow.id, tender };
}
