import { resolveOpenRouterModel } from "./deepseekChat";
import { formatGeminiError } from "./geminiChat";
import { deepseekChatCompletion } from "./deepseekChat";
import type {
  SoaGapForecastRequestBody,
  SoaGapForecastResponseBody,
} from "./soaGapForecastTypes";

function buildPrompt(body: SoaGapForecastRequestBody): string {
  const target = body.targetCoveragePercent ?? 80;

  return `Sei il modulo **SOA Gap Forecasting** di GaraMaster AI (appalti pubblici italiani, D.Lgs. 36/2023).

Obiettivo: dire all'impresa quali attestazioni SOA mancano per poter partecipare al **${target}%** delle gare nella sua area geografica, stimando costi e ROI.

## Profilo SOA attuale (impresa)
${JSON.stringify(body.profiloSoa, null, 2)}

## Regione / aree analizzate
${body.regioneAnalisi}

## Gare perse o saltate per requisiti SOA insufficienti (storico)
${JSON.stringify(body.garePerseOSaltate, null, 2)}

## Gare disponibili nel catalogo ANAC nell'area (campione)
${JSON.stringify(body.gareAnacArea, null, 2)}

## Statistiche input
${JSON.stringify(body.statisticheInput, null, 2)}

---

**Analisi richiesta:**
1. Incrocia profilo SOA vs requisiti ricorrenti nelle gare ANAC dell'area e nello storico perdite/salti.
2. Identifica le SOA mancanti **prioritarie** (categoria + classifica, es. OG3 Classifica III).
3. Stima quante gare del campione ANAC sarebbero accessibili acquisendo quelle SOA (gare sbloccate).
4. Stima **costo ottenimento** SOA mancanti (€) — range realistico mercato italiano per upgrade/categorie.
5. Stima **ROI %** = (valore medio gare sbloccate × margine operativo tipico 6-12% − costo SOA) / costo SOA × 100.

**messaggioPrincipale** deve essere in italiano, tono consulenziale, e seguire questo schema (adatta i valori reali):
"Per partecipare al ${target}% delle gare nella tua area, ti mancano queste SOA: [elenco categorie e classifiche]."

Rispondi **SOLO** JSON valido:
{
  "coperturaTargetPercent": ${target},
  "messaggioPrincipale": "string — frase come sopra con SOA mancanti",
  "soaMancanti": [
    { "categoria": "OG3", "classifica": "III", "priorita": "alta", "frequenzaGareStimate": 0, "motivazione": "string" }
  ],
  "costoStimatoOttenimentoEuro": 0,
  "gareSbloccate": 0,
  "roiStimatoPercent": 0,
  "sintesi": "string — 3-5 frasi strategiche",
  "regioneAnalisi": "${body.regioneAnalisi.replace(/"/g, "'")}",
  "gareAnacAnalizzate": 0,
  "garePerseOSaltateSoa": 0
}`;
}

function normalizeResponse(
  raw: Record<string, unknown>,
  body: SoaGapForecastRequestBody,
  model: string
): SoaGapForecastResponseBody {
  const soaMancanti = Array.isArray(raw.soaMancanti)
    ? raw.soaMancanti.map((item) => {
        const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          categoria: String(o.categoria ?? "N/D"),
          classifica: String(o.classifica ?? "N/D"),
          priorita: o.priorita ? String(o.priorita) : undefined,
          frequenzaGareStimate:
            o.frequenzaGareStimate != null ? Number(o.frequenzaGareStimate) : undefined,
          motivazione: o.motivazione ? String(o.motivazione) : undefined,
        };
      })
    : [];

  const target = Number(raw.coperturaTargetPercent) || body.targetCoveragePercent || 80;
  const listaSoa =
    soaMancanti.map((s) => `${s.categoria} Classifica ${s.classifica}`).join(", ") ||
    "nessuna criticità dominante rilevata";

  let messaggio = String(raw.messaggioPrincipale ?? "").trim();
  if (!messaggio) {
    messaggio = `Per partecipare al ${target}% delle gare nella tua area, ti mancano queste SOA: ${listaSoa}.`;
  }

  return {
    coperturaTargetPercent: target,
    messaggioPrincipale: messaggio,
    soaMancanti,
    costoStimatoOttenimentoEuro: Math.max(
      0,
      Math.round(Number(raw.costoStimatoOttenimentoEuro) || 0)
    ),
    gareSbloccate: Math.max(0, Math.round(Number(raw.gareSbloccate) || 0)),
    roiStimatoPercent: Math.round((Number(raw.roiStimatoPercent) || 0) * 10) / 10,
    sintesi: String(raw.sintesi ?? "Analisi SOA Gap completata."),
    regioneAnalisi: String(raw.regioneAnalisi ?? body.regioneAnalisi),
    gareAnacAnalizzate: Math.round(
      Number(raw.gareAnacAnalizzate) || body.statisticheInput.totaleAnacArea
    ),
    garePerseOSaltateSoa: Math.round(
      Number(raw.garePerseOSaltateSoa) || body.statisticheInput.totaleStoricoSoa
    ),
    model,
  };
}

