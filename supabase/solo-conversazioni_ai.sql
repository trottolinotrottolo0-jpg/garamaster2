-- GaraMaster AI — SOLO tabella chat (se hai già eseguito il resto dello schema)
-- Supabase → SQL Editor → New query → Run

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
create policy "conversazioni_ai_select_own"
  on public.conversazioni_ai for select
  using (auth.uid() = user_id);

drop policy if exists "conversazioni_ai_insert_own" on public.conversazioni_ai;
create policy "conversazioni_ai_insert_own"
  on public.conversazioni_ai for insert
  with check (auth.uid() = user_id);

drop policy if exists "conversazioni_ai_update_own" on public.conversazioni_ai;
create policy "conversazioni_ai_update_own"
  on public.conversazioni_ai for update
  using (auth.uid() = user_id);
