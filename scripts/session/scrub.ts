/**
 * @module scripts/session/scrub
 *
 * Removes private details from the AI session log before it is committed to the
 * public repo: email addresses, API keys/tokens, the local home folder path,
 * one-time login codes, and any literal secret values passed in (e.g. from .env.local).
 */

/** A single find-and-replace rule. */
export interface ScrubRule {
  pattern: RegExp;
  replacement: string;
}

/** Options for building the rule list. */
export interface ScrubOptions {
  /** Absolute home folder, e.g. `C:\Users\someone` — replaced by `~`. */
  homeDir: string;
  /** Literal secret values to remove wherever they appear. */
  secretValues?: string[];
}

/**
 * Escapes a string so it can be used literally inside a RegExp.
 * @param value - text to escape.
 * @returns the escaped text.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds every spelling of the home folder path that appears in logs
 * (Windows, JSON-escaped Windows, POSIX-style, and Claude's project-folder form).
 * @param homeDir - absolute home folder.
 * @returns the distinct path variants, longest first.
 */
export function homeDirVariants(homeDir: string): string[] {
  const windows = homeDir.replace(/\//g, "\\");
  const forward = windows.replace(/\\/g, "/");
  const driveMatch = /^([A-Za-z]):/.exec(windows);
  const posix = driveMatch ? `/${driveMatch[1].toLowerCase()}${forward.slice(2)}` : forward;
  const dashed = windows.replace(/[:\\/]/g, "-");
  const variants = [windows.replace(/\\/g, "\\\\"), windows, forward, posix, dashed];
  return [...new Set(variants)].sort((a, b) => b.length - a.length);
}

/**
 * Builds the ordered list of scrub rules.
 * @param options - home folder and literal secrets.
 * @returns rules to apply in order.
 */
export function buildScrubRules(options: ScrubOptions): ScrubRule[] {
  const literalSecrets = (options.secretValues ?? [])
    .filter((value) => value.length >= 4)
    .map((value) => ({ pattern: new RegExp(escapeRegExp(value), "gi"), replacement: "[removed]" }));

  return [
    ...literalSecrets,
    { pattern: /\bgh[opsur]_[A-Za-z0-9]{20,}\b/g, replacement: "[github token removed]" },
    { pattern: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g, replacement: "[supabase key removed]" },
    { pattern: /\bsk-or-v1-[A-Za-z0-9]{20,}/g, replacement: "[openrouter key removed]" },
    { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replacement: "[api key removed]" },
    { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: "[jwt removed]" },
    { pattern: /user_code=[A-Z0-9-]+/g, replacement: "user_code=[removed]" },
    { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "[email removed]" },
    ...homeDirVariants(options.homeDir).map((variant) => ({
      pattern: new RegExp(escapeRegExp(variant), "gi"),
      replacement: "~",
    })),
  ];
}

/**
 * Applies every rule to the text.
 * @param text - raw text (may be a JSON line).
 * @param rules - rules from {@link buildScrubRules}.
 * @returns the cleaned text.
 */
export function scrubText(text: string, rules: ScrubRule[]): string {
  return rules.reduce((current, rule) => current.replace(rule.pattern, rule.replacement), text);
}
