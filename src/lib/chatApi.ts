import { buildConnectorsSystemAddendum } from "./internalConnectors";
import type { ProfiloImpresaContext } from "../types/database";
import type { ChatAttachment, Message, TenderDocument } from "../types";

export interface ChatApiResponse {
  text: string;
  model: string;
  usedFallback?: boolean;
}

export async function requestGaraMasterReply(params: {
  message: string;
  model: string;
  chatMode?: "general" | "tender" | "offer_preparation";
  tender?: TenderDocument | null;
  profilo?: ProfiloImpresaContext | null;
  history: Message[];
  attachments?: ChatAttachment[];
  enabledConnectorIds?: string[];
  catalogSummary?: unknown;
  storicoGare?: unknown[];
}): Promise<ChatApiResponse> {
  const connectorsAddendum = params.enabledConnectorIds?.length
    ? buildConnectorsSystemAddendum(params.enabledConnectorIds)
    : undefined;
  const history = params.history
    .filter((m) => m.sender === "user" || m.sender === "assistant")
    .slice(-12)
    .map((m) => ({
      role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
      text: m.text,
    }));

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      model: params.model,
      chatMode: params.chatMode ?? "tender",
      tender: params.tender ?? null,
      profilo: params.profilo ?? null,
      history,
      connectorsAddendum,
      catalogSummary: params.catalogSummary,
      storicoGare: params.storicoGare,
      attachments: params.attachments?.map(({ name, size, type }) => ({
        name,
        size,
        type,
      })),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Errore di comunicazione con il server LLM.");
  }

  return data as ChatApiResponse;
}
