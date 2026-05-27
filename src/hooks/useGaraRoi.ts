import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanyProfile, TenderDocument } from "../types";
import type { ProfiloImpresaContext } from "../types/database";
import { fetchGaraRoi, type GaraRoiResult } from "../lib/garaRoiApi";
import { GENERAL_CHAT_TENDER } from "../lib/generalChatContext";
import { parseTenderImporto } from "../lib/tenderValue";

const PROFILE_KEY = "gm_company_profile";
const CACHE_KEY = "gm_gara_roi_cache";
const CACHE_TTL_MS = 10 * 60 * 1000;

function loadCompanyProfile(): CompanyProfile | null {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    return stored ? (JSON.parse(stored) as CompanyProfile) : null;
  } catch {
    return null;
  }
}

function cacheKey(tenderId: string, importo: number): string {
  return `${tenderId}:${importo}`;
}

function readCache(key: string): GaraRoiResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { key: string; at: number; data: GaraRoiResult };
    if (entry.key !== key || Date.now() - entry.at > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: GaraRoiResult): void {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: Date.now(), data }));
}

export function useGaraRoi(
  tender: TenderDocument,
  profilo: ProfiloImpresaContext | null,
  enabled = true
) {
  const [result, setResult] = useState<GaraRoiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const isGaraValid =
    enabled &&
    tender.id !== GENERAL_CHAT_TENDER.id &&
    parseTenderImporto(tender.value) > 0;

  const load = useCallback(async () => {
    if (!isGaraValid || inflight.current) return;

    const importo = parseTenderImporto(tender.value);
    const key = cacheKey(tender.id, importo);
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
      const data = await fetchGaraRoi({
        tender,
        profilo,
        companyProfile: loadCompanyProfile(),
      });
      writeCache(key, data);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calcolo ROI non riuscito");
      setResult(null);
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, [isGaraValid, tender, profilo?.id]);

  useEffect(() => {
    if (!isGaraValid) {
      setResult(null);
      setError(null);
      return;
    }
    load();
  }, [isGaraValid, load]);

  return { result, loading, error, refresh: load, isGaraValid };
}
