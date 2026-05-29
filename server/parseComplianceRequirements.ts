import type {
  TenderDocument,
  ComplianceRequirement,
  ComplianceRequirementCategoria,
  RiskFattore,
  RiskFattoreCategoria,
} from "../src/types";
import { deepseekChatCompletion, resolveOpenRouterModel } from "./deepseekChat";
import { Buffer } from "node:buffer";
import { parseTenderValue } from "../src/lib/bidCalculations";

const COMPLIANCE_PROMPT = `Sei un esperto di compliance e requisiti normativi per appalti pubblici italiani.
Analizza il bando e estrai TUTTI i requisiti di compliance.

Rispondi SOLO con JSON valido, senza markdown:
{
  "requirements": [
    {
      "id": "req-001",
      "titolo": "titolo",
      "descrizione": "descrizione completa",
      "categoria": "DOCUMENTALE",
      "obbligatorio": true,
      "deadline": null,
      "note": "",
      "confidenza": 95
    }
  ]
}

categoria: DOCUMENTALE | ASSICURATIVA | CERTIFICAZIONE | ORGANIZZATIVA | ALTRO.
Includi: SOA, ISO, assicurazioni RC, antimafia, tracciabilità, CV, direttore lavori, documenti obbligatori.`;

const COMPLIANCE_KEYWORDS = [
  "requisiti",
  "documentazione",
  "assicurazione",
  "garanzia",
  "antimafia",
  "soa",
  "certificaz",
  "dichiaraz",
  "allegat",
  "tracciabilit",
  "qualificazione",
];

function stripBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "").trim();
}

function extractComplianceFocusedText(fullText: string): string {
  const lower = fullText.toLowerCase();
  const windows: string[] = [];
  for (const kw of COMPLIANCE_KEYWORDS) {
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

function normalizeCategoria(raw: unknown): ComplianceRequirementCategoria {
  const t = String(raw ?? "ALTRO").toUpperCase();
  if (t.includes("ASSICUR")) return "ASSICURATIVA";
  if (t.includes("CERTIF")) return "CERTIFICAZIONE";
  if (t.includes("ORGAN")) return "ORGANIZZATIVA";
  if (t.includes("DOC")) return "DOCUMENTALE";
  if (
    t === "DOCUMENTALE" ||
    t === "ASSICURATIVA" ||
    t === "CERTIFICAZIONE" ||
    t === "ORGANIZZATIVA" ||
    t === "ALTRO"
  ) {
    return t as ComplianceRequirementCategoria;
  }
  return "ALTRO";
}

function normalizeRequirements(raw: unknown): ComplianceRequirement[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const deadline = o.deadline;
    return {
      id: String(o.id ?? `req-${String(index + 1).padStart(3, "0")}`),
      titolo: String(o.titolo ?? `Requisito ${index + 1}`),
      descrizione: String(o.descrizione ?? o.titolo ?? ""),
      categoria: normalizeCategoria(o.categoria),
      obbligatorio: Boolean(o.obbligatorio ?? true),
      deadline:
        deadline != null && String(deadline).trim() && String(deadline) !== "null"
          ? String(deadline)
          : undefined,
      note: String(o.note ?? ""),
      confidenza: Math.min(100, Math.max(0, Number(o.confidenza ?? 75))),
    };
  });
}

function normalizeRiskCategoria(raw: unknown): RiskFattoreCategoria {
  const t = String(raw ?? "ALTRO").toUpperCase();
  if (t.includes("REPUT")) return "REPUTAZIONALE";
  if (t.includes("OPER")) return "OPERATIVO";
  if (t.includes("FINAN")) return "FINANZIARIO";
  if (t.includes("LEGAL")) return "LEGALE";
  if (
    t === "LEGALE" ||
    t === "REPUTAZIONALE" ||
    t === "OPERATIVO" ||
    t === "FINANZIARIO" ||
    t === "ALTRO"
  ) {
    return t as RiskFattoreCategoria;
  }
  return "ALTRO";
}

function normalizeRiskFactori(raw: unknown): RiskFattore[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((item, index) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const probabilita = Math.min(100, Math.max(0, Number(o.probabilita ?? 50)));
    const impatto = Math.min(100, Math.max(0, Number(o.impatto ?? 50)));
    const mitigazione = Array.isArray(o.mitigazione) ? o.mitigazione.map(String) : [];
    return {
      id: String(o.id ?? `risk-${String(index + 1).padStart(3, "0")}`),
      nome: String(o.nome ?? `Rischio ${index + 1}`),
      descrizione: String(o.descrizione ?? ""),
      categoria: normalizeRiskCategoria(o.categoria),
      probabilita,
      impatto,
      score: Math.round((probabilita * impatto) / 100),
      mitigazione,
      confidenza: Math.min(100, Math.max(0, Number(o.confidenza ?? 75))),
    };
  });
}

export async function parseComplianceRequirementsFromBando(
  bandoPdfBase64: string,
  fileName: string,
  _tender: TenderDocument
): Promise<ComplianceRequirement[]> {
  const data = stripBase64(bandoPdfBase64);
  if (!data) throw new Error("PDF bando non valido.");

  const { default: pdfParse } = await import("pdf-parse");
  const text = String((await pdfParse(Buffer.from(data, "base64")))?.text ?? "").trim();
  if (!text) throw new Error("Testo PDF vuoto — usa un PDF testuale.");

  const model = resolveOpenRouterModel();
  const focused = extractComplianceFocusedText(text);
  const prompt = `${COMPLIANCE_PROMPT}

Documento: ${fileName}

TESTO:
${focused}`;

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
  return normalizeRequirements(parsed.requirements);
}

