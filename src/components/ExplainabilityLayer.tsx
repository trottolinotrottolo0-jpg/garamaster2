import type { ExplainabilityData } from "../types";

function confidenceStyle(level: string): string {
  const normalized = level.toLowerCase();
  if (normalized.includes("alto")) {
    return "bg-emerald-950/50 border-emerald-700/60 text-emerald-300";
  }
  if (normalized.includes("basso")) {
    return "bg-red-950/50 border-red-800/60 text-red-300";
  }
  return "bg-amber-950/50 border-amber-700/60 text-amber-300";
}

type ExplainabilityLayerProps = {
  data: ExplainabilityData;
};

export function ExplainabilityLayer({ data }: ExplainabilityLayerProps) {
  const { perche, datiUsati, verifica, confidenza } = data;
  if (!perche && !datiUsati && !verifica && !confidenza) return null;

  return (
    <div className="mt-4 pt-3 border-t border-neutral-700/80 space-y-2.5 rounded-xl bg-neutral-900/60 p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-gold">
        Explainability Layer
      </p>

      {perche && (
        <div>
          <p className="text-[11px] font-bold text-emerald-400 mb-0.5">✅ Perché ho detto questo</p>
          <p className="text-[11px] leading-relaxed text-slate-300">{perche}</p>
        </div>
      )}

      {datiUsati && (
        <div>
          <p className="text-[11px] font-bold text-sky-400 mb-0.5">📊 Dati usati per l&apos;analisi</p>
          <p className="text-[11px] leading-relaxed text-slate-300">{datiUsati}</p>
        </div>
      )}

      {verifica && (
        <div>
          <p className="text-[11px] font-bold text-amber-400 mb-0.5">
            ⚠️ Cosa verificare manualmente
          </p>
          <p className="text-[11px] leading-relaxed text-slate-300">{verifica}</p>
        </div>
      )}

      {confidenza && (
        <div>
          <p className="text-[11px] font-bold text-slate-400 mb-1">🎯 Livello di confidenza</p>
          <span
            className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${confidenceStyle(confidenza)}`}
          >
            {confidenza.replace(/\*\*/g, "").trim()}
          </span>
        </div>
      )}
    </div>
  );
}
