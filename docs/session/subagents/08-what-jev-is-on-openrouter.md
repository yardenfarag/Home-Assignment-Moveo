# Sub-agent: What Jev is on OpenRouter (scrubbed)

### 👤 User · 2026-11-25T16:16:53.907Z

Read these OpenRouter pages about TypeSafe's Jev models and report precisely what they say:
- https://openrouter.ai/~typesafe/jev-latest
- https://openrouter.ai/typesafe/jev-router
- https://openrouter.ai/typesafe (provider/org page, if it exists)

Questions:
1. What is "Jev"? What kind of model is it (general LLM, classifier, guard/moderation model, router)? What is "System One"?
2. Which Jev model ids exist and are currently available (e.g. typesafe/jev-1.14, jev-latest, jev-router)? Is typesafe/jev-1.14 listed, deprecated or removed?
3. Pricing per million input/output tokens for each, and typical latency if stated.
4. Does any Jev model return a probability/score for classification (e.g. "is this in scope"), or is it a normal chat-completions model you'd prompt to classify?
5. Supported parameters relevant to classification: structured outputs / response_format, logprobs, max_tokens.
Report only what the pages say; say clearly if a page doesn't exist or doesn't answer something.

---

### 👤 User · 2026-11-25T16:16:53.933Z

<system-reminder>
Your final report is delivered through SubagentHandback: when your work is complete, call SubagentHandback({message: <your full report>}). The call ends your run, so make it your last step. Only a SubagentHandback call reaches your caller as your result; plain text you write at the end is not delivered.
</system-reminder>

---

### 🤖 Claude · 2026-11-25T16:16:55.974Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/~typesafe/jev-latest",
  "prompt": "Report verbatim what this page says: what Jev is, model type (general LLM, classifier, guard/moderation, router), what \"System One\" is, model id, listed/deprecated/removed status, pricing per million input/output tokens, latency if stated, context length, supported parameters (response_format, structured outputs, logprobs, max_tokens, etc.), and whether any output returns a probability or score. Say explicitly if something is not on the page."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T16:16:56.597Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/typesafe/jev-router",
  "prompt": "Report verbatim what this page says: what Jev is, model type (general LLM, classifier, guard/moderation, router), what \"System One\" is, model id, listed/deprecated/removed status, pricing per million input/output tokens, latency if stated, context length, supported parameters (response_format, structured outputs, logprobs, max_tokens, etc.), and whether any output returns a probability or score. Say explicitly if something is not on the page."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T16:16:57.141Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/typesafe",
  "prompt": "Report verbatim what this provider/org page says: what models are listed (especially any Jev models such as typesafe/jev-1.14, jev-latest, jev-router), their status (listed/deprecated/removed), pricing, and any description of Jev or System One. Say explicitly if the page does not exist or does not list models."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T16:16:58.521Z

<details><summary>📤 Tool result</summary>

```
The server returned HTTP 404 Not Found.

The response body was not retrieved. If this URL requires authentication, use an authenticated tool (e.g. `gh` for GitHub, or an MCP-provided fetch tool) instead of WebFetch.
```
</details>

---

### ⚙️ Tool output · 2026-11-25T16:16:58.539Z

<details><summary>📤 Tool result</summary>

```
Fetched https://openrouter.ai/typesafe from a non-preapproved source (HTTP 200 OK, text/markdown, 601 characters).
<fetched-web-content>
# TypeSafe models on OpenRouter

Every TypeSafe model below is served through the same OpenRouter API and API key. A guide, where listed, gives the confirmed APIs and request shapes for that model.

Author page: https://openrouter.ai/typesafe
All models: https://openrouter.ai/models
Site index: https://openrouter.ai/llms.txt

## Models

- [typesafe/jev-1.13](https://openrouter.ai/typesafe/jev-1.13)
- [typesafe/jev-1.14](https://openrouter.ai/typesafe/jev-1.14)
- [typesafe/jev-router](https://openrouter.ai/typesafe/jev-router)
- [~typesafe/jev-latest](https://openrouter.ai/~typesafe/jev-latest)

</fetched-web-content>
```
</details>

---

### ⚙️ Tool output · 2026-11-25T16:16:58.547Z

<details><summary>📤 Tool result</summary>

