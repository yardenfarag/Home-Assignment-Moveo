/**
 * @module app/_lib/toolResults
 *
 * Picks the purposeful visuals for an answer (U3b) from the tool results the
 * agent actually used — chosen by CODE, never by the LLM. Types come straight
 * from the tool builders (single source of truth).
 */
import type { FinalAnswer } from "@/core/agent/answerSchema";
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

/** Most visuals shown under one answer (more becomes noise). */
const MAX_VISUALS = 2;

/** Order of usefulness when an answer used several tools. */
const PRIORITY: AnswerVisual["kind"][] = ["grid", "breakdown", "seasonality", "ranking"];

const KIND_BY_TOOL: Record<string, AnswerVisual["kind"]> = {
  compare_hubs: "grid",
  explain_hub_score: "breakdown",
  get_weather_stat: "seasonality",
  rank_hubs: "ranking",
};

/**
 * Chooses up to two visuals from an answer's tool calls: skips failed calls and
 * duplicates (same tool + input), keeps the most useful kinds first.
 * @param answer - the validated answer.
 * @returns the visuals to render.
 */
export function pickVisuals(answer: FinalAnswer): AnswerVisual[] {
  if (answer.outOfScope) return [];
  const seen = new Set<string>();
  const visuals: AnswerVisual[] = [];
  for (const call of answer.meta.toolCalls) {
    const kind = KIND_BY_TOOL[call.tool];
    const output = call.output as Record<string, unknown> | null;
    if (!kind || !output || "error" in output) continue;
    const key = `${call.tool}:${JSON.stringify(call.input)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visuals.push({ kind, key, data: output } as AnswerVisual);
  }
  return visuals.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind)).slice(0, MAX_VISUALS);
}
