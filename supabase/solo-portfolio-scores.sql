-- Portfolio score: colonne ranking su gare utente
alter table public.gare
  add column if not exists fit_score numeric,
  add column if not exists urgenza_score numeric,
  add column if not exists rischio_score numeric,
  add column if not exists margine_score numeric,
  add column if not exists carico_score numeric,
  add column if not exists convenienza_score numeric,
  add column if not exists score_sintetico numeric,
  add column if not exists motivazione_ranking text,
  add column if not exists vista_portfolio text,
  add column if not exists scartata boolean not null default false;

create index if not exists gare_vista_portfolio_idx
  on public.gare (user_id, vista_portfolio)
  where scartata = false;

create index if not exists gare_score_sintetico_idx
  on public.gare (user_id, score_sintetico desc nulls last);

comment on column public.gare.vista_portfolio is 'Vista portfolio: oggi | approfondire | scartare';

-- Indice univoco (user_id, cig): esegui DOPO fix-duplicate-gare-user-cig.sql se compare errore 23505
-- (es. DEMO0000006 duplicato per lo stesso utente dopo mirror ANAC)
