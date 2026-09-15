# OpenLunum diagnostic continuation

Completed: native Codex/Claude v3 replay, orthogonal action/execution/validation fields, source hash reconciliation, selected-scope scorer repair, and adversarial replay tests.

Commands: `pnpm test:client-event-replay`; `pnpm test:source-only-scoring`; `node scripts/research/replay-client-events.mjs`.

Evidence: `replay-v1/replay-ledger.json`; `raw-v3/`; `client-run-v3/`; `experiments/natural-development-v8/extraction/public-instruction-package-v1.json`.

Remaining: the focused gates pass. Full `pnpm verify` was attempted but its existing `packages/eval/test/round-trip-retention.test.ts` fixture hangs against configured localhost model URLs; the run was stopped and no owner services were changed. Historical V3 task-convention delivery remains unverified; #685 remains open. Fresh cloud extraction is not required for this offline milestone and must use the frozen package first.

Next: complete focused/full gates, then review and merge the offline replay checkpoint through one temporary issue-linked PR.
