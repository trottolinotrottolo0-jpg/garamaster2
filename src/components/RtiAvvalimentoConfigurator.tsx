import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { CompanyProfile, TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import { detectSoaGaps } from "../lib/soaGapAnalysis";
import { fetchRtiAvvalimentoAnalysis, raccomandazioneLabel } from "../lib/rtiAvvalimentoApi";
import type { RtiAvvalimentoResult } from "../types";
import { ExplainabilityLayer } from "./ExplainabilityLayer";

type RtiAvvalimentoConfiguratorProps = {
  tender: TenderDocument;
  profilo: ProfiloImpresaContext | null;
  isOpen: boolean;
  onClose: () => void;
};

function PercorsoCard({
  title,
  active,
  consigliato,
  children,
}: {
  title: string;
  active: boolean;
  consigliato: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-2 transition-colors ${
        active
          ? "border-brand-gold bg-brand-gold/10"
          : consigliato
            ? "border-emerald-800/60 bg-emerald-950/20"
            : "border-neutral-800 bg-neutral-950/80"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-white">{title}</h4>
        {consigliato ? (
          <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Consigliato
          </span>
        ) : (
          <span className="text-[9px] text-slate-500">Alternativa</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function RtiAvvalimentoConfigurator({
  tender,
  profilo,
  isOpen,
  onClose,
}: RtiAvvalimentoConfiguratorProps) {
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [result, setResult] = useState<RtiAvvalimentoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gapAnalysis = detectSoaGaps(tender, profilo);

  const runAnalysis = async (cp: CompanyProfile | null) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetchRtiAvvalimentoAnalysis({
        tender,
        profilo,
        companyProfile: cp,
        soaGaps: gapAnalysis.gaps,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const stored = localStorage.getItem("gm_company_profile");
    const cp = stored ? (JSON.parse(stored) as CompanyProfile) : null;
    setCompanyProfile(cp);
    runAnalysis(cp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tender.id, profilo?.id]);

  if (!isOpen) return null;

  const rac = result?.raccomandazioneFinale;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-5 h-5 text-brand-gold shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-extrabold tracking-widest uppercase text-white block truncate">
                RTI &amp; Avvalimento Configurator
              </span>
              <span className="text-[10px] text-slate-500 font-mono">CIG {tender.cig}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          {gapAnalysis.hasGaps && (
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 p-3">
              <p className="text-[10px] font-bold text-amber-400 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Gap SOA / qualificazione rilevati
              </p>
              <ul className="text-[10px] text-amber-100/90 space-y-1 list-disc list-inside">
                {gapAnalysis.gaps.map((g, i) => (
                  <li key={i}>
                    <strong>{g.category}</strong>: {g.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-12 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
              <p className="text-sm">Analisi RTI, Avvalimento e no-go in corso…</p>
            </div>
          )}

          {error && !loading && (
            <div className="text-center space-y-3 py-6">
              <XCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-sm text-red-300">{error}</p>
              <button
                type="button"
                onClick={() => runAnalysis(companyProfile)}
                className="cursor-pointer text-xs font-bold text-brand-gold hover:underline"
              >
                Riprova
              </button>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="rounded-xl border border-brand-gold/50 bg-brand-gold/10 p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Raccomandazione finale
                </p>
                <p className="text-lg font-extrabold text-brand-gold">
                  {raccomandazioneLabel(result.raccomandazioneFinale)}
                </p>
                <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">{result.sintesi}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-1">
                <PercorsoCard
                  title="1. RTI (Raggruppamento)"
                  active={rac === "RTI"}
                  consigliato={result.rti.consigliato}
                >
                  <p className="text-[11px] text-slate-300 leading-relaxed">{result.rti.motivazione}</p>
                  <p className="text-[10px] text-slate-400">
                    <strong className="text-white">Capogruppo:</strong> {result.rti.capogruppo}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    <strong className="text-white">Struttura:</strong> {result.rti.struttura}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    <strong className="text-white">Quote:</strong> {result.rti.quotePartecipazione}
                  </p>
                  {result.rti.partnerSuggeriti?.length > 0 && (
                    <ul className="text-[10px] text-slate-500 list-disc list-inside">
                      {result.rti.partnerSuggeriti.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {result.rti.documenti?.length > 0 && (
                    <p className="text-[9px] text-slate-500">
                      Doc.: {result.rti.documenti.join(" · ")}
                    </p>
                  )}
                </PercorsoCard>

                <PercorsoCard
                  title="2. Avvalimento (art. 104)"
                  active={rac === "AVVALIMENTO"}
                  consigliato={result.avvalimento.consigliato}
                >
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {result.avvalimento.motivazione}
                  </p>
                  <p className="text-[10px] text-brand-gold font-mono">
                    {result.avvalimento.riferimentoNormativo}
                  </p>
                  {result.avvalimento.requisitiDaAvvalere?.length > 0 && (
                    <ul className="text-[10px] text-slate-400 list-disc list-inside">
                      {result.avvalimento.requisitiDaAvvalere.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-slate-500 italic">{result.avvalimento.limiti}</p>
                </PercorsoCard>

                <PercorsoCard
                  title="3. Lasciare perdere la gara"
                  active={rac === "LASCIARE_PERDERE"}
                  consigliato={result.lasciarePerdere.consigliato}
                >
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {result.lasciarePerdere.motivazione}
                  </p>
                  {result.lasciarePerdere.rischiPrincipali?.length > 0 && (
                    <ul className="text-[10px] text-red-300/90 list-disc list-inside">
                      {result.lasciarePerdere.rischiPrincipali.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </PercorsoCard>
              </div>

              <ExplainabilityLayer
                data={{
                  perche: result.perche,
                  datiUsati: result.datiUsati,
                  verifica: result.verifica,
                  confidenza: result.confidenza,
                }}
              />
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-neutral-800 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => runAnalysis(companyProfile)}
            disabled={loading}
            className="cursor-pointer flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-white disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Rigenera
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer bg-neutral-900 border border-neutral-700 hover:border-brand-gold text-white text-xs font-bold px-4 py-2 rounded-lg"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
