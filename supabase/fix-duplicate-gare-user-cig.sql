-- Fix: CIG duplicati su `gare` (stesso user_id) prima dell'indice gare_user_cig_unique_idx
-- Errore tipico: could not create unique index "gare_user_cig_unique_idx" ... DEMO0000006 is duplicated
--
-- Ordine: 1) questo file  2) solo-portfolio-scores.sql (se mancano colonne)  3) indice in fondo a questo file

-- Anteprima duplicati
select user_id, trim(cig) as cig, count(*) as n
from public.gare
where cig is not null and trim(cig) <> ''
group by user_id, trim(cig)
having count(*) > 1
order by n desc, cig;

-- Righe da tenere (più recente per user_id + cig)
with ranked as (
  select
    id,
    user_id,
    trim(cig) as cig_norm,
    first_value(id) over (
      partition by user_id, trim(cig)
      order by
        score_sintetico desc nulls last,
        updated_at desc nulls last,
        created_at desc nulls last,
        id desc
    ) as keeper_id
  from public.gare
  where cig is not null and trim(cig) <> ''
),
dupes as (
  select id as old_id, keeper_id
  from ranked
  where id <> keeper_id
)
-- Conversazioni: punta alla gara conservata
update public.conversazioni_ai c
set gara_id = d.keeper_id
from dupes d
where c.gara_id = d.old_id;

-- Documenti scouting (se tabella presente)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'gare_documenti'
  ) then
    execute $sql$
      update public.gare_documenti gd
      set gara_id = d.keeper_id
      from (
        select id as old_id, keeper_id
        from (
          select
            id,
            first_value(id) over (
              partition by user_id, trim(cig)
              order by
                score_sintetico desc nulls last,
                updated_at desc nulls last,
                created_at desc nulls last,
                id desc
            ) as keeper_id
          from public.gare
          where cig is not null and trim(cig) <> ''
        ) ranked
        where id <> keeper_id
      ) d
      where gd.gara_id = d.old_id
    $sql$;
  end if;
end $$;

-- Scouting per gara utente (se colonna gara_id esiste)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gare_scouting' and column_name = 'gara_id'
  ) then
    execute $sql$
      update public.gare_scouting gs
      set gara_id = d.keeper_id
      from (
        select id as old_id, keeper_id
        from (
          select
            id,
            first_value(id) over (
              partition by user_id, trim(cig)
              order by
                score_sintetico desc nulls last,
                updated_at desc nulls last,
                created_at desc nulls last,
                id desc
            ) as keeper_id
          from public.gare
          where cig is not null and trim(cig) <> ''
        ) ranked
        where id <> keeper_id
      ) d
      where gs.gara_id = d.old_id
    $sql$;
  end if;
end $$;

-- Elimina duplicati
delete from public.gare g
using (
  select id as old_id
  from (
    select
      id,
      first_value(id) over (
        partition by user_id, trim(cig)
        order by
          score_sintetico desc nulls last,
          updated_at desc nulls last,
          created_at desc nulls last,
          id desc
      ) as keeper_id
    from public.gare
    where cig is not null and trim(cig) <> ''
  ) ranked
  where id <> keeper_id
) d
where g.id = d.old_id;

-- Verifica: nessun duplicato residuo
select user_id, trim(cig) as cig, count(*) as n
from public.gare
where cig is not null and trim(cig) <> ''
group by user_id, trim(cig)
having count(*) > 1;

-- Indice univoco (dopo dedup)
drop index if exists public.gare_user_cig_unique_idx;
create unique index gare_user_cig_unique_idx
  on public.gare (user_id, cig)
  where cig is not null;
