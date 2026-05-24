import { McpServer, TenderDocument } from "./types";

export const initialMcpServers: McpServer[] = [
  {
    id: "anac-ted-server",
    name: "ANAC & TED Connector",
    description: "Interfaccia con la Banca Dati Nazionale dei Contratti Pubblici (BDNCP) dell'ANAC e con il Tenders Electronic Daily europeo per interrogare i bandi attivi.",
    url: "http://localhost:3011/mcp",
    connected: true,
    tools: [
      {
        name: "cerca_bandi_regione",
        description: "Cerca i bandi di edilizia o infrastrutture pubblicati in una specifica regione italiana con criteri di importo.",
        parameters: [
          { name: "regione", type: "string", description: "Es: Lazio, Emilia-Romagna", required: true },
          { name: "importo_minimo", type: "number", description: "Valore minimo in EUR", required: false },
          { name: "categoria_prevalente", type: "string", description: "Es: OG1, OG3, OS21", required: false }
        ]
      },
      {
        name: "dettagli_bando_cig",
        description: "Recupera i metadati ufficiali e il link ai disciplinari a partire dal codice CIG (Codice Identificativo Gara).",
        parameters: [
          { name: "cig", type: "string", description: "Codice CIG a 10 caratteri", required: true }
        ]
      }
    ]
  },
  {
    id: "supabase-historicals",
    name: "Supabase Gara Historian",
    description: "Cerca nello storico dell'impresa (punteggi passati, fatturati, referenze, cauzioni) all'interno del database Supabase di Gara Master.",
    url: "postgresql://supabase-db:5432/mcp",
    connected: true,
    tools: [
      {
        name: "verifica_requisiti_impresa",
        description: "Determina se l'impresa (configurata su Supabase) possiede i requisiti minimi di SOA, fatturato e polizze per partecipare.",
        parameters: [
          { name: "cig_gara", type: "string", description: "Il codice CIG della gara target", required: true }
        ]
      },
      {
        name: "recupera_esperienze_simili",
        description: "Cerca nel database Supabase relazioni tecniche passate, contratti stipulati o certificati di esecuzione lavori analoghi.",
        parameters: [
          { name: "categoria_soa", type: "string", description: "Es: OG1, OG11", required: true },
          { name: "valore_lavoro", type: "number", description: "Valore minimo di riferimento", required: false }
        ]
      }
    ]
  },
  {
    id: "doc-parser-server",
    name: "Advanced PDF Spec Clarifier",
    description: "Esegue estrazione semantica tramite modelli OCR-Vision specializzati per layout complessi di disciplinari, capitolati speciali e lettere d'invito.",
    url: "http://localhost:3012/mcp",
    connected: true,
    tools: [
      {
        name: "analizza_sezione_disciplinare",
        description: "Estrae e riassume una specifica sezione del disciplinare di gara (Es: Requisiti di partecipazione, Criteri di Punteggio Tecnico).",
        parameters: [
          { name: "doc_id", type: "string", description: "ID del documento caricato", required: true },
          { name: "sezione_chiave", type: "string", description: "Es: SOA, Punteggio Tecnico, Penali, Varianti", required: true }
        ]
      },
      {
        name: "rileva_indicatori_rischio_anomalie",
        description: "Analizza clausole vessatorie, tempistiche irrealistiche di esecuzione, o requisiti discriminatori nel bando.",
        parameters: [
          { name: "doc_id", type: "string", description: "ID del documento", required: true }
        ]
      }
    ]
  },
  {
    id: "relazione-tecnica-gen",
    name: "technical-proposal-generator",
    description: "Generatore assistito di bozze per Offerta Tecnica. Assiste la compilazione dei criteri qualitativi incrociando i capitolati con soluzioni eco-sostenibili (CAM), BIM e logistica.",
    url: "http://localhost:3013/mcp",
    connected: false,
    tools: [
      {
        name: "bozza_criterio_offerta",
        description: "Genera una bozza dettagliata in formato Markdown per un singolo criterio di valutazione qualitativo.",
        parameters: [
          { name: "titolo_criterio", type: "string", description: "Es: Organizzazione e logistica del cantiere", required: true },
          { name: "punti_massimi", type: "number", description: "Peso del punteggio", required: true },
          { name: "capitolato_richieste", type: "string", description: "Breve estratto delle prescrizioni del capitolato", required: true }
        ]
      }
    ]
  }
];

