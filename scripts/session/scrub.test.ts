import { describe, expect, it } from "vitest";
import { buildScrubRules, findLeaks, homeDirPattern, scrubRecord, scrubText } from "./scrub";

const homeDir = "C:\\Users\\someone";
const rules = buildScrubRules({ homeDir, secretValues: ["super-secret-value-123", 'with"quote\\slash'] });

describe("scrubText", () => {
  it("removes emails but keeps npm package versions", () => {
    expect(scrubText("mail me at jane.doe@example.com", rules)).toBe("mail me at [email removed]");
    expect(scrubText("npm i zod@4.6.7 @types/node@^22", rules)).toBe("npm i zod@4.6.7 @types/node@^22");
  });

  it("removes tokens and keys, including newer formats", () => {
    expect(scrubText("token gho_abcdefghijklmnopqrstuvwxyz123456", rules)).toBe("token [github token removed]");
    expect(scrubText("token github_pat_11ABCDEFG0abcdefghijklmnop", rules)).toBe("token [github token removed]");
    expect(scrubText("key sb_secret_abcdefghijklmnop", rules)).toBe("key [supabase key removed]");
    expect(scrubText("pat sbp_abcdefghijklmnopqrstuvwxyz0123", rules)).toBe("pat [supabase token removed]");
    expect(scrubText("key sk-or-v1-abcdefghijklmnopqrstuvwxyz", rules)).toBe("key [openrouter key removed]");
    expect(scrubText("Authorization: Bearer abcDEF123456789xyz==", rules)).toBe("Authorization: Bearer [token removed]");
    expect(scrubText("code ?user_code=ABCD-EFGH", rules)).toBe("code ?user_code=[removed]");
  });

  it("keeps code that only names a bearer secret", () => {
    expect(scrubText("headers: { Authorization: `Bearer ${env.CRON_SECRET}` }", rules)).toBe("headers: { Authorization: `Bearer ${env.CRON_SECRET}` }");
  });

  it("removes literal secret values", () => {
    expect(scrubText("x=super-secret-value-123", rules)).toBe("x=[removed]");
  });

  it("replaces every spelling of the home folder, escaped any number of times", () => {
    expect(scrubText("C:\\Users\\someone\\repo", rules)).toBe("~\\repo");
    expect(scrubText("C:\\\\Users\\\\someone\\\\repo", rules)).toBe("~\\\\repo");
    expect(scrubText("C:\\\\\\\\Users\\\\\\\\someone", rules)).toBe("~");
    expect(scrubText("C:/Users/someone/repo", rules)).toBe("~/repo");
    expect(scrubText("/c/Users/someone/repo", rules)).toBe("~/repo");
    expect(scrubText("projects/C--Users-someone/x", rules)).toBe("projects/~/x");
  });

  it("doesn't touch a longer name that starts with the username", () => {
    expect(scrubText("C:\\Users\\someone2\\x", rules)).toBe("C:\\Users\\someone2\\x");
  });
});

describe("scrubRecord", () => {
  it("scrubs parsed strings, so JSON escaping can't hide a value", () => {
    // In the raw JSONL these are escaped (\\\\ and \"), which a raw-line regex would miss.
    const record = { message: { content: [{ type: "tool_result", content: "requireStack: [ 'C:\\\\Users\\\\someone\\\\app' ]  with\"quote\\slash" }] } };
    const line = JSON.stringify(scrubRecord(record, rules));
    expect(line).not.toMatch(/someone/);
    expect(line).toContain("[removed]");
  });

  it("scrubs object keys too", () => {
    expect(scrubRecord({ "C:\\Users\\someone\\a.ts": 1 }, rules)).toEqual({ "~\\a.ts": 1 });
  });
});

describe("homeDirPattern", () => {
  it("handles POSIX home folders", () => {
    expect("/home/someone/repo".replace(homeDirPattern("/home/someone"), "~")).toBe("~/repo");
  });
});

describe("findLeaks", () => {
  it("is clean on scrubbed text and names leftovers without printing them", () => {
    expect(findLeaks("all good ~\\repo", { homeDir, secretValues: ["super-secret-value-123"] })).toEqual([]);
    const leaks = findLeaks("C:\\\\\\\\Users\\\\\\\\someone and someone and x super-secret-value-123 jane@example.com", {
      homeDir,
      secretValues: ["super-secret-value-123"],
    });
    expect(leaks).toEqual(["email addresses: 1", "literal secret values: 1", "home folder paths: 1", "bare username: 2"]);
    expect(leaks.join(" ")).not.toContain("super-secret");
  });
});

describe("bare username", () => {
  it("is replaced as a whole word only (e.g. the owner column of ls -l)", () => {
    expect(scrubText("-rw-r--r-- 1 someone 197609 480 .gitignore", rules)).toBe("-rw-r--r-- 1 <user> 197609 480 .gitignore");
    expect(scrubText("someoneelse", rules)).toBe("someoneelse");
  });
});

describe("email leak check on JSON-escaped text", () => {
  it("doesn't mistake an escaped tab or newline before @ for an address, but still finds real ones", () => {
    expect(findLeaks(String.raw`"content":"1\t@AGENTS.md" and \n@proxy.route`, { homeDir, secretValues: [] })).toEqual([]);
    expect(findLeaks(String.raw`"text":"\njane.doe@example.com"`, { homeDir, secretValues: [] })).toEqual(["email addresses: 1"]);
  });
});
