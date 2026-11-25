import { describe, expect, it } from "vitest";
import { flag, has, intFlag, positionalArgs, UsageError, type FlagSource } from "./cli";

/**
 * A flag source with the given command-line arguments and npm variables.
 * @param args - arguments after the script path.
 * @param env - environment variables.
 * @returns the source.
 */
const source = (args: string[], env: Record<string, string> = {}): FlagSource => ({ argv: ["node", "script.ts", ...args], env });

describe("flag", () => {
  it("reads --name=value, keeping any '=' inside the value", () => {
    expect(flag("url", source(["--url=https://x.test/?a=1&b=2"]))).toBe("https://x.test/?a=1&b=2");
    expect(flag("session", source(["--session=abc=="]))).toBe("abc==");
    expect(flag("case", source([]))).toBeUndefined();
  });

  it("reads PowerShell's npm_config_* form, with dashes as underscores (lesson 1)", () => {
    expect(flag("repeat", source([], { npm_config_repeat: "3" }))).toBe("3");
    expect(flag("some-flag", source([], { npm_config_some_flag: "x" }))).toBe("x");
  });
});

describe("has", () => {
  it("reads bare, =true and npm forms", () => {
    expect(has("publish", source(["--publish"]))).toBe(true);
    expect(has("publish", source(["--publish=true"]))).toBe(true);
    expect(has("publish", source([], { npm_config_publish: "true" }))).toBe(true);
    expect(has("publish", source([]))).toBe(false);
    expect(has("publish", source(["--no-publish"], { npm_config_publish: "true" }))).toBe(false);
  });

  it("reads --no-judge from argv AND from npm, which sets npm_config_judge to '' or 'false' (B5)", () => {
    expect(has("no-judge", source(["--no-judge"]))).toBe(true);
    expect(has("no-judge", source([], { npm_config_judge: "" }))).toBe(true);
    expect(has("no-judge", source([], { npm_config_judge: "false" }))).toBe(true);
    expect(has("no-judge", source(["--judge=false"]))).toBe(true);
    expect(has("no-judge", source([]))).toBe(false);
    expect(has("no-judge", source([], { npm_config_judge: "true" }))).toBe(false);
  });
});

describe("intFlag (B4)", () => {
  it("returns the fallback when absent and the number when valid", () => {
    expect(intFlag("repeat", 1, source([]))).toBe(1);
    expect(intFlag("repeat", 1, source(["--repeat=3"]))).toBe(3);
    expect(intFlag("repeat", 1, source([], { npm_config_repeat: "2" }))).toBe(2);
  });

  it.each(["abc", "0", "-1", "2.5", "", "true"])("rejects %j instead of silently running nothing", (value) => {
    expect(() => intFlag("repeat", 1, source([`--repeat=${value}`]))).toThrow(UsageError);
  });

  it("rejects a bare --repeat passed through npm (value 'true')", () => {
    expect(() => intFlag("repeat", 1, source([], { npm_config_repeat: "true" }))).toThrow(/whole number/);
  });
});

describe("positionalArgs", () => {
  it("keeps arguments that aren't flags", () => {
    expect(positionalArgs(source(["a.json", "--publish", "b.json"]))).toEqual(["a.json", "b.json"]);
  });
});
