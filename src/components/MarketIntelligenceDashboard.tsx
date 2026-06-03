import { useState, useEffect, useMemo } from "react";
import { X, TrendingUp, TrendingDown, Users, BarChart3, Loader2, Minus } from "lucide-react";
import type { MarketIntelligenceSnapshot, TenderDocument, GaraSimilareHistorica } from "../types";
import {
  analyzeMarketIntelligence,
  estimateWinProbability,
  findSimilarHistoricalGares,
  mergeHistoricalSources,
} from "../lib/marketIntelligenceEngine";
import { analyzeMarketIntelligenceInsights } from "../lib/gemini";
import { parseTenderValue } from "../lib/bidCalculations";

interface MarketIntelligenceDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  allTenders: TenderDocument[];
  selectedTender?: TenderDocument;
  historicalData: GaraSimilareHistorica[];
  yourWinRatePercent?: number;
}

export function MarketIntelligenceDashboard({
  isOpen,
  onClose,
  allTenders,
  selectedTender,
  historicalData,
  yourWinRatePercent = 35,
}: MarketIntelligenceDashboardProps) {
  const [snapshot, setSnapshot] = useState<MarketIntelligenceSnapshot | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const similarGares = useMemo(() => {
    if (!selectedTender || !historicalData.length) return [];
    return findSimilarHistoricalGares(selectedTender, historicalData);
  }, [selectedTender, historicalData]);

  const winProbability = useMemo(() => {
    if (!selectedTender || !snapshot) return null;
    return estimateWinProbability(selectedTender, snapshot, yourWinRatePercent);
  }, [selectedTender, snapshot, yourWinRatePercent]);

  useEffect(() => {
    if (!isOpen) return;

    const snap = analyzeMarketIntelligence(allTenders, historicalData);
    setSnapshot(snap);

    let cancelled = false;
    setInsightsLoading(true);
    analyzeMarketIntelligenceInsights(snap, selectedTender)
      .then((insights) => {
        if (!cancelled) {
          setSnapshot((prev) => (prev ? { ...prev, insightsDeepSeek: insights } : prev));
        }
      })
      .catch(() => {
        /* insights opzionali */
      })
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, allTenders, historicalData, selectedTender]);

  if (!isOpen) return null;

  if (!snapshot) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-gold" />
            Market Intelligence Dashboard
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
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <div className="text-[9px] text-slate-500 mb-1">Gare monitorate</div>
              <div className="text-[14px] font-bold text-brand-gold">
                {snapshot.numeroGareAttiveMonitorate}
              </div>
            </div>
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <div className="text-[9px] text-slate-500 mb-1">Competitor tracciati</div>
              <div className="text-[14px] font-bold text-white">
                {snapshot.numeroCompetitorsTracciati}
              </div>
            </div>
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <div className="text-[9px] text-slate-500 mb-1">Snapshot</div>
              <div className="text-[8px] text-slate-400">
                {new Date(snapshot.dataSnapshot).toLocaleString("it-IT")}
              </div>
            </div>
          </div>

          {insightsLoading && (
            <div className="flex items-center gap-2 text-[9px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin text-brand-gold" />
              Analisi DeepSeek in corso…
            </div>
          )}

          {snapshot.insightsDeepSeek && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
              <div className="text-[10px] font-bold text-brand-gold">Intelligence sintesi</div>
              <p className="text-[9px] text-slate-300 leading-relaxed">
                {snapshot.insightsDeepSeek.summary}
              </p>
              {snapshot.insightsDeepSeek.opportunita.length > 0 && (
                <div className="text-[8px] text-emerald-400 space-y-0.5">
                  {snapshot.insightsDeepSeek.opportunita.map((o, i) => (
                    <div key={i}>+ {o}</div>
                  ))}
                </div>
              )}
              {snapshot.insightsDeepSeek.minacce.length > 0 && (
                <div className="text-[8px] text-red-400/90 space-y-0.5">
                  {snapshot.insightsDeepSeek.minacce.map((m, i) => (
                    <div key={i}>⚠ {m}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
            <h3 className="text-[10px] font-bold text-brand-gold uppercase mb-2">Trend mercato</h3>
            {snapshot.trendsMercato.length === 0 ? (
              <p className="text-[9px] text-slate-500">Nessun trend — carica più gare nel catalogo.</p>
            ) : (
              snapshot.trendsMercato.slice(0, 6).map((trend) => (
                <div
                  key={trend.id}
                  className="flex justify-between items-start mb-2 pb-2 border-b border-neutral-800 last:border-0 text-[9px]"
                >
                  <div>
                    <div className="font-bold text-white">{trend.categoria}</div>
                    <div className="text-slate-400">{trend.regione}</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">
                      €{(trend.importoMedioGara / 1_000_000).toFixed(2)}M medio · ribasso medio{" "}
                      {trend.ribassoMedioPercent}%
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-slate-300">{trend.numeroGareEmesse} gare</div>
                    <div
                      className={`flex items-center justify-end gap-1 ${
                        trend.trendDirezione === "UP"
                          ? "text-emerald-400"
                          : trend.trendDirezione === "DOWN"
                            ? "text-red-400"
                            : "text-slate-400"
                      }`}
                    >
                      {trend.trendDirezione === "UP" ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : trend.trendDirezione === "DOWN" ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
                      )}
                      {trend.trendPercent > 0 ? "+" : ""}
                      {trend.trendPercent}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
            <h3 className="text-[10px] font-bold text-brand-gold uppercase mb-2 flex items-center gap-2">
              <Users className="w-3 h-3" />
              Top 5 competitor
            </h3>
            {snapshot.competitorsTop5.length === 0 ? (
              <p className="text-[9px] text-slate-500">
                Nessun competitor da storico — i dati mock/API popoleranno questa sezione.
              </p>
            ) : (
              snapshot.competitorsTop5.map((comp, idx) => (
                <div
                  key={comp.id}
                  className="flex justify-between items-start mb-2 pb-2 border-b border-neutral-800 last:border-0 text-[9px]"
                >
                  <div>
                    <div className="font-bold text-white">
                      {idx + 1}. {comp.nome}
                    </div>
                    <div className="text-slate-400">
                      {comp.settoriOperativi.slice(0, 2).join(", ") || "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-400">{comp.numeroGareVinte} vinte</div>
                    <div className="text-slate-400">Win rate {comp.winRate.toFixed(0)}%</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedTender && winProbability && (
            <>
              <div className="bg-blue-950/20 border border-blue-900/50 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-2">
                  Analisi gara: {selectedTender.title.slice(0, 50)}
                  {selectedTender.title.length > 50 ? "…" : ""}
                </h3>
                <div className="space-y-2 text-[9px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Probabilità vittoria stimata</span>
                    <span
                      className={`font-bold ${
                        winProbability.probabilitaVittoria >= 50
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {winProbability.probabilitaVittoria}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Forza competitor</span>
                    <span className="text-white">{winProbability.competitorStrength}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Concentrazione mercato</span>
                    <span className="text-white">{winProbability.marketCompetitiveness}%</span>
                  </div>
                  <div className="pt-2 border-t border-blue-900/40 text-slate-300">
                    {winProbability.reasoning}
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                <h3 className="text-[10px] font-bold text-brand-gold uppercase mb-2">
                  Gare simili storiche ({similarGares.length})
                </h3>
                {similarGares.length === 0 ? (
                  <p className="text-[9px] text-slate-500">
                    Nessuna gara simile nello storico per categoria/regione/importo.
                  </p>
                ) : (
                  similarGares.slice(0, 5).map((gara) => {
                    const importo = parseTenderValue(gara.gara.value);
                    return (
                      <div
                        key={gara.id}
                        className="bg-neutral-900 rounded p-2 mb-2 last:mb-0 text-[8px]"
                      >
                        <div className="flex justify-between mb-1 gap-2">
                          <span className="font-bold text-white line-clamp-1">
                            {gara.gara.title}
                          </span>
                          <span
                            className={
                              gara.aggiudicazione === "VINTA"
                                ? "text-emerald-400 shrink-0"
                                : "text-red-400 shrink-0"
                            }
                          >
                            {gara.aggiudicazione}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-slate-400">
                          <span>
                            {importo >= 1_000_000
                              ? `€${(importo / 1_000_000).toFixed(2)}M`
                              : `€${importo.toLocaleString("it-IT")}`}
                          </span>
                          <span>{gara.offerteRicevute} offerte</span>
                          <span>Ribasso {gara.ribassoVincente.toFixed(1)}%</span>
                          {gara.winnerName && <span>Vinc: {gara.winnerName}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
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
        </div>
      </div>
    </div>
  );
}
