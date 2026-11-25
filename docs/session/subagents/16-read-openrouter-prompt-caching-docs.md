# Sub-agent: Read OpenRouter prompt caching docs (scrubbed)

### 👤 User · 2026-11-25T19:34:13.210Z

Read https://openrouter.ai/docs/features/prompt-caching (and if it links to it, https://openrouter.ai/docs/use-cases/usage-accounting) and answer concisely, quoting the docs where possible:
1. Which providers cache prompts AUTOMATICALLY (no request changes) — especially OpenAI models, Google Gemini models, DeepSeek, xAI — and their minimum prompt size / how long cached entries live.
2. Which need explicit `cache_control` breakpoints (Anthropic, others?) and how they are placed (system message / content parts, max number of breakpoints, TTL options).
3. What matters for cache hits: the prompt PREFIX must be identical? Are tool definitions part of the cached prefix? Any note about provider routing/sticky routing affecting cache hits.
4. How cached tokens show up in the response usage (field names like prompt_tokens_details.cached_tokens, cache_write_tokens), and how the discount is reported (cache_discount / cost).
5. In usage accounting: what `usage: { include: true }` returns (cost field name, units = USD credits?), and whether it is still needed or now always returned.
Give the answer as a short structured list.

---

### 👤 User · 2026-11-25T19:34:13.224Z

<system-reminder>
Your final report is delivered through SubagentHandback: when your work is complete, call SubagentHandback({message: <your full report>}). The call ends your run, so make it your last step. Only a SubagentHandback call reaches your caller as your result; plain text you write at the end is not delivered.
</system-reminder>

---

### 🤖 Claude · 2026-11-25T19:34:15.021Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/docs/features/prompt-caching",
  "prompt": "Extract the full content relevant to: which providers cache automatically vs need cache_control breakpoints; minimum prompt sizes; cache TTLs; breakpoint placement, max breakpoints, TTL options; prefix matching rules and whether tool definitions are part of the cached prefix; provider routing / sticky routing effects on cache hits; how cached_tokens, cache_write_tokens, cache discount and cost are reported in usage. Quote exact text where possible. Also list any links to the usage accounting page."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T19:34:16.283Z

<details><summary>📤 Tool result</summary>

```
Fetched https://openrouter.ai/docs/features/prompt-caching from a non-preapproved source (HTTP 200 OK, text/markdown, 29993 characters).
<fetched-web-content>
> ## Documentation Index
> Fetch the complete documentation index at: https://openrouter.ai/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Prompt Caching

> Cache prompt messages

To save on inference costs, you can enable prompt caching on supported providers and models.

Most providers automatically enable prompt caching, but note that some (see Alibaba and Anthropic below) require you to enable it on a per-message basis.

When using caching (whether automatically in supported models, or via the `cache_control` property), OpenRouter uses provider sticky routing to maximize cache hits — see [Provider Sticky Routing](#provider-sticky-routing) below for details.

## Provider Sticky Routing

To maximize cache hit rates, OpenRouter uses **provider sticky routing** to route your subsequent requests to the same provider endpoint after a cached request. This works automatically with both implicit caching (e.g. OpenAI, DeepSeek, Gemini 2.5) and explicit caching (e.g. Anthropic `cache_control` breakpoints).

**How it works:**

* After a request that uses prompt caching, OpenRouter remembers which provider served your request.
* Subsequent requests for the same model are routed to the same provider, keeping your cache warm.
* Sticky routing only activates when the provider's cache read pricing is cheaper than regular prompt pricing, ensuring you always benefit from cost savings.
* If the sticky provider becomes unavailable, OpenRouter automatically falls back to the next-best provider.
* Sticky routing is not used when you specify a manual [provider order](https://openrouter.ai/docs/guides/routing/provider-selection.md) via `provider.order` — in that case, your explicit ordering takes priority.
* Sticky sessions expire after **60 minutes** of inactivity. Each successful request resets the timer. If the sticky provider returns an error, the cache is not updated, allowing the next request to be re-routed.

**Sticky routing granularity:**

Sticky routing is tracked at the account level, per model, and per conversation. By default, OpenRouter identifies conversations by hashing the first system (or developer) message and the first non-system message in each request, so requests that share the same opening messages are routed to the same provider. This means different co
… [truncated 27675 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T19:34:19.213Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://openrouter.ai/docs/cookbook/administration/usage-accounting.md",
  "prompt": "Explain the usage accounting feature: what usage: { include: true } returns, the cost field name and its units (USD credits?), whether include is still required or always returned, and the cost-related fields such as cache_discount. Quote exact text briefly."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T19:34:19.652Z

<details><summary>📤 Tool result</summary>

```
Fetched https://openrouter.ai/docs/cookbook/administration/usage-accounting.md from a non-preapproved source (HTTP 200 OK, text/markdown, 19212 characters).
<fetched-web-content>
> ## Documentation Index
> Fetch the complete documentation index at: https://openrouter.ai/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Usage Accounting

