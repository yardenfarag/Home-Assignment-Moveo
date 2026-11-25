/**
 * @module scripts/session/scrub
 *
 * Removes private details from the AI session log before it is committed to the
 * public repo: email addresses, API keys/tokens, the local home folder path,
 * one-time login codes, and any literal secret values passed in (e.g. from .env.local).
 *
 * The exporter applies these rules to each record's PARSED string values (see
 * {@link scrubRecord}), not to the raw JSON line, so a path that was escaped once or twice
 * (Node prints `C:\\Users\\…`, and JSON escapes it again) is still found. A separate,
 * independent leak check ({@link findLeaks}) re-reads the final output.
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
 * Token formats removed everywhere, with their replacement label. Also used by the leak check.
 * Bearer tokens need 16+ token characters, so code like `Bearer ${CRON_SECRET}` stays readable.
 */
export const TOKEN_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, label: "[github token removed]" },
  { pattern: /\bgh[opsur]_[A-Za-z0-9]{20,}\b/g, label: "[github token removed]" },
  { pattern: /\bsbp_[A-Za-z0-9]{20,}/g, label: "[supabase token removed]" },
  { pattern: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g, label: "[supabase key removed]" },
  { pattern: /\bsk-or-v1-[A-Za-z0-9]{20,}/g, label: "[openrouter key removed]" },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, label: "[api key removed]" },
  { pattern: /\bAKIA[A-Z0-9]{16}\b/g, label: "[aws key removed]" },
  { pattern: /\blin_api_[A-Za-z0-9]{20,}/g, label: "[linear key removed]" },
  { pattern: /\bxox[bpas]-[A-Za-z0-9-]{10,}/g, label: "[slack token removed]" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: "[jwt removed]" },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, label: "Bearer [token removed]" },
];

/** Email addresses (npm specifiers like `zod@4.6.7` don't match: no dot-letters domain). */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Escapes a string so it can be used literally inside a RegExp.
 * @param value - text to escape.
 * @returns the escaped text.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One pattern for every spelling of the home folder that shows up in logs: Windows
 * (`C:\Users\x`), escaped any number of times (`C:\\\\Users\\\\x`), forward slashes
 * (`C:/Users/x`), POSIX-style (`/c/Users/x`), and Claude's project-folder form (`C--Users-x`).
 * @param homeDir - absolute home folder.
 * @returns a global, case-insensitive pattern.
 */
export function homeDirPattern(homeDir: string): RegExp {
  const separator = String.raw`(?:[\\/]+|-+)`;
  const parts = homeDir.split(/[\\/]+/).filter(Boolean);
  const drive = /^([A-Za-z]):$/.exec(parts[0] ?? "");
  const segments = (drive ? parts.slice(1) : parts).map(escapeRegExp).join(separator);
  // Windows drive (`C:\`, `C--`) or POSIX-style drive (`/c/`; needs a slash after the letter,
  // so the leading `/` of `/C--Users-x` stays in place).
  const start = drive ? String.raw`(?:${drive[1]}:?${separator}|[\\/]+${drive[1]}[\\/]+)` : String.raw`[\\/]+`;
  return new RegExp(`${start}${segments}(?![A-Za-z0-9_])`, "gi");
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
    ...TOKEN_PATTERNS.map(({ pattern, label }) => ({ pattern, replacement: label })),
    { pattern: /user_code=[A-Z0-9-]+/g, replacement: "user_code=[removed]" },
    { pattern: EMAIL, replacement: "[email removed]" },
    { pattern: homeDirPattern(options.homeDir), replacement: "~" },
    // Whatever the path rule missed (e.g. the file owner in `ls -l` output): the bare username.
    ...(usernameOf(options.homeDir).length >= 4 ? [{ pattern: wholeWord(usernameOf(options.homeDir)), replacement: "<user>" }] : []),
  ];
}

/**
 * The last segment of the home folder (the OS username).
 * @param homeDir - absolute home folder.
 * @returns the username.
 */
function usernameOf(homeDir: string): string {
  return homeDir.split(/[\\/]+/).filter(Boolean).at(-1) ?? "";
}

/**
 * A global, case-insensitive whole-word pattern.
 * @param word - the word.
 * @returns the pattern.
 */
function wholeWord(word: string): RegExp {
  return new RegExp(String.raw`\b${escapeRegExp(word)}\b`, "gi");
}

/**
 * Applies every rule to the text.
 * @param text - raw text.
 * @param rules - rules from {@link buildScrubRules}.
 * @returns the cleaned text.
 */
export function scrubText(text: string, rules: ScrubRule[]): string {
  return rules.reduce((current, rule) => current.replace(rule.pattern, rule.replacement), text);
}

/**
 * Scrubs every string inside a parsed JSON value (keys included), however deeply nested.
 * @param value - a parsed JSON value.
 * @param rules - rules from {@link buildScrubRules}.
 * @returns a cleaned copy.
 */
export function scrubRecord(value: unknown, rules: ScrubRule[]): unknown {
  if (typeof value === "string") return scrubText(value, rules);
  if (Array.isArray(value)) return value.map((item) => scrubRecord(item, rules));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [scrubText(key, rules), scrubRecord(item, rules)]));
  }
  return value;
}

/** What the leak check looks for. */
export interface LeakCheckOptions {
  homeDir: string;
  /** Literal secret values that must not appear. */
  secretValues: string[];
}

/**
 * Re-reads exported text for anything that should have been removed. Independent of the
 * scrub rules where it matters: it searches for the bare username (4+ letters, whole word)
 * and `Users<any slashes>username`, so a path spelling the rules missed is still caught.
 * @param text - the exported content.
 * @param options - home folder and literal secrets.
 * @returns the kinds of leftovers found with counts (empty = clean). Never the values.
 */
export function findLeaks(text: string, options: LeakCheckOptions): string[] {
  const found: string[] = [];
  const count = (label: string, n: number) => n > 0 && found.push(`${label}: ${n}`);
  count("email addresses", text.match(EMAIL)?.length ?? 0);
  for (const { pattern, label } of TOKEN_PATTERNS) count(label.replace(/[[\]]/g, ""), text.match(pattern)?.length ?? 0);
  const lowered = text.toLowerCase();
  count("literal secret values", options.secretValues.filter((v) => v.length >= 4 && lowered.includes(v.toLowerCase())).length);
  const username = usernameOf(options.homeDir);
  if (username.length >= 4) {
    count("home folder paths", text.match(new RegExp(String.raw`Users(?:[\\/]+|-+)${escapeRegExp(username)}`, "gi"))?.length ?? 0);
    count("bare username", text.match(wholeWord(username))?.length ?? 0);
  }
  return found;
}
