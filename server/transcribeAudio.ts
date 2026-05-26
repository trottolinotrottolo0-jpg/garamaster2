import { GoogleGenAI } from "@google/genai";

const MIME_FALLBACKS: Record<string, string[]> = {
  "audio/mp4": ["audio/aac", "audio/mp3", "audio/webm"],
  "audio/x-m4a": ["audio/aac", "audio/mp3"],
  "audio/mpeg": ["audio/mp3"],
  "audio/webm": ["audio/webm"],
  "audio/ogg": ["audio/ogg", "audio/webm"],
};

function mimeCandidates(mimeType: string): string[] {
  const base = (mimeType.split(";")[0] || "audio/webm").trim().toLowerCase();
  const fallbacks = MIME_FALLBACKS[base] ?? [base, "audio/webm", "audio/mp3"];
  return [...new Set(fallbacks)];
}

async function tryTranscribe(
  ai: GoogleGenAI,
  base64Audio: string,
  mimeType: string
): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
          {
            text: "Trascrivi in italiano il messaggio vocale dell'utente (contesto: gare d'appalto edili e appalti pubblici). Restituisci SOLO il testo trascritto, senza virgolette, prefissi o commenti. Se l'audio è silenzioso o incomprensibile, rispondi con una stringa vuota.",
          },
        ],
      },
    ],
  });

  return response.text?.trim() ?? "";
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY non configurata. Impossibile trascrivere l'audio."
    );
  }

  if (!base64Audio?.trim()) {
    throw new Error("Audio vuoto ricevuto dal browser.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const candidates = mimeCandidates(mimeType);
  let lastError: Error | null = null;

  for (const mime of candidates) {
    try {
      const text = await tryTranscribe(ai, base64Audio, mime);
      if (text) return text;
      lastError = new Error("Audio non comprensibile o silenzioso.");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Trascrizione non riuscita.");
}
