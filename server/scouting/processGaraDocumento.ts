import { parseDisciplinarePdf } from "../parseDisciplinare";
import { getAdminClient } from "./adminClient";
import { downloadDisciplinarePdf } from "./downloadDisciplinare";
import { uploadDisciplinarePdf } from "./garaDocumentiStorage";
import type { GaraDocumentoProcessResult } from "./documentTypes";

type GaraAnacRow = {
  id: string;
  cig?: string | null;
  url_disciplinare?: string | null;
  titolo?: string | null;
};

export async function processGaraDocumento(params: {
  gareAnacId: string;
  pdfBase64?: string;
  fileName?: string;
  sourceUrl?: string;
  skipParse?: boolean;
}): Promise<GaraDocumentoProcessResult> {
  const supabase = getAdminClient();
  const warnings: string[] = [];

  const { data: gara, error: garaError } = await supabase
    .from("gare_anac")
    .select("id, cig, url_disciplinare, titolo")
    .eq("id", params.gareAnacId)
    .maybeSingle();

  if (garaError || !gara) {
    throw new Error(garaError?.message ?? "Gara ANAC non trovata.");
  }

  const row = gara as GaraAnacRow;
  let pdfBase64 = params.pdfBase64?.trim();
  const sourceUrl = params.sourceUrl?.trim() || row.url_disciplinare?.trim() || undefined;

  if (!pdfBase64 && sourceUrl) {
    try {
      pdfBase64 = await downloadDisciplinarePdf(sourceUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download fallito";
      throw new Error(message);
    }
  }

  if (!pdfBase64) {
    throw new Error(
      "Nessun PDF disponibile: carica un file o configura url_disciplinare sulla gara."
    );
  }

  const cig = row.cig ? String(row.cig) : params.gareAnacId.slice(0, 8);
  const fileName = params.fileName?.trim() || `disciplinare-${cig}.pdf`;

  let storagePath: string | undefined;
  try {
    storagePath = await uploadDisciplinarePdf({
      gareAnacId: params.gareAnacId,
      pdfBase64,
      fileName,
    });
  } catch (err) {
    warnings.push(err instanceof Error ? err.message : "Storage non disponibile");
  }

  let parseResult: Record<string, unknown> | null = null;
  let parsedAt: string | null = null;
  let status: string = storagePath ? "stored" : "pending";

  if (!params.skipParse) {
    const parsed = await parseDisciplinarePdf({
      pdfBase64,
      fileName,
      mimeType: "application/pdf",
    });
    parseResult = parsed as unknown as Record<string, unknown>;
    parsedAt = new Date().toISOString();
    status = "parsed";
  }

  const payload = {
    gare_anac_id: params.gareAnacId,
    tipo: "disciplinare",
    titolo: row.titolo ? String(row.titolo) : fileName,
    url_esterna: sourceUrl ?? null,
    storage_path: storagePath ?? null,
    parsed_at: parsedAt,
    parse_result: parseResult,
    parse_error: null,
    status,
  };

  const { data: existing } = await supabase
    .from("gare_documenti")
    .select("id")
    .eq("gare_anac_id", params.gareAnacId)
    .eq("tipo", "disciplinare")
    .maybeSingle();

  let documentId: string;
  if (existing?.id) {
    const { data: updated, error } = await supabase
      .from("gare_documenti")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error(`Aggiornamento gare_documenti fallito: ${error.message}`);
    documentId = String(updated.id);
  } else {
    const { data: inserted, error } = await supabase
      .from("gare_documenti")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(`Inserimento gare_documenti fallito: ${error.message}`);
    documentId = String(inserted.id);
  }

  return {
    documentId,
    gareAnacId: params.gareAnacId,
    parsed: Boolean(parsedAt),
    storagePath,
    warnings,
  };
}
