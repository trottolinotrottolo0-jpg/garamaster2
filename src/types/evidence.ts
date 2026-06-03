/** Feature #14 — Evidence & Explainability */

export type EvidenceOutputType =
  | "bid_no_bid"
  | "fit_score"
  | "red_flag"
  | "profitability"
  | "compliance"
  | "portfolio"
  | "capacity"
  | "pricing"
  | "chat"
  | string;

export type EvidenceSourceDocument =
  | "disciplinare"
  | "bando"
  | "capitolato"
  | "allegato"
  | "profilo_impresa"
  | "storico"
  | string;

export type EvidenceGraphNodeType =
  | "document"
  | "clause"
  | "rule"
  | "company_data"
  | "output";

export type EvidenceGraphEdgeType = "causes" | "references" | "contradicts";

/** Input da LLM o builder locale (pre-persist). */
export interface EvidenceItemInput {
  source_document?: EvidenceSourceDocument | null;
  source_reference?: string | null;
  source_text?: string | null;
  rule_triggered?: string | null;
  company_data_used?: Record<string, unknown> | null;
  conclusion?: string | null;
  confidence_score?: number | null;
  requires_human_review?: boolean | null;
  review_reason?: string | null;
}

export interface EvidenceGraphEdgeInput {
  from_node: EvidenceGraphNodeType;
  from_label: string;
  to_node: EvidenceGraphNodeType;
  to_label: string;
  edge_type?: EvidenceGraphEdgeType;
}

export interface EvidenceItemRow {
  id: string;
  user_id: string;
  gara_id: string | null;
  profilo_id: string | null;
  output_type: string;
  output_id: string | null;
  source_document: string | null;
  source_reference: string | null;
  source_text: string | null;
  rule_triggered: string | null;
  company_data_used: Record<string, unknown> | null;
  conclusion: string | null;
  confidence_score: number;
  requires_human_review: boolean;
  review_reason: string | null;
  human_reviewed: boolean;
  human_reviewed_at: string | null;
  created_at: string;
}

export interface EvidenceGraphEdgeRow {
  id: string;
  evidence_item_id: string;
  from_node: string;
  from_label: string;
  to_node: string;
  to_label: string;
  edge_type: string;
}

export interface EvidenceBundle {
  items: EvidenceItemRow[];
  edges: EvidenceGraphEdgeRow[];
}

export interface SaveEvidenceParams {
  userId: string;
  garaId?: string | null;
  profiloId?: string | null;
  outputType: EvidenceOutputType;
  outputId?: string | null;
  items: EvidenceItemInput[];
}
