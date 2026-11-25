-- =============================================================================
-- Sneakoscope — answer cache (Step 18, D136)
-- The checked answer to the FIRST question of a new conversation, reused for the
-- same question while nothing it depends on has changed. Follow-ups are never cached.
-- Key = sha256(normalized question | scores version | model | today), so a nightly
-- re-score, a model change or a new day all start fresh; entries also expire.
-- =============================================================================

create table public.answer_cache (
  id              uuid primary key default gen_random_uuid(),
  cache_key       text not null unique,
  -- The normalized question (lower case, single spaces), for reading the table.
  question        text not null,
  -- `scoringVersion:runId` of the newest scoring run the answer was built on.
  scores_version  text not null,
  model           text not null,
  -- The checked FinalAnswer, exactly as shown.
  answer          jsonb not null,
  -- The turn's messages (question, tool calls, tool results, answer), so a follow-up after a
  -- cached answer still has the tool results it may quote (D65).
  messages        jsonb not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index answer_cache_expires_idx on public.answer_cache (expires_at);

create trigger answer_cache_set_updated_at before update on public.answer_cache
  for each row execute function public.set_updated_at();

-- Server-only, like every other table: RLS on, no policies.
alter table public.answer_cache enable row level security;
