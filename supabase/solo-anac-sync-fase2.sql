-- Fase 2: Import/sync gare ANAC (upsert per CIG, metadati sync)
-- Esegui dopo solo-scouting-gare.sql

alter table public.gare_anac
  add column if not exists ocid text,
  add column if not exists source_dataset text,
  add column if not exists synced_at timestamptz,
  add column if not exists raw_meta jsonb default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Pulizia CIG duplicati (es. DEMO0000001 inserito più volte)
-- Subquery inline: compatibile con Supabase (commit per statement, no temp table)
-- ---------------------------------------------------------------------------
delete from public.gare_anac_viste v
using (
  select id as old_id, keeper_id
  from (
    select
      id,
      first_value(id) over (
        partition by trim(cig)
        order by created_at desc nulls last, id desc
      ) as keeper_id
    from public.gare_anac
    where cig is not null and trim(cig) <> ''
  ) ranked
  where id <> keeper_id
) d
where v.gare_anac_id = d.old_id
  and exists (
    select 1 from public.gare_anac_viste v2
    where v2.user_id = v.user_id and v2.gare_anac_id = d.keeper_id
  );

update public.gare_anac_viste v
set gare_anac_id = d.keeper_id
from (
  select id as old_id, keeper_id
  from (
    select
      id,
      first_value(id) over (
        partition by trim(cig)
        order by created_at desc nulls last, id desc
      ) as keeper_id
    from public.gare_anac
    where cig is not null and trim(cig) <> ''
  ) ranked
  where id <> keeper_id
) d
where v.gare_anac_id = d.old_id;

delete from public.gare_scouting_utente u
using (
  select id as old_id, keeper_id
  from (
    select
      id,
      first_value(id) over (
        partition by trim(cig)
        order by created_at desc nulls last, id desc
      ) as keeper_id
    from public.gare_anac
    where cig is not null and trim(cig) <> ''
  ) ranked
  where id <> keeper_id
) d
where u.gare_anac_id = d.old_id
  and exists (
    select 1 from public.gare_scouting_utente u2
    where u2.user_id = u.user_id and u2.gare_anac_id = d.keeper_id
  );

update public.gare_scouting_utente u
set gare_anac_id = d.keeper_id
from (
  select id as old_id, keeper_id
  from (
    select
      id,
      first_value(id) over (
        partition by trim(cig)
        order by created_at desc nulls last, id desc
      ) as keeper_id
    from public.gare_anac
    where cig is not null and trim(cig) <> ''
  ) ranked
  where id <> keeper_id
) d
where u.gare_anac_id = d.old_id;

update public.gare_scouting gs
set gare_anac_id = d.keeper_id
from (
  select id as old_id, keeper_id
  from (
    select
      id,
      first_value(id) over (
        partition by trim(cig)
        order by created_at desc nulls last, id desc
      ) as keeper_id
    from public.gare_anac
    where cig is not null and trim(cig) <> ''
  ) ranked
  where id <> keeper_id
) d
where gs.gare_anac_id = d.old_id;

delete from public.gare_anac g
using (
  select id as old_id
  from (
    select
      id,
      first_value(id) over (
        partition by trim(cig)
        order by created_at desc nulls last, id desc
      ) as keeper_id
    from public.gare_anac
    where cig is not null and trim(cig) <> ''
  ) ranked
  where id <> keeper_id
) d
where g.id = d.old_id;

-- CIG univoco per upsert (ignora righe senza CIG)
drop index if exists public.gare_anac_cig_unique_idx;
create unique index gare_anac_cig_unique_idx
  on public.gare_anac (cig)
  where cig is not null and trim(cig) <> '';

create index if not exists gare_anac_synced_at_idx on public.gare_anac (synced_at desc);
create index if not exists gare_anac_regione_idx on public.gare_anac (regione);
create index if not exists gare_anac_categoria_idx on public.gare_anac (categoria);

-- Log sync (opzionale, per dashboard admin)
create table if not exists public.anac_sync_log (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null,
  status text not null default 'running',
  imported_count int not null default 0,
  updated_count int not null default 0,
  error_message text,
  meta jsonb default '{}'::jsonb
);

alter table public.anac_sync_log enable row level security;

drop policy if exists "anac_sync_log_select_auth" on public.anac_sync_log;
create policy "anac_sync_log_select_auth"
  on public.anac_sync_log for select
  to authenticated
  using (true);

-- Inserimenti su gare_anac solo da service role (server sync) — nessuna policy insert client
