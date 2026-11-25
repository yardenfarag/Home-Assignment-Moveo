/**
 * @module core/agent/tools/shared
 *
 * Plumbing shared by every tool: progress callbacks, ledger recording, and
 * turning failures into a readable error result (so one bad call doesn't crash
 * the whole turn — the model can say it couldn't get that data).
 */
import { z } from "zod";
import { BoundaryError, describeUnknownError, formatBoundaryMessage } from "../../errors/boundaryError";
import { progressLabel } from "../../api/progressLabels";
import type { Hub } from "../../domain/hub";
import type { ToolLedger, ToolOutputBase } from "../ledger";

/**
 * Progress hooks the API layer uses to stream "Consulting the ledger for Dallas…".
 * `callId` is the AI SDK's id for this call, so parallel calls to the same tool stay apart.
 */
export interface ToolCallbacks {
  /** A tool call started; `label` is the friendly progress line ("Comparing Miami and Houston…"). */
  onToolStart?: (tool: string, input: unknown, callId?: string, label?: string) => void;
  /** A tool call finished (its output may be a {@link ToolErrorOutput}). */
  onToolEnd?: (tool: string, output: unknown, callId?: string) => void;
}

/** What every tool builder receives. */
export interface ToolRuntime {
  /** Records every call and result for answer validation. */
  ledger: ToolLedger;
  /** Progress hooks. */
  callbacks: ToolCallbacks;
  /** Hub id → display name, for progress lines (set by `buildTools` from the hub list). */
  hubName?: (hubId: string) => string;
}

/** Error result returned to the model instead of throwing. */
export interface ToolErrorOutput extends ToolOutputBase {
  /** A fixed, friendly sentence. The technical detail goes to the server log only. */
  error: string;
}

/** What the model (and the stored answer) sees when a tool fails: no internal error text. */
export const TOOL_FAILED_MESSAGE = "That data couldn't be loaded right now. Say so plainly and answer with what you have.";

/** Short reply for a repeated identical call in the same answer (E8). */
export interface DuplicateCallOutput extends ToolOutputBase {
  /** Always true: marks the short reply. */
  sameAsEarlierCall: true;
  /** Tells the model to use its earlier result. */
  note: string;
}

/**
 * Runs a tool body with progress callbacks, ledger recording and error capture.
 * @param name - tool name.
 * @param input - validated input.
 * @param runtime - ledger and callbacks.
 * @param body - the tool's work.
 * @param callId - the AI SDK's id for this call (keeps parallel calls apart in progress lines).
 * @returns the tool output (or an error output).
 */
export async function runTool<T extends ToolOutputBase>(
  name: string,
  input: unknown,
  runtime: ToolRuntime,
  body: () => Promise<T> | T,
  callId?: string,
): Promise<T | ToolErrorOutput | DuplicateCallOutput> {
  if (!runtime.ledger.claim(name, input)) {
    // E8: the model repeated a call it already made in this answer. Don't re-run it or re-send the
    // (often large) result — reply briefly. Still recorded, so the duplicate stays measurable.
    const output: DuplicateCallOutput = {
      sameAsEarlierCall: true,
      note: "Identical to a call you already made in this answer — use that earlier result.",
      hubIds: [],
      confidence: null,
      caveats: [],
    };
    runtime.ledger.record(name, input, output);
    return output;
  }
  runtime.callbacks.onToolStart?.(name, input, callId, progressLabel(name, input, runtime.hubName));
  let output: T | ToolErrorOutput;
  try {
    output = await body();
  } catch (error) {
    // Log under the boundary that actually failed (usually the database), with the detail;
    // the model and the browser only get the fixed sentence.
    const boundary = error instanceof BoundaryError ? error.boundary : "llm";
    const detail = error instanceof BoundaryError ? error.detail : describeUnknownError(error);
    console.error(formatBoundaryMessage({ name: "ToolExecutionError", message: `${name}: ${detail}`, functionName: "runTool", boundary }));
    output = { error: TOOL_FAILED_MESSAGE, hubIds: [], confidence: null, caveats: [] };
  }
  // The ledger (and the stored answer's tool calls) keep the full output; the model gets it with
  // caveats it already has named by id instead of repeated (tool results are paid for again at every step).
  runtime.ledger.record(name, input, output);
  runtime.callbacks.onToolEnd?.(name, output, callId);
  return runtime.ledger.forModel(output);
}

/** @returns "Dallas, TX". */
export const hubLabel = (hub: Hub): string => `${hub.name}, ${hub.state}`;

/** Rounds for display in tool output (1 decimal). */
export const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Builds the hub-id schema: a Zod enum of the active hub ids (G12).
 * @param ids - active hub ids (at least one).
 * @returns the schema.
 */
export function makeHubIdSchema(ids: string[]) {
  return z.enum(ids as [string, ...string[]]).describe("Hub id, e.g. 'dallas', 'kansas-city'.");
}

/** Type of the hub-id schema. */
export type HubIdSchema = ReturnType<typeof makeHubIdSchema>;
