import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./config";

export { getAuthRedirectUrl, getSupabaseConfigIssues, isSupabaseConfigured } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;

  const supabaseUrl = getSupabaseUrl()!;
  const supabaseAnonKey = getSupabaseAnonKey()!;

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

export async function checkSupabaseConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) {
    return { ok: false, message: "Supabase non configurato in .env.local" };
  }

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
    });

    if (response.ok) {
      return { ok: true, message: "Supabase raggiungibile" };
    }

    return {
      ok: false,
      message: `Supabase ha risposto con errore ${response.status}. Verifica URL e chiave API.`,
    };
  } catch {
    return {
      ok: false,
      message: `L'URL del progetto non è raggiungibile: ${url}\n\nIl dominio non risolve (DNS). Apri Supabase Dashboard → il tuo progetto → Settings → API e copia il Project URL esatto in .env.local come VITE_SUPABASE_URL.\n\nControlla anche che il progetto non sia in pausa o eliminato.`,
    };
  }
}
