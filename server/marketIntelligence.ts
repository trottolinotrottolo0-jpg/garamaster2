import type {
  TenderDocument,
  GaraSimilareHistorica,
  MarketIntelligenceSnapshot,
} from "../src/types";

function stubTender(partial: Partial<TenderDocument> & Pick<TenderDocument, "id" | "title">): TenderDocument {
  return {
    cig: "",
    region: "N/D",
    value: "0",
    category: "N/D",
    deadline: new Date().toISOString().slice(0, 10),
    requirements: [],
    sections: [],
    anomalies: [],
    penalties: [],
    ...partial,
  };
}

/**
 * Storico gare per market intelligence (mock — in produzione: ANAC / DB).
 */
export async function fetchHistoricalGareData(): Promise<GaraSimilareHistorica[]> {
  const mockHistorical: GaraSimilareHistorica[] = [
    {
      id: "hist-001",
      gara: stubTender({
        id: "gara-001",
        title: "Ristrutturazione edile centro storico",
        category: "OG3",
        region: "Toscana",
        value: "250000",
        deadline: "2024-02-15",
        procedureType: "aperta",
      }),
      dataEmissione: "2024-01-15",
      dataRisultato: "2024-03-01",
      aggiudicazione: "VINTA",
      winnerName: "Impresa Rossi SRL",
      offerteRicevute: 8,
      ribassoVincente: 12.5,
      puntiTecnici: 75,
      importoAggiudicato: 218750,
      notaRisultato: "Vincitore con offerta tecnica innovativa",
    },
    {
      id: "hist-002",
      gara: stubTender({
        id: "gara-002",
        title: "Demolizione palazzo industriale",
        category: "OG1",
        region: "Lazio",
        value: "180000",
        deadline: "2024-03-01",
        procedureType: "aperta",
      }),
      dataEmissione: "2024-02-01",
      dataRisultato: "2024-04-10",
      aggiudicazione: "PERSA",
      winnerName: "Demolizioni Italia SpA",
      offerteRicevute: 5,
      ribassoVincente: 8,
      puntiTecnici: 82,
      importoAggiudicato: 165600,
      notaRisultato: "Persa per ribasso aggressivo del competitor",
    },
    {
      id: "hist-003",
      gara: stubTender({
        id: "gara-003",
        title: "Manutenzione straordinaria scuole",
        category: "OG3",
        region: "Toscana",
        value: "420000",
        deadline: "2024-05-20",
      }),
      dataEmissione: "2024-04-01",
      dataRisultato: "2024-06-15",
      aggiudicazione: "VINTA",
      winnerName: "Edilizia Verde SRL",
      offerteRicevute: 6,
      ribassoVincente: 10.2,
      puntiTecnici: 88,
      importoAggiudicato: 377160,
    },
    {
      id: "hist-004",
      gara: stubTender({
        id: "gara-004",
        title: "Riqualificazione energetica edifici pubblici",
        category: "OG3",
        region: "Emilia-Romagna",
        value: "890000",
        deadline: "2024-08-01",
      }),
      dataEmissione: "2024-07-01",
      dataRisultato: "2024-09-20",
      aggiudicazione: "VINTA",
      winnerName: "Impresa Rossi SRL",
      offerteRicevute: 4,
      ribassoVincente: 9.5,
      puntiTecnici: 91,
      importoAggiudicato: 805450,
    },
    {
      id: "hist-005",
      gara: stubTender({
        id: "gara-005",
        title: "Scavi e fondazioni viadotto",
        category: "OG1",
        region: "Lazio",
        value: "1200000",
        deadline: "2024-10-15",
      }),
      dataEmissione: "2024-09-01",
      dataRisultato: "2024-11-30",
      aggiudicazione: "VINTA",
      winnerName: "Costruzioni Meridionali SpA",
      offerteRicevute: 7,
      ribassoVincente: 11,
      puntiTecnici: 79,
      importoAggiudicato: 1068000,
    },
  ];

  return mockHistorical;
}

export async function saveMarketIntelligenceSnapshot(
  snapshot: MarketIntelligenceSnapshot
): Promise<boolean> {
  try {
    console.log("[market-intelligence] snapshot saved:", snapshot.id);
    return true;
  } catch (error) {
    console.error("[market-intelligence] save error:", error);
    return false;
  }
}
