/// <reference types="vite/client" />
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TenderDocument, CompanyProfile, BidNoBidResult } from "../types";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY as string);

export async function runBidNoBid(
  tender: TenderDocument,
  profile: CompanyProfile
): Promise<BidNoBidResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Sei un motore decisionale esperto in gare d'appalto pubbliche italiane (D.Lgs. 36/2023).
Analizza la compatibilità tra il profilo dell'impresa e la gara.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo.
Il JSON deve rispettare esattamente questa struttura:
{
  "decision": "GO" | "CAUTELA" | "NO-GO",
  "scoreComplessivo": number (0-100),
  "motivazioneSintetica": string,
  "motiviPro": string[],
  "motiviContro": string[],
  "criticitaPrincipale": string,
  "suggerimento": string,
  "soaCompatibile": boolean,
  "capacitaSufficiente": boolean,
  "areaGeograficaOk": boolean,
  "importoInTarget": boolean
}

Logica decisionale:
- GO: impresa compatibile, nessun blocco critico, score >= 70
- CAUTELA: compatibile con riserve o gap colmabili (avvalimento/RTI), score 40-69
- NO-GO: incompatibilità strutturale (SOA mancante non colmabile, area geografica fuori scope, importo fuori range), score < 40

Considera questi fattori nell'ordine:
1. Compatibilità SOA (categorie e classifiche richieste vs possedute) — peso 35%
2. Area geografica gara vs aree operative impresa — peso 20%
3. Importo gara vs range target impresa — peso 20%
4. Capacità operativa (cantieri aperti, squadre disponibili) — peso 15%
5. Anomalie e penali rilevate nel disciplinare — peso 10%

PROFILO IMPRESA:
${JSON.stringify(profile, null, 2)}

DATI GARA:
- Titolo: ${tender.title}
- CIG: ${tender.cig}
- Importo: ${tender.value}
- Categoria: ${tender.category}
- Regione: ${tender.region}
- Requisiti richiesti: ${JSON.stringify(tender.requirements, null, 2)}
- Anomalie rilevate: ${tender.anomalies.join(", ") || "nessuna"}
- Penali: ${tender.penalties.join(", ") || "nessuna"}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: Omit<BidNoBidResult, "generatedAt">;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Risposta Gemini non valida — riprova");
  }

  return { ...parsed, generatedAt: new Date().toISOString() };
}
