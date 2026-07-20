# Instructions for coding and research agents

Read `START_HERE.md` and `docs/REPOSITORY_OPERATING_MODEL.md` before making changes. Then read the area-specific documents they link.

## Mandatory bootstrap

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm agent:status
```

Do not begin assigned work while the baseline is failing unless the issue explicitly targets that failure.

## Assignment requirement

Workers do not select work from repository checkboxes. A worker must receive one explicit ready GitHub issue through the local assignment mechanism described in `scripts/pi-task-prompt.md`.

If no assignment exists, remain idle. Do not create a branch, claim, status report, campaign update, or pull request.

## Architecture boundaries

- `Lunum-Sem` is language-neutral structured meaning.
- English-like Lunum-Code is an initial renderer profile, not canonical semantics.
- `packages/core` must not import product integrations or model providers.
- Product-specific persistence and runtime decisions belong in adapters.
- Natural source text, language, provenance, and protected literals must be retained.
- A heuristic surface record must never be marked semantic or eligible for compact context.
- Fingerprint or canonicalization changes require a new version, golden vectors, migration notes, and Tier 3 review.

## Work protocol

1. Read the assigned issue, its acceptance criteria, non-goals, risk tier, and budgets.
2. Synchronize a persistent worker worktree to `origin/main`.
3. Create the assigned ephemeral branch: `work/<worker>/<issue-number>-<short-name>`.
4. Create or adopt the declared experiment manifest when behavior or evidence changes.
5. Record baseline commit, dataset hash, model/tokenizer profile, limits, and hypothesis.
6. Change implementation or prompts; do not simultaneously alter protected evaluation data.
7. Run the declared development suite and publish all failed cases.
8. Run `pnpm verify` before publishing a candidate.
9. Open at most one draft pull request linked to the issue.
10. Exit with `candidate`, `blocked`, or `no-improvement`. Do not start another issue.

## Agent authority

Worker agents may experiment, run local models, create reproducible reports, commit, push an assigned task branch, and open one draft pull request.

Workers may not autonomously:

- merge or push to `main`;
- choose their next issue;
- approve schema, fingerprint, canonicalization, protected-data, safety, release, support, or maturity decisions;
- modify benchmarks to make a candidate win;
- hide failures, exclusions, or timeouts;
- create permanent worker, campaign, status, sync, or completion branches.

## Independent evaluation

Tier 3 candidates require an evaluator separate from the implementation worker. The evaluator reviews a fixed candidate SHA, verifies hashes and commands, uses appropriate holdout/protected/product data, and reports exact, near-semantic, invalid, timeout, excluded, and failed outcomes separately.

## Stop conditions

Stop and report `blocked` when budgets are exhausted, hard gates repeatedly fail, required data is missing, the baseline is red for an unrelated reason, or a semantic judgment cannot be decided mechanically.

Stop and report `no-improvement` when the bounded attempts produce no acceptable candidate. Do not widen scope or recursively rewrite prompts.

## OpenUnum

Read `integrations/openunum/AGENTS.md` before touching its adapter or contract. OpenUnum consumes Lunum; OpenLunum never imports OpenUnum runtime code.
