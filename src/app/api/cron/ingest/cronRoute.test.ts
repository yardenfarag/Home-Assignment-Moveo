/**
 * Drift test: Next reads `maxDuration` from the route file statically, so it must be a literal
 * there; the time budget in core/config/timeouts.ts must agree with it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PIPELINE_TIMING } from "@/core/config/timeouts";

describe("cron route maxDuration", () => {
  it("matches PIPELINE_TIMING.cronMaxDurationS, and the ingest budget leaves room for scoring", () => {
    const source = readFileSync(join(__dirname, "route.ts"), "utf8");
    expect(source).toMatch(new RegExp(`export const maxDuration = ${PIPELINE_TIMING.cronMaxDurationS};`));
    expect(PIPELINE_TIMING.ingestBudgetMs).toBeLessThan(PIPELINE_TIMING.cronMaxDurationS * 1_000 * 0.75);
  });
});
