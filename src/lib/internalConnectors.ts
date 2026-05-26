export type InternalConnectorAction =
  | "bidNoBid"
  | "bidPricing"
  | "capacity"
  | "profitability"
  | "vessatorie"
  | "analyzer"
  | "portfolioScore"
  | "profile"
  | "rtiAvvalimento"
  | "garaRoi";

export interface InternalConnector {
  id: string;
  name: string;
  description: string;
  category: "analisi" | "pricing" | "documenti" | "profilo";
  action: InternalConnectorAction;
  promptHint: string;
}

/** Strumenti e app GaraMaster sviluppati internamente — “connettori” in stile Claude */
export const INTERNAL_CONNECTORS: InternalConnector[] = [
  {
    id: "rti-avvalimento",
    name: "RTI & Avvalimento Configurator",
    description:
      "Gap SOA: suggerisce RTI, Avvalimento (art. 104) o se lasciare perdere la gara. Per forecast area usa SOA Gap Forecasting in Profilo.",
    category: "analisi",
    action: "rtiAvvalimento",
    promptHint:
      "Applica il RTI & Avvalimento Configurator: valuta gap SOA e proponi RTI, avvalimento art. 104 o no-go.",
  },
  {
    id: "bid-no-bid",
    name: "Bid / No-Bid Engine",
    description: "Valutazione GO / CAUTELA / NO-GO sulla gara corrente.",
    category: "analisi",
    action: "bidNoBid",
    promptHint:
      "Usa il motore Bid/No-Bid interno: incrocia profilo SOA, area, importo e capacità operativa.",
  },
  {
    id: "gara-roi",
    name: "Gara ROI Calculator",
    description: "ROI partecipazione, margine, ore preparazione e probabilità vittoria.",
    category: "pricing",
    action: "garaRoi",
    promptHint:
      "Usa il Gara ROI Calculator: margine % realistico, costi preparazione offerta, probabilità vittoria.",
  },
  {
    id: "bid-pricing",
    name: "Bid Pricing Engine",
    description: "Range ribasso, scenari economici e alert margine.",
    category: "pricing",
    action: "bidPricing",
    promptHint:
      "Applica la logica del Bid Pricing Engine per stimare ribasso sostenibile e scenari OEPV.",
  },
  {
    id: "capacity",
    name: "Capacity Engine",
    description: "Saturazione organizzativa e squadre disponibili.",
    category: "analisi",
    action: "capacity",
    promptHint: "Valuta capacità operativa con il Capacity Saturation Engine interno.",
  },
  {
    id: "profitability",
    name: "Profitability Gate",
    description: "Margine atteso, breakdown costi, verdict economico.",
    category: "pricing",
    action: "profitability",
    promptHint: "Esegui analisi profittabilità con il Profitability Gate interno.",
  },
  {
    id: "vessatorie",
    name: "Red Flag / Vessatorie",
    description: "Clausole vessatorie, penali e bozze quesiti.",
    category: "analisi",
    action: "vessatorie",
    promptHint: "Analizza rischi contrattuali con il motore Vessatorie / Red Flag.",
  },
  {
    id: "analyzer",
    name: "Analizzatore PDF",
    description: "Ispezione disciplinare e sezioni capitolato.",
    category: "documenti",
    action: "analyzer",
    promptHint: "Guida l'utente verso l'Analizzatore PDF per estrazione sezioni disciplinare.",
  },
  {
    id: "portfolio-score",
    name: "Portfolio Score",
    description: "Score 0-100 competitività portfolio gare.",
    category: "analisi",
    action: "portfolioScore",
    promptHint: "Interpreta o spiega il Tender Portfolio Score del profilo vs catalogo gare.",
  },
  {
    id: "company-profile",
    name: "Profilo impresa",
    description: "Scheda SOA, fatturato e dati economici locali.",
    category: "profilo",
    action: "profile",
    promptHint: "Allinea la risposta al Profilo azienda compilato nell'app.",
  },
];

export function buildConnectorsSystemAddendum(enabledIds: string[]): string {
  if (!enabledIds.length) return "";

  const enabled = INTERNAL_CONNECTORS.filter((c) => enabledIds.includes(c.id));
  const list = enabled
    .map((c) => `- **${c.name}**: ${c.promptHint}`)
    .join("\n");

  return `
## STRUMENTI GARAMASTER ATTIVI (connettori interni)
L'utente ha abilitato questi moduli sviluppati nell'ecosistema GaraMaster. Puoi richiamarli concettualmente e suggerire di aprirli dall'app quando serve un calcolo strutturato:
${list}

Se l'utente chiede di "usare un connettore" o "aprire lo strumento", indica quale modulo è più adatto e cosa produrrà.
`;
}
