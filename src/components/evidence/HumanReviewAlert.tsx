import { AlertTriangle, CheckCircle2 } from "lucide-react";

type HumanReviewAlertProps = {
  reason?: string | null;
  reviewed?: boolean;
  onMarkReviewed?: () => void | Promise<void>;
  loading?: boolean;
};

export function HumanReviewAlert({
  reason,
  reviewed,
  onMarkReviewed,
  loading,
}: HumanReviewAlertProps) {
  if (reviewed) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-[11px] text-emerald-300">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Verificato manualmente dall&apos;utente.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-red-600/80 bg-red-950/50 px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-red-300">
            Verifica manuale richiesta
          </p>
          <p className="text-[11px] text-red-100/90 mt-0.5 leading-relaxed">
            {reason?.trim() ||
              "L'estrazione AI ha confidence bassa o dati incompleti. Controlla la clausola sul disciplinare prima di decidere."}
          </p>
        </div>
      </div>
      {onMarkReviewed && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void onMarkReviewed()}
          className="cursor-pointer w-full text-[10px] font-bold uppercase tracking-wide py-1.5 rounded-md bg-red-900/60 hover:bg-red-800/80 border border-red-700 text-white transition-colors disabled:opacity-50"
        >
          Segna come verificato manualmente
        </button>
      )}
    </div>
  );
}
