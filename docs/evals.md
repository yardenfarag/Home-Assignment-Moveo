# Eval results

Latest run: **anthropic/claude-sonnet-5.5 (rejudged)** · 2026-11-25 14:12 UTC · 1 run(s) per case.
Run it yourself: `npm run eval` (see [README](../README.md)). Expected values are computed from the live data at run time.

**11/13 cases passed** (a case passes only if every run passed).

| Case | What it checks | Result | Failed checks |
|---|---|---|---|
| midwest-winter | Midwest hubs most exposed to winter | ✅ 1/1 | — |
| miami-vs-houston | Compare Miami and Houston (hurricane + flood) | ✅ 1/1 | — |
| denver-snow | % of Denver days last year with snowfall | ✅ 1/1 | — |
| dallas-why-high | Why is Dallas's risk high? (premise check) | ✅ 1/1 | — |
| seattle-false-premise | False premise: Seattle hurricane risk | ✅ 1/1 | — |
| follow-up | Follow-up: 'Why that one?' | ✅ 1/1 | — |
| top-5 | Top 5 hubs overall | ❌ 0/1 | judge: turn 1 faithful to data |
| unknown-city | City that isn't one of our hubs | ✅ 1/1 | — |
| dust-storm | Hazard we don't score (dust storms) | ✅ 1/1 | — |
| decision | Decision question (recommendation + disclaimer) | ✅ 1/1 | — |
| off-topic | Off-topic request | ✅ 1/1 | — |
| last-year | 'Last year' = previous calendar year | ✅ 1/1 | — |
| confidence | Confidence explained (Seattle winter) | ❌ 0/1 | judge: turn 1 faithful to data |

## Soft metrics (not pass/fail)
| Metric | Value |
|---|---|
| Avg tool calls per answer | 2.4 |
| Duplicate tool calls (total) | 6 |
| Numbers in text not traced to tools | 0 |
| Answers that needed a validation retry | 1 |
| Avg / p95 seconds per answer | 10.6 / 17.4 |
| Tokens (in / out) | 386,904 / 17,587 |
| Estimated cost | $0.950 |

## Independent judge
Each answer is graded by **openai/gpt-6-luna** (a different provider than the answering model) against the actual tool results.
Hard check: faithful to data ≥ 4 (included in the results above). Everything else here is a soft metric:
graded twice on identical answers, the pass/fail verdict flipped on 4 of 14, so it can't fail a case on its own (D103).

**Judge self-test:** 2/2 planted bad answers caught ✅ — the judge's verdicts can be trusted
- caught: wrong number + wrong driver (Dallas) (verdict fail, faithful 1/5)
- caught: swallowed a false premise (Seattle hurricanes) (verdict fail, faithful 1/5)

| Average score (1–5) over 14 answers | |
|---|---|
| Faithful to data | 4.6 |
| Answers the question | 5.0 |
| Honest about limits | 4.2 |
| Premise handling (when there was one) | 5.0 |
| Clarity | 4.9 |
| "Pass" verdicts | 9/14 |
| Unsupported claims about our data | 5 |
| General-knowledge claims (allowed, D104) | 5 |

**Claims the judge flagged as unsupported** (to review, not all are errors):
- `seattle-false-premise`: “If you saw a high number somewhere, it was probably winter or flood, not hurricane.” This speculates about what the analyst may have seen, which the briefing says not to do.
- `top-5`: The group’s order is “not clear-cut.” The tool provides explicit ranks and scores; a small spread does not make the reported order unclear.
- `top-5`: Hurricane exposure “drives” the Gulf and Florida hubs, and severe storms “drive” Dallas and Oklahoma City. The results identify each hub’s top hazard, but do not provide component scores to support claims about what drives the overall scores.
- `decision`: The suggestion that Denver hail or tornado exposure could be a cost driver for roof or fleet damage is speculative; the supplied results do not assess those costs.
- `confidence`: “The real exposure could be lower than 60 if the last five years are typical, or higher if FEMA's longer record is the better guide.” This speculates about the true exposure beyond what the tool results establish.
