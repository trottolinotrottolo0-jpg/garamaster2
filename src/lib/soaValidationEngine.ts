import type { SOAStructured, SOACategoria } from "../types";

export interface SOAValidationResult {
  isComplete: boolean;
  completenessScore: number;
  issues: SOAValidationIssue[];
  warnings: SOAValidationWarning[];
  recommendations: string[];
}

export interface SOAValidationIssue {
  id: string;
  tipo: "MISSING_CATEGORIES" | "LOW_CONFIDENCE" | "ZERO_AMOUNT" | "DUPLICATE";
  severity: "CRITICA" | "ALTA" | "MEDIA";
  descrizione: string;
  affectedCategories?: string[];
}

export interface SOAValidationWarning {
  id: string;
  tipo: "UNMAPPED_ANCE" | "OBSOLETE_CATEGORY" | "UNUSUAL_AMOUNT";
  descrizione: string;
}

export interface SOATimeline {
  versioni: Array<{
    soa: SOAStructured;
    deltaVsPrecedente?: {
      categorieAggiunte: number;
      categorieRimosse: number;
      deltaImporto: number;
    };
  }>;
  trend: "CRESCENTE" | "CALANTE" | "STABILE";
  importoTrendPercent: number;
}

export interface ANCECategoryMapping {
  locale: string;
  anceStandard: string;
  codiceANCE: string;
  confidenza: number;
}

export function validateSOA(soa: SOAStructured): SOAValidationResult {
  const issues: SOAValidationIssue[] = [];
  const warnings: SOAValidationWarning[] = [];
  const recommendations: string[] = [];

  let scoreBase = 100;
  const n = soa.categorie.length;

  if (n === 0) {
    issues.push({
      id: "soa-0",
      tipo: "MISSING_CATEGORIES",
      severity: "CRITICA",
      descrizione: "Nessuna categoria estratta dal file SOA.",
    });
    return {
      isComplete: false,
      completenessScore: 0,
      issues,
      warnings,
      recommendations: ["Ricarica un file SOA completo o verifica la qualità del PDF"],
    };
  }

  if (soa.totalCategorie < 3) {
    issues.push({
      id: "soa-1",
      tipo: "MISSING_CATEGORIES",
      severity: "ALTA",
      descrizione: `Troppo poche categorie SOA (${soa.totalCategorie}). Un'impresa edile strutturata ne ha in genere almeno 5-10.`,
      affectedCategories: [],
    });
    scoreBase -= 30;
    recommendations.push("Verifica che il file SOA sia completo o carica una versione aggiornata");
  }

  const lowConfidence = soa.categorie.filter((c) => c.confidenza < 70);
  if (n > 0 && lowConfidence.length / n > 0.5) {
    issues.push({
      id: "soa-2",
      tipo: "LOW_CONFIDENCE",
      severity: "MEDIA",
      descrizione: `${lowConfidence.length}/${n} categorie estratte con bassa confidenza (<70%).`,
      affectedCategories: lowConfidence.map((c) => c.codice),
    });
    scoreBase -= 20;
    recommendations.push("Valida manualmente le categorie con bassa confidenza");
  }

  const zeroAmount = soa.categorie.filter((c) => c.importoMaxRealizzato === 0);
  if (zeroAmount.length > 0) {
    issues.push({
      id: "soa-3",
      tipo: "ZERO_AMOUNT",
      severity: "ALTA",
      descrizione: `${zeroAmount.length} categorie con importo €0 — probabile estrazione fallita.`,
      affectedCategories: zeroAmount.map((c) => c.codice),
    });
    scoreBase -= 25;
  }

  const codiciUnique = new Set(soa.categorie.map((c) => c.codice));
  if (codiciUnique.size < n) {
    issues.push({
      id: "soa-4",
      tipo: "DUPLICATE",
      severity: "CRITICA",
      descrizione: "Categorie duplicate rilevate nel SOA (stesso codice ripetuto).",
    });
    scoreBase -= 35;
  }

  const importoTot = soa.importoTotaleMassimoRealizzabile;
  if (importoTot < 500_000) {
    warnings.push({
      id: "soa-w1",
      tipo: "UNUSUAL_AMOUNT",
      descrizione: `Importo totale massimo (€${importoTot.toLocaleString("it-IT")}) molto basso per un'impresa edile strutturata.`,
    });
  } else if (importoTot > 50_000_000) {
    warnings.push({
      id: "soa-w2",
      tipo: "UNUSUAL_AMOUNT",
      descrizione: `Importo totale (€${importoTot.toLocaleString("it-IT")}) molto alto — verifica errori di lettura.`,
    });
  }

  const deprecatedPatterns = /^(A|B|C|D|E)[\d.]+/i;
  const obsolete = soa.categorie.filter((c) => deprecatedPatterns.test(c.codice));
  if (obsolete.length > 0) {
    warnings.push({
      id: "soa-w3",
      tipo: "OBSOLETE_CATEGORY",
      descrizione: `${obsolete.length} categorie usano codifiche obsolete (pre-2008). Valuta aggiornamento attestazione.`,
    });
  }

  const completenessScore = Math.max(0, scoreBase);
  const isComplete =
    completenessScore >= 70 && issues.filter((i) => i.severity === "CRITICA").length === 0;

  return {
    isComplete,
    completenessScore,
    issues,
    warnings,
    recommendations,
  };
}

