import { useState, type FormEvent } from "react";
import { Briefcase, Loader2, ShieldCheck } from "lucide-react";
import { useGaraMaster } from "../../context/GaraMasterContext";

export function OnboardingPage() {
  const { user, profilo, completeOnboarding } = useGaraMaster();
  const [ragioneSociale, setRagioneSociale] = useState(profilo?.ragioneSociale ?? "");
  const [partitaIva, setPartitaIva] = useState("");
  const [soaPrevalente, setSoaPrevalente] = useState("");
  const [regioniText, setRegioniText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const regioni = regioniText
        .split(/[,;|]/)
        .map((r) => r.trim())
        .filter(Boolean);

      await completeOnboarding({
        ragioneSociale: ragioneSociale.trim(),
        partitaIva: partitaIva.trim() || undefined,
        soaPrevalente: soaPrevalente.trim() || undefined,
        regioni: regioni.length ? regioni : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio non riuscito");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex min-h-screen w-full flex-col items-center justify-center overflow-y-auto bg-neutral-950 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/95 p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold/10 border border-brand-gold/30">
            <Briefcase className="h-7 w-7 text-brand-gold" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white tracking-tight">Profilo impresa</h1>
          <p className="mt-2 text-sm text-slate-400">
            Completa i dati aziendali collegati al tuo account Supabase.
          </p>
          {user?.email && (
            <p className="mt-1 text-xs text-slate-500 font-mono">{user.email}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ragione sociale *
            </span>
            <input
              type="text"
              required
              value={ragioneSociale}
              onChange={(e) => setRagioneSociale(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
              placeholder="Impresa Edile S.r.l."
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Partita IVA
            </span>
            <input
              type="text"
              value={partitaIva}
              onChange={(e) => setPartitaIva(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
              placeholder="12345678901"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              SOA prevalente
            </span>
            <input
              type="text"
              value={soaPrevalente}
              onChange={(e) => setSoaPrevalente(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
              placeholder="OG1 Classifica III"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Regioni operative
            </span>
            <input
              type="text"
              value={regioniText}
              onChange={(e) => setRegioniText(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-gold focus:outline-none"
              placeholder="Lombardia, Veneto, Lazio"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gold px-4 py-2.5 text-sm font-bold text-neutral-950 transition hover:bg-yellow-400 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {submitting ? "Salvataggio…" : "Salva e continua"}
          </button>
        </form>
      </div>
    </div>
  );
}
