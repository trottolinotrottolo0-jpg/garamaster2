import type { GaraSimilareHistorica } from "../types";

export async function fetchHistoricalGareData(): Promise<GaraSimilareHistorica[]> {
  const response = await fetch("/api/market-intelligence/historical");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Errore caricamento storico gare."
    );
  }
  return data as GaraSimilareHistorica[];
}
