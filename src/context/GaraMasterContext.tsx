import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getAuthRedirectUrl, getSupabaseClient, isSupabaseConfigured } from "../lib/supabase/client";
import { isProfiloIncomplete } from "../lib/supabase/mappers";
import {
  saveProfiloOnboarding,
  fetchProfiloImpresa,
  loadGareCatalog,
} from "../services/garaDataService";
import { fetchDailyFeed } from "../services/dailyFeedService";
import type { DailyFeedData } from "../types/dailyFeed";
import { mockTenders } from "../mockData";
import type { GaraListItem, ProfiloImpresaContext, ProfiloOnboardingInput } from "../types/database";
import type { TenderDocument } from "../types";

type GaraMasterContextValue = {
  supabaseConfigured: boolean;
  session: Session | null;
  user: User | null;
  profilo: ProfiloImpresaContext | null;
  needsOnboarding: boolean;
  profiloLoading: boolean;
  gareItems: GaraListItem[];
  gare: TenderDocument[];
  loading: boolean;
  dataError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    options?: { ragioneSociale?: string }
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshData: () => Promise<void>;
  completeOnboarding: (input: ProfiloOnboardingInput) => Promise<void>;
  dailyFeed: DailyFeedData | null;
  dailyFeedLoading: boolean;
  dailyFeedError: string | null;
  refreshDailyFeed: () => Promise<void>;
};

const GaraMasterContext = createContext<GaraMasterContextValue | null>(null);

export function GaraMasterProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profilo, setProfilo] = useState<ProfiloImpresaContext | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profiloLoading, setProfiloLoading] = useState(false);
  const [gareItems, setGareItems] = useState<GaraListItem[]>([]);
  const [gare, setGare] = useState<TenderDocument[]>(mockTenders);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dailyFeed, setDailyFeed] = useState<DailyFeedData | null>(null);
  const [dailyFeedLoading, setDailyFeedLoading] = useState(false);
  const [dailyFeedError, setDailyFeedError] = useState<string | null>(null);

  const loadGare = useCallback(async (userId: string) => {
    const catalog = await loadGareCatalog(userId);
    if (catalog.tenders.length > 0) {
      setGare(catalog.tenders);
      setGareItems(catalog.items);
    } else {
      setGare(mockTenders);
      setGareItems([]);
    }
  }, []);

  const loadProfilo = useCallback(async (userId: string, email?: string | null) => {
    const profiloData = await fetchProfiloImpresa(userId);

    if (!profiloData) {
      console.log("[GaraMaster] Onboarding richiesto — profilo assente per user_id:", userId);
      setProfilo(null);
      setNeedsOnboarding(true);
      return null;
    }

    if (profiloData.userId !== userId) {
      throw new Error("Profilo impresa: user_id non corrisponde a auth.user.id");
    }

    const incomplete = isProfiloIncomplete(profiloData);
    setProfilo(profiloData);
    setNeedsOnboarding(incomplete);

    if (incomplete) {
      console.log("[GaraMaster] Onboarding richiesto — profilo incompleto:", profiloData);
    } else {
      console.log("[GaraMaster] Context profilo aggiornato:", profiloData);
    }

    return profiloData;
  }, []);

  const loadDailyFeed = useCallback(async (userId: string) => {
    setDailyFeedLoading(true);
    setDailyFeedError(null);
    try {
      const feed = await fetchDailyFeed(userId);
      setDailyFeed(feed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore caricamento daily feed";
      console.warn("[GaraMaster] daily feed:", message);
      setDailyFeedError(message);
    } finally {
      setDailyFeedLoading(false);
    }
  }, []);

  const refreshDailyFeed = useCallback(async () => {
    if (!session?.user?.id) return;
    await loadDailyFeed(session.user.id);
  }, [loadDailyFeed, session?.user?.id]);

  const loadUserData = useCallback(
    async (userId: string, email?: string | null) => {
      setDataError(null);
      setProfiloLoading(true);

      try {
        console.log("[GaraMaster] loadUserData — auth.user.id:", userId, "email:", email);
        await loadProfilo(userId, email);
        await loadGare(userId);
        await loadDailyFeed(userId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore caricamento dati";
        console.error("[GaraMaster] loadUserData fallito:", message);
        setDataError(message);
        setGare(mockTenders);
        setNeedsOnboarding(false);
      } finally {
        setProfiloLoading(false);
      }
    },
    [loadGare, loadProfilo, loadDailyFeed]
  );

  const refreshData = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    await loadUserData(session.user.id, session.user.email);
    setLoading(false);
  }, [loadUserData, session?.user?.id, session?.user?.email]);

  const completeOnboarding = useCallback(
    async (input: ProfiloOnboardingInput) => {
      if (!session?.user?.id) throw new Error("Sessione non valida");

      const created = await saveProfiloOnboarding(
        session.user.id,
        session.user.email ?? "",
        input
      );

      if (created.userId !== session.user.id) {
        throw new Error("Profilo creato con user_id errato");
      }

      setProfilo(created);
      setNeedsOnboarding(false);
      console.log("[GaraMaster] Onboarding completato, profilo in context:", created);

      await loadGare(session.user.id);
    },
    [loadGare, session?.user?.id, session?.user?.email]
  );

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfilo(null);
      setNeedsOnboarding(false);
      if (!isSupabaseConfigured) {
        fetchDailyFeed("demo").then(setDailyFeed).catch(() => undefined);
        return;
      }
      setGare(mockTenders);
      setGareItems([]);
      setDailyFeed(null);
      return;
    }

    loadUserData(session.user.id, session.user.email);
  }, [session?.user?.id, session?.user?.email, loadUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase non configurato");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, options?: { ragioneSociale?: string }) => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase non configurato");

      const redirectTo = getAuthRedirectUrl();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: options?.ragioneSociale
            ? { ragione_sociale: options.ragioneSociale }
            : undefined,
        },
      });
      if (error) throw error;
      return { needsEmailConfirmation: !data.session };
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase non configurato");

    const redirectTo = getAuthRedirectUrl();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase non configurato");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl(),
    });

    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    setProfilo(null);
    setNeedsOnboarding(false);
    setGare(mockTenders);
    setGareItems([]);
    setDailyFeed(null);
    setDailyFeedError(null);
  }, []);

  const value = useMemo(
    () => ({
      supabaseConfigured: isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      profilo,
      needsOnboarding,
      profiloLoading,
      gareItems,
      gare,
      loading,
      dataError,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      refreshData,
      completeOnboarding,
      dailyFeed,
      dailyFeedLoading,
      dailyFeedError,
      refreshDailyFeed,
    }),
    [
      session,
      profilo,
      needsOnboarding,
      profiloLoading,
      gareItems,
      gare,
      loading,
      dataError,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      signOut,
      refreshData,
      completeOnboarding,
      dailyFeed,
      dailyFeedLoading,
      dailyFeedError,
      refreshDailyFeed,
    ]
  );

  return <GaraMasterContext.Provider value={value}>{children}</GaraMasterContext.Provider>;
}

export function useGaraMaster(): GaraMasterContextValue {
  const ctx = useContext(GaraMasterContext);
  if (!ctx) throw new Error("useGaraMaster deve essere usato dentro GaraMasterProvider");
  return ctx;
}
