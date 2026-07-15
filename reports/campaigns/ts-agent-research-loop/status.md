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
| Baseline | `pnpm verify` PASS (19/19 tests + 12 eval, eval:smoke 16 items) |

## Open PRs (all draft)
| PR | Title | State | Branch |
|---|---|---|---|
| #1 | Build TypeScript agent research loop | DRAFT | foundation |
| #2 | feat(core): short renderer profile | DRAFT | feat/core/short-renderer-profile |
| #3 | generic-node local model experiment | DRAFT | agent/generic-node-local-model-experiment |
| #4 | eval(pi): bounded local-model experiment | DRAFT | agent/pi-local-model-experiment |
| #5 | feat(infra): schema drift + protected evaluator + task coverage | DRAFT | agent/orchestrator/repository-reliability/report-validation |
| #6 | feat(infra): report validation | DRAFT | agent/orchestrator/repository-reliability/report-validation |
| #7 | feat(eval): render and context runners | DRAFT | agent/orchestrator/repository-reliability/render-context |

## Phase Zero checklist
| Item | Status |
|---|---|
| 6.1 Experiment task coverage | ✅ Done |
| 6.2 Render and context runners | ✅ Done |
| 6.3 Schema-to-TypeScript drift | ✅ Done |
| 6.4 Protected evaluator interface | ✅ Done |
| 6.5 Report validation | ✅ Done |

## Phase Zero COMPLETE

All Phase 6.1–6.5 items from CAMPAIGN.md are done:
- 8 task types + deterministic execution
- Render and context runners with token counting
- Schema drift detection
- Protected evaluator interface
- Report validation

## Next eligible work area

Proceed to Phase 7 — Work areas in dependency order:
- **A. Repository reliability** — Remaining P0 items from WORK_QUEUE.md
- **B. Semantic contract** — P1
- **C. Multilingual parsing** — P1
- **D. Realization** — P1
- **E. Renderers and tokenizers** — P2
- **F. Context compilation** — P2
- **G. Retrieval and fingerprints** — P2
- **H. Product adoption** — P2
- **I. Release readiness** — P2
