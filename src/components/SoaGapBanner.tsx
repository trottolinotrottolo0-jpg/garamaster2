import { AlertTriangle, Users } from "lucide-react";
import type { SoaGapAnalysis } from "../lib/soaGapAnalysis";

type SoaGapBannerProps = {
  analysis: SoaGapAnalysis;
  cig: string;
  onOpenConfigurator: () => void;
};

export function SoaGapBanner({ analysis, cig, onOpenConfigurator }: SoaGapBannerProps) {
  if (!analysis.hasGaps) return null;

  return (
    <div className="mx-4 mt-3 mb-1 rounded-xl border border-amber-800/60 bg-amber-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Requisiti SOA non coperti — CIG {cig}
        </p>
        <p className="text-[10px] text-amber-200/80 mt-1 leading-snug">
          Gemini suggerirà automaticamente RTI, Avvalimento (art. 104) o se lasciare perdere la gara.
          {analysis.gaps.length > 0 && (
            <span className="block mt-0.5 text-amber-300/70">
              {analysis.gaps.length} requisito/i da colmare.
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenConfigurator}
        className="cursor-pointer shrink-0 flex items-center gap-1.5 rounded-lg bg-brand-gold text-black text-[10px] font-extrabold px-3 py-2 hover:bg-yellow-400 transition-colors"
        id="open-rti-avvalimento-btn"
      >
        <Users className="w-3.5 h-3.5" />
        RTI &amp; Avvalimento
      </button>
    </div>
  );
}
