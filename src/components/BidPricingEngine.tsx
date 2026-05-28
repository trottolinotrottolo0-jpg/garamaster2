import { useState, useEffect, Fragment, useMemo } from "react";
import {
  X,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Loader2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  TenderDocument,
  CompanyProfile,
  BidPricingResult,
  PricingScenario,
  Prezzario,
  PricingLineItem,
  ComputoMetricoVoce,
  ColllegamentoComputoPrezzario,
} from "../types";
import { runBidPricing } from "../lib/gemini";
import { ExplainabilityLayer } from "./ExplainabilityLayer";
import {
  calcImportoOfferto,
  calcProductivityImpact,
  calcInternalRealCost,
  calcPrezzarioCost,
  calcDynamicPricing,
  calcMaxRibassoSostenibile,
  runMonteCarloSimulation,
  parseTenderValue,
  matchComputoConPrezzarioBest,
  buildComputoFromTender,
  type CompanySaturation,
  type MonteCarloResult,
  type TenderUrgency,
} from "../lib/bidCalculations";

interface BidPricingEngineProps {
  tender: TenderDocument;
  isOpen: boolean;
  onClose: () => void;
  prezzari?: Prezzario[];
  prezzarioSelezionato?: string;
  onPrezzarioChange?: (id: string) => void;
  computoMetrico?: ComputoMetricoVoce[];
  onCollegamentiComputo?: (collegamenti: ColllegamentoComputoPrezzario[]) => void;
}

const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtEuro = (n: number) => fmt.format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function marginColor(margine: number, minMargine: number) {
  if (margine > minMargine + 5) return "text-emerald-400";
  if (margine >= minMargine) return "text-amber-400";
  return "text-red-400";
}

