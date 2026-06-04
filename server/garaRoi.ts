import { formatGeminiError } from "./geminiChat";
import { deepseekChatCompletion } from "./deepseekChat";
import type { GaraRoiRequestBody, GaraRoiResponseBody, GaraRoiVerdetto } from "./garaRoiTypes";

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

function deriveVerdetto(roi: number | null): GaraRoiVerdetto {
  if (roi == null) return "lascia_perdere";
  if (roi >= 200) return "vale_la_pena";
  if (roi >= 50) return "valuta_con_cautela";
  return "lascia_perdere";
}

function buildMotivazioneLeggibile(
  ore: number,
  costoInterno: number,
  costoTotale: number,
  winProb: number,
  expectedMargin: number,
  expectedValue: number,
  roi: number | null,
  verdetto: GaraRoiVerdetto
): string {
  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const roiStr = roi != null ? `${Math.round(roi)}%` : "N/D";
  const conclusione =
    verdetto === "vale_la_pena"
      ? "Vale la pena approfondire."
      : verdetto === "valuta_con_cautela"
        ? "Valuta con cautela prima di procedere."
        : "Il gioco potrebbe non valere la candela.";

  return (
    `Questa gara richiede circa ${Math.round(ore)} ore interne, pari a ${fmt(costoInterno)} di costo diretto` +
    (costoTotale > costoInterno
      ? ` (${fmt(costoTotale)} inclusi costi aggiuntivi).`
      : ".") +
    ` Con probabilità stimata di aggiudicazione del ${winProb}% e margine atteso di ${fmt(expectedMargin)},` +
    ` il valore atteso della partecipazione è ${fmt(expectedValue)}.` +
    ` ROI partecipazione: circa ${roiStr}. ${conclusione}`
  );
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

  // clamp win probability 1-60% (stima prudente, non certezza)
  const winProb = Math.min(60, Math.max(1, estimate.probabilitaVittoriaPercent));

  const participationInternalCost = Math.max(
    0,
    estimate.orePreparazioneStimate * estimate.tariffaOrariaEuro
  );
  const costiPartecipazione = participationInternalCost + (estimate.costiAggiuntiviEuro ?? 0);

  // vecchia formula (backwards compat)
  const profittoAtteso = importo * (estimate.marginePercentStimato / 100) - costiPartecipazione;
  const roiPercent =
    costiPartecipazione > 0 ? (profittoAtteso / costiPartecipazione) * 100 : null;

  // nuova formula EV-based (#56)
  const expectedMarginIfWon = importo * (estimate.marginePercentStimato / 100);
  const expectedValue = expectedMarginIfWon * (winProb / 100);
  const roiPartecipazione =
    costiPartecipazione > 0
      ? ((expectedValue - costiPartecipazione) / costiPartecipazione) * 100
      : null;

  const verdetto = deriveVerdetto(roiPartecipazione);
  const motivazioneLeggibile = buildMotivazioneLeggibile(
    estimate.orePreparazioneStimate,
    participationInternalCost,
    costiPartecipazione,
    winProb,
    expectedMarginIfWon,
    expectedValue,
    roiPartecipazione,
    verdetto
  );

  return {
    ...estimate,
    probabilitaVittoriaPercent: winProb,
    importoGaraEuro: importo,
    costiPartecipazioneEuro: Math.round(costiPartecipazione),
    profittoAttesoEuro: Math.round(profittoAtteso),
    roiPercent: roiPercent != null ? Math.round(roiPercent * 10) / 10 : null,
    formulaSintesi: `((€${importo.toLocaleString("it-IT")} × ${estimate.marginePercentStimato}%) − €${Math.round(costiPartecipazione).toLocaleString("it-IT")}) / €${Math.round(costiPartecipazione).toLocaleString("it-IT")}`,
    // campi #56
    estimatedParticipationHours: Math.round(estimate.orePreparazioneStimate),
    internalHourlyCostEuro: estimate.tariffaOrariaEuro,
    participationInternalCostEuro: Math.round(participationInternalCost),
    expectedMarginIfWonEuro: Math.round(expectedMarginIfWon),
    expectedValueEuro: Math.round(expectedValue),
    roiPartecipazionePercent:
      roiPartecipazione != null ? Math.round(roiPartecipazione * 10) / 10 : null,
    verdetto,
    motivazioneLeggibile,
  };
}

export async function generateGaraRoi(body: GaraRoiRequestBody): Promise<GaraRoiResponseBody> {
  if (body.importoGaraEuro <= 0) {
    throw new Error("Importo gara non valido per il calcolo ROI.");
  }

  const prompt = buildPrompt(body);

  try {
    const { text } = await deepseekChatCompletion({
      prompt,
      model: process.env.OPENROUTER_MODEL,
      temperature: 0.3,
      maxTokens: 2048,
    });

    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const estimate = {
      marginePercentStimato: Math.min(30, Math.max(1, Number(parsed.marginePercentStimato) || 8)),
      orePreparazioneStimate: Math.min(800, Math.max(8, Number(parsed.orePreparazioneStimate) || 40)),
      tariffaOrariaEuro: Math.min(250, Math.max(40, Number(parsed.tariffaOrariaEuro) || 90)),
      costiAggiuntiviEuro: Math.max(0, Number(parsed.costiAggiuntiviEuro) || 0),
      probabilitaVittoriaPercent: Math.min(
        60,
        Math.max(1, Number(parsed.probabilitaVittoriaPercent) || 15)
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
