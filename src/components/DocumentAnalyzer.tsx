import React, { useState } from "react";
import { TenderDocument } from "../types";
import {
  FileText,
  FileCheck2,
  ShieldAlert,
  Check,
  X,
  ArrowRight,
  Upload,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { mockTenders } from "../mockData";
import { readFileAsBase64, requestParseDisciplinare } from "../lib/parseDisciplinareApi";
import { mapParseToTenderPreview } from "../lib/disciplinareParseMapper";
import { saveParsedDisciplinareToGare } from "../services/disciplinareParserService";
import type { ProfiloImpresaContext } from "../types/database";

interface DocumentAnalyzerProps {
  selectedTender: TenderDocument;
  onSelectTender: (tender: TenderDocument) => void;
  onAddCustomTender: (newTender: TenderDocument) => void;
  userId?: string;
  profilo?: ProfiloImpresaContext | null;
  supabaseConfigured?: boolean;
  onGaraSaved?: (tender: TenderDocument) => void;
  catalogTenders?: TenderDocument[];
}

const MAX_PDF_BYTES = 12 * 1024 * 1024;

export const DocumentAnalyzer: React.FC<DocumentAnalyzerProps> = ({
  selectedTender,
  onSelectTender,
  onAddCustomTender,
  userId,
  profilo,
  supabaseConfigured = false,
  onGaraSaved,
  catalogTenders,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [lastParsedFile, setLastParsedFile] = useState<string | null>(null);

  const tenderList =
    catalogTenders && catalogTenders.length > 0 ? catalogTenders : mockTenders;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setParseError("Carica solo file PDF (.pdf).");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setParseError("PDF troppo grande (max 12 MB).");
      return;
    }

    setParseError(null);
    setAnalyzingFile(true);
    setLastParsedFile(file.name);

    try {
      const pdfBase64 = await readFileAsBase64(file);
      const { parse } = await requestParseDisciplinare({
        pdfBase64,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
      });

      let tender: TenderDocument;

      if (userId && supabaseConfigured) {
        const saved = await saveParsedDisciplinareToGare({
          userId,
          parse,
          fileName: file.name,
          profilo,
        });
        tender = saved.tender;
        onGaraSaved?.(tender);
      } else {
        const previewId = `custom-tender-${Date.now()}`;
        tender = mapParseToTenderPreview(previewId, parse, profilo);
        tender = { ...tender, id: previewId };
        onAddCustomTender(tender);
      }

      onSelectTender(tender);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Analisi disciplinare non riuscita.";
      setParseError(message);
      console.error("[DocumentAnalyzer]", message);
    } finally {
      setAnalyzingFile(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processPdfFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processPdfFile(file);
    e.target.value = "";
  };

  const currentTender = selectedTender || mockTenders[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="document-analyzer-view">
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-black border border-neutral-800 rounded-xl p-4 shadow-xs">
          <label className="text-[10px] font-sans font-extrabold text-slate-450 uppercase tracking-wider block mb-2.5">
            Disciplinari di Gara Disponibili
          </label>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto scrollbar-thin">
            {tenderList.map((tender) => (
              <button
                key={tender.id}
                type="button"
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
                <ArrowRight
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    currentTender.id === tender.id
                      ? "translate-x-1 text-brand-gold"
                      : "opacity-65 text-slate-500"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[160px] cursor-pointer ${
            dragActive
              ? "border-brand-gold bg-neutral-950/80 shadow-md"
              : "border-neutral-800 bg-black hover:border-brand-gold"
          }`}
          id="custom-file-drag-zone"
        >
          {analyzingFile ? (
            <div className="flex flex-col items-center space-y-2 text-slate-350">
              <RefreshCw className="w-8 h-8 animate-spin text-brand-gold" />
              <span className="text-xs font-sans font-bold text-white">
                Parser Disciplinare (Gemini)…
              </span>
              <p className="text-[10px] text-slate-400 italic">
                {lastParsedFile ?? "Estrazione SOA, penali, scadenze, CAM"}
              </p>
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
                Gemini estrae requisiti, importo, scadenza e penali; salvataggio su Supabase
                {supabaseConfigured && userId ? " (tabella gare)" : " (anteprima locale)"}.
              </p>
              <label className="cursor-pointer transition-all text-[10px] font-bold bg-neutral-900 hover:bg-neutral-800 text-white rounded border border-neutral-800 px-3 py-1.5 text-center font-sans tracking-wide">
                Seleziona File
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          )}
        </div>

        {parseError && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 flex gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <p>{parseError}</p>
          </div>
        )}
      </div>

      <div className="lg:col-span-8 space-y-4">
        {currentTender && (
          <div
            className="bg-black border border-neutral-800 rounded-xl p-6 shadow-xs space-y-6"
            id="parsed-tender-details"
          >
            <div className="border-b border-neutral-805 pb-5 space-y-3">
              <span className="bg-neutral-905 text-brand-gold text-[10px] px-2.5 py-0.5 rounded font-sans font-bold border border-neutral-800">
                Dossier Analizzato da GaraMaster — Parser Disciplinare
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
                  <div className="text-white font-semibold mt-0.5 truncate">
                    {currentTender.deadline.split(" - ")[0]}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-brand-gold" />
                Matrice Requisiti d&apos;Accesso (SOA / ISO / Fatturati / CAM)
              </h4>

              {currentTender.requirements.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  Carica un PDF disciplinare per estrarre i requisiti con Gemini.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentTender.requirements.map((req, index) => (
                    <div
                      key={index}
                      className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950 flex flex-col justify-between transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 p-1 rounded-full bg-neutral-900 border border-neutral-800 text-brand-gold">
                          {req.satisfied ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-red-400" />
                          )}
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
                          RTI o Avvalimento (art. 104) se il requisito è bloccante.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {currentTender.sections.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-gold" />
                  Criteri e sezioni estratte
                </h4>
                <div className="space-y-3">
                  {currentTender.sections.map((sec) => (
                    <div
                      key={sec.id}
                      className="border border-neutral-800 rounded-xl p-4 bg-neutral-950 space-y-3"
                    >
                      <h5 className="font-sans font-bold text-xs text-white">{sec.title}</h5>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">{sec.summary}</p>
                      {sec.originalTextSnippet && (
                        <div className="bg-black p-3 rounded-lg border border-neutral-800 text-[10px] text-slate-400 leading-relaxed font-mono">
                          {sec.originalTextSnippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(currentTender.penalties.length > 0 || currentTender.anomalies.length > 0) && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-sans font-extrabold uppercase tracking-widest text-[#FFD700] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-brand-gold animate-pulse" />
                  Penali e clausole a rischio
                </h4>
                <div className="bg-neutral-950 border border-neutral-850 rounded-xl p-4 space-y-2.5">
                  {[...currentTender.penalties, ...currentTender.anomalies]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((an, i) => (
                      <div
                        key={i}
                        className="flex gap-2 text-xs text-slate-300 font-sans leading-relaxed"
                      >
                        <span className="font-mono text-xs font-bold text-brand-gold">{i + 1}.</span>
                        <span>{an}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
