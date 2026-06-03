import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { generaMotivazione } from "../lib/scoring";
import { buildFitScoreEvidence } from "../lib/evidence";
import type { Gara } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import { EvidenceLayer } from "./evidence/EvidenceLayer";
import { ConfidenceBadge } from "./evidence/ConfidenceBadge";

type RankingMotivazioneProps = {
  gara: Gara;
  profilo?: ProfiloImpresaContext | null;
  userId?: string;
  garaId?: string | null;
  className?: string;
};

export function RankingMotivazione({
  gara,
  profilo = null,
  userId,
  garaId,
  className = "",
}: RankingMotivazioneProps) {
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
        <div className="mt-1.5 space-y-2">
          <div className="flex items-center gap-2">
            <ConfidenceBadge score={gara.score_sintetico} />
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed pr-1">{testo}</p>
          <EvidenceLayer
            userId={userId}
            garaId={garaId ?? (gara.source === "gare" ? gara.id : null)}
            outputType="fit_score"
            outputId={`${gara.cig}_fit`}
            inlineEvidence={buildFitScoreEvidence(gara, profilo)}
            title="Perché questo score (Fit)"
            compact
          />
        </div>
      )}
    </div>
  );
}
