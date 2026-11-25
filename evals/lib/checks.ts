/**
 * @module evals/lib/checks
 *
 * Small, pure helpers the eval cases use to inspect answers.
 */
import type { FinalAnswer, ToolCallRecord } from "../../src/core/agent/answerSchema";
import { collectNumbers } from "../../src/core/agent/ledger";
import type { CheckResult } from "./types";

/**
 * Builds a check result.
 * @param name - what is checked.
 * @param pass - whether it passed.
 * @param detail - expected vs actual.
 * @returns the check.
 */
export function check(name: string, pass: boolean, detail: string): CheckResult {
  return { name, pass, detail };
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
 * Which of the given hub names appears FIRST in the answer text.
 * @param text - answer text.
 * @param hubs - id + display name per hub.
 * @returns the id of the earliest-mentioned hub, or null.
 */
export function firstHubMentioned(text: string, hubs: { id: string; name: string }[]): string | null {
  let best: { id: string; at: number } | null = null;
  for (const hub of hubs) {
    const at = text.indexOf(hub.name);
    if (at >= 0 && (!best || at < best.at)) best = { id: hub.id, at };
  }
  return best?.id ?? null;
}

/**
 * True when the text contains the number, allowing display rounding
 * (9.04 may be written "9", "9.0" or "9.04").
 * @param text - answer text.
 * @param expected - the number to find.
 * @returns whether it appears.
 */
export function textHasNumber(text: string, expected: number): boolean {
  return collectNumbers(text).some((n) => Math.abs(n - expected) <= 0.051 || n === Math.round(expected));
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
