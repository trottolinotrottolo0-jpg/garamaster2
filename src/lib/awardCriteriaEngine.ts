import type {
  AwardCriterio,
  AwardCriteriaAnalysis,
  AwardCriterioTipo,
  ReverseMapVoce,
} from "../types";

export interface ReverseMappingResult {
  criterioId: string;
  criterio: AwardCriterio;
  voci: ReverseMapVoce[];
  estrategia: string;
  checklist: string[];
}

export function buildReverseMapping(analysis: AwardCriteriaAnalysis): ReverseMappingResult[] {
  const results: ReverseMappingResult[] = [];

  for (const criterio of analysis.criteri) {
    const voci = generateReverseMappingVociForCriterio(criterio);
    const estrategia = buildEstrategiaForCriterio(criterio, voci);
    const checklist = voci.map((v) => `☐ ${v.descrizione}`);

    results.push({
      criterioId: criterio.id,
      criterio,
      voci,
      estrategia,
      checklist,
    });
  }

  return results;
}

/** Popola reverseMap sull'analisi (utile dopo parsing o rebuild client-side). */
export function attachReverseMapToAnalysis(
  analysis: AwardCriteriaAnalysis
): AwardCriteriaAnalysis {
  const mappings = buildReverseMapping(analysis);
  const reverseMap: Record<string, ReverseMapVoce[]> = {};
  for (const m of mappings) {
    reverseMap[m.criterioId] = m.voci;
  }
  return { ...analysis, reverseMap };
}

function resolvePatternTipo(criterio: AwardCriterio): AwardCriterioTipo {
  const blob = `${criterio.titolo} ${criterio.descrizione}`.toLowerCase();
  if (
    criterio.tipoCriterio === "ALTRO" ||
    (criterio.tipoCriterio === "TECNICO" && /sostenib|ambient|cam|energia|co2/.test(blob))
  ) {
    if (/sostenib|ambient|cam|energia|co2|green/.test(blob)) return "SOSTENIBILITA";
  }
  if (criterio.tipoCriterio === "ALTRO") {
    if (/organizz|cronoprogram|gestione|tempi|sicurezza/.test(blob)) return "GESTIONALE";
    if (/prezzo|ribasso|econom/.test(blob)) return "ECONOMICO";
    if (/tecn|qualit|metodolog|bim/.test(blob)) return "TECNICO";
  }
  return criterio.tipoCriterio;
}

