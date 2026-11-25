import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundaryError } from "../../src/core/errors/boundaryError";
import { loadResultsFile } from "./results";
import { readJsonFile, runScript } from "./run";

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("runScript (S6)", () => {
  it("logs a plain error in the boundary format with the script boundary 🐈 and sets exit code 1", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await runScript(() => {
      throw new Error("no cases match");
    }, "scripts/eval");
    expect(errors).toHaveBeenCalledWith("Error || no cases match || scripts/eval || 🐈");
    expect(process.exitCode).toBe(1);
  });

  it("keeps a BoundaryError's own boundary", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await runScript(async () => {
      throw new BoundaryError({ name: "NoDataError", message: "run ingest", functionName: "loadAgentContext", boundary: "database" });
    }, "scripts/eval");
    expect(errors.mock.calls[0][0]).toBe("NoDataError || run ingest || loadAgentContext || 🐘 (caught in scripts/eval)");
  });

  it("leaves the exit code alone on success", async () => {
    await runScript(() => {}, "scripts/x");
    expect(process.exitCode).toBeUndefined();
  });
});

describe("readJsonFile / loadResultsFile", () => {
  const dir = mkdtempSync(join(tmpdir(), "sneakoscope-run-test-"));

  it("names the file when it isn't valid JSON or isn't a results file", () => {
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{ not json");
    expect(() => readJsonFile(broken)).toThrow(broken);
    const other = join(dir, "other.json");
    writeFileSync(other, JSON.stringify({ hello: 1 }));
    expect(() => loadResultsFile(other)).toThrow(`${other} is not an eval results file`);
  });

  it("loads an old results file without the newer fields", () => {
    const old = join(dir, "old.json");
    writeFileSync(old, JSON.stringify({ label: "x/model", judge: null, metrics: { turns: 1, costUsd: null }, runs: [] }));
    expect(loadResultsFile(old)).toMatchObject({ label: "x/model", runs: [] });
  });
});
