import type { ProfiloImpresaContext } from "../src/types/database";
import type { ChatAttachment, TenderDocument } from "../src/types";

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatRequestBody {
  message: string;
  model?: string;
  chatMode?: "general" | "tender" | "offer_preparation";
  tender?: TenderDocument | null;
  profilo?: ProfiloImpresaContext | null;
  history?: ChatHistoryTurn[];
  attachments?: Pick<ChatAttachment, "name" | "size" | "type">[];
  connectorsAddendum?: string;
  catalogSummary?: unknown;
  storicoGare?: unknown[];
}

export interface ChatResponseBody {
  text: string;
  model: string;
  usedFallback?: boolean;
}
