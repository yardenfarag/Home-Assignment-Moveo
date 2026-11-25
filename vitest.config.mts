/**
 * Vitest configuration: unit tests live next to the code they test (`*.test.ts`)
 * in `src/` and `scripts/`. Runs in plain Node — no browser, no Next.js.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
