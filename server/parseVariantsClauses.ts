import type {
  TenderDocument,
  VariantClause,
  ClaimsClause,
  VariantClauseTipo,
  ClaimsClauseTipo,
} from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";
import { parseTenderValue } from "../src/lib/bidCalculations";

const VARIANTS_PROMPT = `Sei un esperto di diritto contrattuale e varianti in appalti pubblici italiani.
Analizza il bando e estrai TUTTE le clausole su varianti contrattuali e claims/riserve.

Rispondi SOLO con JSON valido, senza markdown:
{
  "variants": [
    {
      "id": "var-001",
      "titolo": "titolo",
      "descrizione": "descrizione",
      "tipoVariante": "VARIANTE_AUTORIZZABILE" | "VARIANTE_DISCREZIONALE" | "VARIANTE_VIETATA",
      "percentualeMaxImporto": 5,
      "percentualeMaxQuantita": 10,
      "proceduaAutorizzazione": "procedura",
      "consequenzeNegazione": "conseguenze",
      "note": ""
    }
  ],
  "claims": [
    {
      "id": "claim-001",
      "titolo": "titolo",
      "descrizione": "descrizione",
      "tipoClaimsAccettato": "TOTALE" | "PARZIALE" | "LIMITATO" | "NEGATO",
      "percentualeMaxCodifica": 5,
      "tempoRivendicazione": "entro X giorni",
      "oneriProva": "oneri prova",
      "consequenze": "conseguenze",
      "note": ""
    }
  ]
}`;

const VARIANT_KEYWORDS = [
  "variant",
  "variante",
  "modific",
  "art. 106",
  "adeguament",
  "riserv",
  "rivendic",
  "claim",
  "extra-cost",
  "extra cost",
  "imprevist",
  "contestaz",
];

function stripBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function extractVariantFocusedText(fullText: string): string {
  const lower = fullText.toLowerCase();
  const windows: string[] = [];
  for (const kw of VARIANT_KEYWORDS) {
    let idx = 0;
    while (idx < lower.length) {
      const pos = lower.indexOf(kw, idx);
      if (pos === -1) break;
      windows.push(fullText.slice(Math.max(0, pos - 600), Math.min(fullText.length, pos + 4000)));
      idx = pos + kw.length;
      if (windows.length >= 10) break;
    }
    if (windows.length >= 10) break;
  }
  return windows.length > 0
    ? [...new Set(windows)].join("\n\n---\n\n").slice(0, 100_000)
    : fullText.slice(0, 80_000);
}

function normalizeVariantTipo(raw: unknown): VariantClauseTipo {
  const t = String(raw ?? "").toUpperCase();
  if (t.includes("VIET")) return "VARIANTE_VIETATA";
  if (t.includes("DISCREZ")) return "VARIANTE_DISCREZIONALE";
  return "VARIANTE_AUTORIZZABILE";
}

function normalizeClaimsTipo(raw: unknown): ClaimsClauseTipo {
  const t = String(raw ?? "").toUpperCase();
  if (t.includes("NEGAT") || t.includes("VIET")) return "NEGATO";
  if (t.includes("LIMIT")) return "LIMITATO";
  if (t.includes("TOTALE") || t.includes("PIENO")) return "TOTALE";
  return "PARZIALE";
}

export function defaultVariantClausesForTender(tender: TenderDocument): VariantClause[] {
  return [
    {
      id: "var-default-1",
      titolo: "Varianti ordinarie (art. 106 Codice Contratti)",
      descrizione:
        "Varianti su richiesta della Stazione Appaltante per modifiche tecniche, secondo normativa vigente.",
      tipoVariante: "VARIANTE_AUTORIZZABILE",
      percentualeMaxImporto: 10,
      proceduaAutorizzazione:
        "Su richiesta SA, entro termini contrattuali, con accordo impresa",
      consequenzeNegazione:
        "Se impresa rifiuta variante richiesta da SA: risoluzione contratto per inadempimento",
      note: "Variante standard italiana per appalti pubblici",
    },
  ];
}

export function defaultClaimsClausesForTender(): ClaimsClause[] {
  return [
    {
      id: "claim-default-1",
      titolo: "Claims generici (extra-costi)",
      descrizione:
        "Rivendicazioni per extra-costi da circostanze non previste (scavi inaspettati, servizi nascosti).",
      tipoClaimsAccettato: "PARZIALE",
      percentualeMaxCodifica: 5,
      tempoRivendicazione: "Entro 30 giorni da evento generante claim",
      oneriProva:
        "Impresa deve provare nesso causale diretto, documentazione contemporanea",
      consequenze: "Se claim negato per mancanza prove: impresa sostiene extra-costi",
      note: "Standard italiano: claims onerosi per impresa",
    },
  ];
}

