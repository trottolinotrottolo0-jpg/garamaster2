import type {
  TenderDocument,
  CompanyProfile,
  TenderRequirement,
  QualificationRequirement,
  CompanyQualificationStatus,
  QualificationAssessment,
  QualificationReadinessPath,
  QualificationRequirementTipo,
  QualificationStatusValore,
} from "../types";

export function mapTenderRequirementToQualification(
  req: TenderRequirement,
  idx: number
): QualificationRequirement {
  const tipoMap: Record<TenderRequirement["category"], QualificationRequirementTipo> = {
    SOA: "SOA",
    ISO: "ISO",
    Fatturato: "fatturato",
    Referenze: "referenze",
    Altro: "altro",
  };

  return {
    id: `qr-${idx}`,
    tipo: tipoMap[req.category] ?? "altro",
    descrizione: req.description,
    soglia: req.details,
    obbligatorio: true,
    articoloRiferimento: req.category === "SOA" ? "Art. 100 D.Lgs. 36/2023" : undefined,
  };
}

export function matchRequirementToCompany(
  req: QualificationRequirement,
  company?: CompanyProfile
): CompanyQualificationStatus {
  if (!company) {
    return { requirementId: req.id, status: "NON_VERIFICABILE" };
  }

  let status: QualificationStatusValore = "NON_VERIFICABILE";

  if (req.tipo === "SOA") {
    const hasSOA = company.soaCategories && company.soaCategories.length > 0;
    status = hasSOA ? "SODDISFATTO" : "MANCANTE";
  } else if (req.tipo === "fatturato") {
    const revenue = company.lastYearRevenue ?? 0;
    status = revenue > 0 ? "SODDISFATTO" : "NON_VERIFICABILE";
  } else if (req.tipo === "ISO") {
    status = "NON_VERIFICABILE";
  } else {
    status = "NON_VERIFICABILE";
  }

  return {
    requirementId: req.id,
    status,
    documentoDisponibile: status === "SODDISFATTO",
  };
}

export function assessQualification(
  gara: TenderDocument,
  requirements: QualificationRequirement[],
  company?: CompanyProfile
): QualificationAssessment {
  const matchingStatus = requirements.map((r) => matchRequirementToCompany(r, company));

  const soddisfatti = matchingStatus.filter((s) => s.status === "SODDISFATTO").length;
  const compliancePercent =
    requirements.length > 0 ? Math.round((soddisfatti / requirements.length) * 100) : 0;

  const gapsCritici = matchingStatus
    .filter((s) => s.status === "MANCANTE")
    .map((s) => {
      const req = requirements.find((r) => r.id === s.requirementId);
      return req ? `${req.descrizione}: MANCANTE` : `Requisito ${s.requirementId}: MANCANTE`;
    });

  const gapsColmabili = matchingStatus
    .filter((s) => s.status === "PARZIALE" || s.status === "NON_VERIFICABILE")
    .map((s) => {
      const req = requirements.find((r) => r.id === s.requirementId);
      return req ? `${req.descrizione}: da verificare` : `Requisito ${s.requirementId}`;
    });

  const raccomandazioneFinale =
    gapsCritici.length === 0
      ? "PARTECIPA"
      : gapsCritici.length <= 1
      ? "PARTECIPA_CON_RTI"
      : gapsCritici.filter((g) => g.includes("SOA")).length > 0
      ? "AVVALIMENTO"
      : "NON_PARTECIPARE";

  return {
    gara,
    requirements,
    matchingStatus,
    compliancePercent,
    requirementsTotal: requirements.length,
    gapsCritici,
    gapsColmabili,
    raccomandazioneFinale,
    generatedAt: new Date().toISOString(),
  };
}

export function generateQualificationPath(
  assessment: QualificationAssessment,
  requirements: QualificationRequirement[]
): QualificationReadinessPath[] {
  const paths: QualificationReadinessPath[] = [];
  let stepIdx = 0;

  for (const gap of assessment.gapsCritici) {
    const reqId = assessment.matchingStatus.find(
      (s) => s.status === "MANCANTE"
    )?.requirementId;
    const req = reqId ? requirements.find((r) => r.id === reqId) : undefined;

    paths.push({
      stepId: `step-${stepIdx++}`,
      azione: req?.tipo === "SOA"
        ? `Attivare avvalimento SOA per ${req.descrizione}`
        : `Colmare gap: ${gap}`,
      priorita: "alta",
      tempoStimato: req?.tipo === "SOA" ? "2-4 settimane" : "1-2 settimane",
      gapColmato: gap,
    });
  }

  for (const gap of assessment.gapsColmabili) {
    paths.push({
      stepId: `step-${stepIdx++}`,
      azione: `Verificare e documentare: ${gap}`,
      priorita: "media",
      tempoStimato: "3-7 giorni",
      gapColmato: gap,
    });
  }

  return paths;
}

export function generateRTIRecommendations(assessment: QualificationAssessment): string[] {
  const seen = new Set<string>();
  const recs: string[] = [];

  for (const gap of assessment.gapsCritici) {
    const key = gap.split(":")[0].trim();
    if (seen.has(key)) continue;
    seen.add(key);
    recs.push(`Ricerca partner RTI per colmare: ${key}`);
  }

  if (assessment.raccomandazioneFinale === "PARTECIPA_CON_RTI") {
    recs.push("Strutturare RTI con impresa mandante che possiede i requisiti mancanti");
    recs.push("Definire quote partecipazione proporzionali ai lavori eseguiti");
  }

  return recs;
}

export const QUALIFICATION_VERDICT_CLASS: Record<QualificationAssessment["raccomandazioneFinale"], string> = {
  PARTECIPA: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  PARTECIPA_CON_RTI: "text-blue-400 border-blue-800 bg-blue-950/40",
  AVVALIMENTO: "text-amber-400 border-amber-800 bg-amber-950/40",
  NON_PARTECIPARE: "text-red-400 border-red-800 bg-red-950/40",
};
