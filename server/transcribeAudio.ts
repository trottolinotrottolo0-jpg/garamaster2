const MIME_FALLBACKS: Record<string, string[]> = {
  "audio/mp4": ["audio/aac", "audio/mp3", "audio/webm"],
  "audio/x-m4a": ["audio/aac", "audio/mp3"],
  "audio/mpeg": ["audio/mp3"],
  "audio/webm": ["audio/webm"],
  "audio/ogg": ["audio/ogg", "audio/webm"],
};

const DEFAULT_TRANSCRIBE_MODEL =
  process.env.OPENROUTER_TRANSCRIBE_MODEL?.trim() || "google/gemini-2.5-flash";

function normalizeBaseUrl(): string {
  const raw =
    process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function mimeCandidates(mimeType: string): string[] {
  const base = (mimeType.split(";")[0] || "audio/webm").trim().toLowerCase();
  const fallbacks = MIME_FALLBACKS[base] ?? [base, "audio/webm", "audio/mp3"];
  return [...new Set(fallbacks)];
}

async function tryTranscribe(
  base64Audio: string,
  mimeType: string
): Promise<string> {
  const apiKey =
    process.env.OPENROUTER_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY non configurata. Impossibile trascrivere l'audio."
    );
  }

  const baseUrl = normalizeBaseUrl();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL ?? process.env.VITE_APP_URL ?? "http://localhost:3000",
      "X-Title": "GaraMaster AI",
    },
    body: JSON.stringify({
      model: DEFAULT_TRANSCRIBE_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Audio}`,
              },
            },
            {
              type: "text",
              text: "Trascrivi in italiano il messaggio vocale dell'utente (contesto: gare d'appalto edili e appalti pubblici). Restituisci SOLO il testo trascritto, senza virgolette, prefissi o commenti. Se l'audio è silenzioso o incomprensibile, rispondi con una stringa vuota.",
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        message?: string;
        choices?: Array<{ message?: { content?: string } }>;
      }
    | null;

  if (!response.ok) {
    const msg =
      data?.error?.message ??
      data?.message ??
      `Errore OpenRouter trascrizione (${response.status})`;
    throw new Error(msg);
  }

  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string
): Promise<string> {
  if (!base64Audio?.trim()) {
    throw new Error("Audio vuoto ricevuto dal browser.");
  }

  const candidates = mimeCandidates(mimeType);
  let lastError: Error | null = null;

  for (const mime of candidates) {
    try {
      const text = await tryTranscribe(base64Audio, mime);
      if (text) return text;
      lastError = new Error("Audio non comprensibile o silenzioso.");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Trascrizione non riuscita.");
}
