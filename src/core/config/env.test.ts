import { describe, expect, it } from "vitest";
import { getSupabaseEnv } from "./env";

describe("getSupabaseEnv", () => {
  it("returns the variables when valid", () => {
    const env = getSupabaseEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz",
    });
    expect(env.SUPABASE_URL).toBe("https://example.supabase.co");
  });

  it("names missing variables without leaking values", () => {
    const secret = "not-a-url-but-secret-looking";
    expect(() => getSupabaseEnv({ SUPABASE_URL: secret })).toThrowError(
      /EnvValidationError \|\| Missing or invalid environment variables: SUPABASE_URL, SUPABASE_SECRET_KEY/,
    );
    try {
      getSupabaseEnv({ SUPABASE_URL: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