function generateReverseMappingVociForCriterio(criterio: AwardCriterio): ReverseMapVoce[] {
  const tipo = resolvePatternTipo(criterio);

  const patterns: Record<AwardCriterioTipo, ReverseMapVoce[]> = {
    SOSTENIBILITA: [
      {
        id: `vm-${criterio.id}-s1`,
        criterioId: criterio.id,
        descrizione: "Certificazione ISO 50001 (Energy Management System)",
        tipologia: "CERTIFICAZIONE",
        obbligatorio: false,
        impatto: "CRITICO",
        note: "Differenzia da competitor, genera punti bonus",
      },
      {
        id: `vm-${criterio.id}-s2`,
        criterioId: criterio.id,
        descrizione: "Piano dettagliato riduzione CO2 con timeline annuale",
        tipologia: "PIANO",
        obbligatorio: true,
        impatto: "CRITICO",
        note: "Richiesto quasi sempre se il criterio è presente",
      },
      {
        id: `vm-${criterio.id}-s3`,
        criterioId: criterio.id,
        descrizione:
          "Progettista senior con track record sostenibilità (2+ progetti CAM)",
        tipologia: "RISORSE",
        obbligatorio: false,
        impatto: "IMPORTANTE",
        note: "CV dettagliato obbligatorio",
      },
      {
        id: `vm-${criterio.id}-s4`,
        criterioId: criterio.id,
        descrizione:
          "Materiali certificati FSC/PEFC e riciclati (legno, acciaio, plastiche)",
        tipologia: "ESPERIENZA",
        obbligatorio: false,
        impatto: "IMPORTANTE",
        note: "Referenze + certificati fornitori",
      },
    ],
    TECNICO: [
      {
        id: `vm-${criterio.id}-t1`,
        criterioId: criterio.id,
        descrizione:
          "Esperienza minima in categoria SOA simile (referenze + dichiarazioni)",
        tipologia: "ESPERIENZA",
        obbligatorio: true,
        impatto: "CRITICO",
        note: "CV + referenze attestate da committenti",
      },
      {
        id: `vm-${criterio.id}-t2`,
        criterioId: criterio.id,
        descrizione:
          "Direttore lavori con iscrizione albo professionale valida",
        tipologia: "CERTIFICAZIONE",
        obbligatorio: true,
        impatto: "CRITICO",
        note: "Documento ufficiale obbligatorio",
      },
      {
        id: `vm-${criterio.id}-t3`,
        criterioId: criterio.id,
        descrizione:
          "Metodologia innovativa / BIM per commesse rilevanti (software, format, processo)",
        tipologia: "PIANO",
        obbligatorio: false,
        impatto: "IMPORTANTE",
        note: "Se il bando richiede BIM, trattalo come obbligatorio",
      },
    ],
    GESTIONALE: [
      {
        id: `vm-${criterio.id}-g1`,
        criterioId: criterio.id,
        descrizione: "Organizzazione progettuale con RACI, responsabili e tempi",
        tipologia: "PIANO",
        obbligatorio: true,
        impatto: "CRITICO",
        note: "Schema organizzativo dettagliato obbligatorio",
      },
      {
        id: `vm-${criterio.id}-g2`,
        criterioId: criterio.id,
        descrizione: "Cronoprogramma realistico con milestone mensili e buffer",
        tipologia: "PIANO",
        obbligatorio: true,
        impatto: "CRITICO",
        note: "Gantt coerente con durata contrattuale",
      },
      {
        id: `vm-${criterio.id}-g3`,
        criterioId: criterio.id,
        descrizione:
          "Piano comunicazione periodica con stazione appaltante (report mensili)",
        tipologia: "PIANO",
        obbligatorio: false,
        impatto: "UTILE",
        note: "Aumenta fiducia del committente",
      },
    ],
    ECONOMICO: [
      {
        id: `vm-${criterio.id}-e1`,
        criterioId: criterio.id,
        descrizione:
          "Offerta economica competitiva con ribasso coerente al mercato di riferimento",
        tipologia: "PIANO",
        obbligatorio: true,
        impatto: "CRITICO",
        note: "Allinea prezzario e analisi costi prima della gara",
      },
      {
        id: `vm-${criterio.id}-e2`,
        criterioId: criterio.id,
        descrizione: "Giustificazione voci di costo e assenza di sotto-prezzamento rischioso",
        tipologia: "PIANO",
        obbligatorio: true,
        impatto: "IMPORTANTE",
        note: "Evita esclusioni per offerta anomala",
      },
    ],
    ALTRO: [
      {
        id: `vm-${criterio.id}-a1`,
        criterioId: criterio.id,
        descrizione: `Risposta puntuale al testo del bando: ${criterio.titolo}`,
        tipologia: "PIANO",
        obbligatorio: true,
        impatto: "CRITICO",
        note: "Citare requisiti del disciplinare paragrafo per paragrafo",
      },
      {
        id: `vm-${criterio.id}-a2`,
        criterioId: criterio.id,
        descrizione: "Referenze e allegati dimostrativi coerenti con il criterio",
        tipologia: "ESPERIENZA",
        obbligatorio: false,
        impatto: "IMPORTANTE",
        note: "Massimizza punteggio con evidenze verificabili",
      },
    ],
  };

  return patterns[tipo] ?? patterns.ALTRO;
}

function buildEstrategiaForCriterio(criterio: AwardCriterio, voci: ReverseMapVoce[]): string {
  const obbligatorie = voci.filter((v) => v.obbligatorio);
  const critiche = voci.filter((v) => v.impatto === "CRITICO");

  let estrategia = `Per massimizzare i ${criterio.puntiTotali} punti su «${criterio.titolo}»:\n`;

  if (criterio.sogliaMinima != null) {
    estrategia += `\n⚠ Soglia minima indicata: ${criterio.sogliaMinima} punti — sotto questa soglia si rischia l'esclusione.\n`;
  }

  if (obbligatorie.length > 0) {
    estrategia += `\n1. REQUISITI OBBLIGATORI (non negoziabili):\n`;
    obbligatorie.forEach((v) => {
      estrategia += `   - ${v.descrizione}\n`;
    });
  }

  const criticheExtra = critiche.filter((v) => !v.obbligatorio);
  if (criticheExtra.length > 0) {
    estrategia += `\n2. FATTORI CRITICI (differenziano dai competitor):\n`;
    criticheExtra.forEach((v) => {
      estrategia += `   - ${v.descrizione}\n`;
    });
  }

  const utili = voci.filter((v) => v.impatto === "UTILE" && !v.obbligatorio);
  if (utili.length > 0) {
    estrategia += `\n3. BONUS AGGIUNTIVI:\n`;
    utili.forEach((v) => {
      estrategia += `   - ${v.descrizione}\n`;
    });
  }

  return estrategia.trim();
}

