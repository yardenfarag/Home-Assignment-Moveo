import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Boundary rule: src/core holds the agent + scoring logic and must stay
  // framework-free, so it can be tested and run on its own (scripts, evals).
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*"], message: "src/core must not depend on Next.js." },
            { group: ["react", "react-dom", "react/*"], message: "src/core must not depend on React." },
            { group: ["@/app/*", "**/app/*"], message: "src/core must not import from src/app." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "docs/session/**", ".claude/**"]),
]);

export default eslintConfig;
