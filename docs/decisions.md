# Decision log

Every choice we made, and why, in plain language. Newest at the bottom of each section.
"Q#" refers to the question number in the planning session (`docs/session/`).

## Product & scope

| # | Decision | Why |
|---|---|---|
| D1 | Name: **The Daily Prophet**. Original design, no Harry Potter logos, fonts, crests or characters. | Fun theme without copying anyone's brand. |
| D2 | **36 hubs**, one per major US metro, stored as rows in the database. Adding a city = adding a row. | The brief asked for 25–50 metros and for hubs to be data, not code. |
| D3 | "Midwest", "South" and so on use the **official US Census regions**. | Gives "Which Midwest hubs…" a clear, quotable definition. |
| D4 | A hub's location is the **city-center point**. FEMA data comes from the county that point is in. | Simple and consistent. A real warehouse can sit elsewhere in the metro (written down as an assumption). |
| D5 | **6 hazards**: winter (snow, cold, ice), flood/heavy rain, high wind, extreme heat, hurricane, severe storms (tornado + **hail**). (Q6) | Hail is one of the costliest hazards for trucks and roofs. Folding it into "severe storms" keeps 6 hazards and the same weights. |
| D6 | **Dust storms: not in Phase 1.** Added as the first feature after deploy, using NOAA Storm Events. (Q5, Q27) | We checked: it *is* possible, but it only matters for about 3 hubs and would add a data source to the critical path. Until then the agent says "not scored yet". |
| D7 | "Last year" = **calendar year 2025** by default. The agent says which period it used and offers the other one ("last 12 months"). (Q11) | Avoids ambiguity. Shows its work. |
| D8 | Answers to "should we invest in X?" carry a **recommendation**, and **code** adds a fixed disclaimer: weather exposure only, the final call belongs to the team. (Q23) | Analysts want a decision aid, but no one should trust an LLM 100%. |

## Data

| # | Decision | Why |
|---|---|---|
| D9 | **Open-Meteo historical archive** for snow, cold, rain, wind and heat. **FEMA National Risk Index v1.20** (public ArcGIS service, no key) for hurricane, tornado, hail, flood, ice storm, winter weather, cold wave, strong wind and heat wave. | Both are free public APIs. FEMA covers the rare-event hazards that 5 years of daily weather can't measure well. |
| D10 | Use FEMA **wherever it has the hazard**, not just for 4 hazards. (Q7) | Two sources per hazard is sturdier. The modeled weather data smooths out wind gusts, so FEMA balances that. "How many sources" then means something for confidence. |
| D11 | From FEMA, use **annualized frequency** (events per year), not FEMA's "risk score". (Q8) | FEMA's risk score ranks counties against each other and mixes in population and building value. Frequency is absolute and closest to "how often does this shut a hub down". |
| D12 | FEMA renamed riverine flood **RFLD → IFLD (Inland Flooding)**. Flood uses IFLD + CFLD (coastal). | Found while researching v1.20. |
| D13 | Data is fetched by an **ingest job**, not while a user chats. Tools only read the database. (Q11) | Fast, repeatable answers. Evals stay stable. External outages don't break chat. |
| D14 | Store **daily rows** from 2021-01-01 up to the newest available day. A **nightly cron** adds new days and re-fetches the last 7 (Open-Meteo revises them, about a 5-day lag). The first full load runs locally, paced. (Q11) | Open-Meteo counts 5 years for one city as about 130 calls, and Vercel's shared IPs hit limits sooner. Most nights the cron only fetches a few days. |
| D15 | Scores use a **rolling 5-year window** ending at the newest day. A snapshot is saved each night. (Q11) | Your idea. It makes "alert when a score changes" meaningful, and every season still counts 5 times. |

## Scoring

| # | Decision | Why |
|---|---|---|
| D16 | Scores are **deterministic TypeScript**, written test-first. The LLM never invents numbers. (Q25) | Assignment requirement. It also makes answers checkable. |
| D17 | **Absolute** fixed scales per hazard, not scores relative to other hubs. The **relative rank** is shown next to the score ("Winter 41/100 · #12 of 36"). (Q28) | Relative scores would shift when a city is added and would always label someone "High". The local-vulnerability concern (5 cm of snow paralyzes Atlanta) is a later improvement: per-hub local thresholds. |
| D18 | Mixed hazards = **50% observed + 50% FEMA**, with sub-signals averaged within each half. FEMA "not applicable" counts as 0 with full confidence. (Q21) | Simple, explainable, symmetric. |
| D19 | Weights: hurricane 25%, winter 20%, flood 20%, severe storms 15%, wind 10%, heat 10%. Overall = 60% weighted average + 40% worst hazard. Levels Low 0–33 / Medium 34–66 / High 67–100. | Weighted by business impact. The "worst hazard" term keeps one severe hazard (Miami hurricanes) from being averaged away. |
| D20 | Thresholds: snow day ≥1 cm, heavy snow ≥15 cm, extreme cold min ≤−18 °C, heavy rain ≥50 mm, high wind gust ≥93 km/h **plus an advisory tier ≥72 km/h**, extreme heat apparent max ≥40 °C. One national value each. (Q28) | Checked against NWS criteria (links in assumptions.md). The extra wind tier exists because modeled data under-reports peak gusts. To be confirmed with real data in Step 2. |
| D21 | **Confidence is computed by code** from data completeness and the number of sources. The LLM's value is overridden. The same goes for hubs mentioned and data used: they must match the tool results. (Q14) | Confidence is a number-like claim, so the LLM must not invent it either. |
| D22 | Every snapshot stores a **`scoring_version`**. | So that "we changed the formula" never looks like "Dallas got riskier" (no false alerts). |

