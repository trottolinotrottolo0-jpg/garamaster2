import { buildGaraMasterSystemPrompt } from "./buildGaraMasterPrompt";
import type { ChatHistoryTurn, ChatRequestBody, ChatResponseBody } from "./chatTypes";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";

function resolveDeepseekModel(displayName?: string): string {
  const envDefault = resolveOpenRouterModel();
  if (!displayName) return envDefault;
  // Manteniamo compatibilità con dropdown UI (nomi Gemini/Claude).
  const MODEL_MAP: Record<string, string> = {
    "Gemini 3.5 Flash": envDefault,
    "Claude 3.5 Sonnet": envDefault,
  };
  return MODEL_MAP[displayName] ?? envDefault;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDeepseekError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /503|429|UNAVAILABLE|high demand|overloaded|rate limit/i.test(msg)
  );
}

// Manteniamo la vecchia export name perché molti moduli server la riusano.
export function formatGeminiError(error: unknown): string {
  if (!(error instanceof Error)) return "Errore LLM sconosciuto.";
  const raw = error.message;

  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; message?: string; status?: string };
      code?: number;
      message?: string;
      status?: string;
    };
    const inner = parsed.error ?? parsed;
    const code = inner.code;
    const status = inner.status;
    const message = inner.message ?? parsed.message;

    if (code === 503 || status === "UNAVAILABLE" || /high demand/i.test(message ?? "")) {
      return "Servizio LLM temporaneamente sovraccarico. Riprova tra 30–60 secondi.";
    }
    if (code === 429) {
      return "Troppe richieste all'LLM. Attendi un minuto e riprova.";
    }
    if (message) return message;
  } catch {
    // messaggio non JSON
  }

  if (/high demand|UNAVAILABLE|503/i.test(raw)) {
    return "Servizio LLM temporaneamente sovraccarico. Riprova tra 30–60 secondi.";
  }
  if (/rate.?limit|temporarily rate-limited|saturi/i.test(raw)) {
    return "Modelli DeepSeek temporaneamente saturi su OpenRouter. Attendi 1–2 minuti e riprova.";
  }

  return raw;
}

function buildUserTurn(
  message: string,
  attachments?: ChatRequestBody["attachments"]
): string {
  if (!attachments?.length) return message;

  const fileList = attachments
    .map((a) => `- ${a.name} (${a.type || "file"}, ${Math.round(a.size / 1024)} KB)`)
    .join("\n");

  return `${message}\n\n[Allegati caricati dall'operatore]\n${fileList}\n\nAnalizza gli allegati nel contesto della gara corrente. Se è un PDF disciplinare, indica quali requisiti SOA, penali e criteri andrebbero estratti con OCR.`;
}

function buildHistoryText(history: ChatHistoryTurn[], userText: string): string {
  const lastTurns = history.slice(-12);
  if (!lastTurns.length) return userText;

  const lines = lastTurns.map((t) => {
    const role = t.role === "user" ? "Utente" : "Assistente";
    return `${role}: ${t.text}`;
  });

  return `${lines.join("\n")}\n\nRichiesta corrente:\n${userText}`;
}

export async function generateGaraMasterReply(
  body: ChatRequestBody
): Promise<ChatResponseBody> {
  const deepseekModel = resolveDeepseekModel(body.model);
  const systemInstruction = buildGaraMasterSystemPrompt(body.profilo, body.tender ?? null, {
    chatMode: body.chatMode,
    connectorsAddendum: body.connectorsAddendum,
    catalogSummary: body.catalogSummary,
    storicoGare: body.storicoGare,
  });
  console.log(
    "[GaraMaster] System prompt — mode:",
    body.chatMode ?? "tender",
    "gara:",
    body.tender?.cig ?? "chat-libera",
    "profilo:",
    body.profilo?.ragioneSociale ?? "assente"
  );

  const userText = buildUserTurn(body.message, body.attachments);
  const prompt = buildHistoryText(body.history ?? [], userText);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[GaraMaster] OpenRouter chat request — model: ${deepseekModel}, attempt: ${attempt + 1}`);
      const { text, modelUsed } = await deepseekChatCompletion({
        model: deepseekModel,
        systemInstruction,
        prompt,
        temperature: 0.35,
        maxTokens: 4096,
      });

      return {
        text,
        model: modelUsed,
        usedFallback: false,
      };
    } catch (error) {
      lastError = error;
      console.warn(
        `[GaraMaster] OpenRouter errore (tentativo ${attempt + 1}):`,
        error instanceof Error ? error.message : error
      );

      if (isRetryableDeepseekError(error) && attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }

      if (isRetryableDeepseekError(error)) break;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
