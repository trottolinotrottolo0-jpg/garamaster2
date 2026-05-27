import { useCallback, useEffect, useRef, useState } from "react";

type VoiceStatus = "idle" | "recording" | "transcribing";

type UseVoiceDictationOptions = {
  onTranscript: (text: string) => void;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64 ?? "");
    };
    reader.onerror = () => reject(new Error("Lettura audio fallita"));
    reader.readAsDataURL(blob);
  });
}

function pickRecorderMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

async function parseJsonResponse(response: Response): Promise<{ text?: string; error?: string }> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Server API non raggiungibile. Apri http://localhost:3000 e avvia con npm run dev (non la porta 3002)."
    );
  }
  return response.json() as Promise<{ text?: string; error?: string }>;
}

export function useVoiceDictation({ onTranscript }: UseVoiceDictationOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined"
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  const statusRef = useRef<VoiceStatus>("idle");

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob, mimeType: string) => {
    if (blob.size < 200) {
      setError("Registrazione troppo breve. Tieni premuto e parla almeno 2 secondi.");
      setStatus("idle");
      return;
    }

    setStatus("transcribing");
    setError(null);

    try {
      const base64 = await blobToBase64(blob);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, mimeType }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error ?? "Trascrizione fallita.");
      }

      const transcript = data.text?.trim();
      if (transcript) {
        onTranscriptRef.current(transcript);
        setError(null);
      } else {
        setError("Nessun testo riconosciuto. Parla più vicino al microfono e riprova.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la trascrizione vocale.");
    } finally {
      setStatus("idle");
      recorderRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      if (statusRef.current === "recording") {
        cleanupStream();
        setStatus("idle");
      }
      return;
    }

    try {
      if (typeof recorder.requestData === "function") {
        recorder.requestData();
      }
      recorder.stop();
    } catch {
      cleanupStream();
      setStatus("idle");
      setError("Errore durante la chiusura della registrazione.");
    }
  }, [cleanupStream]);

  const startListening = useCallback(async () => {
    if (!isSupported || statusRef.current === "transcribing") return;

    if (statusRef.current === "recording") {
      stopListening();
      return;
    }

    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        cleanupStream();
        setStatus("idle");
        setError("Errore del registratore audio. Riprova.");
        recorderRef.current = null;
      };

      recorder.onstop = () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeTypeRef.current || "audio/webm",
        });
        const finalMime = recorder.mimeType || mimeTypeRef.current || blob.type || "audio/webm";
        void transcribeBlob(blob, finalMime);
      };

      recorderRef.current = recorder;
      recorder.start(200);
      setStatus("recording");
    } catch (err) {
      cleanupStream();
      recorderRef.current = null;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Permesso microfono negato. Abilitalo nelle impostazioni del browser.");
      } else {
        setError("Impossibile accedere al microfono.");
      }
      setStatus("idle");
    }
  }, [cleanupStream, isSupported, stopListening, transcribeBlob]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    isSupported,
    isListening: status === "recording",
    isTranscribing: status === "transcribing",
    status,
    error,
    startListening,
    stopListening,
  };
}
