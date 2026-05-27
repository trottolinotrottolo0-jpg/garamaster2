-- ═══════════════════════════════════════════════════════════════════════════
-- GaraMaster — AGGIORNAMENTI INCREMENTALI (progetto Supabase già esistente)
-- Esegui UNA volta in SQL Editor se hai già login + gare ma mancano feature recenti.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) CHAT SALVATA
create table if not exists public.conversazioni_ai (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  gara_id uuid,
  messages jsonb,
  created_at timestamptz default now()
);
create index if not exists conversazioni_ai_user_id_idx on public.conversazioni_ai (user_id);
create index if not exists conversazioni_ai_gara_id_idx on public.conversazioni_ai (gara_id);
alter table public.conversazioni_ai enable row level security;
drop policy if exists "conversazioni_ai_select_own" on public.conversazioni_ai;
create policy "conversazioni_ai_select_own" on public.conversazioni_ai for select using (auth.uid() = user_id);
drop policy if exists "conversazioni_ai_insert_own" on public.conversazioni_ai;
create policy "conversazioni_ai_insert_own" on public.conversazioni_ai for insert with check (auth.uid() = user_id);
drop policy if exists "conversazioni_ai_update_own" on public.conversazioni_ai;
create policy "conversazioni_ai_update_own" on public.conversazioni_ai for update using (auth.uid() = user_id);

-- 2) ALERT & DAILY FEED
alter table public.gare
  add column if not exists scadenza_offerta timestamptz,
  add column if not exists stato_pratica text default 'Nuova';

alter table public.gare_anac
  add column if not exists fit_score numeric;

create index if not exists gare_scadenza_offerta_idx on public.gare (scadenza_offerta);
create index if not exists gare_stato_pratica_idx on public.gare (stato_pratica);
create index if not exists gare_anac_fit_score_idx on public.gare_anac (fit_score);

create table if not exists public.gare_anac_viste (
  user_id uuid not null references auth.users (id) on delete cascade,
  gare_anac_id uuid not null references public.gare_anac (id) on delete cascade,
  visto_at timestamptz not null default now(),
  primary key (user_id, gare_anac_id)
);
alter table public.gare_anac_viste enable row level security;
drop policy if exists "gare_anac_viste_select_own" on public.gare_anac_viste;
create policy "gare_anac_viste_select_own" on public.gare_anac_viste for select using (auth.uid() = user_id);
drop policy if exists "gare_anac_viste_insert_own" on public.gare_anac_viste;
create policy "gare_anac_viste_insert_own" on public.gare_anac_viste for insert with check (auth.uid() = user_id);
drop policy if exists "gare_anac_viste_delete_own" on public.gare_anac_viste;
create policy "gare_anac_viste_delete_own" on public.gare_anac_viste for delete using (auth.uid() = user_id);

update public.gare_anac set fit_score = 72 where cig = 'DEMO0000001' and fit_score is null;
update public.gare_anac set fit_score = 68 where cig = 'DEMO0000002' and fit_score is null;

-- 3) HISTORICAL KNOWLEDGE LAYER
create table if not exists public.storico_gare_ai (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gara_id uuid,
  cig text,
  titolo_gara text,
  tipo_analisi text default 'chat',
  esito text,
  ribasso_offerto numeric,
  pattern_vincenti jsonb default '[]'::jsonb,
  note_ai text,
  created_at timestamptz not null default now()
);
create index if not exists storico_gare_ai_user_id_idx on public.storico_gare_ai (user_id);
create index if not exists storico_gare_ai_cig_idx on public.storico_gare_ai (cig);
create index if not exists storico_gare_ai_created_at_idx on public.storico_gare_ai (created_at desc);
alter table public.storico_gare_ai enable row level security;
drop policy if exists "storico_gare_ai_select_own" on public.storico_gare_ai;
create policy "storico_gare_ai_select_own" on public.storico_gare_ai for select using (auth.uid() = user_id);
drop policy if exists "storico_gare_ai_insert_own" on public.storico_gare_ai;
create policy "storico_gare_ai_insert_own" on public.storico_gare_ai for insert with check (auth.uid() = user_id);
drop policy if exists "storico_gare_ai_update_own" on public.storico_gare_ai;
create policy "storico_gare_ai_update_own" on public.storico_gare_ai for update using (auth.uid() = user_id);
drop policy if exists "storico_gare_ai_delete_own" on public.storico_gare_ai;
create policy "storico_gare_ai_delete_own" on public.storico_gare_ai for delete using (auth.uid() = user_id);

-- Fine — ROI, RTI, Preparazione offerta: NESSUNA tabella aggiuntiva oltre a storico_gare_ai
