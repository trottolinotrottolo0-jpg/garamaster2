import { Loader2 } from "lucide-react";
import { useGaraMaster } from "./context/GaraMasterContext";
import { AuthPage } from "./components/auth/AuthPage";
import { OnboardingPage } from "./components/auth/OnboardingPage";
import App from "./App";

export function AppGate() {
  const { supabaseConfigured, session, loading, profiloLoading, needsOnboarding } =
    useGaraMaster();

  if (supabaseConfigured && loading && !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-neutral-950 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
        <p className="text-sm">Caricamento sessione…</p>
      </div>
    );
  }

  if (supabaseConfigured && !session) {
    return <AuthPage />;
  }

  if (supabaseConfigured && session && profiloLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-neutral-950 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
        <p className="text-sm">Caricamento profilo impresa…</p>
      </div>
    );
  }

  if (supabaseConfigured && session && needsOnboarding) {
    return <OnboardingPage />;
  }

  return <App />;
}
