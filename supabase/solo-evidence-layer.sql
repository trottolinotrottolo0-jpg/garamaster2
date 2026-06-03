-- Feature #14 — Evidence & Explainability Layer
-- Esegui in Supabase SQL Editor dopo schema.sql / gare / profili_impresa

-- ---------------------------------------------------------------------------
-- evidence_items — tracciabilità output (clausola, documento, regola, dato impresa)
-- ---------------------------------------------------------------------------
create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gara_id uuid references public.gare (id) on delete cascade,
  profilo_id uuid references public.profili_impresa (id) on delete set null,
  output_type text not null,
  output_id text,
  source_document text,
  source_reference text,
  source_text text,
  rule_triggered text,
  company_data_used jsonb default '{}'::jsonb,
  conclusion text,
  confidence_score integer not null default 100
    check (confidence_score >= 0 and confidence_score <= 100),
  requires_human_review boolean not null default false,
  review_reason text,
  human_reviewed boolean not null default false,
  human_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.evidence_items is 'Evidenze tracciabili per output GaraMaster (Feature #14)';
comment on column public.evidence_items.output_type is 'bid_no_bid | fit_score | red_flag | profitability | compliance | portfolio | etc.';
comment on column public.evidence_items.output_id is 'ID logico output (es. sezione bid, flag id) — testo per flessibilità';

create index if not exists evidence_items_user_idx on public.evidence_items (user_id);
create index if not exists evidence_items_gara_idx on public.evidence_items (gara_id);
create index if not exists evidence_items_output_idx on public.evidence_items (user_id, output_type, output_id);
create index if not exists evidence_items_review_idx on public.evidence_items (user_id, requires_human_review)
  where requires_human_review = true and human_reviewed = false;

-- ---------------------------------------------------------------------------
-- evidence_graph_edges — catena causa-effetto per grafo visivo
-- ---------------------------------------------------------------------------
create table if not exists public.evidence_graph_edges (
  id uuid primary key default gen_random_uuid(),
  evidence_item_id uuid not null references public.evidence_items (id) on delete cascade,
  from_node text not null,
  from_label text not null,
  to_node text not null,
  to_label text not null,
  edge_type text not null default 'causes'
    check (edge_type in ('causes', 'references', 'contradicts'))
);

create index if not exists evidence_graph_edges_item_idx on public.evidence_graph_edges (evidence_item_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.evidence_items enable row level security;
alter table public.evidence_graph_edges enable row level security;

drop policy if exists "evidence_items_select_own" on public.evidence_items;
create policy "evidence_items_select_own"
  on public.evidence_items for select
  using (auth.uid() = user_id);

drop policy if exists "evidence_items_insert_own" on public.evidence_items;
create policy "evidence_items_insert_own"
  on public.evidence_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "evidence_items_update_own" on public.evidence_items;
create policy "evidence_items_update_own"
  on public.evidence_items for update
  using (auth.uid() = user_id);

drop policy if exists "evidence_items_delete_own" on public.evidence_items;
create policy "evidence_items_delete_own"
  on public.evidence_items for delete
  using (auth.uid() = user_id);

drop policy if exists "evidence_graph_edges_select_own" on public.evidence_graph_edges;
create policy "evidence_graph_edges_select_own"
  on public.evidence_graph_edges for select
  using (
    exists (
      select 1 from public.evidence_items ei
      where ei.id = evidence_item_id and ei.user_id = auth.uid()
    )
  );

drop policy if exists "evidence_graph_edges_insert_own" on public.evidence_graph_edges;
create policy "evidence_graph_edges_insert_own"
  on public.evidence_graph_edges for insert
  with check (
    exists (
      select 1 from public.evidence_items ei
      where ei.id = evidence_item_id and ei.user_id = auth.uid()
    )
  );

drop policy if exists "evidence_graph_edges_delete_own" on public.evidence_graph_edges;
create policy "evidence_graph_edges_delete_own"
  on public.evidence_graph_edges for delete
  using (
    exists (
      select 1 from public.evidence_items ei
      where ei.id = evidence_item_id and ei.user_id = auth.uid()
    )
  );
