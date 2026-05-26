const PLACEHOLDER_KEY = "YOUR_SUPABASE_ANON_KEY";

export function normalizeSupabaseKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  let normalized = key.trim().replace(/^["']|["']$/g, "");
  // Typo comune: Ysb_publishable_ → sb_publishable_
  if (normalized.startsWith("Ysb_publishable_")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

function buildUrlFromRef(ref: string): string {
  const clean = ref.trim().replace(/^https?:\/\//, "").replace(/\.supabase\.co\/?$/, "");
  return `https://${clean}.supabase.co`;
}

export function getSupabaseUrl(): string | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (url) return url;

  const ref = import.meta.env.VITE_SUPABASE_PROJECT_REF?.trim();
  if (ref) return buildUrlFromRef(ref);

  return undefined;
}

export function getSupabaseAnonKey(): string | undefined {
  const key = normalizeSupabaseKey(import.meta.env.VITE_SUPABASE_ANON_KEY);
  if (!key || key === PLACEHOLDER_KEY) return undefined;
  return key;
}

export function isValidSupabaseKeyFormat(key: string): boolean {
  return key.startsWith("eyJ") || key.startsWith("sb_publishable_");
}

export function getAuthRedirectUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL?.trim();
  const base = fromEnv || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/`;
}

export function getSupabaseConfigIssues(): string[] {
  const issues: string[] = [];
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url) {
    issues.push(
      "Manca l'URL Supabase. In .env.local usa VITE_SUPABASE_URL oppure VITE_SUPABASE_PROJECT_REF (Reference ID da Settings → General)."
    );
  }
  if (!key) issues.push("VITE_SUPABASE_ANON_KEY mancante o non valida in .env.local");
  if (key && !isValidSupabaseKeyFormat(key)) {
    issues.push(
      "La chiave Supabase non sembra valida. Copia la Publishable key (sb_publishable_...) o anon key (eyJ...) da Supabase → Settings → API Keys."
    );
  }
  return issues;
}

export const isSupabaseConfigured = Boolean(getSupabaseUrl() && getSupabaseAnonKey());