The OpenRouter API provides built-in **Usage Accounting** that allows you to track AI model usage without making additional API calls. This feature provides detailed information about token counts, costs, and caching status directly in your API responses.

## Usage Information

OpenRouter automatically returns detailed usage information with every response, including:

1. Input and output token counts using the model's native tokenizer
2. Cost in credits
3. Reasoning token counts (if applicable)
4. Cached token counts (if available)

This information is included in the terminal `response.completed` or `response.incomplete` event for streaming responses, or in the terminal response for non-streaming requests. No additional parameters are required. The examples on this page use the [Responses API](https://openrouter.ai/docs/api_reference/responses/overview.md).

> [!NOTE]
>
> **Deprecated Parameters**
>
> On Chat Completions, the `usage: { include: true }` and `stream_options: { include_usage: true }` parameters are deprecated and have no effect. The Responses API has no equivalent parameter. Full usage details are always included automatically in every response on both APIs.

## Response Format

Every response includes a `usage` object with detailed token information. The field names follow the API you call.

### Responses API

```json lines theme={null}
{
  "object": "response",
  "usage": {
    "input_tokens": 194,
    "input_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 100
    },
    "output_tokens": 2,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 196,
    "cost": 0.95,
    "is_byok": false,
    "cost_details": {
      "upstream_inference_cost": null,
      "upstream_inference_input_cost": 18,
      "upstream_inference_output_cost": 1
    }
  }
}
```

### Chat Completions

```json lines theme={null}
{
  "object": "chat.completion.chunk",
  "usage": {
    "completion_tokens": 2,
    "completion_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.95,
    "cost_details": {
      "upstream_inference_co
… [truncated 16914 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T19:34:28.867Z

<details><summary>🔧 Tool call: <code>SubagentHandback</code></summary>

```json
{
  "message": "Sources read: https://openrouter.ai/docs/features/prompt-caching (full page, no truncation). It links to the usage accounting page at https://openrouter.ai/docs/cookbook/administration/usage-accounting.md (the caller's suggested /docs/use-cases/usage-accounting path was not fetched; the page links to the cookbook path instead). Both pages were fetched from a non-preapproved source, so quotes are kept short.\n\n1. AUTOMATIC caching (no request changes)\n- General: \"Most providers automatically enable prompt caching, but note that some (see Alibaba and Anthropic below) require you to enable it on a per-message basis.\"\n- OpenAI: automatic, \"does not require any additional configuration. There is a minimum prompt size of 1024 tokens.\" Cache lifetime is not stated in the caching page for automatic caching. Explicit-mode TTL is 30m default or 12h.\n- Google Gemini 2.5+ (implicit): no cache_control needed. \"Note that the TTL is on average 3-5 minutes, but will vary.\" Minimum: 1024 tokens for Gemini 2.5 Flash, 4096 for Gemini 2.5 Pro. (A later Gemini section says cache writes use a \"5 minute TTL that does not update.\")\n- DeepSeek: \"automated and does not require any additional configuration.\" No minimum or TTL stated.\n- xAI/Grok: \"automated and does not require any additional configuration.\" No minimum or TTL stated. (The page uses the heading \"Grok\".)\n- Also automatic: Moonshot AI, Groq (Kimi K2 only), Z.AI (no minimum or TTL stated).\n\n2. EXPLICIT cache_control (or equivalent) needed\n- Anthropic Claude: \"Place cache_control directly on individual content blocks\" (explicit). Max \"a limit of four explicit breakpoints.\" Top-level automatic caching is also available: a single top-level \"cache_control\": {\"type\":\"ephemeral\"} that places the breakpoint on the last cacheable block. TTL: default 5 minutes (`{\"type\":\"ephemeral\"}`) or 1 hour (`\"ttl\": \"1h\"`). Minimum cacheable length varies by model: 512 (e.g., Haiku 5.5, Sonnet 5.5), 1,024, 2,048, or 4,096 tokens depending on the model.\n- Alibaba Qwen: explicit cache_control on content blocks, 5-minute TTL only. Limited to listed models.\n- Google Gemini: explicit cache_control breakpoints are also required for caching on OpenRouter, even though implicit caching exists. \"There is not a limit on the number of cache_control breakpoints... OpenRouter will use only the last breakpoint for Gemini caching.\" Gemini has a 5-minute TTL that does not update.\n- OpenAI GPT-5.6+
… [truncated 3380 chars]
```
</details>

---

### ⚙️ Tool output · 2026-11-25T19:34:29.037Z

<details><summary>📤 Tool result</summary>

```
{"success":true,"message":"Report delivered to your caller."}
```
</details>

---
