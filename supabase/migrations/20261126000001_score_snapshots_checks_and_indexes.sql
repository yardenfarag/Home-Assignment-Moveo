-- =============================================================================
-- Sneakoscope — score_snapshots: a check on top_hazard, and indexes for reads
-- (code review PR 3). No data changes; no columns dropped.
-- =============================================================================

-- top_hazard may only be one of the six scored hazards. Mirrors HAZARDS in
-- src/core/scoring/types.ts (same order); schemaDrift.test.ts fails if they drift.
-- Existing rows already satisfy it: top_hazard has always been written from HAZARDS.
alter table public.score_snapshots
  add constraint score_snapshots_top_hazard_check
  check (top_hazard in ('hurricane', 'winter', 'flood', 'severeStorms', 'wind', 'heat'));

-- getLatestSnapshots: "newest run of the current scoring version"
-- (where scoring_version = $1 order by created_at desc limit 1).
create index if not exists score_snapshots_version_created_idx
  on public.score_snapshots (scoring_version, created_at desc);

-- getLatestSnapshots: "every row of that run" (the unique (hub_id, run_id) index
-- leads with hub_id, so it can't serve a lookup by run_id alone).
create index if not exists score_snapshots_run_idx
  on public.score_snapshots (run_id);
