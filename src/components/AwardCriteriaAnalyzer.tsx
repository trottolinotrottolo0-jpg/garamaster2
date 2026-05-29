import { useState, useMemo, useEffect, type ChangeEvent } from "react";
import { X, FileText, Loader2, AlertCircle } from "lucide-react";
import { requestParseAwardCriteria } from "../lib/parseAwardCriteriaApi";
import {
  attachReverseMapToAnalysis,
  buildReverseMapping,
  IMPATTO_CLASS,
  benchmarkCompetitorOnCriterio,
  compareAwardCriteria,
  simulateScoreForCriterio,
  CRITERIA_PATTERN_LABEL,
} from "../lib/awardCriteriaEngine";
import {
  generateProposalGuidedText,
  type ProposalGuidedTextResult,
} from "../lib/gemini";
import { readFileAsBase64 } from "../lib/parseSOAApi";
import type { AwardCriteriaAnalysis, CompanyProfile, TenderDocument } from "../types";

const PROFILE_KEY = "gm_company_profile";

interface AwardCriteriaAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
}

export function AwardCriteriaAnalyzer({
  isOpen,
  onClose,
  tender,
}: AwardCriteriaAnalyzerProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AwardCriteriaAnalysis | null>(null);
  const [comparisonAnalysis, setComparisonAnalysis] = useState<AwardCriteriaAnalysis | null>(
    null
  );
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedCriterioId, setSelectedCriterioId] = useState<string | null>(null);
  const [elementsPresentati, setElementsPresentati] = useState<string[]>([]);
  const [proposalGenerated, setProposalGenerated] = useState<ProposalGuidedTextResult | null>(
    null
  );
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      setCompanyProfile(stored ? (JSON.parse(stored) as CompanyProfile) : null);
    } catch {
      setCompanyProfile(null);
    }
  }, [isOpen]);

  const reverseMapping = useMemo(
    () => (analysisResult ? buildReverseMapping(analysisResult) : []),
    [analysisResult]
  );

  const selectedMapping = selectedCriterioId
    ? reverseMapping.find((r) => r.criterioId === selectedCriterioId)
    : null;

  const criteriaComparison = useMemo(() => {
    if (!analysisResult || !comparisonAnalysis) return null;
    return compareAwardCriteria(analysisResult, comparisonAnalysis);
  }, [analysisResult, comparisonAnalysis]);

  const scoreSimulation = useMemo(() => {
    if (!selectedMapping) return null;
    return simulateScoreForCriterio(
      selectedMapping.criterio,
      selectedMapping.voci,
      elementsPresentati
    );
  }, [selectedMapping, elementsPresentati]);

  const competitorBenchmark = useMemo(() => {
    if (!selectedMapping || !scoreSimulation) return null;
    return benchmarkCompetitorOnCriterio(
      selectedMapping.criterio,
      scoreSimulation.stima,
      selectedMapping.voci
    );
  }, [selectedMapping, scoreSimulation]);

  useEffect(() => {
    if (!selectedMapping) {
      setElementsPresentati([]);
      setProposalGenerated(null);
      return;
    }
    setElementsPresentati(
      selectedMapping.voci.filter((v) => v.obbligatorio).map((v) => v.descrizione)
    );
    setProposalGenerated(null);
    setProposalError(null);
  }, [selectedMapping?.criterioId]);

  if (!isOpen) return null;

  const parsePdfFile = async (file: File, forComparison: boolean) => {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setParseError("Solo PDF supportati.");
      return;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const base64 = await readFileAsBase64(file);
      const raw = await requestParseAwardCriteria({
        bandoPdfBase64: base64,
        fileName: file.name,
        tender: forComparison
          ? { ...tender, id: `${tender.id}-compare`, title: file.name.replace(/\.pdf$/i, "") }
          : tender,
      });
      const enriched = attachReverseMapToAnalysis(raw);
      if (forComparison) {
        setComparisonAnalysis(enriched);
        setIsCompareMode(false);
      } else {
        setAnalysisResult(enriched);
        setComparisonAnalysis(null);
        setSelectedCriterioId(null);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Errore parsing");
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    await parsePdfFile(file, isCompareMode && !!analysisResult);
    e.target.value = "";
  };

  const toggleElement = (desc: string) => {
    setElementsPresentati((prev) =>
      prev.includes(desc) ? prev.filter((d) => d !== desc) : [...prev, desc]
    );
  };

  const titlePreview =
    tender.title.length > 40 ? `${tender.title.substring(0, 40)}…` : tender.title;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-sm font-bold text-white">
            Award Criteria Reverse Mapper — {titlePreview}
          </h2>
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
          {!analysisResult && (
            <>
              <div className="border-2 border-dashed border-neutral-700 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileUpload}
                  disabled={isParsing}
                  className="hidden"
                  id="bando-file-input"
                />
                <label htmlFor="bando-file-input" className="cursor-pointer block">
                  <FileText className="w-8 h-8 text-brand-gold mx-auto mb-2" />
                  <div className="text-[11px] text-white font-bold">Carica bando PDF</div>
                  <div className="text-[9px] text-slate-400 mt-1">
                    Sezione valutazione offerta tecnica
                  </div>
                </label>
              </div>

              {isParsing && (
                <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-neutral-950 rounded-lg p-2">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
                  Analisi criteri di valutazione con DeepSeek...
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 text-[10px] text-red-400 bg-red-950/20 border border-red-900/50 rounded-lg p-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {parseError}
                </div>
              )}
            </>
          )}

          {analysisResult && !selectedMapping && (
            <>
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] font-bold text-brand-gold">Analisi criteri</div>
                  <button
                    type="button"
                    onClick={() => setIsCompareMode(true)}
                    className="cursor-pointer text-[9px] text-brand-gold hover:text-yellow-300"
                  >
                    + Confronta 2° bando
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[9px]">
                  <div className="bg-neutral-900 rounded p-2">
                    <div className="text-slate-500">Criteri</div>
                    <div className="font-bold text-white">{analysisResult.criteri.length}</div>
                  </div>
                  <div className="bg-neutral-900 rounded p-2">
                    <div className="text-slate-500">Punti totali</div>
                    <div className="font-bold text-white">
                      {analysisResult.puntiMassimiTotali}
                    </div>
                  </div>
                  <div className="bg-neutral-900 rounded p-2">
                    <div className="text-slate-500">Complessità</div>
                    <div
                      className={`font-bold ${
                        analysisResult.complessitaValutazione > 70
                          ? "text-red-400"
                          : "text-amber-400"
                      }`}
                    >
                      {analysisResult.complessitaValutazione}/100
                    </div>
                  </div>
                </div>
              </div>

              {isCompareMode && (
                <div className="border border-brand-gold/40 rounded-lg p-3 bg-brand-gold/5">
                  <div className="text-[10px] text-white font-bold mb-2">
                    Carica PDF del secondo bando da confrontare
                  </div>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileUpload}
                    disabled={isParsing}
                    className="text-[9px] text-slate-400 w-full"
                  />
                </div>
              )}

              {criteriaComparison && (
                <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3 space-y-2">
                  <div className="text-[10px] font-bold text-blue-400">
                    Confronto bandi — {CRITERIA_PATTERN_LABEL[criteriaComparison.pattern]}
                  </div>
                  <div className="text-[8px] text-slate-400">
                    {criteriaComparison.bando1Titolo.slice(0, 35)}… vs{" "}
                    {criteriaComparison.bando2Titolo.slice(0, 35)}…
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[9px]">
                    <div>
                      <span className="text-emerald-400 font-bold">
                        {criteriaComparison.criteriComuni.length}
                      </span>
                      <div className="text-slate-500">comuni</div>
                    </div>
                    <div>
                      <span className="text-amber-400 font-bold">
                        +{criteriaComparison.criteriSoloInBando2.length}
                      </span>
                      <div className="text-slate-500">solo bando 2</div>
                    </div>
                    <div>
                      <span
                        className={`font-mono font-bold ${
                          criteriaComparison.deltaComplessita >= 0
                            ? "text-red-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {criteriaComparison.deltaComplessita >= 0 ? "+" : ""}
                        {criteriaComparison.deltaComplessita}
                      </span>
                      <div className="text-slate-500">Δ complessità</div>
                    </div>
                  </div>
                  {criteriaComparison.puntiDifferenziazioneConsigliati.length > 0 && (
                    <ul className="text-[8px] text-slate-300 space-y-0.5">
                      {criteriaComparison.puntiDifferenziazioneConsigliati.map((p, i) => (
                        <li key={i}>→ {p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase">
                  Criteri — clicca per reverse mapping e simulazione
                </div>
                {analysisResult.criteri.map((criterio) => (
                  <button
                    key={criterio.id}
                    type="button"
                    onClick={() => setSelectedCriterioId(criterio.id)}
                    className="cursor-pointer w-full text-left bg-neutral-950 border border-neutral-700 hover:border-brand-gold rounded-lg p-2.5 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <span className="text-[10px] font-bold text-white">{criterio.titolo}</span>
                      <span className="text-[9px] font-mono text-brand-gold font-bold shrink-0">
                        {criterio.puntiTotali} pt
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 line-clamp-2">
                      {criterio.descrizione}
                    </div>
                    <div className="text-[8px] text-slate-500 mt-1">
                      Peso: {criterio.peso.toFixed(1)}% · {criterio.tipoCriterio}
                    </div>
                  </button>
                ))}
              </div>

              {analysisResult.fattoriDecisivi.length > 0 && (
                <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3">
                  <div className="text-[10px] font-bold text-emerald-400 mb-2">
                    Fattori decisivi
                  </div>
                  <ul className="space-y-1">
                    {analysisResult.fattoriDecisivi.map((fattore, i) => (
                      <li key={i} className="text-[9px] text-slate-300">
                        → {fattore}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {selectedMapping && scoreSimulation && competitorBenchmark && (
            <>
              <button
                type="button"
                onClick={() => setSelectedCriterioId(null)}
                className="cursor-pointer text-[9px] text-brand-gold hover:text-yellow-300 transition-colors"
              >
                ← Torna a criteri
              </button>

              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-3">
                <h3 className="text-[11px] font-bold text-brand-gold">
                  {selectedMapping.criterio.titolo} ({selectedMapping.criterio.puntiTotali} pt)
                </h3>

                <div className="bg-neutral-900 rounded p-3 text-[9px] whitespace-pre-wrap text-slate-300 leading-relaxed">
                  {selectedMapping.estrategia}
                </div>

                <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3">
                  <div className="text-[9px] font-bold text-slate-500 uppercase mb-2">
                    Simulatore punteggio — elementi in offerta
                  </div>
                  <div className="space-y-1 mb-2 max-h-36 overflow-y-auto scrollbar-thin">
                    {selectedMapping.voci.map((voce) => (
                      <label
                        key={voce.id}
                        className="flex items-start gap-2 text-[9px] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={elementsPresentati.includes(voce.descrizione)}
                          onChange={() => toggleElement(voce.descrizione)}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="text-slate-300">{voce.descrizione}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
                    <span className="text-[9px] text-slate-400">Stima punteggio</span>
                    <span className="font-mono font-bold text-brand-gold text-[11px]">
                      {scoreSimulation.stima} / {scoreSimulation.criterio.puntiTotali} pt
                    </span>
                  </div>
                  <div className="text-[8px] text-slate-500 mt-1">
                    Confidenza {scoreSimulation.confidence}% — {scoreSimulation.reasoning}
                  </div>
                  {scoreSimulation.elementsAssenti.length > 0 && (
                    <div className="text-[8px] text-red-400/80 mt-2">
                      Mancanti: {scoreSimulation.elementsAssenti.slice(0, 3).join(" · ")}
                      {scoreSimulation.elementsAssenti.length > 3 ? "…" : ""}
                    </div>
                  )}
                </div>

                <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3">
                  <h4 className="text-[9px] font-bold text-amber-400 mb-2">
                    Benchmark vs competitor
                  </h4>
                  <div className="space-y-1 text-[9px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Voi (stimato)</span>
                      <span className="font-bold text-white">
                        {competitorBenchmark.puntiVoiStimati} /{" "}
                        {competitorBenchmark.criterio.puntiTotali}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Competitor medio</span>
                      <span className="font-mono text-slate-300">
                        {competitorBenchmark.puntiCompetitorMedio}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Top competitor</span>
                      <span className="font-mono text-slate-300">
                        {competitorBenchmark.puntiTopCompetitor}
                      </span>
                    </div>
                    <div className="text-[8px] text-slate-500">
                      Difficoltà: {competitorBenchmark.difficoltaSuperare}
                    </div>
                    <div
                      className={`pt-2 border-t border-amber-900/40 text-[8px] ${
                        competitorBenchmark.gapaVsCompetitor >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {competitorBenchmark.strategiaPerSuperare}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">
                    Voci reverse mapping
                  </div>
                  {selectedMapping.voci.map((voce) => (
                    <div
                      key={voce.id}
                      className="bg-neutral-900 rounded p-2 text-[9px] border border-neutral-800"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="text-white">{voce.descrizione}</span>
                        <span className={`shrink-0 font-bold ${IMPATTO_CLASS[voce.impatto]}`}>
                          {voce.impatto}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={isGeneratingProposal}
                  onClick={async () => {
                    setIsGeneratingProposal(true);
                    setProposalError(null);
                    try {
                      const proposal = await generateProposalGuidedText(
                        selectedMapping.criterio,
                        selectedMapping.voci,
                        companyProfile
                      );
                      setProposalGenerated(proposal);
                    } catch (err) {
                      setProposalError(
                        err instanceof Error ? err.message : "Errore generazione"
                      );
                    } finally {
                      setIsGeneratingProposal(false);
                    }
                  }}
                  className="cursor-pointer w-full text-[9px] font-bold px-3 py-1.5 bg-brand-gold text-black rounded hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                >
                  {isGeneratingProposal ? "Generazione…" : "Genera testo offerta (DeepSeek)"}
                </button>

                {proposalError && (
                  <div className="text-[9px] text-red-400">{proposalError}</div>
                )}

                {proposalGenerated && (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                    <div className="text-[10px] font-bold text-brand-gold mb-2">
                      Proposta offerta generata (~{proposalGenerated.wordCountTarget} parole)
                    </div>
                    <div className="bg-black rounded p-2 text-[9px] text-slate-300 max-h-40 overflow-y-auto mb-2 leading-relaxed">
                      {proposalGenerated.seczioneOfferta}
                    </div>
                    <div className="text-[8px] text-slate-500 space-y-0.5">
                      {proposalGenerated.noteRedazione.map((nota, i) => (
                        <div key={i}>→ {nota}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-neutral-800 shrink-0">
          {analysisResult && (
            <button
              type="button"
              onClick={() => {
                setAnalysisResult(null);
                setComparisonAnalysis(null);
                setSelectedCriterioId(null);
                setParseError(null);
                setIsCompareMode(false);
              }}
              className="cursor-pointer text-[10px] font-bold px-3 py-1.5 bg-neutral-900 border border-neutral-700 text-slate-300 rounded hover:border-neutral-600 transition-colors"
            >
              Nuova analisi
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded hover:border-neutral-600 transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