```
Fetched https://openrouter.ai/typesafe/jev-router from a non-preapproved source (HTTP 200 OK, text/markdown, 5036 characters).
<fetched-web-content>
# OpenRouter APIs — TypeSafe: Jev Router (typesafe/jev-router)

Guide for calling every confirmed OpenRouter API that serves `typesafe/jev-router`.

Model page: https://openrouter.ai/typesafe/jev-router
Create an API key: https://openrouter.ai/settings/keys

## Pricing

`typesafe/jev-router` is a router: each request is billed at the price of the model it is routed to, so it has no price of its own. Model page: https://openrouter.ai/typesafe/jev-router

## EU in-region routing

`typesafe/jev-router` is not currently available through EU in-region routing.

Docs: https://openrouter.ai/docs/guides/features/in-region-routing

## Authentication

Send this header with every request:

- Authorization: Bearer $OPENROUTER_API_KEY

## Text / Chat Completions API

Generate text with `typesafe/jev-router` through OpenRouter's Chat Completions API.

Docs: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion

### Endpoint

POST https://openrouter.ai/api/v1/chat/completions

Headers:
- Content-Type: application/json

### Request fields (typesafe/jev-router)

- model: string (required) — `"typesafe/jev-router"`
- messages: array (required) — ordered conversation messages with `role` and `content`
- stream: boolean (optional) — return Server-Sent Events as tokens are generated
- frequency_penalty: optional — accepted by this model; see the API reference for its value shape
- logit_bias: optional — accepted by this model; see the API reference for its value shape
- logprobs: optional — accepted by this model; see the API reference for its value shape
- max_completion_tokens: optional — accepted by this model; see the API reference for its value shape
- max_tokens: optional — accepted by this model; see the API reference for its value shape
- min_p: optional — accepted by this model; see the API reference for its value shape
- parallel_tool_calls: optional — accepted by this model; see the API reference for its value shape
- presence_penalty: optional — accepted by this model; see the API reference for its value shape
- reasoning: optional — accepted by this model; see the API reference for its value shape
- reasoning_effort: optional — accepted by this model; see the API reference for its value shape
- repetition_penalty: optional — accepted by this model; see the API reference for its value shape
- respo
… [truncated 2708 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T16:17:00.860Z

The `~typesafe/jev-latest` page returned 404, and the provider page lists `typesafe/jev-1.14` as a model. I'll read that linked page so I can answer the questions about it.

---

### 🤖 Claude · 2026-11-25T16:17:01.445Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/typesafe/jev-1.14",
  "prompt": "Report verbatim what this page says: what Jev is, model type (general LLM, classifier, guard/moderation, router), what \"System One\" is, model id, listed/deprecated/removed status, pricing per million input/output tokens, latency if stated, context length, supported parameters (response_format, structured outputs, logprobs, max_tokens, etc.), and whether any output returns a probability or score. Say explicitly if something is not on the page."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T16:17:01.938Z

<details><summary>📤 Tool result</summary>

```
The server returned HTTP 404 Not Found.

The response body was not retrieved. If this URL requires authentication, use an authenticated tool (e.g. `gh` for GitHub, or an MCP-provided fetch tool) instead of WebFetch.
```
</details>

---

### 🤖 Claude · 2026-11-25T16:17:08.059Z

<details><summary>🔧 Tool call: <code>SubagentHandback</code></summary>

```json
{
  "message": "Report on the TypeSafe Jev OpenRouter pages. Summary: only the jev-router guide and the provider index were readable. Jev and System One are not described on any page I could read.\n\nPages read and results:\n- https://openrouter.ai/~typesafe/jev-latest: HTTP 404 Not Found. Permanent failure, so retrying would fail the same way. Nothing from this page.\n- https://openrouter.ai/typesafe/jev-router: HTTP 200, markdown guide (not the model's own page content).\n- https://openrouter.ai/typesafe: HTTP 200, provider index.\n- https://openrouter.ai/typesafe/jev-1.14: HTTP 404 Not Found, linked from the provider index. Permanent failure, not retried. The provider index links it as a model, so the 404 is inconsistent with that listing; I could not resolve the discrepancy.\n\n1. What Jev is / System One: Not stated on any readable page. The jev-router guide says nothing about model type. It does not say whether Jev is a general LLM, classifier, guard model, or router beyond the router guide's own label for jev-router (below). System One is not mentioned.\n\n2. Model ids:\n- Provider index (https://openrouter.ai/typesafe) lists four models: typesafe/jev-1.13, typesafe/jev-1.14, typesafe/jev-router, and ~typesafe/jev-latest. It gives no status (listed, deprecated, or removed) for any of them.\n- typesafe/jev-1.14: listed on the index, but its own page returned 404. The index does not say it is deprecated or removed.\n- ~typesafe/jev-latest: 404 on its page, though the index lists it.\n- typesafe/jev-router: its guide exists (HTTP 200) and describes it as \"a router: each request is billed at the price of the model it is routed to, so it has no price of its own.\"\n- typesafe/jev-1.13: listed on the index; I did not fetch its page.\n\n3. Pricing and latency:\n- jev-router: no price of its own; billed at the price of the routed-to model. No per-million figures and no latency stated.\n- jev-1.14, jev-latest: no pricing available (pages 404).\n\n4. Probability/score output: Not answerable from the readable pages. The jev-router guide describes a standard Chat Completions API (POST https://openrouter.ai/api/v1/chat/completions) with a response shape of choices[].message.content and usage (prompt_tokens, completion_tokens, total_tokens, cost). It does not mention any probability or score field.\n\n5. Supported parameters (typesafe/jev-router guide): The guide lists these as optional and \"accepted by this model\": frequency_penalty, logit_bias, logprobs, max
… [truncated 858 chars]
```
</details>

---

### ⚙️ Tool output · 2026-11-25T16:17:08.264Z

<details><summary>📤 Tool result</summary>

```
{"success":true,"message":"Report delivered to your caller."}
```
</details>

---
