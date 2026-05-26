import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanyProfile, TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import { fetchPortfolioScore, type PortfolioScoreResult } from "../lib/portfolioScoreApi";
import { fetchGareForUser } from "../services/garaDataService";
import type { PortfolioGaraStorico } from "../types/portfolio";

const STORAGE_KEY = "gm_company_profile";
const CACHE_KEY = "gm_portfolio_score_cache";
const CACHE_TTL_MS = 15 * 60 * 1000;

function loadCompanyProfile(): CompanyProfile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CompanyProfile) : null;
  } catch {
    return null;
  }
}

function cacheKey(userId: string, tenderCount: number): string {
  return `${userId}:${tenderCount}`;
}

function readCache(key: string): PortfolioScoreResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as {
      key: string;
      at: number;
      data: PortfolioScoreResult;
    };
    if (entry.key !== key || Date.now() - entry.at > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: PortfolioScoreResult): void {
  sessionStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ key, at: Date.now(), data })
  );
}

function mapGareToStorico(
  rows: Awaited<ReturnType<typeof fetchGareForUser>>
): PortfolioGaraStorico[] {
  return rows.map((row) => ({
    cig: row.cig,
    titolo: row.titolo ?? row.oggetto,
    importo: row.importo,
    regione: row.regione,
    categoria_soa: row.categoria_soa,
    note: row.note,
    esito: null,
  }));
}

export function usePortfolioScore(
  userId: string | undefined,
  profilo: ProfiloImpresaContext | null,
  tenders: TenderDocument[],
  enabled = true
) {
  const [result, setResult] = useState<PortfolioScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || !userId || tenders.length === 0 || inflight.current) return;

    const key = cacheKey(userId, tenders.length);
    const cached = readCache(key);
    if (cached) {
      setResult(cached);
      setError(null);
      return;
    }

    inflight.current = true;
    setLoading(true);
    setError(null);

    try {
      const companyProfile = loadCompanyProfile();
      const gareUtente = await fetchGareForUser(userId);
      const gareStorico = mapGareToStorico(gareUtente);

      if (companyProfile && !gareStorico.length) {
        gareStorico.push({
          note: `Win rate storico impresa: ${companyProfile.avgWinRatePercent}% · ${companyProfile.historicalNotes || "Nessuna nota storica"}`,
          esito: "sintesi_locale",
        });
      }

      const data = await fetchPortfolioScore({
        profilo,
        companyProfile,
        tenders,
        gareStorico,
      });

      writeCache(key, data);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calcolo score non riuscito");
      setResult(null);
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, [enabled, userId, profilo?.id, tenders]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refresh: load };
}
