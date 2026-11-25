# Sub-agent: Vercel rate limiting on Hobby (scrubbed)

### 👤 User · 2026-11-25T15:52:05.515Z

Read Vercel's official docs on rate limiting and answer precisely, quoting the pages:
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk
- https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing (if it exists)

Questions:
1. Is WAF rate limiting (custom rules with a rate limit action) available on the Hobby plan? How many rules, which time windows, which keys (IP, etc.)?
2. Is it configured only in the dashboard, or can it be defined in code / vercel.json?
3. What does the @vercel/firewall `checkRateLimit` SDK need (a rule created in the dashboard with an id? plan requirement?).
4. Any cost on Hobby?
Report only what the pages say, and say so if a page doesn't answer something or doesn't exist.

---

### 🤖 Claude · 2026-11-25T15:52:07.111Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting",
  "prompt": "Quote verbatim all text about plans (Hobby/Pro/Enterprise), number of rate limiting rules allowed, available time windows, rate limit keys (IP, headers, etc.), actions, how rules are configured (dashboard vs code/vercel.json), and any pricing or cost information. State explicitly if something is not covered."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T15:52:07.749Z

<details><summary>📤 Tool result</summary>

```
Fetched https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting (HTTP 200 OK, text/markdown, 9246 characters).
<fetched-web-content>
---
title: WAF Rate Limiting
description: Learn how to configure custom rate limiting rules with the Vercel Web Application Firewall (WAF).
url: "https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting"
last_updated: 2026-08-28
related:
  - /docs/vercel-firewall/vercel-waf/rate-limiting-sdk
  - /docs/vercel-firewall/priority-projects
  - /docs/vercel-firewall/vercel-waf/custom-rules
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
search_kb_with_vercel_cli: npx vercel@latest kb search "<query>"
---

# WAF Rate Limiting

> WAF Rate Limiting is available on all plans

Rate limiting allows you to control the number of times that a request from the same source can hit your application within a specific timeframe. This could happen due to multiple reasons, such as malicious activity or a software bug.

The use of rate limiting rules helps ensure that only intended traffic reaches your resources such as API endpoints or external services, giving you better control over usage costs.

> **💡 Note:** Rate limit counters are tracked on a per-region basis; traffic matching a given rate limit key in multiple regions can exceed the limit you configure for any single region.

## Get started

To start from a preconfigured rule instead of creating one, add the [Rate Limit API Requests Firewall Rule](https://vercel.com/templates/other/rate-limit-api-requests-firewall-rule) template to your project. The template's rule logs matching requests until you change its action. To rate limit by a value that only your code knows, such as a user ID, use the [Rate Limiting SDK](/docs/vercel-firewall/vercel-waf/rate-limiting-sdk).

To create a rate limiting rule in the dashboard:

1. From your [dashboard](https://vercel.com/dashboard/), select the project that you'd like to configure rate limiting for. Then open **Firewall** in the sidebar
2. Select **Configure** on the top right of the Firewall overview page. Then, select **+ New Rule**
3. Complete the fields for the rule as follows
   1. Type a name to help you identify the purpose of this rule for future reference

   2. In the **Configure** section, add as many **If** conditions as needed. For example, to rate limit one API route, select **Request Path** and **Equals**, then enter the route's path, such as `/a
… [truncated 6911 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T15:52:07.798Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk",
  "prompt": "Quote verbatim all text about the checkRateLimit function from @vercel/firewall: required parameters, whether a dashboard-created rule ID is needed, plan requirements, installation, return values, and any pricing or cost information. State explicitly if something is not covered."
}
```
</details>

---

### 🤖 Claude · 2026-11-25T15:52:08.259Z

<details><summary>🔧 Tool call: <code>WebFetch</code></summary>

```json
{
  "url": "https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing",
  "prompt": "Quote verbatim all text about pricing, plan limits, Hobby plan, rate limiting, and costs. State explicitly if the page does not exist or does not cover these."
}
```
</details>

---

### ⚙️ Tool output · 2026-11-25T15:52:08.402Z

<details><summary>📤 Tool result</summary>

```
Fetched https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk (HTTP 200 OK, text/markdown, 10139 characters).
<fetched-web-content>
---
title: Rate Limiting SDK
description: Learn how to configure a custom rule with rate limit in your code.
url: "https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk"
last_updated: 2026-07-23
related:
  - /docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
  - /docs/environment-variables/system-environment-variables
  - /docs/vercel-firewall/vercel-waf/rate-limiting
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
search_kb_with_vercel_cli: npx vercel@latest kb search "<query>"
---

