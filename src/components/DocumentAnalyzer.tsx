import React, { useState } from "react";
import { TenderDocument, TenderRequirement } from "../types";
import { FileText, HelpCircle, HardHat, FileCheck2, ShieldAlert, Check, X, ArrowRight, Upload, Calendar, Landmark, Coins, RefreshCw } from "lucide-react";
import { mockTenders } from "../mockData";

interface DocumentAnalyzerProps {
  selectedTender: TenderDocument;
  onSelectTender: (tender: TenderDocument) => void;
  onAddCustomTender: (newTender: TenderDocument) => void;
}

export const DocumentAnalyzer: React.FC<DocumentAnalyzerProps> = ({
  selectedTender,
  onSelectTender,
  onAddCustomTender,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleParseFile(e.dataTransfer.files[0].name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleParseFile(e.target.files[0].name);
    }
  };

  const handleParseFile = (fileName: string) => {
    setAnalyzingFile(true);

    setTimeout(() => {
      const generatedSpec: TenderDocument = {
        id: `custom-tender-${Date.now()}`,
        title: `GARA CARICATA: Manutenzione Straordinaria Complesso Scolastico - ${fileName.replace(/\.[^/.]+$/, "")}`,
        cig: `A0${Math.floor(Math.random() * 900000) + 100000}FF`,
        region: "Marche (Ancona)",
        value: "€ 890.000,00",
        category: "OG1 (Edifici civili), I Classifica",
        deadline: "30 Settembre 2026 - Ore 12:00",
        requirements: [
          {
            category: "SOA",
            description: "Attestazione SOA categoria prevalente OG1 Classifica I (€ 258.000,00+)",
            satisfied: true,
            details: "L'impresa possiede OG1 Classifica III. Requisito pienamente superato."
          },
          {
            category: "ISO",
            description: "ISO 9001 certificata per il settore EA 28.",
            satisfied: true,
            details: "Certificazione valida ed estratta dal cassetto digitale."
          },
          {
            category: "Fatturato",
            description: "Nessun requisito minimo di fatturato imposto nel disciplinare.",
            satisfied: true,
            details: "Adempimento assente - Facilitazione d'accesso prevista dal nuovo Codice."
          }
        ],
        sections: [
          {
            id: "sec-cust-1",
            title: "Criterio Tecnico (Punteggio Massimo 80)",
            importance: "high",
            summary: "Punti prioritari assegnati all'utilizzo di materiali riciclati a chilometro zero e all'inserimento di operai locali svantaggiati per l'inclusione sociale.",
            originalTextSnippet: "Verranno attribuiti fino a 80 punti all'offerta tecnica. Di questi, 40 punti premiano criteri di economia circolare..."
          }
        ],
        anomalies: [
          "Manca la clausola di revisione prezzi prevista obbligatoriamente dall'art. 60 del nuovo Codice dei Contratti Pubblici.",
          "Richiesta cauzione provvisoria raddoppiata in caso di mancata dichiarazione di impegno, potenziale clausola restrittiva non ammessa."
        ],
        penalties: [
          "Penale standard dello 0.7‰ giornaliero per ritardata consegna o avvio delle opere edili.",
          "Penale di €200/giorno per ritardi nel conferimento delle certificazioni dei materiali riciclati usati."
        ]
      };

      onAddCustomTender(generatedSpec);
      onSelectTender(generatedSpec);
      setAnalyzingFile(false);
    }, 1500);
  };

  const currentTender = selectedTender || mockTenders[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="document-analyzer-view">
      {/* Tenders selectors and simulation upload */}
      <div className="lg:col-span-4 space-y-4">
        {/* Dropdowns / List of parsed specs */}
        <div className="bg-black border border-neutral-800 rounded-xl p-4 shadow-xs">
          <label className="text-[10px] font-sans font-extrabold text-slate-450 uppercase tracking-wider block mb-2.5">
            Disciplinari di Gara Disponibili
          </label>
          <div className="space-y-1.5">
            {mockTenders.map((tender) => (
              <button
                key={tender.id}
                onClick={() => onSelectTender(tender)}
                className={`w-full text-left p-3 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
                  currentTender.id === tender.id
                    ? "bg-neutral-900 border-brand-gold text-white shadow-xs"
                    : "bg-black border-neutral-800 text-slate-300 hover:border-brand-gold hover:text-white"
                }`}
                id={`tender-selector-${tender.id}`}
              >
                <div className="space-y-1 pr-2 truncate">
                  <div className="font-bold truncate">{tender.title}</div>
                  <div className="font-mono text-[10px] opacity-70 flex items-center gap-1.5">
                    <span>CIG: {tender.cig}</span> 
                    <span className="text-brand-gold font-bold font-sans">{tender.value}</span>
                  </div>
                </div>
                <ArrowRight className={`w-4 h-4 shrink-0 transition-transform ${currentTender.id === tender.id ? "translate-x-1 text-brand-gold" : "opacity-65 text-slate-500"}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Upload Container - Supports click and drag */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[160px] cursor-pointer ${
            dragActive ? "border-brand-gold bg-neutral-950/80 shadow-md" : "border-neutral-800 bg-black hover:border-brand-gold"
          }`}
          id="custom-file-drag-zone"
        >
          {analyzingFile ? (
            <div className="flex flex-col items-center space-y-2 text-slate-350">
              <RefreshCw className="w-8 h-8 animate-spin text-brand-gold" />
              <span className="text-xs font-sans font-bold text-white">Lettura OCR & Estrazione AI...</span>
              <p className="text-[10px] text-slate-400 italic">Verifica SOA, ISO & Nuove Legge D.Lgs 36/2023</p>
            </div>
          ) : (
            <div className="space-y-2 flex flex-col items-center">
              <div className="p-3 bg-neutral-900 rounded-full text-brand-gold border border-neutral-800">
                <Upload className="w-5 h-5 text-brand-gold" />
              </div>
              <span className="text-xs font-sans font-bold text-white">
                Trascina o Carica Disciplinare (.pdf)
              </span>
              <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed mx-auto italic">
                Verifica automatica requisiti, controllo SOA ed estratti d'asta con AI.
              </p>
              <label className="cursor-pointer transition-all text-[10px] font-bold bg-neutral-900 hover:bg-neutral-800 text-white rounded border border-neutral-800 px-3 py-1.5 text-center font-sans tracking-wide">
                Seleziona File
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Main Analysis details panel */}
      <div className="lg:col-span-8 space-y-4">
        {currentTender && (
          <div className="bg-black border border-neutral-800 rounded-xl p-6 shadow-xs space-y-6" id="parsed-tender-details">
            {/* Title and main CIG indicators */}
            <div className="border-b border-neutral-805 pb-5 space-y-3">
              <span className="bg-neutral-905 text-brand-gold text-[10px] px-2.5 py-0.5 rounded font-sans font-bold border border-neutral-800">
                Dossier Analizzato da GaraMaster
              </span>
              <h2 className="font-sans font-extrabold text-base sm:text-lg text-white tracking-tight leading-snug">
                {currentTender.title}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-[11px] font-mono">
                <div className="bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800">
                  <div className="text-slate-450 font-bold font-sans">CIG</div>
                  <div className="text-white font-semibold mt-0.5">{currentTender.cig}</div>
                </div>
                <div className="bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800">
                  <div className="text-slate-450 font-bold font-sans">IMPORTO</div>
                  <div className="text-brand-gold font-bold mt-0.5">{currentTender.value}</div>
                </div>
                <div className="bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800">
                  <div className="text-slate-450 font-bold font-sans">REGIONE</div>
                  <div className="text-white font-semibold mt-0.5">{currentTender.region}</div>
                </div>
                <div className="bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800">
                  <div className="text-slate-450 font-bold font-sans">SCADENZA</div>
                  <div className="text-white font-semibold mt-0.5 truncate">{currentTender.deadline.split(" - ")[0]}</div>
                </div>
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-brand-gold" />
                Matrice Requisiti d'Accesso (SOA / ISO / Fatturati)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentTender.requirements.map((req, index) => (
                  <div
                    key={index}
                    className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 flex flex-col justify-between transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 p-1 rounded-full bg-neutral-900 border border-neutral-800 text-brand-gold">
                        {req.satisfied ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-red-400" />}
                      </div>
                      <div>
                        <span className="text-[10px] font-mono font-bold text-brand-gold block tracking-widest uppercase">
                          {req.category}
                        </span>
                        <h5 className="font-sans font-bold text-xs text-white mt-0.5 leading-snug">
                          {req.description}
                        </h5>
                        <p className="text-[11px] text-slate-300 mt-2 font-sans leading-relaxed">
                          {req.details}
                        </p>
                      </div>
                    </div>

                    {!req.satisfied && (
                      <div className="mt-3.5 pt-2.5 border-t border-neutral-800 text-[10px] text-slate-350 flex flex-col gap-1 italic leading-relaxed">
                        <span className="font-bold font-sans not-italic flex items-center gap-1 text-brand-gold">
                          <ShieldAlert className="w-3.5 h-3.5 text-brand-gold" />
                          Rimedio di Legge (D.Lgs. 36/2023):
                        </span>
                        Consigliato Contratto di Avvalimento di tipo Tecnico-Operativo (Art. 104) con operatore idoneo, oppure associazione RTI.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Summarized Key Sections */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-gold" />
                Estratti Rilevanti del Capitolato Speciale
              </h4>
              <div className="space-y-3">
                {currentTender.sections.map((sec) => (
                  <div key={sec.id} className="border border-neutral-800 rounded-xl p-4 bg-neutral-950 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-sans font-bold text-xs text-white">
                        {sec.title}
                      </h5>
                      {sec.scoreWeight && (
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-brand-gold leading-none">
                          {sec.scoreWeight}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {sec.summary}
                    </p>
                    <div className="bg-black p-3 rounded-lg border border-neutral-800 text-[10px] text-slate-400 leading-relaxed font-mono">
                      <span className="font-bold text-brand-gold block mb-1">RITAGLIO TESTO DISCIPLINARE:</span>
                      "{sec.originalTextSnippet}"
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Anomalies Panel */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-brand-gold animate-pulse" />
                Rilevamento Clausole Anomalas / Vessatorie
              </h4>
              <div className="bg-neutral-950 border border-neutral-850 rounded-xl p-4 space-y-2.5">
                {currentTender.anomalies.map((an, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-300 font-sans leading-relaxed">
                    <span className="font-mono text-xs font-bold text-brand-gold">{i + 1}.</span>
                    <span>{an}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
