import type { Message } from "../types";
import type { OfferPreparationState } from "../lib/guidedOfferPreparation";

export type ChatMode = "general" | "tender" | "offer_preparation";

export interface ChatSession {
  id: string;
  title: string;
  mode: ChatMode;
  tenderId: string | null;
  messages: Message[];
  updatedAt: string;
  supabaseId: string | null;
  offerPreparation?: OfferPreparationState;
}

export interface StoredConversationPayload {
  title?: string;
  chatMode?: ChatMode;
  tenderId?: string | null;
  tenderCig?: string | null;
  items?: unknown[];
  offerPreparation?: OfferPreparationState;
}
