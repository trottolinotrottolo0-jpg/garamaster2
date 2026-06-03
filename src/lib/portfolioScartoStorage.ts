const STORAGE_KEY = "gm_portfolio_scartate";

function readIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function isLocallyScartata(key: string): boolean {
  return readIds().has(key);
}

export function setLocalScartata(key: string, scartata: boolean): void {
  const ids = readIds();
  if (scartata) ids.add(key);
  else ids.delete(key);
  writeIds(ids);
}

export function listLocalScartateKeys(): string[] {
  return [...readIds()];
}
