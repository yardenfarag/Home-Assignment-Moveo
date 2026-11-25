/**
 * Drift test: every variable our code validates must be documented in
 * `.env.example` (commented-out entries count), so new setups never miss one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_SCHEMAS } from "./env";

const envExample = readFileSync(resolve(__dirname, "../../../.env.example"), "utf8");

describe(".env.example", () => {
  for (const [feature, schema] of Object.entries(ENV_SCHEMAS)) {
    for (const key of Object.keys(schema.shape)) {
      it(`documents ${key} (${feature})`, () => {
        expect(envExample).toMatch(new RegExp(`^#?\\s*${key}=`, "m"));
      });
    }
  }
});
