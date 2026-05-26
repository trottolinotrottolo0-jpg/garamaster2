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
