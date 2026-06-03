import type { RedFlag, RedFlagSourceReference } from "../types";
import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import type {
  EvidenceGraphEdgeInput,
  EvidenceGraphNodeType,
  EvidenceItemInput,
  EvidenceOutputType,
} from "../types/evidence";

export const EVIDENCE_PROMPT_BLOCK = `
EVIDENCE (obbligatorio per ogni output analitico su gare):
Oltre al risultato, includi l'array "evidence" con almeno 1 elemento per ogni conclusione critica (SOA, penali, requisiti, margini).
Ogni evidenza deve collegare: documento di gara → clausola/riferimento → regola applicata → dato impresa → conclusione leggibile.
Usa confidence_score 0-100 (intero). Se confidence_score < 70 imposta requires_human_review: true e review_reason con motivo.
Linguaggio conclusion: chiaro, non tecnico, per imprenditore edile.
`;

export const EVIDENCE_JSON_INLINE = `"evidence": [
    {
      "source_document": "disciplinare" | "bando" | "capitolato" | "allegato",
      "source_reference": "Art. 5.2" | "Pag. 12" | "Sezione 3.1",
      "source_text": "estratto testuale originale della clausola",
      "rule_triggered": "SOA_QUALIFICATION_CHECK" | "PENALTY_EXPOSURE" | "FIT_REGION" | etc.,
      "company_data_used": { "chiave": "valore" },
      "conclusion": "frase leggibile per l'utente",
      "confidence_score": 95,
      "requires_human_review": false,
      "review_reason": null
    }
  ]`;

const DOC_LABELS: Record<string, string> = {
  disciplinare: "Disciplinare",
  bando: "Bando",
  capitolato: "Capitolato",
  allegato: "Allegato",
  profilo_impresa: "Profilo impresa",
  storico: "Storico gare",
};

export function clampConfidence(score: unknown): number {
  const n = Number(score);
  if (!Number.isFinite(n)) return 85;
  return Math.round(Math.max(0, Math.min(100, n)));
}

export function normalizeEvidenceItem(raw: unknown): EvidenceItemInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const conclusion = String(o.conclusion ?? o.conclusione ?? "").trim();
  if (!conclusion && !o.source_reference && !o.rule_triggered) return null;

  const confidence = clampConfidence(o.confidence_score ?? o.confidence);
  const requires =
    o.requires_human_review === true ||
    (confidence < 70 && o.requires_human_review !== false);

  return {
    source_document: o.source_document ? String(o.source_document) : null,
    source_reference: o.source_reference ? String(o.source_reference) : null,
    source_text: o.source_text ? String(o.source_text) : null,
    rule_triggered: o.rule_triggered ? String(o.rule_triggered) : null,
    company_data_used:
      o.company_data_used && typeof o.company_data_used === "object"
        ? (o.company_data_used as Record<string, unknown>)
        : null,
    conclusion: conclusion || null,
    confidence_score: confidence,
    requires_human_review: requires,
    review_reason: o.review_reason ? String(o.review_reason) : requires ? "Confidence sotto soglia 70%" : null,
  };
}

export function normalizeEvidenceList(raw: unknown): EvidenceItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEvidenceItem).filter((x): x is EvidenceItemInput => x != null);
}

export function peelEvidenceFromParsed(parsed: Record<string, unknown>): EvidenceItemInput[] {
  const list = normalizeEvidenceList(parsed.evidence);
  delete parsed.evidence;
  return list;
}

export function documentLabel(doc?: string | null): string {
  if (!doc) return "Documento gara";
  return DOC_LABELS[doc.toLowerCase()] ?? doc;
}

/** Catena reasoning numerata per EvidencePanel. */
export function buildReasoningChain(item: EvidenceItemInput): string[] {
  const steps: string[] = [];
  let n = 1;

  if (item.source_document || item.source_reference) {
    const ref = item.source_reference ? ` (${item.source_reference})` : "";
    steps.push(
      `${n}. Il ${documentLabel(item.source_document)}${ref} indica: ${item.source_text?.slice(0, 120) || "requisito o clausola rilevante"}.`
    );
    n++;
  }

  if (item.rule_triggered) {
    steps.push(`${n}. Regola applicata: ${formatRuleLabel(item.rule_triggered)}.`);
    n++;
  }

  const company = item.company_data_used;
  if (company && Object.keys(company).length > 0) {
    const pairs = Object.entries(company)
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    steps.push(`${n}. Dato aziendale: ${pairs}.`);
    n++;
  }

  if (item.conclusion) {
    steps.push(`${n}. Conclusione: ${item.conclusion}`);
  }

  return steps;
}

