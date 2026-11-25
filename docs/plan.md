# 🦉 The Daily Prophet — Plan

Agreed on 2026-11-25 after a structured "grilling" session (see `docs/session/`).
Every individual choice and its reason is in [decisions.md](decisions.md).

## Goal
A chat agent that helps logistics analysts decide which distribution hubs are most
exposed to severe weather and should get resilience investment. It ranks, compares
and explains hubs using **deterministic, tested scoring code**. The LLM only chooses
tools and explains their results. It never invents numbers.

## Architecture (target)
```
Browser (Next.js UI: Roboto, dark glass)
  │  POST /api/chat {sessionId, message}  → streams progress + text + validated answer
  │  GET  /api/widgets                    → top hubs, hazard leaders, data status
  ▼
proxy.ts — Basic Auth on everything except /api/cron/* (uses CRON_SECRET)
  ▼
src/app/api/*  (thin: Zod-parse → call core → format response/errors)
  ▼
src/core/  (no Next.js; testable alone)
  agent/   AI SDK v7 streamText + 4 tools + Output.object(answer schema)
           → validate → code overrides confidence/disclaimer → retry once → error
  tools/   rank_hubs · compare_hubs · get_weather_stat · explain_hub_score
  scoring/ pure: thresholds → per-hazard 0–100 → overall → level → confidence
  stats/   pure: counts / % / ranges over daily rows
  ingest/  incremental: Open-Meteo + FEMA → DB → scoring → nightly snapshot
  db/      Supabase repositories (server-only secret key)
  ▼                    ▼                          ▼
Supabase Postgres   OpenRouter (LLM + Jev)   Open-Meteo archive · FEMA NRI ArcGIS
        ▲
Vercel Cron (daily) → /api/cron/ingest      npm run ingest (first full load, local)
```

## Database tables
Every table has `created_at` + `updated_at` (trigger-maintained). RLS on, no public policies.

| Table | Holds |
|---|---|
| `hubs` | id slug, name, state, Census region, lat/lon, timezone, county FIPS/name, active |
| `weather_daily` | hub × date: snowfall, min temp, precipitation, max gust, max apparent temp |
| `fema_nri` | per hub: NRI version + annualized frequency per hazard + raw record |
| `score_snapshots` | per hub per ingest run: overall, level, top hazard, breakdown, confidence, window, scoring_version |
| `chat_sessions`, `chat_messages` | server-side conversation memory incl. tool results |
| `events` | append-only log (ingest, scoring, validation failures, retries, guard decisions, errors), grouped by `correlation_id` |

## Scoring (summary)
- 6 hazards and weights: hurricane 25%, winter 20%, flood/rain 20%, severe storms (tornado + hail) 15%, wind 10%, heat 10%.
- Each hazard is scored 0–100 on a fixed absolute scale. Mixed hazards are 50% observed (Open-Meteo) + 50% FEMA annualized frequency.
- Overall = 60% weighted average + 40% highest hazard. Levels: Low 0–33, Medium 34–66, High 67–100.
- Confidence (High/Medium/Low) is computed in code from data completeness and the number of sources.
- Rolling 5-year window ending at the newest available day. The relative rank among hubs is shown next to the score.

## Steps (one branch + PR each; Yarden merges)
| # | Step | New env vars |
|---|---|---|
| 1 | Supabase project, scaffold, lint boundary, Vitest, env validation, error helper, schema + events, 36-hub seed, docs, session export | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` |
| 2 | Open-Meteo + FEMA clients, incremental paced ingest, first full load, check wind-gust distribution | — |
| 3 | Anchor values reviewed with real data → scoring test-first → snapshots | — |
| 4 | Agent: tools, answer schema + validation + retry, recommendation rules, chat history | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| 5 | Streaming `POST /api/chat`, `/api/widgets`, cron route, Basic Auth | `APP_USERNAME`, `APP_PASSWORD`, `CRON_SECRET` |
| 6 | UI: chat, 3 widgets, per-answer charts | — |
| 7 | Eval set (13 cases) + `npm run eval` (`--url` for deployed). **Revisit D57** (FEMA flood half capped for 15 hubs) if flood rankings look off | — |
| 8 | Model bakeoff (3–4 models: accuracy → cost → speed), lock in the winner | — |
| 9 | README, design doc, final assumptions | — |
| 10 | Deploy to Vercel, env vars, cron, run evals against live URL | (same, in Vercel) |
| 11 | Phase 1.5: Jev guard (`typesafe/jev-1.14`, cutoff 0.4, 2 s fail-open, last 2 turns) + guard evals + cutoff tuning | `JEV_MODEL` |

## Later (order to be chosen)
Themed login page · dust storm hazard (NOAA Storm Events) · US map widget · abuse/off-topic
hardening · score-change alerts · 7-day forecast + NWS active alerts · per-hub local
thresholds · hub volume weighting · voice.

## Eval cases (Step 7)
1. Midwest winter ranking. 2. Miami vs Houston hurricane + flood. 3. Denver % snow days 2025.
4. "Why is Dallas high?" premise check. 5. False premise (Seattle hurricane). 6. Follow-up "why that one?".
7. Overall top 5. 8. Unknown city (Boise). 9. Dust storm (not scored). 10. Decision question.
11. Off-topic. 12. "Last year" = 2025. 13. Confidence matches code.
