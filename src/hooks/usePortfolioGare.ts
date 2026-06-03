import { useCallback, useEffect, useMemo, useState } from "react";
import { buildPortfolioGare, sortByFit } from "../lib/fitScore";
import { sortByConvenienza } from "../lib/convenienzaScore";
import { sortByCarico } from "../lib/caricoScore";
import { sortByMargine } from "../lib/margineScore";
import { readCompanyProfileFromStorage, sortByRisk } from "../lib/riskScore";
import { sortByUrgency } from "../lib/urgencyScore";
import { sortByScoreSintetico } from "../lib/scoring";
import {
  filterByVistaApprofondire,
  filterByVistaOggi,
  filterByVistaScartare,
} from "../lib/portfolioVista";
import { buildDiscardCandidates } from "../lib/discardFilter";
import { buildApprofondireCandidates } from "../lib/approfondireFilter";
import {
  fetchGareForUser,
  fetchScoutingByCig,
  persistPortfolioScores,
  setGaraScartata,
} from "../services/garaDataService";
import type { Gara, PortfolioSortMode, PortfolioViewMode } from "../types/gara";
import type { ProfiloImpresaContext } from "../types/database";
import type { TenderDocument } from "../types";

export function usePortfolioGare(
  userId: string | undefined,
  profilo: ProfiloImpresaContext | null,
  tenders: TenderDocument[]
) {
  const [gare, setGare] = useState<Gara[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<PortfolioSortMode>("fit_desc");
  const [viewMode, setViewMode] = useState<PortfolioViewMode>("all");
  const [showScartate, setShowScartate] = useState(false);
  const [scartoError, setScartoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const gareUtente = userId ? await fetchGareForUser(userId) : [];
      const cigs = [
        ...new Set([
          ...gareUtente.map((g) => g.cig).filter(Boolean) as string[],
          ...tenders.map((t) => t.cig).filter(Boolean),
        ]),
      ];
      const scoutingMap = await fetchScoutingByCig(cigs);
      const company = readCompanyProfileFromStorage();
      const built = buildPortfolioGare(profilo, tenders, gareUtente, scoutingMap, company);
      setGare(built);
      if (userId) {
        void persistPortfolioScores(userId, built).catch((err) => {
          console.warn("[GaraMaster] persist portfolio:", err);
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore caricamento portfolio gare";
      setError(message);
      setGare(
        buildPortfolioGare(profilo, tenders, [], new Map(), readCompanyProfileFromStorage())
      );
    } finally {
      setLoading(false);
    }
  }, [userId, profilo, tenders]);

  useEffect(() => {
    void load();
  }, [load]);

  const gareAttive = useMemo(() => gare.filter((g) => !g.scartata), [gare]);
  const gareScartate = useMemo(() => gare.filter((g) => g.scartata), [gare]);

  const gareDaGuardareOggi = useMemo(() => filterByVistaOggi(gareAttive), [gareAttive]);

  const discardCandidates = useMemo(() => {
    const byVista = filterByVistaScartare(gare);
    return buildDiscardCandidates(byVista, profilo);
  }, [gare, profilo]);

  const approfondireCandidates = useMemo(() => {
    const byVista = filterByVistaApprofondire(gareAttive);
    const fromVista = buildApprofondireCandidates(byVista, profilo);
    if (fromVista.length > 0) return fromVista;
    return buildApprofondireCandidates(gareAttive, profilo);
  }, [gareAttive, profilo]);

  const displayedGare = useMemo(() => {
    if (sortMode === "fit_desc") return sortByFit(gareAttive);
    if (sortMode === "urgency_desc") return sortByUrgency(gareAttive);
    if (sortMode === "risk_asc") return sortByRisk(gareAttive, "asc");
    if (sortMode === "risk_desc") return sortByRisk(gareAttive, "desc");
    if (sortMode === "margine_desc") return sortByMargine(gareAttive);
    if (sortMode === "carico_asc") return sortByCarico(gareAttive, "asc");
    if (sortMode === "carico_desc") return sortByCarico(gareAttive, "desc");
    if (sortMode === "convenienza_desc") return sortByConvenienza(gareAttive);
    if (sortMode === "score_sintetico_desc") return sortByScoreSintetico(gareAttive);
    return gareAttive;
  }, [gareAttive, sortMode]);

  const confirmScarto = useCallback(
    async (gara: Gara) => {
      if (!userId) return;
      setScartoError(null);
      try {
        await setGaraScartata(userId, gara, true);
        setGare((prev) =>
          prev.map((g) =>
            g.listId === gara.listId || (g.id === gara.id && g.source === gara.source)
              ? { ...g, scartata: true, vista_portfolio: "scartare" as const }
              : g
          )
        );
      } catch (err) {
        setScartoError(err instanceof Error ? err.message : "Errore conferma scarto");
        throw err;
      }
    },
    [userId]
  );

  const restoreScarto = useCallback(
    async (gara: Gara) => {
      if (!userId) return;
      setScartoError(null);
      try {
        await setGaraScartata(userId, gara, false);
        setGare((prev) =>
          prev.map((g) => {
            if (g.listId !== gara.listId && !(g.id === gara.id && g.source === gara.source)) {
              return g;
            }
            const score = g.score_sintetico;
            const vista =
              score >= 75 ? "oggi" : score >= 40 ? "approfondire" : "scartare";
            return { ...g, scartata: false, vista_portfolio: vista };
          })
        );
      } catch (err) {
        setScartoError(err instanceof Error ? err.message : "Errore ripristino gara");
        throw err;
      }
    },
    [userId]
  );

  return {
    gare,
    gareAttive,
    displayedGare,
    gareDaGuardareOggi,
    watchTodayCount: gareDaGuardareOggi.length,
    discardCandidates,
    discardCount: discardCandidates.length,
    approfondireCandidates,
    approfondireCount: approfondireCandidates.length,
    gareScartate,
    showScartate,
    setShowScartate,
    confirmScarto,
    restoreScarto,
    scartoError,
    loading,
    error,
    sortMode,
    setSortMode,
    viewMode,
    setViewMode,
    refresh: load,
  };
}
