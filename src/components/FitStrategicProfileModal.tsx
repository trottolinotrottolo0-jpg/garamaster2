import { useState, useEffect, useMemo } from "react";
import { X, Plus, Trash2, Target, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type {
  FitStrategicProfile,
  NicchiaStrategica,
  AreaGeografica,
  HistoricalTender,
  CompanyTenderHistoryItem,
} from "../types";
import {
  analyzeFitStrategicTrend,
  buildFitParticipationHistory,
} from "../lib/fitEngineStrategic";

interface FitStrategicProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProfile: (profile: FitStrategicProfile) => void;
  currentProfile?: FitStrategicProfile;
  historicalTenders?: HistoricalTender[];
  tenderHistory?: CompanyTenderHistoryItem[];
}

export function FitStrategicProfileModal({
  isOpen,
  onClose,
  onSaveProfile,
  currentProfile,
  historicalTenders = [],
  tenderHistory = [],
}: FitStrategicProfileModalProps) {
  const [nicchie, setNicchie] = useState<NicciaStrategica[]>([]);
  const [aree, setAree] = useState<AreaGeografica[]>([]);
  const [importoTarget, setImportoTarget] = useState(5_000_000);
  const [margineTarget, setMargineTarget] = useState(8);

  useEffect(() => {
    if (!isOpen) return;
    setNicchie(currentProfile?.strategiaAttiva.nicchieTarget ?? []);
    setAree(currentProfile?.strategiaAttiva.areeTarget ?? []);
    setImportoTarget(currentProfile?.strategiaAttiva.importoTargetAnnuale ?? 5_000_000);
    setMargineTarget(currentProfile?.strategiaAttiva.margineTargetMedio ?? 8);
  }, [isOpen, currentProfile]);

  const draftProfile = useMemo((): FitStrategicProfile | undefined => {
    if (!isOpen) return currentProfile;
    return {
      id: currentProfile?.id ?? "draft",
      strategiaAttiva: {
        periodo: "2025",
        nicchieTarget: nicchie,
        areeTarget: aree,
        importoTargetAnnuale: importoTarget,
        margineTargetMedio: margineTarget,
        descrizioneVersione: "Bozza",
      },
      dataCreazione: currentProfile?.dataCreazione ?? new Date().toISOString(),
      dataUltimaModifica: new Date().toISOString(),
    };
  }, [isOpen, currentProfile, nicchie, aree, importoTarget, margineTarget]);

  const fitTrends = useMemo(() => {
    const history = buildFitParticipationHistory(
      draftProfile,
      historicalTenders,
      tenderHistory
    );
    if (history.length === 0) return [];
    return analyzeFitStrategicTrend(history);
  }, [draftProfile, historicalTenders, tenderHistory]);

  if (!isOpen) return null;

  const handleSave = () => {
    const strategiaAttiva = {
      periodo: "2025" as const,
      nicchieTarget: nicchie,
      areeTarget: aree,
      importoTargetAnnuale: importoTarget,
      margineTargetMedio: margineTarget,
      descrizioneVersione: "Profilo strategico 2025",
    };

    const profile: FitStrategicProfile = {
      id: currentProfile?.id ?? `fit-${Date.now()}`,
      strategiaAttiva,
      storicoStrategie: currentProfile?.strategiaAttiva
        ? [...(currentProfile.storicoStrategie ?? []), currentProfile.strategiaAttiva]
        : currentProfile?.storicoStrategie,
      dataCreazione: currentProfile?.dataCreazione ?? new Date().toISOString(),
      dataUltimaModifica: new Date().toISOString(),
    };

    onSaveProfile(profile);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-black border border-neutral-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-gold" />
            Profilo strategico 2025
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-white transition-colors"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Target annuale (€)
            </label>
            <input
              type="number"
              value={importoTarget}
              onChange={(e) => setImportoTarget(Number(e.target.value))}
              className="w-full text-[10px] px-2 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded"
            />
            <div className="text-[9px] text-slate-500">
              €{(importoTarget / 1_000_000).toFixed(1)}M di fatturato target
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Margine target (%)
            </label>
            <input
              type="number"
              step="0.5"
              value={margineTarget}
              onChange={(e) => setMargineTarget(Number(e.target.value))}
              className="w-full text-[10px] px-2 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded"
            />
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-brand-gold uppercase">
                Nicchie di crescita ({nicchie.length})
              </label>
              <button
                type="button"
                onClick={() =>
                  setNicchie([
                    ...nicchie,
                    {
                      id: `nicchia-${Date.now()}`,
                      nome: "",
                      descrizione: "",
                      priorita: 5,
                      targetImportoMedio: 1_000_000,
                      targetMargineMedio: 8,
                    },
                  ])
                }
                className="cursor-pointer text-[9px] text-brand-gold hover:text-yellow-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {nicchie.map((nicchia, idx) => (
              <div key={nicchia.id} className="bg-neutral-900 rounded p-2 space-y-1">
                <div className="flex gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Nome nicchia (es. Ristrutturazione sostenibile)"
                    value={nicchia.nome}
                    onChange={(e) => {
                      const updated = [...nicchie];
                      updated[idx] = { ...updated[idx], nome: e.target.value };
                      setNicchie(updated);
                    }}
                    className="flex-1 text-[9px] px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 text-white rounded"
                  />
                  <button
                    type="button"
                    onClick={() => setNicchie(nicchie.filter((_, i) => i !== idx))}
                    className="cursor-pointer text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={nicchia.priorita}
                  onChange={(e) => {
                    const updated = [...nicchie];
                    updated[idx] = { ...updated[idx], priorita: Number(e.target.value) };
                    setNicchie(updated);
                  }}
                  className="w-full"
                />
                <div className="text-[8px] text-slate-500">
                  Priorità: <span className="text-white font-bold">{nicchia.priorita}/10</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-brand-gold uppercase">
                Aree geografiche target ({aree.length})
              </label>
              <button
                type="button"
                onClick={() =>
                  setAree([
                    ...aree,
                    {
                      id: `area-${Date.now()}`,
                      regione: "",
                      priorita: 5,
                      hasLogisticsHub: false,
                    },
                  ])
                }
                className="cursor-pointer text-[9px] text-brand-gold hover:text-yellow-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {aree.map((area, idx) => (
              <div key={area.id} className="bg-neutral-900 rounded p-2 flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Regione (es. Toscana)"
                  value={area.regione}
                  onChange={(e) => {
                    const updated = [...aree];
                    updated[idx] = { ...updated[idx], regione: e.target.value };
                    setAree(updated);
                  }}
                  className="flex-1 text-[9px] px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 text-white rounded"
                />
                <label className="flex items-center gap-1 text-[9px] text-slate-400 shrink-0">
                  <input
                    type="checkbox"
                    checked={area.hasLogisticsHub}
                    onChange={(e) => {
                      const updated = [...aree];
                      updated[idx] = { ...updated[idx], hasLogisticsHub: e.target.checked };
                      setAree(updated);
                    }}
                    className="w-3 h-3"
                  />
                  Hub
                </label>
                <button
                  type="button"
                  onClick={() => setAree(aree.filter((_, i) => i !== idx))}
                  className="cursor-pointer text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
            <label className="text-[10px] font-bold text-brand-gold uppercase flex items-center gap-1">
              Trend allineamento strategico
            </label>
            {fitTrends.length === 0 ? (
              <p className="text-[9px] text-slate-500">
                Compila lo storico gare nel profilo azienda per vedere l&apos;evoluzione YoY
                dell&apos;allineamento.
              </p>
            ) : (
              <div className="space-y-2">
                {fitTrends.map((t) => (
                  <div
                    key={t.periodo}
                    className="bg-neutral-900 rounded p-2 flex gap-2 items-start"
                  >
                    {t.trend === "MIGLIORANDO" ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : t.trend === "PEGGIORANDO" ? (
                      <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2 text-[9px]">
                        <span className="font-bold text-white">{t.periodo}</span>
                        <span className="text-emerald-400 font-mono">
                          {t.percentualeAllineamento.toFixed(0)}% allineate
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-500 mt-0.5">
                        {t.numeroGareAllineate}/{t.numeroGarePartecipate} gare · margine medio{" "}
                        {t.margineRealizatoMedio.toFixed(1)}%
                      </div>
                      {t.motivazione && (
                        <div className="text-[8px] text-slate-400 mt-1">{t.motivazione}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-neutral-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-neutral-900 border border-neutral-700 text-white rounded hover:border-neutral-600 transition-colors"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={nicchie.length === 0 && aree.length === 0}
            className="cursor-pointer flex-1 text-[10px] font-bold px-3 py-1.5 bg-brand-gold text-black rounded hover:bg-yellow-400 disabled:opacity-50 transition-colors"
          >
            ✓ Salva profilo
          </button>
        </div>
      </div>
    </div>
  );
}
