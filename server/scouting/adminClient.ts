import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseServiceRoleKey, resolveSupabaseUrl } from "../resolveSupabaseUrl";

export function getAdminClient() {
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY mancante in .env.local (necessaria per scouting server-side)."
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
