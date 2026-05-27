import type { AnacGaraRecord } from "./anacRecordTypes";

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function pickCig(obj: Record<string, unknown>): string | undefined {
  return (
    asString(obj.cig) ??
    asString(obj.CIG) ??
    asString(obj.codice_cig) ??
    asString(obj.codiceCig)
  );
}

function normalizeRecord(raw: Record<string, unknown>, source: string): AnacGaraRecord | null {
  const cig = pickCig(raw);
  if (!cig) return null;

  return {
    cig,
    titolo: asString(raw.titolo ?? raw.title ?? raw.denominazione),
    oggetto: asString(raw.oggetto ?? raw.description ?? raw.descrizione),
    importo: asNumber(raw.importo ?? raw.importo_base ?? raw.value ?? raw.amount),
    importo_base: asNumber(raw.importo_base ?? raw.base_importo),
    regione: asString(raw.regione ?? raw.region),
    provincia: asString(raw.provincia ?? raw.province),
    stazione_appaltante: asString(raw.stazione_appaltante ?? raw.stazioneAppaltante),
    ente_appaltante: asString(raw.ente_appaltante ?? raw.enteAppaltante ?? raw.buyer),
    data_pubblicazione: asString(raw.data_pubblicazione ?? raw.published_at ?? raw.pubblicazione),
    data_scadenza: asString(
      raw.data_scadenza ?? raw.scadenza ?? raw.deadline ?? raw.data_scadenza_offerta
    ),
    scadenza: asString(raw.scadenza),
    cpv: asString(raw.cpv ?? raw.codice_cpv),
    categoria: asString(raw.categoria ?? raw.categoria_soa ?? raw.settore),
    url_portale: asString(raw.url_portale ?? raw.url ?? raw.link),
    url_disciplinare: asString(raw.url_disciplinare ?? raw.disciplinare_url),
    ocid: asString(raw.ocid),
    source_dataset: source,
    raw_meta: raw,
  };
}

function parseOcdsRelease(release: Record<string, unknown>, source: string): AnacGaraRecord | null {
  const tender = (release.tender as Record<string, unknown>) ?? {};
  const value = (tender.value as Record<string, unknown>) ?? {};
  const period = (tender.tenderPeriod as Record<string, unknown>) ?? {};
  const parties = Array.isArray(release.parties) ? release.parties : [];
  const buyerParty =
    parties.find((p) => {
      const roles = (p as Record<string, unknown>).roles;
      return Array.isArray(roles) && roles.includes("buyer");
    }) ?? parties[0];

  const buyer = buyerParty as Record<string, unknown> | undefined;
  const address = (buyer?.address as Record<string, unknown>) ?? {};

  const documents = Array.isArray(tender.documents) ? tender.documents : [];
  const disciplinare = documents.find((d) => {
    const doc = d as Record<string, unknown>;
    const t = String(doc.documentType ?? "").toLowerCase();
    return t.includes("contract") || t.includes("bando") || t.includes("disciplin");
  }) as Record<string, unknown> | undefined;

  const cig =
    asString(tender.id) ??
    asString(release.id) ??
    asString((release.ocid as string)?.split("/").pop());

  if (!cig) return null;

  return {
    cig,
    titolo: asString(tender.title),
    oggetto: asString(tender.description),
    importo: asNumber(value.amount),
    importo_base: asNumber(value.amount),
    regione: asString(address.region),
    provincia: asString(address.locality),
    ente_appaltante: asString(buyer?.name),
    stazione_appaltante: asString(buyer?.name),
    data_pubblicazione: asString(period.startDate),
    data_scadenza: asString(period.endDate),
    scadenza: asString(period.endDate),
    cpv: (() => {
      if (!Array.isArray(tender.items) || !tender.items[0]) return undefined;
      const item = tender.items[0] as Record<string, unknown>;
      const classification = item.classification as Record<string, unknown> | undefined;
      return asString(classification?.id);
    })(),
    categoria: asString(tender.mainProcurementCategory),
    url_portale: asString(disciplinare?.url),
    url_disciplinare: asString(disciplinare?.url),
    ocid: asString(release.ocid),
    source_dataset: source,
    raw_meta: { ocid: release.ocid, release_id: release.id },
  };
}

export function parseAnacJsonPayload(
  payload: unknown,
  source: string,
  limit: number
): { records: AnacGaraRecord[]; warnings: string[] } {
  const warnings: string[] = [];
  const records: AnacGaraRecord[] = [];
  const seenCig = new Set<string>();

  const push = (record: AnacGaraRecord | null) => {
    if (!record?.cig || seenCig.has(record.cig)) return;
    seenCig.add(record.cig);
    records.push(record);
  };

  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (records.length >= limit) break;
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (obj.tender || obj.ocid) {
        push(parseOcdsRelease(obj, source));
      } else {
        push(normalizeRecord(obj, source));
      }
    }
    return { records, warnings };
  }

  if (!payload || typeof payload !== "object") {
    warnings.push("Payload JSON non valido.");
    return { records, warnings };
  }

  const root = payload as Record<string, unknown>;

  const arraysToTry = [
    root.gare,
    root.data,
    root.results,
    root.releases,
    root.records,
    root.items,
  ];

  for (const arr of arraysToTry) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (records.length >= limit) break;
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (obj.tender || obj.ocid) {
        push(parseOcdsRelease(obj, source));
      } else {
        push(normalizeRecord(obj, source));
      }
    }
    if (records.length) break;
  }

  if (!records.length) {
    warnings.push("Nessun record riconosciuto nel JSON (attesi array gare/releases/data).");
  }

  return { records: records.slice(0, limit), warnings };
}
