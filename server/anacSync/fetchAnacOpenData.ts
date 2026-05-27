import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAnacJsonPayload } from "./parseAnacRecords";
import type { AnacGaraRecord } from "./anacRecordTypes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_USER_AGENT = "GaraMasterAI/1.0 (+https://github.com/trottolinotrottolo0-jpg/garamaster2)";

async function fetchJson(url: string, timeoutMs = 120_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.ANAC_SYNC_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Download fallito (${response.status}): ${url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCkanResourceUrl(packageId: string): Promise<string> {
  const base =
    process.env.ANAC_CKAN_API_BASE?.trim() || "https://dati.anticorruzione.it/api/3/action";
  const showUrl = `${base}/package_show?id=${encodeURIComponent(packageId)}`;
  const data = (await fetchJson(showUrl, 60_000)) as {
    success?: boolean;
    result?: {
      resources?: Array<{ url?: string; format?: string; name?: string }>;
    };
  };

  const resources = data?.result?.resources ?? [];
  const jsonResource =
    resources.find((r) => String(r.format ?? "").toLowerCase() === "json") ??
    resources.find((r) => String(r.url ?? "").toLowerCase().endsWith(".json")) ??
    resources[0];

  if (!jsonResource?.url) {
    throw new Error(`Nessuna risorsa JSON trovata nel package CKAN: ${packageId}`);
  }

  return jsonResource.url;
}

async function loadExpandedDemoJson(): Promise<unknown> {
  const demoPath = path.resolve(__dirname, "../data/anac-expanded-demo.json");
  const raw = await fs.readFile(demoPath, "utf-8");
  return JSON.parse(raw) as unknown;
}

export async function fetchAnacRecords(params: {
  limit: number;
  preferDemoExpand?: boolean;
}): Promise<{ records: AnacGaraRecord[]; source: string; warnings: string[] }> {
  const warnings: string[] = [];
  const directUrl = process.env.ANAC_SYNC_JSON_URL?.trim();
  const packageId = process.env.ANAC_CKAN_PACKAGE_ID?.trim();
  const useDemoExpand = params.preferDemoExpand ?? process.env.ANAC_SYNC_USE_DEMO_EXPAND === "true";

  if (directUrl) {
    const payload = await fetchJson(directUrl);
    const { records, warnings: parseWarnings } = parseAnacJsonPayload(
      payload,
      `url:${directUrl}`,
      params.limit
    );
    return { records, source: `ANAC JSON URL`, warnings: [...warnings, ...parseWarnings] };
  }

  if (packageId) {
    const resourceUrl = await resolveCkanResourceUrl(packageId);
    warnings.push(`Risorsa CKAN: ${resourceUrl}`);
    const payload = await fetchJson(resourceUrl);
    const { records, warnings: parseWarnings } = parseAnacJsonPayload(
      payload,
      `ckan:${packageId}`,
      params.limit
    );
    return { records, source: `ANAC CKAN (${packageId})`, warnings: [...warnings, ...parseWarnings] };
  }

  if (useDemoExpand) {
    const payload = await loadExpandedDemoJson();
    const { records, warnings: parseWarnings } = parseAnacJsonPayload(
      payload,
      "demo-expanded",
      params.limit
    );
    warnings.push(
      "Modalità demo expand: imposta ANAC_SYNC_JSON_URL o ANAC_CKAN_PACKAGE_ID per dati reali."
    );
    return { records, source: "Demo catalogo ampliato", warnings: [...warnings, ...parseWarnings] };
  }

  throw new Error(
    "Sync ANAC non configurato. Imposta ANAC_SYNC_JSON_URL (URL JSON) oppure ANAC_CKAN_PACKAGE_ID in .env.local, oppure ANAC_SYNC_USE_DEMO_EXPAND=true per test."
  );
}
