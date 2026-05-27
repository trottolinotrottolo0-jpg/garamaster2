import { Buffer } from "node:buffer";
import { getAdminClient } from "./adminClient";

const DEFAULT_BUCKET = "gare-documenti";

function resolveBucket(): string {
  return process.env.SCOUTING_DOCUMENTS_BUCKET?.trim() || DEFAULT_BUCKET;
}

export async function uploadDisciplinarePdf(params: {
  gareAnacId: string;
  pdfBase64: string;
  fileName: string;
}): Promise<string | undefined> {
  if (process.env.SCOUTING_SKIP_STORAGE === "true") return undefined;

  const supabase = getAdminClient();
  const bucket = resolveBucket();
  const safeName = params.fileName.replace(/[^\w.-]+/g, "_").slice(0, 80);
  const storagePath = `${params.gareAnacId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(params.pdfBase64, "base64");

  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        `Bucket Storage "${bucket}" mancante. Esegui supabase/solo-scouting-fase3-fase4.sql o imposta SCOUTING_SKIP_STORAGE=true.`
      );
    }
    throw new Error(`Upload Storage fallito: ${error.message}`);
  }

  return `${bucket}/${storagePath}`;
}
