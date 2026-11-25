/**
 * @module core/agent/tools/compareCells
 *
 * How compare_hubs names one cell (a hub × a hazard) in its `confidenceReasons`. Its own
 * dependency-free module, so the browser can import it without pulling in the AI SDK.
 */
import type { Hazard } from "../../scoring/types";

/**
 * The name of one comparison cell.
 * @param hubId - the hub.
 * @param hazard - the hazard.
 * @returns e.g. "miami/flood".
 */
export const compareCellKey = (hubId: string, hazard: Hazard): string => `${hubId}/${hazard}`;
