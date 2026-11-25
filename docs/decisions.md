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
| D14 | Store **daily rows** from 2021-01-01 up to **yesterday**. A **nightly cron** adds new days and re-fetches the last 7, because the newest values are preliminary and get revised. The first full load runs locally, paced. (Q11; corrected in Step 2: we expected about a 5-day lag, but the archive actually serves data up to yesterday.) | Open-Meteo counts about 6 years for one city as about 154 calls, and Vercel's shared IPs hit limits sooner. Most nights the cron only fetches 7 days per hub (a weight of 1 each). |
| D14a | The ingest is **incremental per hub**. FEMA is fetched only for hubs without a record. Weather covers missing days + the last 7. One hub failing never stops the others, and each failure is logged to `events`. | Safe to re-run any time. A new hub row is picked up automatically. |
| D14b | A **weighted rate limiter** (sliding windows for minute, hour and day, at 90% of Open-Meteo's free limits) runs inside the ingest, plus retries with backoff on 429/5xx. | We count Open-Meteo's "weighted calls" ourselves instead of finding out through errors. The full load takes about 1 hour because of the hourly limit. |
| D14d | HTTP uses the **built-in `fetch`** (wrapped once in `core/data/http.ts`), not axios. | Built into Node 22 and Vercel, so no extra dependency. Axios doesn't retry by default, so we'd need our own retry rules anyway. Tests pass in a fake fetch instead of a mocking library. The AI SDK and supabase-js use fetch too. Only one file would change if we ever switch. |
| D14c | The ingest **fails loudly if Open-Meteo's units change** (e.g. snowfall in inches) or FEMA fields go missing. Everything is validated with Zod before it's stored. | Wrong units are worse than no data. |
| D15 | Scores use a **rolling 5-year window** ending at the newest day. A snapshot is saved each night. (Q11) | Your idea. It makes "alert when a score changes" meaningful, and every season still counts 5 times. |

## Scoring

| # | Decision | Why |
|---|---|---|
| D16 | Scores are **deterministic TypeScript**, written test-first. The LLM never invents numbers. (Q25) | Assignment requirement. It also makes answers checkable. |
| D17 | **Absolute** fixed scales per hazard, not scores relative to other hubs. The **relative rank** is shown next to the score ("Winter 41/100 · #12 of 36"). (Q28) | Relative scores would shift when a city is added and would always label someone "High". The local-vulnerability concern (5 cm of snow paralyzes Atlanta) is a later improvement: per-hub local thresholds. |
| D18 | Mixed hazards = **50% observed + 50% FEMA**. FEMA "not applicable" counts as 0. (Q21; the rule for combining sub-signals inside each half was replaced by D49.) | Simple, explainable, symmetric. |
| D19 | Weights: hurricane 25%, winter 20%, flood 20%, severe storms 15%, wind 10%, heat 10%. Overall = 60% weighted average + 40% worst hazard. Levels Low 0–33 / Medium 34–66 / High 67–100. | Weighted by business impact. The "worst hazard" term keeps one severe hazard (Miami hurricanes) from being averaged away. |
| D20 | Thresholds: snow day ≥1 cm, heavy snow ≥15 cm, extreme cold min ≤−18 °C, heavy rain ≥50 mm, high wind gust ≥93 km/h **plus an advisory tier ≥72 km/h**, extreme heat apparent max ≥40 °C. One national value each. (Q28) | Checked against NWS criteria (links in assumptions.md). The extra wind tier exists because modeled data under-reports peak gusts. To be confirmed with real data in Step 2. |
| D20a | **Wind's observed signal = advisory-level gust days (≥ 72 km/h).** The warning-level count (≥ 93 km/h) is kept as a reported stat, not a scoring input, and the agent explains why when it's asked about wind. (Step 2 data check) | On all 36 hubs over 5 years, warning-level days ranged only 0–1/yr (13 hubs at 0). Modeled data smooths peaks. Advisory days ranged 0.2–8.6/yr and do separate the hubs. |
| D20b | **Honesty over precision:** when our data can't measure something well, the agent says so plainly instead of presenting a weak number as fact. | Yarden's principle: "I'd rather be honest with the user than tell them inaccurate data." It applies to every hazard, not just wind. |
| D21 | **Confidence is computed by code.** The LLM's value is overridden. The same goes for hubs mentioned and data used: they must match the tool results. (Q14; the rule itself was replaced by D51.) | Confidence is a number-like claim, so the LLM must not invent it either. |
| D22 | Every snapshot stores a **`scoring_version`**. | So that "we changed the formula" never looks like "Dallas got riskier" (no false alerts). |

### Scoring details (Step 3, decided from real data)
All numbers below live in **one file**, [`src/core/scoring/config.ts`](../src/core/scoring/config.ts). This table explains them. The file is the source of truth.

| # | Decision | Why |
|---|---|---|
| D47 | **FEMA signals: 100 = the 95th-percentile US county** (among counties where FEMA rates the hazard), and 0 events = 0. The values are frozen as constants. `npm run fema:anchors` recomputes them for review. (S1) | It's a national yardstick, so it doesn't move when we add hubs. At the 99th percentile no hub reached High, not even Miami (65.8), which made the levels useless. At the 95th, 8 Gulf/Florida/Plains hubs are High. |
| D48 | **Observed signals: 100 = a round "severe for a US metro" level.** Snow days 40/yr, extreme cold days 30/yr, heavy rain days 5/yr, gust days (≥72 km/h) 10/yr, heat days 60/yr. (S2) | There's no national dataset for these. Each anchor sits just above our worst hub, and its meaning is easy to say out loud ("two months of ≥105 °F feels-like"). |
| D49 | **Combining facets inside a hazard:** use the **worst facet (max)** when facets are different events that each stop trucks on their own (snow / extreme cold / ice; inland / coastal flood). **Average** when they're symptoms of the same storms (tornado + hail). (S4) | Averaging made Minneapolis's winter only 65, punishing it for not also having ice storms. Taking the max for storms put 9 hubs at 100 and killed the comparison. |
| D50 | **Heavy-snow days (≥15 cm) are not a score input**, only a reported stat with a caveat. (S3) | 23 of 36 hubs show 0, max 1.2/yr. Modeled data smooths daily snowfall, the same issue as wind (D20a). |
| D51 | **Confidence per hazard.** High: data ≥95% complete, and either a single long-record FEMA source or two sources that **agree** within 40 points. Medium: sources **disagree** by >40 points, or 80–95% complete. Low: <80% complete or a source missing. Hub confidence = its weakest hazard. Answer confidence = the weakest hazard it used. (S5) | The old "one source = Medium" rule would have made hurricane always Medium, even though FEMA's ~170-year record is our strongest data. Disagreement between sources is a real warning sign, and it automatically catches artifacts like D52. |
| D52 | **Mountain counties inflate FEMA winter numbers** (Seattle/King County includes the Cascades, Salt Lake County the Wasatch). We document it and let D51 flag it. No manual correction. (S6) | Honest and automatic. Hand-tuning individual hubs would be guesswork. |
| D53 | **Tornado is scored per area**: FEMA frequency ÷ county area (tornadoes/yr per 1,000 sq mi), with 100 = national p95. Adds `fema_nri.county_area_sq_mi` and an `--refresh-fema` ingest flag. **Inland flood is not normalized**, but is flagged for huge counties. (S7) | FEMA spreads tornado frequency by county area (since v1.18). Within each state, area vs tornado frequency has a rank correlation of +0.62. Raw values made Phoenix (9,319 sq mi) look tornado-prone. A warehouse is a point, so density is what matters. Flood "event-days anywhere in the county" doesn't divide cleanly by area, and its size effect is mild (+0.21). |
| D54 | Scoring runs **at the end of every ingest** (same run ID) and on demand with `npm run score`. A **rank among hubs is computed when read, never stored**. `scoring_version = "v1"`. (S8) | One source of truth: a stored rank would go stale when hubs are added. |
| D55 | Scoring window = the **last 1,826 days** (5 years) ending at the hub's newest stored day. Rates are per year: count × 365.25 ÷ days with data. | Every season counts 5 times, and missing days don't drag rates down. |
| D56 | **The "sources disagree" check compares like with like.** Winter compares observed snow/cold with FEMA's winter weather/cold wave. Ice storms still count in the score, but only FEMA can see them, so they're left out of the check. **Flood has no cross-check** (heavy-rain days ≠ county-wide flood warnings) and instead gives a standing caveat. Wind and heat are compared directly. (S9) | The first live run flagged **32 of 36** hubs Medium, so the label meant nothing. Flood (26 hubs) and winter's ice (12) were structural differences, not data problems. After the fix: **15 of 36**, each with a nameable reason, and the only winter flag is Seattle, the mountain-county artifact D52 was meant to catch. |
| D57 | **Known limitation, to revisit:** the FEMA flood half is capped at 100 for **15 of 36** hubs, because big metro counties issue flood warnings far more often than the typical county. The observed half still separates them. Kept for v1. **Revisit in Step 7 if the evals show flood ranking problems.** (S10) | The alternative, a special anchor for flood, breaks the "same rule for every FEMA signal" consistency. We'd want evidence before doing that. |
| D58 | The **trial snapshots** (36 rows, scored under the superseded confidence rule) were **deleted**, and `scoring_version` stays **v1** for the corrected formula. The deletion is logged as a `scoring.snapshots_deleted` event. (S11) | v1 had never been shown to anyone, so the history starts clean, and the audit trail still records what happened. |

## Agent & API

| # | Decision | Why |
|---|---|---|
| D23 | 4 tools: `rank_hubs`, `compare_hubs`, `get_weather_stat`, `explain_hub_score`. The hub list goes in the system prompt. (Q22) | Maps one-to-one to the question types in the brief. |
| D24 | Final answer is a **Zod-validated JSON** object: answer, outOfScope, hubsMentioned, dataUsed, premiseCheck, confidence, assumptions, limitations, followUpSuggestions, recommendation. Invalid → retry once → clear error. (Q23) | Assignment requirement: structured output between the LLM and our code. |
| D25 | **Conversation memory is stored on the server** (Supabase) by `sessionId`, including tool results. (Q12) | Follow-ups like "why that one?" reuse exact numbers. The client can't tamper with history. Gives an audit trail. |
| D26 | **Streaming**: progress lines and answer text stream live. The data panel appears only after the final JSON passes validation. (Q13) | Better UX (your call) without giving up validation. |
| D27 | LLM via **OpenRouter**, model in `OPENROUTER_MODEL`. Start with a strong model, then **pick the final one by a bakeoff on our eval set** (accuracy → cost → speed) before deploy. (Q15) | You can't choose the "right model" fairly without a measurement. |
| D28 | **Vercel AI SDK v7** (current major). | Supports tools and a validated structured output in one streaming call. |

### Agent details (Step 4, round G1–G14)
| # | Decision | Why |
|---|---|---|
| D59 | **Tool contracts** (G1): `rank_hubs` (metric, region?, order, limit → score, level, **rank among all 36**), `compare_hubs` (2–5 hubs, hazards? → both halves + confidence), `get_weather_stat` (hub, metric, year/month, range or last 12 months → count, % of days with data, coverage), `explain_hub_score` (full breakdown with the formula **and its numbers**). | Matches the brief's question types. The formula string is built by code, so the model never does arithmetic. |
| D60 | **Units** (G2, G2b): tools return thresholds in both systems, converted **in code**. Answers lead with the user's system and put the other in brackets. A **US/Metric switch** in the UI flips data panels and charts instantly and sets the system for new answers. Past answer text stays as written. | US analysts first, but not everyone uses US units. The LLM never converts numbers. Re-asking on every flip would cost money and could change wording. |
| D61 | **"The LLM never invents numbers", enforced** (G3): every `dataUsed` value must match a number a tool returned (allowing display rounding), or the answer fails → one retry → clear error. Numbers in the free text that no tool returned are **logged as warnings**, not blocked. | Hard-checking structured data is reliable. Hard-checking prose would misfire on years, "5-year window" and so on. |
| D62 | **Standing caveats are guaranteed by code** (G4), in one file (`scoring/caveats.ts`), built from the config thresholds. The model can add limitations but can't drop ours. | Honesty over precision (D20b), enforced rather than hoped for. |
| D63 | **The premise verdict is decided by code** (G5): the model only extracts the claim (hub, hazard, claimed level). Code compares it with the real level. | "Why is Seattle's hurricane risk high?" gets corrected by data, not by the model's judgment. |
| D64 | **Answer confidence by code** (G6): the weakest confidence of the data used. Weather stats use coverage. Out-of-scope or data-free answers get none. | Same principle as D21. |
| D65 | **Memory** (G7): the last **10 turns**, including tool results. Follow-ups may reuse numbers from **earlier tool results in the same conversation**, so the validator trusts those too. | The first live follow-up was wrongly rejected (the validator only trusted the current turn), which forced a needless retry. Fixed test-first. |
| D66 | **Limits** (G8, G14): message ≤ 1,000 chars, ≤ 6 tool steps, timeouts 60 s total / 25 s per step / 10 s per tool, **≤ 3,000 output tokens per step** (raised from 1,500), 1 retry on invalid answers. Answers are capped at ~250 words and ≤ 12 `dataUsed` numbers. Model limitations are answer-specific only. Prompt: "1–3 tool calls are usually enough". | The first live answer was cut off mid-JSON at 1,500 tokens (`finish=length`) because the answer was bloated and the model over-explored (6 tool calls). |
| D67 | **Starting model** (G9): `anthropic/claude-sonnet-5.5` ($2 / $10 per 1M tokens). The Step 8 bakeoff compares it with GPT-6.1-terra, Gemini-4-hydrogen and Haiku-5.5. OpenRouter IDs use a dot (`5.5`). | Reliable tool use while building. Measured, not guessed, later. |
| D68 | **Testing** (G10): the agent loop is unit-tested with the AI SDK's mock model (tool calls, streaming, retry, failure, memory). Real-LLM checks run via `npm run ask` and, in Step 7, the evals. | Free and deterministic tests. Real model behavior is measured separately. |
| D69 | **"Last year" from today's date** (G11), passed to the model, so it stays right next year. **Hub ids are a Zod enum of active hubs** (G12), built per request, so the model can't call a tool with an unknown hub. | Time-proof and data-driven (adding a hub row extends the enum). |
| D70 | **One shared definition of each "hazard day"** (`scoring/dayMetrics.ts`), used by both scoring and the weather-stat tool. Caveat texts and prompt text are generated from it. | Single source of truth: "snow day" can't mean two things. |
| D72 | **"Had snowfall" = measurable snow, ≥ 0.1 in (0.254 cm)**, the NWS bar below which snowfall is a "trace" ([NWS](https://www.weather.gov/mrx/pfm_explain), [Snow Measurement Guidelines](https://www.weather.gov/media/coop/Snow_Measurement_Guidelines-2014.pdf)). It's a reported-only metric. The agent also gives the stricter scored "snow day" (≥ 0.4 in / 1 cm). Each reported-only metric states *its own* reason for not being scored. (G13) | Denver 2025: any snowfall > 0 = 11.8% (model trace values as small as 0.07 cm), measurable = **9.0%** (33 days), scored snow days = 4.7%. Showing both is honest, and the brief's question gets a defensible number. |
| D71 | **One entry point, `answerQuestion`**, used by `npm run ask` and (Step 5) `POST /api/chat`. It logs `agent.answered`, `agent.retry` and `agent.failed` events with tokens, tools, confidence and premise result. | One path to test and observe. |

## Safety & access

| # | Decision | Why |
|---|---|---|
| D29 | **Username + password** on the whole site and API (Basic Auth now, themed login page later). $20 credit cap on the OpenRouter key. Message-length and agent-step limits. (Q16) | Stops strangers spending the LLM budget. Simplest thing that works first. |
| D30 | Out-of-scope guard: **Jev (`typesafe/jev-1.14`) via OpenRouter**, pinned version. Decline below **0.4** probability of being in scope. Give up after 2 s and let the question through. Jev sees the last 2 turns. Every decision is logged. (Q19, Q20, Q26) | 0.4 is a middle ground. Too high a cutoff refuses real follow-ups like "why?". The final cutoff will be tuned on eval data. More abuse protection is planned later. |

### API details (Step 5, round A1–A5)
| # | Decision | Why |
|---|---|---|
| D73 | **`POST /api/chat` streams the AI SDK chat protocol** (A1): `data-session` first, then `data-progress` (one per tool call, updated in place, with friendly labels like "Breaking down Dallas's risk score…"), then answer text deltas, `data-retry` if validation failed (the UI drops the draft), and finally `data-answer` (validated) **or** `data-error`. Body: `{ sessionId \| null, message, units }`, Zod-validated. | The UI can show live progress *and* only trust the validated answer. The stream builder lives in `src/core/api` so it's unit-tested without Next.js. |
| D74 | **Two auth layers** (A2): `src/proxy.ts` (Basic Auth on everything except `/api/cron` and static assets) **plus** a re-check inside every API route, using one constant-time function (`core/security/auth.ts`). Cron accepts only `Bearer <CRON_SECRET>`. | Next 16's own docs say proxy alone isn't a full authorization solution. Constant-time comparison avoids timing leaks. |
| D75 | **Nightly job at 06:00 UTC** (`vercel.json`), running the same `runIngestThenScore` as the CLI. `maxDuration` 300 s (measured: 60 s). Status 207 if some hubs failed. | Open-Meteo has yesterday's data by then. Hobby cron fires within the hour. |
| D76 | **Friendly errors, UX-first** (A4, "even friendlier"): every error is `{ code, message, hint, retryable }`. **All copy lives in `core/errors/userErrors.ts`**. In the stream it arrives as a structured `data-error` (not bare text), so the UI can show the hint and a "Try again" button. Technical detail only goes to logs and `events`. | Yarden: "we care a lot about UX". The model-failure message stays honest: "I couldn't put together an answer I can stand behind… I'd rather say so than guess." |
| D77 | **`GET /api/widgets`** (A5): top 5 hubs, leader per hazard, data freshness. A pure, tested function over the latest snapshots. No health route. | Deterministic dashboard data, and fewer routes. |
| D78 | GET routes call **`await connection()` first**, outside try/catch. | With Cache Components on, Next tried to prerender them at build. Reading headers threw its "bail out" signal, which our try/catch swallowed. Next's docs recommend `connection()`. |
| D79 | `AgentInputError` moved to `core/errors/`, and its messages are friendlier ("That message is too long for me — please keep it under 1,000 characters."). | Error classes belong with errors. The error module no longer pulls in the whole agent. |

### UI details (Step 6, round U1–U8)
| # | Decision | Why |
|---|---|---|
| D80 | **Layout** (U1): side nav (chats) · chat · overview column. Phone: the overview becomes a **swipe strip** above the chat. Tablet: a row of three. Desktop: the right column. Dark glass, Roboto. | The chat stays primary on every screen size. |
| D81 | **The answer card** (U2), top to bottom: premise banner (code-decided) → text → visuals → recommendation (with disclaimer) → confidence → collapsible "Assumptions & limits" and "How I got this" → follow-up chips. While it works: live progress lines, then streaming text. On a failed check: "Double-checking my numbers…". On failure: a soft card with a hint and "Try again". | Live but trustworthy: only the validated answer gets the data panel. |
| D82 | **Visuals only where they add something the text can't** (U3, U3b, Yarden: "are visuals adding value?"). **Score breakdown** (where a hub's score comes from), **comparison grid** (hubs × hazards at a glance), **seasonality strip** (*when* hazard days happen), and a plain **ranked list** for rankings. Built in HTML/CSS, **no chart library** (Recharts dropped). Chosen by code from the tool results, at most 2 per answer. | Bar charts of numbers the text already states are clutter. Each kept visual answers a question the prose can't. |
| D83 | **US/Metric switch** (U4): the weather-stat tool also returns its threshold in both systems (`thresholdBySystem`) and counts by month (`byMonth`). The explain tool returns each hazard's points (`contributions`, `worstHazardBoost`). All computed in code. | The switch flips panels instantly (D60), and the visuals never do arithmetic in the browser. |
| D84 | **Chat history** (U5, U5b): a refresh starts a new chat, the side nav lists **this browser's chats only** (ids in localStorage), and opening one restores its questions and validated answers. New endpoints: `GET /api/chat/sessions?ids=…`, `GET /api/chat/history?sessionId=…`. Retry feedback is hidden from transcripts. | Everyone shares one login, so "all chats" would expose other visitors' conversations. Real per-user history needs real accounts (later). |
| D85 | **Dependencies** (U6): `@ai-sdk/react` 4.0.186 (pins our `ai` 7.0.181) for `useChat`, and `react-markdown` (no raw HTML). | Standard, less custom code. Verified compatible before installing. |
| D86 | **Accessibility** (U7): the streaming answer is announced (`aria-live`), Enter sends / Shift+Enter adds a line, native `<details>`, visible focus rings, reduced motion respected, colors always paired with text labels. **Personality** (U8): the cat in the empty state and friendly errors, the owl wordmark. Answers stay plain. | Readability first, a little warmth around it. |
| D87 | **Tool output types are imported by the UI** from exported tool builder functions (`ExplainHubScoreOutput`, …). No duplicated shapes. | Single source of truth: a tool change can't silently break a visual. |
| D88 | **No Markdown tables in answers** (prompt rule). The UI draws grids from the data. | A model-written table rendered as raw pipes, and it duplicated the comparison grid. |


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
| D42 | **Project rules live in `CLAUDE.md`** (auto-read by Claude Code). Its first line `@AGENTS.md` pulls in the Next.js notice without copying it. (R5) | One place for how we work. Committed so reviewers can see the process. |
| D43 | **Decide together:** Claude asks before anything that changes product behavior, data, architecture, dependencies, schema, scoring or UX. Mechanical things get done and logged. (R7) | We're a team. Earlier, D36–D39 and D14a–c were decided by Claude without asking first. |
| D44 | **Errors are caught at boundaries; pure functions throw plain errors.** This clarifies "always try/catch". (R1) | Avoids swallowed or triple-wrapped errors while keeping the unified format. |
| D45 | **Every external call has a timeout, including Supabase** (wrapped `fetch`, landing with Step 2). (R2) | Writing the rule exposed that Supabase calls had no timeout and could hang forever. |
| D46 | **Mirrored facts get drift tests:** event sources and Census regions vs DB constraints, env schemas vs `.env.example`. Docs link to the scoring config instead of restating the numbers. (R3) | Single source of truth. Where a copy is unavoidable, drift fails a test instead of going unnoticed. |