function ScenarioCard({ s, minMargine }: { s: PricingScenario; minMargine: number }) {
  const isCustom = s.label === "Personalizzato";
  return (
    <div
      className={`bg-neutral-950 rounded-xl p-4 space-y-2 border ${
        isCustom ? "border-brand-gold" : "border-neutral-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
          {s.label}
        </span>
        {s.rischioAlert && (
          <span className="text-[9px] font-bold text-red-400 bg-red-950/60 border border-red-800 px-1.5 py-0.5 rounded">
            ⚠ SOTTO SOGLIA
          </span>
        )}
      </div>
      <div className="text-2xl font-extrabold text-white font-mono">{fmtPct(s.ribasso)}</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Offerto</span>
          <span className="text-white font-mono">{fmtEuro(s.importoOfferto)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Margine €</span>
          <span className={`font-mono font-bold ${marginColor(s.margineStimato, minMargine)}`}>
            {fmtEuro(s.margineEuro)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Margine %</span>
          <span className={`font-mono font-bold ${marginColor(s.margineStimato, minMargine)}`}>
            {fmtPct(s.margineStimato)}
          </span>
        </div>
        {s.fattoreProduttivita < 1 && (
          <div className="mt-1 pt-1 border-t border-neutral-700">
            <span className="text-[9px] text-slate-500 block">Margine corretto (produttività)</span>
            <span
              className={`text-xs font-bold font-mono ${
                s.margineCorrettoPercent > minMargine ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {s.margineCorrettoPercent.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const SATURATION_OPTIONS: { value: CompanySaturation; label: string }[] = [
  { value: "bassa", label: "Bassa" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];

const URGENCY_OPTIONS: { value: TenderUrgency; label: string }[] = [
  { value: "oltre_10", label: "> 10 gg" },
  { value: "3_10", label: "3–10 gg" },
  { value: "sotto_3", label: "< 3 gg" },
];

interface AdvancedPricingPanelsProps {
  concorrentiAttesi: number;
  onConcorrentiChange: (v: number) => void;
  urgenza: TenderUrgency;
  onUrgenzaChange: (v: TenderUrgency) => void;
  saturazione: CompanySaturation;
  onSaturazioneChange: (v: CompanySaturation) => void;
  dynamicRibasso: number;
  dynamicBreakdown: {
    aggiustamentoConcorrenza: number;
    aggiustamentoUrgenza: number;
    aggiustamentoSaturazione: number;
  };
  ribasso: number;
  monteCarloResult: MonteCarloResult | null;
  monteCarloWinRate: number | null;
  onRunMonteCarlo: () => void;
  monteCarloMu: number;
  maxRibassoSostenibile: number;
}

function AdvancedPricingPanels({
  concorrentiAttesi,
  onConcorrentiChange,
  urgenza,
  onUrgenzaChange,
  saturazione,
  onSaturazioneChange,
  dynamicRibasso,
  dynamicBreakdown,
  ribasso,
  monteCarloResult,
  monteCarloWinRate,
  onRunMonteCarlo,
  monteCarloMu,
  maxRibassoSostenibile,
}: AdvancedPricingPanelsProps) {
  const userBinIndex = monteCarloResult
    ? monteCarloResult.histogram.findIndex(
        (b) => ribasso >= b.binStart && (ribasso < b.binEnd || b.binEnd === 40)
      )
    : -1;

  return (
    <div className="space-y-4">
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">
          Pannello Pricing Dinamico
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              Concorrenti attesi ({concorrentiAttesi})
            </label>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={concorrentiAttesi}
              onChange={(e) => onConcorrentiChange(parseInt(e.target.value, 10))}
              className="w-full h-1.5 rounded-full cursor-pointer accent-brand-gold"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              Urgenza scadenza
            </label>
            <div className="flex gap-1">
              {URGENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUrgenzaChange(opt.value)}
                  className={`cursor-pointer flex-1 text-[10px] font-bold px-2 py-1.5 rounded border transition-colors ${
                    urgenza === opt.value
                      ? "bg-brand-gold text-black border-brand-gold"
                      : "bg-neutral-900 text-slate-400 border-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              Saturazione aziendale
            </label>
            <div className="flex gap-1">
              {SATURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSaturazioneChange(opt.value)}
                  className={`cursor-pointer flex-1 text-[10px] font-bold px-2 py-1.5 rounded border transition-colors ${
                    saturazione === opt.value
                      ? "bg-brand-gold text-black border-brand-gold"
                      : "bg-neutral-900 text-slate-400 border-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
            Ribasso dinamico suggerito
          </span>
          <span className="text-2xl font-extrabold text-brand-gold font-mono">{fmtPct(dynamicRibasso)}</span>
          <span className="text-[10px] text-slate-500">
            concorrenza {dynamicBreakdown.aggiustamentoConcorrenza >= 0 ? "+" : ""}
            {dynamicBreakdown.aggiustamentoConcorrenza.toFixed(1)}% · urgenza{" "}
            {dynamicBreakdown.aggiustamentoUrgenza >= 0 ? "+" : ""}
            {dynamicBreakdown.aggiustamentoUrgenza.toFixed(1)}% · saturazione{" "}
            {dynamicBreakdown.aggiustamentoSaturazione >= 0 ? "+" : ""}
            {dynamicBreakdown.aggiustamentoSaturazione.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">
            Simulazione statistica Monte Carlo
          </p>
          <button
            type="button"
            onClick={onRunMonteCarlo}
            className="cursor-pointer shrink-0 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            Esegui Simulazione Monte Carlo
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          μ = {fmtPct(monteCarloMu)} · σ = 3.0 · soglia costo interno ≤ {fmtPct(maxRibassoSostenibile)}
        </p>

        {monteCarloResult && (
          <>
            <div className="flex items-end justify-center gap-0.5 h-32 px-2 border border-neutral-800 rounded-lg bg-black">
              {monteCarloResult.histogram.map((bin, idx) => (
                <div
                  key={`${bin.binStart}-${bin.binEnd}`}
                  className="flex-1 flex flex-col items-center justify-end min-w-0"
                  title={`${fmtPct(bin.binStart)}–${fmtPct(bin.binEnd)}: ${bin.count} sim.`}
                >
                  <div
                    className={`w-full max-w-[14px] rounded-t transition-all ${
                      idx === userBinIndex ? "bg-blue-400" : "bg-neutral-600 hover:bg-neutral-500"
                    }`}
                    style={{ height: `${Math.max(bin.heightPercent, bin.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-slate-600 font-mono px-1">
              <span>0%</span>
              <span>Distribuzione ribassi concorrenti (N=500)</span>
              <span>40%</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black border border-neutral-800 rounded-lg p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                  Win rate statistico
                </p>
                <p className="text-2xl font-extrabold text-emerald-400 font-mono">
                  {fmtPct(monteCarloWinRate ?? monteCarloResult.winRate)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Ribasso slider {fmtPct(ribasso)} vs campione normale
                </p>
              </div>
              <div className="bg-black border border-neutral-800 rounded-lg p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                  Densità vittoria al ribasso corrente
                </p>
                <div className="mt-2 h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-brand-gold transition-all"
                    style={{ width: `${Math.min(monteCarloWinRate ?? monteCarloResult.winRate, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  {(monteCarloWinRate ?? monteCarloResult.winRate) < 5
                    ? "Probabilità quasi nulla (ribasso troppo conservativo)"
                    : (monteCarloWinRate ?? monteCarloResult.winRate) > 60
                      ? "Alta densità competitiva sul ribasso simulato"
                      : "Zona intermedia: bilanciare aggressività e margine"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function BidPricingEngine({
  tender,
  isOpen,
  onClose,
  prezzari,
  prezzarioSelezionato,
  onPrezzarioChange,
  computoMetrico,
  onCollegamentiComputo,
}: BidPricingEngineProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [ribasso, setRibasso] = useState(12);
  const [result, setResult] = useState<BidPricingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(true);
  const [pricingOverrides, setPricingOverrides] = useState<
    Record<string, Pick<PricingLineItem, "qta" | "produttivita">>
  >({});
  const [concorrentiAttesi, setConcorrentiAttesi] = useState(8);
  const [urgenza, setUrgenza] = useState<TenderUrgency>("3_10");
  const [saturazione, setSaturazione] = useState<CompanySaturation>("media");
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [computoLocale, setComputoLocale] = useState<ComputoMetricoVoce[]>([]);
  const [computoCollegamenti, setComputoCollegamenti] = useState<ColllegamentoComputoPrezzario[]>([]);

  const computoEffettivo =
    computoMetrico && computoMetrico.length > 0 ? computoMetrico : computoLocale;

  useEffect(() => {
    if (!isOpen) return;
    const stored = localStorage.getItem("gm_company_profile");
    if (!stored) {
      setProfile(null);
      setResult(null);
      setError(null);
      return;
    }
    const prof = JSON.parse(stored) as CompanyProfile;
    setProfile(prof);
    setRibasso(prof.avgRibassoPercent || 12);
    setResult(null);
    setError(null);
    setIsOptimizerOpen(true);
    setPricingOverrides({});
    setConcorrentiAttesi(8);
    setUrgenza("3_10");
    setSaturazione("media");
    setMonteCarloResult(null);
    setComputoLocale([]);
    setComputoCollegamenti([]);
  }, [isOpen, tender]);

  useEffect(() => {
    setComputoCollegamenti([]);
  }, [prezzarioSelezionato, computoEffettivo.length]);

  const handleRun = async (prof: CompanyProfile, r: number) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runBidPricing(tender, prof, r);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  const BAR_MAX = 40;
  const toBarPct = (v: number) => `${Math.min(Math.max((v / BAR_MAX) * 100, 0), 100)}%`;
  const importoBaseAsta = useMemo(() => {
    const maybeImporto = (tender as TenderDocument & { importo?: number | string }).importo;
    if (typeof maybeImporto === "number") return maybeImporto;
    if (typeof maybeImporto === "string") return parseTenderValue(maybeImporto);
    return parseTenderValue(tender.value);
  }, [tender]);

  const vociDaMostrare = useMemo((): PricingLineItem[] => {
    if (prezzarioSelezionato && prezzari?.length) {
      const prezzario = prezzari.find((p) => p.id === prezzarioSelezionato);
      if (prezzario) {
        return prezzario.voci.map((v) => {
          const override = pricingOverrides[v.id];
          return {
            ...v,
            qta: override?.qta ?? 1,
            produttivita: override?.produttivita ?? 100,
          };
        });
      }
    }
    return [];
  }, [prezzarioSelezionato, prezzari, pricingOverrides]);

  const productivityImpact = useMemo(
    () => calcProductivityImpact(vociDaMostrare, importoBaseAsta),
    [vociDaMostrare, importoBaseAsta]
  );

  const baseRibassoForDynamic = result?.ribassoOttimale ?? ribasso;
  const dynamicPricing = useMemo(
    () =>
      calcDynamicPricing({
        baseRibasso: baseRibassoForDynamic,
        concorrentiAttesi,
        urgenza,
        saturazione,
      }),
    [baseRibassoForDynamic, concorrentiAttesi, urgenza, saturazione]
  );

  const maxRibassoSostenibile = useMemo(
    () => calcMaxRibassoSostenibile(ribasso, productivityImpact.deltaPercentTender),
    [ribasso, productivityImpact.deltaPercentTender]
  );

  const monteCarloMu = result?.ribassoOttimale ?? profile?.avgRibassoPercent ?? ribasso;

  const monteCarloWinRate = useMemo(() => {
    if (!monteCarloResult) return null;
    let wins = 0;
    for (const competitorRibasso of monteCarloResult.competitorSamples) {
      if (ribasso > competitorRibasso && ribasso <= maxRibassoSostenibile) wins += 1;
    }
    return (wins / monteCarloResult.iterations) * 100;
  }, [monteCarloResult, ribasso, maxRibassoSostenibile]);

  const handleRunMonteCarlo = () => {
    setMonteCarloResult(
      runMonteCarloSimulation({
        userRibasso: ribasso,
        mu: monteCarloMu,
        sigma: 3,
        iterations: 500,
        maxRibassoSostenibile,
      })
    );
  };

  const advancedPanelsProps: AdvancedPricingPanelsProps | null = profile
    ? {
        concorrentiAttesi,
        onConcorrentiChange: setConcorrentiAttesi,
        urgenza,
        onUrgenzaChange: setUrgenza,
        saturazione,
        onSaturazioneChange: setSaturazione,
        dynamicRibasso: dynamicPricing.ribassoSuggerito,
        dynamicBreakdown: {
          aggiustamentoConcorrenza: dynamicPricing.aggiustamentoConcorrenza,
          aggiustamentoUrgenza: dynamicPricing.aggiustamentoUrgenza,
          aggiustamentoSaturazione: dynamicPricing.aggiustamentoSaturazione,
        },
        ribasso,
        monteCarloResult,
        monteCarloWinRate,
        onRunMonteCarlo: handleRunMonteCarlo,
        monteCarloMu,
        maxRibassoSostenibile,
      }
    : null;

  if (!isOpen) return null;

  const offeredBySlider = calcImportoOfferto(importoBaseAsta, ribasso);
  const productivityCoverageThreshold =
    productivityImpact.deltaPercentTender > 0 ? productivityImpact.deltaPercentTender : 0;
  const isRibassoCoveredByProductivity = ribasso <= productivityCoverageThreshold;

  const updateQta = (voceId: string, nextValue: number) => {
    const qta = Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1;
    setPricingOverrides((prev) => ({
      ...prev,
      [voceId]: { qta, produttivita: prev[voceId]?.produttivita ?? 100 },
    }));
  };

  const applyCollegamentiToPricing = (collegamenti: ColllegamentoComputoPrezzario[]) => {
    const approved = collegamenti.filter((c) => c.collegato);
    if (approved.length === 0) return;
    setPricingOverrides((prev) => {
      const next = { ...prev };
      for (const coll of approved) {
        next[coll.prezzarioVoceId] = {
          qta: coll.quantita,
          produttivita: prev[coll.prezzarioVoceId]?.produttivita ?? 100,
        };
      }
      return next;
    });
    onCollegamentiComputo?.(approved);
  };

  const updateProductivita = (voceId: string, nextValue: number) => {
    const safeValue = Number.isFinite(nextValue) ? nextValue : 100;
    const clamped = Math.min(130, Math.max(60, safeValue));
    setPricingOverrides((prev) => ({
      ...prev,
      [voceId]: {
        qta: prev[voceId]?.qta ?? 1,
        produttivita: Number(clamped.toFixed(1)),
      },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <span className="text-xs font-extrabold tracking-widest uppercase text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-gold" />
            Bid Intelligence &amp; Pricing Engine
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
          {/* No profile */}
          {!profile && (
            <div className="text-center space-y-3 py-8">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm text-slate-300">Profilo azienda non trovato.</p>
              <p className="text-xs text-slate-500">
                Compilalo prima nel tab{" "}
                <span className="text-brand-gold font-bold">Profilo azienda</span>.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer mt-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Chiudi
              </button>
            </div>
          )}

          {/* Slider + launch (only when profile loaded) */}
          {profile && (
            <>
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsOptimizerOpen((prev) => !prev)}
                  className="w-full px-5 py-4 flex items-center justify-between border-b border-neutral-800/70 cursor-pointer"
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">
                    Strumento Ottimizzazione Prezzario &amp; Produttività
                  </span>
                  {isOptimizerOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {isOptimizerOpen && (
                  <div className="p-4 space-y-4">
                    {prezzari && prezzari.length > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-[10px] text-slate-500 uppercase font-bold">
                          Usa prezzario:
                        </label>
                        <select
                          value={prezzarioSelezionato || ""}
                          onChange={(e) => onPrezzarioChange?.(e.target.value)}
                          className="bg-neutral-900 border border-neutral-700 text-white text-xs rounded px-2 py-1"
                        >
                          <option value="">Voci personalizzate</option>
                          {prezzari.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome} ({p.regione})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {prezzarioSelezionato && computoEffettivo.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setComputoLocale(buildComputoFromTender(tender))}
                        className="cursor-pointer text-[9px] font-bold px-2 py-1 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white rounded"
                      >
                        Carica computo da sezioni gara ({tender.sections.length} voci)
                      </button>
                    )}

                    {prezzarioSelezionato && computoEffettivo.length > 0 && (
                      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 mb-2 space-y-2">
                        <h4 className="text-[9px] font-bold text-brand-gold uppercase">
                          Collegamento computo ↔ prezzario
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const prezzario = prezzari?.find((p) => p.id === prezzarioSelezionato);
                              if (prezzario) {
                                const collegamenti = matchComputoConPrezzarioBest(
                                  computoEffettivo,
                                  prezzario
                                );
                                setComputoCollegamenti(collegamenti);
                              }
                            }}
                            className="cursor-pointer text-[9px] font-bold px-2 py-1 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white rounded"
                          >
                            Matcha voci computo
                          </button>
                          {computoCollegamenti.some((c) => c.collegato) && (
                            <span className="text-[9px] text-emerald-400 self-center">
                              {computoCollegamenti.filter((c) => c.collegato).length} collegamenti attivi
                            </span>
                          )}
                        </div>

                        {computoCollegamenti.length > 0 && (
                          <div className="space-y-1 max-h-32 overflow-y-auto text-[9px]">
                            {computoCollegamenti.map((coll) => (
                              <div
                                key={`${coll.computoVoceId}-${coll.prezzarioVoceId}`}
                                className="bg-neutral-900 border border-neutral-700 rounded p-2 flex items-center gap-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={coll.collegato}
                                  onChange={(e) => {
                                    const updated = computoCollegamenti.map((c) =>
                                      c.computoVoceId === coll.computoVoceId &&
                                      c.prezzarioVoceId === coll.prezzarioVoceId
                                        ? { ...c, collegato: e.target.checked }
                                        : c
                                    );
                                    setComputoCollegamenti(updated);
                                    applyCollegamentiToPricing(updated);
                                  }}
                                  className="w-3 h-3 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-white truncate">{coll.computoDescrizione}</div>
                                  <div className="text-slate-500 text-[8px] truncate">
                                    → {coll.prezzarioDescrizione}
                                  </div>
                                  <div
                                    className={`text-[8px] ${
                                      coll.deltaPercent > 0 ? "text-red-400" : "text-emerald-400"
                                    }`}
                                  >
                                    €{coll.prezzoComputo.toFixed(2)} → €{coll.prezzoPrezzario.toFixed(2)} (
                                    {coll.deltaPercent > 0 ? "+" : ""}
                                    {coll.deltaPercent.toFixed(1)}%)
                                  </div>
                                </div>
                                <span className="text-slate-500 text-[8px] shrink-0">
                                  {coll.similarita.toFixed(0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {vociDaMostrare.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">
                        {prezzarioSelezionato
                          ? "Il prezzario selezionato non contiene voci."
                          : "Seleziona un prezzario o creane uno in Gestisci Prezzari."}
                      </p>
                    ) : (
                    <div className="overflow-x-auto border border-neutral-800 rounded-lg">
                      <table className="w-full min-w-[760px] text-xs">
                        <thead className="bg-neutral-900 text-slate-400 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="px-3 py-2 text-left">Codice</th>
                            <th className="px-3 py-2 text-left">Descrizione</th>
                            <th className="px-3 py-2 text-right">Q.tà</th>
                            <th className="px-3 py-2 text-right">Prezzo</th>
                            <th className="px-3 py-2 text-center">Prod. %</th>
                            <th className="px-3 py-2 text-right">Costo prezzario</th>
                            <th className="px-3 py-2 text-right">Costo interno reale</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                          {vociDaMostrare.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2 text-slate-300 font-mono">{item.codice}</td>
                              <td className="px-3 py-2 text-slate-100">{item.descrizione}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0.01}
                                  step={0.01}
                                  value={item.qta}
                                  onChange={(e) => updateQta(item.id, parseFloat(e.target.value))}
                                  className="w-20 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-right text-slate-100 font-mono text-xs"
                                />
                                <span className="text-slate-500 ml-1">{item.um}</span>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-300 font-mono">
                                {fmtEuro(item.prezzo)}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateProductivita(item.id, item.produttivita - 1)}
                                    className="cursor-pointer px-1.5 py-0.5 rounded border border-neutral-700 text-slate-300 hover:border-brand-gold"
                                    aria-label={`Diminuisci produttività ${item.codice}`}
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min={60}
                                    max={130}
                                    step={0.5}
                                    value={item.produttivita}
                                    onChange={(e) =>
                                      updateProductivita(item.id, parseFloat(e.target.value))
                                    }
                                    className="w-16 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-center text-slate-100 font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateProductivita(item.id, item.produttivita + 1)}
                                    className="cursor-pointer px-1.5 py-0.5 rounded border border-neutral-700 text-slate-300 hover:border-brand-gold"
                                    aria-label={`Aumenta produttività ${item.codice}`}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-200 font-mono">
                                {fmtEuro(calcPrezzarioCost(item))}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                <span
                                  className={
                                    item.produttivita <= 100 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"
                                  }
                                >
                                  {fmtEuro(calcInternalRealCost(item))}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-black border border-neutral-800 rounded-lg p-3">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                          Totale prezzario
                        </p>
                        <p className="text-lg font-extrabold text-white font-mono">
                          {fmtEuro(productivityImpact.totalePrezzario)}
                        </p>
                      </div>
                      <div className="bg-black border border-neutral-800 rounded-lg p-3">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                          Costo interno reale
                        </p>
                        <p className="text-lg font-extrabold text-white font-mono">
                          {fmtEuro(productivityImpact.totaleInternoReale)}
                        </p>
                      </div>
                      <div className="bg-black border border-neutral-800 rounded-lg p-3">
                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                          {productivityImpact.deltaEuro >= 0
                            ? "Margine Extra da Produttività"
                            : "Soglia di Protezione"}
                        </p>
                        <p
                          className={`text-lg font-extrabold font-mono ${
                            productivityImpact.deltaEuro >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {fmtEuro(productivityImpact.deltaEuro)}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {fmtPct(Math.abs(productivityImpact.deltaPercentTender))} su base d&apos;asta
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    Ribasso personalizzato da simulare
                  </label>
                  <span className="text-2xl font-extrabold text-brand-gold font-mono">
                    {ribasso.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={0.5}
                  value={ribasso}
                  onChange={(e) => setRibasso(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-full cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-gold [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-brand-gold [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                  style={{
                    background:
                      "linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 80%, #ef4444 100%)",
                  }}
                />
                <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                  <span>0%</span>
                  <span>20%</span>
                  <span>40%</span>
                </div>
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    productivityImpact.deltaEuro >= 0
                      ? isRibassoCoveredByProductivity
                        ? "bg-emerald-950/30 border-emerald-800 text-emerald-300"
                        : "bg-amber-950/30 border-amber-800 text-amber-300"
                      : "bg-red-950/30 border-red-800 text-red-300"
                  }`}
                >
                  {productivityImpact.deltaEuro >= 0 ? (
                    <>
                      Copertura efficienza: <span className="font-bold">{fmtPct(productivityCoverageThreshold)}</span> di
                      ribasso su base d&apos;asta. Ribasso selezionato{" "}
                      <span className="font-bold">{isRibassoCoveredByProductivity ? "coperto" : "non coperto"}</span>{" "}
                      dal margine produttività.
                    </>
                  ) : (
                    <>
                      Produttività sotto benchmark: incremento costi di{" "}
                      <span className="font-bold">{fmtEuro(Math.abs(productivityImpact.deltaEuro))}</span>, riduce lo
                      spazio di ribasso sostenibile.
                    </>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Offerta stimata al ribasso attuale: {fmtEuro(offeredBySlider)}
                </div>
                {!result && advancedPanelsProps && <AdvancedPricingPanels {...advancedPanelsProps} />}

                <button
                  type="button"
                  onClick={() => handleRun(profile, ribasso)}
                  disabled={loading}
                  className="cursor-pointer w-full bg-brand-gold hover:bg-yellow-400 disabled:opacity-50 text-black text-xs font-bold px-6 py-2.5 rounded-lg transition-colors"
                >
                  Avvia analisi Gemini
                </button>
              </div>
            </>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center space-y-4 py-8">
              <Loader2 className="w-8 h-8 text-brand-gold mx-auto animate-spin" />
              <p className="text-sm text-slate-300 font-semibold">Analisi pricing in corso...</p>
              <p className="text-xs text-slate-500">Gemini calcola range ottimale e scenari...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="space-y-4">
              <div className="bg-red-950/30 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
              {profile && (
                <button
                  type="button"
                  onClick={() => handleRun(profile, ribasso)}
                  className="cursor-pointer flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Riprova
                </button>
              )}
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="space-y-5">
              {/* Range numbers */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-emerald-950/40 border border-emerald-900 rounded-xl p-4">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-600 mb-1">
                    Ribasso MIN
                  </p>
                  <p className="text-3xl font-extrabold text-emerald-400 font-mono">
                    {fmtPct(result.rangeMinRibasso)}
                  </p>
                </div>
                <div className="bg-neutral-950 border border-brand-gold rounded-xl p-4">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-brand-gold mb-1">
                    Ribasso OTTIMALE
                  </p>
                  <p className="text-4xl font-extrabold text-brand-gold font-mono">
                    {fmtPct(result.ribassoOttimale)}
                  </p>
                </div>
                <div className="bg-amber-950/40 border border-amber-900 rounded-xl p-4">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-amber-600 mb-1">
                    Ribasso MAX
                  </p>
                  <p className="text-3xl font-extrabold text-amber-400 font-mono">
                    {fmtPct(result.rangeMaxRibasso)}
                  </p>
                </div>
              </div>

              {/* Visual bar */}
              <div className="space-y-2">
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                  Mappa range ribasso (0–40%)
                </p>
                <div
                  className="relative h-5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 80%, #ef4444 100%)",
                  }}
                >
                  {/* Min marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 z-10"
                    style={{ left: toBarPct(result.rangeMinRibasso) }}
                    title={`Min: ${fmtPct(result.rangeMinRibasso)}`}
                  />
                  {/* Ottimale marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-brand-gold border-2 border-black z-20 shadow"
                    style={{ left: toBarPct(result.ribassoOttimale) }}
                    title={`Ottimale: ${fmtPct(result.ribassoOttimale)}`}
                  />
                  {/* Max marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-amber-500 z-10"
                    style={{ left: toBarPct(result.rangeMaxRibasso) }}
                    title={`Max: ${fmtPct(result.rangeMaxRibasso)}`}
                  />
                  {/* Personalizzato marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-black z-10 opacity-80"
                    style={{ left: toBarPct(ribasso) }}
                    title={`Slider: ${fmtPct(ribasso)}`}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                  <span>0%</span>
                  <span className="text-blue-400">▲ {fmtPct(ribasso)} (tuo slider)</span>
                  <span>40%</span>
                </div>
              </div>

              {advancedPanelsProps && <AdvancedPricingPanels {...advancedPanelsProps} />}

              {/* Scenario cards */}
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-3">
                  Scenario Simulator
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {result.scenari.map((s) => (
                    <Fragment key={s.label}>
                      <ScenarioCard s={s} minMargine={profile?.minMargineAccettabile ?? 0} />
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* Motivazione LLM */}
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
                  Analisi Pricing
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">{result.motivazioneRange}</p>
              </div>

              {result.avvertenzaProduttivita && (
                <div className="bg-amber-950/30 border border-amber-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-500">
                      Attenzione — produttività squadre impatta il ribasso
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <span className="text-2xl font-extrabold text-amber-400 font-mono">
                        {((result.fattoreProduttivitaGlobale || 1) * 100).toFixed(0)}%
                      </span>
                      <p className="text-[9px] text-slate-500">rendimento squadre</p>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed flex-1">
                      {result.impattoProduttivita}
                    </p>
                  </div>
                </div>
              )}

              {!result.avvertenzaProduttivita && result.fattoreProduttivitaGlobale >= 0.85 && (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div>
                    <span className="text-[9px] font-bold text-emerald-400 uppercase block">
                      Produttività squadre adeguata
                    </span>
                    <p className="text-[10px] text-slate-400">{result.impattoProduttivita}</p>
                  </div>
                </div>
              )}

              {/* Alert margine */}
              {result.alertMargine && result.alertText && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] font-extrabold uppercase tracking-widest text-red-600 mb-1">
                      Alert margine
                    </p>
                    <p className="text-xs text-red-300">{result.alertText}</p>
                  </div>
                </div>
              )}

              {/* Win rate */}
              <div className="bg-neutral-950 border border-neutral-700 rounded-xl p-5 space-y-2">
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                  Win Rate stimato (prudente)
                </p>
                <p className="text-4xl font-extrabold text-brand-gold font-mono">
                  {fmtPct(result.winRatePrudente)}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">{result.winRateMotivazione}</p>
              </div>

              {/* Rigenera */}
              {profile && (
                <button
                  type="button"
                  onClick={() => handleRun(profile, ribasso)}
                  className="cursor-pointer flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Rigenera con stesso ribasso
                </button>
              )}

              {result.explainability && <ExplainabilityLayer data={result.explainability} />}

              {/* Footer */}
              <p className="text-[10px] text-slate-600 pt-2 border-t border-neutral-900">
                Basato su dati aziendali reali e D.Lgs. 36/2023 · Generato:{" "}
                {new Date(result.generatedAt).toLocaleString("it-IT")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
