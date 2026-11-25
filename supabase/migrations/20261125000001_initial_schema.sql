-- =============================================================================
-- The Daily Prophet — initial schema
-- Every table has created_at + updated_at (kept fresh by a trigger).
-- RLS is enabled on every table with NO policies: only the server (secret key)
-- can read or write. The browser never talks to the database directly.
-- =============================================================================

-- Shared trigger: keep updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- hubs: our distribution hubs. Adding a city = inserting a row.
-- -----------------------------------------------------------------------------
create table public.hubs (
  id          text primary key check (id ~ '^[a-z0-9-]+$'),   -- readable slug, e.g. 'kansas-city'
  name        text not null,                                   -- display name, e.g. 'Kansas City'
  state       char(2) not null,                                -- USPS code, e.g. 'MO'
  region      text not null check (region in ('Northeast', 'Midwest', 'South', 'West')), -- US Census region
  latitude    numeric(8, 5) not null check (latitude between -90 and 90),
  longitude   numeric(8, 5) not null check (longitude between -180 and 180),
  timezone    text not null,                                   -- IANA tz, used for daily weather boundaries
  county_fips text,                                            -- filled by ingest from the FEMA point lookup
  county_name text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.hubs is 'Distribution hubs (one row per metro). Location = city-center point.';

-- -----------------------------------------------------------------------------
-- weather_daily: one row per hub per day from the Open-Meteo historical archive.
-- -----------------------------------------------------------------------------
create table public.weather_daily (
  hub_id              text not null references public.hubs (id) on delete cascade,
  date                date not null,
  snowfall_cm         numeric(6, 2),
  temp_min_c          numeric(5, 2),
  precipitation_mm    numeric(6, 2),
  wind_gust_max_kmh   numeric(6, 2),
  apparent_temp_max_c numeric(5, 2),
  source              text not null default 'open-meteo-archive',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (hub_id, date)
);
comment on table public.weather_daily is 'Daily reanalysis weather per hub. Recent days are re-fetched nightly because the archive revises them.';

-- -----------------------------------------------------------------------------
-- fema_nri: FEMA National Risk Index values for the county containing each hub.
-- *_afreq = annualized frequency (events per year). NULL = FEMA lists the hazard
-- as not applicable / no data for that county.
-- -----------------------------------------------------------------------------
create table public.fema_nri (
  hub_id         text primary key references public.hubs (id) on delete cascade,
  county_fips    text not null,
  county_name    text not null,
  nri_version    text not null,
  hrcn_afreq     numeric,  -- hurricane
  trnd_afreq     numeric,  -- tornado
  hail_afreq     numeric,  -- hail
  ifld_afreq     numeric,  -- inland flooding
  cfld_afreq     numeric,  -- coastal flooding
  istm_afreq     numeric,  -- ice storm
  wntw_afreq     numeric,  -- winter weather
  cwav_afreq     numeric,  -- cold wave
  hwav_afreq     numeric,  -- heat wave
  swnd_afreq     numeric,  -- strong wind
  raw_attributes jsonb not null default '{}'::jsonb,  -- the full FEMA record, for traceability
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.fema_nri is 'FEMA NRI county record per hub (hazard annualized frequencies).';

-- -----------------------------------------------------------------------------
-- score_snapshots: deterministic scores computed after each ingest run.
-- scoring_version lets us tell "the formula changed" apart from "the weather changed".
-- -----------------------------------------------------------------------------
create table public.score_snapshots (
  id              uuid primary key default gen_random_uuid(),
  hub_id          text not null references public.hubs (id) on delete cascade,
  run_id          uuid not null,                    -- = events.correlation_id of the ingest run
  scoring_version text not null,
  window_start    date not null,
  window_end      date not null,
  overall_score   numeric(5, 2) not null check (overall_score between 0 and 100),
  risk_level      text not null check (risk_level in ('low', 'medium', 'high')),
  top_hazard      text not null,
  confidence      text not null check (confidence in ('high', 'medium', 'low')),
  hazard_scores   jsonb not null,                   -- per-hazard breakdown (observed vs FEMA parts)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (hub_id, run_id)
);
create index score_snapshots_hub_created_idx on public.score_snapshots (hub_id, created_at desc);
comment on table public.score_snapshots is 'History of computed risk scores (one row per hub per ingest run).';

-- -----------------------------------------------------------------------------
-- chat_sessions / chat_messages: server-side conversation memory for follow-ups.
-- -----------------------------------------------------------------------------
create table public.chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.chat_sessions is 'One row per browser chat session.';

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'tool')),
  content    jsonb not null,          -- the message as the AI SDK sees it (incl. tool calls/results)
  answer     jsonb,                   -- validated structured answer (final assistant messages only)
  model      text,                    -- which LLM produced it (assistant messages)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_messages_session_created_idx on public.chat_messages (session_id, created_at);
comment on table public.chat_messages is 'Conversation history incl. tool results, so follow-ups can reuse exact numbers.';

-- -----------------------------------------------------------------------------
-- events: append-only log of everything that happens (ingest runs, scoring,
-- validation failures, retries, guard decisions, errors). Rows from one ingest
-- run or one chat turn share a correlation_id.
-- -----------------------------------------------------------------------------
create table public.events (
  id             bigint generated always as identity primary key,
  event_type     text not null,                        -- e.g. 'ingest.started', 'agent.validation_failed'
  source         text not null check (source in ('ingest', 'scoring', 'agent', 'api', 'guard', 'cron', 'eval')),
  level          text not null default 'info' check (level in ('info', 'warn', 'error')),
  correlation_id uuid,
  hub_id         text references public.hubs (id) on delete set null,
  session_id     uuid references public.chat_sessions (id) on delete set null,
  message        text,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index events_type_created_idx on public.events (event_type, created_at desc);
create index events_correlation_idx on public.events (correlation_id);
create index events_hub_idx on public.events (hub_id);
create index events_session_idx on public.events (session_id);
comment on table public.events is 'Append-only event log for auditing and analysis.';

-- updated_at triggers
create trigger hubs_set_updated_at            before update on public.hubs            for each row execute function public.set_updated_at();
create trigger weather_daily_set_updated_at   before update on public.weather_daily   for each row execute function public.set_updated_at();
create trigger fema_nri_set_updated_at        before update on public.fema_nri        for each row execute function public.set_updated_at();
create trigger score_snapshots_set_updated_at before update on public.score_snapshots for each row execute function public.set_updated_at();
create trigger chat_sessions_set_updated_at   before update on public.chat_sessions   for each row execute function public.set_updated_at();
create trigger chat_messages_set_updated_at   before update on public.chat_messages   for each row execute function public.set_updated_at();
create trigger events_set_updated_at          before update on public.events          for each row execute function public.set_updated_at();

-- Row Level Security: on everywhere, no policies => anon/authenticated keys get nothing.
alter table public.hubs            enable row level security;
alter table public.weather_daily   enable row level security;
alter table public.fema_nri        enable row level security;
alter table public.score_snapshots enable row level security;
alter table public.chat_sessions   enable row level security;
alter table public.chat_messages   enable row level security;
alter table public.events          enable row level security;
