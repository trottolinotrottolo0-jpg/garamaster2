type TenderProgressProps = {
  percent: number;
  documentsDone: number;
  documentsTotal: number;
  checklistDone: number;
  checklistTotal: number;
  className?: string;
};

export function TenderProgress({
  percent,
  documentsDone,
  documentsTotal,
  checklistDone,
  checklistTotal,
  className = "",
}: TenderProgressProps) {
  return (
    <div className={className}>
      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
        <span>Avanzamento pratica</span>
        <span className="font-bold text-brand-gold">{percent}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-neutral-900 overflow-hidden border border-neutral-800">
        <div
          className="h-full bg-gradient-to-r from-brand-gold/80 to-yellow-300 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 mt-1">
        <span>
          Documenti {documentsDone}/{documentsTotal || "—"}
        </span>
        <span>
          Checklist {checklistDone}/{checklistTotal || "—"}
        </span>
      </div>
    </div>
  );
}
