import { useCallback, useEffect, useState } from "react";
import {
  getEvidenceForOutput,
  markEvidenceAsReviewed,
  saveEvidenceItems,
} from "../services/evidenceService";
import type {
  EvidenceBundle,
  EvidenceItemInput,
  EvidenceItemRow,
  EvidenceOutputType,
} from "../types/evidence";

export function useEvidence(
  userId: string | undefined,
  outputType: EvidenceOutputType,
  outputId?: string | null,
  garaId?: string | null,
  inlineItems?: EvidenceItemInput[] | null
) {
  const [bundle, setBundle] = useState<EvidenceBundle>({ items: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getEvidenceForOutput(userId, outputType, outputId, garaId);
      setBundle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento evidenze");
    } finally {
      setLoading(false);
    }
  }, [userId, outputType, outputId, garaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (items: EvidenceItemInput[], opts?: { profiloId?: string | null }) => {
      if (!userId || !items.length) return [] as EvidenceItemRow[];
      setError(null);
      try {
        const saved = await saveEvidenceItems({
          userId,
          garaId,
          profiloId: opts?.profiloId,
          outputType,
          outputId,
          items,
        });
        await load();
        return saved;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore salvataggio evidenze");
        return [];
      }
    },
    [userId, garaId, outputType, outputId, load]
  );

  const markAsReviewed = useCallback(
    async (evidenceId: string) => {
      if (!userId) return false;
      const ok = await markEvidenceAsReviewed(userId, evidenceId);
      if (ok) await load();
      return ok;
    },
    [userId, load]
  );

  const displayItems: EvidenceItemRow[] | EvidenceItemInput[] =
    bundle.items.length > 0
      ? bundle.items
      : (inlineItems ?? []);

  const needsReview = displayItems.some(
    (i) =>
      ("requires_human_review" in i && i.requires_human_review) &&
      !("human_reviewed" in i && i.human_reviewed)
  );

  return {
    bundle,
    items: displayItems,
    edges: bundle.edges,
    loading,
    error,
    load,
    persist,
    markAsReviewed,
    needsReview,
  };
}
