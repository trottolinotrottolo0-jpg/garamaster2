import type { TenderDocument, QualificationRequirement } from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { parseTenderValue } from "../src/lib/bidCalculations";

const QUALIFICATION_PROMPT = `Sei un esperto di requisiti di qualificazione per appalti pubblici italiani (ANAC).
Analizza il bando e estrai TUTTI i requisiti di qualificazione per partecipare.

Rispondi SOLO con JSON valido, senza markdown:
{
  "requirements": [
    {
      "id": "qual-001",
      "titolo": "titolo",
      "descrizione": "descrizione",
      "categoria": "SOA",
      "tipoRequisito": "OBBLIGATORIO",
      "soaCategoria": "01",
      "soaImportoMinimo": 500000,
      "certificazioneRichiesta": null,
      "importoAssicurazione": null,
      "anniiEsperienza": null,
      "numeroProgettSimilari": null,
      "capitaleMinimoRichiesto": null,
      "personaleMinimo": null,
      "confidenza": 90,
      "note": ""
    }
  ]
}

categoria: SOA | CERTIFICAZIONE | ASSICURAZIONE | ESPERIENZA | CAPITALE | ORGANIZZATIVA.
tipoRequisito: OBBLIGATORIO | PREFERENZIALE | ESCLUSORIO.`;

const QUAL_KEYWORDS = [
  "qualificazione",
  "requisiti",
  "soa",
  "idoneità",
  "capacità",
  "esperienza",
  "assicuraz",
  "durc",
  "antimafia",
  "certificaz",
  "capitale",
  "fatturato",
];

function stripBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function normalizeCategoria(raw: unknown): QualificationRequirement["categoria"] {
  const t = String(raw ?? "ORGANIZZATIVA").toUpperCase();
  if (t.includes("SOA")) return "SOA";
  if (t.includes("CERTIF")) return "CERTIFICAZIONE";
  if (t.includes("ASSICUR")) return "ASSICURAZIONE";
  if (t.includes("ESPER")) return "ESPERIENZA";
  if (t.includes("CAPIT")) return "CAPITALE";
  return "ORGANIZZATIVA";
}

function normalizeTipo(raw: unknown): QualificationRequirement["tipoRequisito"] {
  const t = String(raw ?? "OBBLIGATORIO").toUpperCase();
  if (t.includes("ESCLUS")) return "ESCLUSORIO";
  if (t.includes("PREFER")) return "PREFERENZIALE";
  return "OBBLIGATORIO";
}

export function defaultQualificationRequirementsForTender(
  tender: TenderDocument
): QualificationRequirement[] {
  const importo = parseTenderValue(tender.value) || 500_000;
  const cat = (tender.category || "03").substring(0, 2);

  return [
    {
      id: "qual-default-1",
      titolo: "SOA — categoria e importo minimo",
      descrizione:
        "Attestazione SOA con categoria idonea e importo massimo realizzato coerente con la gara",
      categoria: "SOA",
      tipoRequisito: "OBBLIGATORIO",
      soaCategoria: cat,
      soaImportoMinimo: Math.round(importo * 0.5),
      confidenza: 95,
      note: "Standard: capacità SOA almeno ~50% importo gara",
    },
    {
      id: "qual-default-2",
      titolo: "DURC e antimafia (SOF)",
      descrizione: "Documento Unico Regolarità Contributiva e certificazioni antimafia",
      categoria: "CERTIFICAZIONE",
      tipoRequisito: "ESCLUSORIO",
      certificazioneRichiesta: "DURC + SOF",
      confidenza: 100,
      note: "Obbligatorio per appalti pubblici >40k€",
    },
    {
      id: "qual-default-3",
      titolo: "Polizza RC generale",
      descrizione: "Copertura assicurativa RC adeguata all'importo e durata contratto",
      categoria: "ASSICURAZIONE",
      tipoRequisito: "OBBLIGATORIO",
      importoAssicurazione: Math.max(100_000, Math.round(importo * 0.1)),
      confidenza: 90,
      note: "Tipicamente ~10% importo gara",
    },
    {
      id: "qual-default-4",
      titolo: "Esperienza in lavori simili",
      descrizione: "Comprovata esperienza nel settore e in lavori di analoga natura",
      categoria: "ESPERIENZA",
      tipoRequisito: "OBBLIGATORIO",
      anniiEsperienza: 3,
      numeroProgettSimilari: 2,
      confidenza: 75,
      note: "Stima da requisiti tipici settore pubblico",
    },
    {
      id: "qual-default-5",
      titolo: "Capacità economico-finanziaria",
      descrizione: "Adeguata solidità economica rispetto all'importo della gara",
      categoria: "CAPITALE",
      tipoRequisito: "OBBLIGATORIO",
      capitaleMinimoRichiesto: Math.round(importo * 0.1),
      confidenza: 70,
      note: "Proxy su fatturato/capitale da verificare in bando",
    },
  ];
}

