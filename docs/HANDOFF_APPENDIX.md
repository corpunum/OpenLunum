# Handoff appendix (`scripts/lunum-handoff-appendix.mjs`)

Headless command that turns a transcript into a facts appendix of at most 3.5k tokens (hard cap, 4 bytes per token, so 14,000 bytes) to sit beside a hand-written handoff index. Dependency-free ESM; no MCP transport, no prompts, no network, no model calls. It lives in `scripts/` on purpose: it is not part of the served runtime that the source-only freeze binds.

```bash
node scripts/lunum-handoff-appendix.mjs --in session.jsonl --out appendix.md [--max-tokens 3500]
```

- Input: a Claude Code `.jsonl` transcript or a JSON messages array `[{role, content}]`. User and assistant text is read; tool calls, attachments and system reminders are skipped; tool results of 400 characters or less contribute only high-value facts (cron and job ids, tmux names, pids, script paths, report/apply rules, deploy shas, ports, queue ids); longer ones are dropped.
- Output: a 3-line header (source, generated time in Z, token estimate), then bullets under Decisions, Open items, Numbers and ids, Paths, Pending and Tool facts. Selection is regex-based and deterministic; it is a heuristic and can miss facts or keep noise.
- Redaction of API-key-like strings, bearer and JWT tokens, `key=value` secrets, URL credentials, long opaque tokens and email addresses is built in.
- Exit code 0 on success, 1 on any error (message on stderr). On success one JSON stats line goes to stdout.
- Test: `node --test scripts/lunum-handoff-appendix.test.mjs`.
