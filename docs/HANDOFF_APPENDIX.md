# Handoff appendix (`scripts/lunum-handoff-appendix.mjs`)

Headless command that turns a transcript into a facts appendix of at most 3.5k tokens (hard cap, 4 bytes per token, so 14,000 bytes) to sit beside a hand-written handoff index. Dependency-free ESM; no MCP transport, no prompts, no network, no model calls. It lives in `scripts/` on purpose: it is not part of the served runtime that the source-only freeze binds.

```bash
node scripts/lunum-handoff-appendix.mjs --in session.jsonl --out appendix.md [--max-tokens 3500] [--index INDEX.md]
```

- Input: a Claude Code `.jsonl` transcript or a JSON messages array `[{role, content}]`. User and assistant text is read; tool calls, attachments and system reminders are skipped; tool results of 400 characters or less contribute only high-value facts (cron and job ids, tmux names, pids, script paths, report/apply rules, deploy shas, ports, queue ids); longer ones are dropped.
- Output: a 3-line header (source, generated time in Z, token estimate), then bullets under Decisions, Open items, Numbers and ids, Paths, Pending and Tool facts. Selection is regex-based and deterministic; it is a heuristic and can miss facts or keep noise.
- Index tags: every bullet ends with `[m<index>]`, the 1-based index in the user/assistant message sequence that the header counts. A tool-result fact carries the index of the message it follows; a path carries the last message that mentioned it. Within each section bullets are in non-decreasing index order, so a successor can resolve conflicts by recency.
- Repeated facts: for cron jobs (keyed by schedule; a later cancel replaces the scheduled line), tmux session names, pause/unpause times, deploy shas, pids, ports and percentages (keyed by the words before them), only the LAST value is kept and is marked `(latest of N, was: <previous value>)`. Earlier values are dropped apart from that one hint. Queue, job and card ids are not collapsed, since many distinct ones are normally live at once.
- Redaction of API-key-like strings, bearer and JWT tokens, `key=value` secrets, URL credentials, long opaque tokens and email addresses is built in.
- Exit code 0 on success, 1 on any error (message on stderr). On success one JSON stats line goes to stdout.
- Test: `node --test scripts/lunum-handoff-appendix.test.mjs`.
- Optional `--index <INDEX.md>` (the session's handoff index): a Pending or Open items line that the INDEX contradicts moves under `## Stale (contradicted by INDEX)` instead of being dropped, so nothing is lost. Rule, deterministic and conservative: the line carries an id (`R-`/`U-` id, hex commit of 7+ chars, or a named job like `name-part-1126`) that also appears in an INDEX line with a completion word (done, deployed, shipped, ended, closed, complete, merged, released), or it is a quiet hold / park line whose date (explicit, or "today"/clock time resolved to the message's transcript timestamp) is earlier than the INDEX's own date and time.
- Without `--index` the output is unchanged.
