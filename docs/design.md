# Design & architecture

> Draft. Filled in as each step lands, and finalized in Step 9.

## System architecture
See the diagram in [plan.md](plan.md#architecture-target). Components:

| Component | Where | Talks to |
|---|---|---|
| Chat UI + widgets | `src/app/` (Next.js App Router) | Only our own API routes |
| API routes | `src/app/api/` | `src/core` |
| Auth proxy | `src/proxy.ts` | Guards pages + API (Basic Auth); cron uses `CRON_SECRET` |
| Agent | `src/core/agent/` | OpenRouter (LLM), tools |
| Tools | `src/core/tools/` | Repositories + scoring/stats |
| Scoring & stats | `src/core/scoring/`, `src/core/stats/` | Nothing: pure functions |
| Ingest | `src/core/ingest/` | Open-Meteo, FEMA NRI, Supabase |
| Repositories | `src/core/db/` | Supabase Postgres |

## Repository structure
```
src/app/         Next.js only (pages, API routes, components)
src/core/        framework-free logic (lint-enforced): config, domain, errors, db, …
scripts/         CLI entry points (db:check, session:export; later ingest, eval)
supabase/        SQL migrations (schema + hub seed)
docs/            plan, decisions, assumptions, design, session log
```

## Data storage choice
**Supabase Postgres**, because:
- The data is relational and small (36 hubs × ~2,200 days ≈ 80k weather rows).
- SQL makes the evals' "expected values" and ad-hoc analysis easy.
- It's hosted and free, and pairs well with Vercel.
- Built-in RLS lets us lock the tables down completely (server-only access).
- One store holds the hubs, the cached weather and FEMA data, score history, chat memory and the event log.
  No extra services.
