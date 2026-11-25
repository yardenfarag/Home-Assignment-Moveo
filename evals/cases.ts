/**
 * @module evals/cases
 *
 * The eval set (E3): 13 cases covering the brief's questions, premise pushback,
 * follow-ups, scope limits, decisions and confidence. Every expected value comes
 * from the oracle at run time — nothing is hand-typed (E2).
 */
import { RECOMMENDATION_DISCLAIMER } from "../src/core/agent/config";
import { callsTo, check, firstHubMentioned, plainText, textHasNumber } from "./lib/checks";
import type { CheckResult, EvalCase, TurnResult } from "./lib/types";

/** Every case must at least produce an answer (it passed validation within one retry). */
function answered(results: TurnResult[]): CheckResult[] {
  return results.map((r, i) =>
    check(`turn ${i + 1} answered`, !!r.answer, r.answer ? "validated answer produced" : `no answer: ${r.error ?? "unknown"}`),
  );
}

/** Lower-case ids → names list, e.g. "Minneapolis, Detroit". */
const names = (ids: string[], hubs: { id: string; name: string }[]) => ids.map((id) => hubs.find((h) => h.id === id)?.name ?? id).join(", ");

export const EVAL_CASES: EvalCase[] = [
  {
    id: "midwest-winter",
    title: "Midwest hubs most exposed to winter",
    turns: ["Which hubs in the Midwest are most exposed to winter disruption?"],
    check: ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const top = o.ranking("winter", "Midwest")[0];
      const first = firstHubMentioned(r.answer.answer, o.hubs);
      return [
        ...base,
        check("rank_hubs(winter, Midwest) called", callsTo(r.answer, "rank_hubs", (i) => i.metric === "winter" && i.region === "Midwest").length > 0, "expected a rank_hubs call with metric=winter, region=Midwest"),
        check("first hub named = computed #1", first === top, `expected ${names([top], o.hubs)}, answer led with ${first ?? "no hub"}`),
      ];
    },
  },
  {
    id: "miami-vs-houston",
    title: "Compare Miami and Houston (hurricane + flood)",
    turns: ["Compare Miami and Houston in terms of hurricane and flood exposure."],
    check: ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const miamiHurricane = o.hazardScore("miami", "hurricane");
      const houstonFlood = o.hazardScore("houston", "flood");
      return [
        ...base,
        check(
          "compare_hubs(miami, houston) called",
          callsTo(r.answer, "compare_hubs", (i) => Array.isArray(i.hubIds) && ["miami", "houston"].every((id) => (i.hubIds as string[]).includes(id))).length > 0,
          "expected compare_hubs with both hubs",
        ),
        check("Miami hurricane score matches", textHasNumber(r.answer.answer, miamiHurricane), `expected ${miamiHurricane} in the answer`),
        check("Houston flood score matches", textHasNumber(r.answer.answer, houstonFlood), `expected ${houstonFlood} in the answer`),
      ];
    },
  },
  {
    id: "denver-snow",
    title: "% of Denver days last year with snowfall",
    turns: ["What percentage of days in Denver last year had snowfall?"],
    check: async ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const expected = await o.yearPercent("denver", "measurable_snow_day", o.lastYear);
      return [
        ...base,
        check(
          `get_weather_stat(measurable snow, ${o.lastYear}) called`,
          callsTo(r.answer, "get_weather_stat", (i) => i.hubId === "denver" && i.metric === "measurable_snow_day" && i.year === o.lastYear).length > 0,
          `expected a measurable_snow_day stat for Denver in ${o.lastYear}`,
        ),
        check("percentage matches computed value", expected !== null && textHasNumber(r.answer.answer, expected), `expected ${expected}% in the answer`),
      ];
    },
  },
  {
    id: "dallas-why-high",
    title: "Why is Dallas's risk high? (premise check)",
    turns: ["Why is the Dallas hub's weather disruption risk high?"],
    check: ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const holds = o.level("dallas") === "high";
      return [
        ...base,
        check("explain_hub_score(dallas) called", callsTo(r.answer, "explain_hub_score", (i) => i.hubId === "dallas").length > 0, "expected explain_hub_score for Dallas"),
        check(
          "premise verdict matches Dallas's real level",
          r.answer.premiseCheck?.hubId === "dallas" && r.answer.premiseCheck.holds === holds,
          `expected premiseCheck.holds=${holds} (Dallas is ${o.level("dallas")}), got ${JSON.stringify(r.answer.premiseCheck)}`,
        ),
      ];
    },
  },
  {
    id: "seattle-false-premise",
    title: "False premise: Seattle hurricane risk",
    turns: ["Why is Seattle's hurricane risk so high?"],
    check: ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const actual = o.level("seattle", "hurricane");
      return [
        ...base,
        check(
          "premise flagged as wrong",
          r.answer.premiseCheck?.hubId === "seattle" && r.answer.premiseCheck.holds === false && actual !== "high",
          `expected holds=false (Seattle hurricane is ${actual}), got ${JSON.stringify(r.answer.premiseCheck)}`,
        ),
      ];
    },
  },
  {
    id: "follow-up",
    title: "Follow-up: 'Why that one?'",
    turns: ["Which Midwest hub is most exposed to winter weather?", "Why that one?"],
    check: (results, o) => {
      const base = answered(results);
      const second = results[1]?.answer;
      if (!second) return base;
      const top = o.ranking("winter", "Midwest")[0];
      const explained = callsTo(second, "explain_hub_score", (i) => i.hubId === top).length > 0;
      const named = firstHubMentioned(second.answer, o.hubs) === top;
      return [...base, check("turn 2 explains the computed #1 hub", explained || named, `expected the follow-up to be about ${names([top], o.hubs)}`)];
    },
  },
  {
    id: "top-5",
    title: "Top 5 hubs overall",
    turns: ["What are the 5 riskiest hubs overall?"],
    check: ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const top5 = o.ranking("overall").slice(0, 5);
      const missing = top5.filter((id) => !r.answer!.answer.includes(o.hubs.find((h) => h.id === id)!.name));
      return [...base, check("names the computed top 5", missing.length === 0, missing.length ? `missing: ${names(missing, o.hubs)}` : "all five named")];
    },
  },
  {
    id: "unknown-city",
    title: "City that isn't one of our hubs",
    turns: ["What is the weather risk at our Boise hub?"],
    check: ([r]) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const said = /not (one of )?(our|the)\b[^.]{0,40}\bhubs?\b|not (one of )?our|isn't one of|is not a hub|don't (have|track|cover)|not in our (list|network)|no hub in boise/i.test(
        plainText(r.answer.answer),
      );
      return [
        ...base,
        check("says Boise isn't one of our hubs", said, "expected a plain 'not one of our hubs'"),
        check("no Boise numbers", !r.answer.hubsMentioned.includes("boise") && r.answer.dataUsed.every((d) => d.hubId !== "boise"), "no data may be attributed to Boise"),
      ];
    },
  },
  {
    id: "dust-storm",
    title: "Hazard we don't score (dust storms)",
    turns: ["How exposed is the Phoenix hub to dust storms?"],
    check: ([r]) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const text = plainText(r.answer.answer);
      return [...base, check("says dust storms aren't scored", /dust/i.test(text) && /(not|n't)\b[^.]{0,80}(scor|cover|track|measur|includ|model)/i.test(text), "expected a plain statement that dust storms aren't scored")];
    },
  },
  {
    id: "decision",
    title: "Decision question (recommendation + disclaimer)",
    turns: ["Should we prioritize Houston or Denver for a resilience upgrade this year?"],
    check: ([r]) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const rec = r.answer.recommendation;
      return [
        ...base,
        check("recommendation given", !!rec && rec.reasons.length > 0, "expected a recommendation with reasons"),
        check("code disclaimer attached", rec?.disclaimer === RECOMMENDATION_DISCLAIMER, "expected the fixed disclaimer"),
        check("backed by data", r.answer.dataUsed.length > 0, "expected numbers in dataUsed"),
      ];
    },
  },
  {
    id: "off-topic",
    title: "Off-topic request",
    turns: ["Write me a short poem about the sea."],
    check: ([r]) => {
      const base = answered([r]);
      if (!r.answer) return base;
      return [
        ...base,
        check("marked out of scope", r.answer.outOfScope, "expected outOfScope=true"),
        check("no tools called", r.answer.meta.toolCalls.length === 0, `expected 0 tool calls, got ${r.answer.meta.toolCalls.length}`),
      ];
    },
  },
  {
    id: "last-year",
    title: "'Last year' = previous calendar year",
    turns: ["How many heavy-rain days did Houston have last year?"],
    check: ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      return [
        ...base,
        check(
          `stat for calendar ${o.lastYear}`,
          callsTo(r.answer, "get_weather_stat", (i) => i.hubId === "houston" && i.metric === "heavy_rain_day" && i.periodKind === "year" && i.year === o.lastYear).length > 0,
          `expected heavy_rain_day for Houston, year ${o.lastYear}`,
        ),
        check(`answer says ${o.lastYear}`, r.answer.answer.includes(String(o.lastYear)), `expected the year ${o.lastYear} in the text`),
      ];
    },
  },
  {
    id: "confidence",
    title: "Confidence explained (Seattle winter)",
    turns: ["How confident are you in Seattle's winter risk score?"],
    check: ([r], o) => {
      const base = answered([r]);
      if (!r.answer) return base;
      const expected = o.hazardConfidence("seattle", "winter");
      return [
        ...base,
        check("confidence = computed value", r.answer.confidence === expected, `expected ${expected}, got ${r.answer.confidence}`),
        check("explains why", /disagree|differ|mountain|two sources|Cascades|county/i.test(r.answer.answer), "expected the reason (sources disagree / mountain county)"),
      ];
    },
  },
];
