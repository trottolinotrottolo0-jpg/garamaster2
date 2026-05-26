-- GaraMaster AI — schema nuovo progetto Supabase
-- Esegui in: Dashboard → SQL Editor → New query → Run

-- Estensioni
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profili_impresa (1 profilo per utente autenticato)
-- ---------------------------------------------------------------------------
create table if not exists public.profili_impresa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  ragione_sociale text,
  denominazione text,
  partita_iva text,
  email text,
  soa_prevalente text,
  soa_classifica text,
  categorie_soa jsonb default '[]'::jsonb,
  fatturato_triennale numeric,
  fatturato_medio numeric,
  regioni jsonb default '[]'::jsonb,
  regioni_operative jsonb default '[]'::jsonb,
  certificazioni jsonb default '[]'::jsonb,
  iso_9001 boolean default false,
  iso_14001 boolean default false,
  iso_45001 boolean default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- gare (gare salvate dall'utente)
-- ---------------------------------------------------------------------------
create table if not exists public.gare (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  titolo text,
  oggetto text,
  cig text,
  importo numeric,
  importo_base numeric,
  regione text,
  ente_appaltante text,
  stazione_appaltante text,
  scadenza timestamptz,
  scadenza_presentazione timestamptz,
  scadenza_offerta timestamptz,
  data_scadenza timestamptz,
  stato_pratica text default 'Nuova',
  categoria_soa text,
  criterio_aggiudicazione text,
  requisiti jsonb default '[]'::jsonb,
  penali jsonb default '[]'::jsonb,
  anomalie jsonb default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gare_user_id_idx on public.gare (user_id);
create index if not exists gare_cig_idx on public.gare (cig);

-- ---------------------------------------------------------------------------
-- gare_anac (catalogo condiviso / import ANAC)
-- ---------------------------------------------------------------------------
create table if not exists public.gare_anac (
  id uuid primary key default gen_random_uuid(),
  cig text,
  titolo text,
  oggetto text,
  importo numeric,
  importo_base numeric,
  regione text,
  provincia text,
  stazione_appaltante text,
  ente_appaltante text,
  data_pubblicazione timestamptz,
  data_scadenza timestamptz,
  scadenza timestamptz,
  cpv text,
  categoria text,
  fit_score numeric,
  created_at timestamptz not null default now()
);

create index if not exists gare_anac_cig_idx on public.gare_anac (cig);
create index if not exists gare_anac_scadenza_idx on public.gare_anac (data_scadenza);
create index if not exists gare_scadenza_offerta_idx on public.gare (scadenza_offerta);
create index if not exists gare_stato_pratica_idx on public.gare (stato_pratica);
create index if not exists gare_anac_fit_score_idx on public.gare_anac (fit_score);

-- ---------------------------------------------------------------------------
-- gare_anac_viste (feed: opportunità ANAC già visualizzate)
-- ---------------------------------------------------------------------------
create table if not exists public.gare_anac_viste (
  user_id uuid not null references auth.users (id) on delete cascade,
  gare_anac_id uuid not null references public.gare_anac (id) on delete cascade,
  visto_at timestamptz not null default now(),
  primary key (user_id, gare_anac_id)
);

-- ---------------------------------------------------------------------------
-- gare_scouting (risultati AI per CIG)
-- ---------------------------------------------------------------------------
create table if not exists public.gare_scouting (
  id uuid primary key default gen_random_uuid(),
  gara_id uuid references public.gare (id) on delete set null,
  gare_anac_id uuid references public.gare_anac (id) on delete set null,
  cig text,
  score numeric,
  summary text,
  strategia text,
  alert text,
  created_at timestamptz not null default now()
);

create index if not exists gare_scouting_cig_idx on public.gare_scouting (cig);

-- ---------------------------------------------------------------------------
-- conversazioni_ai (storico chat Gemini per utente e gara)
-- ---------------------------------------------------------------------------
create table if not exists public.conversazioni_ai (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  gara_id uuid,
  messages jsonb,
  created_at timestamptz default now()
);

create index if not exists conversazioni_ai_user_id_idx on public.conversazioni_ai (user_id);
create index if not exists conversazioni_ai_gara_id_idx on public.conversazioni_ai (gara_id);

-- ---------------------------------------------------------------------------
-- storico_gare_ai (Historical Knowledge Layer)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profili_impresa_updated_at on public.profili_impresa;
create trigger profili_impresa_updated_at
  before update on public.profili_impresa
  for each row execute function public.set_updated_at();

drop trigger if exists gare_updated_at on public.gare;
create trigger gare_updated_at
  before update on public.gare
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profilo automatico alla registrazione
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profili_impresa (user_id, email, ragione_sociale)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'ragione_sociale', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profili_impresa enable row level security;
alter table public.gare enable row level security;
alter table public.gare_anac enable row level security;
alter table public.gare_scouting enable row level security;
alter table public.conversazioni_ai enable row level security;
alter table public.gare_anac_viste enable row level security;
alter table public.storico_gare_ai enable row level security;

-- profili_impresa: solo il proprio profilo
drop policy if exists "profili_impresa_select_own" on public.profili_impresa;
create policy "profili_impresa_select_own"
  on public.profili_impresa for select
  using (auth.uid() = user_id);

drop policy if exists "profili_impresa_insert_own" on public.profili_impresa;
create policy "profili_impresa_insert_own"
  on public.profili_impresa for insert
  with check (auth.uid() = user_id);

drop policy if exists "profili_impresa_update_own" on public.profili_impresa;
create policy "profili_impresa_update_own"
  on public.profili_impresa for update
  using (auth.uid() = user_id);

-- gare: solo le proprie
drop policy if exists "gare_select_own" on public.gare;
create policy "gare_select_own"
  on public.gare for select
  using (auth.uid() = user_id);

drop policy if exists "gare_insert_own" on public.gare;
create policy "gare_insert_own"
  on public.gare for insert
  with check (auth.uid() = user_id);

drop policy if exists "gare_update_own" on public.gare;
create policy "gare_update_own"
  on public.gare for update
  using (auth.uid() = user_id);

drop policy if exists "gare_delete_own" on public.gare;
create policy "gare_delete_own"
  on public.gare for delete
  using (auth.uid() = user_id);

-- gare_anac: lettura per utenti autenticati
drop policy if exists "gare_anac_select_auth" on public.gare_anac;
create policy "gare_anac_select_auth"
  on public.gare_anac for select
  to authenticated
  using (true);

-- gare_scouting: lettura per utenti autenticati
drop policy if exists "gare_scouting_select_auth" on public.gare_scouting;
create policy "gare_scouting_select_auth"
  on public.gare_scouting for select
  to authenticated
  using (true);

-- conversazioni_ai: solo le proprie conversazioni
drop policy if exists "conversazioni_ai_select_own" on public.conversazioni_ai;
create policy "conversazioni_ai_select_own"
  on public.conversazioni_ai for select
  using (auth.uid() = user_id);

drop policy if exists "conversazioni_ai_insert_own" on public.conversazioni_ai;
create policy "conversazioni_ai_insert_own"
  on public.conversazioni_ai for insert
  with check (auth.uid() = user_id);

drop policy if exists "conversazioni_ai_update_own" on public.conversazioni_ai;
create policy "conversazioni_ai_update_own"
  on public.conversazioni_ai for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "gare_anac_viste_select_own" on public.gare_anac_viste;
create policy "gare_anac_viste_select_own"
  on public.gare_anac_viste for select
  using (auth.uid() = user_id);

drop policy if exists "gare_anac_viste_insert_own" on public.gare_anac_viste;
create policy "gare_anac_viste_insert_own"
  on public.gare_anac_viste for insert
  with check (auth.uid() = user_id);

drop policy if exists "gare_anac_viste_delete_own" on public.gare_anac_viste;
create policy "gare_anac_viste_delete_own"
  on public.gare_anac_viste for delete
  using (auth.uid() = user_id);

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

-- ---------------------------------------------------------------------------
-- Dati demo (opzionale — commenta se non servono)
-- ---------------------------------------------------------------------------
insert into public.gare_anac (cig, titolo, oggetto, importo, regione, data_scadenza, categoria, fit_score)
values
  (
    'DEMO0000001',
    'Riqualificazione energetica edifici scolastici',
    'Interventi di efficientamento energetico su patrimonio pubblico',
    1250000,
    'Lombardia',
    now() + interval '45 days',
    'OG1',
    72
  ),
  (
    'DEMO0000002',
    'Manutenzione straordinaria viabilità comunale',
    'Lavori di messa in sicurezza e ripristino manto stradale',
    890000,
    'Veneto',
    now() + interval '30 days',
    'OG3',
    68
  );
