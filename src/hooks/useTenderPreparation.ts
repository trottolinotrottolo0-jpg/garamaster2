import { useCallback, useEffect, useMemo, useState } from "react";
import { computePracticeProgress } from "../lib/tenderPreparationEngine";
import { requestTenderPreparationSuggest } from "../lib/tenderPreparationApi";
import {
  fetchPracticeBundle,
  getOrCreatePractice,
  markPracticeInviata,
  mergeAiSuggestionsIntoPractice,
  syncPracticeStato,
  updateChecklistStato,
  updateDocumentStato,
  uploadPracticeDocument,
} from "../services/tenderPreparationService";
import type { ProfiloImpresaContext } from "../types/database";
import type { TenderDocument } from "../types";
import type {
  TenderChecklistStato,
  TenderDocumentStato,
  TenderPreparationBundle,
  TenderPreparationStep,
} from "../types/tenderPreparation";

export function useTenderPreparation(
  userId: string | undefined,
  tender: TenderDocument | null,
  profilo: ProfiloImpresaContext | null,
  open: boolean
) {
  const [bundle, setBundle] = useState<TenderPreparationBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<TenderPreparationStep>("panoramica");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTexts, setAiTexts] = useState<string[]>([]);
  const [aiCritical, setAiCritical] = useState<string[]>([]);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !tender) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrCreatePractice(userId, tender, profilo);
      const stato = await syncPracticeStato(userId, data);
      setBundle({ ...data, practice: { ...data.practice, stato } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento pratica");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [userId, tender, profilo]);

  useEffect(() => {
    if (open && userId && tender) {
      void load();
    }
  }, [open, load, userId, tender]);

  const progress = useMemo(
    () =>
      bundle
        ? computePracticeProgress(bundle.documents, bundle.checklist)
        : {
            percent: 0,
            documentsDone: 0,
            documentsTotal: 0,
            checklistDone: 0,
            checklistTotal: 0,
          },
    [bundle]
  );

  const refreshBundle = useCallback(async () => {
    if (!userId || !bundle?.practice.id) return;
    const data = await fetchPracticeBundle(userId, bundle.practice.id);
    if (!data) return;
    const stato = await syncPracticeStato(userId, data);
    setBundle({ ...data, practice: { ...data.practice, stato } });
  }, [userId, bundle?.practice.id]);

  const runAiSuggest = useCallback(async () => {
    if (!tender || !userId || !bundle) return;
    setAiLoading(true);
    setError(null);
    try {
      const result = await requestTenderPreparationSuggest({
        tender,
        profilo,
        existingDocuments: bundle.documents.map((d) => d.nome),
        existingChecklist: bundle.checklist.map((c) => `${c.busta}: ${c.titolo}`),
      });
      await mergeAiSuggestionsIntoPractice(userId, bundle.practice.id, result);
      setAiTexts(result.testiAmministrativi ?? []);
      setAiCritical(result.documentiMancantiCritici ?? []);
      await refreshBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI non disponibile");
    } finally {
      setAiLoading(false);
    }
  }, [tender, userId, bundle, profilo, refreshBundle]);

  const setDocumentStato = useCallback(
    async (documentId: string, stato: TenderDocumentStato) => {
      if (!userId) return;
      await updateDocumentStato(userId, documentId, stato);
      await refreshBundle();
    },
    [userId, refreshBundle]
  );

  const uploadDocument = useCallback(
    async (documentId: string, file: File) => {
      if (!userId || !bundle) return;
      setUploadingDocId(documentId);
      setError(null);
      try {
        await uploadPracticeDocument(userId, bundle.practice.id, documentId, file);
        await refreshBundle();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload fallito");
      } finally {
        setUploadingDocId(null);
      }
    },
    [userId, bundle, refreshBundle]
  );

  const setChecklistStato = useCallback(
    async (itemId: string, stato: TenderChecklistStato) => {
      if (!userId) return;
      await updateChecklistStato(userId, itemId, stato);
      await refreshBundle();
    },
    [userId, refreshBundle]
  );

  const markInviata = useCallback(async () => {
    if (!userId || !bundle) return;
    await markPracticeInviata(userId, bundle.practice.id);
    await refreshBundle();
  }, [userId, bundle, refreshBundle]);

  return {
    bundle,
    loading,
    error,
    step,
    setStep,
    progress,
    aiLoading,
    aiTexts,
    aiCritical,
    uploadingDocId,
    load,
    runAiSuggest,
    setDocumentStato,
    uploadDocument,
    setChecklistStato,
    markInviata,
    refreshBundle,
  };
}
