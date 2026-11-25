# Sneakoscope

<img src="src/app/icon.svg" width="56" alt="Sneakoscope icon: a glass spinning top with a glowing core" />

A weather-risk assistant for a logistics company's **36 US distribution hubs**. Analysts ask in plain English
which hubs are most exposed to severe weather, compare hubs, and find out *why* a hub is risky, to decide where
to invest in resilience upgrades.

**Every number comes from tested code, never from the AI.** The AI only picks which calculation to run and explains
the result, and code checks the explanation before you see it.

![Sneakoscope: three panels (your chats, the conversation with a Miami vs Houston comparison grid, and the overview with recent changes, top hubs and hazard leaders), all on one screen](docs/screenshots/desktop-conversation.png)

More screenshots: [start screen](docs/screenshots/desktop-start.png) · [phone](docs/screenshots/phone-start.png).

## Contents
- [Try it](#try-it)
- [What you can ask](#what-you-can-ask)
- [How it works, in one minute](#how-it-works-in-one-minute)
- [Assignment requirements: where each one is met](#assignment-requirements-where-each-one-is-met)
- [Run it locally](#run-it-locally)
- [Deploy your own copy](#deploy-your-own-copy)
- [Scripts](#scripts)
- [API](#api)
- [Evals](#evals)
- [Project docs](#project-docs)
- [Data attribution](#data-attribution)

## Try it
- **Live app: https://sneakoscope.vercel.app**
- **No sign-in needed.** Just open the link. To protect the shared budget, each visitor can ask **20 questions per
  10 minutes and 100 per day**, and everyone together **300 per day**.
- Click one of the example questions on the start screen, or type your own. Answers use US units. The screen has
  three panels: **your chats** (reopen earlier ones), the **conversation**, and the **overview**. On a phone they're
  tabs at the bottom.

## What you can ask
The four questions from the brief, all answered by the agent (see the real answers in
[docs/examples.md](docs/examples.md)):

| Question | What happens |
|---|---|
| *Which hubs in the Midwest are most exposed to winter disruption?* | Ranks the Midwest hubs by their winter score |
| *Compare Miami and Houston in terms of hurricane and flood exposure.* | Side-by-side scores, and where each one comes from |
| *What percentage of days last year had snowfall in Denver?* | Counts the days in calendar 2025 from daily weather data, month by month |
| *Why is the Dallas hub's weather disruption risk high?* | Checks the claim first, then breaks the score down hazard by hazard |

It also handles follow-ups (*"Why that one?"*), pushes back on false premises (*"Why is Seattle's hurricane risk
so high?"* → it isn't), gives careful recommendations (*"Should we prioritize Houston or Denver?"*), and politely
declines what it can't answer (cities that aren't hubs, off-topic requests). A guard checks every message first, so
off-topic requests and attempts to change its rules get a friendly reply without running the AI agent at all.

**Score-change alerts (bonus):** after the nightly update, any hub whose risk level changed or whose score moved 10+
points shows up under **Recent changes** in the overview, where it can be dismissed.

**Voice (bonus): conversation mode.** Click the sound-waves button next to the question box and just talk: it sends
your question when you pause, reads the answer aloud, then listens for the next one. Click the button again, or stay
silent, to end it. Every answer also has a 🔊 **Listen** button. It all runs in the browser (Chrome, Edge and Safari for
speaking; reading aloud works in all modern browsers), and the buttons are hidden where a browser can't do it.

## How it works, in one minute
1. The chat page sends your question to **our own API** (`POST /api/chat`), never straight to an AI.
2. The agent gives an AI model (`openai/gpt-6.1-terra`, via OpenRouter) **four tools**: rank hubs, compare hubs,
   count weather days, explain a hub's score. The tools do all the math, from data in our database.
3. The model writes a **structured answer** (a JSON schema). Code then checks every hub and number in it against
   what the tools actually returned. If something doesn't match, the model gets one retry; if that fails too, you get
   a clear error instead of a wrong answer.
4. Code, not the model, sets the **confidence level**, decides whether the question's **premise** is true, and adds
   the **data limits** and a **disclaimer** on recommendations.
5. Every night a job fetches the newest weather and **re-scores all hubs**.

The full picture, with diagrams and links down to the line of code: **[docs/design.md](docs/design.md)**.

## Assignment requirements: where each one is met
| # | Requirement | Where |
|---|---|---|
| 1 | Public APIs for weather and hazard data | Open-Meteo weather archive + FEMA National Risk Index: [src/core/data/](src/core/data/), [design §6](docs/design.md#6-where-the-data-comes-from-ingest-and-the-nightly-job) |
| 2 | Deterministic scoring in code, not LLM output | [src/core/scoring/](src/core/scoring/) (pure, unit-tested), [design §5](docs/design.md#5-how-a-hubs-risk-score-is-computed) |
| 3 | Explain reasoning clearly | `explain_hub_score` returns the full breakdown, and the UI draws it: [design §4](docs/design.md#4-one-question-end-to-end), [examples](docs/examples.md) |
| 4 | Conversational follow-ups, history per session | `chat_sessions` / `chat_messages`, last 10 turns: [src/core/db/chatRepository.ts](src/core/db/chatRepository.ts), eval case `follow-up` |
| 5 | A chat interface | [src/app/_components/](src/app/_components/), [screenshots](docs/screenshots/) |
| 6 | The UI uses `POST /api/chat`, never the LLM | [src/app/api/chat/route.ts](src/app/api/chat/route.ts); the UI only calls our routes ([API](#api)) |
| 7 | Zod-validated tool inputs and final answer; retry once, then a clear error | [src/core/agent/answerSchema.ts](src/core/agent/answerSchema.ts), [src/core/agent/finalizeAnswer.ts](src/core/agent/finalizeAnswer.ts), [design §3](docs/design.md#3-how-the-llm-is-kept-from-inventing-numbers) |
| 8 | 10–15 eval questions, `npm run eval` with pass/fail and a total | 13 cases in [evals/cases.ts](evals/cases.ts); results in [docs/evals.md](docs/evals.md) |
| 9 | Assumptions, uncertainty and scope, in docs and in answers | [docs/assumptions.md](docs/assumptions.md); every answer carries a code-computed confidence, assumptions and limitations |
| 10 | README, short design doc, Vercel deployment | This file, [docs/design.md](docs/design.md), live at https://sneakoscope.vercel.app |

## Run it locally
**You need:** Node 22+, a free [Supabase](https://supabase.com) project, and an [OpenRouter](https://openrouter.ai) API key.

**1. Install and configure**
```bash
npm install
cp .env.example .env.local     # then fill in the values
```

| Variable | Needed for | Where to get it |
|---|---|---|
| `SUPABASE_URL` | everything | Supabase → Project Settings → Data API |
| `SUPABASE_SECRET_KEY` | everything (server-only) | Supabase → Project Settings → API Keys → Secret keys |
| `OPENROUTER_API_KEY` | the agent, evals | openrouter.ai → Keys (set a credit limit) |
| `OPENROUTER_MODEL` | the agent | keep `openai/gpt-6.1-terra` (chosen by the [bakeoff](docs/bakeoff.md)) |
| `JUDGE_MODEL` | evals | keep `google/gemini-3.5-flash-lite` (must be a different provider than the model) |
| `JEV_MODEL` | the out-of-scope guard | keep `typesafe/jev-1.14-20261014` (the cutoffs were tuned on this exact version) |
| `CRON_SECRET` | the nightly job | 16+ random characters |
| `SESSION_LOG_PATHS`, `SESSION_SCRUB_TERMS` | optional: session log export | see [.env.example](.env.example) |

**2. Create the database.** Run the SQL files in [supabase/migrations/](supabase/migrations/) in order (Supabase SQL
editor or CLI). They create the tables and add the 36 hubs.
```bash
npm run db:check               # should list the 36 hubs by region
```

**3. Load the data.** The first full load fetches 5 years of daily weather for 36 hubs and takes **about an hour**,
because it stays under Open-Meteo's free rate limits. It scores every hub when it finishes. After that it only fetches
new days.
```bash
npm run ingest
```

**4. Start the app** and open http://localhost:3000.
```bash
npm run dev
```

## Deploy your own copy
1. **Import** the repo in Vercel (it's detected as Next.js through [vercel.json](vercel.json), which also pins the
   region next to the database and schedules the nightly job).
2. **Environment variables** (Production): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`,
   `OPENROUTER_MODEL`, `JEV_MODEL`, `CRON_SECRET`. Mark the secret ones as *sensitive*. `JUDGE_MODEL` is only needed
   for evals.
3. **Firewall rule** (flood protection for every route, D114). In the Vercel dashboard: your project → **Firewall** →
   **Configure** → **+ New Rule**:
   - *Name:* `flood shield`
   - *If:* **Request Path** **starts with** `/`
   - *Then:* **Rate Limit**, **Fixed Window**, **60 seconds**, **100 requests**, keyed by **IP**, action
     **Too Many Requests (429)**
   - **Save**, then **Publish**.
4. Merge to `main`: Vercel deploys it. The nightly job runs at 06:00 UTC (Hobby plans run it within that hour).

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm test` | Unit tests (Vitest), including a check that every code link in these docs still points at the right line |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint, including the rule that keeps `src/core` free of Next.js |
| `npm run db:check` | Connect to Supabase and list the hubs per region |
| `npm run ingest` | Fetch new FEMA and Open-Meteo data for all hubs, then re-score. Add `-- --hub=dallas,denver` for some hubs only, or `-- --refresh-fema` to re-fetch FEMA |
| `npm run score` | Re-score all hubs from the stored data (no API calls) |
| `npm run ask -- "question"` | Ask the real agent from the terminal. Add `--session=<id>` for a follow-up |
| `npm run eval` | Run the 13 eval cases ([Evals](#evals)) |
| `npm run eval:guard` | Run the 32 guard cases through the out-of-scope guard ([Evals](#evals)) |
| `npm run alerts:test` | Record one clearly marked test score-change alert, to see the "Recent changes" card |
| `npm run bakeoff -- <results.json …>` | Compare models from saved eval runs → [docs/bakeoff.md](docs/bakeoff.md) |
| `npm run fema:anchors` | Recompute the national FEMA reference values, to review before changing the scoring config |
| `npm run session:export -- <file.jsonl>` | Export the AI coding session to [docs/session/](docs/session/), with private details removed |

## API
The app has no login, so every route is open, except the nightly job, which needs `CRON_SECRET`.

| Route | What it does |
|---|---|
| `POST /api/chat` | Ask a question. Body: `{ "sessionId": null \| "<uuid>", "message": "…" }` (answers use US units). Streams (AI SDK chat protocol): `data-session`, `data-progress` per tool, the answer text, then `data-answer` (the checked answer) or `data-error` |
| `GET /api/chat/sessions?ids=a,b` | Titles and dates of earlier chats (the ids this browser remembers) |
| `GET /api/chat/history?sessionId=<uuid>` | Reopen an earlier chat: its questions and checked answers |
| `GET /api/widgets` | The overview panel: top 5 hubs, the leading hub per hazard, data freshness |
| `GET /api/alerts` | Score-change alerts of the last 30 days (a hub's level changed, or its score moved 10+ points) |
| `POST /api/alerts/test` | Records one clearly marked test alert (for demos). Needs `Authorization: Bearer <CRON_SECRET>` |
| `GET /api/evals/latest` | The latest eval run (from the app or `npm run eval`) and whether a new run can start now |
| `POST /api/evals/run` | Run the evals from the app. Streams one JSON line per event (start, judge self-test, each question, done). Limited for everyone together: 1 run per 30 minutes, 4 per day, never two at once (429 with the time the next run is possible) |
| `GET /api/cron/ingest` | The nightly job (Vercel Cron, 06:00 UTC): fetch new weather, then re-score. Needs `Authorization: Bearer <CRON_SECRET>`. Answers 409 when another run is still in progress, 207 when some hubs failed or ran out of time |

Errors are always friendly JSON: `{ "error": { "code", "message", "hint", "retryable" } }`. A body that isn't valid
JSON gets **400** `invalid_request`. `POST /api/chat` answers **429** with code `too_many_requests` or `daily_limit` when a
[request limit](docs/design.md#9-errors-security-and-limits) is reached.

```bash
curl -H "Content-Type: application/json" \
  -d '{"sessionId":null,"message":"Which Midwest hubs are most exposed to winter?"}' \
  http://localhost:3000/api/chat
```

## Evals
```bash
npm run eval                                   # 13 cases, about 3 min, about $0.20
npm run eval -- --repeat=3                     # run each case 3 times (consistency)
npm run eval -- --model=<provider/model>       # try another model
npm run eval -- --case=denver-snow,top-5       # only some cases
npm run eval -- --url=https://<your-app>       # test a deployment instead of local code
npm run eval -- --no-judge                     # skip the independent judge
npm run eval -- --rejudge=evals/results/<file>.json   # re-check + re-grade saved answers (cents, no agent calls)
npm run eval -- --publish                      # also write docs/evals.md
```
- **Hard checks** per case: the right tool with the right input, the right top hub, numbers that match our computed
  values, the premise verdict. The **expected values are computed at run time** from the same data, so they stay
  correct after the nightly re-score.
- **Independent judge:** a cheap model from a different provider grades each answer against the exact tool results.
  Only its faithful-to-data score is a hard check. Before each run it must grade 3 planted answers right (2 bad, 1
  good), or the report marks it unreliable.
- **Soft metrics:** tool calls, duplicates, untraced numbers, retries, latency, tokens, cost.
- Prints pass/fail per case and a total, and exits 1 on any failure. Latest results: [docs/evals.md](docs/evals.md).
  How the model was chosen: [docs/bakeoff.md](docs/bakeoff.md).
- **From the app:** *Overview → About the data → Answer quality* shows the last run and opens a dialog with each
  question's result. **Run evals…** asks for confirmation (it lists the shared limits: 1 run per 30 minutes, 4 per day),
  then shows progress question by question. A run from the app takes about a minute.

**The guard has its own eval:** `npm run eval:guard` (add `-- --repeat=3` to check stability, `-- --publish` to write
[docs/guard-evals.md](docs/guard-evals.md)). It runs 32 messages through the real guard: the brief's questions, terse
and follow-up questions that must pass, and off-topic requests and attempts to change the assistant's rules that must
be declined. It also reports how far the scores sit from the cutoffs.

## Project docs
| Doc | What's in it |
|---|---|
| [Design](docs/design.md) | Architecture, one question end to end, scoring, data pipeline, storage, repo structure: with links to the code |
| [Assumptions & limits](docs/assumptions.md) | What the score means and doesn't, data limits, thresholds, what's out of scope |
| [Decision log](docs/decisions.md) | Every choice made while building, and why (D1–D111) |
| [Example answers](docs/examples.md) | Real, unedited answers to the brief's questions |
| [Eval results](docs/evals.md) · [Model bakeoff](docs/bakeoff.md) · [Guard evals](docs/guard-evals.md) | How well it answers, how the model was picked, and how well off-topic and manipulative messages are caught |
| [Plan](docs/plan.md) | The build steps and what comes next |
| [AI session log](docs/session/) | The full conversation with the AI coding agent that built this |

## Data attribution
Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). Hazard data: FEMA
[National Risk Index](https://hazards.fema.gov/nri/).
