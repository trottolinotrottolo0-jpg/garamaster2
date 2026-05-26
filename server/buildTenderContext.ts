import type { TenderDocument } from "../src/types";

export function buildTenderContext(tender: TenderDocument): string {
  const requirements = tender.requirements
    .map(
      (r, i) =>
        `${i + 1}. [${r.category}] ${r.description} — ${
          r.satisfied ? "CONFORME" : "NON CONFORME"
        }: ${r.details}`
    )
    .join("\n");

  const penalties =
    tender.penalties?.length > 0
      ? tender.penalties.map((p, i) => `${i + 1}. ${p}`).join("\n")
      : "Nessuna penale estratta.";

  const anomalies =
    tender.anomalies?.length > 0
      ? tender.anomalies.map((a, i) => `${i + 1}. ${a}`).join("\n")
      : "Nessuna anomalia estratta.";

  return `
## CONTESTO GARA CORRENTE (usa questi dati, non inventare CIG o importi diversi)
- Titolo: ${tender.title}
- CIG: ${tender.cig}
- Regione: ${tender.region}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Scadenza: ${tender.deadline}

### Requisiti analizzati
${requirements}

### Penali identificate
${penalties}

### Anomalie di gara
${anomalies}
`.trim();
}
