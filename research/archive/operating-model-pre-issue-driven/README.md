# Archived operating material: pre issue-driven model

This directory indexes operating instructions that were retired when OpenLunum adopted an issue-driven, one-shot worker model.

The historical material remains available through Git history at commit:

```text
045bf0bb165945ae6a9e97c3774fd8cbfcef7c50
```

Retrieve the complete historical files with:

```bash
git show 045bf0bb165945ae6a9e97c3774fd8cbfcef7c50:CAMPAIGN.md
git show 045bf0bb165945ae6a9e97c3774fd8cbfcef7c50:WORK_QUEUE.md
```

## Archived concepts

### Autonomous campaign instructions

The former `CAMPAIGN.md` described a long-running local-model campaign, campaign ledgers, worker self-selection, and `agent/...` branch conventions. It is retained only as project history and research context.

It must not be used to:

- select current work;
- dispatch a worker;
- create a campaign/status/sync branch;
- infer current capability acceptance;
- bypass GitHub issues or current merge controls.

### Markdown work queue

The former `WORK_QUEUE.md` accumulated several generations of roadmap checkboxes and agent claiming instructions. It is retained only as historical context.

A checked box does not prove accepted evidence, and an unchecked box is not permission for a worker to claim work. GitHub issues are the canonical backlog, readiness, assignment, blocker, and acceptance state.

### Legacy loop and telemetry

`scripts/pi-loop.sh` and historical `reports/pi-loop/` records remain for compatibility and audit history. They are not the active scheduler. The supported worker entry point is `pnpm worker:dispatch -- <worktree>`, backed by `scripts/pi-dispatch-once.sh` and an explicit assignment file.

Do not restart a historical campaign loop or infer current work from claims, temperature logs, completion messages, or old branch names.

### Historical branches

The large historical branch set is being reconciled through issue #255. Distinct proposals that may still matter are preserved as explicit GitHub issues before their old branches are removed.

## Current replacements

Use:

- `docs/LOCAL_ORCHESTRATOR_ONBOARDING.md` — canonical local orchestrator entry point;
- `docs/REPOSITORY_OPERATING_MODEL.md` — repository-wide operating rules;
- `ORCHESTRATOR.md` — check-in, review, merge, and cleanup runbook;
- `ORCHESTRATOR-PROMPT.md` — handover prompt;
- `scripts/WORKER_ASSIGNMENT.example.md` — explicit assignment contract;
- `scripts/pi-dispatch-once.sh` — one-shot dispatcher;
- GitHub issues and milestones — current work state.
