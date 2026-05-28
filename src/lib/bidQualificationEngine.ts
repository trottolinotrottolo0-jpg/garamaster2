import type { SOAStructured, TenderDocument } from "../types";
import { parseTenderValue } from "./bidCalculations";

export interface SOAQualificationCheck {
  isQualified: boolean;
  categoriaRichiesta: string;
  importoRichiesto: number;
  categoriaImpresa: string | undefined;
  importoMaxImpresa: number | undefined;
  gap: {
    categoria: boolean;
    importo: boolean;
    importoMancante?: number;
  };
  recommendation: string;
  percentualeCopertura: number;
}

function normalizeCode(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

function categoryMatches(tenderCategory: string, catCode: string, catDesc: string): boolean {
  const t = normalizeCode(tenderCategory);
  const code = normalizeCode(catCode);
  const desc = catDesc.toLowerCase();

  if (!t || t === "N/D") return false;
  if (code === t || code.startsWith(t) || t.startsWith(code)) return true;
  if (t.length >= 2 && code.length >= 2 && code.slice(0, 2) === t.slice(0, 2)) return true;
  if (desc && t.length > 3 && desc.includes(t.toLowerCase())) return true;
  return false;
}

export function checkSOAQualificationForTender(
  soa: SOAStructured | undefined,
  tender: TenderDocument
): SOAQualificationCheck {
  const importoRichiesto = parseTenderValue(tender.value);
  const categoriaRichiesta = tender.category || "N/D";

  if (!soa || soa.categorie.length === 0) {
    return {
      isQualified: false,
      categoriaRichiesta,
      importoRichiesto,
      categoriaImpresa: undefined,
      importoMaxImpresa: undefined,
      gap: { categoria: true, importo: true },
      recommendation:
        "Nessun SOA importato disponibile — carica il file SOA nel profilo per verificare la qualificazione.",
      percentualeCopertura: 0,
    };
  }

  const categoriaMatching = soa.categorie.find((cat) =>
    categoryMatches(categoriaRichiesta, cat.codice, cat.descrizione)
  );

  if (!categoriaMatching) {
    return {
      isQualified: false,
      categoriaRichiesta,
      importoRichiesto,
      categoriaImpresa: undefined,
      importoMaxImpresa: undefined,
      gap: { categoria: true, importo: true },
      recommendation: `Categoria richiesta «${categoriaRichiesta}» non trovata nel SOA importato — verifica idoneità prima di partecipare.`,
      percentualeCopertura: 0,
    };
  }

  const importoMaxImpresa = categoriaMatching.importoMaxRealizzato;
  const percentualeCopertura =
    importoRichiesto > 0 ? (importoMaxImpresa / importoRichiesto) * 100 : 0;
  const gapImporto = importoRichiesto > 0 && importoMaxImpresa < importoRichiesto;

  return {
    isQualified: !gapImporto,
    categoriaRichiesta,
    importoRichiesto,
    categoriaImpresa: categoriaMatching.codice,
    importoMaxImpresa,
    gap: {
      categoria: false,
      importo: gapImporto,
      importoMancante: gapImporto ? importoRichiesto - importoMaxImpresa : undefined,
    },
    recommendation: gapImporto
      ? `SOA non idoneo su importo: massimo realizzabile €${importoMaxImpresa.toLocaleString("it-IT")}, base gara €${importoRichiesto.toLocaleString("it-IT")}. Gap stimato €${(importoRichiesto - importoMaxImpresa).toLocaleString("it-IT")}.`
      : `Qualificazione SOA coerente con la gara. Capacità stimata: ${percentualeCopertura.toFixed(0)}% dell'importo a base d'asta (categoria ${categoriaMatching.codice}).`,
    percentualeCopertura,
  };
}
