import type { TenderDocument, TenderRequirement } from "../types";
import type { ProfiloImpresaContext } from "../types/database";

export interface SoaGapItem {
  description: string;
  details: string;
  category: string;
}

export interface SoaGapAnalysis {
  hasGaps: boolean;
  unmetRequirements: TenderRequirement[];
  gaps: SoaGapItem[];
  profiloSoaSummary: string | null;
}

export function detectSoaGaps(
  tender: TenderDocument,
  profilo?: ProfiloImpresaContext | null
): SoaGapAnalysis {
  const unmetRequirements = tender.requirements.filter(
    (r) =>
      !r.satisfied &&
      (r.category === "SOA" ||
        r.category === "Fatturato" ||
        /soa|qualificazione|classifica|og\d|os\d/i.test(r.description))
  );

  const gaps: SoaGapItem[] = unmetRequirements.map((r) => ({
    description: r.description,
    details: r.details,
    category: r.category,
  }));

  const profiloSoaSummary = profilo?.soa?.trim() || profilo?.summary?.trim() || null;
  const profiloMissingSoa = !profiloSoaSummary && unmetRequirements.some((r) => r.category === "SOA");

  const hasGaps = gaps.length > 0 || profiloMissingSoa;

  return {
    hasGaps,
    unmetRequirements,
    gaps,
    profiloSoaSummary,
  };
}

export function buildSoaGapSystemAddendum(
  tender: TenderDocument,
  analysis: SoaGapAnalysis
): string {
  if (!analysis.hasGaps) return "";

  return `
## ⚠️ GAP SOA RILEVATI — AZIONE OBBLIGATORIA PER GEMINI
Il profilo impresa **non copre integralmente** i requisiti di qualificazione della gara CIG ${tender.cig}.

Requisiti non soddisfatti (estratto disciplinare):
${JSON.stringify(analysis.gaps, null, 2)}

Profilo SOA impresa (contesto autenticato): ${analysis.profiloSoaSummary ?? "non compilato o assente"}

**Devi automaticamente** valutare e proporre all'utente, in modo strutturato:
1. **RTI** — se conviene costituire un raggruppamento (con chi, mandataria/mandante, quote %, documenti).
2. **Avvalimento** (art. 104 D.Lgs. 36/2023) — se conviene per requisiti economici/tecnici/organizzativi trasferibili.
3. **Lasciare perdere la gara** — se il gap è strutturale e non colmabile in modo legale.

Spiega: capogruppo RTI, ripartizione quote di partecipazione, imprese ausiliarie, documenti per formalizzare (DGUE, accordi RTI, dichiarazioni avvalimento, attestazioni SOA ausiliarie).
Suggerisci di aprire il modulo **RTI & Avvalimento Configurator** nell'app per un'analisi strutturata.
`;
}