function normalizeRequirements(raw: unknown, tender: TenderDocument): QualificationRequirement[] {
  if (!Array.isArray(raw)) return defaultQualificationRequirementsForTender(tender);

  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `qual-${String(index + 1).padStart(3, "0")}`),
      titolo: String(o.titolo ?? `Requisito ${index + 1}`),
      descrizione: String(o.descrizione ?? ""),
      categoria: normalizeCategoria(o.categoria),
      tipoRequisito: normalizeTipo(o.tipoRequisito),
      soaCategoria: o.soaCategoria != null ? String(o.soaCategoria) : undefined,
      soaImportoMinimo:
        o.soaImportoMinimo != null ? Number(o.soaImportoMinimo) : undefined,
      certificazioneRichiesta:
        o.certificazioneRichiesta != null ? String(o.certificazioneRichiesta) : undefined,
      importoAssicurazione:
        o.importoAssicurazione != null ? Number(o.importoAssicurazione) : undefined,
      anniiEsperienza: o.annoiEsperienza != null ? Number(o.annoiEsperienza) : undefined,
      numeroProgettSimilari:
        o.numeroProgettSimilari != null ? Number(o.numeroProgettSimilari) : undefined,
      capitaleMinimoRichiesto:
        o.capitaleMinimoRichiesto != null ? Number(o.capitaleMinimoRichiesto) : undefined,
      personaleMinimo: o.personaleMinimo != null ? Number(o.personaleMinimo) : undefined,
      confidenza: Math.min(100, Math.max(0, Number(o.confidenza ?? 75))),
      note: String(o.note ?? ""),
    };
  });
}

export async function parseQualificationRequirementsFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<QualificationRequirement[]> {
  const data = stripBase64(bandoPdfBase64);
  if (!data) throw new Error("PDF bando non valido.");

  const pdfBuffer = Buffer.from(data, "base64");
  let parsedPdf;
  try {
    parsedPdf = await pdfParse(pdfBuffer);
  } catch (pdfError) {
    const msg = pdfError instanceof Error ? pdfError.message : String(pdfError);
    console.error("❌ PDF PARSE ERROR:", {
      message: msg,
      code: (pdfError as NodeJS.ErrnoException).code,
      stack: pdfError instanceof Error ? pdfError.stack : undefined,
      bufferLength: pdfBuffer.length,
      bufferStart: pdfBuffer.slice(0, 10).toString("hex"),
    });
    throw new Error(
      `Impossibile leggere il PDF: ${msg}. ` +
      `Verifica che il file sia un PDF valido, non corrotto, non password-protected.`
    );
  }
  const text = String(parsedPdf?.text ?? "").trim();
  if (!text) throw new Error("Testo PDF vuoto — usa un PDF testuale.");

  const importo = parseTenderValue(tender.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : tender.value;

  const lower = text.toLowerCase();
  const windows: string[] = [];
  for (const kw of QUAL_KEYWORDS) {
    let idx = 0;
    while (idx < lower.length) {
      const pos = lower.indexOf(kw, idx);
      if (pos === -1) break;
      windows.push(text.slice(Math.max(0, pos - 500), Math.min(text.length, pos + 3500)));
      idx = pos + kw.length;
      if (windows.length >= 8) break;
    }
    if (windows.length >= 8) break;
  }
  const focused =
    windows.length > 0
      ? [...new Set(windows)].join("\n\n---\n\n").slice(0, 90_000)
      : text.slice(0, 80_000);

  const model = resolveOpenRouterModel();
  const prompt = `${QUALIFICATION_PROMPT}

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

    const parsed = JSON.parse(jsonText.trim()) as { requirements?: unknown };
    const normalized = normalizeRequirements(parsed.requirements, tender);
    return normalized.length > 0 ? normalized : defaultQualificationRequirementsForTender(tender);
  } catch (error) {
    console.error("Parsing qualification requirements failed:", error);
    return defaultQualificationRequirementsForTender(tender);
  }
}