function normalizeVariants(raw: unknown, tender: TenderDocument): VariantClause[] {
  if (!Array.isArray(raw)) return defaultVariantClausesForTender(tender);
  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `var-${String(index + 1).padStart(3, "0")}`),
      titolo: String(o.titolo ?? `Variante ${index + 1}`),
      descrizione: String(o.descrizione ?? ""),
      tipoVariante: normalizeVariantTipo(o.tipoVariante),
      percentualeMaxImporto:
        o.percentualeMaxImporto != null ? Number(o.percentualeMaxImporto) : undefined,
      percentualeMaxQuantita:
        o.percentualeMaxQuantita != null ? Number(o.percentualeMaxQuantita) : undefined,
      proceduaAutorizzazione: String(o.proceduaAutorizzazione ?? "Da definire in contratto"),
      consequenzeNegazione: String(o.consequenzeNegazione ?? ""),
      note: String(o.note ?? ""),
    };
  });
}

function normalizeClaims(raw: unknown): ClaimsClause[] {
  if (!Array.isArray(raw)) return defaultClaimsClausesForTender();
  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `claim-${String(index + 1).padStart(3, "0")}`),
      titolo: String(o.titolo ?? `Claims ${index + 1}`),
      descrizione: String(o.descrizione ?? ""),
      tipoClaimsAccettato: normalizeClaimsTipo(o.tipoClaimsAccettato),
      percentualeMaxCodifica:
        o.percentualeMaxCodifica != null ? Number(o.percentualeMaxCodifica) : undefined,
      tempoRivendicazione:
        o.tempoRivendicazione != null ? String(o.tempoRivendicazione) : undefined,
      oneriProva: String(o.oneriProva ?? "Documentazione e nesso causale"),
      consequenze: String(o.consequenze ?? ""),
      note: String(o.note ?? ""),
    };
  });
}
import type { TenderDocument, VariantClause, ClaimsClause } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";

export interface VariantsClausesResult {
  variantClauses: VariantClause[];
  claimsClauses: ClaimsClause[];
}

const VARIANTS_PROMPT = `Sei un esperto legale in clausole di variante e claim per appalti pubblici italiani (D.Lgs. 36/2023).
Analizza il disciplinare e identifica le clausole varianti e claims.
Rispondi SOLO con un oggetto JSON valido senza markdown.

Struttura JSON:
{
  "variantClauses": [ { "id": "var-001", "tipoVariante": "...", "descrizione": "...", "percentualeMassima": 20, "approvazioneDirettore": true, "giustificazioneRichiesta": true, "articoloRiferimento": "Art. 120" } ],
  "claimsClauses": [ { "id": "claim-001", "tipoReclamo": "...", "descrizione": "...", "terminePresentazione": 15, "proceduraPresentazione": "...", "articoloRiferimento": "Art. 200" } ]
}

DATI GARA:`;

export async function parseVariantsClausesFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<{ variants: VariantClause[]; claims: ClaimsClause[] }> {
  const data = stripBase64(bandoPdfBase64);
  if (!data) throw new Error("PDF bando non valido.");

  const { default: pdfParse } = await import("pdf-parse");
  const text = String((await pdfParse(Buffer.from(data, "base64")))?.text ?? "").trim();
  if (!text) throw new Error("Testo PDF vuoto — usa un PDF testuale.");

  const importo = parseTenderValue(tender.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : tender.value;

  const model = resolveOpenRouterModel();
  const focused = extractVariantFocusedText(text);
  const prompt = `${VARIANTS_PROMPT}

Documento: ${fileName}
Importo: ${importoLabel}
Categoria: ${tender.category}

TESTO:
${focused}`;

  try {
    const { text: responseText } = await deepseekChatCompletion({
      model,
      prompt,
      temperature: 0.2,
      maxTokens: 4000,
    });

    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);

    const parsed = JSON.parse(jsonText.trim()) as { variants?: unknown; claims?: unknown };
    const variants = normalizeVariants(parsed.variants, tender);
    const claims = normalizeClaims(parsed.claims);
    return {
      variants: variants.length > 0 ? variants : defaultVariantClausesForTender(tender),
      claims: claims.length > 0 ? claims : defaultClaimsClausesForTender(),
    };
  } catch (error) {
    console.error("Parsing variants/claims failed:", error);
    return {
      variants: defaultVariantClausesForTender(tender),
      claims: defaultClaimsClausesForTender(),
    };
): Promise<VariantsClausesResult> {
  const model = resolveOpenRouterModel();
  const pdfContent = Buffer.from(bandoPdfBase64, "base64").toString("utf-8").slice(0, 6000);

  const prompt = `${VARIANTS_PROMPT}
Titolo: ${tender.title}
Anomalie: ${tender.anomalies.join(", ") || "nessuna"}
Testo estratto: ${pdfContent}`;

  try {
    const { text } = await deepseekChatCompletion({ model, prompt, maxTokens: 2000 });
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as VariantsClausesResult;
    return {
      variantClauses: Array.isArray(parsed.variantClauses) ? parsed.variantClauses : [],
      claimsClauses: Array.isArray(parsed.claimsClauses) ? parsed.claimsClauses : [],
    };
  } catch (err) {
    console.error("[parseVariantsClauses] error:", err);
    return { variantClauses: [], claimsClauses: [] };
  }
}
