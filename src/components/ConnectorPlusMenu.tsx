import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Activity,
  BarChart3,
  Briefcase,
  Check,
  FileText,
  Plus,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  INTERNAL_CONNECTORS,
  type InternalConnector,
  type InternalConnectorAction,
} from "../lib/internalConnectors";

const CONNECTOR_ICONS: Record<
  InternalConnectorAction,
  ComponentType<{ className?: string }>
> = {
  bidNoBid: Scale,
  bidPricing: TrendingUp,
  capacity: Activity,
  profitability: BarChart3,
  vessatorie: ShieldAlert,
  analyzer: FileText,
  portfolioScore: Target,
  profile: Briefcase,
  rtiAvvalimento: Users,
  garaRoi: Wallet,
};

const CATEGORY_LABEL: Record<InternalConnector["category"], string> = {
  analisi: "Analisi",
  pricing: "Pricing & economia",
  documenti: "Documenti",
  profilo: "Profilo",
};

type ConnectorPlusMenuProps = {
  enabledIds: string[];
  onToggle: (id: string) => void;
  onRunConnector: (action: InternalConnectorAction, connector: InternalConnector) => void;
  disabled?: boolean;
};

export function ConnectorPlusMenu({
  enabledIds,
  onToggle,
  onRunConnector,
  disabled,
}: ConnectorPlusMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const byCategory = INTERNAL_CONNECTORS.reduce(
    (acc, c) => {
      if (!acc[c.category]) acc[c.category] = [];
      acc[c.category].push(c);
      return acc;
    },
    {} as Record<InternalConnector["category"], InternalConnector[]>
  );

  const enabledConnectors = INTERNAL_CONNECTORS.filter((c) => enabledIds.includes(c.id));

  return (
    <div ref={rootRef} className="relative shrink-0 flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`cursor-pointer p-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          open
            ? "border-brand-gold bg-brand-gold/15 text-brand-gold"
            : "border-transparent text-slate-400 hover:text-white hover:bg-neutral-900"
        }`}
        title="Strumenti e app GaraMaster"
        aria-expanded={open}
        id="chat-connectors-plus-btn"
      >
        <Plus className={`w-5 h-5 transition-transform ${open ? "rotate-45" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-full mb-2 z-[60] w-[min(100vw-2rem,320px)] max-h-[min(70vh,420px)] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl shadow-black/80 scrollbar-thin"
          role="menu"
        >
          <div className="sticky top-0 bg-neutral-950 border-b border-neutral-800 px-3 py-2.5">
            <p className="text-[11px] font-extrabold text-white">App GaraMaster</p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
              Seleziona gli strumenti da usare in questa chat — come i connettori su Claude.
            </p>
          </div>

          <div className="p-2 space-y-3">
            {(Object.keys(byCategory) as InternalConnector["category"][]).map((cat) => (
              <div key={cat}>
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-600 px-2 mb-1">
                  {CATEGORY_LABEL[cat]}
                </p>
                <ul className="space-y-0.5">
                  {byCategory[cat].map((connector) => {
                    const Icon = CONNECTOR_ICONS[connector.action];
                    const active = enabledIds.includes(connector.id);
                    return (
                      <li key={connector.id}>
                        <button
                          type="button"
                          role="menuitem"
                          className={`cursor-pointer w-full flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                            active
                              ? "bg-brand-gold/10 border border-brand-gold/40"
                              : "hover:bg-neutral-900 border border-transparent"
                          }`}
                          onClick={() => {
                            onToggle(connector.id);
                          }}
                        >
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              active ? "bg-brand-gold/20 text-brand-gold" : "bg-neutral-900 text-slate-400"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-white truncate">
                                {connector.name}
                              </span>
                              {active && (
                                <Check className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                              )}
                            </span>
                            <span className="text-[10px] text-slate-500 line-clamp-2 leading-snug">
                              {connector.description}
                            </span>
                          </span>
                        </button>
                        {active && (
                          <button
                            type="button"
                            className="cursor-pointer ml-10 mb-1 text-[10px] font-bold text-brand-gold hover:underline"
                            onClick={() => {
                              onRunConnector(connector.action, connector);
                              setOpen(false);
                            }}
                          >
                            Apri app →
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {enabledConnectors.length > 0 && (
        <div className="hidden sm:flex flex-wrap gap-1 max-w-[120px]">
          {enabledConnectors.slice(0, 2).map((c) => {
            const Icon = CONNECTOR_ICONS[c.action];
            return (
              <span
                key={c.id}
                className="inline-flex items-center gap-0.5 rounded-md bg-brand-gold/15 border border-brand-gold/30 px-1 py-0.5"
                title={c.name}
              >
                <Icon className="w-2.5 h-2.5 text-brand-gold" />
              </span>
            );
          })}
          {enabledConnectors.length > 2 && (
            <span className="text-[9px] text-brand-gold font-bold">+{enabledConnectors.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

type ConnectorChipsProps = {
  enabledIds: string[];
  onToggle: (id: string) => void;
};

export function ConnectorChips({ enabledIds, onToggle }: ConnectorChipsProps) {
  const enabled = INTERNAL_CONNECTORS.filter((c) => enabledIds.includes(c.id));
  if (!enabled.length) return null;

  return (
    <div className="px-2 pt-2 pb-1 flex flex-wrap gap-1.5 border-b border-neutral-800/80">
      {enabled.map((c) => {
        const Icon = CONNECTOR_ICONS[c.action];
        return (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-full border border-brand-gold/40 bg-brand-gold/10 pl-2 pr-1 py-0.5 text-[10px] text-brand-gold font-semibold"
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[140px]">{c.name}</span>
            <button
              type="button"
              onClick={() => onToggle(c.id)}
              className="cursor-pointer p-0.5 rounded-full hover:bg-brand-gold/20 text-brand-gold"
              title="Rimuovi strumento"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
