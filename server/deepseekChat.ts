export type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmChatParams = {
  model?: string;
  systemInstruction?: string;
  prompt: string;
  messages?: LlmChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Modello predefinito: DeepSeek via OpenRouter (affidabile; il tier :free è spesso rate-limited). */
export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-chat";

const MODEL_FALLBACK_CHAIN = [
  "deepseek/deepseek-chat",
  "deepseek/deepseek-chat-v3-0324",
  "deepseek/deepseek-v4-flash:free",
] as const;

function normalizeBaseUrl(baseUrl?: string): string {
  const raw = baseUrl?.trim() || process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function resolveOpenRouterModel(model?: string): string {
  return model?.trim() || process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

function modelsToTry(primary: string): string[] {
  const fromEnv = process.env.OPENROUTER_MODEL_FALLBACKS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const chain = fromEnv?.length ? [primary, ...fromEnv] : [primary, ...MODEL_FALLBACK_CHAIN];
  return [...new Set(chain.filter(Boolean))];
}

function buildMessages(params: LlmChatParams): LlmChatMessage[] {
  if (params.messages?.length) {
    const messages = [...params.messages];
    if (params.systemInstruction?.trim()) {
      const hasSystem = messages.some((m) => m.role === "system");
      if (!hasSystem) {
        messages.unshift({ role: "system", content: params.systemInstruction.trim() });
      }
    }
    return messages;
  }

  const messages: LlmChatMessage[] = [];
  if (params.systemInstruction?.trim()) {
    messages.push({ role: "system", content: params.systemInstruction.trim() });
  }
  messages.push({ role: "user", content: params.prompt });
  return messages;
}

function isRateLimitError(status: number, message: string): boolean {
  return status === 429 || /rate.?limit|temporarily rate-limited/i.test(message);
}

async function callOpenRouter(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: LlmChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<{ text: string } | { error: string; status: number }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL ?? process.env.VITE_APP_URL ?? "http://localhost:3000",
      "X-Title": "GaraMaster AI",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | {
        error?: {
          message?: string;
          code?: number;
          metadata?: { raw?: string };
        };
        message?: string;
        choices?: Array<{ message?: { content?: string } }>;
      }
    | null;

  if (!response.ok) {
    const rawDetail = data?.error?.metadata?.raw;
    const msg =
      rawDetail ??
      data?.error?.message ??
      data?.message ??
      `Errore OpenRouter (${response.status})`;
    return { error: msg, status: response.status };
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    return { error: "Il modello non ha restituito testo nella risposta.", status: 502 };
  }

  return { text };
}

export async function deepseekChatCompletion(params: LlmChatParams): Promise<{
  text: string;
  modelUsed: string;
}> {
  const apiKey =
    process.env.OPENROUTER_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY non configurata. Imposta OPENROUTER_API_KEY (o DEEPSEEK_API_KEY) in .env.local."
    );
  }

  const baseUrl = normalizeBaseUrl();
  const primaryModel = resolveOpenRouterModel(params.model);
  const messages = buildMessages(params);
  const temperature = params.temperature ?? 0.35;
  const maxTokens = params.maxTokens ?? 4096;

  const candidates = modelsToTry(primaryModel);
  let lastError = "Nessun modello DeepSeek disponibile su OpenRouter.";
  let lastStatus = 503;

  for (const model of candidates) {
    const result = await callOpenRouter(
      apiKey,
      baseUrl,
      model,
      messages,
      temperature,
      maxTokens
    );

    if ("text" in result) {
      if (model !== primaryModel) {
        console.warn(
          `[OpenRouter] Modello ${primaryModel} non disponibile; usato fallback ${model}`
        );
      }
      return { text: result.text, modelUsed: model };
    }

    lastError = result.error;
    lastStatus = result.status;

    if (!isRateLimitError(result.status, result.error)) {
      throw new Error(result.error);
    }

    console.warn(`[OpenRouter] Rate limit su ${model}, provo modello successivo…`);
  }

  if (isRateLimitError(lastStatus, lastError)) {
    throw new Error(
      "Tutti i modelli DeepSeek su OpenRouter sono temporaneamente saturi. Attendi 1–2 minuti e riprova, oppure imposta OPENROUTER_MODEL=deepseek/deepseek-chat in .env.local."
    );
  }

  throw new Error(lastError);
}

/** @deprecated Usa deepseekChatCompletion — mantenuto per compatibilità import. */
export const llmChatCompletion = deepseekChatCompletion;
