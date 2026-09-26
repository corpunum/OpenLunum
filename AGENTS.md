# Instructions for coding and research agents

Read [START_HERE.md](START_HERE.md), [STATUS.md](STATUS.md) and [docs/REPOSITORY_OPERATING_MODEL.md](docs/REPOSITORY_OPERATING_MODEL.md). Then read the documents for the area you are changing. `integrations/openunum/AGENTS.md` applies before touching the OpenUnum adapter; OpenLunum never imports OpenUnum runtime code.

## Bootstrap

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify        # fetches full git history first if the clone is shallow
pnpm agent:status
```

Do not build on a failing baseline; fix it first or report why you cannot.

## Workflow

Trunk-based on `main` (owner-authorized 2026-09-26). No task branches. While GitHub branch protection still requires PRs, verified `main` commits travel through one short-lived PR, merged on green checks, branch deleted. `pnpm verify` must pass and the tree must be clean before every push. Details and the binding principles are in the operating model.

## Architecture boundaries

- `Lunum-Sem` is language-neutral structured meaning; English-like Lunum-Code is an initial renderer profile, not canonical semantics.
- `packages/core` must not import product integrations or model providers.
- Product-specific persistence and runtime decisions belong in adapters.
- Natural source text, language, provenance and protected literals must be retained.
- A heuristic surface record must never be marked semantic or eligible for compact context.
- Fingerprint or canonicalization changes require a new version, golden vectors and migration notes.

## Evidence

- Never edit frozen evidence; supersede it with a new versioned artifact.
- Never modify evaluation data to make a result look better.
- Publish failures, abstentions, errors, timeouts and costs with the result.
- Self-reviewed evidence is labelled as self-reviewed.

## Stop

Stop and say so plainly when required data, credentials or human input (for example native-speaker review) is missing, or when a semantic judgment cannot be decided mechanically. Do not widen scope to look busy.
