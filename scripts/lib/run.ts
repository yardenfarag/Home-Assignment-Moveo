/**
 * @module scripts/lib/run
 *
 * The entry point every script goes through: errors are caught once, logged in the boundary
 * format (`ErrorName || message || functionName || emoji`) and turned into exit code 1. A
 * BoundaryError keeps its own boundary; anything else is logged as the `script` boundary (🐈).
 */
import { readFileSync } from "node:fs";
import { boundaryLogLine, describeUnknownError } from "../../src/core/errors/boundaryError";

/**
 * Runs a script's main function and handles its failure.
 * @param main - the script's work (sync or async).
 * @param name - the script's name, used as the function name in the log line (e.g. "scripts/eval").
 * @returns a promise that settles when the script is done (never rejects).
 */
export function runScript(main: () => Promise<void> | void, name: string): Promise<void> {
  return Promise.resolve()
    .then(main)
    .catch((error: unknown) => {
      console.error(boundaryLogLine(error, name, "script"));
      process.exitCode = 1;
    });
}

/**
 * Reads and parses a JSON file, naming the file when it's missing or not valid JSON.
 * @param path - the file path.
 * @returns the parsed value (unchecked: callers validate the shape).
 * @throws Error naming the path.
 */
export function readJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Can't read ${path}: ${describeUnknownError(error)}`, { cause: error });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${describeUnknownError(error)}`, { cause: error });
  }
}
