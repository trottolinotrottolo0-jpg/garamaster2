type ConfidenceBadgeProps = {
  score: number;
  requiresReview?: boolean;
  compact?: boolean;
};

export type ConfidenceTier = "ALTA" | "MEDIA" | "BASSA" | "VERIFICA";

export function confidenceTier(score: number, requiresReview?: boolean): ConfidenceTier {
  if (requiresReview || score < 70) return "VERIFICA";
  if (score >= 85) return "ALTA";
  if (score >= 70) return "MEDIA";
  return "BASSA";
}

function tierClasses(tier: ConfidenceTier): string {
  switch (tier) {
    case "ALTA":
      return "bg-emerald-950/60 border-emerald-700/60 text-emerald-300";
    case "MEDIA":
      return "bg-amber-950/50 border-amber-700/50 text-amber-300";
    case "BASSA":
      return "bg-orange-950/50 border-orange-800/50 text-orange-300";
    case "VERIFICA":
      return "bg-red-950/70 border-red-600/70 text-red-200 animate-pulse";
  }
}

export function ConfidenceBadge({ score, requiresReview, compact }: ConfidenceBadgeProps) {
  const tier = confidenceTier(score, requiresReview);
  const label = tier === "VERIFICA" ? "VERIFICA MANUALE" : tier;

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide border rounded-full ${compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"} ${tierClasses(tier)}`}
      title={`Confidence estrazione: ${score}%`}
    >
      {label}
      <span className="opacity-80 font-normal normal-case">{score}%</span>
    </span>
  );
}
