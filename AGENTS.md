# Instructions for coding and research agents

Read `START_HERE.md` before making changes. Then read the area-specific documents it links.

## Mandatory bootstrap

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm agent:status
```

## Architecture boundaries

- `Lunum-Sem` is language-neutral structured meaning.
- English-like Lunum-Code is an initial renderer profile, not canonical semantics.
- `packages/core` must not import product integrations or model providers.
- Product-specific persistence and runtime decisions belong in adapters.
- Natural source text, language, provenance, and protected literals must be retained.
- A heuristic surface record must never be marked semantic or eligible for compact context.
- Fingerprint or canonicalization changes require a new version, golden vectors, and migration notes.

## Work protocol

1. Select one area from `WORK_QUEUE.md`.
2. Create or adopt an experiment manifest.
3. Record baseline commit, dataset hash, model/tokenizer profile, limits, and hypothesis.
4. Change implementation or prompts; do not simultaneously alter protected evaluation data.
5. Run the declared development suite and publish all failed cases.
6. Run `pnpm verify` before pushing.
7. Push an `agent/...` branch and open a PR using the repository template.

## Agent authority

Worker agents may experiment, run local models, create reports, commit, push branches, and open PRs. They may not autonomously merge changes to semantics, fingerprints, protected datasets, safety policy, or releases.

## Stop conditions

Stop and request orchestration when budgets are exhausted, hard gates repeatedly fail, results oscillate, required data is missing, or a semantic judgment cannot be decided mechanically.

## OpenUnum

Read `integrations/openunum/AGENTS.md` before touching its adapter or contract. OpenUnum consumes Lunum; OpenLunum never imports OpenUnum runtime code.
