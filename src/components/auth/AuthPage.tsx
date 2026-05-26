import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Briefcase, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useGaraMaster } from "../../context/GaraMasterContext";
import { formatAuthError } from "../../lib/auth/formatAuthError";
import {
  checkSupabaseConnection,
  getSupabaseConfigIssues,
} from "../../lib/supabase/client";

type AuthMode = "login" | "register" | "forgot";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthPage() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useGaraMaster();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [configIssues] = useState(() => getSupabaseConfigIssues());
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (configIssues.length > 0) return;
    checkSupabaseConnection().then((result) => {
      if (!result.ok) setConnectionStatus(result.message);
    });
  }, [configIssues.length]);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const switchMode = (next: AuthMode) => {
    resetMessages();
    setMode(next);
  };

  const googleOAuthReady = import.meta.env.VITE_ENABLE_GOOGLE_OAUTH === "true";

  const handleGoogle = async () => {
    resetMessages();
    if (!googleOAuthReady) {
      setInfo(
        "Continua con Google sarà attivo dopo la configurazione in Supabase (Authentication → Providers). Per ora usa email e password."
      );
      return;
    }
    setOauthLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      if (mode === "forgot") {
        await resetPassword(email.trim());
        setInfo("Link di recupero inviato. Controlla la tua email.");
        return;
      }

      if (mode === "register") {
        if (password.length < 6) {
          setError("La password deve avere almeno 6 caratteri.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Le password non coincidono.");
          return;
        }

        const result = await signUp(email.trim(), password, {
          ragioneSociale: ragioneSociale.trim() || undefined,
        });

        if (result.needsEmailConfirmation) {
          setInfo(
            "Registrazione completata. Controlla la email per confermare l'account, poi accedi."
          );
          setMode("login");
          setPassword("");
          setConfirmPassword("");
          return;
        }

        setInfo("Account creato. Accesso in corso…");
        return;
      }

      await signIn(email.trim(), password);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "login" ? "Accedi" : mode === "register" ? "Crea account" : "Recupera password";

  const subtitle =
    mode === "login"
      ? "Accedi con email per caricare profilo impresa e gare."
      : mode === "register"
        ? "Registra la tua impresa edile e collega i dati Supabase."
        : "Ti invieremo un link per reimpostare la password.";

  return (
    <AuthLayout>
      {configIssues.length > 0 && (
        <div className="mb-4 w-full max-w-md rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {configIssues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}

      {connectionStatus && (
        <div className="mb-4 w-full max-w-md rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200 whitespace-pre-line">
          {connectionStatus}
        </div>
      )}

      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/95 p-8 shadow-2xl backdrop-blur-sm">
        <header className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold/10 border border-brand-gold/30">
            <Briefcase className="h-7 w-7 text-brand-gold" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white tracking-tight">GaraMaster AI</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold mt-1">
            Copilota gare pubbliche
          </p>
        </header>

        {mode !== "forgot" && (
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-neutral-900 p-1 border border-neutral-800">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition ${
                mode === "login"
                  ? "bg-brand-gold text-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition ${
                mode === "register"
                  ? "bg-brand-gold text-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Registrati
            </button>
          </div>
        )}

        <h2 className="mt-6 text-lg font-semibold text-white text-center">{title}</h2>
        <p className="mt-1 text-sm text-slate-400 text-center">{subtitle}</p>

        {mode !== "forgot" && (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={oauthLoading || submitting}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-700 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:opacity-60"
            >
              {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
              Continua con Google
            </button>
            <AuthDivider />
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ragione sociale (opzionale)
              </span>
              <input
                type="text"
                value={ragioneSociale}
                onChange={(e) => setRagioneSociale(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
                placeholder="Impresa Edile S.r.l."
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
              placeholder="nome@impresa.it"
            />
          </label>

          {mode !== "forgot" && (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
              <input
                type="password"
                required
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
                placeholder="••••••••"
              />
            </label>
          )}

          {mode === "register" && (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Conferma password
              </span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
                placeholder="••••••••"
              />
            </label>
          )}

          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {info && (
            <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || oauthLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gold px-4 py-2.5 text-sm font-bold text-neutral-950 transition hover:bg-yellow-400 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "forgot" ? (
              <Mail className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {submitting
              ? "Attendere…"
              : mode === "login"
                ? "Accedi con email"
                : mode === "register"
                  ? "Crea account"
                  : "Invia link recupero"}
          </button>
        </form>

        <footer className="mt-5 flex flex-col items-center gap-2 text-center text-xs text-slate-500">
          {mode === "login" && (
            <>
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="text-brand-gold hover:underline"
              >
                Password dimenticata?
              </button>
              <p>
                Non hai un account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="text-brand-gold hover:underline font-semibold"
                >
                  Registrati gratis
                </button>
              </p>
            </>
          )}
          {mode === "register" && (
            <p>
              Hai già un account?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-brand-gold hover:underline font-semibold"
              >
                Accedi
              </button>
            </p>
          )}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-brand-gold hover:underline"
            >
              ← Torna al login
            </button>
          )}
        </footer>

        <p className="mt-6 text-center text-[11px] text-slate-500">
          Auth Supabase · Google OAuth · profili_impresa · gare · gare_anac
        </p>
      </div>
    </AuthLayout>
  );
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex min-h-screen w-full flex-col items-center justify-center overflow-y-auto bg-neutral-950 px-4 py-8">
      {children}
    </div>
  );
}

function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-neutral-800" />
      <span className="text-[10px] uppercase tracking-widest text-slate-500">oppure email</span>
      <div className="h-px flex-1 bg-neutral-800" />
    </div>
  );
}