export const IMPATTO_CLASS: Record<ReverseMapVoce["impatto"], string> = {
  CRITICO: "text-red-400",
  IMPORTANTE: "text-amber-400",
  UTILE: "text-slate-400",
};

export interface CompetitorBenchmark {
  criterioId: string;
  criterio: AwardCriterio;
  puntiVoiStimati: number;
  puntiCompetitorMedio: number;
  puntiTopCompetitor: number;
  gapaVsCompetitor: number;
  strategiaPerSuperare: string;
  difficoltaSuperare: "FACILE" | "MEDIA" | "DIFFICILE";
}

export function benchmarkCompetitorOnCriterio(
  criterio: AwardCriterio,
  voiScore: number,
  reverseMapVoci: ReverseMapVoce[]
): CompetitorBenchmark {
  const puntiVoiStimati = Math.min(
    criterio.puntiTotali,
    Math.max(0, Math.round(voiScore))
  );
  const puntiCompetitorMedio = Math.round(criterio.puntiTotali * 0.6);
  const puntiTopCompetitor = Math.round(criterio.puntiTotali * 0.85);
  const gapaVsCompetitor = puntiVoiStimati - puntiCompetitorMedio;

  let difficoltaSuperare: CompetitorBenchmark["difficoltaSuperare"] = "MEDIA";
  if (gapaVsCompetitor > 5) difficoltaSuperare = "FACILE";
  else if (gapaVsCompetitor < -3) difficoltaSuperare = "DIFFICILE";

  const strategiaPerSuperare = buildStrategiaPerSuperare(
    reverseMapVoci,
    gapaVsCompetitor,
    difficoltaSuperare
  );

  return {
    criterioId: criterio.id,
    criterio,
    puntiVoiStimati,
    puntiCompetitorMedio,
    puntiTopCompetitor,
    gapaVsCompetitor,
    strategiaPerSuperare,
    difficoltaSuperare,
  };
}

function buildStrategiaPerSuperare(
  voci: ReverseMapVoce[],
  gapa: number,
  difficolta: CompetitorBenchmark["difficoltaSuperare"]
): string {
  const critiche = voci.filter((v) => v.impatto === "CRITICO" && !v.obbligatorio);

  if (difficolta === "FACILE") {
    return `Siete avvantaggiati (${gapa >= 0 ? "+" : ""}${gapa} pt vs media). Mantenete focus su requisiti obbligatori e aggiungete 1-2 fattori critici per distaccare.`;
  }
  if (difficolta === "DIFFICILE") {
    return `Competitor forti su questo criterio (gap ${gapa} pt). Strategy: (1) Coprire TUTTE le obbligatorie perfettamente, (2) Aggiungere 3+ fattori critici, (3) Bonus su elementi innovativi.`;
  }
  const focus =
    critiche.length > 0 ? critiche[0].descrizione : "requisiti obbligatori";
  return `Competizione media (gap ${gapa >= 0 ? "+" : ""}${gapa} pt). Differenziatevi su: ${focus}. Aggiungete 2-3 bonus per staccare.`;
}

export interface CriteriaComparison {
  bando1Titolo: string;
  bando2Titolo: string;
  criteriComuni: AwardCriterio[];
  criteriSoloInBando1: AwardCriterio[];
  criteriSoloInBando2: AwardCriterio[];
  deltaComplessita: number;
  puntiDifferenziazioneConsigliati: string[];
  pattern: "SIMILI" | "LEGGERMENTE_DIVERSI" | "MOLTO_DIVERSI";
}

export function compareAwardCriteria(
  analysis1: AwardCriteriaAnalysis,
  analysis2: AwardCriteriaAnalysis
): CriteriaComparison {
  const criteriComuni = analysis1.criteri.filter((c1) =>
    analysis2.criteri.some(
      (c2) =>
        c2.tipoCriterio === c1.tipoCriterio ||
        normalizeTitolo(c2.titolo) === normalizeTitolo(c1.titolo)
    )
  );

  const criteriSoloInBando1 = analysis1.criteri.filter(
    (c1) =>
      !analysis2.criteri.some(
        (c2) =>
          c2.tipoCriterio === c1.tipoCriterio ||
          normalizeTitolo(c2.titolo) === normalizeTitolo(c1.titolo)
      )
  );

  const criteriSoloInBando2 = analysis2.criteri.filter(
    (c2) =>
      !analysis1.criteri.some(
        (c1) =>
          c1.tipoCriterio === c2.tipoCriterio ||
          normalizeTitolo(c1.titolo) === normalizeTitolo(c2.titolo)
      )
  );

  const deltaComplessita =
    analysis2.complessitaValutazione - analysis1.complessitaValutazione;

  const maxLen = Math.max(analysis1.criteri.length, analysis2.criteri.length, 1);
  const overlapRatio = criteriComuni.length / maxLen;

  let pattern: CriteriaComparison["pattern"] = "SIMILI";
  if (overlapRatio < 0.6) pattern = "MOLTO_DIVERSI";
  else if (overlapRatio < 0.8) pattern = "LEGGERMENTE_DIVERSI";

  const puntiDifferenziazioneConsigliati = [
    ...criteriSoloInBando2.map(
      (c) => `Prepara offerta su «${c.titolo}» (nuovo in questo bando)`
    ),
    ...criteriSoloInBando1.map(
      (c) => `Attenzione: «${c.titolo}» non richiesto nel secondo bando`
    ),
  ];

  return {
    bando1Titolo: analysis1.tender.title,
    bando2Titolo: analysis2.tender.title,
    criteriComuni,
    criteriSoloInBando1,
    criteriSoloInBando2,
    deltaComplessita,
    puntiDifferenziazioneConsigliati,
    pattern,
  };
}