export const mockTenders: TenderDocument[] = [
  {
    id: "scuola-roma",
    title: "Riqualificazione Energetica dell'Asilo Nido 'Piccoli Passi' ed Elementare De Amicis",
    cig: "9874563A2B",
    region: "Lazio (Roma)",
    value: "€ 1.250.000,00",
    category: "OG1 (Edifici civili e industriali), II Classifica",
    deadline: "12 Giugno 2026 - Ore 12:00",
    requirements: [
      {
        category: "SOA",
        description: "Attestazione SOA categoria prevalente OG1 Classifica II (€ 516.000,00+)",
        satisfied: true,
        details: "L'impresa Gara Master srl possiede OG1 Classifica III (fino a € 1.033.000,00 + incremento del quinto: idoneo)."
      },
      {
        category: "ISO",
        description: "Certificazione ISO 9001, ISO 14001 (Gestione Ambientale) e ISO 45001 (Sicurezza)",
        satisfied: true,
        details: "Presenti e in corso di validità nel cassetto aziendale Supabase."
      },
      {
        category: "Fatturato",
        description: "Fatturato specifico nel triennio precedente non inferiore a € 2.000.000,00",
        satisfied: false,
        details: "L'impresa ha totalizzato € 1.650.000,00. È necessario ricorrere all'AVVALIMENTO o costituire un RTI verticale."
      },
      {
        category: "Referenze",
        description: "Almeno due servizi di manutenzione straordinaria o risanamento su edifici scolastici negli ultimi 5 anni.",
        satisfied: true,
        details: "Rintracciato contratto 2024 con Comune di Fiumicino (€ 850.000,00) e 2025 con Comune di Tivoli (€ 450.000,00)."
      }
    ],
    sections: [
      {
        id: "sec-1",
        title: "Criteri di Valutazione (Offerta Tecnica - Max 70 Punti)",
        importance: "high",
        summary: "Il bando segue il criterio dell'OEPV (D.Lgs 36/2023). Relazione Tecnica limitata a max 20 pagine. Suddivisa in: Criterio A (Pregio Tecnico/Soluzioni Energetiche, max 30 punti), Criterio B (Organizzazione di Cantiere e Sicurezza, max 25 punti), Criterio C (Riduzione Impatto Ambientale/CAM, max 15 punti).",
        originalTextSnippet: "I concorrenti dovranno presentare una relazione tecnica illustrativa redatta in carattere Arial 11, interlinea 1.15, per un massimo di 20 facciate A4 esclusi allegati grafici. Verranno valutati con particolare favore i materiali isolanti provvisti di etichettatura ecologica di tipo I...",
        scoreWeight: "70 Punti"
      },
      {
        id: "sec-2",
        title: "Penali e Tempistiche d'Esecuzione",
        importance: "medium",
        summary: "Tempo massimo d'esecuzione stabilito in 240 giorni naturali e consecutivi. Penale giornaliera di ritardo applicata in misura dello 0,8 per mille dell'importo netto contrattuale in conformità all'art. 113 del Codice.",
        originalTextSnippet: "Il tempo utile per dare ultimati tutti i lavori è stabilito in giorni 240 decorrenti dalla data del verbale di consegna. Per ogni giorno di ritardo verrà applicata una penale dello 0.8‰...",
      },
      {
        id: "sec-3",
        title: "Subappalto ed Opere Super-Specialistiche",
        importance: "high",
        summary: "I lavori della categoria scorporabile OS30 (Impianti interni elettrici, € 300.000) e OS28 (Impianti termici ed idrici, € 250.000) sono subappaltabili al 100%, ma necessitano di requisiti specifici se l'impresa principale non è qualificata.",
        originalTextSnippet: "L'operatore economico deve indicare in sede di offerta le parti di servizio/fornitura che intende subappaltare. Si applicano le disposizioni vigenti di cui all'art. 119 del D.Lgs. 36/2023.",
      }
    ],
    anomalies: [
      "Fatturato richiesto (€2M) proporzionalmente troppo alto per un bando da €1.25M. Potenziale elemento di ricorso o richiesta di chiarimenti (art. 10 del Codice sulla concorrenza).",
      "Il cronoprogramma prevede la riqualificazione degli infissi in sole 3 settimane d'agosto, coincidente con fermo ferie stabilito dai fornitori storici."
    ],
    penalties: [
      "Penale di ritardo dello 0.8‰ giornaliero sull'importo netto contrattuale per ritardo d'esecuzione (art. 113 Codice).",
      "Penale di €500/giorno per ritardi nell'approntamento del cantiere o assenza prolungata del Direttore Tecnico.",
      "Penalizzazione dello 0.5‰ in caso di mancato uso provato di materiali isolanti provvisti di etichetta ecologica CAM."
    ]
  },
  {
    id: "strada-bologna",
    title: "Ampliamento Asse Viario e Sottoservizi - SP12 Pianura Bolognese",
    cig: "A045B899C5",
    region: "Emilia-Romagna (Bologna)",
    value: "€ 3.800.000,00",
    category: "OG3 (Strade, autostrade, ponti), IV Classifica",
    deadline: "24 Luglio 2026 - Ore 13:00",
    requirements: [
      {
        category: "SOA",
        description: "Attestazione SOA categoria OG3 Classifica IV (€ 2.582.000,00+)",
        satisfied: false,
        details: "L'impresa ha solo OG3 Classifica III. Mancano requisiti per coprire il valore intero. Necessaria cooptazione RTI o Avvalimento Tecnico-Operativo."
      },
      {
        category: "ISO",
        description: "ISO 9001 obbligatoria limitatamente al settore di accreditamento EA 28 (Costruzioni).",
        satisfied: true,
        details: "Presente certificazione accreditata con scadenza Nov 2027."
      }
    ],
    sections: [
      {
        id: "sec-301",
        title: "Metodologia Sicurezza Stradale e Gestione Traffico (Max 40 Punti)",
        importance: "high",
        summary: "Piattaforma stradale trafficata. Vengono assegnati punteggi preferenziali a chi presenta un piano di gestione dei flussi ad impatto zero (es. lavorazioni notturne, sensi unici alternati assistiti da sensori smart e cartellonistica a messaggio variabile).",
        originalTextSnippet: "L'impresa concorrente dovrà proporre adeguate soluzioni di cantierizzazione idonee a minimizzare l'interferenza con i flussi di traffico diurno nel tratto KM 12+000... Criterio T1, punti 40.",
        scoreWeight: "40 Punti"
      }
    ],
    anomalies: [
      "Penale in deroga al Codice pari all'1,5 per mille al giorno (superiore al limite massimo standard dell'1 per mille contemplato dalle Linee Guida ANAC).",
      "Obbligo di campionatura fisica dell'asfalto fonoassorbente entro 5 giorni dalla chiusura delle offerte, palese ostacolo logistico."
    ],
    penalties: [
      "Penale in deroga al Codice pari all'1.5‰ al giorno per ritardi di ultimazione (limite di legge standard sarebbe 1.0‰).",
      "Penale contrattuale di €1.500 per singola interruzione diurna non comunicata o deviazione asse stradale SP12.",
      "Penale fissa di €1.000/giorno per ritardo o mancato invio delle letture dei sensori di traffico smart."
    ]
  }
];

