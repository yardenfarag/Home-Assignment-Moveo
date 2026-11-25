/**
 * @module core/agent/tools/shared
 *
 * Plumbing shared by every tool: progress callbacks, ledger recording, and
 * turning failures into a readable error result (so one bad call doesn't crash
 * the whole turn — the model can say it couldn't get that data).
 */
import { z } from "zod";
import { formatBoundaryMessage, describeUnknownError } from "../../errors/boundaryError";
import type { Hub } from "../../domain/hub";
import type { ToolLedger, ToolOutputBase } from "../ledger";

/** Progress hooks the API layer uses to stream "Consulting the ledger for Dallas…". */
export interface ToolCallbacks {
  onToolStart?: (tool: string, input: unknown) => void;
  onToolEnd?: (tool: string, output: unknown) => void;
}

/** What every tool builder receives. */
export interface ToolRuntime {
  ledger: ToolLedger;
  callbacks: ToolCallbacks;
}

/** Error result returned to the model instead of throwing. */
export interface ToolErrorOutput extends ToolOutputBase {
  error: string;
}

/**
 * Runs a tool body with progress callbacks, ledger recording and error capture.
 * @param name - tool name.
 * @param input - validated input.
 * @param runtime - ledger and callbacks.
 * @param body - the tool's work.
 * @returns the tool output (or an error output).
 */
export async function runTool<T extends ToolOutputBase>(
  name: string,
  input: unknown,
  runtime: ToolRuntime,
  body: () => Promise<T> | T,
): Promise<T | ToolErrorOutput> {
  runtime.callbacks.onToolStart?.(name, input);
  let output: T | ToolErrorOutput;
  try {
    output = await body();
  } catch (error) {
    console.error(
      formatBoundaryMessage({ name: "ToolExecutionError", message: describeUnknownError(error), functionName: name, boundary: "llm" }),
    );
    output = { error: describeUnknownError(error), hubIds: [], confidence: null, caveats: [] };
  }
  runtime.ledger.record(name, input, output);
  runtime.callbacks.onToolEnd?.(name, output);
  return output;
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
