/**
 * @module evals/lib/checks
 *
 * Small, pure helpers the eval cases use to inspect answers.
 */
import type { FinalAnswer, ToolCallRecord } from "../../src/core/agent/answerSchema";
import { collectNumbers } from "../../src/core/agent/ledger";
import type { CheckKind, CheckResult } from "./types";

/**
 * Builds a check result.
 * @param name - what is checked.
 * @param pass - whether it passed.
 * @param detail - expected vs actual.
 * @param kind - what the check guards (decides e.g. whether it is in the bakeoff gate).
 * @returns the check.
 */
export function check(name: string, pass: boolean, detail: string, kind: CheckKind): CheckResult {
  return { name, pass, detail, kind };
}

/**
 * Check names that guarded the data and the premise in results files saved before checks had a
 * `kind`. Only used to read those legacy files; new checks carry their kind.
 */
const LEGACY_GATE_NAME = /premise|matches|computed|numbers|percentage|stat for calendar|answer says \d{4}/i;

/**
 * What a check guards. Files saved before `kind` existed are classified by name, the way the
 * bakeoff did it then (a "judge:" prefix, or the legacy gate pattern).
 * @param result - a check, possibly from an old results file.
 * @returns its kind.
 */
export function checkKind(result: CheckResult): CheckKind {
  if (result.kind) return result.kind;
  if (result.name.startsWith("judge:")) return "judge";
  return LEGACY_GATE_NAME.test(result.name) ? "gate" : "behavior";
}

/**
 * Answer text with typographic quotes made plain, so wording checks don't depend on the
 * model's apostrophe style (GPT models write "aren’t", which broke `n't` regexes in the bakeoff).
 * @param text - answer text.
 * @returns the same text with ’ ‘ → ' and “ ” → ".
 */
export function plainText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

/**
 * The answer split into sentences (and list lines), with Markdown emphasis removed, so wording
 * checks can ask for words that appear TOGETHER. A dot inside a number ("72.2") or after "St"
 * ("St. Louis") doesn't split.
 * @param text - answer text.
 * @returns the sentences, trimmed, without empty ones.
 */
