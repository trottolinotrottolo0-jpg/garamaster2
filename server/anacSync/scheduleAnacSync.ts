import { runAnacSync } from "./runAnacSync";

let syncInProgress = false;

export function scheduleAnacSync(): void {
  const minutes = Number(process.env.ANAC_SYNC_INTERVAL_MINUTES);
  if (!minutes || minutes <= 0) return;

  const intervalMs = minutes * 60 * 1000;
  console.log(`[ANAC sync] Scheduler attivo ogni ${minutes} minuti`);

  const tick = async () => {
    if (syncInProgress) {
      console.warn("[ANAC sync] Sync precedente ancora in corso, skip.");
      return;
    }
    syncInProgress = true;
    try {
      await runAnacSync();
    } catch (error) {
      console.error(
        "[ANAC sync] Scheduler errore:",
        error instanceof Error ? error.message : error
      );
    } finally {
      syncInProgress = false;
    }
  };

  setTimeout(() => void tick(), 15_000);
  setInterval(() => void tick(), intervalMs);
}
