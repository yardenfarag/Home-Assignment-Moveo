@AGENTS.md

# The Daily Prophet: project rules

A weather-risk agent for logistics hubs (take-home assignment). Read before any work:
[docs/plan.md](docs/plan.md) for architecture and the step list, [docs/decisions.md](docs/decisions.md)
for every agreed choice and its reason, and [docs/assumptions.md](docs/assumptions.md) for data limits.

## Teamwork: decide together
Yarden and Claude are one team. Decisions are made together, not by Claude alone.
- **Ask first** about anything that changes product behavior, data or its meaning, architecture,
  dependencies, DB schema, scoring, or what users see. Give a recommendation, then wait.
- **Do and log** the mechanical things: naming inside a function, test structure, formatting, type fixes.
- **Unsure which?** Ask.
- Every agreed decision goes into `docs/decisions.md` in plain language ("What / Why").
  Assumptions and data limits go into `docs/assumptions.md`.

## Workflow
- Small steps. One branch and one PR per step. Yarden reviews and merges. Claude never merges or pushes to `main`.
- After each step: say what was done and what's next, then wait for an OK.
- Before each step: list the `.env` variables it will need.
- PR bodies explain the decisions made and the evidence (test output, data checks).
- Refresh the session log with `npm run session:export`. Its built-in leak check must pass before the log is committed.

## Before writing code
1. **Reuse.** Search the codebase for an existing function, util, type or component that already does the job.
2. **Usages.** Before changing something, find every place that uses it, and mention the impacted areas and side effects.
3. **Single source of truth.** Each fact lives in one place. Derive what can be derived. If you see the same
   state, config or schema in two places, flag it before coding. When a copy is unavoidable (e.g. a DB
   constraint mirrored in a TS type), a test must fail when they drift.
4. **Fewest moving parts.** Between plans with the same outcome, pick the one with fewer things that can fail
   (network calls, manual steps, multi-step migrations, parallel writes).

## Code rules
- **`src/core/` stays framework-free:** no Next.js or React imports (enforced by ESLint).
- **JSDoc** on every exported and internal function, class, method and type. Explain clearly and simply.
- **Errors.** Wrap every boundary operation (external API, DB, LLM, Jev, API route, script entry point) in
  try/catch and rethrow as `BoundaryError` (`src/core/errors/boundaryError.ts`), which formats
  `ErrorName || message || functionName || emoji` with a fixed emoji per boundary. Pure functions (scoring,
  stats, parsing) throw plain errors and leave formatting to the boundary. When you deliberately continue
  after an error, log it in the same format.
- **Timeouts on every external call, no exceptions.** HTTP: `AbortSignal.timeout(ms)` (or an
  `AbortController`). Supabase: the client's wrapped `fetch`. LLM calls: the AI SDK timeout/abort option.
- **Secrets** live only in `.env.local` (local) and Vercel env vars (prod). `.env.example` lists every variable.
- **After every migration:** regenerate `src/core/db/database.types.ts` from the live schema.
- **The LLM never produces numbers.** Scores and stats come from tested TypeScript, and the LLM picks tools and explains.

## Honesty
- **Verify before claiming.** Before saying a file, function, table, column, env var, package, endpoint,
  command or flag exists, check it: read the file, grep the symbol, query the schema, run `--help`.
  When unsure, say so explicitly.
- **Honesty over precision** for end users too: when our data measures something poorly, the agent says so
  plainly instead of presenting a weak number as fact.
- Be candid with Yarden: criticize plans and code, including your own, when something is wrong.

## Vibes
Love cats 🐱. Use cat emojis in chat and UI copy where they fit 😸. Error-boundary emojis stay as defined in
`boundaryError.ts`.

## Hard-won lessons
Each one: *next time you see X → do Y*.
1. **`npm run x -- --flag` on PowerShell** → the `--` is swallowed and the flag arrives as env var
   `npm_config_flag`. Read both `process.argv` and `process.env.npm_config_*`.
2. **"This API probably lags N days / returns shape X"** → probe the real API first. Open-Meteo's archive
   served data up to yesterday, not 5 days back as assumed.
3. **Supabase pause fails with "hibernating"** → it can't be paused through the API. Ask Yarden to pause it in
   the dashboard.
4. **A long Bash heredoc fails with "unexpected EOF"** → write files with the Write tool.
5. **Weather data shows (near) zero extreme events** → check whether reanalysis smoothing is hiding the peaks
   before concluding "safe". Gusts ≥93 km/h were 0–1/yr even in windy hubs, so we score on ≥72 km/h.
6. **"Untracked working tree files would be overwritten" after switching to an older `main`** → compare file
   hashes against the target commit before any reset. The files were identical and nothing was lost.
7. **Vitest is green** → still run `npm run typecheck`. Vitest strips types without checking them. A wrong field
   name (`reason` vs `confidenceReason`) passed every test and was only caught by `tsc`.
8. **Reading more than 1,000 rows from Supabase** → paginate with `.range()`. PostgREST caps each response at
   1,000 rows by default and silently returns the first page (a 1,826-day window would have been cut off).
9. **A rule-based label fires on almost everything (32 of 36 hubs "Medium")** → check whether it's flagging
   *structural* differences (two sources that measure different things) rather than real problems. Compare like with like (D56).
