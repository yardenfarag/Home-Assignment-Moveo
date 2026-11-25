/**
 * Keeps the docs honest (W1–W7): every relative link in README.md and docs/*.md must point
 * to a file or folder that exists, and every code link written as [`symbol`](path#L42) must
 * land on a line that still contains `symbol`. Line numbers drift as code changes; this test
 * fails instead of letting the docs quietly point at the wrong line.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const DOCS = [join(ROOT, "README.md"), ...readdirSync(join(ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => join(ROOT, "docs", f))];

/** A Markdown link: [text](target). */
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Strips fenced code blocks, where link-like text isn't a link. */
const withoutCodeBlocks = (md: string) => md.replace(/```[\s\S]*?```/g, "");

/**
 * GitHub's anchor for a heading: lowercase, punctuation dropped, spaces → hyphens.
 * @param heading - heading text without the leading #s.
 * @returns the anchor id.
 */
export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

/**
 * The anchors a Markdown file offers (one per heading).
 * @param file - absolute path.
 * @returns the set of anchor ids.
 */
function anchorsOf(file: string): Set<string> {
  const headings = withoutCodeBlocks(readFileSync(file, "utf8")).match(/^#{1,6} .+$/gm) ?? [];
  return new Set(headings.map((h) => githubSlug(h.replace(/^#+ /, ""))));
}

/**
 * Checks every relative link in one Markdown file.
 * @param file - absolute path of the Markdown file.
 * @returns one message per broken link.
 */
function brokenLinks(file: string): string[] {
  const problems: string[] = [];
  for (const [, text, target] of withoutCodeBlocks(readFileSync(file, "utf8")).matchAll(LINK)) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [path, fragment] = target.split("#");
    const abs = path ? resolve(dirname(file), decodeURI(path)) : file;
    const where = `${file.slice(ROOT.length + 1)} → ${target}`;
    if (!existsSync(abs)) {
      problems.push(`${where}: no such file or folder`);
      continue;
    }
    if (fragment && !/^L\d+$/.test(fragment) && abs.endsWith(".md") && !anchorsOf(abs).has(fragment)) {
      problems.push(`${where}: no heading with anchor #${fragment}`);
    }
    const line = fragment?.match(/^L(\d+)$/)?.[1];
    const symbol = text.match(/^`([^`]+)`$/)?.[1]?.replace(/\(\)$/, "");
    if (line && symbol && statSync(abs).isFile()) {
      const content = readFileSync(abs, "utf8").split("\n")[Number(line) - 1] ?? "";
      if (!content.includes(symbol)) problems.push(`${where}: line ${line} no longer contains "${symbol}"`);
    }
  }
  return problems;
}

describe("githubSlug", () => {
  it("matches GitHub's heading anchors", () => {
    expect(githubSlug("3. How the LLM is kept from inventing numbers")).toBe("3-how-the-llm-is-kept-from-inventing-numbers");
    expect(githubSlug("Data sources & their limits")).toBe("data-sources--their-limits");
    expect(githubSlug("What the score means and doesn't mean")).toBe("what-the-score-means-and-doesnt-mean");
  });
});

describe("documentation links", () => {
  it("every relative link exists, and every [`symbol`](file#L…) link still points at that symbol", () => {
    expect(DOCS.flatMap(brokenLinks)).toEqual([]);
  });
});
