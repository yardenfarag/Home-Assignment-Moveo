# Sub-agent: Platform limits research (scrubbed)

### 👤 User · 2026-11-25T08:47:33.783Z

Research platform facts for a TypeScript Next.js project deployed on Vercel (Hobby/free plan), using OpenRouter, Open-Meteo, and the Vercel AI SDK. Use primary docs; fetch them. Report under 500 words with URLs. Do not write files. Today is 2026-11-25.

1. OpenRouter + Jev: Is TypeSafe's "Jev" decision model (typesafe-ai/jev or similar) available on OpenRouter (https://openrouter.ai/models)? If yes: model slug, how it is called (chat completions? special endpoint?), response format (probability "noul"?), price. If not, say so clearly, and note the alternatives (Vercel AI Gateway `typesafe-ai/jev`, TypeSafe direct API https://api.typesafe.ai/v1/systemone, AI/ML API).
2. Vercel Hobby plan limits: cron jobs (how many, minimum frequency/precision), serverless function max duration (with and without Fluid compute), and whether Next.js middleware/proxy can do HTTP Basic Auth on Hobby. Docs: vercel.com/docs/cron-jobs/usage-and-pricing, vercel.com/docs/functions/limitations.
3. Open-Meteo Historical Weather API (archive-api.open-meteo.com): rate limits (per minute/hour/day) for the free non-commercial tier, and how "weighted" call counting works for long date ranges and many variables (e.g., one call for 5 years of daily data with 6 variables counts as how many calls?). Exact daily variable names for: snowfall sum, min temperature, precipitation sum, max wind gusts, max apparent temperature. Terms of use for non-commercial vs commercial.
4. Vercel AI SDK (current major version, likely v5 or v6, package `ai`): can `streamText` combine tool calling with a structured final output (Output.object / experimental_output) and stream partial objects? What's the recommended way to stream tool-progress + a Zod-validated final object to a Next.js client (useChat, createUIMessageStream, data parts)? Also: the OpenRouter provider package name for the AI SDK (@openrouter/ai-sdk-provider) and whether it supports structured outputs.

---

### 👤 User · 2026-11-25T08:47:33.952Z

<system-reminder>
Your final report is delivered through SubagentHandback: when your work is complete, call SubagentHandback({message: <your full report>}). The call ends your run, so make it your last step. Only a SubagentHandback call reaches your caller as your result; plain text you write at the end is not delivered. Do not also send the report with SendMessage: your caller would get it twice.
</system-reminder>

---

### 🤖 Claude · 2026-11-25T08:47:37.698Z

<details><summary>🔧 Tool call: <code>ToolSearch</code></summary>

```json
{
  "query": "select:WebFetch,WebSearch",
  "max_results": 2
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:47:37.871Z

<details><summary>📤 Tool result</summary>

```
[tool_reference]
[tool_reference]
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:41.641Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/api/v1/models",
  "prompt": "List any model whose id contains \"typesafe\" or \"jev\" (case-insensitive). Give id, name, pricing, context length, description. If none, say \"NONE FOUND\". Also tell me total number of models."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:42.672Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/cron-jobs/usage-and-pricing",
  "prompt": "What are the cron job limits on Hobby plan: number of cron jobs, minimum frequency, timing precision? Quote exactly."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:47:43.409Z

<details><summary>📤 Tool result</summary>

```
---
title: Usage & Pricing for Cron Jobs
product: vercel
url: /docs/schedules/cron-jobs/usage-and-pricing
canonical_url: "https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing"
last_updated: 2026-07-15
type: reference
prerequisites:
  - /docs/schedules/cron-jobs
  - /docs/schedules
related:
  - /docs/functions
  - /docs/limits
  - /docs/plans/pro-plan
  - /docs/functions/usage-and-pricing
summary: Learn about cron jobs usage and pricing details.
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
---

# Usage & Pricing for Cron Jobs

Cron Jobs are a legacy feature and will be migrated to


<!-- docsgraph:related -->
## Related pages

> **For AI agents:** Follow these links to understand how this page connects to the rest of the Vercel ecosystem. For the full cross-link map (inbound, outbound, prerequisites, and semantic neighbors), see the .graph.md link below.

- [Introducing Vercel Cron Jobs](https://vercel.com/blog/cron-jobs)
- [Cron jobs now support 100 per project on every plan](https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan)
- [Vercel Cron Jobs are now generally available](https://vercel.com/changelog/vercel-cron-jobs-are-now-generally-available)
- [Getting started with cron jobs](https://vercel.com/docs/schedules/cron-jobs/quickstart) — Learn how to schedule cron jobs to run at specific times or intervals.
- [vercel crons](https://vercel.com/docs/cli/crons) — Manage Cron Jobs from the Vercel CLI: add cron entries to your vercel.json, list them, and trigger them on demand.
- [Schedules Limits](https://vercel.com/docs/schedules/limits) — Limits for Vercel Schedules, including schedules per team, run frequency, jitter, Hobby usage, and API requests.
- [Pricing on Vercel](https://vercel.com/docs/pricing) — Learn about Vercel's pricing model, including the resources and services that are billed, and how they are priced.
- [Vercel CI Pricing](https://vercel.com/docs/ci/pricing) — Understand how Vercel CI usage is billed.

Full cross-link map for this page: [/docs/schedules/cron-jobs/usage-and-pricing.graph.md](/docs/schedules/cron-jobs/usage-and-pricing.graph.md)
<!-- /docsgraph:related -->

Schedules

in the future. Schedules include timezones, private function and queue targets. You can also create schedules at runtime.

Migrate your Cron Jobs to Schedules

.

> Cron Jobs are available on all plans

Cron jobs invoke [Vercel Functions](/docs/
… [truncated 2400 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:43.887Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/functions/limitations",
  "prompt": "What is max duration for functions on Hobby plan, default and max, with Fluid compute enabled and disabled? Quote exactly. Also any notes about middleware/routing middleware duration."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:47:44.207Z

<details><summary>📤 Tool result</summary>

```
---
title: Vercel Functions Limits
product: vercel
url: /docs/functions/limitations
canonical_url: "https://vercel.com/docs/functions/limitations"
last_updated: 2026-08-24
type: reference
prerequisites:
  - /docs/functions
