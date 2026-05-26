import type { ProfiloImpresaContext } from "../types/database";
import type { DisciplinareParseResult } from "../types/disciplinareParse";
import type { TenderDocument, TenderRequirement } from "../types";

function parseEuroAmount(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return value;
}

function formatEuro(value: number | null): string {
  if (value == null) return "N/D";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function parseDeadlineToIso(deadline: string): string | null {
  const trimmed = deadline.trim();
  if (!trimmed || /da verificare/i.test(trimmed)) return null;

  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString();

  const itMatch = trimmed.match(
    /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+ore\s+(\d{1,2})(?::(\d{2}))?)?/i
  );
  if (itMatch) {
    const day = Number(itMatch[1]);
    const month = Number(itMatch[2]) - 1;
    let year = Number(itMatch[3]);
    if (year < 100) year += 2000;
    const hour = itMatch[4] ? Number(itMatch[4]) : 12;
    const minute = itMatch[5] ? Number(itMatch[5]) : 0;
    const d = new Date(year, month, day, hour, minute);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

function criterioLabel(parse: DisciplinareParseResult): string {
  switch (parse.criterio_aggiudicazione) {
    case "massimo_ribasso":
      return "Massimo ribasso";
    case "offerta_economicamente_piu_vantaggiosa":
      return "Offerta economicamente più vantaggiosa (OEPV)";
    case "misto":
      return "Criterio misto";
    default:
      return parse.criterio_aggiudicazione_descrizione ?? String(parse.criterio_aggiudicazione);
  }
}

function profiloSatisfiesSoa(
  profilo: ProfiloImpresaContext | null | undefined,
  categoria: string,
  classifica: string
): boolean {
  if (!profilo?.soa) return false;
  const hay = profilo.soa.toUpperCase();
  const cat = categoria.toUpperCase().replace(/\s/g, "");
  const cls = classifica.toUpperCase();
  return hay.includes(cat) && (cls === "N/D" || hay.includes(cls));
}

function profiloSatisfiesIso(
  profilo: ProfiloImpresaContext | null | undefined,
  cert: string
): boolean {
  if (!profilo?.certificazioni?.length) return false;
  const needle = cert.toLowerCase();
  return profilo.certificazioni.some((c) => {
    const lc = c.toLowerCase();
    return lc.includes(needle) || needle.includes(lc.replace(/\s/g, ""));
  });
}

function profiloSatisfiesFatturato(
  profilo: ProfiloImpresaContext | null | undefined,
  minimo: number | null
): boolean {
  if (minimo == null || minimo <= 0) return true;
  if (!profilo?.fatturatoTriennale) return false;
  const fatt = Number(
    String(profilo.fatturatoTriennale).replace(/[^\d.,]/g, "").replace(",", ".")
  );
  return !Number.isNaN(fatt) && fatt >= minimo;
}

export function buildRequirementsFromParse(
  parse: DisciplinareParseResult,
  profilo?: ProfiloImpresaContext | null
): TenderRequirement[] {
  const reqs: TenderRequirement[] = [];

  for (const soa of parse.requisiti_soa) {
    const desc =
      soa.descrizione ??
      `SOA ${soa.categoria} classifica ${soa.classifica}`;
    const satisfied = profiloSatisfiesSoa(profilo, soa.categoria, soa.classifica);
    reqs.push({
      category: "SOA",
      description: desc,
      satisfied,
      details: satisfied
        ? "Requisito SOA coperto dal profilo impresa."
        : "Verificare attestazione SOA o valutare RTI/Avvalimento (art. 104).",
    });
  }

  if (parse.fatturato_minimo.richiesto) {
    const min = parseEuroAmount(parse.fatturato_minimo.importo_euro);
    const satisfied = profiloSatisfiesFatturato(profilo, min);
    reqs.push({
      category: "Fatturato",
      description: parse.fatturato_minimo.descrizione,
      satisfied,
      details:
        min != null
          ? `Fatturato minimo richiesto: ${formatEuro(min)}`
          : "Fatturato minimo indicato nel disciplinare.",
    });
  }

  for (const cert of parse.certificazioni_obbligatorie) {
    const satisfied = profiloSatisfiesIso(profilo, cert);
    reqs.push({
      category: "ISO",
      description: cert,
      satisfied,
      details: satisfied ? "Certificazione presente in profilo." : "Certificazione da acquisire o documentare.",
    });
  }

  for (const cam of parse.requisiti_cam) {
    reqs.push({
      category: "Altro",
      description: `CAM: ${cam}`,
      satisfied: false,
      details: "Verificare criteri ambientali minimi (CAM) nel capitolato.",
    });
  }

  return reqs;
}

export function mapParseToGareInsert(
  userId: string,
  parse: DisciplinareParseResult,
  fileName: string,
  profilo?: ProfiloImpresaContext | null
): Record<string, unknown> {
  const importoEuro = parseEuroAmount(parse.importo_base_gara.importo_euro);
  const scadenzaIso = parseDeadlineToIso(parse.scadenza_presentazione_offerte);
  const requirements = buildRequirementsFromParse(parse, profilo);
  const soaSummary = parse.requisiti_soa
    .map((s) => `${s.categoria} ${s.classifica}`)
    .join(", ");

  const titolo =
    parse.titolo?.trim() ||
    `Gara da disciplinare: ${fileName.replace(/\.[^/.]+$/, "")}`;

  return {
    user_id: userId,
    titolo,
    oggetto: titolo,
    cig: parse.cig?.trim() || null,
    importo: importoEuro,
    importo_base: importoEuro,
    regione: parse.regione?.trim() || null,
    ente_appaltante: parse.ente_appaltante?.trim() || null,
    stazione_appaltante: parse.stazione_appaltante?.trim() || null,
    scadenza_presentazione: scadenzaIso,
    scadenza_offerta: scadenzaIso,
    data_scadenza: scadenzaIso,
    stato_pratica: "In analisi",
    categoria_soa: soaSummary || null,
    criterio_aggiudicazione: criterioLabel(parse),
    requisiti: requirements,
    penali: parse.clausole_rischiose_penali,
    anomalie: parse.clausole_rischiose_penali.filter((c) =>
      /anomal|revisione prezzi|eccessiv| vessator/i.test(c)
    ),
    note: JSON.stringify({ disciplinare_parse: parse, fileName }),
  };
}

export function mapParseToTenderPreview(
  garaId: string,
  parse: DisciplinareParseResult,
  profilo?: ProfiloImpresaContext | null
): TenderDocument {
  const importoEuro = parseEuroAmount(parse.importo_base_gara.importo_euro);
  const requirements = buildRequirementsFromParse(parse, profilo);
  const soaSummary = parse.requisiti_soa
    .map((s) => `${s.categoria} ${s.classifica}`)
    .join(", ");

  return {
    id: `gare-${garaId}`,
    title: parse.titolo?.trim() || "Gara da disciplinare",
    cig: parse.cig?.trim() || "N/D",
    region: parse.regione?.trim() || "Italia",
    value: formatEuro(importoEuro),
    category: soaSummary || "Appalto pubblico",
    deadline: parse.scadenza_presentazione_offerte,
    requirements,
    sections: [
      {
        id: "sec-criterio",
        title: "Criterio di aggiudicazione",
        importance: "high",
        summary: criterioLabel(parse),
        originalTextSnippet:
          parse.criterio_aggiudicazione_descrizione ?? criterioLabel(parse),
      },
    ],
    penalties: parse.clausole_rischiose_penali,
    anomalies: parse.clausole_rischiose_penali.filter((c) =>
      /anomal|revisione prezzi|eccessiv| vessator/i.test(c)
    ),
  };
}
