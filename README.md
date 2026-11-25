# 🦉 The Daily Prophet

A weather risk intelligence agent for a logistics company's US distribution hubs.
Analysts chat with it to find out which hubs are most exposed to severe weather, compare hubs,
and understand *why* a hub is risky, to help decide where to invest in resilience upgrades.

> 🚧 Work in progress. Built step by step. See [docs/plan.md](docs/plan.md).

## Docs
- [Plan](docs/plan.md): architecture, tables, steps
- [Decision log](docs/decisions.md): every choice and why
- [Assumptions, uncertainty & scope](docs/assumptions.md)
- [Design](docs/design.md)
- [AI session log](docs/session/): the full conversation with the coding agent

## Run locally
Requirements: Node 22+, a Supabase project.

```bash
npm install
cp .env.example .env.local     # then fill in the values (see comments in the file)
npm run db:check               # verifies the database connection: lists the hubs
npm run dev                    # http://localhost:3000
```

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (includes the rule keeping `src/core` free of Next.js) |
| `npm run db:check` | Connect to Supabase and list hubs per region |
| `npm run ingest` | Fetch FEMA + Open-Meteo data for all active hubs (incremental; the first full load takes about 1 h because of Open-Meteo's rate limits) |
| `npm run ingest -- --hub=dallas,denver` | Same, for selected hubs only |
| `npm run session:export -- <file.jsonl>` | Export the AI session log to `docs/session/` (scrubbed) |

## Database
SQL migrations live in [supabase/migrations/](supabase/migrations/). Apply them in order to a fresh
Supabase project (SQL editor or Supabase CLI). The second migration seeds the 36 hubs.

## Data attribution
Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). Hazard data: FEMA National Risk Index.
