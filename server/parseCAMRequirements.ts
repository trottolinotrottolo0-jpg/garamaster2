import type {
  TenderDocument,
  CAMRequirement,
  CAMCategoria,
  CAMCategoriaTipologia,
} from "../src/types";
import { CAM_CATEGORIE_STANDARD } from "../src/lib/camCategoriesStandard";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";
import { parseTenderValue } from "../src/lib/bidCalculations";

const CAM_PROMPT = `Sei un esperto di CAM (Criteri Ambientali Minimi) per appalti pubblici italiani.
Analizza il bando e estrai TUTTI i requisiti CAM espliciti e impliciti obbligatori per legge.

Rispondi SOLO con JSON valido, senza markdown: 
{
  "requirements": [
    {
      "id": "req-cam-001",
      "titolo": "titolo",
      "descrizione": "descrizione",
      "categoriaCodice": "CAM-01",
      "obbligatorio": true,
      "deadline": null,
      "confidenza": 95
    }
  ]
}

categoriaCodice: CAM-01 cemento | CAM-02 acciaio | CAM-03 energia | CAM-04 rifiuti | CAM-05 trasporto.
Includi CAM su materiali, energia cantiere, rifiuti, trasporto, processi sostenibili.`;

const CAM_KEYWORDS = [
  "cam",
  "criteri ambientali",
  "ambientale",
  "sostenibil",
  "green",
  "epd",
  "ricicl",
  "rifiut",
  "energia",
  "emission",
  "carbon",
  "euro 6",
  "certificaz",
];

function stripBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function extractCAMFocusedText(fullText: string): string {
  const lower = fullText.toLowerCase();
  const windows: string[] = [];
  for (const kw of CAM_KEYWORDS) {
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

function normalizeTipologia(raw: unknown): CAMCategoriaTipologia {
  const t = String(raw ?? "ALTRO").toUpperCase();
  if (t.includes("MAT")) return "MATERIALE";
  if (t.includes("PROC")) return "PROCESSO";
  if (t.includes("ENE")) return "ENERGIA";
  if (t.includes("RIF")) return "RIFIUTI";
  if (t.includes("TRA")) return "TRASPORTO";
  if (
    t === "MATERIALE" ||
    t === "PROCESSO" ||
    t === "ENERGIA" ||
    t === "RIFIUTI" ||
    t === "TRASPORTO" ||
    t === "ALTRO"
  ) {
    return t as CAMCategoriaTipologia;
  }
  return "ALTRO";
}

function resolveCategoria(raw: unknown, codiceHint?: string): CAMCategoria {
  const hint = String(codiceHint ?? "").toUpperCase();
  if (hint) {
    const found = CAM_CATEGORIE_STANDARD.find(
      (c) => c.codice.toUpperCase() === hint || c.id === hint
    );
    if (found) return found;
  }

  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const codice = String(o.codice ?? o.categoriaCodice ?? "");
    const byCode = CAM_CATEGORIE_STANDARD.find((c) => c.codice === codice);
    if (byCode) return byCode;

    return {
      id: String(o.id ?? `cam-custom-${Date.now()}`),
      codice: codice || "CAM-XX",
      nome: String(o.nome ?? "Requisito CAM"),
      descrizione: String(o.descrizione ?? ""),
      tipologia: normalizeTipologia(o.tipologia),
      obbligatorio: Boolean(o.obbligatorio ?? true),
      percentualeMinimaApplicazione:
        o.percentualeMinimaApplicazione != null
          ? Number(o.percentualeMinimaApplicazione)
          : undefined,
      scorePunti: Math.min(100, Math.max(0, Number(o.scorePunti ?? 10))),
      documentazionerichiesta: Array.isArray(o.documentazionerichiesta)
        ? o.documentazionerichiesta.map(String)
        : [],
      note: String(o.note ?? ""),
    };
  }

  return CAM_CATEGORIE_STANDARD[0];
}

export function defaultCAMRequirementsFromStandard(): CAMRequirement[] {
  return CAM_CATEGORIE_STANDARD.map((cat) => ({
    id: `req-${cat.id}`,
    titolo: cat.nome,
    descrizione: cat.descrizione,
    categoria: cat,
    obbligatorio: cat.obbligatorio,
    confidenza: 75,
  }));
}

function normalizeCAMRequirements(raw: unknown): CAMRequirement[] {
  if (!Array.isArray(raw)) return defaultCAMRequirementsFromStandard();
  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const deadline = o.deadline;
    const categoria = resolveCategoria(o.categoria, String(o.categoriaCodice ?? ""));
    return {
      id: String(o.id ?? `req-cam-${String(index + 1).padStart(3, "0")}`),
      titolo: String(o.titolo ?? categoria.nome),
      descrizione: String(o.descrizione ?? categoria.descrizione),
      categoria,
      obbligatorio: Boolean(o.obbligatorio ?? categoria.obbligatorio),
      deadline:
        deadline != null && String(deadline).trim() && String(deadline) !== "null"
          ? String(deadline)
          : undefined,
      confidenza: Math.min(100, Math.max(0, Number(o.confidenza ?? 75))),
    };
  });
}

