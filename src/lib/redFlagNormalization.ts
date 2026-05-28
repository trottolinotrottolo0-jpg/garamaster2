import type {
  ExplainabilityData,
  RedFlag,
  RedFlagCategory,
  RiskLevel,
  TenderDocument,
} from "../types";
import { normalizeExplainability } from "./explainability";

const KNOWN_CATEGORIES: RedFlagCategory[] = [
  "hyper_detailed_specs",
  "unbalanced_award_criteria",
  "anomalous_timeline",
  "restrictive_requirement_combination",
  "requisito_sproporzionato",
  "clausola_sensibile",
  "rischio_operativo",
  "rischio_esclusione",
  "altro",
];

/**
 * Normalizza la categoria restituita dal LLM (slug, testo libero, varianti italiane).
 */
export function normalizeRedFlagCategory(value: unknown): RedFlagCategory | string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "altro";

  const slug = raw.replace(/\s+/g, "_");
  const compact = raw.replace(/[_\s-]+/g, "");

  if (
    slug.includes("requisito_sproporzionato") ||
    slug.includes("requisiti_sproporzionati") ||
    (slug.includes("requisit") && slug.includes("sproporzion")) ||
    compact.includes("requisitisproporzionat")
  ) {
    return "requisito_sproporzionato";
  }

  if (
    slug.includes("rischio_esclusione") ||
    slug.includes("aumento_rischio_esclusione") ||
    (slug.includes("esclusion") && (slug.includes("rischio") || slug.includes("requisit"))) ||
    compact.includes("rischioesclusione")
  ) {
    return "rischio_esclusione";
  }

  if (
    slug.includes("rischio_operativo") ||
    slug.includes("clausola_operativa") ||
    (slug.includes("operativ") &&
      (slug.includes("rischio") || slug.includes("cantiere") || slug.includes("esecut"))) ||
    compact.includes("rischiooperativo")
  ) {
    return "rischio_operativo";
  }

  if (
    slug.includes("clausola_sensibil") ||
    slug.includes("clausole_sensibil") ||
    (slug.includes("clausol") && slug.includes("sensibil"))
  ) {
    return "clausola_sensibile";
  }

  if (slug.includes("hyper") || slug.includes("iper") || slug.includes("detailed")) {
    return "hyper_detailed_specs";
  }
  if (slug.includes("unbalanced") || slug.includes("sbilanc")) {
    return "unbalanced_award_criteria";
  }
  if (slug.includes("timeline") || slug.includes("tempi_anomali") || slug.includes("anomalous")) {
    return "anomalous_timeline";
  }
  if (slug.includes("combination") || slug.includes("combinazione")) {
    return "restrictive_requirement_combination";
  }

  if (KNOWN_CATEGORIES.includes(slug as RedFlagCategory)) {
    return slug as RedFlagCategory;
  }

  return slug;
}

export function buildRedFlagExplainabilityFallback(
  redFlags: RedFlag[],
  context: {
    sintesiRischio?: string;
    rischioComplessivo?: RiskLevel;
    tender?: Pick<TenderDocument, "title" | "cig">;
  }
): ExplainabilityData {
  const highCount = redFlags.filter((r) => r.severity === "high").length;
  const mediumCount = redFlags.filter((r) => r.severity === "medium").length;
  const categories = [...new Set(redFlags.map((r) => r.type).filter(Boolean))];

  const perche =
    context.sintesiRischio?.trim() ||
    "Il sistema ha rilevato clausole o requisiti che possono incidere su ammissione, sostenibilità operativa o convenienza della partecipazione.";

  const tenderRef = context.tender?.cig
    ? `CIG ${context.tender.cig}`
    : context.tender?.title
      ? `gara «${context.tender.title.slice(0, 80)}»`
      : "dati gara analizzati";

  const datiUsati = [
    `Analisi Red Flag su ${tenderRef}.`,
    redFlags.length > 0
      ? `${redFlags.length} elemento/i segnalato/i (${highCount} alta, ${mediumCount} media severità).`
      : "Nessun elemento specifico estratto; profilo di rischio da confermare sul disciplinare.",
    categories.length > 0 ? `Categorie: ${categories.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const verificaParts = [
    "Verificare coerenza con disciplinare, requisiti richiesti, documentazione disponibile e tempi di risposta.",
  ];
  if (highCount > 0) {
    verificaParts.push(
      "Richiedere revisione umana se il rischio è medio/alto o se la clausola incide su ammissione, offerta tecnica o offerta economica."
    );
    verificaParts.push(
      "Priorità alle criticità ad alta severità: proporzionalità dei requisiti, basi di esclusione e oneri esecutivi."
    );
  } else if (mediumCount > 0) {
    verificaParts.push(
      "Richiedere revisione umana se la clausola incide su ammissione o su elementi premiali dell'offerta."
    );
  } else {
    verificaParts.push(
      "Richiedere revisione umana se permangono dubbi su ammissione o sostenibilità operativa della partecipazione."
    );
  }

  let confidenza = "Medio";
  if (context.rischioComplessivo === "high" || highCount >= 1) {
    confidenza = "Basso";
  } else if (context.rischioComplessivo === "low" && highCount === 0 && mediumCount === 0) {
    confidenza = "Alto";
  }

  return {
    perche,
    datiUsati,
    verifica: verificaParts.join(" "),
    confidenza,
  };
}

export function resolveRedFlagExplainability(
  raw: Partial<ExplainabilityData> | null | undefined,
  redFlags: RedFlag[],
  context: {
    sintesiRischio?: string;
    rischioComplessivo?: RiskLevel;
    tender?: Pick<TenderDocument, "title" | "cig">;
  }
): ExplainabilityData | undefined {
  const normalized = normalizeExplainability(raw ?? null);
  if (normalized) return normalized;
  if (redFlags.length === 0) return undefined;
  return buildRedFlagExplainabilityFallback(redFlags, context);
}