export const samplePrompts = [
  {
    label: "Analizza bando Piccoli Passi (€1.25M)",
    prompt: "Fai un'analisi approfondita del bando Scuola Materna 'Piccoli Passi' Roma in base al D.Lgs 36/2023. Rileva SOA richieste, requisiti soddisfatti e anomalie riscontrate.",
    targetTenderId: "scuola-roma"
  },
  {
    label: "Come funziona questo LLM + MCP?",
    prompt: "Spiegami concretamente come potrei implementare un sistema del genere strutturato ad agenti. Fammi degli esempi in TypeScript e mostra l'integrazione con Supabase e l'SDK MCP."
  },
  {
    label: "Crea bozza per Criterio Sicurezza e CAM",
    prompt: "Genera una bozza formattata in Markdown per l'Offerta Tecnica della gara a Roma, concentrandoti sul Criterio C (Riduzione Impatto Ambientale / CAM) con punteggio max 15 punti.",
    targetTenderId: "scuola-roma"
  },
  {
    label: "Aiuto: sormontare carenza di SOA OG3",
    prompt: "La gara SP12 a Bologna necessita di SOA OG3 Classifica IV. Io ho la Classifica III. Quali rimedi di legge (AVVALIMENTO, RTI, associazione, ecc.) posso attivare nel nuovo codice?",
    targetTenderId: "strada-bologna"
  }
];