export async function parseCAMRequirementsFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<CAMRequirement[]> {
  const data = stripBase64(bandoPdfBase64);
  if (!data) throw new Error("PDF bando non valido.");

  const { default: pdfParse } = await import("pdf-parse");
  const text = String((await pdfParse(Buffer.from(data, "base64")))?.text ?? "").trim();
  if (!text) throw new Error("Testo PDF vuoto — usa un PDF testuale.");

  const importo = parseTenderValue(tender.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : tender.value;

  const model = resolveOpenRouterModel();
  const focused = extractCAMFocusedText(text);
  const prompt = `${CAM_PROMPT}

Documento: ${fileName}
Valore gara: ${importoLabel}
Categoria: ${tender.category}
Regione: ${tender.region}

TESTO BANDO:
${focused}`;

  const { text: responseText } = await deepseekChatCompletion({
    model,
    prompt,
    temperature: 0.2,
    maxTokens: 3500,
  });

  let jsonText = responseText.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);

  const parsed = JSON.parse(jsonText.trim()) as { requirements?: unknown };
  const normalized = normalizeCAMRequirements(parsed.requirements);
  const base = normalized.length > 0 ? normalized : defaultCAMRequirementsFromStandard();
  return validateCAMRequirements(base, tender).enrichedRequirements;
}

export interface CAMValidationIssue {
  severity: "ERROR" | "WARNING";
  message: string;
  requirementId?: string;
}

export interface CAMValidationResult {
  valid: boolean;
  issues: CAMValidationIssue[];
  enrichedRequirements: CAMRequirement[];
}

const MANDATORY_CAM_CODES = ["CAM-01", "CAM-04"];

/**
 * Valida completezza requisiti CAM e integra obbligatori mancanti da catalogo standard.
 */
export function validateCAMRequirements(
  requirements: CAMRequirement[],
  tender: TenderDocument
): CAMValidationResult {
  const issues: CAMValidationIssue[] = [];
  const byCode = new Map<string, CAMRequirement>();

  for (const req of requirements) {
    const code = req.categoria.codice?.toUpperCase() ?? "";
    if (code) byCode.set(code, req);
    if (req.confidenza < 50) {
      issues.push({
        severity: "WARNING",
        message: `Confidenza bassa (${req.confidenza}%) su: ${req.titolo}`,
        requirementId: req.id,
      });
    }
    if (!req.descrizione?.trim()) {
      issues.push({
        severity: "WARNING",
        message: `Descrizione mancante: ${req.titolo}`,
        requirementId: req.id,
      });
    }
  }

  const enriched = [...requirements];
  for (const code of MANDATORY_CAM_CODES) {
    if (!byCode.has(code)) {
      const std = CAM_CATEGORIE_STANDARD.find((c) => c.codice === code);
      if (std) {
        enriched.push({
          id: `req-validated-${std.id}`,
          titolo: std.nome,
          descrizione: std.descrizione,
          categoria: std,
          obbligatorio: true,
          confidenza: 80,
        });
        issues.push({
          severity: "WARNING",
          message: `Aggiunto obbligatorio implicito ${code} (${std.nome})`,
        });
      }
    }
  }

  const importo = parseTenderValue(tender.value);
  if (importo > 500_000 && !enriched.some((r) => r.categoria.codice === "CAM-03")) {
    const std = CAM_CATEGORIE_STANDARD.find((c) => c.codice === "CAM-03");
    if (std && !enriched.some((r) => r.categoria.codice === "CAM-03")) {
      enriched.push({
        id: `req-validated-${std.id}`,
        titolo: std.nome,
        descrizione: std.descrizione,
        categoria: std,
        obbligatorio: true,
        confidenza: 75,
      });
      issues.push({
        severity: "WARNING",
        message: "Gara >500k: aggiunto CAM-03 efficienza energetica",
      });
    }
  }

  const obbligatori = enriched.filter((r) => r.obbligatorio);
  if (obbligatori.length < 3) {
    issues.push({
      severity: "ERROR",
      message: `Solo ${obbligatori.length} requisiti obbligatori CAM — verificare estrazione bando`,
    });
  }

  const valid = !issues.some((i) => i.severity === "ERROR");

  return { valid, issues, enrichedRequirements: enriched };
}

export { CAM_CATEGORIE_STANDARD };
