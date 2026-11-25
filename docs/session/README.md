# AI coding session log

The assignment asks for "the full session with the AI agent you worked with". This folder holds it.

| File | What it is |
|---|---|
| `transcript.md` | The readable conversation: every message, every tool call and its result (long tool I/O truncated). |
| `transcript.jsonl` | The same conversation records, untruncated, in Claude Code's raw JSONL format. |
| [`subagents/`](subagents/README.md) | The work Claude delegated to sub-agents (code reviewers, the builders of review PRs 3–5 and the cost PR's first step, documentation research): one readable `.md` and one raw `.jsonl` per sub-agent, with an index. The main transcript shows what each was asked and what it reported back (D137). |

**How it was made:** `npm run session:export -- <session.jsonl>` (see [scripts/export-session.ts](../../scripts/export-session.ts)).

**What was removed:** email addresses, API keys and tokens, one-time login codes, the local home-folder
path and username, other people's usernames, secret values from `.env.local` (model ids stay readable),
Claude Code's internal bookkeeping records, and the model's private reasoning blocks (from both files).
Every string inside each record is scrubbed, however it was escaped. An independent leak check then
re-reads the result, and nothing is written if it finds anything (D131). The same applies to the
sub-agent transcripts: one leak check covers every file before any is written. Only this project's
session and its own sub-agents are exported.

**Where to start:** the planning ("grilling") rounds at the top of `transcript.md` show how every decision in
[../decisions.md](../decisions.md) was reached. Questions are numbered Q1–Q28.
