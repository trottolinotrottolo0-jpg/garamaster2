import { getSupabaseClient } from "../lib/supabase/client";
import {
  buildAutocompilazioneFromProfilo,
  buildDefaultPreparationSeeds,
  derivePracticeStato,
} from "../lib/tenderPreparationEngine";
import type { ProfiloImpresaContext } from "../types/database";
import type { TenderDocument } from "../types";
import type {
  TenderAutocompilazione,
  TenderChecklistItemRow,
  TenderChecklistStato,
  TenderDocumentRow,
  TenderDocumentStato,
  TenderPracticeRow,
  TenderPracticeStato,
  TenderPreparationBundle,
} from "../types/tenderPreparation";

const BUCKET = "tender-practice-files";

function parseAutocompilazione(raw: unknown): TenderAutocompilazione {
  if (!raw || typeof raw !== "object") return {};
  return raw as TenderAutocompilazione;
}

/** Risolve o crea riga `gare` per un tender catalogo. */
export async function ensureGaraIdForTender(
  userId: string,
  tender: TenderDocument
): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase non configurato");

  if (tender.id.startsWith("gare-")) {
    return tender.id.replace(/^gare-/, "");
  }

  const { data: existing } = await supabase
    .from("gare")
    .select("id")
    .eq("user_id", userId)
    .eq("cig", tender.cig)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const { data: inserted, error } = await supabase
    .from("gare")
    .insert({
      user_id: userId,
      cig: tender.cig,
      titolo: tender.title,
      regione: tender.region,
      categoria_soa: tender.category,
      stato_pratica: "In preparazione",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Impossibile creare gara utente: ${error.message}`);
  return String(inserted.id);
}

export async function fetchPracticeBundle(
  userId: string,
  practiceId: string
): Promise<TenderPreparationBundle | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: practice, error } = await supabase
    .from("tender_practices")
    .select("*")
    .eq("id", practiceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !practice) return null;

  const [docsRes, checkRes] = await Promise.all([
    supabase
      .from("tender_documents")
      .select("*")
      .eq("practice_id", practiceId)
      .eq("user_id", userId)
      .order("ordine", { ascending: true }),
    supabase
      .from("tender_checklist_items")
      .select("*")
      .eq("practice_id", practiceId)
      .eq("user_id", userId)
      .order("ordine", { ascending: true }),
  ]);

  return {
    practice: {
      ...(practice as TenderPracticeRow),
      autocompilazione: parseAutocompilazione(practice.autocompilazione),
    },
    documents: (docsRes.data ?? []) as TenderDocumentRow[],
    checklist: (checkRes.data ?? []) as TenderChecklistItemRow[],
  };
}

export async function getOrCreatePractice(
  userId: string,
  tender: TenderDocument,
  profilo: ProfiloImpresaContext | null
): Promise<TenderPreparationBundle> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase non configurato");

  const garaId = await ensureGaraIdForTender(userId, tender);

  const { data: existing } = await supabase
    .from("tender_practices")
    .select("*")
    .eq("user_id", userId)
    .eq("gara_id", garaId)
    .maybeSingle();

  if (existing?.id) {
    const bundle = await fetchPracticeBundle(userId, String(existing.id));
    if (bundle) return bundle;
  }

  const autocompilazione = buildAutocompilazioneFromProfilo(profilo);
  const { data: practice, error: pErr } = await supabase
    .from("tender_practices")
    .insert({
      user_id: userId,
      gara_id: garaId,
      profilo_impresa_id: profilo?.id ?? null,
      stato: "DA_ANALIZZARE",
      autocompilazione,
    })
    .select("*")
    .single();

  if (pErr) throw new Error(`Errore creazione pratica: ${pErr.message}`);

  const practiceId = String(practice.id);
  const seeds = buildDefaultPreparationSeeds(tender, profilo);

  const docRows = seeds.documents.map((d) => ({
    practice_id: practiceId,
    user_id: userId,
    categoria: d.categoria,
    nome: d.nome,
    stato: "MANCANTE" as TenderDocumentStato,
    obbligatorio: d.obbligatorio !== false,
    note: d.note ?? null,
    ordine: d.ordine,
  }));

  const checkRows = seeds.checklist.map((c) => ({
    practice_id: practiceId,
    user_id: userId,
    busta: c.busta,
    titolo: c.titolo,
    stato: "TODO" as TenderChecklistStato,
    obbligatorio: c.obbligatorio !== false,
    note: c.note ?? null,
    ordine: c.ordine,
  }));

  await supabase.from("tender_documents").insert(docRows);
  await supabase.from("tender_checklist_items").insert(checkRows);

  await supabase
    .from("gare")
    .update({ stato_pratica: "In preparazione" })
    .eq("id", garaId)
    .eq("user_id", userId);

  const bundle = await fetchPracticeBundle(userId, practiceId);
  if (!bundle) throw new Error("Pratica non caricata dopo creazione");
  return bundle;
}

export async function syncPracticeStato(
  userId: string,
  bundle: TenderPreparationBundle,
  manualInviata = false
): Promise<TenderPracticeStato> {
  const supabase = getSupabaseClient();
  if (!supabase) return bundle.practice.stato;

  const next = derivePracticeStato(
    bundle.practice.stato,
    bundle.documents,
    bundle.checklist,
    manualInviata
  );

  if (next !== bundle.practice.stato) {
    await supabase
      .from("tender_practices")
      .update({ stato: next })
      .eq("id", bundle.practice.id)
      .eq("user_id", userId);

    const statoGara =
      next === "INVIATA"
        ? "Inviata"
        : next === "PRONTA"
          ? "Pronta"
          : next === "DOCUMENTI_MANCANTI"
            ? "Documenti mancanti"
            : "In preparazione";

    await supabase
      .from("gare")
      .update({ stato_pratica: statoGara })
      .eq("id", bundle.practice.gara_id)
      .eq("user_id", userId);
  }

  return next;
}

export async function updateDocumentStato(
  userId: string,
  documentId: string,
  stato: TenderDocumentStato
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("tender_documents")
    .update({ stato })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function updateChecklistStato(
  userId: string,
  itemId: string,
  stato: TenderChecklistStato
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("tender_checklist_items")
    .update({ stato })
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

export async function uploadPracticeDocument(
  userId: string,
  practiceId: string,
  documentId: string,
  file: File
): Promise<{ file_url: string; file_name: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase non configurato");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${userId}/${practiceId}/${documentId}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });

  if (upErr) {
    throw new Error(
      upErr.message.includes("bucket")
        ? `Bucket "${BUCKET}" mancante. Esegui supabase/solo-guided-tender-preparation.sql`
        : upErr.message
    );
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24);
  const file_url = signed?.signedUrl ?? storagePath;

  const { error: dbErr } = await supabase
    .from("tender_documents")
    .update({
      stato: "CARICATO",
      file_url,
      file_name: file.name,
      storage_path: storagePath,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (dbErr) throw new Error(dbErr.message);

  return { file_url, file_name: file.name };
}

export async function markPracticeInviata(
  userId: string,
  practiceId: string
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  await supabase
    .from("tender_practices")
    .update({ stato: "INVIATA" })
    .eq("id", practiceId)
    .eq("user_id", userId);

  const { data: practice } = await supabase
    .from("tender_practices")
    .select("gara_id")
    .eq("id", practiceId)
    .eq("user_id", userId)
    .single();

  if (practice?.gara_id) {
    await supabase
      .from("gare")
      .update({ stato_pratica: "Inviata" })
      .eq("id", practice.gara_id)
      .eq("user_id", userId);
  }
}

export async function mergeAiSuggestionsIntoPractice(
  userId: string,
  practiceId: string,
  suggestions: import("../types/tenderPreparation").TenderPreparationSuggestResult
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data: existingDocs } = await supabase
    .from("tender_documents")
    .select("nome")
    .eq("practice_id", practiceId)
    .eq("user_id", userId);

  const names = new Set((existingDocs ?? []).map((d) => String(d.nome).toLowerCase()));

  const newDocs = suggestions.documents
    .filter((d) => !names.has(d.nome.toLowerCase()))
    .map((d, i) => ({
      practice_id: practiceId,
      user_id: userId,
      categoria: d.categoria,
      nome: d.nome,
      stato: "MANCANTE" as TenderDocumentStato,
      obbligatorio: d.obbligatorio !== false,
      note: d.note ?? null,
      ordine: 200 + i,
    }));

  if (newDocs.length) {
    await supabase.from("tender_documents").insert(newDocs);
  }

  const { data: existingCheck } = await supabase
    .from("tender_checklist_items")
    .select("titolo, busta")
    .eq("practice_id", practiceId)
    .eq("user_id", userId);

  const checkKeys = new Set(
    (existingCheck ?? []).map((c) => `${c.busta}:${String(c.titolo).toLowerCase()}`)
  );

  const newCheck = suggestions.checklist
    .filter((c) => !checkKeys.has(`${c.busta}:${c.titolo.toLowerCase()}`))
    .map((c, i) => ({
      practice_id: practiceId,
      user_id: userId,
      busta: c.busta,
      titolo: c.titolo,
      stato: "TODO" as TenderChecklistStato,
      obbligatorio: c.obbligatorio !== false,
      note: c.note ?? null,
      ordine: 200 + i,
    }));

  if (newCheck.length) {
    await supabase.from("tender_checklist_items").insert(newCheck);
  }
}