function normalizeTitolo(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim()
    .slice(0, 40);
}

export interface ScoreSimulation {
  criterioId: string;
  criterio: AwardCriterio;
  elementsPresentati: string[];
  elementsAssenti: string[];
  stima: number;
  confidence: number;
  reasoning: string;
}

function voceMatchesElements(voce: ReverseMapVoce, elementsPresentati: string[]): boolean {
  const desc = voce.descrizione.toLowerCase();
  const snippet = desc.slice(0, 22);
  const tokens = desc.split(/\s+/).filter((w) => w.length > 4).slice(0, 5);
  return elementsPresentati.some((e) => {
    const el = e.toLowerCase();
    if (snippet.length >= 8 && el.includes(snippet.slice(0, 15))) return true;
    return tokens.some((t) => el.includes(t));
  });
}

export function simulateScoreForCriterio(
  criterio: AwardCriterio,
  reverseMapVoci: ReverseMapVoce[],
  elementsPresentati: string[]
): ScoreSimulation {
  const obbligatorie = reverseMapVoci.filter((v) => v.obbligatorio);
  const critiche = reverseMapVoci.filter((v) => v.impatto === "CRITICO");
  const utili = reverseMapVoci.filter((v) => v.impatto === "UTILE");

  const obbligatoriePresenti = obbligatorie.filter((v) =>
    voceMatchesElements(v, elementsPresentati)
  );
  const critichePresenti = critiche.filter((v) => voceMatchesElements(v, elementsPresentati));
  const utiliPresenti = utili.filter((v) => voceMatchesElements(v, elementsPresentati));

  let score = 0;
  if (obbligatorie.length > 0) {
    score +=
      (obbligatoriePresenti.length / obbligatorie.length) * (criterio.puntiTotali * 0.6);
  } else {
    score += criterio.puntiTotali * 0.35;
  }

  if (critiche.length > 0) {
    score +=
      (critichePresenti.length / critiche.length) * (criterio.puntiTotali * 0.3);
  }

  score += Math.min(utiliPresenti.length * 2, criterio.puntiTotali * 0.1);

  const elementsAssenti = reverseMapVoci
    .filter((v) => !voceMatchesElements(v, elementsPresentati))
    .map((v) => v.descrizione);

  const stima = Math.min(criterio.puntiTotali, Math.round(score));
  const coverage =
    reverseMapVoci.length > 0
      ? (reverseMapVoci.length - elementsAssenti.length) / reverseMapVoci.length
      : 0.5;
  const confidence = Math.round(Math.min(95, Math.max(40, 50 + coverage * 45)));

  const reasoning =
    stima >= criterio.puntiTotali * 0.85
      ? "Offerta forte su questo criterio — probabilità alta di segnare il massimo"
      : stima >= criterio.puntiTotali * 0.6
        ? "Offerta solida — copre la base; potrebbero mancare elementi differenzianti"
        : criterio.sogliaMinima != null && stima < criterio.sogliaMinima
          ? `Rischio sotto soglia minima (${criterio.sogliaMinima} pt) — rafforzare documentazione`
          : "Offerta debole — integrare obbligatori e fattori critici";

  return {
    criterioId: criterio.id,
    criterio,
    elementsPresentati,
    elementsAssenti,
    stima,
    confidence,
    reasoning,
  };
}

export const CRITERIA_PATTERN_LABEL: Record<CriteriaComparison["pattern"], string> = {
  SIMILI: "Criteri simili",
  LEGGERMENTE_DIVERSI: "Leggermente diversi",
  MOLTO_DIVERSI: "Molto diversi",
};
