# Handover

Living document for the next agent. Update it in the same commit as the work it describes. [STATUS.md](STATUS.md) is the evidence summary; this file is the working state. The older hand-off is archived at [research/archive/handoffs/HANDOFF-2026-10-16.md](research/archive/handoffs/HANDOFF-2026-10-16.md).

**Updated 2026-11-11.**

## State of the repository

- `main` is green: the last CI run and a clean-checkout `pnpm verify` both pass.
- Frozen: protocol 0.6, frames 0.8, contract `lunum-agent/0.19`, identity `lfp:2.1` ([ADR 0025](decisions/0025-contract-freeze-pending-held-out-evidence.md)). Contracts 0.21 and 0.22 on `main` are unreleased candidates: coverage rose to 69.5% but judged meaning stayed at 56% ([coverage-a3-v2](experiments/coverage-a3-v2/RESULTS.md)).
- Trunk-based, single agent ([AGENTS.md](AGENTS.md)). The local worker, reviewer, merge and watchdog loops were stopped on 2026-10-06 and are still off; nothing in this repository runs unattended. The owner approved an Ally-only daytime lane on 2026-11-06; it has not been started, and its tunnel to the Ally is down.
- Open intermittent failure: one `packages/eval` unit test failed once on each of two pushes on 2026-10-29 and passed on re-run; its name is not known (see STATUS.md).

## What the 2026-11-11 session did

1. **[discourse-live-gate-v1](experiments/discourse-live-gate-v1/RESULTS.md): PASS.** The discourse view ([ADR 0021](decisions/0021-discourse-records.md)) that OpenUnum has used live since 2026-10-08 was re-measured on 83 sessions that started after it was enabled, bar fixed first: 0.56x prompt tokens at compaction points, exact-match fact recall 20.3% to 37.1%, no point worse. The in-sample figure was 0.30x, so the real saving is about half of what was first reported.
2. **OpenUnum now measures the token gate live.** Its `context_discourse` log event carries the head/tail-cut token count, and a script there reports the ratio from the log.
3. **Finding: the pressure is inside turns, not in chat history.** The view fired 82 times in five weeks; OpenUnum's per-request prompt cap acted 1,850 times in nine days and sent 1,057 requests to a hosted model because recent tool output did not fit. OpenUnum now logs, for each such request, what the view would have produced (measure-only).
4. **OpenUnum's vendored core moved from `433a70d8` to `5f6570bf`,** the newest commit that still carries contract 0.19. It gains the forbidden-key rejection (#723) and the #729 renderer fix. It deliberately does not take 0.21/0.22.

## Next steps, in order

1. **Read the prompt-cap shadow after a week of traffic** (OpenUnum: `node scripts/lunum-live-gate.mjs --since <deploy date>`; fields `promptCap.shadow.wouldFitPct`, `reroutedWouldFit`). If a useful share of reroutes would fit, pre-register `discourse-prompt-cap-v1` here before applying anything: bar on reroutes avoided **and** on recall over tool output, where a compacted result has no `session_read` pointer. The view's handling of tool results (`tool-result fields` in `packages/core/src/discourse.ts`) has only been measured on stored chat rows.
2. **Find the intermittent `packages/eval` test.** 15 local runs were clean. Run the suite in a loop under CPU contention, or add a CI step that uploads the full test log as an artifact on failure (the 5,000-line log tail is what hid the name).
3. **Decide the 0.21/0.22 candidates.** They stay unreleased until judged meaning clears bar 2. OpenUnum will not re-vendor before that.
4. **Client integrations** ([integrations/README.md](integrations/README.md)): Claude Code and Codex CLI have versioned evidence; OpenClaw, OpenCode and Pi are marked working without a recorded tested version; Gemini CLI is design only. Each guide needs the tested product version, permissions, limits and removal path before promotion.

## How to measure on OpenUnum traffic without leaking it

- The harness lives in OpenUnum (`scripts/lunum-discourse-measure.mjs`, `scripts/lunum-live-gate.mjs`); this repository never imports OpenUnum code.
- Export read-only into a mode-700 directory outside both repositories. Commit aggregates only: counts, token sums, ratios. No message text, no session ids, no file paths from the sessions.
- Write the pre-registration and commit it before the first measurement; record deviations in the results file.

## Traps

- `packages/core/dist` is not committed. OpenUnum's pin is established against a clean checkout built at the pinned commit (`pnpm install --offline --frozen-lockfile`, `pnpm --filter ./packages/core build`).
- Stale `dist/` test files without a source counterpart break `pnpm verify` after switching commits; remove only those files, never a whole `dist/`.
- The git hooks block commits and pushes to `main` unless `ALLOW_MAIN_COMMIT=1` / `ALLOW_MAIN_PUSH=1` is set; that is intended for the single orchestrating agent after `pnpm verify`.
- Greek and multilingual intent work is the owner's; under [ADR 0030](decisions/0030-english-pivot-translation-adapters.md) the core is English-only with translation adapters.
