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
| Baseline | `pnpm verify` PASS (19/19 tests, eval:smoke 16 items) |

## Open PRs (all draft)
| PR | Title | State | Branch |
|---|---|---|---|
| #1 | Build TypeScript agent research loop | DRAFT | `agent/typescript-agent-research-loop` (foundation) |
| #2 | feat(core): add short renderer profile | DRAFT | `feat/core/short-renderer-profile` |
| #3 | generic-node local model experiment | DRAFT | `agent/generic-node-local-model-experiment` |
| #4 | eval(pi): bounded local-model experiment | DRAFT | `agent/pi-local-model-experiment` |
| #5 | feat(infra): schema drift + protected evaluator + task coverage | DRAFT | `agent/orchestrator/repository-reliability/report-validation` |
| #6 | feat(infra): report validation | DRAFT | `agent/orchestrator/repository-reliability/report-validation` |

## Phase Zero checklist
| Item | Status |
|---|---|
| 6.1 Experiment task coverage | ✅ Done (8 tasks, deterministic flag) |
| 6.2 Render and context runners | **next task** |
| 6.3 Schema-to-TypeScript drift | ✅ Done (PR #5) |
| 6.4 Protected evaluator interface | ✅ Done (PR #5) |
| 6.5 Report validation | ✅ Done (PR #6) |
