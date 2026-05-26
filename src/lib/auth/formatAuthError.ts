export function formatAuthError(err: unknown): string {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch") || msg.includes("network")) {
      return "Impossibile contattare Supabase. Avvia con npm run dev e apri http://localhost:3000 — verifica VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in .env.local.";
    }
  }

  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: string }).message);
    if (message.includes("Invalid login credentials")) {
      return "Email o password non corretti.";
    }
    if (message.includes("User already registered")) {
      return "Esiste già un account con questa email. Accedi o recupera la password.";
    }
    if (message.includes("Password should be at least")) {
      return "La password deve avere almeno 6 caratteri.";
    }
    if (message.includes("Unable to validate email")) {
      return "Indirizzo email non valido.";
    }
    if (message.includes("Email not confirmed")) {
      return "Conferma prima l'email (controlla la posta in arrivo).";
    }
    if (message.includes("provider is not enabled")) {
      return "Google OAuth non abilitato su Supabase. Vai in Authentication → Providers → Google.";
    }
    return message;
  }

  return "Operazione non riuscita. Riprova.";
}
