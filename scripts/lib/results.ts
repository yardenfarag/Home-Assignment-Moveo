/**
 * @module scripts/lib/results
 *
 * Loads saved eval results files (evals/results/*.json) for `--rejudge` and the bakeoff. Files of
 * every age load: fields added later (`kind` on checks, `data`, `repeat`) are optional.
 */
import type { ResultsFile } from "../../evals/lib/types";
import { readJsonFile } from "./run";

/**
 * Reads a results file and checks it has the shape every version shares.
 * @param path - path to the .json file.
 * @returns the file's contents.
 * @throws Error naming the path when it isn't an eval results file.
 */
export function loadResultsFile(path: string): ResultsFile {
  const value = readJsonFile(path) as Partial<ResultsFile> | null;
  if (!value || typeof value !== "object" || !Array.isArray(value.runs) || typeof value.label !== "string") {
    throw new Error(`${path} is not an eval results file (it needs a "label" and "runs").`);
  }
  return { ...value, judge: value.judge ?? null, metrics: value.metrics ?? { turns: 0, costUsd: null } } as ResultsFile;
}