export function sentences(text: string): string[] {
  return plainText(text)
    .replace(/[*_`]+/g, "")
    .split(/(?<=[.!?])(?<!\bSt\.)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Whether one sentence of the text matches every pattern (words that must appear together).
 * @param text - answer text.
 * @param patterns - regexes that must all match the same sentence (no `g` flag: `test` would keep state).
 * @returns true when some sentence matches them all.
 */
export function someSentence(text: string, ...patterns: RegExp[]): boolean {
  return sentences(text).some((sentence) => patterns.every((p) => p.test(sentence)));
}

/**
 * Finds tool calls by name whose input matches a predicate.
 * @param answer - the answer.
 * @param tool - tool name.
 * @param matches - predicate on the input (default: any).
 * @returns the matching calls.
 */
export function callsTo(answer: FinalAnswer, tool: string, matches: (input: Record<string, unknown>) => boolean = () => true): ToolCallRecord[] {
  return answer.meta.toolCalls.filter((c) => c.tool === tool && matches((c.input ?? {}) as Record<string, unknown>));
}

/**
 * Text normalized for finding hub names: lower case, plain quotes, "Saint"/"St." → "st", single spaces.
 * So "St Louis", "St. Louis" and "Saint Louis" all match.
 * @param text - any text.
 * @returns the normalized text.
 */
export function normalizeForNames(text: string): string {
  return plainText(text)
    .toLowerCase()
    .replace(/\bsaint\b/g, "st")
    .replace(/\bst\./g, "st")
    .replace(/\s+/g, " ");
}

/**
 * Where a hub's name first appears in the text (case and "St."/"Saint" tolerant).
 * @param text - answer text.
 * @param name - the hub's display name.
 * @returns the position in the normalized text, or -1.
 */
function nameAt(text: string, name: string): number {
  return normalizeForNames(text).indexOf(normalizeForNames(name));
}

/**
 * Whether the text names a hub (case and "St."/"Saint" tolerant).
 * @param text - answer text.
 * @param name - the hub's display name.
 * @returns true when it appears.
 */
export function mentionsHub(text: string, name: string): boolean {
  return nameAt(text, name) >= 0;
}

/**
 * Which of the given hub names appears FIRST in the answer text.
 * @param text - answer text.
 * @param hubs - id + display name per hub.
 * @returns the id of the earliest-mentioned hub, or null.
 */
export function firstHubMentioned(text: string, hubs: { id: string; name: string }[]): string | null {
  let best: { id: string; at: number } | null = null;
  for (const hub of hubs) {
    const at = nameAt(text, hub.name);
    if (at >= 0 && (!best || at < best.at)) best = { id: hub.id, at };
  }
  return best?.id ?? null;
}

/**
 * Whether a written number is the expected one, allowing display rounding
 * (9.04 may be written "9", "9.0" or "9.04").
 * @param written - the number as written.
 * @param expected - the computed value.
 * @returns true when they match.
 */
export function sameNumber(written: number, expected: number): boolean {
  return Math.abs(written - expected) <= 0.051 || written === Math.round(expected);
}

/** Scale and count phrases whose numbers are never the value itself ("0–100", "out of 100", "/100", "of 36 hubs"). */
const NOT_A_VALUE = /\b0\s*[–-]\s*100\b|\bout of \d+(?:\.\d+)?|\/\s*100\b|\bof \d+ hubs\b/gi;

/** A number followed by a percent sign or the word "percent". */
const PERCENT_IN_TEXT = /(\d[\d,]*(?:\.\d+)?)\s*(?:%|percent\b)/gi;

/** One number the answer must state about a hub. */
export interface NumberClaim {
  hubId: string;
  /** The hub's display name (to find the number's sentence). */
  hubName: string;
  /** What the value is, for messages, e.g. "hurricane score". */
  label: string;
  /** Words naming the value, e.g. /hurricane/i (no `g` flag): must match the `dataUsed` label, or the sentence with the number. */
  topic: RegExp;
  /** The computed value. */
  expected: number;
  /** A percentage: the text must write it with "%" (or "percent"), and `dataUsed` must say "%". */
  percent?: boolean;
}

/**
 * Whether the answer states a number for the RIGHT hub and value, not just anywhere. Both must hold:
 * 1. `dataUsed` (the structured numbers the answer relies on) has an entry for that hub whose label
 *    names the topic and whose value is the expected number (with display rounding);
 * 2. the text writes that number in a sentence that names the hub or the topic (with "%" for a
 *    percentage), ignoring scale phrases like "0–100" or "out of 100".
 * So "on a 0–100 scale" no longer passes for a score of 100, and "9 of 36 hubs" not for 9%.
 * @param answer - the answer.
 * @param claim - the hub, topic and expected value.
 * @returns whether it passes, and why not.
 */
export function statesNumber(answer: FinalAnswer, claim: NumberClaim): { pass: boolean; detail: string } {
  const what = `${claim.hubName} ${claim.label} = ${claim.expected}${claim.percent ? "%" : ""}`;
  const structured = answer.dataUsed.some(
    (d) =>
      d.hubId === claim.hubId &&
      claim.topic.test(d.label) &&
      sameNumber(d.value, claim.expected) &&
      (!claim.percent || /%|percent/i.test(`${d.unit} ${d.label}`)),
  );
  const inText = sentences(answer.answer).some((sentence) => {
    if (!mentionsHub(sentence, claim.hubName) && !claim.topic.test(sentence)) return false;
    const values = sentence.replace(NOT_A_VALUE, " ");
    const numbers = claim.percent ? [...values.matchAll(PERCENT_IN_TEXT)].map((m) => Number(m[1].replace(/,/g, ""))) : collectNumbers(values);
    return numbers.some((n) => sameNumber(n, claim.expected));
  });
  if (structured && inText) return { pass: true, detail: `${what} stated and listed in dataUsed` };
  const missing = [
    structured ? null : `no dataUsed entry for ${claim.hubId} with a matching label and value`,
    inText ? null : `not written next to "${claim.hubName}" or the topic in the text`,
  ].filter(Boolean);
  return { pass: false, detail: `expected ${what}: ${missing.join("; ")}` };
}

/**
 * Counts duplicate tool calls (same tool + same input) — the "over-exploring" metric (E4).
 * @param calls - the answer's tool calls.
 * @returns how many calls repeated an earlier one.
 */
export function duplicateCalls(calls: ToolCallRecord[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const call of calls) {
    const key = `${call.tool}:${JSON.stringify(call.input)}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  return duplicates;
}
