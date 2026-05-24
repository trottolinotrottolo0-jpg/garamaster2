# -*- coding: utf-8 -*-
"""
GaraMaster AI - Synthetic Dataset Generator for Public Procurement Fine-Tuning
Genera dataset in formato JSONL di coppie Istruzione/Risposta strutturate basate sul
Nuovo Codice dei Contratti Pubblici (D.Lgs. 36/2023).
"""

import json
import random

# Template di base per domande e risposte sintetiche per il fine-tuning legale-amministrativo
TEMPLATES = [
    {
        "category": "SOA",
        "question": "L'impresa possiede la categoria prevalente {categoria_posseduta} Classifica {classifica_posseduta}, ma il bando richiede la categoria {categoria_richiesta} Classifica {classifica_richiesta} per un importo di {valore_gara}. Posso partecipare? Come posso rimediare?",
        "answer": "In base al D.Lgs. 36/2023 e ai requisiti di qualificazione dell'operatore economico, la tua classifica {classifica_posseduta} (€ {valore_posseduto_max}) è INSUFFICIENTE a coprire la classifica {classifica_richiesta} richiesta per l'importo di {valore_gara}.\n\nSoluzione e Rimedio di Legge:\n1. **Contratto di Avvalimento Tecnico-Operativo (Art. 104 del Codice)**: Puoi stipulare un contratto di avvalimento con un'impresa ausiliaria idonea che ti metta a disposizione l'attestazione SOA richiesta.\n2. **Raggruppamento Temporaneo di Imprese (RTI - Art. 97)**: Puoi costituire un RTI di tipo verticale o orizzontale associandoti con un partner che possiede la qualificazione mancante."
    },
    {
        "category": "Revisione Prezzi",
        "question": "Nel capitolato speciale di una gara da {valore_gara} CIG {cig} non è presente la clausola di adeguamento dei prezzi. Quali tutele offre il D.Lgs. 36/2023?",
        "answer": "L'assenza di clausole di revisione dei prezzi costituisce una violazione diretta dell'**Articolo 60 del D.Lgs. 36/2023**, che stabilisce l'obbligatorietà dell'inserimento di tali clausole in tutti i documenti di gara per far fronte a variazioni di costo superiori al 5%.\n\nRaccomandazione Operativa:\nSi consiglia di formulare un **chiarimento formale alla stazione appaltante** richiedendo la rettifica del disciplinare e l'integrazione della clausola di adeguamento prezzi. In assenza di rettifica, l'impresa ha il diritto di richiedere l'applicazione automatica dei parametri inflattivi ISTAT nei limiti definiti dall'art. 60 durante la fase di esecuzione."
    },
    {
        "category": "Soccorso Istruttorio",
        "question": "Ho dimenticato di firmare digitalmente l'offerta tecnica per la gara CIG {cig}. La stazione appaltante può escludermi direttamente o si applica il soccorso istruttorio?",
        "answer": "Ai sensi dell'**Articolo 101 del D.Lgs. 36/2023 (Soccorso Istruttorio)**, la mancanza di firma digitale o l'irregolarità formale della documentazione amministrativa o tecnica NON costituisce causa di esclusione automatica, a patto che la paternità dell'offerta sia comunque desumibile.\n\nProcedura di Regolarizzazione:\nLa commissione giudicatrice assegnerà un termine non superiore a 10 giorni per sanare l'omissione mediante l'apposizione della firma digitale, senza alcuna penale pecuniaria (abolita dal nuovo Codice). Nota bene: Il soccorso istruttorio non può essere applicato per sanare carenze sostanziali dell'offerta tecnica o economica (integrazione di elementi mancanti dell'offerta stessa)."
    },
    {
        "category": "Cauzione Provvisoria",
        "question": "Il disciplinare richiede una garanzia provvisoria del 2% sull'importo di {valore_gara}. Sono in possesso della certificazione ISO 9001. A quali riduzioni ho diritto?",
        "answer": "Ai sensi dell'**Articolo 106 del D.Lgs. 36/2023**, l'operatore economico in possesso della certificazione del sistema di qualità conforme alle norme europee (ISO 9001) ha diritto a una **riduzione del 30%** sull'importo della garanzia provvisoria.\n\nUlteriori Sconti Cumulabili:\n- **Miglioramento dell'efficienza energetica o rating di legalità**: Ulteriori riduzioni (fino ad un massimo cumulato del 50% o secondo gli scaglioni previsti dall'art. 106).\n\nVerifica Documentale:\nAssicurati che la certificazione ISO 9001 sia in corso di validità e inserita nel cassetto digitale dell'operatore (FVOE 2.0) al fine di consentire la verifica automatica da parte del RUP."
    }
]