export function formatRuleLabel(rule: string): string {
  return rule
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildDefaultGraphEdges(item: EvidenceItemInput): EvidenceGraphEdgeInput[] {
  const edges: EvidenceGraphEdgeInput[] = [];
  const doc = documentLabel(item.source_document);
  const clause = item.source_reference ?? "Clausola";
  const rule = item.rule_triggered ? formatRuleLabel(item.rule_triggered) : "Regola";
  const company =
    item.company_data_used && Object.keys(item.company_data_used).length
      ? Object.entries(item.company_data_used)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : "Dati impresa";
  const output = item.conclusion ?? "Output";

  const chain: { node: EvidenceGraphNodeType; label: string }[] = [
    { node: "document", label: doc },
    { node: "clause", label: clause },
    { node: "rule", label: rule },
    { node: "company_data", label: company.slice(0, 48) },
    { node: "output", label: output.slice(0, 56) },
  ];

  for (let i = 0; i < chain.length - 1; i++) {
    edges.push({
      from_node: chain[i].node,
      from_label: chain[i].label,
      to_node: chain[i + 1].node,
      to_label: chain[i + 1].label,
      edge_type: "causes",
    });
  }

  return edges;
}

export function redFlagToEvidence(flag: RedFlag, index: number): EvidenceItemInput {
  const ref = flag.sourceReference;
  return {
    source_document: mapDocFromReference(ref),
    source_reference: ref?.article ?? ref?.clauseTitle ?? flag.articleRef ?? null,
    source_text: ref?.excerpt ?? flag.clause ?? null,
    rule_triggered: `RED_FLAG_${String(flag.type).toUpperCase()}`,
    company_data_used: { severita: flag.severity, titolo: flag.title },
    conclusion: flag.simpleExplanation || flag.title,
    confidence_score: flag.severity === "high" ? 88 : 75,
    requires_human_review: flag.severity === "high",
    review_reason:
      flag.severity === "high" ? "Red flag ad alta severità — verifica clausola sul disciplinare" : null,
  };
}

export function redFlagEvidenceOutputId(index: number): string {
  return `red_flag_${index}`;
}

function mapDocFromReference(ref?: RedFlagSourceReference): string {
  const name = (ref?.documentName ?? "").toLowerCase();
  if (name.includes("disciplin")) return "disciplinare";
  if (name.includes("capitol")) return "capitolato";
  if (name.includes("bando")) return "bando";
  return "bando";
}

/** Evidenze locali per dimensioni fit portfolio (senza LLM). */
export function buildFitScoreEvidence(
  gara: Gara,
  profilo: ProfiloImpresaContext | null
): EvidenceItemInput[] {
  const items: EvidenceItemInput[] = [];

  items.push({
    source_document: "bando",
    source_reference: gara.cig ? `CIG ${gara.cig}` : undefined,
    source_text: gara.titolo,
    rule_triggered: "FIT_SCORE_WEIGHT_30",
    company_data_used: {
      fit_score: gara.fit_score,
      regione_gara: gara.regione ?? "n/d",
      regioni_impresa: profilo?.regioni?.join(", ") ?? "n/d",
    },
    conclusion: `Allineamento profilo-gara (fit): ${gara.fit_score}/100.`,
    confidence_score: 90,
  });

  if (gara.margine_stimato != null) {
    items.push({
      source_document: "profilo_impresa",
      rule_triggered: "MARGINE_STIMATO_WEIGHT_20",
      company_data_used: {
        margine_stimato: gara.margine_stimato,
        soa: profilo?.soa ?? "n/d",
      },
      conclusion: `Margine stimato sulla gara: ${gara.margine_stimato}%.`,
      confidence_score: gara.margine_stimato < 30 ? 65 : 85,
      requires_human_review: gara.margine_stimato < 30,
      review_reason: gara.margine_stimato < 30 ? "Margine basso — verifica computo e ribasso" : null,
    });
  }

  items.push({
    source_document: "bando",
    rule_triggered: "SCORE_SINTETICO_FORMULA",
    company_data_used: {
      urgenza: gara.urgency_score,
      rischio: gara.risk_score,
      carico: gara.carico_score,
    },
    conclusion: `Score sintetico portfolio: ${gara.score_sintetico}/100.`,
    confidence_score: 92,
  });

  return items;
}

/** Evidenza per voce checklist compliance audit. */
export function complianceItemToEvidence(item: {
  id: string;
  titolo: string;
  descrizione?: string;
  categoria?: string;
  obbligatorio?: boolean;
  stato?: string;
  note?: string;
}): EvidenceItemInput {
  return {
    source_document: "bando",
    source_reference: item.titolo,
    source_text: item.descrizione ?? item.note ?? null,
    rule_triggered: "COMPLIANCE_CHECKLIST",
    company_data_used: {
      categoria: item.categoria ?? "n/d",
      obbligatorio: item.obbligatorio ?? true,
      stato: item.stato ?? "NON_INIZIATO",
    },
    conclusion: `Checklist: ${item.titolo} — stato ${item.stato ?? "da completare"}.`,
    confidence_score: item.stato === "COMPLETATO" ? 92 : 75,
    requires_human_review: item.obbligatorio && item.stato !== "COMPLETATO",
    review_reason:
      item.obbligatorio && item.stato !== "COMPLETATO"
        ? "Documento obbligatorio non ancora completato"
        : null,
  };
}

export function mergeEvidenceLists(...lists: EvidenceItemInput[][]): EvidenceItemInput[] {
  const seen = new Set<string>();
  const out: EvidenceItemInput[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.source_reference}|${item.rule_triggered}|${item.conclusion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export type EngineResponseWithEvidence<T> = T & {
  evidence?: EvidenceItemInput[];
};
