import { GoogleGenAI } from "@google/genai";
import { formatGeminiError } from "./geminiChat";
import type { GaraRoiRequestBody, GaraRoiResponseBody } from "./garaRoiTypes";

function buildPrompt(body: GaraRoiRequestBody): string {
  return `Sei il **Gara ROI Calculator** di GaraMaster AI per appalti pubblici italiani (D.Lgs. 36/2023).

Stima parametri economici realistici per decidere se investire nella partecipazione a questa gara.

IMPORTO GARA (€, già parsato): ${body.importoGaraEuro}

PROFILO IMPRESA (Supabase):
${JSON.stringify(body.profilo ?? null, null, 2)}

PROFILO OPERATIVO (costi, margini storici):
${JSON.stringify(body.companyProfile ?? null, null, 2)}

GARA:
${JSON.stringify(
  {
    titolo: body.tender.title,
    cig: body.tender.cig,
    importo: body.tender.value,
    categoria: body.tender.category,
    regione: body.tender.region,
    requisiti: body.tender.requirements,
    penali: body.tender.penalties,
  },
  null,
  2
)}

Stima:
1. **marginePercentStimato** — margine netto % realistico sul contratto per questa categoria lavori (edilizia/pubblico), dopo costi diretti tipici.
2. **orePreparazioneStimate** — ore ufficio gara + tecnico + direzione per preparare offerta (buste, DGUE, offerta tecnica/economica).
3. **tariffaOrariaEuro** — costo orario medio interno (usa profilo se presente, altrimenti 75-120 €/h).
4. **costiAggiuntiviEuro** — garanzia provvisoria, polizze, visure, subappalti consulenza, piattaforma, non ore.
5. **probabilitaVittoriaPercent** — 0-100 basata su profilo SOA, requisiti soddisfatti, competitività bando.

Rispondi SOLO JSON valido:
{
  "marginePercentStimato": number,
  "orePreparazioneStimate": number,
  "tariffaOrariaEuro": number,
  "costiAggiuntiviEuro": number,
  "probabilitaVittoriaPercent": number,
  "motivazioneMargine": "string breve",
  "motivazioneProbabilita": "string breve"
}`;
}

export function buildRoiResponse(
  body: GaraRoiRequestBody,
  estimate: {
    marginePercentStimato: number;
    orePreparazioneStimate: number;
    tariffaOrariaEuro: number;
    costiAggiuntiviEuro: number;
    probabilitaVittoriaPercent: number;
    motivazioneMargine: string;
    motivazioneProbabilita: string;
  }
): GaraRoiResponseBody {
  const importo = body.importoGaraEuro;
  const costiPartecipazione =
    estimate.orePreparazioneStimate * estimate.tariffaOrariaEuro +
    estimate.costiAggiuntiviEuro;
  const profittoAtteso = importo * (estimate.marginePercentStimato / 100) - costiPartecipazione;
  const roiPercent =
    costiPartecipazione > 0 ? (profittoAtteso / costiPartecipazione) * 100 : null;

  return {
    ...estimate,
    importoGaraEuro: importo,
    costiPartecipazioneEuro: Math.round(costiPartecipazione),
    profittoAttesoEuro: Math.round(profittoAtteso),
    roiPercent: roiPercent != null ? Math.round(roiPercent * 10) / 10 : null,
    formulaSintesi: `((€${importo.toLocaleString("it-IT")} × ${estimate.marginePercentStimato}%) − €${Math.round(costiPartecipazione).toLocaleString("it-IT")}) / €${Math.round(costiPartecipazione).toLocaleString("it-IT")}`,
  };
}

export async function generateGaraRoi(body: GaraRoiRequestBody): Promise<GaraRoiResponseBody> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY non configurata.");
  }

  if (body.importoGaraEuro <= 0) {
    throw new Error("Importo gara non valido per il calcolo ROI.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(body);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { temperature: 0.3, maxOutputTokens: 2048 },
    });

    const text = response.text?.trim() ?? "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const estimate = {
      marginePercentStimato: Math.min(30, Math.max(1, Number(parsed.marginePercentStimato) || 8)),
      orePreparazioneStimate: Math.min(800, Math.max(8, Number(parsed.orePreparazioneStimate) || 40)),
      tariffaOrariaEuro: Math.min(250, Math.max(40, Number(parsed.tariffaOrariaEuro) || 90)),
      costiAggiuntiviEuro: Math.max(0, Number(parsed.costiAggiuntiviEuro) || 0),
      probabilitaVittoriaPercent: Math.min(
        95,
        Math.max(2, Number(parsed.probabilitaVittoriaPercent) || 25)
      ),
      motivazioneMargine: String(parsed.motivazioneMargine ?? "Stima per categoria e complessità bando."),
      motivazioneProbabilita: String(
        parsed.motivazioneProbabilita ?? "Stima da profilo e requisiti."
      ),
    };

    return buildRoiResponse(body, estimate);
  } catch (error) {
    throw new Error(formatGeminiError(error));
  }
}
