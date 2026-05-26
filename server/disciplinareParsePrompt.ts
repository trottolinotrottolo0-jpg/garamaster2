export const DISCIPLINARE_PARSE_USER_PROMPT = `Analizza questo disciplinare di gara e estrai:
1. Requisiti SOA richiesti (categoria + classifica)
2. Fatturato minimo richiesto
3. Certificazioni obbligatorie (ISO, ecc.)
4. Importo a base di gara
5. Scadenza presentazione offerte
6. Criteri di aggiudicazione (massimo ribasso / offerta economicamente più vantaggiosa)
7. Clausole rischiose o penali
8. Requisiti CAM (sostenibilità)

Restituisci in JSON strutturato.

Schema JSON obbligatorio (usa null dove non trovato):
{
  "titolo": "string",
  "cig": "string",
  "regione": "string",
  "ente_appaltante": "string",
  "stazione_appaltante": "string",
  "requisiti_soa": [{ "categoria": "OG1", "classifica": "III", "descrizione": "testo" }],
  "fatturato_minimo": { "richiesto": true, "importo_euro": 0, "descrizione": "testo" },
  "certificazioni_obbligatorie": ["ISO 9001"],
  "importo_base_gara": { "importo_euro": 0, "descrizione": "testo" },
  "scadenza_presentazione_offerte": "ISO8601 o testo italiano",
  "criterio_aggiudicazione": "massimo_ribasso" | "offerta_economicamente_piu_vantaggiosa" | "misto" | "altro",
  "criterio_aggiudicazione_descrizione": "string",
  "clausole_rischiose_penali": ["string"],
  "requisiti_cam": ["string"]
}`;
