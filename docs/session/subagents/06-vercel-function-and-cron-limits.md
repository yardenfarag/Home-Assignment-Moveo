# Sub-agent: Vercel function and cron limits (scrubbed)

### 👤 User · 2026-11-25T15:37:38.658Z

Read these official Vercel docs pages and answer precisely, quoting numbers:
- https://vercel.com/docs/functions/configuring-functions/duration
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/functions/configuring-functions/region

Questions:
1. On the Hobby plan and on the Pro plan, what are the DEFAULT and MAXIMUM function durations (maxDuration), with and without Fluid compute? Is Fluid compute on by default for new projects?
2. Cron jobs on Hobby: how many cron jobs allowed, what minimum frequency (e.g. once per day?), and is the trigger time precise or within a window (e.g. "within the hour")?
3. What is the default function region for new projects, and how do you pin a region in vercel.json (exact key name and example value for US East / Washington DC)?
Report only what the pages say; if a page doesn't answer something, say so.

---

### 🤖 Claude · 2026-11-25T15:37:40.249Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/functions/configuring-functions/duration",
  "prompt": "Report verbatim the default and maximum function duration (maxDuration) for Hobby and Pro plans, with and without Fluid compute. State whether Fluid compute is on by default for new projects. Quote exact numbers and wording."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T15:37:40.822Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/cron-jobs/usage-and-pricing",
  "prompt": "Report verbatim: how many cron jobs are allowed on Hobby, the minimum cron frequency on Hobby, and whether trigger timing is precise or within a window (quote exact wording). Also any other limits stated."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T15:37:41.184Z

<details><summary>📤 Tool result</summary>

```
Fetched https://vercel.com/docs/functions/configuring-functions/duration (HTTP 200 OK, text/markdown, 15154 characters).
<fetched-web-content>
---
title: Configuring Maximum Duration for Vercel Functions
description: Learn how to set the maximum duration of a Vercel Function.
url: "https://vercel.com/docs/functions/configuring-functions/duration"
last_updated: 2026-08-24
related:
  - /docs/fluid-compute
  - /docs/functions/usage-and-pricing
  - /docs/functions/limitations
  - /docs/project-configuration/vercel-json
  - /docs/networking/secure-compute
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
search_kb_with_vercel_cli: npx vercel@latest kb search "<query>"
---

# Configuring Maximum Duration for Vercel Functions

The maximum duration configuration determines the longest time that a function can run. You can configure the maximum duration for Vercel Functions.

## Consequences of changing the maximum duration

Changing the maximum duration gives an invocation more time before Vercel terminates it. With [fluid compute](/docs/fluid-compute), Vercel can reuse function instances and process multiple invocations in the same instance with [optimized concurrency](/docs/fluid-compute#optimized-concurrency). Provisioned memory is billed for running instances, not as a separate memory allocation for every request. Active CPU billing applies while your code is executing, and pauses while your function is waiting on I/O. To learn more, see [how pricing works](/docs/functions/usage-and-pricing#how-pricing-works).

For this reason, Vercel has set a [default maximum duration](/docs/functions/limitations#max-duration) for functions, which can be useful for preventing runaway functions from consuming resources indefinitely.

If a function runs for longer than its set maximum duration, Vercel will terminate it. Therefore, when setting this duration, it's crucial to strike a balance:

1. Allow sufficient time for your function to complete its normal operations, including any necessary waiting periods (for example, streamed responses).
2. Set a reasonable limit to prevent abnormally long executions.

## Maximum duration for different runtimes

The method of configuring the maximum duration depends on your framework and runtime:

#### Node.js, Next.js (>= 13.5 or higher), SvelteKit, Astro, Nuxt, and Remix

Configure the duration in your function definition.
For example, Next.js pages router and Nod
… [truncated 12820 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T15:37:41.274Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/functions/configuring-functions/region",
  "prompt": "Report verbatim: the default function region for new projects, and how to pin a region in vercel.json (exact key name, format, and example value for Washington, D.C., US East, e.g. iad1). Quote exact wording."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T15:37:41.393Z

<details><summary>📤 Tool result</summary>

```
Fetched https://vercel.com/docs/cron-jobs/usage-and-pricing (HTTP 200 OK, text/markdown, 3644 characters).
<fetched-web-content>
---
title: Usage & Pricing for Cron Jobs
description: Learn about cron jobs usage and pricing details.
url: "https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing"
last_updated: 2026-07-15
related:
  - /docs/functions
  - /docs/limits
  - /docs/plans/pro-plan
  - /docs/functions/usage-and-pricing
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
search_kb_with_vercel_cli: npx vercel@latest kb search "<query>"
---

# Usage & Pricing for Cron Jobs

Cron Jobs are a legacy feature and will be migrated to

Schedules

in the future. Schedules include timezones, private function and queue targets. You can also create schedules at runtime.

Migrate your Cron Jobs to Schedules

.

> Cron Jobs are available on all plans

Cron jobs invoke [Vercel Functions](/docs/functions). This means the same [usage](/docs/limits) and [pricing](/pricing) limits will apply.

|                | **Number of cron jobs per project** | **Minimum interval** | **Scheduling precision** |
| -------------- | ----------------------------------- | -------------------- | ------------------------ |
| **Hobby**      | 100 cron jobs                       | Once per day         | Per-hour (±59 min)       |
| **Pro**        | 100 cron jobs                       | Once per minute      | Per-minute               |
| **Enterprise** | 100 cron jobs                       | Once per minute      | Per-minute               |

