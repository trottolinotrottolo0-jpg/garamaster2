-- Scouting Fase 3 + 4: documenti (parse/storage) + enrichment AI gare_scouting
-- Esegui dopo solo-anac-sync-fase2.sql

-- Colonne extra su gare_documenti
alter table public.gare_documenti
  add column if not exists status text default 'pending',
  add column if not exists parse_result jsonb,
  add column if not exists parse_error text;

create unique index if not exists gare_documenti_anac_tipo_unique_idx
  on public.gare_documenti (gare_anac_id, tipo)
  where gare_anac_id is not null;

-- Timestamp enrichment AI
alter table public.gare_scouting
  add column if not exists enriched_at timestamptz;

create index if not exists gare_scouting_enriched_at_idx on public.gare_scouting (enriched_at desc);

-- Storage bucket disciplinari (privato — accesso via service role)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gare-documenti',
  'gare-documenti',
  false,
  12582912,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

-- Policy: service role bypassa RLS; authenticated può leggere solo metadata in gare_documenti (già RLS)

-- Demo: URL disciplinare fittizio (upload manuale o sync reale in produzione)
update public.gare_anac
set url_disciplinare = coalesce(
  url_disciplinare,
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
)
where cig in ('DEMO0000001', 'DEMO0000002')
  and (url_disciplinare is null or trim(url_disciplinare) = '');
