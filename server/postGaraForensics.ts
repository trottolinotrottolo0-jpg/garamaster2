import { GoogleGenAI } from "@google/genai";
import { formatGeminiError } from "./geminiChat";
import type {
  PostGaraForensicsRequestBody,
  PostGaraForensicsResponseBody,
} from "./postGaraForensicsTypes";

function buildPrompt(body: PostGaraForensicsRequestBody): string {
  const esitoLabel = body.esito === "vinta" ? "VINTA" : "PERSA";

  return `Sei il modulo **Post-Gara Forensics & Learning Loop** di GaraMaster AI (appalti pubblici italiani, D.Lgs. 36/2023).

L'impresa ha registrato l'esito **${esitoLabel}** per la gara:
- CIG: ${body.cig}
- Titolo: ${body.titoloGara}

## Dati raccolti dall'operatore (post-gara)
- Ribasso vincitore (se noto): ${body.ribassoVincitore != null ? `${body.ribassoVincitore}%` : "non indicato"}
- Ribasso offerto in fase di gara (storico): ${body.ribassoOffertoStorico != null ? `${body.ribassoOffertoStorico}%` : "non indicato"}
- Motivazione esclusione/vittoria: ${body.motivazione || "—"}
- Note operative: ${body.noteOperative || "—"}

## Profilo impresa
${JSON.stringify(body.profilo ?? null, null, 2)}

## Sintesi analisi precedente su questa gara (se presente)
${(body.noteAiPrecedenti ?? "").slice(0, 2500) || "Nessuna"}

## Storico gare precedenti dell'impresa (per confronto)
${JSON.stringify(body.storicoSnippet ?? [], null, 2)}

---

**Istruzioni di risposta (obbligatorie):**
1. Inizia **esattamente** con questa frase (prima riga):  
   "Sulla base di questi dati, ecco cosa ha determinato l'esito e cosa migliorare per la prossima gara simile."
2. Poi sviluppa in italiano professionale, con sezioni markdown:
   - **Fattori che hanno determinato l'esito** (ribasso, tecnico, SOA, tempistiche, criterio aggiudicazione, ecc.)
   - **Cosa ha funzionato / cosa non ha funzionato**
   - **Azioni concrete per la prossima gara simile** (3-5 bullet operativi)
3. Se l'esito è PERSA, indica se il ribasso era competitivo e cosa verificare sul mercato.
4. Non inventare dati non forniti; se mancano informazioni, dichiaralo.
5. Chiudi con 2-3 **pattern da memorizzare** in una riga ciascuno (lezioni per lo storico knowledge layer).`;
}

export async function generatePostGaraForensics(
  body: PostGaraForensicsRequestBody
): Promise<PostGaraForensicsResponseBody> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY non configurata.");
  }

  if (!body.motivazione?.trim() && !body.noteOperative?.trim()) {
    throw new Error("Inserisci almeno motivazione o note operative.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildPrompt(body),
      config: { temperature: 0.35, maxOutputTokens: 4096 },
    });

    let analisi = response.text?.trim() ?? "";
    const opening =
      "Sulla base di questi dati, ecco cosa ha determinato l'esito e cosa migliorare per la prossima gara simile.";

    if (!analisi.toLowerCase().includes(opening.slice(0, 40).toLowerCase())) {
      analisi = `${opening}\n\n${analisi}`;
    }

    return { analisi, model };
  } catch (error) {
    throw new Error(formatGeminiError(error));
  }
}
