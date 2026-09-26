# Archived: issue-driven multi-agent operating model (to 2026-09-26)

Superseded by the trunk-based [operating model](../../../docs/REPOSITORY_OPERATING_MODEL.md), authorized by the owner on 2026-09-26.

These files governed a dispatcher, worker assignments, task branches, draft PRs, independent evaluators and a fail-closed merge policy. They are kept unchanged for history and for the provenance of evidence produced under them (V5–V8 extraction runs, #685 checkpoints). Do not use them to select work, create branches or gate merges.

| File | Former role |
|---|---|
| `AGENTS.md` | Previous agent instructions (copy of the root file before replacement) |
| `REPOSITORY_OPERATING_MODEL.md` | Canonical multi-agent runbook |
| `MERGE_POLICY.md` | Required checks and approval markers for PR merges |
| `ORCHESTRATOR.md`, `ORCHESTRATOR-PROMPT.md` | Local orchestrator runbook and handover prompt |
| `LOCAL_ORCHESTRATOR_ONBOARDING.md`, `NEW_ORCHESTRATOR_HANDOFF.md` | Orchestrator onboarding |
| `CAMPAIGN.md`, `WORK_QUEUE.md` | Already-retired pointers to the earlier campaign model |
| `IMPLEMENTATION_SUMMARY.md` | Historical Issue #11 implementation inventory |

The dispatcher and merge-policy scripts (`scripts/pi-*`) remain in place with their tests, but nothing runs them in trunk mode.
