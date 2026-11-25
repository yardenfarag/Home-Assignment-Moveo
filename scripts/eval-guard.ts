/**
 * @module scripts/eval-guard
 *
 * `npm run eval:guard` — runs the guard eval set (evals/guardCases.ts) through the
 * production guard (D118) and checks every case is allowed or declined as expected.
 * Also reports the margins around the cutoffs, so tuning them is a measured choice.
 *
 *   npm run eval:guard                 one pass (~35 Jev calls, well under 1 cent)
 *   npm run eval:guard -- --repeat=3   Jev isn't fully deterministic: check stability
 *   npm run eval:guard -- --publish    also write docs/guard-evals.md
 *
 * Exit code 1 when any case gets the wrong decision (or Jev fails and the guard fails open).
 */
import { writeFileSync } from "node:fs";
import { getJevEnv } from "../src/core/config/env";
import { GUARD_TIMEOUT_MS } from "../src/core/config/timeouts";
import { listActiveHubs } from "../src/core/db/hubsRepository";
import { GUARD_CONFIG, runGuard, type GuardVerdict } from "../src/core/guard/jevGuard";
import { GUARD_CASES, type GuardCase } from "../evals/guardCases";

/** Reads `--name=value` (or PowerShell's `npm_config_name`). */
function flag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : process.env[`npm_config_${name}`];
}

/** Reads a boolean `--name` flag. */
const has = (name: string) => process.argv.includes(`--${name}`) || process.env[`npm_config_${name}`] === "true";

/** Formats a probability range over repeats. */
const range = (xs: number[]) => (xs.length ? `${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)}` : "n/a");

/** Runs the guard eval. */
async function main(): Promise<void> {
  const repeat = Math.max(1, Number(flag("repeat") ?? 1));
  const env = getJevEnv();
  const hubNames = (await listActiveHubs()).map((hub) => `${hub.name}, ${hub.state}`);
  console.log(`Guard eval: ${GUARD_CASES.length} cases × ${repeat} on ${env.JEV_MODEL} (decline if on-topic < ${GUARD_CONFIG.inScopeCutoff} or manipulation > ${GUARD_CONFIG.manipulationCutoff})…`);

  const results: { c: GuardCase; verdicts: GuardVerdict[] }[] = [];
  for (const c of GUARD_CASES) {
    const verdicts: GuardVerdict[] = [];
    for (let i = 0; i < repeat; i++) {
      verdicts.push(await runGuard({ message: c.message, history: c.history, hubNames }, { apiKey: env.OPENROUTER_API_KEY, model: env.JEV_MODEL }));
    }
    results.push({ c, verdicts });
  }

  const rows = results.map(({ c, verdicts }) => {
    const ok = verdicts.every((v) => !v.failedOpen && v.decision === c.expected);
    const inScope = verdicts.flatMap((v) => (v.scores ? [v.scores.inScope] : []));
    const manip = verdicts.flatMap((v) => (v.scores ? [v.scores.manipulation] : []));
    return { c, ok, inScope, manip, got: [...new Set(verdicts.map((v) => (v.failedOpen ? "FAILED OPEN" : v.decision)))].join("/") };
  });
  for (const r of rows) {
    console.log(
      `${r.ok ? "✅" : "❌"} ${r.c.expected.padEnd(7)} ${(r.c.history.length ? "follow-up" : "first").padEnd(9)} ${r.c.kind.padEnd(12)} ${r.c.id.padEnd(16)} on-topic ${range(r.inScope)}  manipulation ${range(r.manip)}${r.ok ? "" : `  → got ${r.got}`}`,
    );
  }

  const allow = rows.filter((r) => r.c.expected === "allow");
  const passed = rows.filter((r) => r.ok).length;
  const lowestAllowed = Math.min(...allow.flatMap((r) => r.inScope));
  const highestAllowedManip = Math.max(...allow.flatMap((r) => r.manip));
  const ms = results.flatMap((r) => r.verdicts.map((v) => v.ms)).sort((a, b) => a - b);
  const p95 = ms[Math.floor(ms.length * 0.95)] ?? 0;
  const summary = [
    `${passed}/${rows.length} cases got the right decision${repeat > 1 ? ` in all ${repeat} runs` : ""}.`,
    `Margins: lowest on-topic score of a message that must pass = ${lowestAllowed.toFixed(2)} (cutoff ${GUARD_CONFIG.inScopeCutoff}); highest manipulation score of a message that must pass = ${highestAllowedManip.toFixed(2)} (cutoff ${GUARD_CONFIG.manipulationCutoff}).`,
    `Latency: median ${ms[Math.floor(ms.length / 2)]} ms, p95 ${p95} ms (timeout ${GUARD_TIMEOUT_MS} ms).`,
  ];
  console.log(`\n${passed === rows.length ? "🏆" : "⚠️ "} ${summary.join("\n   ")}`);

  if (has("publish")) {
    const table = rows
      .map(
        (r) =>
          `| ${r.ok ? "✅" : "❌"} | \`${r.c.id}\` | ${r.c.message.replace(/\|/g, "\\|")} | ${r.c.history.length ? "follow-up" : "first"} | ${r.c.kind} | ${r.c.expected} | ${range(r.inScope)} | ${range(r.manip)} |`,
      )
      .join("\n");
    writeFileSync(
      "docs/guard-evals.md",
      `# Guard eval results

Latest run: **${env.JEV_MODEL}** · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${repeat} run(s) per case.
Run it yourself: \`npm run eval:guard\`. The cases are in [evals/guardCases.ts](../evals/guardCases.ts), and how the guard works is in
[design.md](design.md#9-errors-security-and-limits).

The guard declines a message when Jev's probability that it's on topic is below **${GUARD_CONFIG.inScopeCutoff}**, or its probability that it
tries to change the assistant's rules is above **${GUARD_CONFIG.manipulationCutoff}**. Follow-ups are judged together with the last
${GUARD_CONFIG.historyTurns} turns.

${summary.map((s) => `- ${s}`).join("\n")}

| | Case | Message | Turn | Kind | Expected | On-topic P | Manipulation P |
|---|---|---|---|---|---|---|---|
${table}
`,
    );
    console.log("Written to docs/guard-evals.md");
  }
  if (passed !== rows.length) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