## Agent & API

| # | Decision | Why |
|---|---|---|
| D23 | 4 tools: `rank_hubs`, `compare_hubs`, `get_weather_stat`, `explain_hub_score`. The hub list goes in the system prompt. (Q22) | Maps one-to-one to the question types in the brief. |
| D24 | Final answer is a **Zod-validated JSON** object: answer, outOfScope, hubsMentioned, dataUsed, premiseCheck, confidence, assumptions, limitations, followUpSuggestions, recommendation. Invalid → retry once → clear error. (Q23) | Assignment requirement: structured output between the LLM and our code. |
| D25 | **Conversation memory is stored on the server** (Supabase) by `sessionId`, including tool results. (Q12) | Follow-ups like "why that one?" reuse exact numbers. The client can't tamper with history. Gives an audit trail. |
| D26 | **Streaming**: progress lines and answer text stream live. The data panel appears only after the final JSON passes validation. (Q13) | Better UX (your call) without giving up validation. |
| D27 | LLM via **OpenRouter**, model in `OPENROUTER_MODEL`. Start with a strong model, then **pick the final one by a bakeoff on our eval set** (accuracy → cost → speed) before deploy. (Q15) | You can't choose the "right model" fairly without a measurement. |
| D28 | **Vercel AI SDK v7** (current major). | Supports tools and a validated structured output in one streaming call. |

## Safety & access

| # | Decision | Why |
|---|---|---|
| D29 | **Username + password** on the whole site and API (Basic Auth now, themed login page later). $20 credit cap on the OpenRouter key. Message-length and agent-step limits. (Q16) | Stops strangers spending the LLM budget. Simplest thing that works first. |
| D30 | Out-of-scope guard: **Jev (`typesafe/jev-1.14`) via OpenRouter**, pinned version. Decline below **0.4** probability of being in scope. Give up after 2 s and let the question through. Jev sees the last 2 turns. Every decision is logged. (Q19, Q20, Q26) | 0.4 is a middle ground. Too high a cutoff refuses real follow-ups like "why?". The final cutoff will be tuned on eval data. More abuse protection is planned later. |

## Engineering

| # | Decision | Why |
|---|---|---|
| D31 | **One Next.js app** with `src/core/` free of Next.js and React, **enforced by an ESLint rule**. (Q1) | Core logic can be tested and run from scripts and evals without the web framework. Simpler than a monorepo. |
| D32 | Supabase project **`daily-prophet` in us-east-1**, close to Vercel's default region. (Q2) | Low latency between the app and the DB. |
| D33 | **RLS on every table with no policies.** Only the server (secret key) can read or write. The browser never talks to the DB. | Nothing is exposed even if the public key leaks. |
| D34 | **Every table has `created_at` + `updated_at`** (a trigger keeps `updated_at` current), plus an **`events`** table that replaces a separate `ingest_runs` table. | Your standing rule: be able to track and analyze everything. One events table covers runs, failures, retries and guard decisions. |
| D35 | Errors at boundaries use **`ErrorName \|\| message \|\| function \|\| emoji`**, with a fixed emoji per boundary: 🦉 LLM, 🐸 Open-Meteo, 🦡 FEMA, 🐘 database, 🦄 API route, 🐍 Jev, 🦔 config. Users only see a clean `{error:{code,message}}`. (Q17) | Your format. A fixed emoji makes logs searchable by origin. |
| D36 | Hub IDs are **readable slugs** (`kansas-city`), not airport codes. | Clearer for the LLM, logs and humans. |
| D37 | **Tailwind CSS** for styling (it ships with the Next.js starter). | Fast to build the glass UI, and no extra dependency. |
| D38 | The hub seed is a **SQL migration**. Migrations are applied through the Supabase connection and also saved in `supabase/migrations/`. | The database can be rebuilt from the repo. |
| D39 | `@types/node` bumped to **v22** to match Node 22 (Vitest 5 requires it). | Fixes the install conflict. Matches the runtime. |
| D40 | **PR per step.** Claude opens it, Yarden reviews and merges. Claude never pushes to `main` (except the single empty initial commit an empty repo needs as a PR base). (Q3) | Review before anything lands. |
| D41 | The session log is exported to `docs/session/` with **private details scrubbed** (emails, keys, home path, login codes). The model's private reasoning blocks and internal bookkeeping records are left out. (Q4) | The assignment requires the full session, and the repo is public. |
