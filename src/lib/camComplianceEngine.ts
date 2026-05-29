import type {
  TenderDocument,
  CAMRequirement,
  CAMAssessmentItem,
  CAMComplianceScore,
  CAMComplianceProfile,
  CAMCategoria,
} from "../types";

export function defaultCAMRequirementsForTender(tender: TenderDocument): CAMRequirement[] {
  const base: CAMRequirement[] = [
    {
      id: "cam-001",
      categoria: "ambientale",
      titolo: "Materiali con basso impatto ambientale",
      descrizione: "Utilizzo di materiali certificati con ridotto impatto ambientale (es. EPD, Ecolabel UE).",
      obbligatorio: true,
      normaRiferimento: "D.M. 11/10/2017",
    },
    {
      id: "cam-002",
      categoria: "ambientale",
      titolo: "Gestione rifiuti da costruzione",
      descrizione: "Piano di gestione rifiuti da cantiere con target riciclaggio ≥ 70%.",
      obbligatorio: true,
      normaRiferimento: "D.Lgs. 152/2006",
    },
    {
      id: "cam-003",
      categoria: "energetica",
      titolo: "Efficienza energetica impianti",
      descrizione: "Rispetto dei requisiti minimi di prestazione energetica.",
      obbligatorio: true,
      normaRiferimento: "D.Lgs. 192/2005",
    },
    {
      id: "cam-004",
      categoria: "energetica",
      titolo: "Illuminazione LED o classe A+",
      descrizione: "Impiego di corpi illuminanti ad alta efficienza.",
      obbligatorio: false,
      puntiPremiali: 3,
    },
    {
      id: "cam-005",
      categoria: "sociale",
      titolo: "Clausole sociali occupazione",
      descrizione: "Impegno assunzione lavoratori svantaggiati o disoccupati di lunga durata.",
      obbligatorio: false,
      puntiPremiali: 5,
      normaRiferimento: "Art. 57 D.Lgs. 36/2023",
    },
    {
      id: "cam-006",
      categoria: "qualita",
      titolo: "Sistema di gestione qualità ISO 9001",
      descrizione: "Certificazione ISO 9001 o sistema equivalente.",
      obbligatorio: false,
      puntiPremiali: 2,
    },
    {
      id: "cam-007",
      categoria: "ambientale",
      titolo: "Sistema di gestione ambientale ISO 14001 / EMAS",
      descrizione: "Certificazione ISO 14001 o registrazione EMAS.",
      obbligatorio: false,
      puntiPremiali: 4,
    },
  ];

  // Aggiungi requisiti specifici per categoria gara
  const cat = tender.category?.toUpperCase() ?? "";
  if (cat.includes("OG1") || cat.includes("EDILIZIA")) {
    base.push({
      id: "cam-008",
      categoria: "ambientale",
      titolo: "Aggregati riciclati ≥ 30%",
      descrizione: "Impiego di aggregati riciclati o recuperati per almeno il 30% in peso.",
      obbligatorio: true,
      normaRiferimento: "D.M. 11/10/2017 all. 2",
    });
  }

  return base;
}

export function createCAMAssessmentItems(requirements: CAMRequirement[]): CAMAssessmentItem[] {
  return requirements.map((req) => ({
    requirementId: req.id,
    titolo: req.titolo,
    stato: "non_applicabile" as const,
    documentiNecessari: req.obbligatorio
      ? ["Dichiarazione conformità", "Scheda tecnica prodotto"]
      : ["Documentazione facoltativa"],
  }));
}

export function calculateCAMScore(
  gara: TenderDocument,
  items: CAMAssessmentItem[],
  requirements: CAMRequirement[]
): CAMComplianceScore {
  const obbligatoriIds = requirements.filter((r) => r.obbligatorio).map((r) => r.id);
  const total = obbligatoriIds.length || 1;
  const conformi = items.filter(
    (i) => obbligatoriIds.includes(i.requirementId) && i.stato === "conforme"
  ).length;
  const parziali = items.filter(
    (i) => obbligatoriIds.includes(i.requirementId) && i.stato === "parziale"
  ).length;

  const scoreConformita = Math.round(((conformi + parziali * 0.5) / total) * 100);

  const livelloConformita =
    scoreConformita >= 80
      ? "ALTO"
      : scoreConformita >= 50
      ? "MEDIO"
      : scoreConformita >= 20
      ? "BASSO"
      : "NON_CONFORME";

  const criticitaRilevate = items
    .filter((i) => obbligatoriIds.includes(i.requirementId) && i.stato === "non_conforme")
    .map((i) => `${i.titolo}: non conforme`);

  const raccomandazioni: string[] = [];
  if (scoreConformita < 50) {
    raccomandazioni.push("Pianificare formazione interna su requisiti CAM obbligatori");
    raccomandazioni.push("Verificare conformità materiali con fornitori certificati");
  }
  if (scoreConformita < 80) {
    raccomandazioni.push("Ottenere certificazione ISO 14001 per punti premiali aggiuntivi");
  }

  return {
    gara,
    requirements,
    assessmentItems: items,
    scoreConformita,
    livelloConformita,
    criticitaRilevate,
    raccomandazioni,
    generatedAt: new Date().toISOString(),
  };
}

export function createCAMComplianceProfile(gara: TenderDocument): CAMComplianceProfile {
  const requirements = defaultCAMRequirementsForTender(gara);
  const assessmentItems = createCAMAssessmentItems(requirements);
  const score = calculateCAMScore(gara, assessmentItems, requirements);
  const categoriePresenti = [
    ...new Set(requirements.map((r) => r.categoria)),
  ] as CAMCategoria[];

  return {
    gara,
    score,
    categoriePresenti,
    rischio: score.livelloConformita === "NON_CONFORME" ? "alto" : score.livelloConformita === "BASSO" ? "medio" : "basso",
  };
}

export function updateCAMAssessmentItem(
  assessment: CAMComplianceScore,
  requirements: CAMRequirement[],
  itemId: string,
  stato: CAMAssessmentItem["stato"],
  note?: string
): CAMComplianceScore {
  const updated = assessment.assessmentItems.map((item) =>
    item.requirementId === itemId ? { ...item, stato, noteConformita: note } : item
  );
  return calculateCAMScore(assessment.gara, updated, requirements);
}

export const CAM_LIVELLO_CLASS: Record<CAMComplianceScore["livelloConformita"], string> = {
  ALTO: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  MEDIO: "text-blue-400 border-blue-800 bg-blue-950/40",
  BASSO: "text-amber-400 border-amber-800 bg-amber-950/40",
  NON_CONFORME: "text-red-400 border-red-800 bg-red-950/40",
};

export const CAM_LIVELLO_LABEL: Record<CAMComplianceScore["livelloConformita"], string> = {
  ALTO: "Conformità Alta",
  MEDIO: "Conformità Media",
  BASSO: "Conformità Bassa",
  NON_CONFORME: "Non Conforme",
};

export const CAM_CATEGORIA_LABEL: Record<CAMCategoria, string> = {
  ambientale: "Ambientale",
  energetica: "Energetica",
  sociale: "Sociale",
  qualita: "Qualità",
};
