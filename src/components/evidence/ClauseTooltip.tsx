import { useState } from "react";
import { FileText } from "lucide-react";

type ClauseTooltipProps = {
  reference: string;
  sourceText?: string | null;
  documentLabel?: string;
  anchorHref?: string | null;
};

export function ClauseTooltip({
  reference,
  sourceText,
  documentLabel,
  anchorHref,
}: ClauseTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="text-sky-400 hover:text-sky-300 underline decoration-dotted underline-offset-2 text-[11px] font-semibold cursor-pointer"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        {reference}
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1 w-72 max-w-[90vw] rounded-lg border border-neutral-700 bg-neutral-950 shadow-xl p-3 text-left"
        >
          <p className="text-[10px] font-bold text-brand-gold flex items-center gap-1 mb-1">
            <FileText className="w-3 h-3" />
            {documentLabel ?? "Documento gara"}
          </p>
          <p className="text-[10px] text-slate-400 mb-1">{reference}</p>
          <p className="text-[11px] leading-relaxed text-slate-200 italic border-l-2 border-sky-800 pl-2">
            {sourceText?.trim() || "Estratto non disponibile — verifica sul documento originale."}
          </p>
          {anchorHref && (
            <a
              href={anchorHref}
              className="mt-2 inline-block text-[10px] text-sky-400 hover:text-sky-300"
            >
              Vedi nel documento originale →
            </a>
          )}
        </div>
      )}
    </span>
  );
}
