import { buildSoaGapForecastPayload } from "./soaGapForecastContext";
import type { SoaGapForecastResult } from "../types/soaGapForecast";

export type SoaGapForecastPayload = ReturnType<typeof buildSoaGapForecastPayload>;

export async function fetchSoaGapForecast(
  payload: SoaGapForecastPayload
): Promise<SoaGapForecastResult> {
  const response = await fetch("/api/soa-gap-forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Forecast SOA non disponibile.");
  }

  return data as SoaGapForecastResult;
}
