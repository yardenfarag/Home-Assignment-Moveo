/**
 * @module app/_lib/toolResults
 *
 * Picks the purposeful visuals for an answer (U3b) from the tool results the
 * agent actually used — chosen by CODE, never by the LLM. Types come straight
 * from the tool builders (single source of truth). Saved answers can be old or
 * odd, so each output gets a light shape check before it's drawn (S11).
 */
import type { FinalAnswer } from "@/core/agent/answerSchema";
import type { buildTools } from "@/core/agent/tools";
import type { CompareHubsOutput } from "@/core/agent/tools/compareHubs";
import type { ExplainHubScoreOutput } from "@/core/agent/tools/explainHubScore";
import type { WeatherStatOutput } from "@/core/agent/tools/getWeatherStat";
import type { RankHubsOutput } from "@/core/agent/tools/rankHubs";

/** One visual to render under an answer. */
export type AnswerVisual =
  | { kind: "breakdown"; key: string; data: ExplainHubScoreOutput }
  | { kind: "grid"; key: string; data: CompareHubsOutput }
  | { kind: "seasonality"; key: string; data: WeatherStatOutput }
  | { kind: "ranking"; key: string; data: RankHubsOutput };

/** The agent's tool names, from the tool set itself (adding a tool shows up here). */
export type ToolName = keyof ReturnType<typeof buildTools>;

/** Most visuals shown under one answer (more becomes noise). */
const MAX_VISUALS = 2;

/** Order of usefulness when an answer used several tools. */
const PRIORITY: AnswerVisual["kind"][] = ["grid", "breakdown", "seasonality", "ranking"];

/** Which visual each tool's output becomes. */
const KIND_BY_TOOL: Record<ToolName, AnswerVisual["kind"]> = {
  compare_hubs: "grid",
  explain_hub_score: "breakdown",
  get_weather_stat: "seasonality",
  rank_hubs: "ranking",
};

/**
 * True when a value is a plain object.
 * @param value - anything.
 * @returns whether it's a non-null, non-array object.
 */
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The fields each visual reads, checked before drawing (a light check, not full validation). */
const LOOKS_RIGHT: Record<AnswerVisual["kind"], (output: Record<string, unknown>) => boolean> = {
  grid: (o) => Array.isArray(o.hubs) && o.hubs.length > 0 && o.hubs.every((hub) => isObject(hub) && isObject(hub.hazards)),
  breakdown: (o) => isObject(o.formula) && Array.isArray(o.formula.contributions) && Array.isArray(o.hazards) && typeof o.topHazard === "string",
  seasonality: (o) => Array.isArray(o.byMonth) && typeof o.threshold === "string" && isObject(o.period) && typeof o.period.start === "string" && typeof o.period.end === "string",
  ranking: (o) => Array.isArray(o.results),
};

/**
 * The visual kind for a tool name, if it has one.
 * @param tool - the recorded tool name (free text in saved answers).
 * @returns the kind, or null.
 */
function kindFor(tool: string): AnswerVisual["kind"] | null {
  return Object.hasOwn(KIND_BY_TOOL, tool) ? KIND_BY_TOOL[tool as ToolName] : null;
}

/**
 * Chooses up to two visuals from an answer's tool calls: skips failed calls, outputs that
 * don't look like the tool's result, and duplicates (same tool + input); most useful kinds first.
 * @param answer - the validated answer.
 * @returns the visuals to render.
 */
export function pickVisuals(answer: FinalAnswer): AnswerVisual[] {
  if (answer.outOfScope) return [];
  const seen = new Set<string>();
  const visuals: AnswerVisual[] = [];
  for (const call of answer.meta?.toolCalls ?? []) {
    const kind = kindFor(call.tool);
    const output = call.output;
    if (!kind || !isObject(output) || "error" in output || !LOOKS_RIGHT[kind](output)) continue;
    const key = `${call.tool}:${JSON.stringify(call.input)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visuals.push({ kind, key, data: output } as AnswerVisual);
  }
  return visuals.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind)).slice(0, MAX_VISUALS);
}
