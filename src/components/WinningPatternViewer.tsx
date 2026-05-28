import { useState, useMemo, useCallback } from "react";
import { Download, Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { WinningPattern, SimilarityScore, PatternInsights } from "../types";
import { analyzePatternInsights, reverseEngineerCompetitorPattern } from "../lib/gemini";
import type { CompetitorPatternAnalysis } from "../lib/gemini";
import {
  generateHeatmapData,
  analyzePatternsTimeTrend,
  calculatePatternConfidence,
  recommendRibassoAdaptive,
  generatePatternReport,
} from "../lib/winningPatternEngine";
import { PatternHeatmap } from "./PatternHeatmap";

interface WinningPatternViewerProps {
  patterns: WinningPattern[];
  similarityScores?: SimilarityScore[];
  isLoading?: boolean;
}

function TrendIcon({ trend }: { trend: "UP" | "DOWN" | "STABLE" }) {
  if (trend === "UP") return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (trend === "DOWN") return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
}

export function WinningPatternViewer({
  patterns,
  similarityScores = [],
  isLoading = false,
}: WinningPatternViewerProps) {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [patternInsights, setPatternInsights] = useState<PatternInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [competitorAnalysis, setCompetitorAnalysis] = useState<CompetitorPatternAnalysis | null>(
    null
  );
  const [competitorLoading, setCompetitorLoading] = useState(false);

  const heatmapData = useMemo(() => generateHeatmapData(patterns), [patterns]);
  const trends = useMemo(() => analyzePatternsTimeTrend(patterns), [patterns]);
  const report = useMemo(() => generatePatternReport(patterns, trends), [patterns, trends]);

  const selectedPattern = useMemo(
    () => patterns.find((p) => p.clusterId === selectedClusterId) ?? null,
    [patterns, selectedClusterId]
  );

  const selectedConfidence = useMemo(
    () => (selectedPattern ? calculatePatternConfidence(selectedPattern) : null),
    [selectedPattern]
  );

  const selectedRibasso = useMemo(
    () => (selectedPattern ? recommendRibassoAdaptive(selectedPattern, 8) : null),
    [selectedPattern]
  );

  const handleSelectPattern = useCallback(async (pattern: WinningPattern) => {
    if (selectedClusterId === pattern.clusterId) {
      setSelectedClusterId(null);
      setPatternInsights(null);
      setInsightsError(null);
      setCompetitorAnalysis(null);
      return;
    }

    setSelectedClusterId(pattern.clusterId);
    setPatternInsights(null);
    setInsightsError(null);
    setCompetitorAnalysis(null);
    setInsightsLoading(true);
    setCompetitorLoading(true);

    const marginTarget = 8;

    try {
      const [insights, competitor] = await Promise.all([
        analyzePatternInsights(pattern),
        reverseEngineerCompetitorPattern(pattern, marginTarget),
      ]);
      setPatternInsights(insights);
      setCompetitorAnalysis(competitor);
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : "Analisi insight non disponibile");
      setPatternInsights(null);
      setCompetitorAnalysis(null);
    } finally {
      setInsightsLoading(false);
      setCompetitorLoading(false);
    }
  }, [selectedClusterId]);

  const handleHeatmapSelect = useCallback(
    (clusterId: string) => {
      const pattern = patterns.find((p) => p.clusterId === clusterId);
      if (pattern) {
        void handleSelectPattern(pattern);
      } else {
        setSelectedClusterId(clusterId);
      }
    },
    [patterns, handleSelectPattern]
  );

  const downloadCsv = () => {
    const blob = new Blob([report.csvExport], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pattern-vincenti-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <div className="w-4 h-4 bg-brand-gold rounded-full animate-pulse" />
          Analizzando pattern vincenti...
        </div>
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-center">
        <p className="text-slate-400 text-[10px]">
          Nessun pattern disponibile — inserisci almeno 3 gare vinte nello storico profilo
        </p>
      </div>
    );
  }

  const bestMatch = similarityScores.length > 0 ? similarityScores[0] : null;
  const bestPattern = bestMatch
    ? patterns.find((p) => p.clusterId === bestMatch.clusterId)
    : undefined;
  const bestConfidence = bestPattern ? calculatePatternConfidence(bestPattern) : null;

  return (
    <div className="space-y-4">
      {bestMatch && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-[9px] font-bold text-brand-gold uppercase mb-3">
            Matching pattern vincente
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="text-white font-bold text-sm truncate">{bestMatch.clusterNome}</div>
                <div className="text-[9px] text-slate-400 mt-1">
                  Similarità: {bestMatch.similarita.toFixed(0)}%
                </div>
              </div>
              <div
                className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded ${
                  bestMatch.recomandazione === "GO_SICURO"
                    ? "bg-emerald-950/50 text-emerald-400 border border-emerald-900"
                    : bestMatch.recomandazione === "GO_CAUTO"
                      ? "bg-amber-950/50 text-amber-400 border border-amber-900"
                      : "bg-red-950/50 text-red-400 border border-red-900"
                }`}
              >
                {bestMatch.recomandazione === "GO_SICURO"
                  ? "✓ GO"
                  : bestMatch.recomandazione === "GO_CAUTO"
                    ? "⚠ CAUTO"
                    : "✗ SKIP"}
              </div>
            </div>

            <div className="bg-neutral-900 rounded p-2 text-[9px] text-slate-300 leading-relaxed">
              {bestMatch.motivazione}
            </div>

            <div className="grid grid-cols-3 gap-2 text-[9px] mt-2">
              <div className="bg-neutral-900 rounded p-1.5">
                <div className="text-slate-500">Win probability</div>
                <div className="font-bold text-brand-gold">
                  {bestMatch.predictionWinRate.toFixed(0)}%
                </div>
              </div>
              <div className="bg-neutral-900 rounded p-1.5">
                <div className="text-slate-500">Fattori match</div>
                <div className="font-mono text-[8px] text-white">
                  {Object.values(bestMatch.fattoriMatching).filter(Boolean).length}/5
                </div>
              </div>
              <div className="bg-neutral-900 rounded p-1.5">
                <div className="text-slate-500">Confidence</div>
                <div className="text-emerald-400 text-xs font-mono">
                  {bestConfidence?.scoreComplessivo ?? bestPattern?.confidence ?? 0}%
                </div>
              </div>
            </div>

            {bestPattern && (
              <div className="bg-neutral-900/80 border border-neutral-700 rounded p-2 text-[9px] text-slate-300">
                Ribasso adattivo (margine 8%):{" "}
                <span className="text-brand-gold font-bold font-mono">
                  {recommendRibassoAdaptive(bestPattern, 8).consigliato.toFixed(1)}%
                </span>
                <span className="text-slate-500 ml-1">
                  ({recommendRibassoAdaptive(bestPattern, 8).aggressivita})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {(selectedPattern || insightsLoading) && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-[9px] font-bold text-brand-gold uppercase mb-3">
            Insight analitici
            {selectedPattern ? `: ${selectedPattern.nome.slice(0, 40)}` : ""}
          </h3>

          {insightsLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-[10px] py-4">
              <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
              Analisi DeepSeek in corso...
            </div>
          )}

          {insightsError && !insightsLoading && (
            <p className="text-[9px] text-red-400">{insightsError}</p>
          )}

          {patternInsights && selectedPattern && !insightsLoading && (
            <div className="space-y-3 text-[9px]">
              <div>
                <div className="text-slate-500 mb-1">Fattori di successo</div>
                <ul className="space-y-0.5 ml-2">
                  {patternInsights.keySuccessFactors.map((factor, i) => (
                    <li key={i} className="text-emerald-400">
                      • {factor}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-slate-500 mb-1">Rischi da evitare</div>
                <ul className="space-y-0.5 ml-2">
                  {patternInsights.risksToAvoid.map((risk, i) => (
                    <li key={i} className="text-red-400">
                      • {risk}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-slate-500 mb-1">Azioni consigliate</div>
                <ul className="space-y-0.5 ml-2">
                  {patternInsights.recommendations.map((rec, i) => (
                    <li key={i} className="text-sky-300">
                      • {rec}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-neutral-900 rounded p-2 text-slate-300 leading-relaxed">
                {patternInsights.explanation}
              </div>

              {selectedConfidence && (
                <div className="border-t border-neutral-700 pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Confidence avanzata</span>
                    <span className="font-bold text-brand-gold font-mono">
                      {selectedConfidence.scoreComplessivo}/100
                    </span>
                  </div>
                  <p className="text-slate-400">{selectedConfidence.interpretazione}</p>
                  <div className="grid grid-cols-2 gap-1 text-[8px] font-mono text-slate-500">
                    <span>Campione: {selectedConfidence.breakdownScore.dimensioneCampione.toFixed(0)}</span>
                    <span>Consistenza: {selectedConfidence.breakdownScore.consistenzaRisultati.toFixed(0)}</span>
                    <span>Recency: {selectedConfidence.breakdownScore.recencyBonus.toFixed(0)}</span>
                    <span>Stabilità: {selectedConfidence.breakdownScore.stabilita.toFixed(0)}</span>
                  </div>
                </div>
              )}

              {selectedRibasso && (
                <div className="bg-neutral-900 rounded p-2">
                  <span className="text-slate-500">Ribasso adattivo: </span>
                  <span className="text-white font-mono font-bold">
                    {selectedRibasso.consigliato.toFixed(1)}%
                  </span>
                  <span className="text-slate-500">
                    {" "}
                    (range {selectedRibasso.range.min.toFixed(1)}–{selectedRibasso.range.max.toFixed(1)}%)
                  </span>
                  <p className="text-slate-400 mt-1">{selectedRibasso.motivazione}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedPattern && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-[9px] font-bold text-amber-400 uppercase mb-3">
            Strategia vs competitor
          </h3>

          {competitorLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-[10px] py-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              Reverse engineering strategia competitor...
            </div>
          )}

          {competitorAnalysis && !competitorLoading && (
            <div className="space-y-2 text-[9px]">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-900 rounded p-2">
                  <div className="text-slate-500 text-[8px]">Ribasso stimato competitor</div>
                  <div className="font-mono text-amber-400 font-bold">
                    {competitorAnalysis.estimatedCompetitorRibasso.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-neutral-900 rounded p-2">
                  <div className="text-slate-500 text-[8px]">Margine competitor</div>
                  <div className="font-mono text-amber-400 font-bold">
                    {competitorAnalysis.estimatedCompetitorMargin.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div>
                <div className="text-slate-500 mb-1">Vantaggi competitor</div>
                <ul className="space-y-0.5 ml-2">
                  {competitorAnalysis.competitorAdvantages.map((s, i) => (
                    <li key={i} className="text-amber-300/90">
                      • {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-slate-500 mb-1">Debolezze competitor</div>
                <ul className="space-y-0.5 ml-2">
                  {competitorAnalysis.competitorWeaknesses.map((s, i) => (
                    <li key={i} className="text-slate-400">
                      • {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-slate-400 mb-1">Strategie per vincere</div>
                <ul className="space-y-0.5 ml-2">
                  {competitorAnalysis.strategyToCounterCompetitor.map((s, i) => (
                    <li key={i} className="text-emerald-400">
                      → {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-amber-950/20 border border-amber-900/50 rounded p-2 text-slate-300 leading-relaxed">
                {competitorAnalysis.riskAssessment}
              </div>
            </div>
          )}
        </div>
      )}

      <PatternHeatmap
        heatmapData={heatmapData}
        selectedClusterId={selectedClusterId ?? undefined}
        onSelectCluster={handleHeatmapSelect}
      />

      {trends.length > 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-[9px] font-bold text-brand-gold uppercase mb-3">Trend temporali</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
            {trends.map((t) => (
              <div
                key={t.clusterId}
                className="flex items-start gap-2 bg-neutral-900 rounded p-2 text-[9px]"
              >
                <TrendIcon trend={t.trend} />
                <div className="min-w-0 flex-1">
                  <div className="text-white font-medium truncate">{t.clusterNome}</div>
                  <div className="text-slate-400">{t.motivazione}</div>
                </div>
                <span
                  className={`shrink-0 font-bold ${
                    t.trend === "UP"
                      ? "text-emerald-400"
                      : t.trend === "DOWN"
                        ? "text-red-400"
                        : "text-slate-500"
                  }`}
                >
                  {t.trend}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[9px] font-bold text-brand-gold uppercase">
            Pattern vincenti ({patterns.length})
          </h3>
          <button
            type="button"
            onClick={downloadCsv}
            className="cursor-pointer flex items-center gap-1 text-[9px] font-bold text-brand-gold hover:text-yellow-300 border border-neutral-700 rounded px-2 py-1"
          >
            <Download className="w-3 h-3" />
            Export CSV
          </button>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
          {patterns.map((pattern) => {
            const conf = calculatePatternConfidence(pattern);
            const isSelected = selectedClusterId === pattern.clusterId;

            return (
              <button
                key={pattern.clusterId}
                type="button"
                onClick={() => handleSelectPattern(pattern)}
                className={`w-full text-left rounded-lg p-2.5 transition-colors cursor-pointer border ${
                  isSelected
                    ? "bg-neutral-900 border-brand-gold"
                    : "bg-neutral-900 border-neutral-700 hover:border-brand-gold"
                }`}
              >
                <div className="flex justify-between items-start mb-1.5 gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[10px]">{pattern.nome}</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">
                      {pattern.statsVittoria.numeroGareVinte} vinte · confidence {conf.scoreComplessivo}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-brand-gold text-[9px] font-bold">
                      {pattern.statsVittoria.tassoDiSuccesso.toFixed(0)}%
                    </div>
                    <div className="text-[8px] text-slate-500">win rate</div>
                  </div>
                </div>

                <div className="w-full bg-neutral-800 rounded h-1.5 mb-2">
                  <div
                    className="bg-brand-gold h-full rounded transition-all"
                    style={{ width: `${Math.min(100, pattern.statsVittoria.tassoDiSuccesso)}%` }}
                  />
                </div>

                {isSelected && (
                  <div className="mt-2 pt-2 border-t border-neutral-700 space-y-1 text-[9px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ribasso medio</span>
                      <span className="font-mono text-white">
                        {pattern.statsEconomiche.ribassoMedioVincente.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Margine atteso</span>
                      <span className="font-mono text-emerald-400">
                        {pattern.statsEconomiche.margineAttesoMedioPercent.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-slate-500 text-[8px]">
                      Clicca di nuovo per chiudere · insight LLM sopra
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {(report.insights.length > 0 || report.recommendations.length > 0) && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-[9px] space-y-2">
          <h3 className="font-bold text-brand-gold uppercase">Sintesi report</h3>
          {report.insights.map((line, i) => (
            <p key={`i-${i}`} className="text-slate-300">
              {line}
            </p>
          ))}
          {report.recommendations.map((line, i) => (
            <p key={`r-${i}`} className="text-amber-300/90">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
