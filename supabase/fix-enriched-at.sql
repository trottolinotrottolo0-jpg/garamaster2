-- Fix rapido Fase 4: colonna enriched_at su gare_scouting (se manca)
-- Esegui se vedi errore "Could not find the 'enriched_at' column"

alter table public.gare_scouting
  add column if not exists enriched_at timestamptz;

create index if not exists gare_scouting_enriched_at_idx on public.gare_scouting (enriched_at desc);