# Rate Limiting SDK

You can configure a custom rule with rate limit in your code by using the [`@vercel/firewall`](https://github.com/vercel/vercel/tree/main/packages/firewall/docs) package. This can be useful in the following cases:

- You need to set a rate limit on requests in your backend
- You want to use additional conditions with the rate limit that are not possible in the custom rule configuration of the dashboard

> **💡 Note:** Rate limit counters are tracked on a per-region basis; traffic matching a given rate limit key in multiple regions can exceed the limit you configure for any single region.

## Using `@vercel/firewall`

- ### Create a `@vercel/firewall` rule
  1. From your [dashboard](https://vercel.com/dashboard/), select the project that you'd like to configure rate limiting for. Then open **Firewall** in the sidebar
  2. Select **Configure** on the top right of the Firewall overview page. Then, select **+ New Rule**
  3. Complete the fields for the rule as follows
     1. Type a name such as "Firewall api rule"
     2. In the **Configure** section, for the first **If** condition, select `@vercel/firewall`
     3. Use `update-object` as the **Rate limit ID**
     4. Use the default values for **Rate Limit** and **Then**
  4. Select **Save Rule**
  5. Apply the changes:
     - When you make any change, you will see a **Review Changes** button appear or update on the top right with the number of changes requested
     - Select **Review Changes** and review the changes to be applied
     - Select **Publish** to apply the changes to your production deployment

- ### Configure rate limiting in code
  You can now use the Rate limit ID `update-object` set up above with `@vercel/firewal
… [truncated 7809 chars]
```
</details>

---

### ⚙️ Tool output · 2026-11-25T15:52:08.642Z

<details><summary>📤 Tool result</summary>

```
Fetched https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing (HTTP 200 OK, text/markdown, 5555 characters).
<fetched-web-content>
---
title: Usage & Pricing for Vercel WAF
description: Learn how the Vercel WAF can affect your usage and how specific features are priced.
url: "https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing"
last_updated: 2026-06-16
related:
  - /docs/vercel-firewall/ddos-mitigation
  - /docs/vercel-firewall/vercel-waf/ip-blocking
  - /docs/vercel-firewall/vercel-waf/custom-rules
  - /docs/vercel-firewall/vercel-waf/rate-limiting
  - /docs/vercel-firewall/vercel-waf/managed-rulesets
install_vercel_plugin: npx plugins add vercel/vercel-plugin
search_with_vercel_cli: npx vercel@latest docs search "<query>"
search_kb_with_vercel_cli: npx vercel@latest kb search "<query>"
---

# Usage & Pricing for Vercel WAF

Vercel Firewall features available on all plans are free to use. This includes [DDoS mitigation](/docs/vercel-firewall/ddos-mitigation), [IP blocking](/docs/vercel-firewall/vercel-waf/ip-blocking), and [custom rules](/docs/vercel-firewall/vercel-waf/custom-rules). Vercel prices plan-specific WAF features such as [rate limiting](/docs/vercel-firewall/vercel-waf/rate-limiting) and [managed rulesets](/docs/vercel-firewall/vercel-waf/managed-rulesets) as described in [priced features](#priced-features-usage).

## Free features usage

WAF deny, challenge, or rate-limit mitigated traffic does not incur [CDN Requests](/docs/manage-cdn-usage#cdn-requests) or [Fast Data Transfer (FDT)](/docs/manage-cdn-usage#fast-data-transfer). Requests that pass a challenge and continue to your application count toward normal usage.

The same applies to [persistent actions](/docs/vercel-firewall/vercel-waf/custom-rules#persistent-actions), [DDoS mitigation](/docs/vercel-firewall/ddos-mitigation), [Attack Mode](/docs/vercel-firewall/attack-mode), and [IP blocking](/docs/vercel-firewall/vercel-waf/ip-blocking).

## Priced features usage

Priced WAF features are billed as described below.

### Rate limiting pricing

| Resource | Price | Included (Pro) |
|----------|-------|----------------|
| [WAF Rate Limiting](/docs/vercel-firewall/vercel-waf/rate-limiting) | Regional | Usage-based |


### Managed ruleset pricing

| Resource | Price | Included (Pro) |
|----------|-------|----------------|
| [OWASP CRS per request number](/docs/vercel-firewall/vercel-waf/managed-rulesets) | Regional | N/A |
| [OWASP CRS per request size](/docs/v
… [truncated 3224 chars]
```
</details>

---

### 🤖 Claude · 2026-11-25T15:52:19.590Z

**1. Hobby plan: yes, with limits**

The rate-limiting page says "WAF Rate Limiting is available on all plans." Its Limits table gives these Hobby values:
- Counting keys: "IP, JA4 Digest"
- Algorithm: Fixed window only (Token bucket is Enterprise)
- Window: "Minimum: **10s**, Maximum: **10mins**"
- Rules: "1 per project"
- Included requests: "1,000,000 Allowed requests"

The page also says "Hobby projects can have one WAF Rate Limiting rule within their total of 3 custom firewall rules." The dashboard defaults are a 60s time window and a limit of 100 requests. The action can be "Too Many Requests (429)" (the default), "Log", "Deny (403)", or "Challenge."

Response-status conditions (counting only 4xx responses, for example) are marked as available on "Enterprise and Pro plans" for Priority projects, so they are not listed for Hobby.

**2. Dashboard only, or code/vercel.json?**

The rate-limiting page describes only dashboard setup (Firewall, then Configure, then + New Rule). It does not mention vercel.json or any config-file method. The SDK page describes a hybrid: the rule is created in the dashboard, and the code calls it. Its "Configure rate limiting in code" section says you "can now use the Rate limit ID `update-object` set up above." Neither page says whether rules can be defined in vercel.json.

**3. What `checkRateLimit` needs**

- A dashboard rule must exist first. Its first **If** condition is `@vercel/firewall`, and its **Rate limit ID** is set to `update-object` (the page's example value). The page says to use the default values for **Rate Limit** and **Then**, then **Save Rule** and **Publish**.
- Usage: `checkRateLimit('update-object', { request })` returns `{ rateLimited }`. The page's example returns a 429 when `rateLimited` is true.
- Optional `rateLimitKey` (default is client IP). It replaces the IP bucket entirely.
- Optional `timeout` in ms, for `@vercel/firewall` 1.2.6 and later. On timeout the promise rejects with a `TimeoutError`.
- Preview deployments need "Protection Bypass for Automation" enabled and system environment variables exposed.
- The SDK page does not state a plan requirement. The rate-limiting page says the feature is on all plans, and the Hobby limits above apply.

**4. Cost on Hobby**

- The usage-and-pricing page says: "Vercel Firewall features available on all plans are free to use. This includes DDoS mitigation, IP blocking, and custom rules." Rate limiting is not in that list. It says Vercel "prices plan-specific WAF features such as rate limiting."
- The rate-limiting pricing table lists WAF Rate Limiting as "Regional" in price and "Usage-based" in the "Included (Pro)" column. It shows only the Pro column.
- The Hobby row in the Limits table shows "1,000,000 Allowed requests" included.
- The pricing pages give no dollar amount for Hobby overage. The rate-limiting page mentions a "Rate Limiting Pricing" dialog shown on first rule creation, but its content is not in the page.
- Rate-limited, denied, or challenged traffic does not incur CDN Requests or Fast Data Transfer, per the usage page.

**Pages read**
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting (last updated 2026-08-28)
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk (last updated 2026-07-23)
- https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing (exists, last updated 2026-06-16)

---
