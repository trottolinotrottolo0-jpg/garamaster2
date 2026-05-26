import { GoogleGenAI } from "@google/genai";
import { buildGaraMasterSystemPrompt } from "./buildGaraMasterPrompt";
import type { ChatHistoryTurn, ChatRequestBody, ChatResponseBody } from "./chatTypes";

const MODEL_MAP: Record<string, string> = {
  "Gemini 3.5 Flash": "gemini-2.5-flash",
  "Claude 3.5 Sonnet": "gemini-2.5-pro",
};

const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

function resolveModelId(displayName?: string): string {
  if (!displayName) return "gemini-2.5-flash";
  return MODEL_MAP[displayName] ?? "gemini-2.5-flash";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /503|429|UNAVAILABLE|high demand|overloaded|rate limit/i.test(msg)
  );
}

export function formatGeminiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Errore sconosciuto dal modello Gemini.";
  }

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
      return "Il servizio Gemini è temporaneamente sovraccarico. Riprova tra 30–60 secondi.";
    }
    if (code === 429) {
      return "Troppe richieste a Gemini. Attendi un minuto e riprova.";
    }
    if (message) return message;
  } catch {
    // messaggio non JSON
  }

  if (/high demand|UNAVAILABLE|503/i.test(raw)) {
    return "Il servizio Gemini è temporaneamente sovraccarico. Riprova tra 30–60 secondi.";
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

function toGeminiContents(history: ChatHistoryTurn[], userText: string) {
  const turns = history.slice(-10).map((turn) => ({
    role: turn.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: turn.text }],
  }));

  return [...turns, { role: "user" as const, parts: [{ text: userText }] }];
}

async function callGemini(
  ai: GoogleGenAI,
  modelId: string,
  systemInstruction: string,
  contents: ReturnType<typeof toGeminiContents>
): Promise<string> {
  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config: {
      systemInstruction,
      temperature: 0.35,
      maxOutputTokens: 4096,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error("Il modello non ha restituito testo nella risposta.");
  }

  return text;
}

export async function generateGaraMasterReply(
  body: ChatRequestBody
): Promise<ChatResponseBody> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY non configurata. Crea .env.local con la chiave da Google AI Studio."
    );
  }

  const primaryModel = resolveModelId(body.model);
  const modelsToTry = [
    primaryModel,
    ...FALLBACK_MODELS.filter((m) => m !== primaryModel),
  ];

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildGaraMasterSystemPrompt(body.profilo, body.tender ?? null, {
    chatMode: body.chatMode,
    connectorsAddendum: body.connectorsAddendum,
    catalogSummary: body.catalogSummary,
    storicoGare: body.storicoGare,
  });
  console.log(
    "[GaraMaster] System prompt Gemini — mode:",
    body.chatMode ?? "tender",
    "gara:",
    body.tender?.cig ?? "chat-libera",
    "profilo:",
    body.profilo?.ragioneSociale ?? "assente"
  );

  const userText = buildUserTurn(body.message, body.attachments);
  const contents = toGeminiContents(body.history ?? [], userText);

  let lastError: unknown;

  for (const modelId of modelsToTry) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`[GaraMaster] Gemini request — model: ${modelId}, attempt: ${attempt + 1}`);
        const text = await callGemini(ai, modelId, systemInstruction, contents);

        if (modelId !== primaryModel) {
          console.log(`[GaraMaster] Risposta ottenuta con modello di fallback: ${modelId}`);
        }

        return {
          text,
          model: modelId,
          usedFallback: modelId !== primaryModel,
        };
      } catch (error) {
        lastError = error;
        console.warn(
          `[GaraMaster] Gemini errore (${modelId}, tentativo ${attempt + 1}):`,
          error instanceof Error ? error.message : error
        );

        if (isRetryableGeminiError(error) && attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }

        if (isRetryableGeminiError(error)) {
          break;
        }

        throw new Error(formatGeminiError(error));
      }
    }
  }

  throw new Error(formatGeminiError(lastError));
}
