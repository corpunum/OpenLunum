# OpenLunum diagnostic continuation

Completed: native Codex/Claude v3 replay, orthogonal action/execution/validation fields, source hash reconciliation, selected-scope scorer repair, and adversarial replay tests.

Commands: `pnpm test:client-event-replay`; `pnpm test:source-only-scoring`; `node scripts/research/replay-client-events.mjs`.

Evidence: `replay-v3/replay-ledger.json`; `raw-v3/`; `client-run-v3/`; `experiments/natural-development-v8/extraction/public-instruction-package-v1.json`; `cloud-only-policy-v1.json`.

The round-trip test hazard is repaired locally: the runner now accepts a test-only model factory, the unit tests use deterministic success/semantic-failure/malformed/transport responses, and a fetch trap rejects unexpected model network requests. Focused tests (25/25) and full `pnpm verify` pass. The production runner still defaults to `OpenAICompatibleModel`.

Remaining: the fresh V2 live extraction is incomplete. Codex cloud smoke and MCP contract retrieval passed, but two native `lunum_build_candidate` calls used invalid builder arguments and no submission was observed. Claude cloud smoke passed; its safe-mode MCP initialization exposed no Lunum servers, and the retry stream was not recoverable, so no Claude Lunum call is claimed. Native live fragments are recorded honestly in `cloud-execution-v1.json`; raw streams were not persisted and unavailable events are not reconstructed. #685 remains open.

Next: independently review and publish the focused test repair through one temporary issue-linked PR, then correct the general client builder/tool-schema delivery boundary before attempting one new persisted V2 extraction. Do not weaken core validation or rerun until the client call contract is fixed.
