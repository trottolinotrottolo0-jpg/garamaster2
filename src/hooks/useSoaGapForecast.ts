import { useCallback, useEffect, useRef, useState } from "react";
import { buildSoaGapForecastPayload } from "../lib/soaGapForecastContext";
import { fetchSoaGapForecast } from "../lib/soaGapForecastApi";
import { listStoricoGareAi } from "../services/storicoGareService";
import type { TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import type { SoaGapForecastResult } from "../types/soaGapForecast";

const CACHE_KEY = "gm_soa_gap_forecast_cache";
const CACHE_TTL_MS = 20 * 60 * 1000;

function cacheKey(userId: string, tenderCount: number, storicoCount: number): string {
  return `${userId}:${tenderCount}:${storicoCount}`;
}

function readCache(key: string): SoaGapForecastResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { key: string; at: number; data: SoaGapForecastResult };
    if (entry.key !== key || Date.now() - entry.at > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: SoaGapForecastResult): void {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: Date.now(), data }));
}

export function useSoaGapForecast(
  userId: string | undefined,
  profilo: ProfiloImpresaContext | null,
  tenders: TenderDocument[],
  enabled = true,
  autoLoad = true
) {
  const [result, setResult] = useState<SoaGapForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const refresh = useCallback(
    async (force = false) => {
      if (!userId || !enabled) return;

      const anacCount = tenders.filter((t) => t.id.startsWith("gare_anac-")).length;
      if (anacCount === 0 && !profilo?.soa) {
        setError("Carica il profilo SOA e il catalogo gare ANAC per il forecast.");
        return;
      }

      const id = ++runId.current;
      setLoading(true);
      setError(null);

      try {
        const storico = await listStoricoGareAi(userId, 50);
        const key = cacheKey(userId, tenders.length, storico.length);

        if (!force) {
          const cached = readCache(key);
          if (cached) {
            setResult(cached);
            setLoading(false);
            return;
          }
        }

        const payload = buildSoaGapForecastPayload({ profilo, storico, tenders });
        const forecast = await fetchSoaGapForecast(payload);

        if (id !== runId.current) return;

        writeCache(key, forecast);
        setResult(forecast);
      } catch (e) {
        if (id !== runId.current) return;
        setError(e instanceof Error ? e.message : "Errore forecast SOA");
      } finally {
        if (id === runId.current) setLoading(false);
      }
    },
    [userId, profilo, tenders, enabled]
  );

  useEffect(() => {
    if (enabled && autoLoad && userId) void refresh(false);
  }, [enabled, autoLoad, userId, refresh]);

  return { result, loading, error, refresh };
}
