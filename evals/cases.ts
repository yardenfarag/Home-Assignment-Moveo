/**
 * @module evals/cases
 *
 * The eval set (E3): cases covering the brief's questions, premise pushback,
 * follow-ups, scope limits, decisions and confidence. Every expected value comes
 * from the oracle at run time — nothing is hand-typed (E2).
 *
 * Wording checks look for words that appear in the SAME sentence and accept plain or curly
 * apostrophes (lesson 22); structured answer fields are used wherever they exist.
 */
import { RECOMMENDATION_DISCLAIMER } from "../src/core/agent/config";
import { callsTo, check, firstHubMentioned, mentionsHub, plainText, someSentence, statesNumber } from "./lib/checks";
import type { Oracle } from "./lib/oracle";
import type { CheckResult, EvalCase, TurnResult } from "./lib/types";

/**
 * Every case must at least produce an answer (it passed validation within one retry).
 * @param results - the case's turns.
 * @returns one "turn N answered" check per turn.
 */
function answered(results: TurnResult[]): CheckResult[] {
  return results.map((r, i) =>
    check(`turn ${i + 1} answered`, !!r.answer, r.answer ? "validated answer produced" : `no answer: ${r.error ?? "unknown"}`, "behavior"),
  );
}

/**
 * Hub ids → display names, e.g. "Minneapolis, Detroit".
 * @param ids - hub ids.
 * @param hubs - id + name of every hub.
 * @returns the names, comma-separated (an unknown id is shown as is).
 */
const names = (ids: string[], hubs: { id: string; name: string }[]) => ids.map((id) => hubs.find((h) => h.id === id)?.name ?? id).join(", ");

/**
 * A number check: the answer states the expected value for this hub (see `statesNumber`).
 * @param name - the check's name.
 * @param answer - the answer.
 * @param o - the oracle (for the hub's name).
 * @param claim - hub, label, topic, expected value and whether it's a percentage.
 * @returns the gate check.
 */
function numberCheck(name: string, answer: NonNullable<TurnResult["answer"]>, o: Oracle, claim: { hubId: string; label: string; topic: RegExp; expected: number; percent?: boolean }): CheckResult {
  const result = statesNumber(answer, { ...claim, hubName: names([claim.hubId], o.hubs) });
  return check(name, result.pass, result.detail, "gate");
}

/** Saying Boise isn't one of our hubs: "not one of our hubs", "isn't in our network", "not a hub we cover", "no hub in Boise". */
const NOT_OUR_HUB =
  /(?:\bnot|n't)\s+(?:currently\s+|actually\s+)?(?:one of|part of|in|among|on|a|an|included in|covered by)\b.{0,60}\b(?:hubs?|network|coverage|list|locations?|sites?|portfolio)\b|\bno\s+(?:\w+\s+)?hub\b/i;

/** Saying we don't track Boise: "we do not track Boise", "we don't have a hub in Boise", "Boise is not covered". */
const NOT_TRACKED =
  /\b(?:do|does)\s*(?:not|n't)\s+(?:currently\s+)?(?:have|track|cover|monitor|score|include)\s+(?:a\s+|an\s+|any\s+)?(?:hub|location|site|facility|boise)\b|(?:\bnot|n't)\s+(?:currently\s+)?(?:covered|tracked|monitored|scored|included)\b/i;

/**
 * A negation shortly before a "scored" word (at most 4 words between, numbers like "12.3" count as
 * one word, a comma ends the phrase): "aren't a tracked hazard", "not scored separately", "don't score".
 */
const NOT_SCORED = /(?:\bnot|n't|\bcannot|\bno|\bnever)\s+(?:[\w.'-]+\s+){0,4}?(?:scor|cover|track|measur|includ|model)\w*/i;

/** "Our model has no dust-storm hazard / score / rating". */
const NO_DUST_HAZARD = /\bno\s+dust[\s-]*storms?\s+(?:hazard|score|rating|metric|category|measure)/i;

