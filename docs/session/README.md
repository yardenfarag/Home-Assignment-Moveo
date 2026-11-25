# AI coding session log

The assignment asks for "the full session with the AI agent you worked with". This folder holds it.

| File | What it is |
|---|---|
| `transcript.md` | The readable conversation: every message, every tool call and its result (long tool I/O truncated). |
| `transcript.jsonl` | The same conversation records, untruncated, in Claude Code's raw JSONL format. |

**How it was made:** `npm run session:export -- <session.jsonl>` (see [scripts/export-session.ts](../../scripts/export-session.ts)).

**What was removed:** email addresses, API keys and tokens, one-time login codes, the local home-folder
path, other people's usernames, and Claude Code's internal bookkeeping records. The model's private
reasoning blocks aren't included. The script fails if any of these items are still present after scrubbing.

**Where to start:** the planning ("grilling") rounds at the top of `transcript.md` show how every decision in
[../decisions.md](../decisions.md) was reached. Questions are numbered Q1–Q28.
