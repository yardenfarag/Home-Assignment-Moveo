/**
 * Drift tests: some allowed-value lists exist both as a DB check constraint
 * (in the migrations, our schema's source of truth) and as a TypeScript constant.
 * These tests fail the moment the two disagree.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CENSUS_REGIONS } from "../domain/hub";
import { CONFIDENCE_LEVELS, HAZARDS, RISK_LEVELS } from "../scoring/types";
import { EVENT_LEVELS, EVENT_SOURCES } from "./eventsRepository";

const MIGRATIONS_DIR = resolve(__dirname, "../../../supabase/migrations");

/** All migration SQL, in apply order. */
const allMigrationsSql = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
  .join("\n");

/**
 * Finds `<column> ... check (<column> in ('a', 'b'))` for a column and returns the values.
 * Uses the LAST match, so a later migration that changes the constraint wins.
 * @param column - column name.
 * @returns the allowed values.
 */
function checkConstraintValues(column: string): string[] {
  const pattern = new RegExp(`check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)\\s*\\)`, "gi");
  const matches = [...allMigrationsSql.matchAll(pattern)];
  if (matches.length === 0) throw new Error(`No check constraint found for column '${column}'`);
  return matches.at(-1)![1].split(",").map((value) => value.trim().replace(/^'|'$/g, ""));
}

describe("DB check constraints match TypeScript constants", () => {
  it("hubs.region ↔ CENSUS_REGIONS", () => {
    expect(checkConstraintValues("region")).toEqual([...CENSUS_REGIONS]);
  });

  it("events.source ↔ EVENT_SOURCES", () => {
    expect(checkConstraintValues("source")).toEqual([...EVENT_SOURCES]);
  });

  it("events.level ↔ EVENT_LEVELS", () => {
    expect(checkConstraintValues("level")).toEqual([...EVENT_LEVELS]);
  });

  it("score_snapshots.risk_level ↔ RISK_LEVELS", () => {
    expect(checkConstraintValues("risk_level")).toEqual([...RISK_LEVELS]);
  });

  it("score_snapshots.confidence ↔ CONFIDENCE_LEVELS", () => {
    expect(checkConstraintValues("confidence")).toEqual([...CONFIDENCE_LEVELS]);
  });

  it("score_snapshots.top_hazard ↔ HAZARDS", () => {
    expect(checkConstraintValues("top_hazard")).toEqual([...HAZARDS]);
  });
});
