# Campaign Status — ts-agent-research-loop

| Field | Value |
|---|---|
| Base branch | `agent/typescript-agent-research-loop` |
| Base commit | `ca623ec` |
| Started | 2026-07-15T22:35:00Z |
| Coordinator | orchestrator (this agent) |
| Worker model | `openai/qwen3.6-35b-a3b` (Q6_K, 262K ctx) |
| Evaluator model | `qwen2.5-coder:1.5b` (Ollama) |
| Phase | Zero — campaign machinery |
| Baseline | `pnpm verify` PASS (10/10 tests, eval:smoke 16 items) |

## Open PRs (awaiting review)
| PR | Title | State | Branch |
|---|---|---|---|
| #1 | Build TypeScript agent research loop | DRAFT | `agent/typescript-agent-research-loop` (foundation) |
| #2 | feat(core): add short renderer profile | DRAFT | `feat/core/short-renderer-profile` |
| #3 | generic-node local model experiment | DRAFT | `agent/generic-node-local-model-experiment` |
| #4 | eval(pi): bounded local-model experiment | DRAFT | `agent/pi-local-model-experiment` |

## Phase Zero checklist
| Item | Status |
|---|---|
| 6.1 Experiment task coverage | in-progress |
| 6.2 Render and context runners | pending |
| 6.3 Schema-to-TypeScript drift | **next task** |
| 6.4 Protected evaluator interface | pending |
| 6.5 Report validation | pending |
