import {
  PRACTICE_STATO_LABELS,
  practiceStatoBadgeClasses,
} from "../lib/tenderPreparationEngine";
import type { TenderPracticeStato } from "../types/tenderPreparation";

type TenderStatusBadgeProps = {
  stato: TenderPracticeStato;
  compact?: boolean;
  className?: string;
};

export function TenderStatusBadge({
  stato,
  compact = false,
  className = "",
}: TenderStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border font-extrabold uppercase tracking-wide ${practiceStatoBadgeClasses(stato)} ${
        compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1"
      } ${className}`}
    >
      {PRACTICE_STATO_LABELS[stato]}
    </span>
  );
}
