# Repository operating model

**Mode: trunk-based on `main`, owner-authorized 2026-09-26.** The previous issue-driven multi-agent model (dispatcher, worker assignments, task branches, draft PRs, independent evaluators, merge policy) is suspended and archived in [research/archive/operating-model-multi-agent-2026-09](../research/archive/operating-model-multi-agent-2026-09/README.md). It produced careful evidence but more process than progress for a project with one owner and one active agent.

## How work lands

1. Work directly on `main`. Do not create task, worker, campaign or status branches. A branch a hosting harness creates automatically is not a work line; do not push work to it.
2. Before every push: `pnpm verify` passes locally on the exact tree being pushed, and `git status` is clean afterwards (tests must not rewrite tracked files).
3. Small, coherent commits with messages that say what changed and why. Push after each coherent step, not in large batches.
4. `ci.yml` runs on every push to `main`. A red `main` is fixed or reverted before other work continues.
5. The acting agent reviews its own diff adversarially before pushing. Evidence reviewed only by its author says so in its record; it is not described as independently reviewed.

## Principles that remain binding

These come from the architecture and the evidence protocol, not from the old process:

- `Lunum-Sem` is language-neutral structured meaning; English-like Lunum-Code is one renderer profile.
- `packages/core` does not import product integrations or model providers.
- Natural source text, language, provenance and protected literals are retained.
- A heuristic surface record is never marked semantic or eligible for compact context.
- Fingerprint or canonicalization changes need a new version, golden vectors and migration notes.
- Frozen evidence (datasets, requests, targets, ledgers, results, reviews) is never edited. Supersede it with a new versioned artifact that names what it replaces and why.
- Never change evaluation data or benchmarks to make a candidate win.
- Report failures, abstentions, exclusions, errors, timeouts and costs alongside successes. Claims bind to exact hashes and commits.
- Never weaken, skip or remove a required check.

## What to work on

`STATUS.md` names the current next step. GitHub issues hold open problems. `pnpm agent:status` prints the local repository state.

## Budgets

Model calls cost the owner money. Pilot on one item before a full run, record cost in the run summary, and do not repeat a run without a change that could alter its result.