related:
  - /docs/functions/runtimes/python
  - /docs/functions/runtimes
  - /docs/functions/configuring-functions/region
  - /docs/functions/runtimes/node-js
  - /docs/project-configuration/vercel-json
summary: Learn about the limits and restrictions of using Vercel Functions.
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
---

# Vercel Functions Limits

The table below outlines the limits and restrictions of using Vercel Functions with Fluid compute:


<!-- docsgraph:related -->
## Related pages

> **For AI agents:** Follow these links to understand how this page connects to the rest of the Vercel ecosystem. For the full cross-link map (inbound, outbound, prerequisites, and semantic neighbors), see the .graph.md link below.

- [Bun runtime now supports large functions and extended max duration](https://vercel.com/changelog/bun-runtime-now-supports-large-functions-and-extended-max-duration)
- [Higher defaults and limits for Vercel Functions running Fluid compute](https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute)
- [Python Vercel Functions bundle size limit increased to 500MB](https://vercel.com/changelog/python-vercel-functions-bundle-size-limit-increased-to-500mb)
- [Vercel Functions can now be up to 5GB in package size](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size)
- [Vercel Functions now support request bodies up to 20MiB](https://vercel.com/changelog/vercel-functions-now-support-request-bodies-up-to-20mib)
- [Deploy Go apps on Vercel using Docker](https://vercel.com/kb/guide/deploy-go-using-docker-vercel) — Deploy an existing Dockerized Go app to Vercel using Memos as a real-world example, with Neon Postgres for durable data.
- [How to deploy Medusa on Vercel](https://vercel.com/kb/guide/deploy-medusa-on-vercel) — Deploy a Medusa storefront on Vercel, including where the backend runs, which environment variables the current starter
- [Do Vercel Functions support WebSocket connections?](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) — Vercel Functions serve WebSocket connections natively, in public beta on all plans. Learn how 
… [truncated 22170 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:44.883Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://open-meteo.com/en/terms",
  "prompt": "Quote exactly: free API rate limits (per minute, hour, day, month), how fractional/weighted API calls are counted (variables count, days count), non-commercial vs commercial use terms, attribution/license requirements."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:47:47.994Z

<details><summary>📤 Tool result</summary>

```
NONE FOUND

Total models in the list: 10
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:47:50.145Z

<details><summary>📤 Tool result</summary>

```
**Free API rate limits**

- Per the terms: "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute."
- The comparison table lists the free tier as 600 calls per minute, 5.000 per hour, 10.000 per day, and 300.000 per month.
- Rate limits apply per IP address and per application. Services like Vercel or Netlify may hit limits sooner, and the page suggests Cloudflare Workers as an alternative.

**Weighted or fractional call counting**

The page does not explain how calls are counted by variables or days requested, so I can't confirm whether those factors affect usage.

**Non-commercial vs. commercial use**

- Non-commercial examples include "Private or non-profit websites or apps that do not have subscriptions or advertising."
- Commercial examples include "Websites or apps that have subscriptions or display advertisements."
- The free API is limited to non-commercial use. Voluntary donations, including tip jars, are allowed.
- Commercial use requires a paid plan. Commercial use is not permitted on the Free tier.

**Attribution and licensing**

- Using the free API means accepting the CC-BY 4.0 licence: "You accept to the CC-BY 4.0 licence, as specified in the licence conditions."
- Paid API data is also provided under CC-BY 4.0.
- The page does not specify the exact attribution wording. The licence details are on a separate page that is not included here.
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:54.354Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/api/v1/models?search=jev",
  "prompt": "Return the raw ids of all models listed. Does any id contain \"typesafe\" or \"jev\"? Give full detail for matches."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:54.957Z

<details><summary>🔧 Tool call: <code>WebSearch</code></summary>

```json
{
  "query": "TypeSafe Jev decision model OpenRouter typesafe-ai/jev",
  "mode": "standard"
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:56.111Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://open-meteo.com/en/pricing",
  "prompt": "Quote exactly how API calls are counted/weighted: e.g. variables > 10, days > 14 weeks, fractional calls. Give the formula and examples. Also rate limits for free tier."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:47:57.233Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://open-meteo.com/en/docs/historical-weather-api",
  "prompt": "List all exact daily variable names (the API parameter names) available, especially snowfall sum, min temperature, precipitation sum, max wind gusts, max apparent temperature. Also any note about rate limits or API call weighting, base URL, data start year."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:00.591Z

<details><summary>📤 Tool result</summary>

```
Here are the raw ids of all 10 models listed:

```
anthropic/claude-fable-5.2[1m]
anthropic/openai/gpt-6.2-astra[1m]
anthropic/claude-opus-5.5[1m]
anthropic/google/gemini-4-neon[1m]
anthropic/openai/gpt-6.2-sol[1m]
anthropic/claude-sonnet-5.5[1m]
anthropic/google/gemini-4-carbon[1m]
anthropic/google/gemini-4-hydrogen[1m]
anthropic/claude-haiku-5.5[1m]
anthropic/tencent/hy4[1m]
```

No id contains "typesafe" or "jev", so there are no matches to detail.
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:02.535Z

<details><summary>📤 Tool result</summary>

```
Web search results for query: "TypeSafe Jev decision model OpenRouter typesafe-ai/jev"

Links: [{"title":"Jev on OpenRouter","url":"https://openrouter.ai/docs/guides/community/jev"},{"title":"What Is Jev? TypeSafe's Decision Model Explained for Developers","url":"https://openrouter.ai/blog/insights/what-is-jev/"},{"title":"> ## Documentation Index","url":"https://openrouter.ai/docs/guides/community/jev.md"},{"title":"jev 1.13","url":"https://openrouter.ai/models/typesafe/jev-1.13"},{"title":"jev 1.13","url":"https://openrouter.ai/typesafe/jev-1.13"},{"title":"jev 1.13 20260917","url":"https://openrouter.ai/typesafe/jev-1.13-20260917"},{"title":"openrouter.ai","url":"https://openrouter.ai/typesafe/jev-1.13/api"},{"title":"jev 1.14","url":"https://openrouter.ai/typesafe/jev-1.14"},{"title":"openrouter.ai","url":"https://openrouter.ai/typesafe/jev-1.13/providers"},{"title":"jev 1.14 20261014","url":"https://openrouter.ai/typesafe/jev-1.14-20261014"},{"title":"jev 1.14 20261014","url":"https://openrouter.ai/models/typesafe/jev-1.14-20261014"},{"title":"Jev vs LLM: When to Use a Decision Model Instead of Generating Text","url":"https://openrouter.ai/blog/tutorials/jev-vs-llm-when-to-use-each/"},{"title":"jev 1.14","url":"https://openrouter.ai/ja/typesafe/jev-1.14"},{"title":"jev router","url":"https://openrouter.ai/models/typesafe/jev-router"},{"title":"> ## Documentation Index","url":"https://openrouter.ai/docs/guides/community/jev-tutorial.md"},{"title":"Zum Inhalt springen","url":"https://openrouter.ai/de/~typesafe"},{"title":"openrouter.ai","url":"https://openrouter.ai/typesafe"}]

The search turned up OpenRouter's documentation for Jev, but the model ID is `typesafe/jev`, not `typesafe-ai/jev`. None of the results mention a `typesafe-ai` namespace.

- **What it is:** Jev is a structured decision model from TypeSafe and the first of its System One models. System One models make fast, structured decisions for software. It returns typed answers with associated probabilities, not text or reasoning. Jev doesn't return the reasoning it goes through to make its decision.
- **Model IDs:** The current version is `typesafe/jev-1.13` in the docs, and the `~typesafe/jev-latest` alias tracks the newest release. A separate page says Jev 1.14 was released on October 14, 2026.
- **Pricing:** Jev charges for input tokens, and output tokens are free. One listing gives $0.042 per million input tokens for Jev 1.14, with a context window of 262,144 tokens.
- **Access:** It use
… [truncated 511 chars]
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:03.199Z

<details><summary>📤 Tool result</summary>

```
**Daily variable API names** (from the Daily Parameter Definition table):

- `weather_code`
- `temperature_2m_max`, `temperature_2m_min`
- `apparent_temperature_max`, `apparent_temperature_min`
- `precipitation_sum` (mm)
- `rain_sum` (mm)
- `snowfall_sum` (cm)
- `precipitation_hours`
- `sunrise`, `sunset`
- `sunshine_duration`, `daylight_duration` (seconds)
- `wind_speed_10m_max`, `wind_gusts_10m_max` (km/h by default)
- `wind_direction_10m_dominant`
- `shortwave_radiation_sum` (MJ/m²)
- `et0_fao_evapotranspiration` (mm)

The "Additional Daily Variables" section lists more options (such as mean temperature, cloud cover, humidity, pressure, and soil metrics), but it gives only display names, not API parameter names.

**Other details:**

- **Base URL:** `https://archive-api.open-meteo.com/v1/archive`. Commercial customers use a `customer-` prefixed server and an `apikey` parameter.
- **Data start:** 1940 for ERA5 and ERA5-Seamless (ERA5-Land from 1950, ECMWF IFS from 2017).
- **Rate limits or call weighting:** The page does not mention them. The pricing page is the referenced source for commercial access.
- **Required parameter:** If you request daily variables, the `timezone` parameter is required.
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:05.306Z

<details><summary>📤 Tool result</summary>

```
**How API calls are counted**

The page says: "Requests for data covering more than 10 weather variables" count as multiple calls. Time works the same way: requests extending beyond the two-week threshold for a single location also count as multiple calls. (You wrote "14 weeks," but the page's threshold is 2 weeks, or 14 days.)

The page says "To calculate the number of API calls accurately, fractional counts are used." It does not state an explicit formula. The two worked examples fit this inferred formula, applied when a request exceeds both thresholds:

**Calls ≈ (variables ÷ 10) × (days ÷ 14)**

**Examples from the page:**
- 2 weeks (14 days), 15 variables: "will be calculated as 1.5 API calls" (15/10 × 14/14 = 1.5)
- 4 weeks (28 days): "4 weeks of data equals 3.0 API calls" (15/10 × 28/14 = 3.0, assuming 15 variables, which the page doesn't state)
- A standard request (14 days, 10 or fewer variables) costs 1.0 call.

**Free tier rate limits**

- Minutely: 600 calls per minute
- Hourly: 5,000 calls per hour
- Daily: 10,000 calls per day
- Monthly: 300,000 calls per month

The page also notes the free API is "rate-limited to 10,000 calls/day" and is for non-commercial use only.
```
</details>

---

### 🤖 Claude · 2026-11-25T08:48:10.098Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/docs/guides/community/jev.md",
  "prompt": "Extract: model slugs, availability status, endpoint (path, method), request body shape, response format (fields, probabilities, any field named \"noul\" or similar), pricing, SDKs, Vercel AI SDK support, limitations. Quote code examples verbatim."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:48:10.919Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/typesafe/jev-1.14",
  "prompt": "Is this model available on OpenRouter? Give slug, pricing (input/output), context length, release date, providers, any note about availability or endpoint."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:12.000Z

<details><summary>📤 Tool result</summary>

```
The server returned HTTP 404 Not Found.

The response body was not retrieved. If this URL requires authentication, use an authenticated tool (e.g. `gh` for GitHub, or an MCP-provided fetch tool) instead of WebFetch.
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:20.396Z

<details><summary>📤 Tool result</summary>

```
## Jev on OpenRouter: Key Facts

**Models and availability**
- Model ID: `typesafe/jev-1.14`. Alias: `~typesafe/jev-latest`, which tracks the newest release.
- `typesafe/jev-1.13` is still available. It rejects Box questions with a `400`.
- Access requires only an OpenRouter API key. No waitlist or separate TypeSafe account.
- Context length: 262,144 tokens.
- Image input and Box are early features. TypeSafe says their request format, answers, and limits can change.

**Endpoints**
- Decisions API: `POST https://openrouter.ai/api/alpha/decisions`
- System One API: `POST https://openrouter.ai/api/v1/systemone`
- Extractions API (typed fields, not questions): `POST /api/alpha/extractions`

**Request body (as described)**
- `model`: the model ID.
- `state`: an array of context. It can hold plain strings and image objects, such as `{ "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }`.
- `questions`: an object of named questions. Each has a `type` (`choice`, `noul`, `score`, or `box`) and `instructions`. Choice, Noul, and Score also take `criteria`. Box takes no `criteria`.

**Response format**
- **Choice:** the selected option, a probability for each option, and a confidence value.
- **Noul:** the probability of yes. The page does not describe a field named "noul" in the response.
- **Score:** a probability-weighted position, a probability for each level, and a confidence value.
- **Box:** a `box` object with `top`, `bottom`, `left`, and `right` as fractions of image height and width, plus a `confidence` value. For example, `"box": { "top": 0.49, "bottom": 0.89, "left": 0.58, "right": 0.96 }`.
- Every response includes `usage.cost`, the USD cost of the call.
- Box always returns four edges, even when the target is absent. To check presence, ask a Noul question in the same request.

**Pricing**
- You pay per input token. Output tokens are free.
- The page does not list the per-token price. It points to the [Jev model page](https://openrouter.ai/typesafe/jev-1.14).

**SDKs**
- OpenRouter Decisions SDKs: TypeScript, Python, and Go.
- TypeSafe's official JavaScript and Python SDKs can target OpenRouter by changing the base URL to the System One endpoint.

**Vercel AI SDK support:** Not mentioned in the page.

**Limitations**
- Jev returns probabilities and typed answers only. It does not return reasoning, explanations, or free-form text.
- Requests with more than about 32,000 bytes of text, and any request with an image, use TypeSafe's long
… [truncated 228 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T08:48:25.411Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/docs/guides/community/jev.md",
  "prompt": "Quote verbatim the first full request code example (curl or TypeScript) and its example JSON response, especially for a noul question. Also quote any sentence mentioning chat completions, /api/v1/chat/completions, or whether Jev can be called via chat completions."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:48:25.931Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints",
  "prompt": "Return the model id, pricing fields (prompt, completion, request) and providers, context length, supported parameters verbatim."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:29.714Z

<details><summary>📤 Tool result</summary>

```
- **Model ID:** typesafe/jev-1.14
- **Pricing:**
  - prompt: "0.000000042"
  - completion: "0"
  - request: not listed in the page content
  - discount: 0
- **Providers:** TypeSafe (two endpoints, with tags "typesafe" and "typesafe/zdr")
- **Context length:** 262144
- **Supported parameters:** []
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:32.760Z

<details><summary>📤 Tool result</summary>

```
The page doesn't include a curl or TypeScript request example, and it has no Noul example response. Its only full request and response examples are for Box questions. Here are the relevant lines:

Request, the `model` line: "model": "typesafe/jev-1.14",

Request, the `questions` line: "product": { "type": "box", "instructions": "the product in the listing photo" }

Response, the `box` line: "box": { "top": 0.49, "bottom": 0.89, "left": 0.58, "right": 0.96 },

No sentence mentions chat completions or `/api/v1/chat/completions`, and the page doesn't say whether Jev can be called through chat completions. The closest statement is: "It is not a drop-in replacement for a chat model."
```
</details>

---

### 🤖 Claude · 2026-11-25T08:48:36.864Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/docs/guides/community/jev-tutorial.md",
  "prompt": "Quote verbatim a full request example (curl/TS/JSON body) for a noul question to the Decisions endpoint and the JSON response, showing exact field names for probability. Also any mention of chat completions or the AI SDK."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:48:38.119Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data",
  "prompt": "What is the current AI SDK major version? Can streamText/generateText combine tools with structured output (Output.object, `output` option, or experimental_output)? Quote statements about stepCount/stopWhen, partialOutputStream, partial streaming, and limitations. Quote code examples verbatim."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:45.962Z

<details><summary>📤 Tool result</summary>

```
**Current major version:** The page doesn't state an AI SDK major version. It only shows current API usage, such as `inputSchema` on `tool()` and the `output` option.

**Combining tools with structured output:** Yes. The page says: "Structured output generation is part of the `generateText` and `streamText` flow. This means you can combine it with tool calling in the same request." It uses the `output` option, not `experimental_output`, and doesn't mention `experimental_output`.

Example from the page:

```ts
output: Output.object({
```
```ts
stopWhen: isStepCount(5),
```

**stepCount / stopWhen:**
- "Structured output generation counts as a step in the AI SDK's multi-turn execution model"
- "When combining with tools, account for this in your `stopWhen` configuration."
- "Configure `stopWhen` to allow enough steps for both tool execution and output generation."

**partialOutputStream and partial streaming:**
- "With `streamText` and `output`, you can stream the model's structured response as it is generated."
- Usage: `const { partialOutputStream } = streamText({`
- For arrays, `elementStream` differs: "This differs from `partialOutputStream`, which streams the entire partial array including incomplete elements."

**Limitations:**
- "Partial outputs streamed via `streamText` cannot be validated against your provided schema"
- With `Output.json()`, the SDK "doesn't validate the structure or types of the values."
- `generateText` can reject with `AI_NoObjectGeneratedError`, and accessing `result.output` can throw `AI_NoOutputGeneratedError`. The latter can happen when the final step finishes with tool calls rather than a `stop` reason.
- Errors during `streamText` appear in the stream rather than being thrown, so you need an `onError` callback.
- If the model generates more than `maxItems`, `elementStream` errors before emitting the excess element. This does not automatically abort provider generation.
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:46.577Z

<details><summary>📤 Tool result</summary>

```
The source doc's full noul example is longer than 125 characters, so I can't quote it verbatim. Below are short verbatim fragments and a request I wrote myself using the same field names.

**Request:** the doc's noul question begins with `"is_bug": {` followed by `"type": "noul",`. Here is an equivalent request I wrote, using the same field names:

```json
{
  "model": "typesafe/jev-1.13",
  "state": {
    "order_note": "Customer says the item arrived cracked."
  },
  "questions": {
    "needs_refund": {
      "type": "noul",
      "instructions": "Should this order qualify for a refund?",
      "criteria": {
        "true": "The item was damaged or not as described.",
        "false": "The item matches the listing and is undamaged."
      }
    }
  }
}
```

Send it to `https://openrouter.ai/api/alpha/decisions` with an `Authorization: Bearer` header containing your OpenRouter API key.

**Response:** the doc shows this noul answer:

`"is_bug": { "type": "noul", "noul": 0.96 }`

The probability is in the `noul` field, a number from 0 to 1 giving the probability of yes. Unlike Choice answers, there is no `probabilities` object for noul.

**Chat Completions and AI SDK:** the source doc doesn't mention either of them.
```
</details>

---

### 🤖 Claude · 2026-11-25T08:48:50.194Z

<details><summary>🔧 Tool call: <code>Bash</code></summary>

```json
{
  "command": "npm view ai version dist-tags --json 2>/dev/null | head -30; npm view @openrouter/ai-sdk-provider version peerDependencies --json 2>/dev/null | head -30",
  "description": "Check latest versions of ai and OpenRouter provider"
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:48:56.952Z

<details><summary>📤 Tool result</summary>

```
{
  "version": "7.0.181",
  "dist-tags": {
    "alpha": "5.0.0-alpha.15",
    "canary": "7.0.0-canary.176",
    "beta": "7.0.0-beta.187",
    "snapshot": "0.0.0-f1630544-20260811180950",
    "ai-v5": "5.0.292",
    "ai-v6": "6.0.336",
    "latest": "7.0.181"
  }
}
{
  "version": "3.1.0",
  "peerDependencies": {
    "ai": "^7.0.0",
    "zod": "^3.25.76 || ^4.1.8"
  }
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:01.374Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data",
  "prompt": "Summarize recommended way to stream custom data parts and tool progress to useChat: createUIMessageStream, writer.write({type:'data-...'}), writer.merge(result.toUIMessageStream()), reconciliation by id, transient parts, typing with UIMessage generics/dataPartSchemas. Quote key code verbatim (short). Also note any mention of streaming structured output (partial objects) to the UI."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:02.531Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://github.com/OpenRouterTeam/ai-sdk-provider",
  "prompt": "Package name, install, usage (createOpenRouter / openrouter import), AI SDK version compatibility, support for structured outputs / response_format json_schema / generateObject / Output.object, tool calling, any notes on Jev or decisions endpoint."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:09.788Z

<details><summary>📤 Tool result</summary>

```
**Summary**

- **Server setup:** Create a stream with `createUIMessageStream<MyUIMessage>`, write `start` first, then return it with `createUIMessageStreamResponse`. Code: `const stream = createUIMessageStream<MyUIMessage>({`
- **Persistent data parts:** Write `{ type: 'data-...', data: {...} }` parts. These are stored in `message.parts`. Example: `type: 'data-weather'`
- **Merging model output:** The example merges the model stream with `writer.merge(...)`, using `toUIMessageStream({ stream: result.stream, sendStart: false })`. The page does not show `writer.merge(result.toUIMessageStream())`, so use the page's form.
- **Reconciliation by ID:** Writing a part with the same `id` updates it on the client. Code: `id: 'weather-1', // Same ID = update existing part`
- **Transient parts:** Set `transient: true`. These parts are not added to message history. Per the page, "Transient parts are sent to the client but not added to the message history." On the client, they are only available through `onData`.
- **Client:** Use `useChat<MyUIMessage>` with `onData` for transient data, and filter `message.parts` to render persistent parts.
- **Typing:** The page types data parts through the second `UIMessage` generic, with `never` for metadata. It does not mention `dataPartSchemas`.

**Gaps in the page**

- **Tool progress:** The page does not cover tool progress specifically. The closest content is the general data-part and status-update patterns.
- **Structured output:** The page does not mention streaming structured output or partial objects to the UI.
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:11.202Z

<details><summary>📤 Tool result</summary>

```
**Package and install**
- Package: `@openrouter/ai-sdk-provider`
- Install with `pnpm add`, `npm install`, or `yarn add`.
- Import the default instance `openrouter`, or call `createOpenRouter({ apiKey })` to configure your own.

**AI SDK compatibility**
- Current release line: `ai@^7.0.144`, Node.js 22 or newer, ESM-only.
- Legacy lines: AI SDK v6 uses `@openrouter/ai-sdk-provider@2.9.1`, and v5 uses `1.5.4`.

**Structured outputs**
- The page doesn't document `response_format` with `json_schema` or `Output.object` directly.
- It shows `generateObject` with a Zod schema, and `streamObject` for streamed objects.
- The Response Healing plugin repairs malformed JSON, but only for non-streaming requests.

**Tool calling**
- The page has no dedicated tool-calling section.
- It links to OpenRouter's list of tool-capable models and warns that some listed models may not work with the AI SDK.
- Anthropic's fine-grained tool streaming is available as a beta header, and the page notes it is ignored for other providers.

**Decisions (Jev) endpoint**
- `openrouter.decisionModel()` implements the AI SDK decision model contract on the OpenRouter Decisions API, for use with `experimental_decide`.
- `openrouter.evaluationModel()` is an alias that the AI SDK uses when resolving string model IDs.
- Supported question types are `boolean`, `choice`, `score`, and `box`.
- A model refusal makes `decide()` throw `Experimental_DecisionRefusalError`.
- The endpoint is served from `https://openrouter.ai/api/alpha` and is still in alpha, so its shapes may change.
- With a custom `baseURL`, the decisions URL replaces a trailing `/v1` with `/alpha`. If the URL doesn't end in `/v1`, set `decisionsBaseURL`, or `decisionModel()` throws a `LoadSettingError`.
- The decision models require `ai@7.0.144` or newer.
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:15.355Z

<details><summary>🔧 Tool call: <code>WebSearch</code></summary>

```json
{
  "query": "ai-sdk.dev experimental_decide decision model",
  "mode": "standard"
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:16.352Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/routing-middleware",
  "prompt": "Is Routing Middleware available on all plans including Hobby? Any limits by plan (duration, invocations)? Does Next.js proxy.ts/middleware.ts run as routing middleware? Any example or note about basic auth? Quote relevant lines."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:17.200Z

<details><summary>📤 Tool result</summary>

```
---
title: Routing Middleware
product: vercel
url: /docs/routing-middleware
canonical_url: "https://vercel.com/docs/routing-middleware"
last_updated: 2026-08-14
type: conceptual
prerequisites:
  []
related:
  - /docs/fluid-compute
  - /docs/functions/runtimes/node-js
  - /docs/functions/runtimes/bun
  - /docs/functions/runtimes/python
  - /docs/project-configuration/vercel-json
summary: Learn how you can use Routing Middleware, code that executes before a request is processed on a site, to provide speed and personalization to your...
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
---

# Routing Middleware

> Routing Middleware is available on all plans

Routing Middleware **executes code *before* a request is processed on a site**, and are built on top of [fluid compute](/docs/fluid-compute). Based on the request, you can modify the response.


<!-- docsgraph:related -->
## Related pages

> **For AI agents:** Follow these links to understand how this page connects to the rest of the Vercel ecosystem. For the full cross-link map (inbound, outbound, prerequisites, and semantic neighbors), see the .graph.md link below.

- [Advanced Remix integration with streaming SSR and multi-runtime support](https://vercel.com/changelog/advanced-remix-integration-with-streaming-ssr-and-multi-runtime-support)
- [Edge Config is now generally available ](https://vercel.com/changelog/edge-config-is-now-generally-available)
- [Edge Function metrics now available in Monitoring](https://vercel.com/changelog/edge-function-metrics-now-available-in-monitoring)
- [Edge Functions are now available in Public Beta](https://vercel.com/changelog/edge-functions-are-now-available-in-public-beta)
- [Edge Functions are now generally available](https://vercel.com/changelog/edge-functions-are-now-generally-available)
- [Build with an Express starter template](https://vercel.com/kb/guide/build-with-a-express-starter-template) — Deploy an Express app to Vercel from a template. Browse Express starters from Vercel and the community, then run them lo
- [Build with a FastAPI starter template](https://vercel.com/kb/guide/build-with-a-fastapi-starter-template) — Browse FastAPI starter templates for Vercel and deploy one in a few steps. Compare minimal, AI, agent, and full-stack Fa
- [Build with a Flask starter template](https://vercel.com/kb/guide/build-with-a-flask-starter-template) — Deploy a Flask app to Vercel from a start
… [truncated 13212 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:17.660Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage",
  "prompt": "How are tool parts streamed to useChat (tool-<name> part types, states like input-streaming, input-available, output-available, output-error, preliminary outputs via async generator execute)? Any mention of streaming structured output alongside? Quote short key snippets and state names exactly."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:24.628Z

<details><summary>📤 Tool result</summary>

```
Web search results for query: "ai-sdk.dev experimental_decide decision model"

Links: [{"title":"ai-sdk.dev","url":"https://ai-sdk.dev/docs/ai-sdk-core/decisions"},{"title":"ai-sdk.dev","url":"https://ai-sdk.dev/docs/ai-sdk-core/decisions.md"},{"title":"ai-sdk.dev","url":"https://ai-sdk.dev/docs/reference/ai-sdk-core/decide"},{"title":"ai-sdk.dev","url":"https://ai-sdk.dev/docs/reference/ai-sdk-core/decide.md"},{"title":"32 decisions","url":"https://app.unpkg.com/ai@7.0.173/files/docs/03-ai-sdk-core/32-decisions.mdx"},{"title":"14 decide","url":"https://app.unpkg.com/ai@7.0.173/files/docs/07-reference/01-ai-sdk-core/14-decide.mdx"},{"title":"ai sdk evaluation to decisions","url":"https://vercel.com/i/ai-sdk-evaluation-to-decisions"},{"title":"vercel.com","url":"https://vercel.com/docs/ai-gateway/modalities/decision.md"},{"title":"vercel.com","url":"https://vercel.com/docs/ai-gateway/modalities/decision"},{"title":"what are decision models","url":"https://vercel.com/i/what-are-decision-models"},{"title":"typesafe jev and ai sdk","url":"https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk"},{"title":"> ## Documentation Index","url":"https://pydantic.dev/docs/ai/api/models/decision/index.md"},{"title":"ai-sdk.dev","url":"https://ai-sdk.dev/docs/ai-sdk-core/evaluation"}]

The AI SDK docs describe `experimental_decide` as an experimental API for answering named questions about one shared state with a decision model.

- **Question types:** The docs say it decides answers to Choice, Score, and Boolean questions against shared state (Decide answers to Choice, Score, and Boolean questions against shared state.).
- **Model resolution:** You can pass a decision model instance directly, or pass a string. Strings resolve through Vercel AI Gateway unless you configure a decision-capable default provider (Strings resolve through Vercel AI Gateway unless you configure a decision-capable default provider.). Aliases and registries are set up with `customProvider` and `createProviderRegistry`, using `decisionModels` (Use `registry.decisionModel('provider:model')` or `customProvider({ decisionModels: { alias: model } }).decisionModel('alias')` to resolve models.).
- **Version requirement:** Decisions through the AI SDK need `ai` 7.0.128 or later, or `experimental_evaluate` on earlier AI SDK 7 releases.
- **Spec type:** The model interface is `Experimental_DecisionModelV4` is exported from `@ai-sdk/provider` and declares `specificationVersion: 'v4'`, `provider`, `modelId`, `sup
… [truncated 605 chars]
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:27.228Z

<details><summary>📤 Tool result</summary>

```
**Tool parts in `useChat`**

- Assistant messages carry tool activity as typed parts. Static tools use `tool-<name>` types, such as `tool-getWeatherInformation`, `tool-getLocation`, and `tool-askForConfirmation`. Tools whose types aren't known at compile time use a generic `dynamic-tool` part.
- The docs describe the lifecycle this way: "A tool part is at first a tool call, and then it becomes a tool result when the tool is executed."

**States** (names as they appear in the examples)

- `input-streaming`: the tool input is still arriving. The example renders the partial input as JSON.
- `input-available`: the full input is ready and the tool is running or waiting for the user.
- `approval-requested` and `approval-responded`: the approval flow, for tools that require approval.
- `output-available`: the result is present in `part.output`.
- `output-error`: the tool failed, and `part.errorText` describes the failure.
- `output-denied`: the tool execution was denied.

**Flow**

- On the server, `streamText` generates the tool calls. `toUIMessageStream` converts the result stream, and `createUIMessageStreamResponse` returns it. Server-side `execute` results are forwarded to the client.
- Client-side tools run in `onToolCall`, and their results are sent back with `addToolOutput`.
- Tool call streaming is on by default. The docs say, "Tool call streaming is enabled by default in AI SDK 5.0." Partial tool calls are sent in the data stream and appear in the message's typed tool parts, so you can switch on `state` to render progress.

**Not covered**

- **Preliminary outputs via an async generator `execute`:** the page doesn't mention this, so I can't describe how it works here.
- **Streaming structured output alongside tool parts:** the page doesn't address this. It only covers streaming tool inputs.
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:33.869Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/ai-gateway/modalities/decision.md",
  "prompt": "What model slug(s) for Jev on AI Gateway (e.g. typesafe/jev-1.14)? Pricing? How to call (experimental_decide, gateway.decisionModel)? Free credits on Hobby? Quote briefly."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:34.386Z

<details><summary>📤 Tool result</summary>

```
---
title: Decision
product: vercel
url: /docs/ai-gateway/modalities/decision
canonical_url: "https://vercel.com/docs/ai-gateway/modalities/decision"
last_updated: 2026-10-07
type: conceptual
prerequisites:
  - /docs/ai-gateway/modalities
  - /docs/ai-gateway
related:
  - /docs/ai-gateway/getting-started/decision
  - /docs/ai-gateway/sdks-and-apis/openai-decisions
  - /docs/ai-gateway/sdks-and-apis/typesafe
  - /docs/ai-gateway/models-and-providers/decision-fallbacks
  - /docs/ai-gateway/authentication-and-byok/byok
summary: Ask typed questions about shared state and get back structured choices, scores, and boolean probabilities through Vercel AI Gateway.
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
---

# Decision

Ask typed questions about a piece of shared state and get structured answers back. Decision models return choices, scores, and boolean probabilities instead of free-form text, which makes them a fit for classification, routing, rubric-based assessment, and automated verification.


<!-- docsgraph:related -->
## Related pages

> **For AI agents:** Follow these links to understand how this page connects to the rest of the Vercel ecosystem. For the full cross-link map (inbound, outbound, prerequisites, and semantic neighbors), see the .graph.md link below.

- [Decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions) — Decide answers to Choice, Score, and Boolean questions against shared state.
- [Baseten's Mammoth-1 and Elephant-1 now available on AI Gateway for free](https://vercel.com/changelog/basetens-mammoth-1-and-elephant-1-now-available-on-ai-gateway-for-free)
- [Decision-1.1 now available on AI Gateway](https://vercel.com/changelog/decision-1-1-now-available-on-ai-gateway)
- [Gemini Decision 1 now available on AI Gateway](https://vercel.com/changelog/gemini-decision-1-now-available-on-ai-gateway)
- [Liquid AI's d1 is available on AI Gateway](https://vercel.com/changelog/liquid-ai-d1-is-available-on-ai-gateway)
- [Liquid AI's d1.2 and d1.2-ultra are now available on AI Gateway](https://vercel.com/changelog/liquid-ais-d1-2-and-d1-2-ultra-are-now-available-on-ai-gateway)
- [AI SDK with AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/ai-sdk) — Build AI-powered TypeScript applications using the AI SDK with AI Gateway for unified access to 400+ models.

Full cross-link map for this page: [/docs/ai-gateway/modalities/decision.graph.md](/docs/ai-gateway/mo
… [truncated 14619 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:35.269Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling",
  "prompt": "Quote what the page says about preliminary tool results (async generator / async iterable in execute, yield), and how they are sent to the UI. Also stopWhen helper name (stepCountIs or isStepCount)."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T08:49:36.430Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://ai-sdk.dev/docs/reference/ai-sdk-core/decide",
  "prompt": "Quote the signature and a short example of experimental_decide: parameters (model, state, questions), question types (boolean/choice/score/box), returned shape (e.g. probability field for boolean). Short."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:40.764Z

<details><summary>📤 Tool result</summary>

```
**Preliminary tool results:** The page says, "You can return an `AsyncIterable` over multiple results." It also says, "In this case, the last value from the iterable is the final tool result." Generator functions can be used to "stream status information during the tool execution." The example is an `async *execute` that yields status objects, with a `loading` update before a `success` update.

**How they reach the UI:** The page doesn't say. It shows the yielded values but doesn't explain how they are delivered to a UI.

**Helper name:** The page uses `isStepCount(count)`, which it describes as stopping "after a specified number of steps." It doesn't mention `stepCountIs`.
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:49:44.516Z

<details><summary>📤 Tool result</summary>

```
The page gives the import line but no full signature, and it has no code example beyond that. Here's what it documents:

**Import:** "import { experimental_decide } from 'ai';"

**Parameters**
- `model`: a v4 decision model instance, or a string ID such as `'provider:model'`.
- `state`: a string, a JSON object, or an ordered array of text, file, and JSON parts.
- `questions`: a nonempty record mapping question IDs to question objects.
- Optional: `maxOutputTokens`, `reasoning`, `maxRetries`, `abortSignal`, `headers`, `providerOptions`, `telemetry`, and lifecycle callbacks.

**Question types**
- `choice`: criteria is a nonempty map of option names to descriptions.
- `score`: criteria is a nonempty array of levels, indexed from zero.
- `boolean`: criteria is optional, with `true` and/or `false` descriptions. If instructions are absent, at least one description is required.
- `box`: no criteria.

**Illustrative sketch** (my own, not from the page, using the documented parameter names):

```ts
const result = await experimental_decide({
  model: 'provider:model',
  state: 'Customer cannot log in after a password reset.',
  questions: {
    urgent: { type: 'boolean', instructions: 'Is this urgent?' },
  },
});
```

**Returned shape:** a `Promise<Experimental_DecisionResult>` with:
- `answers`: one typed answer per question ID.
- `usage`: `inputTokens`, `outputTokens`, `totalTokens`, each possibly undefined.
- `warnings`, `rounding`, `providerMetadata`, and `response`.

The page does not document a `probability` field on boolean answers. It mentions probabilities only in the `rounding` description and in a note that a single score level yields probability `1`.
```
</details>

---

### 🤖 Claude · 2026-11-25T08:50:13.497Z

<details><summary>🔧 Tool call: <code>SubagentHandback</code></summary>

```json
{
  "message": "Platform research (fetched 2026-11-25)\n\n**1. Jev on OpenRouter: YES, it is available.** I checked this against the live API.\n- Slugs: `typesafe/jev-1.14` (current, released 2026-10-14) and `typesafe/jev-1.13`. The alias `~typesafe/jev-latest` tracks the newest. Note the prefix is `typesafe/`, not `typesafe-ai/`.\n- Calls do not go through chat completions. The docs say \"not a drop-in replacement for a chat model\". Use `POST https://openrouter.ai/api/alpha/decisions`, or `POST /api/v1/systemone`, which is TypeSafe-SDK compatible.\n- Request body: `{model, state, questions:{name:{type:\"noul\"|\"choice\"|\"score\"|\"box\", instructions, criteria:{true,false}}}}`.\n- Response: a noul question returns `{\"type\":\"noul\",\"noul\":0.96}`, where `noul` is P(yes) from 0 to 1. Every response includes `usage.cost`.\n- Price: $0.042 per 1M input tokens, output free, 262,144-token context. The endpoint is alpha and its shapes may change. Thresholds must be re-tuned for each model version.\n- AI SDK route: `@openrouter/ai-sdk-provider` has `openrouter.decisionModel()` for `experimental_decide` (needs ai >= 7.0.144). It maps the boolean type to noul.\n- Alternative: Vercel AI Gateway serves it as `typesafe-ai/jev` via `experimental_decide` and returns `{type:'boolean', probability}`. It also has a TypeSafe-compatible endpoint at `/typesafe`.\n- Sources: https://openrouter.ai/docs/guides/community/jev.md, https://openrouter.ai/docs/guides/community/jev-tutorial.md, https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints, https://vercel.com/docs/ai-gateway/modalities/decision.md\n\n**2. Vercel Hobby**\n- Cron: up to 100 jobs per project. Each runs at most once per day, and anything more frequent fails at deploy. Timing is per-hour (±59 min): `0 1 * * *` fires between 1:00 and 1:59. Cron Jobs are now labelled \"legacy\" and are being moved to \"Schedules\". https://vercel.com/docs/cron-jobs/usage-and-pricing\n- Function duration with Fluid compute (the default for new projects): 300s default and 300s maximum on Hobby. Streamed responses count toward that limit. The page doesn't give a non-Fluid figure; older docs said 10s default / 60s max on Hobby, but I couldn't confirm that today. Hobby functions get 2 GB / 1 vCPU. https://vercel.com/docs/functions/limitations\n- Basic Auth: Routing Middleware is \"available on all plans\". Next.js 16 uses `proxy.ts` (`middleware.ts` before 16), which runs on Node by default. A hand-written check of the `Au
… [truncated 3368 chars]
```
</details>

---

### ⚙️ Tool output · 2026-11-25T08:50:13.718Z

<details><summary>📤 Tool result</summary>

```
{"success":true,"message":"Report delivered to your caller."}
```
</details>

---
