-- Gare scartate dal portfolio (nascondi dalle altre viste)
alter table public.gare
  add column if not exists scartata boolean not null default false;

create index if not exists gare_scartata_idx on public.gare (user_id, scartata)
  where scartata = false;

comment on column public.gare.scartata is 'Gara confermata come scartata nel portfolio';
