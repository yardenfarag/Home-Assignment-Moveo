/**
 * @module core/agent/ledger
 *
 * Records every tool result produced while answering one question. The answer
 * validator uses it as the ground truth: hubs, numbers, confidences and
 * caveats in the final answer must trace back to entries here.
 */
import type { ModelMessage } from "ai";
import { standingCaveatCatalog } from "../scoring/caveats";
import { HAZARD_WEIGHTS, OVERALL_MIX, RISK_LEVEL_CUTOFFS, SCORING_WINDOW_DAYS, HALF_BLEND } from "../scoring/config";
import { DAY_METRICS } from "../scoring/dayMetrics";
import type { Confidence } from "../scoring/types";
import type { UnitSystem } from "../utils/units";
import type { ToolCallRecord } from "./answerSchema";

/** Fields every tool output carries so the ledger can read them uniformly. */
export interface ToolOutputBase {
  /** Hub ids this result contains data for. */
  hubIds: string[];
  /** Weakest confidence of the data in this result (null when not applicable, e.g. an error). */
  confidence: Confidence | null;
  /**
   * Standing caveats that apply to this result (G4). In what the MODEL sees, a caveat whose text
   * it already has (from an earlier call of this conversation) is moved to `caveatsGivenEarlier`.
   */
  caveats: string[];
  /**
   * Ids (from `standingCaveatCatalog`) of caveats that also apply to this result but whose text
   * the model was already given earlier in the conversation. Only in what the model sees.
   */
  caveatsGivenEarlier?: string[];
}

/**
 * Numbers inside text, e.g. "72.4", "-18", "1,826". A minus sign only counts
 * when it is NOT right after a digit — in "0-100" the dash is a range, not a sign.
 */
const NUMBER_IN_TEXT = /(?:(?<![\d.])-)?\d[\d,]*(?:\.\d+)?/g;


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
 * Fixed facts of the METHOD that answers may always quote (they come from the
 * system prompt, not from a tool) — all derived from config, never retyped:
 * the 0–100 scale, level cut-offs, formula weights, hazard weights, the 50/50
 * blend, the scoring window, and every hazard-day threshold in both unit systems.
 */
export const ALWAYS_KNOWN_NUMBERS: readonly number[] = [
  0,
  100,
  RISK_LEVEL_CUTOFFS.mediumFrom - 1,
  RISK_LEVEL_CUTOFFS.mediumFrom,
  RISK_LEVEL_CUTOFFS.highFrom - 1,
  RISK_LEVEL_CUTOFFS.highFrom,
  OVERALL_MIX.weightedAverage,
  OVERALL_MIX.worstHazard,
  OVERALL_MIX.weightedAverage * 100,
  OVERALL_MIX.worstHazard * 100,
  ...Object.values(HAZARD_WEIGHTS).flatMap((w) => [w, w * 100]),
  HALF_BLEND.observed * 100,
  HALF_BLEND.fema * 100,
  SCORING_WINDOW_DAYS,
  Math.round(SCORING_WINDOW_DAYS / 365.25),
  ...collectNumbers(Object.values(DAY_METRICS).map((m) => m.threshold)),
];

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
 *
 * It also keeps tool results small for the model: a standing caveat's text is sent only the
 * first time the model's context gets it; later results name it by id (`caveatsGivenEarlier`).
 * The ledger itself always keeps the FULL caveats, so the answer's limitations and the
 * "numbers must come from tools" check see everything.
 */
export class ToolLedger {
  /** Every call of this turn, in order (becomes the answer's `meta.toolCalls`, with full caveats). */
  readonly calls: ToolCallRecord[] = [];
  /** This turn's tool outputs (full caveats). */
  private readonly outputs: ToolOutputBase[] = [];
  /** Tool outputs from earlier turns of the conversation (D65), with caveats given by id turned back into text. */
  private historyOutputs: ToolOutputBase[] = [];
  /** Numbers the system prompt states (hub count, this year and last year, D122). */
  private extraKnown: number[] = [];
  /** Keys of calls already started in this answer (duplicate detection, E8). */
  private readonly claimed = new Set<string>();
  /** Caveat texts the model already has in its context (sent in full this turn or in the loaded history). */
  private readonly caveatsShown = new Set<string>();
  /** Standing caveat text → id. */
  private readonly caveatIdByText: Map<string, string>;
  /** Standing caveat id → text. */
  private readonly caveatTextById: Map<string, string>;

  /**
   * @param units - unit system of this conversation's caveat texts (the app always uses "us", D126).
   */
  constructor(units: UnitSystem = "us") {
    const catalog = standingCaveatCatalog(units);
    this.caveatIdByText = new Map(catalog.map((c) => [c.text, c.id]));
    this.caveatTextById = new Map(catalog.map((c) => [c.id, c.text]));
  }

  /**
   * Claims a tool call when it STARTS (so parallel duplicates in one step are caught too).
   * @param tool - tool name.
   * @param input - tool input.
   * @returns true the first time this exact call is seen in this answer, false for repeats.
   */
  claim(tool: string, input: unknown): boolean {
    const key = `${tool}:${JSON.stringify(input)}`;
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }

  /**
   * Adds facts known for this turn that aren't tool results (e.g. the live hub count from the prompt).
   * @param numbers - the numbers.
   */
  addKnownNumbers(numbers: number[]): void {
    this.extraKnown.push(...numbers);
  }

  /**
   * Adds tool results from earlier turns. They count as known hubs and numbers;
   * their confidence and caveats are used only when this turn calls no tools.
   * Caveats those results name by id are turned back into text (an id this version no longer
   * knows is skipped). Only caveats whose TEXT is in the history count as already shown to the
   * model: when the turn that carried a text drops out of the history window, it is sent again.
   * @param messages - conversation history.
   */
  seedFromHistory(messages: readonly ModelMessage[]): void {
    const outputs = toolOutputsFromHistory(messages);
    for (const output of outputs) output.caveats.forEach((text) => this.caveatsShown.add(text));
    this.historyOutputs = outputs.map((output) => {
      const ids: unknown[] = Array.isArray(output.caveatsGivenEarlier) ? output.caveatsGivenEarlier : [];
      const earlier = ids.flatMap((id) => (typeof id === "string" ? (this.caveatTextById.get(id) ?? []) : []));
      return earlier.length > 0 ? { ...output, caveats: [...new Set([...output.caveats, ...earlier])] } : output;
    });
  }

  /**
   * What the MODEL gets for a recorded output: caveats it already has in its context are named
   * by id instead of repeated (data-dependent caveats outside the catalog are always sent).
   * Call it once per output, in the order the results reach the model.
   * @param output - the full tool output (as recorded).
   * @returns the same output, or a copy with repeated caveats replaced by `caveatsGivenEarlier`.
   */
  forModel<T extends ToolOutputBase>(output: T): T {
    const caveats: string[] = [];
    const givenEarlier: string[] = [];
    for (const text of output.caveats) {
      const id = this.caveatIdByText.get(text);
      if (id && this.caveatsShown.has(text)) givenEarlier.push(id);
      else {
        caveats.push(text);
        this.caveatsShown.add(text);
      }
    }
    return givenEarlier.length > 0 ? { ...output, caveats, caveatsGivenEarlier: givenEarlier } : output;
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
    return collectNumbers([...this.outputs, ...this.historyOutputs], [...ALWAYS_KNOWN_NUMBERS, ...this.extraKnown]);
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