CATEGORIES_SOA = [
    {"codice": "OG1", "desc": "Edifici civili e industriali"},
    {"codice": "OG3", "desc": "Strade, autostrade, ponti, viadotti"},
    {"codice": "OG11", "desc": "Impianti tecnologici"},
    {"codice": "OS21", "desc": "Opere strutturali speciali"}
]

CLASSIFICHE_SOA = [
    {"romano": "I", "valore": 258000},
    {"romano": "II", "valore": 516000},
    {"romano": "III", "valore": 1033291},
    {"romano": "IV", "valore": 2582284},
    {"romano": "V", "valore": 5164569}
]

def generate_synthetic_dataset(num_samples=100):
    dataset = []
    
    for i in range(num_samples):
        # Pick a random paradigm template
        template = random.choice(TEMPLATES)
        
        # Format variables
        cig = f"{random.randint(90, 99)}{random.randint(100000, 999999)}{random.choice(['A', 'B', 'C', 'F'])}{random.randint(1, 9)}"
        valore_euro = random.randint(300000, 4800000)
        valore_gara_str = f"€ {valore_euro:,.2f}".replace(",", ".")
        
        cat_richiesta = random.choice(CATEGORIES_SOA)
        cat_posseduta = random.choice(CATEGORIES_SOA)
        
        idx_richiesta = random.randint(1, len(CLASSIFICHE_SOA) - 1)
        idx_posseduta = random.randint(0, idx_richiesta - 1)
        
        class_richiesta = CLASSIFICHE_SOA[idx_richiesta]
        class_posseduta = CLASSIFICHE_SOA[idx_posseduta]
        
        # Render question and answer text dynamically
        question = template["question"].format(
            categoria_posseduta=cat_posseduta["codice"],
            classifica_posseduta=class_posseduta["romano"],
            categoria_richiesta=cat_richiesta["codice"],
            classifica_richiesta=class_richiesta["romano"],
            valore_gara=valore_gara_str,
            valore_posseduto_max=f"{class_posseduta['valore']:,.2f}".replace(",", "."),
            cig=cig
        )
        
        answer = template["answer"].format(
            categoria_posseduta=cat_posseduta["codice"],
            classifica_posseduta=class_posseduta["romano"],
            categoria_richiesta=cat_richiesta["codice"],
            classifica_richiesta=class_richiesta["romano"],
            valore_gara=valore_gara_str,
            valore_posseduto_max=f"{class_posseduta['valore']:,.2f}".replace(",", "."),
            cig=cig
        )
        
        # JSON-RPC / Alpaca Fine-Tuning Format
        record = {
            "instruction": "Agisci come esperto del procurement pubblico italiano e rispondi alla domanda legale sulla base del Nuovi Codici dei Contratti Pubblici (D.Lgs. 36/2023).",
            "input": question,
            "output": answer,
            "metadata": {
                "source": "D.Lgs. 36/2023 (Nuovo Codice)",
                "category": template["category"],
                "generated_by": "GaraMaster Synthetic Pipeline"
            }
        }
        
        dataset.append(record)
        
    return dataset

if __name__ == "__main__":
    output_file = "gara_master_dataset.jsonl"
    print(f"[*] Avvio generazione di {150} campioni sintetici per fine-tuning...")
    samples = generate_synthetic_dataset(150)
    
    with open(output_file, "w", encoding="utf-8") as f:
        for entry in samples:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            
    print(f"[+] Generazione completata con successo!")
    print(f"[+] Output salvato in: ./{output_file}")
    print(f"[i] Formato record di esempio:\n{json.dumps(samples[0], indent=2, ensure_ascii=False)}")
