import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { generaMotivazione } from "../lib/scoring";
import type { Gara } from "../types/gara";

type RankingMotivazioneProps = {
  gara: Gara;
  className?: string;
};

export function RankingMotivazione({ gara, className = "" }: RankingMotivazioneProps) {
  const [open, setOpen] = useState(false);
  const testo = gara.motivazione_ranking ?? generaMotivazione(gara);

  if (!testo.trim()) return null;

  return (
    <div
      className={`mt-2 w-full ${className}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-brand-gold transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
        Perché questo score?
      </button>
      {open && (
        <p className="mt-1.5 text-[10px] text-slate-400 leading-relaxed pr-1">{testo}</p>
      )}
    </div>
  );
}
