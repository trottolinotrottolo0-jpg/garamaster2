import { useState, useRef } from "react";
import { X, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { requestParseSOA, readFileAsBase64 } from "../lib/parseSOAApi";
import { mapSOACategoriesToANCE } from "../lib/gemini";
import {
  validateSOA,
  compareSoaVersions,
  analyzeSOATimeline,
  applyANCEMappingsToSOA,
  type SOAValidationResult,
} from "../lib/soaValidationEngine";
import type { SOAStructured } from "../types";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".xls") || lower.endsWith(".xlsx");
}

interface SoaParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSOAParsed: (soa: SOAStructured) => void;
  currentSOA?: SOAStructured;
  storicoSOA?: SOAStructured[];
}

export function SoaParserModal({
  isOpen,
  onClose,
  onSOAParsed,
  currentSOA,
  storicoSOA = [],
}: SoaParserModalProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [isMappingANCE, setIsMappingANCE] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<string | null>(null);
  const [parsedSOA, setParsedSOA] = useState<SOAStructured | null>(null);
  const [validationResult, setValidationResult] = useState<SOAValidationResult | null>(null);
  const [versionComparison, setVersionComparison] = useState<ReturnType<
    typeof compareSoaVersions
  > | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const timeline =
    storicoSOA.length > 0
      ? analyzeSOATimeline(
          parsedSOA ? [...storicoSOA, parsedSOA] : storicoSOA
        )
      : null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    if (!isAcceptedFile(file)) {
      setParseError("Solo PDF e Excel (.pdf, .xls, .xlsx) sono supportati.");
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParseSuccess(null);
    setParsedSOA(null);
    setValidationResult(null);
    setVersionComparison(null);

    try {
      const base64 = await readFileAsBase64(file);
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      let result = await requestParseSOA({
        pdfBase64: isPdf ? base64 : undefined,
        excelBase64: !isPdf ? base64 : undefined,
        fileName: file.name,
        mimeType:
          file.type ||
          (isPdf
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      });

      const descrizioni = result.categorie.map((c) => c.descrizione).filter(Boolean);
      if (descrizioni.length > 0) {
        setIsMappingANCE(true);
        try {
          const mappings = await mapSOACategoriesToANCE(descrizioni);
          if (mappings.length > 0) {
            result = applyANCEMappingsToSOA(result, mappings);
          }
        } catch {
          // mapping opzionale — continua con risultato grezzo
        } finally {
          setIsMappingANCE(false);
        }
      }

      const validation = validateSOA(result);
      setValidationResult(validation);

      if (currentSOA) {
        setVersionComparison(compareSoaVersions(currentSOA, result));
      }

      setParsedSOA(result);
      setParseSuccess(
        result.totalCategorie > 0
          ? `${result.totalCategorie} categorie estratte · completezza ${validation.completenessScore}%`
          : "Parsing completato — verifica le note (nessuna categoria trovata)"
      );
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing");
    } finally {
      setIsParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-sm font-bold text-white">Importa SOA da file</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-white transition-colors"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
          {currentSOA && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 mb-2">SOA attuale</div>
              <div className="text-[11px] text-white">
                <div className="font-bold">{currentSOA.fileName}</div>
                <div className="text-slate-400 text-[9px] mt-1">
                  {currentSOA.totalCategorie} categorie · €
                  {currentSOA.importoTotaleMassimoRealizzabile.toLocaleString("it-IT")} max
                  realizzabile · {currentSOA.fonte}
                </div>
              </div>
            </div>
          )}

          {timeline && timeline.versioni.length > 1 && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <div className="text-[10px] font-bold text-brand-gold mb-1">Storico SOA</div>
              <div className="text-[9px] text-slate-300">
                Trend importi:{" "}
                <span
                  className={
                    timeline.trend === "CRESCENTE"
                      ? "text-emerald-400"
                      : timeline.trend === "CALANTE"
                        ? "text-red-400"
                        : "text-slate-400"
                  }
                >
                  {timeline.trend}
                </span>{" "}
                ({timeline.importoTrendPercent >= 0 ? "+" : ""}
                {timeline.importoTrendPercent.toFixed(1)}%)
              </div>
              <div className="text-[8px] text-slate-500 mt-1">
                {timeline.versioni.length} versioni in archivio
              </div>
            </div>
          )}

          <div className="border-2 border-dashed border-neutral-700 rounded-lg p-6 text-center">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileUpload}
              disabled={isParsing || isMappingANCE}
              className="hidden"
              id="soa-file-input"
            />
            <label htmlFor="soa-file-input" className="cursor-pointer block">
              <FileText className="w-8 h-8 text-brand-gold mx-auto mb-2" />
              <div className="text-[11px] text-white font-bold">Seleziona file SOA</div>
              <div className="text-[9px] text-slate-400 mt-1">PDF CCIAA o Excel</div>
            </label>
          </div>

          {(isParsing || isMappingANCE) && (
            <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-neutral-950 rounded-lg p-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
              {isMappingANCE
                ? "Mapping categorie verso standard ANCE..."
                : "Parsing file in corso con DeepSeek..."}
            </div>
          )}

          {parseError && (
            <div className="flex items-start gap-2 text-[10px] text-red-400 bg-red-950/20 border border-red-900/50 rounded-lg p-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {parseSuccess && (
            <div className="flex items-start gap-2 text-[10px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {parseSuccess}
            </div>
          )}

          {validationResult && (
            <div
              className={`border rounded-lg p-3 ${
                validationResult.isComplete
                  ? "bg-emerald-950/20 border-emerald-900/50"
                  : "bg-red-950/20 border-red-900/50"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[10px] font-bold">
                  {validationResult.isComplete ? "✓ SOA Completo" : "⚠️ SOA Incompleto"}
                </div>
                <div
                  className={`text-[10px] font-mono font-bold ${
                    validationResult.completenessScore >= 80
                      ? "text-emerald-400"
                      : validationResult.completenessScore >= 60
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}
                >
                  {validationResult.completenessScore}%
                </div>
              </div>

              {validationResult.issues.length > 0 && (
                <div className="space-y-1 mb-2">
                  {validationResult.issues
                    .filter((i) => i.severity === "CRITICA" || i.severity === "ALTA")
                    .map((issue) => (
                      <div
                        key={issue.id}
                        className={`text-[9px] ${
                          issue.severity === "CRITICA" ? "text-red-400" : "text-amber-400"
                        }`}
                      >
                        {issue.severity === "CRITICA" ? "🔴" : "🟠"} {issue.descrizione}
                      </div>
                    ))}
                </div>
              )}

              {validationResult.warnings.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  {validationResult.warnings.map((w) => (
                    <div key={w.id} className="text-[9px] text-slate-400">
                      ⚠ {w.descrizione}
                    </div>
                  ))}
                </div>
              )}

              {validationResult.recommendations.length > 0 && (
                <div className="text-[9px] text-slate-300 border-t border-current/20 pt-2 mt-2">
                  {validationResult.recommendations.map((rec, i) => (
                    <div key={i}>→ {rec}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {versionComparison && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <div className="text-[10px] font-bold text-brand-gold mb-2">
                Confronto con SOA attuale
              </div>
              <div className="grid grid-cols-3 gap-2 text-[9px]">
                <div>
                  <span className="text-emerald-400 font-bold">
                    +{versionComparison.categorieAggiunte.length}
                  </span>
                  <div className="text-slate-500">aggiunte</div>
                </div>
                <div>
                  <span className="text-red-400 font-bold">
                    -{versionComparison.categorieRimosse.length}
                  </span>
                  <div className="text-slate-500">rimosse</div>
                </div>
                <div>
                  <span
                    className={`font-mono font-bold ${
                      versionComparison.deltaImportoTotale >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {versionComparison.deltaImportoTotale >= 0 ? "+" : ""}
                    €{versionComparison.deltaImportoTotale.toLocaleString("it-IT")}
                  </span>
                  <div className="text-slate-500">Δ importo</div>
                </div>
              </div>
            </div>
          )}

          {parsedSOA && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
              <div className="text-[10px] font-bold text-brand-gold">Categorie estratte</div>
              {parsedSOA.categorie.slice(0, 10).map((cat) => (
                <div key={cat.id} className="text-[9px] bg-neutral-900 rounded p-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-white">{cat.codice}</span>
                    <span className="text-slate-500 shrink-0">{cat.confidenza}%</span>
                  </div>
                  <div className="text-slate-400">{cat.descrizione}</div>
                  <div className="text-emerald-400 font-mono">
                    €{cat.importoMaxRealizzato.toLocaleString("it-IT")} ·{" "}
                    {cat.annoUltimaRealizzazione}
                  </div>
                </div>
              ))}
              {parsedSOA.categorie.length > 10 && (
                <div className="text-[9px] text-slate-500">
                  +{parsedSOA.categorie.length - 10} categorie...
                </div>
              )}
              {parsedSOA.noteParsing.length > 0 && (
                <div className="text-[8px] text-amber-400 bg-amber-950/20 rounded p-1.5 mt-2">
                  {parsedSOA.noteParsing.join(" • ")}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-neutral-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded hover:border-neutral-600 transition-colors"
          >
            Chiudi
          </button>
          {parsedSOA && (
            <button
              type="button"
              onClick={() => {
                onSOAParsed(parsedSOA);
                onClose();
              }}
              className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-brand-gold text-black rounded hover:bg-yellow-400 transition-colors"
            >
              Salva SOA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
