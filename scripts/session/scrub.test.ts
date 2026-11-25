import { describe, expect, it } from "vitest";
import { buildScrubRules, homeDirVariants, scrubText } from "./scrub";

const rules = buildScrubRules({ homeDir: "C:\\Users\\someone", secretValues: ["super-secret-value-123"] });

describe("scrubText", () => {
  it("removes emails but keeps npm package versions", () => {
    expect(scrubText("mail me at jane.doe@example.com", rules)).toBe("mail me at [email removed]");
    expect(scrubText("npm i zod@4.6.7 @types/node@^22", rules)).toBe("npm i zod@4.6.7 @types/node@^22");
  });

  it("removes tokens and keys", () => {
    expect(scrubText("token gho_abcdefghijklmnopqrstuvwxyz123456", rules)).toBe("token [github token removed]");
    expect(scrubText("key sb_secret_abcdefghijklmnop", rules)).toBe("key [supabase key removed]");
    expect(scrubText("key sk-or-v1-abcdefghijklmnopqrstuvwxyz", rules)).toBe("key [openrouter key removed]");
    expect(scrubText("code ?user_code=ABCD-EFGH", rules)).toBe("code ?user_code=[removed]");
  });

  it("removes literal secret values", () => {
    expect(scrubText("x=super-secret-value-123", rules)).toBe("x=[removed]");
  });

  it("replaces every spelling of the home folder", () => {
    expect(scrubText("C:\\Users\\someone\\repo", rules)).toBe("~\\repo");
    expect(scrubText('{"cwd":"C:\\\\Users\\\\someone\\\\repo"}', rules)).toBe('{"cwd":"~\\\\repo"}');
    expect(scrubText("/c/Users/someone/repo", rules)).toBe("~/repo");
    expect(scrubText("projects/C--Users-someone/x", rules)).toBe("projects/~/x");
  });
});

describe("homeDirVariants", () => {
  it("lists longest variants first", () => {
    const variants = homeDirVariants("C:\\Users\\someone");
    expect(variants[0]).toBe("C:\\\\Users\\\\someone");
    expect(variants).toContain("/c/Users/someone");
  });
});
