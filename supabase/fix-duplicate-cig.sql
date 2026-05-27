-- Fix rapido: CIG duplicati (es. DEMO0000001) prima dell'indice univoco
-- In alternativa riesegui tutto supabase/solo-anac-sync-fase2.sql

select cig, count(*) as n
from public.gare_anac
where cig is not null and trim(cig) <> ''
group by cig
having count(*) > 1
order by n desc;

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

drop index if exists public.gare_anac_cig_unique_idx;
create unique index gare_anac_cig_unique_idx
  on public.gare_anac (cig)
  where cig is not null and trim(cig) <> '';