/** The sources disagree: "sources disagree", "observed and FEMA differ", "the records conflict". */
const DISAGREE = /\b(?:disagree\w*|differ(?:s|ed)?|diverge\w*|conflict\w*|mismatch\w*|inconsisten\w*|far apart)\b|\b(?:do|does)\s*(?:not|n't)\s+agree\b/i;

/** Words naming the two sources (so "differs from last year" isn't taken as the reason). */
const SOURCES = /\bsources?\b|\bobserv\w*|\bFEMA\b|\brecords?\b|\bcomponents?\b/i;

/**
 * The eval cases, in report order. Each `check` gets the turns' results and the oracle, and every
 * check says what it guards (`kind`), so the bakeoff gate and the reports never read check names.
 */
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
        check("rank_hubs(winter, Midwest) called", callsTo(r.answer, "rank_hubs", (i) => i.metric === "winter" && i.region === "Midwest").length > 0, "expected a rank_hubs call with metric=winter, region=Midwest", "tool"),
        check("first hub named = computed #1", first === top, `expected ${names([top], o.hubs)}, answer led with ${first ?? "no hub"}`, "gate"),
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
      return [
        ...base,
        check(
          "compare_hubs(miami, houston) called",
          callsTo(r.answer, "compare_hubs", (i) => Array.isArray(i.hubIds) && ["miami", "houston"].every((id) => (i.hubIds as string[]).includes(id))).length > 0,
          "expected compare_hubs with both hubs",
          "tool",
        ),
        numberCheck("Miami hurricane score matches", r.answer, o, { hubId: "miami", label: "hurricane score", topic: /hurricane/i, expected: o.hazardScore("miami", "hurricane") }),
        numberCheck("Houston flood score matches", r.answer, o, { hubId: "houston", label: "flood score", topic: /flood/i, expected: o.hazardScore("houston", "flood") }),
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
          "tool",
        ),
        expected === null
          ? check("percentage matches computed value", false, `no snow data for Denver in ${o.lastYear}, so there is nothing to compare`, "setup")
          : numberCheck("percentage matches computed value", r.answer, o, { hubId: "denver", label: "days with snow", topic: /snow/i, expected, percent: true }),
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
        check("explain_hub_score(dallas) called", callsTo(r.answer, "explain_hub_score", (i) => i.hubId === "dallas").length > 0, "expected explain_hub_score for Dallas", "tool"),
        check(
          "premise verdict matches Dallas's real level",
          r.answer.premiseCheck?.hubId === "dallas" && r.answer.premiseCheck.holds === holds,
          `expected premiseCheck.holds=${holds} (Dallas is ${o.level("dallas")}), got ${JSON.stringify(r.answer.premiseCheck)}`,
          "gate",
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
        // The case only tests pushback while the premise really is false; if the data changes, the case is wrong, not the model.
        check("case still valid: Seattle hurricane isn't high", actual !== "high", `Seattle hurricane is ${actual} in today's data`, "setup"),
        check(
          "premise flagged as wrong",
          r.answer.premiseCheck?.hubId === "seattle" && r.answer.premiseCheck.holds === false,
          `expected holds=false (Seattle hurricane is ${actual}), got ${JSON.stringify(r.answer.premiseCheck)}`,
          "gate",
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
      return [...base, check("turn 2 explains the computed #1 hub", explained || named, `expected the follow-up to be about ${names([top], o.hubs)}`, "gate")];
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
      const missing = top5.filter((id) => !mentionsHub(r.answer!.answer, names([id], o.hubs)));
      return [...base, check("names the computed top 5", missing.length === 0, missing.length ? `missing: ${names(missing, o.hubs)}` : "all five named", "gate")];
    },
  },
  {
    id: "unknown-city",
    title: "City that isn't one of our hubs",
    turns: ["What is the weather risk at our Boise hub?"],
    check: ([r]) => {
      const base = answered([r]);
      if (!r.answer) return base;
      // Sentence-level: the sentence that says "not one of our hubs" must be about Boise (or "it").
      const said = someSentence(r.answer.answer, /\bboise\b|\bit\b/i, NOT_OUR_HUB) || someSentence(r.answer.answer, /\bboise\b|\bit\b/i, NOT_TRACKED);
      return [
        ...base,
        check("says Boise isn't one of our hubs", said, "expected a plain 'Boise is not one of our hubs' (in one sentence)", "behavior"),
        check("no Boise numbers", !r.answer.hubsMentioned.includes("boise") && r.answer.dataUsed.every((d) => d.hubId !== "boise"), "no data may be attributed to Boise", "gate"),
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
      return [
        ...base,
        check(
          "says dust storms aren't scored",
          someSentence(r.answer.answer, /\bdust/i, NOT_SCORED) || someSentence(r.answer.answer, NO_DUST_HAZARD),
          "expected a plain statement, in one sentence, that dust storms aren't scored",
          "behavior",
        ),
      ];
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
        check("recommendation given", !!rec && rec.reasons.length > 0, "expected a recommendation with reasons", "behavior"),
        check("code disclaimer attached", rec?.disclaimer === RECOMMENDATION_DISCLAIMER, "expected the fixed disclaimer", "behavior"),
        check("backed by data", r.answer.dataUsed.length > 0, "expected numbers in dataUsed", "behavior"),
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
        check("marked out of scope", r.answer.outOfScope, "expected outOfScope=true", "behavior"),
        check("no tools called", r.answer.meta.toolCalls.length === 0, `expected 0 tool calls, got ${r.answer.meta.toolCalls.length}`, "tool"),
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
        // Asking for the wrong year gives a wrong number, so both checks are in the gate.
        check(
          `stat for calendar ${o.lastYear}`,
          callsTo(r.answer, "get_weather_stat", (i) => i.hubId === "houston" && i.metric === "heavy_rain_day" && i.periodKind === "year" && i.year === o.lastYear).length > 0,
          `expected heavy_rain_day for Houston, year ${o.lastYear}`,
          "gate",
        ),
        check(`answer says ${o.lastYear}`, r.answer.answer.includes(String(o.lastYear)), `expected the year ${o.lastYear} in the text`, "gate"),
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
      const text = plainText(r.answer.answer);
      // The reason: the two sources disagree (said together with the sources), or the mountain county.
      const explains = someSentence(text, DISAGREE, SOURCES) || /\bmountain\w*|\bCascades?\b/i.test(text);
      return [
        ...base,
        check("confidence = computed value", r.answer.confidence === expected, `expected ${expected}, got ${r.answer.confidence}`, "gate"),
        check("explains why", explains, "expected the reason (the sources disagree / mountain county)", "behavior"),
      ];
    },
  },
];
