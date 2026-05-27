-- Fix: ON CONFLICT su cig (opzionale — il server usa upsert manuale anche senza questo)
-- Esegui solo se vuoi vincolo DB + indice per integrità dati

-- Dedup rapido se necessario (mantieni riga più recente)
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
