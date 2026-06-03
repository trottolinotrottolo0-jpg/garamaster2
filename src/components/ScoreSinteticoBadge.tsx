import {
  formatScoreSinteticoLabel,
  scoreSinteticoBadgeClasses,
} from "../lib/scoring";

type ScoreSinteticoBadgeProps = {
  score: number;
  compact?: boolean;
  className?: string;
  title?: string;
};

export function ScoreSinteticoBadge({
  score,
  compact = false,
  className = "",
  title,
}: ScoreSinteticoBadgeProps) {
  return (
    <span
      className={`shrink-0 text-[10px] font-extrabold tabular-nums px-2 py-1 rounded-lg border ${scoreSinteticoBadgeClasses(score)} ${className}`}
      title={title ?? `Score sintetico ${score}/100`}
    >
      {formatScoreSinteticoLabel(score, compact)}
    </span>
  );
}