### Hobby scheduling limits

> **💡 Note:** Hobby accounts are limited to cron jobs that run **once per day**. Cron
> expressions that would run more frequently will fail during deployment.

Hobby plans have two restrictions on cron jobs:

1. **Daily execution limit**: Cron jobs can only run once per day. Expressions like `0 * * * *` (per-hour) or `*/30 * * * *` (every 30 minutes) will fail deployment with the error:
   *Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day.*

2. **Timing precision**: Vercel cannot assure a timely cron job invocation. For example, a cron job configured as `0 1 * * *` (every day at 1 am) will trigger anywhere between 1:00 am and 1:59 am.

For cron jobs that run more frequently or with precise timing, **upgrade to our [Pro](/docs/plans/pro-plan) plan**.

## Pricing

Cron jobs are included in **all plan
… [truncated 1296 chars]
```
</details>

---

### ⚙️ Tool output · 2026-11-25T15:37:41.736Z

<details><summary>📤 Tool result</summary>

```
Fetched https://vercel.com/docs/functions/configuring-functions/region (HTTP 200 OK, text/markdown, 9630 characters).
<fetched-web-content>
---
title: Configuring regions for Vercel Functions
description: Learn how to configure regions for Vercel Functions.
url: "https://vercel.com/docs/functions/configuring-functions/region"
last_updated: 2026-08-11
related:
  - /docs/caching/cdn-cache
  - /docs/regions
  - /docs/pricing/regional-pricing/iad1
  - /docs/project-configuration/vercel-json
  - /docs/cli/deploy
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
search_kb_with_vercel_cli: npx vercel@latest kb search "<query>"
---

# Configuring regions for Vercel Functions

The Vercel platform caches all static content in [the CDN](/docs/caching/cdn-cache) by default. This means your users will always get static files like HTML, CSS, and JavaScript served from the region that is closest to them. See the [regions](/docs/regions) page for a full list of our regions.

In a globally distributed application, the physical distance between your function and its data source can impact latency and response times. Therefore, Vercel allows you to specify the region in which your functions execute, ideally close to your data source (such as your [database](/marketplace/category/database)).

- By default, Vercel Functions execute in [*Washington, D.C., USA* (`iad1`)](/docs/pricing/regional-pricing/iad1) **for all new projects** to ensure they are located close to most external data sources, which are hosted on the East Coast of the USA. You can set a new default region through your [project's settings on Vercel](#setting-your-default-region)
- You can define the region in your `vercel.json` using the [`regions` setting](/docs/functions/configuring-functions/region#project-configuration)
- You can set your region in the [Vercel CLI](#vercel-cli)
- You can override regions for individual functions using the [`functions` property](#per-function-configuration) in your project configuration

## Setting your default region

The default Function region is [*Washington, D.C., USA* (`iad1`)](/docs/pricing/regional-pricing/iad1) **for all new projects**.

### Dashboard

To change the default regions in the dashboard:

1. Choose the appropriate project from your [dashboard](/dashboard) on Vercel
2. Open **Settings** in the sidebar
3. From the left side, select [**Functions**](https://vercel.com/d?to=%2F%5Bteam%5D
… [truncated 7293 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T15:37:48.245Z

**1. Function duration (duration page)**

The page has one table covering all plans, not separate with/without-Fluid figures:

| Plan | Default | Maximum | Extended maximum |
|---|---|---|---|
| Hobby | 300s (5 minutes) | 300s (5 minutes) | - |
| Pro | 300s (5 minutes) | 800s | 1800s (30 minutes) Beta |
| Enterprise | 300s (5 minutes) | 800s | 1800s (30 minutes) Beta |

- The table's header says these limits apply "with [fluid compute] (enabled by default)." That is the only statement about Fluid compute defaults. The page does not give separate non-Fluid numbers, so I cannot report them.
- The Pro extended beta requires Node.js, Bun, or Python runtimes, and durations above 800s must be set per function in code or `vercel.json`, not at project level.

**2. Cron jobs on Hobby (cron usage-and-pricing page)**

- **Number:** "100 cron jobs" per project. The page lists this for all plans.
- **Minimum frequency:** "Once per day." Expressions like `0 * * * *` or `*/30 * * * *` fail deployment with the error "Hobby accounts are limited to daily cron jobs."
- **Timing:** A window, not a precise time. The page says "Vercel cannot assure a timely cron job invocation." Its example is `0 1 * * *`, which "will trigger anywhere between 1:00 am and 1:59 am." The precision column reads "Per-hour (±59 min)." Pro and Enterprise are listed as "Per-minute."
- The page says Cron Jobs are a legacy feature that will migrate to "Schedules" in the future.

**3. Default region and pinning (region page)**

- **Default:** "Washington, D.C., USA (`iad1`)" for all new projects.
- **Pinning in `vercel.json`:** use the key `"regions"` with an array of region codes. The page's example is `"regions": ["sfo1"]`. For Washington, D.C., the code is `iad1`, so the value is `"regions": ["iad1"]`. The page uses `["iad1"]` in its per-function example but does not show a standalone DC-only example.
- Hobby is limited to a single region. Pro allows 5 regions.

Pages read:
- https://vercel.com/docs/functions/configuring-functions/duration
- https://vercel.com/docs/cron-jobs/usage-and-pricing (the fetched copy's metadata lists its canonical URL as /docs/schedules/cron-jobs/usage-and-pricing)
- https://vercel.com/docs/functions/configuring-functions/region

---
