# Pi adoption profile

**Status:** Design, based on the current Pi Agent Harness repository and its extensible TypeScript packages.

Preferred options:

- TypeScript extension importing `@corpunum/lunum`.
- Agent-loop integration at message/context boundaries.
- Optional MCP or CLI bridge if package coupling is undesirable.

Pi runs with the launching user's permissions unless separately sandboxed. A Lunum extension must not expand its privileges and should be tested in a container or other isolation where appropriate.

Official project:
- https://github.com/earendil-works/pi

## Evidence

A bounded local-model smoke test for this integration profile is preserved in
[`../../eval/runs/2026-07-15-pi-local-model.md`](../../eval/runs/2026-07-15-pi-local-model.md)
with raw JSON at
[`../../eval/runs/2026-07-15-pi-local-model.json`](../../eval/runs/2026-07-15-pi-local-model.json).

Summary: 12/15 passed (80%) using `qwen2.5-coder:1.5b`. No transport errors. 3 consistent failures on `pi_concurrent_tools`.
