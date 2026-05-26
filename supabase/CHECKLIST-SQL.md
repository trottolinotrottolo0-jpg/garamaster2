# Cosa fare su Supabase (SQL) — GaraMaster AI

## Regola veloce

| Situazione | Cosa eseguire |
|------------|----------------|
| **Progetto nuovo** (mai eseguito SQL) | Tutto `schema.sql` |
| **Progetto già attivo** (login ok) | `solo-aggiornamenti-completi.sql` **oppure** i file singoli sotto |

### Serve SQL? (feature recenti)

| Feature | SQL necessario? |
|---------|-----------------|
| Chat Gemini, ROI Calculator, RTI, Preparazione offerta | **No** — solo `GEMINI_API_KEY` |
| Parser Disciplinare (PDF → Gemini → gare) | **No** nuove tabelle — usa `gare` esistente + `GEMINI_API_KEY` |
| SOA Gap Forecasting | **No** nuove tabelle — `profili_impresa` + `storico_gare_ai` + `gare_anac` + `GEMINI_API_KEY` |
| Salva conversazione | **Sì** — tabella `conversazioni_ai` |
| Historical Knowledge Layer + Post-Gara Forensics | **Sì** — tabella `storico_gare_ai` |
| Alert & Daily Feed (scadenze, fit ANAC, urgenti) | **Sì** — colonne + `gare_anac_viste` |
| Profilo / login / lista gare demo | **Sì** — `schema.sql` (prima volta) |

---

## Opzione A — Progetto nuovo (consigliata la prima volta)

1. [Supabase Dashboard](https://supabase.com/dashboard) → tuo progetto  
2. **SQL Editor** → **New query**  
3. Apri nel repo: `supabase/schema.sql`  
4. **Copia tutto** → incolla → **Run**  
5. Attendi **Success**

Crea tutto: `profili_impresa`, `gare`, `gare_anac`, `gare_scouting`, `conversazioni_ai`, `gare_anac_viste`, trigger profilo, RLS, 2 gare demo.

**Già con schema base?** Esegui anche `supabase/solo-daily-feed.sql` per Alert & Daily Feed (`scadenza_offerta`, `stato_pratica`, `fit_score`).

---

## Opzione B — Hai già login e lista gare

Esegui **solo** se in **Table Editor** non vedi `conversazioni_ai`:

1. SQL Editor → New query  
2. Apri `supabase/solo-conversazioni_ai.sql`  
3. Run  

---

## Verifica dopo SQL (2 minuti)

In **Table Editor** devono esserci:

- [ ] `profili_impresa`
- [ ] `gare`
- [ ] `gare_anac` (con righe DEMO0000001 / DEMO0000002)
- [ ] `conversazioni_ai`
- [ ] `storico_gare_ai` (opzionale: Historical Knowledge Layer)

In **Authentication → Policies** (o RLS sulla tabella): policy attive su ogni tabella.

---

## Collegamento feature ↔ SQL

| Feature app | Tabella / SQL |
|-------------|----------------|
| Login | `auth.users` (automatico Supabase) |
| Profilo impresa | `profili_impresa` + trigger `on_auth_user_created` |
| Lista gare | `gare_anac` (+ `gare` se aggiungi gare utente) |
| Chat + system prompt | **Nessuna tabella** |
| Gara ROI Calculator | **Nessuna tabella** |
| RTI & Avvalimento | **Nessuna tabella** |
| Preparazione offerta guidata | **Nessuna tabella** (salvataggio usa `conversazioni_ai`) |
| Parser Disciplinare PDF | `gare` (requisiti, penali, scadenze, criterio) |
| Salva conversazione | `conversazioni_ai` |
| Historical Knowledge Layer | `storico_gare_ai` (esito, ribasso, pattern, note AI) |
| Alert & Daily Feed | `gare.scadenza_offerta`, `gare.stato_pratica`, `gare_anac.fit_score`, `gare_anac_viste` |

### File SQL nel repo

| File | Quando |
|------|--------|
| `schema.sql` | Progetto nuovo (tutto) |
| `solo-aggiornamenti-completi.sql` | Già hai Supabase, mancano chat + daily feed |
| `solo-conversazioni_ai.sql` | Solo salvataggio chat |
| `solo-daily-feed.sql` | Solo dashboard Alert & Daily Feed |
| `solo-storico-gare-ai.sql` | Solo Historical Knowledge Layer |

---

## Test app dopo SQL

1. `npm run dev` → http://localhost:3000  
2. **Registrati / login**  
3. Onboarding profilo (se compare) → salva  
4. Seleziona gara **DEMO0000002** → chat → invia messaggio  
5. Badge verde: **✓ Chat salvata su Supabase**  
6. Table Editor → `conversazioni_ai` → 1 riga con `messages`  

---

## Errori comuni

| Errore | Soluzione |
|--------|-----------|
| `relation "conversazioni_ai" does not exist` | Esegui `solo-conversazioni_ai.sql` |
| Salvataggio fallito / RLS | Riesegui le policy in `solo-conversazioni_ai.sql` |
| Lista gare vuota | Riesegui la parte demo in fondo a `schema.sql` (insert `gare_anac`) |
| Nessun profilo | Registrati di nuovo o inserisci riga in `profili_impresa` con il tuo `user_id` |

Per trovare il tuo `user_id`: **Authentication → Users** → copia UUID utente.
