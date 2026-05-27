-- Fix rapido: colonna scadenza_offerta mancante su `gare` (schema vecchio)
-- Esegui SOLO questo in Supabase SQL Editor, poi (opzionale) solo-daily-feed.sql

alter table public.gare
  add column if not exists scadenza_presentazione timestamptz,
  add column if not exists scadenza_offerta timestamptz,
  add column if not exists data_scadenza timestamptz,
  add column if not exists stato_pratica text default 'Nuova';

alter table public.gare_anac
  add column if not exists fit_score numeric;

create index if not exists gare_scadenza_offerta_idx on public.gare (scadenza_offerta);
create index if not exists gare_stato_pratica_idx on public.gare (stato_pratica);
create index if not exists gare_anac_fit_score_idx on public.gare_anac (fit_score);

-- Tabella feed "gare ANAC già viste" (se manca)
create table if not exists public.gare_anac_viste (
  user_id uuid not null references auth.users (id) on delete cascade,
  gare_anac_id uuid not null references public.gare_anac (id) on delete cascade,
  visto_at timestamptz not null default now(),
  primary key (user_id, gare_anac_id)
);

alter table public.gare_anac_viste enable row level security;

drop policy if exists "gare_anac_viste_select_own" on public.gare_anac_viste;
create policy "gare_anac_viste_select_own"
  on public.gare_anac_viste for select
  using (auth.uid() = user_id);

drop policy if exists "gare_anac_viste_insert_own" on public.gare_anac_viste;
create policy "gare_anac_viste_insert_own"
  on public.gare_anac_viste for insert
  with check (auth.uid() = user_id);

drop policy if exists "gare_anac_viste_delete_own" on public.gare_anac_viste;
create policy "gare_anac_viste_delete_own"
  on public.gare_anac_viste for delete
  using (auth.uid() = user_id);

-- Demo fit_score (scouting ANAC)
update public.gare_anac set fit_score = 72 where cig = 'DEMO0000001' and fit_score is null;
update public.gare_anac set fit_score = 68 where cig = 'DEMO0000002' and fit_score is null;
