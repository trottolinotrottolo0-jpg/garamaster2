import { ArrowDownWideNarrow, ArrowUpDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { fitLabel } from "../lib/fitScore";
import {
  caricoBarColor,
  isCaricoAlto,
} from "../lib/caricoScore";
import {
  convenienzaBadgeClasses,
  formatConvenienzaLabel,
} from "../lib/convenienzaScore";
import {
  formatMargineLabel,
  margineBadgeClasses,
} from "../lib/margineScore";
import { riskBadgeClasses, riskBadgeLabel, riskLevel } from "../lib/riskScore";
import { urgencyBadgeClasses, urgencyLabel } from "../lib/urgencyScore";
import { RankingMotivazione } from "./RankingMotivazione";
import { ScoreSinteticoBadge } from "./ScoreSinteticoBadge";
import type { usePortfolioGare } from "../hooks/usePortfolioGare";
import type { Gara, PortfolioSortMode } from "../types/gara";

type PortfolioGareState = Pick<
  ReturnType<typeof usePortfolioGare>,
  "displayedGare" | "loading" | "error" | "sortMode" | "setSortMode" | "refresh"
>;

type TenderPortfolioListProps = PortfolioGareState & {
  onSelectTender?: (listId: string) => void;
  maxItems?: number;
  className?: string;
};

function UrgencyBadge({ score, scadenza }: { score: number; scadenza?: string }) {
  const label = urgencyLabel(score, scadenza);
  return (
    <span
      className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg border ${urgencyBadgeClasses(score)}`}
      title={
        score > 0
          ? `Urgenza ${score} — scadenza ${scadenza ?? "non impostata"}`
          : "Scadenza non disponibile"
      }
    >
      {label}
    </span>
  );
}

function RiskBadge({ score }: { score: number }) {
  const level = riskLevel(score);
  return (
    <span
      className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg border ${riskBadgeClasses(level)}`}
      title={`Rischio ${score}/100 — ${riskBadgeLabel(level)}`}
    >
      {riskBadgeLabel(level)}
    </span>
  );
}

function MargineBadge({ margine }: { margine: number | null }) {
  return (
    <span
      className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg border ${margineBadgeClasses(margine)}`}
      title={
        margine != null
          ? `Margine stimato ${margine}%`
          : "Margine non calcolabile — imposta margine_stimato o importo/costo/ribasso"
      }
    >
      {formatMargineLabel(margine)}
    </span>
  );
}

function ConvenienzaBadge({
  score,
  storicoMatch,
}: {
  score: number;
  storicoMatch?: number;
}) {
  return (
    <span
      className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg border ${convenienzaBadgeClasses(score)}`}
      title={
        storicoMatch != null
          ? `Convenienza ${score}% — storico simile ${storicoMatch}%`
          : `Convenienza stimata ${score}%`
      }
    >
      {formatConvenienzaLabel(score)}
    </span>
  );
}

function CaricoLoadBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const alto = isCaricoAlto(pct);

  return (
    <div className="flex items-center gap-2 mt-1.5 w-full max-w-[220px]">
      <div
        className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden"
        title={`Carico operativo ${pct}% della capacità`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all ${caricoBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] font-mono text-slate-500 tabular-nums shrink-0">{pct}%</span>
      {alto && (
        <span className="shrink-0 text-[8px] font-extrabold uppercase tracking-wide text-red-300 border border-red-900/60 bg-red-950/50 px-1.5 py-0.5 rounded">
          carico alto
        </span>
      )}
    </div>
  );
}

