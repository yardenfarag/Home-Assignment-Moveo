/**
 * @module core/agent/tools
 *
 * Builds the agent's four tools for one request (G1). The hub id is a Zod enum
 * of the ACTIVE hubs from the database, so an unknown hub can't even be
 * requested (G12) — and adding a hub row adds it automatically.
 */
import type { AgentContext } from "../context";
import { buildCompareHubsTool } from "./compareHubs";
import { buildExplainHubScoreTool } from "./explainHubScore";
import { buildGetWeatherStatTool } from "./getWeatherStat";
import { buildRankHubsTool } from "./rankHubs";
import { hubName } from "../../api/progressLabels";
import { makeHubIdSchema, type ToolRuntime } from "./shared";

/**
 * Builds the tool set for one agent turn.
 * @param ctx - agent context.
 * @param runtime - ledger and callbacks.
 * @returns the tools, keyed by the names the model sees.
 */
export function buildTools(ctx: AgentContext, baseRuntime: ToolRuntime) {
  const runtime: ToolRuntime = { ...baseRuntime, hubName: (id) => ctx.hubById.get(id)?.name ?? hubName(id) };
  const ids = [...ctx.snapshotByHub.keys()].sort();
  if (ids.length === 0) throw new Error("No scored hubs available.");
  const hubIdSchema = makeHubIdSchema(ids);
  return {
    rank_hubs: buildRankHubsTool(ctx, runtime),
    compare_hubs: buildCompareHubsTool(ctx, runtime, hubIdSchema),
    explain_hub_score: buildExplainHubScoreTool(ctx, runtime, hubIdSchema),
    get_weather_stat: buildGetWeatherStatTool(ctx, runtime, hubIdSchema),
  };
}
