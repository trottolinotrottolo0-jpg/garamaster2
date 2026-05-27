export function resolveSupabaseUrl(): string | undefined {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (url?.trim()) return url.trim();

  const ref = process.env.VITE_SUPABASE_PROJECT_REF ?? process.env.SUPABASE_PROJECT_REF;
  if (ref?.trim()) {
    const clean = ref.trim().replace(/^https?:\/\//, "").replace(/\.supabase\.co\/?$/, "");
    return `https://${clean}.supabase.co`;
  }

  return undefined;
}

export function resolveSupabaseAnonKey(): string | undefined {
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!key?.trim()) return undefined;
  let normalized = key.trim().replace(/^["']|["']$/g, "");
  if (normalized.startsWith("Ysb_publishable_")) normalized = normalized.slice(1);
  return normalized;
}

const PLACEHOLDER_SERVICE_KEYS = new Set([
  "YOUR_SUPABASE_SERVICE_ROLE_KEY",
  "your_supabase_service_role_key",
]);

/** Chiave service role — solo server (sync ANAC, job admin). Non esporre al client. */
export function resolveSupabaseServiceRoleKey(): string | undefined {
  const raw =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!raw?.trim()) return undefined;
  let key = raw.trim().replace(/^["']|["']$/g, "");
  if (PLACEHOLDER_SERVICE_KEYS.has(key)) return undefined;
  return key;
}
