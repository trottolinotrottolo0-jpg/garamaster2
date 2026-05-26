import { getSupabaseClient } from "../lib/supabase/client";
import type { JsonValue } from "../types/database";
import type { ChatMode } from "../types/chat";
import type { Message } from "../types";
import type { OfferPreparationState } from "../lib/guidedOfferPreparation";

export interface ConversazioneListItem {
  id: string;
  messages: JsonValue;
  created_at: string | null;
  gara_id: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveGaraUuid(tenderId: string): string | null {
  if (UUID_RE.test(tenderId)) return tenderId;

  const prefixed = tenderId.match(/^(?:gare_anac|gare)-([0-9a-f-]{36})$/i);
  return prefixed ? prefixed[1] : null;
}

export function serializeMessagesForDb(messages: Message[]): JsonValue {
  return messages.map((message) => ({
    id: message.id,
    sender: message.sender,
    text: message.text,
    timestamp:
      message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : message.timestamp,
    attachments: message.attachments?.map(({ id, name, size, type }) => ({
      id,
      name,
      size,
      type,
    })),
    toolUsage: message.toolUsage ?? null,
  }));
}

export async function listConversazioniAi(userId: string): Promise<ConversazioneListItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("conversazioni_ai")
    .select("id, messages, created_at, gara_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("[GaraMaster] list conversazioni_ai:", error.message);
    return [];
  }

  return (data ?? []) as ConversazioneListItem[];
}

export async function saveConversazioneAi(params: {
  userId: string;
  garaId: string | null;
  tenderId: string;
  tenderCig: string;
  title?: string;
  chatMode?: ChatMode;
  messages: Message[];
  offerPreparation?: OfferPreparationState;
  existingId?: string | null;
}): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const messagesPayload = {
    title: params.title ?? "Chat",
    chatMode: params.chatMode ?? "tender",
    tenderId: params.tenderId,
    tenderCig: params.tenderCig,
    items: serializeMessagesForDb(params.messages),
    ...(params.offerPreparation ? { offerPreparation: params.offerPreparation } : {}),
  };

  console.log("[GaraMaster] Salvataggio conversazione_ai:", {
    userId: params.userId,
    garaId: params.garaId,
    tenderId: params.tenderId,
    messageCount: params.messages.length,
    existingId: params.existingId ?? null,
  });

  if (params.existingId) {
    const { data, error } = await supabase
      .from("conversazioni_ai")
      .update({
        gara_id: params.garaId,
        messages: messagesPayload,
      })
      .eq("id", params.existingId)
      .eq("user_id", params.userId)
      .select("id")
      .single();

    if (error) {
      console.error("[GaraMaster] Errore update conversazione_ai:", error.message);
      throw new Error(`Impossibile aggiornare la conversazione: ${error.message}`);
    }

    console.log("[GaraMaster] Conversazione aggiornata:", data.id);
    return data.id;
  }

  const { data, error } = await supabase
    .from("conversazioni_ai")
    .insert({
      user_id: params.userId,
      gara_id: params.garaId,
      messages: messagesPayload,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[GaraMaster] Errore insert conversazione_ai:", error.message);
    throw new Error(`Impossibile salvare la conversazione: ${error.message}`);
  }

  console.log("[GaraMaster] Conversazione salvata:", data.id);
  return data.id;
}
