import type { Message } from "../types";
import type { ChatMode, ChatSession, StoredConversationPayload } from "../types/chat";
import type { TenderDocument } from "../types";
import { createInitialOfferState } from "./guidedOfferPreparation";
import {
  listConversazioniAi,
  resolveGaraUuid,
  saveConversazioneAi,
  type ConversazioneListItem,
} from "../services/conversazioneService";

function newId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createWelcomeMessage(mode: ChatMode, tender?: TenderDocument | null): Message {
  if (mode === "offer_preparation") {
    return {
      id: "welcome-offer",
      sender: "assistant",
      text: `**Preparazione offerta guidata** — CIG **${tender?.cig ?? "N/D"}**

Ti accompagno passo passo: raccogliamo i dati mancanti, poi la checklist per **Busta Amministrativa**, **Tecnica** ed **Economica**.

Per iniziare: qual è il **ribasso percentuale previsto** su questa gara? (oppure scrivi «da definire»)`,
      timestamp: new Date(),
    };
  }

  if (mode === "general") {
    return {
      id: "welcome",
      sender: "assistant",
      text: "Chat libera avviata.\n\nPuoi chiedermi qualsiasi cosa su appalti pubblici, SOA, RTI, strategie di gara o redazione documenti — **senza** dover selezionare un disciplinare.\n\nCollega una gara dalla sidebar quando vuoi analisi sul bando specifico, oppure abilita i **connettori GaraMaster** sotto l'input per usare i nostri motori interni.",
      timestamp: new Date(),
    };
  }

  return {
    id: "welcome",
    sender: "assistant",
    text: `Chat collegata alla gara: **${tender?.title ?? "Gara"}** (CIG ${tender?.cig ?? "N/D"}).\n\nChiedimi requisiti SOA, penali, RTI/avvalimento, ribasso o bozze di offerta tecnica.`,
    timestamp: new Date(),
  };
}

export function createChatSession(
  mode: ChatMode,
  tender: TenderDocument | null,
  title?: string
): ChatSession {
  const now = new Date().toISOString();
  const isTenderLinked = mode === "tender" || mode === "offer_preparation";
  return {
    id: newId(),
    title:
      title ??
      (mode === "general"
        ? "Nuova chat"
        : mode === "offer_preparation"
          ? `Preparazione offerta · ${tender?.cig ?? "gara"}`
          : tender?.title.slice(0, 48) ?? "Chat gara"),
    mode,
    tenderId: isTenderLinked ? tender?.id ?? null : null,
    messages: [createWelcomeMessage(mode, tender)],
    updatedAt: now,
    supabaseId: null,
    offerPreparation:
      mode === "offer_preparation" ? createInitialOfferState() : undefined,
  };
}

export function createOfferPreparationSession(tender: TenderDocument): ChatSession {
  return createChatSession("offer_preparation", tender);
}

export function deriveTitleFromMessage(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "Chat senza titolo";
  return clean.length > 52 ? `${clean.slice(0, 52)}…` : clean;
}

export function sessionFromConversazioneRow(
  row: ConversazioneListItem,
  tenders: TenderDocument[]
): ChatSession {
  const payload = row.messages as StoredConversationPayload | null;
  const items = (payload?.items ?? []) as Message[];
  const mode: ChatMode =
    payload?.chatMode ?? (payload?.tenderId ? "tender" : "general");
  const tenderId = payload?.tenderId ?? null;
  const tender =
    tenderId != null
      ? tenders.find((t) => t.id === tenderId) ??
        (payload?.tenderCig
          ? tenders.find((t) => t.cig === payload.tenderCig)
          : undefined)
      : undefined;

  const normalizedMessages = items.map((m) => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp as string),
  }));

  return {
    id: `sb-${row.id}`,
    supabaseId: row.id,
    title: payload?.title ?? payload?.tenderCig ?? "Chat salvata",
    mode,
    tenderId,
    messages: normalizedMessages.length
      ? normalizedMessages
      : [createWelcomeMessage(mode, tender)],
    updatedAt: row.created_at ?? new Date().toISOString(),
    offerPreparation:
      payload?.offerPreparation ??
      (mode === "offer_preparation" ? createInitialOfferState() : undefined),
  };
}

const LOCAL_KEY = "gm_chat_sessions_v1";

export function loadLocalSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return parsed.map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp as unknown as string),
      })),
    }));
  } catch {
    return [];
  }
}

export function saveLocalSessions(sessions: ChatSession[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(sessions));
}

export async function loadSessionsForUser(
  userId: string | undefined,
  tenders: TenderDocument[],
  fallback: ChatSession
): Promise<ChatSession[]> {
  if (!userId) {
    const local = loadLocalSessions();
    return local.length ? local : [fallback];
  }

  try {
    const rows = await listConversazioniAi(userId);
    if (!rows.length) return [fallback];
    return rows.map((row) => sessionFromConversazioneRow(row, tenders));
  } catch (err) {
    console.warn("[GaraMaster] Caricamento conversazioni fallito:", err);
    return [fallback];
  }
}

export async function persistSession(
  session: ChatSession,
  userId: string,
  tender: TenderDocument | null
): Promise<string | null> {
  const garaId =
    (session.mode === "tender" || session.mode === "offer_preparation") &&
    session.tenderId
      ? resolveGaraUuid(session.tenderId)
      : null;

  return saveConversazioneAi({
    userId,
    garaId,
    tenderId: session.tenderId ?? "general-chat",
    tenderCig: tender?.cig ?? "N/D",
    title: session.title,
    chatMode: session.mode,
    messages: session.messages,
    offerPreparation: session.offerPreparation,
    existingId: session.supabaseId,
  });
}
