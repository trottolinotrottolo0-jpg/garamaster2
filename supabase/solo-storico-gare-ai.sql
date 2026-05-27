-- Historical Knowledge Layer — storico analisi AI per utente
-- Esegui in Supabase SQL Editor se il progetto esiste già.

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
create policy "storico_gare_ai_select_own"
  on public.storico_gare_ai for select
  using (auth.uid() = user_id);

drop policy if exists "storico_gare_ai_insert_own" on public.storico_gare_ai;
create policy "storico_gare_ai_insert_own"
  on public.storico_gare_ai for insert
  with check (auth.uid() = user_id);

drop policy if exists "storico_gare_ai_update_own" on public.storico_gare_ai;
create policy "storico_gare_ai_update_own"
  on public.storico_gare_ai for update
  using (auth.uid() = user_id);

drop policy if exists "storico_gare_ai_delete_own" on public.storico_gare_ai;
create policy "storico_gare_ai_delete_own"
  on public.storico_gare_ai for delete
  using (auth.uid() = user_id);
