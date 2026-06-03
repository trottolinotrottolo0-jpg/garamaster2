import { X, Leaf } from "lucide-react";
import type { TenderDocument } from "../types";
import { CAMCompliancePanel } from "./CAMCompliancePanel";

interface CAMComplianceCheckerProps {
  isOpen: boolean;
  onClose: () => void;
  tender: TenderDocument;
}

export function CAMComplianceChecker({ isOpen, onClose, tender }: CAMComplianceCheckerProps) {
  if (!isOpen) return null;

  const titlePreview =
    tender.title.length > 50 ? `${tender.title.slice(0, 50)}…` : tender.title;

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-start p-4 border-b border-neutral-800 shrink-0 gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Leaf className="w-4 h-4 text-emerald-400" />
              CAM Compliance Checker
            </h2>
            <div className="text-[9px] text-slate-400 mt-1">{titlePreview}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto scrollbar-thin flex-1">
          <CAMCompliancePanel tender={tender} />
        </div>

        <div className="p-4 border-t border-neutral-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer w-full text-[10px] font-bold px-3 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded hover:border-neutral-600 transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
