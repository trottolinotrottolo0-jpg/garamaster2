-- Capacità operativa per portfolio carico (profili_impresa + gare)
-- Esegui in Supabase SQL Editor se le colonne non esistono ancora.

alter table public.profili_impresa
  add column if not exists squadre_disponibili numeric,
  add column if not exists mezzi_disponibili numeric;

alter table public.gare
  add column if not exists carico_operativo numeric,
  add column if not exists squadre_richieste numeric,
  add column if not exists durata_mesi numeric,
  add column if not exists durata_gara_settimane numeric;

comment on column public.profili_impresa.squadre_disponibili is 'Squadre libere per nuove gare';
comment on column public.profili_impresa.mezzi_disponibili is 'Mezzi/attrezzature disponibili';
comment on column public.gare.carico_operativo is 'Carico % 0-100 se già calcolato';