export function compareSoaVersions(
  soaOld: SOAStructured,
  soaNew: SOAStructured
): {
  categorieAggiunte: SOACategoria[];
  categorieRimosse: SOACategoria[];
  categorieModificate: Array<{ old: SOACategoria; new: SOACategoria; deltaImporto: number }>;
  deltaImportoTotale: number;
} {
  const oldCodici = new Map(soaOld.categorie.map((c) => [c.codice, c]));
  const newCodici = new Map(soaNew.categorie.map((c) => [c.codice, c]));

  const categorieAggiunte: SOACategoria[] = [];
  const categorieRimosse: SOACategoria[] = [];
  const categorieModificate: Array<{
    old: SOACategoria;
    new: SOACategoria;
    deltaImporto: number;
  }> = [];

  for (const [codice, newCat] of newCodici) {
    const oldCat = oldCodici.get(codice);
    if (!oldCat) {
      categorieAggiunte.push(newCat);
    } else if (oldCat.importoMaxRealizzato !== newCat.importoMaxRealizzato) {
      categorieModificate.push({
        old: oldCat,
        new: newCat,
        deltaImporto: newCat.importoMaxRealizzato - oldCat.importoMaxRealizzato,
      });
    }
  }

  for (const [codice, oldCat] of oldCodici) {
    if (!newCodici.has(codice)) {
      categorieRimosse.push(oldCat);
    }
  }

  const deltaImportoTotale =
    soaNew.importoTotaleMassimoRealizzabile - soaOld.importoTotaleMassimoRealizzabile;

  return {
    categorieAggiunte,
    categorieRimosse,
    categorieModificate,
    deltaImportoTotale,
  };
}

export function analyzeSOATimeline(storicoSOA: SOAStructured[]): SOATimeline {
  if (storicoSOA.length === 0) {
    return { versioni: [], trend: "STABILE", importoTrendPercent: 0 };
  }

  const sorted = [...storicoSOA].sort(
    (a, b) => new Date(a.dataImportazione).getTime() - new Date(b.dataImportazione).getTime()
  );

  const versioni = sorted.map((soa, idx) => {
    if (idx === 0) {
      return { soa, deltaVsPrecedente: undefined };
    }
    const comparison = compareSoaVersions(sorted[idx - 1], soa);
    return {
      soa,
      deltaVsPrecedente: {
        categorieAggiunte: comparison.categorieAggiunte.length,
        categorieRimosse: comparison.categorieRimosse.length,
        deltaImporto: comparison.deltaImportoTotale,
      },
    };
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const importoTrendPercent =
    first.importoTotaleMassimoRealizzabile > 0
      ? ((last.importoTotaleMassimoRealizzabile - first.importoTotaleMassimoRealizzabile) /
          first.importoTotaleMassimoRealizzabile) *
        100
      : 0;

  let trend: SOATimeline["trend"] = "STABILE";
  if (importoTrendPercent > 10) trend = "CRESCENTE";
  if (importoTrendPercent < -10) trend = "CALANTE";

  return {
    versioni,
    trend,
    importoTrendPercent,
  };
}

export function applyANCEMappingsToSOA(
  soa: SOAStructured,
  mappings: ANCECategoryMapping[]
): SOAStructured {
  if (mappings.length === 0) return soa;

  const categorie = soa.categorie.map((cat) => {
    const map =
      mappings.find((m) => m.locale.trim() === cat.descrizione.trim()) ??
      mappings.find(
        (m) =>
          cat.descrizione.length > 10 &&
          (m.locale.includes(cat.descrizione.slice(0, 20)) ||
            cat.descrizione.includes(m.locale.slice(0, 20)))
      );

    if (map && map.confidenza >= 70 && map.codiceANCE) {
      return {
        ...cat,
        codice: map.codiceANCE,
        descrizione: map.anceStandard || cat.descrizione,
        confidenza: Math.max(cat.confidenza, map.confidenza),
      };
    }
    return cat;
  });

  const importoTotale = categorie.reduce((acc, c) => acc + c.importoMaxRealizzato, 0);

  return {
    ...soa,
    categorie,
    totalCategorie: categorie.length,
    importoTotaleMassimoRealizzabile: importoTotale,
    noteParsing: [
      ...soa.noteParsing,
      mappings.length > 0 ? `Mapping ANCE applicato su ${mappings.length} voci` : "",
    ].filter(Boolean),
  };
}
