/**
 * @module core/agent/ledger
 *
 * Records every tool result produced while answering one question. The answer
 * validator uses it as the ground truth: hubs, numbers, confidences and
 * caveats in the final answer must trace back to entries here.
 */
import type { ModelMessage } from "ai";
import type { Confidence } from "../scoring/types";
import type { ToolCallRecord } from "./answerSchema";

/** Fields every tool output carries so the ledger can read them uniformly. */
export interface ToolOutputBase {
  /** Hub ids this result contains data for. */
  hubIds: string[];
  /** Weakest confidence of the data in this result (null when not applicable, e.g. an error). */
  confidence: Confidence | null;
  /** Standing caveats that apply to this result (G4). */
  caveats: string[];
}

/**
 * Numbers inside text, e.g. "72.4", "-18", "1,826". A minus sign only counts
 * when it is NOT right after a digit — in "0-100" the dash is a range, not a sign.
 */
const NUMBER_IN_TEXT = /(?:(?<![\d.])-)?\d[\d,]*(?:\.\d+)?/g;

/** Fixed facts of the method that answers may always mention: the 0–100 score scale. */
export const ALWAYS_KNOWN_NUMBERS: readonly number[] = [0, 100];

/**
 * Collects every number in a value: numeric fields and numbers written inside strings.
 * @param value - any JSON-like value.
 * @param into - accumulator.
 * @returns the accumulator.
 */
export function collectNumbers(value: unknown, into: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) into.push(value);
  else if (typeof value === "string") {
    for (const match of value.match(NUMBER_IN_TEXT) ?? []) into.push(Number(match.replace(/,/g, "")));
  } else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, into));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectNumbers(item, into));
  return into;
}

/**
 * True when `claimed` matches a tool number, allowing display rounding
 * (72.43 may be quoted as 72.4 or 72).
 * @param claimed - number the answer uses.
 * @param known - numbers from tool results.
 * @returns whether it traces back to a tool.
 */
export function matchesKnownNumber(claimed: number, known: readonly number[]): boolean {
  return known.some(
    (n) => Math.abs(n - claimed) <= 0.051 || Math.round(n) === claimed || Math.abs(Math.round(n * 10) / 10 - claimed) < 1e-9,
  );
}

/** True when a value has the fields every tool output carries. */
function isToolOutput(value: unknown): value is ToolOutputBase {
  const v = value as Partial<ToolOutputBase> | null;
  return !!v && typeof v === "object" && Array.isArray(v.hubIds) && Array.isArray(v.caveats) && "confidence" in v;
}

/**
 * Extracts our tool outputs from earlier conversation turns (role "tool" messages).
 * @param messages - conversation history.
 * @returns the tool outputs found, oldest first.
 */
export function toolOutputsFromHistory(messages: readonly ModelMessage[]): ToolOutputBase[] {
  const outputs: ToolOutputBase[] = [];
  for (const message of messages) {
    if (message.role !== "tool" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      const value = part.output.type === "json" ? part.output.value : null;
      if (isToolOutput(value)) outputs.push(value);
    }
  }
  return outputs;
}

/**
 * Ground truth of one agent turn: this turn's tool results, plus tool results
 * from earlier turns of the same conversation (D25 — follow-ups may reuse them).
 */
export class ToolLedger {
  readonly calls: ToolCallRecord[] = [];
  private readonly outputs: ToolOutputBase[] = [];
  private historyOutputs: ToolOutputBase[] = [];

  /**
   * Adds tool results from earlier turns. They count as known hubs and numbers;
   * their confidence and caveats are used only when this turn calls no tools.
   * @param messages - conversation history.
   */
  seedFromHistory(messages: readonly ModelMessage[]): void {
    this.historyOutputs = toolOutputsFromHistory(messages);
  }

  /** Current-turn outputs if any, otherwise the earlier ones (for confidence/caveats). */
  private relevantOutputs(): ToolOutputBase[] {
    return this.outputs.length > 0 ? this.outputs : this.historyOutputs;
  }

  /**
   * Records a tool call and its output.
   * @param tool - tool name.
   * @param input - validated tool input.
   * @param output - the tool's output.
   */
  record(tool: string, input: unknown, output: ToolOutputBase): void {
    this.calls.push({ tool, input, output });
    this.outputs.push(output);
  }

  /** @returns every hub id any tool returned data for (this turn or earlier). */
  hubIds(): Set<string> {
    return new Set([...this.outputs, ...this.historyOutputs].flatMap((o) => o.hubIds));
  }

  /** @returns every number found in tool outputs (this turn or earlier), plus the fixed scale bounds. */
  numbers(): number[] {
    return collectNumbers([...this.outputs, ...this.historyOutputs], [...ALWAYS_KNOWN_NUMBERS]);
  }

  /** @returns the confidences of the relevant results that have one. */
  confidences(): Confidence[] {
    return this.relevantOutputs()
      .map((o) => o.confidence)
      .filter((c): c is Confidence => c !== null);
  }

  /** @returns the relevant standing caveats, de-duplicated, in first-seen order. */
  caveats(): string[] {
    return [...new Set(this.relevantOutputs().flatMap((o) => o.caveats))];
  }
}
