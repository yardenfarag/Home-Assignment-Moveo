# Eval results

Latest run: **openai/gpt-6.1-terra** · 2026-11-25 15:18 UTC · 1 run(s) per case.
Run it yourself: `npm run eval` (see [README](../README.md)). Expected values are computed from the live data at run time.

**13/13 cases passed** (a case passes only if every run passed).

| Case | What it checks | Result | Failed checks |
|---|---|---|---|
| midwest-winter | Midwest hubs most exposed to winter | ✅ 1/1 | — |
| miami-vs-houston | Compare Miami and Houston (hurricane + flood) | ✅ 1/1 | — |
| denver-snow | % of Denver days last year with snowfall | ✅ 1/1 | — |
| dallas-why-high | Why is Dallas's risk high? (premise check) | ✅ 1/1 | — |
| seattle-false-premise | False premise: Seattle hurricane risk | ✅ 1/1 | — |
| follow-up | Follow-up: 'Why that one?' | ✅ 1/1 | — |
| top-5 | Top 5 hubs overall | ✅ 1/1 | — |
| unknown-city | City that isn't one of our hubs | ✅ 1/1 | — |
| dust-storm | Hazard we don't score (dust storms) | ✅ 1/1 | — |
| decision | Decision question (recommendation + disclaimer) | ✅ 1/1 | — |
| off-topic | Off-topic request | ✅ 1/1 | — |
| last-year | 'Last year' = previous calendar year | ✅ 1/1 | — |
| confidence | Confidence explained (Seattle winter) | ✅ 1/1 | — |

## Soft metrics (not pass/fail)
| Metric | Value |
|---|---|
| Avg tool calls per answer | 1.1 |
| Duplicate tool calls (total) | 0 |
| Numbers in text not traced to tools | 0 |
| Answers that needed a validation retry | 0 |
| Avg / p95 seconds per answer | 10.6 / 18.1 |
| Tokens (in / out) | 117,852 / 5,752 |
| Estimated cost | $0.147 |

## Independent judge
Each answer is graded by **google/gemini-3.5-flash-lite** (a different provider than the answering model) against the actual tool results.
Hard check: faithful to data ≥ 4 (included in the results above). Everything else here is a soft metric:
graded twice on identical answers, the pass/fail verdict flipped on 4 of 14, so it can't fail a case on its own (D103).

**Judge self-test:** 3/3 planted answers graded right ✅ — the judge's verdicts can be trusted
- right: correct answer (Dallas) must PASS (verdict pass, faithful 5/5)
- right: wrong number + wrong driver (Dallas) must FAIL (verdict fail, faithful 1/5)
- right: swallowed a false premise (Seattle hurricanes) must FAIL (verdict fail, faithful 1/5)

| Average score (1–5) over 14 answers | |
|---|---|
| Faithful to data | 5.0 |
| Answers the question | 5.0 |
| Honest about limits | 5.0 |
| Premise handling (when there was one) | 5.0 |
| Clarity | 5.0 |
| "Pass" verdicts | 14/14 |
| Unsupported claims about our data | 0 |
| General-knowledge claims (allowed, D104) | 1 |
| Self-contradicting verdicts (D109) | 0 |
