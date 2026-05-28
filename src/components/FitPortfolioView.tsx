import type { FitPortfolioCluster } from "../lib/fitEngineStrategic";
import { FIT_RECOMMENDATION_LABEL } from "../lib/fitEngineStrategic";

interface FitPortfolioViewProps {
  clusters: FitPortfolioCluster[];
}

const CLUSTER_STYLES: Record<
  FitPortfolioCluster["categoria"],
  { box: string; title: string }
> = {
  ALLINEATA_ALTA: {
    box: "bg-emerald-950/20 border-emerald-900/50",
    title: "text-emerald-400",
  },
  ALLINEATA_MEDIA: {
    box: "bg-blue-950/20 border-blue-900/50",
    title: "text-blue-400",
  },
  OFF_STRATEGY: {
    box: "bg-amber-950/20 border-amber-900/50",
    title: "text-amber-400",
  },
  IRRILEVANTE: {
    box: "bg-neutral-950/40 border-neutral-800",
    title: "text-slate-400",
  },
};

export function FitPortfolioView({ clusters }: FitPortfolioViewProps) {
  if (clusters.length === 0) {
    return (
      <p className="text-[9px] text-slate-500">Nessuna gara da classificare per fit strategico.</p>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-bold text-brand-gold uppercase">
        Portfolio per fit strategico
      </h3>

      {clusters.map((cluster) => {
        const style = CLUSTER_STYLES[cluster.categoria];
        return (
          <div key={cluster.categoria} className={`border rounded-lg p-3 ${style.box}`}>
            <div className="flex justify-between items-start mb-2">
              <span className={`text-[10px] font-bold ${style.title}`}>
                {FIT_RECOMMENDATION_LABEL[cluster.categoria]}
              </span>
              <span className="text-[10px] text-slate-400">{cluster.numeroGare} gare</span>
            </div>
            <div className="text-[9px] text-slate-300 mb-1">{cluster.raccomandazione}</div>
            <div className="text-[8px] text-slate-500">
              Importo medio: €{(cluster.importoMedio / 1_000_000).toFixed(2)}M · Totale: €
              {(cluster.importoTotale / 1_000_000).toFixed(2)}M
            </div>
          </div>
        );
      })}
    </div>
  );
}