function computeLocalSoaGapForecast(
  body: SoaGapForecastRequestBody
): SoaGapForecastResponseBody {
  const profilo = body.profiloSoa as { attestazione?: string; regioniOperative?: string[] };
  const attestazione = String(profilo?.attestazione ?? "");
  const codes = attestazione.match(/\b(OG\d{1,2}|OS\d{1,2}(?:-[AB])?)\b/gi) ?? [];

  const needed = new Map<string, number>();
  for (const g of body.gareAnacArea) {
    const row = g as { categoriaSoa?: string; requisitiSoa?: { descrizione?: string }[] };
    const hay = `${row.categoriaSoa ?? ""} ${(row.requisitiSoa ?? []).map((r) => r.descrizione).join(" ")}`;
    const found = hay.match(/\b(OG\d{1,2}|OS\d{1,2}(?:-[AB])?)\s*(?:classifica|classe)?\s*(I{1,3}|IV|V{1,3}|VI{1,3})?/gi) ?? [];
    for (const m of found) {
      const key = m.toUpperCase().replace(/\s+/g, " ");
      if (!codes.some((c) => key.includes(c.toUpperCase()))) {
        needed.set(key, (needed.get(key) ?? 0) + 1);
      }
    }
  }

  const target = body.targetCoveragePercent ?? 80;
  const top = [...needed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const soaMancanti = top.map(([k, freq]) => {
    const parts = k.split(/\s+/);
    return {
      categoria: parts[0] ?? k,
      classifica: parts[1] ?? "III",
      priorita: "alta" as const,
      frequenzaGareStimate: freq,
      motivazione: "Richiesta ricorrente nel catalogo ANAC dell'area",
    };
  });

  const lista =
    soaMancanti.map((s) => `${s.categoria} Classifica ${s.classifica}`).join(", ") ||
    "nessuna gap dominante nel campione";

  const gareSbloccate = top.reduce((s, [, n]) => s + n, 0);

  return {
    coperturaTargetPercent: target,
    messaggioPrincipale: `Per partecipare al ${target}% delle gare nella tua area, ti mancano queste SOA: ${lista}. [Stima locale]`,
    soaMancanti,
    costoStimatoOttenimentoEuro: soaMancanti.length * 12000,
    gareSbloccate,
    roiStimatoPercent: gareSbloccate > 0 ? 85 : 0,
    sintesi:
      "Analisi locale basata su profilo SOA e catalogo ANAC. Ricalcola con Gemini per stime costi/ROI più accurate.",
    regioneAnalisi: body.regioneAnalisi,
    gareAnacAnalizzate: body.statisticheInput.totaleAnacArea,
    garePerseOSaltateSoa: body.statisticheInput.totaleStoricoSoa,
    model: "local-heuristic",
  };
}

export async function generateSoaGapForecast(
  body: SoaGapForecastRequestBody
): Promise<SoaGapForecastResponseBody> {
  if (!body.gareAnacArea.length && !body.garePerseOSaltate.length) {
    throw new Error(
      "Dati insufficienti: servono gare ANAC nel catalogo o storico gare perse/saltate per SOA."
    );
  }

  try {
    const model = resolveOpenRouterModel();
    const { text } = await deepseekChatCompletion({
      prompt: buildPrompt(body),
      model,
      temperature: 0.25,
      maxTokens: 4096,
    });

    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return normalizeResponse(parsed, body, model);
  } catch (error) {
    const msg = formatGeminiError(error);
    if (/429|503|sovraccarico|UNAVAILABLE|rate limit/i.test(msg)) {
      console.warn("[SoaGapForecast] Fallback locale:", msg);
      return computeLocalSoaGapForecast(body);
    }
    throw new Error(msg);
  }
}
