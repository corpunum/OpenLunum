# OpenLunum diagnostic continuation

Completed: native Codex/Claude v3 replay, orthogonal action/execution/validation fields, source hash reconciliation, selected-scope scorer repair, and adversarial replay tests.

Commands: `pnpm test:client-event-replay`; `pnpm test:source-only-scoring`; `node scripts/research/replay-client-events.mjs`.

Evidence: `replay-v3/replay-ledger.json`; `raw-v3/`; `client-run-v3/`; `experiments/natural-development-v8/extraction/public-instruction-package-v1.json`; `cloud-only-policy-v1.json`.

Remaining: the focused gates pass. Full `pnpm verify` was not rerun under the cloud-only policy because its existing `packages/eval/test/round-trip-retention.test.ts` fixture targets localhost model URLs; this remains a separate test-policy defect. Historical V3 task-convention delivery remains unverified; #685 remains open. Fresh cloud extraction is not authorized until an existing cloud subscription route and the new package delivery receipt are verified.

Next: independently review the cloud-only launch-path guard, publish it through one temporary issue-linked PR, then verify the exact merged SHA. After that, preflight the V2 package through stdio before any bounded cloud comparison.
