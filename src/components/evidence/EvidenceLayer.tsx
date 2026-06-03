import { useEffect, useRef } from "react";
import { useEvidence } from "../../hooks/useEvidence";
import type { EvidenceItemInput, EvidenceOutputType } from "../../types/evidence";
import { EvidencePanel } from "./EvidencePanel";

type EvidenceLayerProps = {
  userId?: string;
  garaId?: string | null;
  profiloId?: string | null;
  outputType: EvidenceOutputType;
  outputId?: string | null;
  inlineEvidence?: EvidenceItemInput[] | null;
  title?: string;
  compact?: boolean;
  defaultOpen?: boolean;
  anchorHrefBuilder?: (reference: string) => string | null;
};

/** Carica/salva evidenze su Supabase e mostra EvidencePanel. */
export function EvidenceLayer({
  userId,
  garaId,
  profiloId,
  outputType,
  outputId,
  inlineEvidence,
  title,
  compact,
  defaultOpen,
  anchorHrefBuilder,
}: EvidenceLayerProps) {
  const { items, edges, persist, markAsReviewed } = useEvidence(
    userId,
    outputType,
    outputId,
    garaId,
    inlineEvidence
  );

  const savedRef = useRef(false);

  useEffect(() => {
    if (!userId || !inlineEvidence?.length || savedRef.current) return;
    savedRef.current = true;
    void persist(inlineEvidence, { profiloId });
  }, [userId, inlineEvidence, persist, profiloId]);

  if (!items.length) return null;

  return (
    <EvidencePanel
      title={title}
      items={items}
      edges={edges}
      compact={compact}
      defaultOpen={defaultOpen}
      onMarkReviewed={userId ? (id) => markAsReviewed(id) : undefined}
      anchorHrefBuilder={anchorHrefBuilder}
    />
  );
}