function FitBadge({ score }: { score: number }) {
  const label = fitLabel(score);
  const colors =
    label === "alto"
      ? "text-emerald-400 bg-emerald-950/50 border-emerald-900/50"
      : label === "medio"
        ? "text-amber-400 bg-amber-950/50 border-amber-900/50"
        : "text-slate-400 bg-neutral-900 border-neutral-800";

  return (
    <span className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-lg border ${colors}`}>
      {score}%
    </span>
  );
}

export function TenderPortfolioList({
  displayedGare,
  loading,
  error,
  sortMode,
  setSortMode,
  refresh,
  onSelectTender,
  maxItems = 50,
  className = "",
}: TenderPortfolioListProps) {
  const items = displayedGare.slice(0, maxItems);

  return (
    <div
      className={`rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 ${className}`}
      id="tender-portfolio-list"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <ArrowDownWideNarrow className="w-3.5 h-3.5 text-brand-gold" />
            Portfolio gare
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Fit · convenienza · urgenza · rischio · margine · carico
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="portfolio-sort-select">
            Ordina portfolio
          </label>
          <select
            id="portfolio-sort-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as PortfolioSortMode)}
            className="cursor-pointer rounded-lg border border-neutral-700 bg-black text-[11px] font-bold text-slate-300 px-2.5 py-1.5 focus:outline-hidden focus:border-brand-gold"
          >
            <option value="score_sintetico_desc">Score sintetico (alto → basso)</option>
            <option value="convenienza_desc">Convenienza (alta → bassa)</option>
            <option value="fit_desc">Fit score (alto → basso)</option>
            <option value="urgency_desc">Urgenza (alta → bassa)</option>
            <option value="risk_asc">Rischio (basso → alto)</option>
            <option value="risk_desc">Rischio (alto → basso)</option>
            <option value="margine_desc">Margine stimato (alto → basso)</option>
            <option value="carico_asc">Carico operativo (basso → alto)</option>
            <option value="carico_desc">Carico operativo (alto → basso)</option>
            <option value="default">Ordine catalogo</option>
          </select>
          {(sortMode === "carico_asc" || sortMode === "carico_desc") && (
            <button
              type="button"
              onClick={() =>
                setSortMode(sortMode === "carico_asc" ? "carico_desc" : "carico_asc")
              }
              className="cursor-pointer p-2 rounded-lg border border-neutral-800 text-slate-400 hover:text-brand-gold"
              title={
                sortMode === "carico_asc"
                  ? "Inverti: mostra prima il carico più alto"
                  : "Inverti: mostra prima il carico più basso"
              }
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          )}
          {(sortMode === "risk_asc" || sortMode === "risk_desc") && (
            <button
              type="button"
              onClick={() =>
                setSortMode(sortMode === "risk_asc" ? "risk_desc" : "risk_asc")
              }
              className="cursor-pointer p-2 rounded-lg border border-neutral-800 text-slate-400 hover:text-brand-gold"
              title={
                sortMode === "risk_asc"
                  ? "Inverti: mostra prima i più rischiosi"
                  : "Inverti: mostra prima i meno rischiosi"
              }
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="cursor-pointer p-2 rounded-lg border border-neutral-800 text-slate-400 hover:text-brand-gold disabled:opacity-50"
            title="Ricalcola score portfolio"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-amber-300/90 mb-3 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2">
          {error}
        </p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-slate-500 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
          Calcolo fit score gare…
        </div>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic py-4 text-center">
          Nessuna gara nel portfolio. Aggiungi gare in Supabase o sincronizza ANAC.
        </p>
      ) : (
        <ul className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-thin">
          {items.map((gara) => (
            <PortfolioRow key={`${gara.source}-${gara.id}`} gara={gara} onSelect={onSelectTender} />
          ))}
        </ul>
      )}

      {displayedGare.length > maxItems && (
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          Mostrate {maxItems} di {displayedGare.length} gare
        </p>
      )}
    </div>
  );
}

function PortfolioRow({
  gara,
  onSelect,
}: {
  gara: Gara;
  onSelect?: (listId: string) => void;
}) {
  const importoLabel =
    gara.importo != null
      ? new Intl.NumberFormat("it-IT", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }).format(gara.importo)
      : null;

  const content = (
    <>
      <div className="flex shrink-0 items-center gap-1.5 flex-wrap max-w-[12rem] sm:max-w-none">
        <ScoreSinteticoBadge score={gara.score_sintetico} />
        <ConvenienzaBadge
          score={gara.convenienza_score}
          storicoMatch={gara.storico_match}
        />
        <MargineBadge margine={gara.margine_stimato} />
        <RiskBadge score={gara.risk_score} />
        <UrgencyBadge score={gara.urgency_score} scadenza={gara.scadenza} />
        <FitBadge score={gara.fit_score} />
      </div>
      <span className="flex-1 min-w-0">
        <span className="text-[11px] font-bold text-white block truncate group-hover:text-brand-gold">
          {gara.titolo}
        </span>
        <span className="text-[10px] text-slate-500 font-mono block truncate">
          CIG {gara.cig}
          {gara.regione ? ` · ${gara.regione}` : ""}
          {gara.categoria ? ` · ${gara.categoria}` : ""}
          {importoLabel ? ` · ${importoLabel}` : ""}
        </span>
        <CaricoLoadBar score={gara.carico_score} />
        <RankingMotivazione gara={gara} />
      </span>
      {onSelect && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 self-start mt-1" />}
    </>
  );

  if (onSelect && gara.listId) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onSelect(gara.listId!)}
          className="cursor-pointer w-full text-left rounded-xl border border-neutral-800 hover:border-brand-gold/40 bg-black/40 px-3 py-2.5 flex items-start gap-3 transition-colors group"
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2.5 flex items-start gap-3">
      {content}
    </li>
  );
}