function supplementRiskFactori(
  risks: RiskFattore[],
  tender: TenderDocument,
  complianceRequirements: ComplianceRequirement[]
): RiskFattore[] {
  const importo = parseTenderValue(tender.value);
  const blob = complianceRequirements
    .map((r) => `${r.titolo} ${r.descrizione} ${r.categoria}`)
    .join(" ")
    .toLowerCase();

  const hasKeyword = (kw: string) => blob.includes(kw);
  const hasRiskNamed = (fragment: string) =>
    risks.some((r) => r.nome.toLowerCase().includes(fragment));

  const extras: RiskFattore[] = [];

  if (
    (importo >= 40_000 || importo === 0) &&
    !hasRiskNamed("antimafia") &&
    !hasRiskNamed("sof")
  ) {
    extras.push({
      id: "risk-antimafia",
      nome: "Non conformità antimafia / SOF",
      descrizione:
        "Mancanza SOF, DURC o tracciabilità flussi — esclusione automatica e sanzioni ANAC.",
      categoria: "LEGALE",
      probabilita: hasKeyword("antimafia") || hasKeyword("sof") ? 55 : 40,
      impatto: 95,
      score: 0,
      mitigazione: [
        "Verifica DURC e casellario aggiornati",
        "Compilazione SOF e dichiarazioni sostitutive",
        "Procedura tracciabilità pagamenti subappaltatori",
      ],
      confidenza: 85,
    });
  }

  if (
    (hasKeyword("assicur") || hasKeyword("garanzia") || hasKeyword("fideiuss") || importo > 150_000) &&
    !hasRiskNamed("finanz")
  ) {
    extras.push({
      id: "risk-fin-garanzia",
      nome: "Garanzia e assicurazioni insufficienti",
      descrizione:
        "Cauzione provvisoria/definitiva o polizza RC non conformi — rischio esclusione economica.",
      categoria: "FINANZIARIO",
      probabilita: 50,
      impatto: 80,
      score: 0,
      mitigazione: [
        "Calcolo garanzia 5-10% importo gara",
        "Polizza RC triennale adeguata al valore contratto",
      ],
      confidenza: 80,
    });
  }

  if (hasKeyword("tracciabil") && !hasRiskNamed("tracciabil")) {
    extras.push({
      id: "risk-tracciabilita",
      nome: "Violazione tracciabilità flussi",
      descrizione: "Pagamenti non tracciati verso subappaltatori — sanzioni e confisca.",
      categoria: "LEGALE",
      probabilita: 45,
      impatto: 90,
      score: 0,
      mitigazione: ["Registro pagamenti su conti dedicati", "Comunicazioni ANAC tempestive"],
      confidenza: 82,
    });
  }

  const merged = [...risks, ...extras].map((r) => ({
    ...r,
    score: r.score || Math.round((r.probabilita * r.impatto) / 100),
  }));

  const seen = new Set<string>();
  return merged.filter((r) => {
    const key = r.nome.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function identifyRiskFactori(
  tender: TenderDocument,
  complianceRequirements: ComplianceRequirement[]
): Promise<RiskFattore[]> {
  const importo = parseTenderValue(tender.value);
  const importoLabel =
    importo > 0 ? `€${importo.toLocaleString("it-IT")}` : tender.value;

  const reqsBlock =
    complianceRequirements
      .map(
        (r) =>
          `- ${r.titolo} [${r.categoria}] obbligatorio=${r.obbligatorio} conf=${r.confidenza}%`
      )
      .join("\n") || "Nessuno estratto — inferire da importo e categoria";

  const prompt = `Sei un esperto di risk assessment per appalti pubblici italiani.
Identifica TUTTI i fattori di rischio rilevanti per questa gara (minimo 5, massimo 12).

GARA:
- Titolo: ${tender.title}
- Importo: ${importoLabel}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Procedura: ${tender.procedureType || "non specificata"}
- Scadenza: ${tender.deadline}

REQUISITI COMPLIANCE ESTRATTI:
${reqsBlock}

Rispondi SOLO con un JSON array valido, senza markdown:
[
  {
    "id": "risk-001",
    "nome": "nome rischio",
    "descrizione": "2-3 frasi",
    "categoria": "LEGALE",
    "probabilita": 65,
    "impatto": 80,
    "mitigazione": ["azione 1", "azione 2"],
    "confidenza": 85
  }
]

categoria: LEGALE | REPUTAZIONALE | OPERATIVO | FINANZIARIO | ALTRO.

DEVI includere dove pertinente:
- Documentazione incompleta / errori formali
- Antimafia, SOF, DURC, tracciabilità
- Timeline e scadenze bando
- Garanzie, cauzioni, assicurazioni RC
- Cash flow e ritardi pagamento PA
- Reputazione (sicurezza, lavoro, subappalti)
- Complessità organizzativa e subappalti`;

  const model = resolveOpenRouterModel();
  const { text } = await deepseekChatCompletion({
    model,
    prompt,
    temperature: 0.35,
    maxTokens: 4000,
  });

  let jsonText = text.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);

  const parsed = JSON.parse(jsonText.trim()) as unknown;
  const normalized = normalizeRiskFactori(parsed);
  return supplementRiskFactori(normalized, tender, complianceRequirements);
}

export async function parseRiskComplianceFromBando(
  bandoPdfBase64: string,
  fileName: string,
  tender: TenderDocument
): Promise<{ complianceRequirements: ComplianceRequirement[]; riskFactori: RiskFattore[] }> {
  const complianceRequirements = await parseComplianceRequirementsFromBando(
    bandoPdfBase64,
    fileName,
    tender
  );
  const riskFactori = await identifyRiskFactori(tender, complianceRequirements);
  return { complianceRequirements, riskFactori };
}
