-- Feature #11 — Guided Tender Preparation (pratiche partecipazione gara)
-- Esegui in SQL Editor dopo schema base + gare

-- ---------------------------------------------------------------------------
-- tender_practices — una pratica per utente + gara
-- ---------------------------------------------------------------------------
create table if not exists public.tender_practices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gara_id uuid not null references public.gare (id) on delete cascade,
  profilo_impresa_id uuid references public.profili_impresa (id) on delete set null,
  stato text not null default 'DA_ANALIZZARE'
    check (stato in (
      'DA_ANALIZZARE',
      'IN_LAVORAZIONE',
      'DOCUMENTI_MANCANTI',
      'PRONTA',
      'INVIATA'
    )),
  autocompilazione jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gara_id)
);

create index if not exists tender_practices_user_idx on public.tender_practices (user_id);
create index if not exists tender_practices_gara_idx on public.tender_practices (gara_id);
create index if not exists tender_practices_stato_idx on public.tender_practices (user_id, stato);

-- ---------------------------------------------------------------------------
-- tender_documents — documenti della pratica
-- ---------------------------------------------------------------------------
create table if not exists public.tender_documents (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.tender_practices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  categoria text not null default 'generale'
    check (categoria in ('amministrativa', 'tecnica', 'economica', 'generale')),
  nome text not null,
  stato text not null default 'MANCANTE'
    check (stato in ('MANCANTE', 'CARICATO', 'DA_REVISIONARE')),
  file_url text,
  file_name text,
  storage_path text,
  uploaded_at timestamptz,
  obbligatorio boolean not null default true,
  note text,
  ordine int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tender_documents_practice_idx on public.tender_documents (practice_id);
create index if not exists tender_documents_user_idx on public.tender_documents (user_id);

-- ---------------------------------------------------------------------------
-- tender_checklist_items — checklist per busta
-- ---------------------------------------------------------------------------
create table if not exists public.tender_checklist_items (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.tender_practices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  busta text not null
    check (busta in ('amministrativa', 'tecnica', 'economica')),
  titolo text not null,
  stato text not null default 'TODO'
    check (stato in ('TODO', 'IN_CORSO', 'FATTO', 'NON_APPLICABILE')),
  obbligatorio boolean not null default true,
  note text,
  ordine int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tender_checklist_practice_idx on public.tender_checklist_items (practice_id);

-- updated_at triggers
drop trigger if exists tender_practices_updated_at on public.tender_practices;
create trigger tender_practices_updated_at
  before update on public.tender_practices
  for each row execute function public.set_updated_at();

drop trigger if exists tender_documents_updated_at on public.tender_documents;
create trigger tender_documents_updated_at
  before update on public.tender_documents
  for each row execute function public.set_updated_at();

drop trigger if exists tender_checklist_items_updated_at on public.tender_checklist_items;
create trigger tender_checklist_items_updated_at
  before update on public.tender_checklist_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tender_practices enable row level security;
alter table public.tender_documents enable row level security;
alter table public.tender_checklist_items enable row level security;

drop policy if exists "tender_practices_select_own" on public.tender_practices;
create policy "tender_practices_select_own"
  on public.tender_practices for select using (auth.uid() = user_id);

drop policy if exists "tender_practices_insert_own" on public.tender_practices;
create policy "tender_practices_insert_own"
  on public.tender_practices for insert with check (auth.uid() = user_id);

drop policy if exists "tender_practices_update_own" on public.tender_practices;
create policy "tender_practices_update_own"
  on public.tender_practices for update using (auth.uid() = user_id);

drop policy if exists "tender_practices_delete_own" on public.tender_practices;
create policy "tender_practices_delete_own"
  on public.tender_practices for delete using (auth.uid() = user_id);

drop policy if exists "tender_documents_select_own" on public.tender_documents;
create policy "tender_documents_select_own"
  on public.tender_documents for select using (auth.uid() = user_id);

drop policy if exists "tender_documents_insert_own" on public.tender_documents;
create policy "tender_documents_insert_own"
  on public.tender_documents for insert with check (auth.uid() = user_id);

drop policy if exists "tender_documents_update_own" on public.tender_documents;
create policy "tender_documents_update_own"
  on public.tender_documents for update using (auth.uid() = user_id);

drop policy if exists "tender_documents_delete_own" on public.tender_documents;
create policy "tender_documents_delete_own"
  on public.tender_documents for delete using (auth.uid() = user_id);

drop policy if exists "tender_checklist_select_own" on public.tender_checklist_items;
create policy "tender_checklist_select_own"
  on public.tender_checklist_items for select using (auth.uid() = user_id);

drop policy if exists "tender_checklist_insert_own" on public.tender_checklist_items;
create policy "tender_checklist_insert_own"
  on public.tender_checklist_items for insert with check (auth.uid() = user_id);

drop policy if exists "tender_checklist_update_own" on public.tender_checklist_items;
create policy "tender_checklist_update_own"
  on public.tender_checklist_items for update using (auth.uid() = user_id);

drop policy if exists "tender_checklist_delete_own" on public.tender_checklist_items;
create policy "tender_checklist_delete_own"
  on public.tender_checklist_items for delete using (auth.uid() = user_id);

-- Storage bucket documenti pratica (privato)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tender-practice-files',
  'tender-practice-files',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

drop policy if exists "tender_practice_files_select_own" on storage.objects;
create policy "tender_practice_files_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tender-practice-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tender_practice_files_insert_own" on storage.objects;
create policy "tender_practice_files_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tender-practice-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tender_practice_files_update_own" on storage.objects;
create policy "tender_practice_files_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'tender-practice-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tender_practice_files_delete_own" on storage.objects;
create policy "tender_practice_files_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'tender-practice-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

comment on table public.tender_practices is 'Pratica guidata partecipazione gara (Feature #11)';
