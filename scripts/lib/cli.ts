/**
 * @module scripts/lib/cli
 *
 * Command-line flags for every script, read the same way everywhere. A flag can arrive two ways:
 * - in `process.argv`: `--name=value`, `--name`, `--no-name`;
 * - as an npm config variable: on PowerShell `npm run x -- --flag` loses the `--`, so npm takes the
 *   flag as its own config and passes it as `npm_config_<name>`, with dashes turned into
 *   underscores, a bare `--name` as "true", and `--no-name` as `npm_config_name` set to "" or
 *   "false" (lesson 1).
 */

/** Where flags are read from (injectable for tests). */
export interface FlagSource {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
}

/** The real process. */
const PROCESS: FlagSource = { argv: process.argv, env: process.env };

/** A wrong command line: shown as a short usage message, not a crash. */
export class UsageError extends Error {
  /**
   * @param message - what's wrong and how to call the script instead.
   */
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * The npm config variable a flag arrives in.
 * @param name - the flag name, e.g. "no-judge".
 * @returns e.g. "npm_config_no_judge".
 */
function npmConfigKey(name: string): string {
  return `npm_config_${name.replace(/-/g, "_")}`;
}

/**
 * Reads a `--name=value` flag (everything after the first "=", so values may contain "=").
 * @param name - the flag name without dashes.
 * @param source - argv and env (default: the process).
 * @returns the value; "true" for a bare `--name` passed through npm; undefined when absent.
 */
export function flag(name: string, source: FlagSource = PROCESS): string | undefined {
  const prefix = `--${name}=`;
  const arg = source.argv.find((a) => a.startsWith(prefix));
  if (arg !== undefined) return arg.slice(prefix.length);
  return source.env[npmConfigKey(name)];
}

/**
 * Whether an npm config value means "off" (`--no-name` arrives as "" or "false").
 * @param value - the variable's value.
 * @returns true for "" or "false".
 */
function isOff(value: string | undefined): boolean {
  return value === "" || value?.toLowerCase() === "false";
}

/**
 * Reads a boolean flag. `has("publish")` is true for `--publish`, `--publish=true` or npm's
 * `npm_config_publish=true`, and false after `--no-publish`. `has("no-judge")` is true for
 * `--no-judge` in argv or npm's `npm_config_judge` = "" / "false".
 * @param name - the flag name without dashes (may start with "no-").
 * @param source - argv and env (default: the process).
 * @returns whether the flag is on.
 */
export function has(name: string, source: FlagSource = PROCESS): boolean {
  if (name.startsWith("no-")) {
    const base = name.slice(3);
    if (source.argv.includes(`--${name}`)) return true;
    const argValue = source.argv.find((a) => a.startsWith(`--${base}=`));
    if (argValue !== undefined) return isOff(argValue.slice(base.length + 3));
    return isOff(source.env[npmConfigKey(base)]) || source.env[npmConfigKey(name)]?.toLowerCase() === "true";
  }
  if (source.argv.includes(`--${name}`)) return true;
  if (source.argv.includes(`--no-${name}`)) return false;
  return flag(name, source)?.toLowerCase() === "true";
}

/**
 * Reads a whole-number flag ≥ 1 (e.g. `--repeat=3`). Strict: "abc", "0", "2.5" or a bare
 * `--repeat` are usage errors, never a silent 0 runs.
 * @param name - the flag name without dashes.
 * @param fallback - the value when the flag is absent.
 * @param source - argv and env (default: the process).
 * @returns the number.
 * @throws UsageError when the value isn't a whole number ≥ 1.
 */
export function intFlag(name: string, fallback: number, source: FlagSource = PROCESS): number {
  const raw = flag(name, source);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isInteger(n) || n < 1) throw new UsageError(`--${name} must be a whole number of 1 or more (e.g. --${name}=3), got "${raw}".`);
  return n;
}

/**
 * The arguments that aren't flags (file paths, the question text).
 * @param source - argv and env (default: the process).
 * @returns argv after the script path, without `--…` entries.
 */
export function positionalArgs(source: FlagSource = PROCESS): string[] {
  return source.argv.slice(2).filter((a) => !a.startsWith("--"));
}
