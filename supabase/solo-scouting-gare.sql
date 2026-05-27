-- Scouting Gare — Fase 1 (preferenze utente + link documenti)
-- Esegui in Supabase SQL Editor DOPO fix-scadenza-offerta.sql / solo-daily-feed.sql

-- Link portale e disciplinare (Fase 3: sync documenti)
alter table public.gare_anac
  add column if not exists url_portale text,
  add column if not exists url_disciplinare text;

-- Stato scouting per utente: salvata | scartata | vista
create table if not exists public.gare_scouting_utente (
  user_id uuid not null references auth.users (id) on delete cascade,
  gare_anac_id uuid not null references public.gare_anac (id) on delete cascade,
  stato text not null default 'vista' check (stato in ('vista', 'salvata', 'scartata')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, gare_anac_id)
);

create index if not exists gare_scouting_utente_user_idx on public.gare_scouting_utente (user_id);
create index if not exists gare_scouting_utente_stato_idx on public.gare_scouting_utente (stato);

alter table public.gare_scouting_utente enable row level security;

drop policy if exists "gare_scouting_utente_select_own" on public.gare_scouting_utente;
create policy "gare_scouting_utente_select_own"
  on public.gare_scouting_utente for select
  using (auth.uid() = user_id);

drop policy if exists "gare_scouting_utente_insert_own" on public.gare_scouting_utente;
create policy "gare_scouting_utente_insert_own"
  on public.gare_scouting_utente for insert
  with check (auth.uid() = user_id);

drop policy if exists "gare_scouting_utente_update_own" on public.gare_scouting_utente;
create policy "gare_scouting_utente_update_own"
  on public.gare_scouting_utente for update
  using (auth.uid() = user_id);

drop policy if exists "gare_scouting_utente_delete_own" on public.gare_scouting_utente;
create policy "gare_scouting_utente_delete_own"
  on public.gare_scouting_utente for delete
  using (auth.uid() = user_id);

-- Documenti gara (Fase 3: download + parser automatico)
create table if not exists public.gare_documenti (
  id uuid primary key default gen_random_uuid(),
  gare_anac_id uuid references public.gare_anac (id) on delete cascade,
  gara_id uuid references public.gare (id) on delete cascade,
  tipo text not null default 'disciplinare',
  titolo text,
  url_esterna text,
  storage_path text,
  parsed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gare_documenti_anac_idx on public.gare_documenti (gare_anac_id);
create index if not exists gare_documenti_gara_idx on public.gare_documenti (gara_id);

alter table public.gare_documenti enable row level security;

drop policy if exists "gare_documenti_select_auth" on public.gare_documenti;
create policy "gare_documenti_select_auth"
  on public.gare_documenti for select
  to authenticated
  using (true);

-- Demo: link portale sulle gare demo (sostituire con URL reali in Fase 2 sync ANAC)
update public.gare_anac
set url_portale = coalesce(url_portale, 'https://www.anticorruzione.it/')
where cig in ('DEMO0000001', 'DEMO0000002');

-- Seed scouting AI demo (popola gare_scouting se vuota)
insert into public.gare_scouting (gare_anac_id, cig, score, summary, strategia, alert)
select
  ga.id,
  ga.cig,
  ga.fit_score,
  'Gara in linea con profilo edile regionale. Verificare classifica SOA richiesta.',
  'Valuta RTI se manca classifica; prepara offerta entro 3 settimane.',
  'Controllare penali e revisione prezzi nel disciplinare.'
from public.gare_anac ga
where ga.cig in ('DEMO0000001', 'DEMO0000002')
  and not exists (
    select 1 from public.gare_scouting gs where gs.cig = ga.cig
  );
