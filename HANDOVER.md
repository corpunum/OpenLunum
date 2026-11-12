# Handover

Living document for the next agent. Update it in the same commit as the work it describes. [STATUS.md](STATUS.md) is the evidence summary; this file is the working state. The older hand-off is archived at [research/archive/handoffs/HANDOFF-2026-10-16.md](research/archive/handoffs/HANDOFF-2026-10-16.md).

**Updated 2026-11-12.**

## State of the repository

- `main` is green: the last CI run and a clean-checkout `pnpm verify` both pass.
- Frozen: protocol 0.6, frames 0.8, contract `lunum-agent/0.19`, identity `lfp:2.1` ([ADR 0025](decisions/0025-contract-freeze-pending-held-out-evidence.md)). Contracts 0.21 and 0.22 on `main` are unreleased candidates: coverage rose to 69.5% but judged meaning stayed at 56% ([coverage-a3-v2](experiments/coverage-a3-v2/RESULTS.md)).
- Trunk-based, single agent ([AGENTS.md](AGENTS.md)). The local worker, reviewer, merge and watchdog loops were stopped on 2026-10-06 and are still off; nothing in this repository runs unattended. The owner approved an Ally-only daytime lane on 2026-11-06; it has not been started, and its tunnel to the Ally is down.
- The intermittent `packages/eval` failure is diagnosed and fixed (2026-11-11 evening, below). CI now keeps the full `pnpm verify` log as an artifact, and the failing test names go into the job summary.

## Session state at 2026-11-12 10:43 EET (written before a context compaction)

**Open, in order:**
1. **coverage-a3-v3 is final: no verdict** (hub U-877763bb). DeepSeek never answered on either attempt (07:54 and 10:15 EET; the retry was stopped at 10:50 EET) and is recorded as unavailable (D4). `RESULTS.md` is final. `calibrate.mjs` has a client-side deadline (`--preflight-minutes`, default 5; `--max-minutes`) for any later run.
2. **Prompt-cache A/B reports** (hub U-87d0f342). The harness is OpenUnum `scripts/lunum-prefill-measure.mjs`; its A/B mode is live in OpenUnum `30b20f0b` (as `22c1e66d` and `8dd89006`); the worktree is removed, so run it from a fresh detached worktree or read-only from the deployed checkout.
   - **anchorAtTail (s-openunum, U-03a474a7):** A = 2026-11-12 09:20Z to 19:00Z, flag off (OpenUnum restarted 09:09:52Z on 30b20f0b; no further restart planned). `--since 2026-11-12T09:20:00Z --until 2026-11-12T19:00:00Z`. B = 2026-11-13 09:20Z to 19:00Z, flag on (flip at 11-12 19:00Z). At least 300 local foreground requests per window, else extend both. Report after 11-13 19:00Z with `--base-only` twice, then `--compare`.
   - **UNUM_SCHED (s-engine, U-b666e316):** 2026-11-14 07:00–19:00Z off against 2026-11-15 on.
   - Reports go to s-openunum, s-engine and corpunum-82: aggregates only, with both days' request counts and kind mix.
3. **Dependabot:** the 35 alerts had not auto-closed at last check, although GitHub's dependency graph shows the patched versions. Recheck; if still open, tell corpunum-82.

**Timers and background jobs that live only in this session:** none. No crons, no OpenUnum workers, no leases held.

**Rules that arrived on 2026-11-12** (full text in `~/UnumOrchestrator/sessions/ONBOARDING.md`):
- Messages start `[report|ask|decision|alert|ack] U-key: summary`, with evidence as links.
- Every written time comes from `date` at that moment.
- Full suites and builds run under `~/UnumOrchestrator/scripts/lease.sh run heavy-cpu -- <cmd>`.
- Fable orchestrates and delegates bulk work to subagents with an explicit model (Haiku routine, Sonnet builders, Opus reviews), and verifies their claims.
- This session never reads `~/.openunum/secrets*`; NIM judge runs go through corpunum-82.

## What the 2026-11-11 session did

1. **[discourse-live-gate-v1](experiments/discourse-live-gate-v1/RESULTS.md): PASS.** The discourse view ([ADR 0021](decisions/0021-discourse-records.md)) that OpenUnum has used live since 2026-10-08 was re-measured on 83 sessions that started after it was enabled, bar fixed first: 0.56x prompt tokens at compaction points, exact-match fact recall 20.3% to 37.1%, no point worse. The in-sample figure was 0.30x, so the real saving is about half of what was first reported.
2. **OpenUnum now measures the token gate live.** Its `context_discourse` log event carries the head/tail-cut token count, and a script there reports the ratio from the log.
3. **Finding: the pressure is inside turns, not in chat history.** The view fired 82 times in five weeks; OpenUnum's per-request prompt cap acted 1,850 times in nine days and sent 1,057 requests to a hosted model because recent tool output did not fit. OpenUnum now logs, for each such request, what the view would have produced (measure-only).
4. **OpenUnum's vendored core moved from `433a70d8` to `5f6570bf`,** the newest commit that still carries contract 0.19. It gains the forbidden-key rejection (#723) and the #729 renderer fix. It deliberately does not take 0.21/0.22.

## What the 2026-11-11 evening session (s-openlunum) did

1. **Intermittent `packages/eval` failure: three causes found and fixed.** I ran the suite 30 times as two concurrent copies plus 6 CPU burners: 35 of 60 runs failed before the fixes, 10 of 60 after.
   - `runSoakTest` computed latency drift from interval means already rounded to 1 µs. `validate` takes about 0.8 µs per call, so a mean rounded to 0 gave exactly −100% drift. Drift now uses unrounded means (`soakLatencyDriftPct`, with a regression test).
   - The first soak interval (JIT warm-up) is left out of the drift and heap-stability measures when there are at least 3 intervals.
   - Three `retrieval.test.ts` tests wrote broken fixtures into the committed fixtures directory, and concurrent readers saw them. They now use a private copy (`isolatedFixtureRoot`).
   - What still fails under that load: negative drift (−52% to −77%), the compare throughput floor, and one `ENOTEMPTY` on `packages/eval/scratch/` that only two copies sharing one tree can cause. I left those alone on purpose: they are artefacts of load much heavier than CI.
2. **Client integrations on the local model.** Evidence is in `docs/CLIENT_COMPATIBILITY.md`, section "2026-11-11 local-model runs".
   - OpenCode 1.18.33: PASS.
   - Pi 0.84.0: PASS, error path included.
   - OpenClaw 2026.11.3: PASS on the retry, with provider `timeoutSeconds` 600. The first attempt timed out on a 57k-token first-turn prefill.
   - Fixes along the way: the Pi extension throws on failure and takes `LUNUM_CORE_PATH`; the OpenCode guide's config key is corrected. MCP tool annotations (`readOnlyHint` etc.) shipped on 2026-11-12 in the v29 maintenance freeze (below).
3. **Housekeeping.**
   - Removed six stale `~/openlunum-workers` worktrees from September. Their unlanded commits are kept as `refs/archive/{check-f4,scorer-685,codec-s1-base}`, and the codec-s1 uncommitted diff is in `~/openlunum-archive/worktrees-20261111/`.
   - The September `reports/experiments` output is gitignored.
   - The rig's `openclaw` launcher now runs the npm release on a private Node 24 (`~/.local/lib/node24`), because the system Node is 22.

## Next steps, in order

1. **Prompt-cap shadow: retired (2026-11-12, corpunum-82).** OpenUnum's per-request cap moved from 32,768 to 48,742 tokens (slot context 65,536) on 11-11. Over-cap events went from 116–279 a day to none, so the shadow has nothing to measure and `discourse-prompt-cap-v1` is not pre-registered. Next (approved by corpunum-82 under the owner's 10-08 directive, shadow-only): **[cache-aware-compaction-v1](experiments/cache-aware-compaction-v1/RESULTS.md): pilot negative (arm T 0.98x net prefill), window not opened** (corpunum-82, 11-12). Reopen only if a re-pilot after the slot fix shows T ≤ 0.85x. 41% of prefill is slot thrashing (cacheN 0 under 4–7 concurrent sessions on 2 slots), sent to s-engine and s-openunum; the harness (OpenUnum `scripts/lunum-prefill-measure.mjs`, f56929cd, in review) measures that fix before and after. It covers **every-turn compaction** with the metric as **net prefilled tokens and TTFT under unum-serve's prefix cache** (prod turns show about 13–14k cached against 0.3–1k prefilled), not raw prompt tokens, plus recall ≥ base. Prefer compaction only at stable boundaries (append-only, rare rewrites). If the net prefill saving is under 20%, stop there.
1a. **v29 maintenance freeze (2026-11-12):** the dependency security update (MCP SDK 1.32.2, zod 4.6.7 declared directly, fast-uri 3.1.9, hono, qs, ip-address, body-parser, proxy-addr) and the MCP tool annotations, on the same contract 0.22. `scripts/research/freeze-v29.mjs`; earlier packages' expected drift gains `toolImplementationSha256` and `transportValidatorDependency` (`withV29Drift` in the gate test). The coverage-a3-v3 pre-registration names v28; the re-judging uses the renderer only, and the renderer and contract are byte-identical in v29.
2. **Watch CI for any further `packages/eval` failure.** The full log is now uploaded as `verify-log-<run>`. Before changing a bound, check whether the failure is one of the load artefacts listed above.
3. **0.21/0.22 candidates: [coverage-a3-v3](experiments/coverage-a3-v3/PREREGISTRATION.md), judges being calibrated (2026-11-12).** The owner delegated the 32 labels (decision 34bf87fd).
   - **Labels:** a blind Opus rater labelled them, 28 yes and 4 mostly. That makes this a **model-rated calibration** with no natural negatives, so kappa rests on the 8 controls ([DEVIATIONS](experiments/coverage-a3-v3/DEVIATIONS.md) D1).
   - **Call path (D2):** `judges.mjs` `ask()` used to turn an HTTP 4xx into silent nulls. Now a 4xx is `judge_unreachable`, the parser falls back to `reasoning_content`, and every row records status and `finish_reason`. `calibrate.mjs` runs a one-call preflight before any judge run.
   - **Judges:** GLM 5.3 is retired on NIM (HTTP 410); D3 records it as unavailable, with no substitute. Luna is running through the Codex CLI. corpunum-82 runs DeepSeek and, if needed, Nemotron, because those use the NIM key; this session never reads secrets. There is no Qwen slot today.
   - **Then:** `score.mjs --judge <each of the two highest-kappa R1 passers>`, followed by `score.mjs --verdict a,b --categories bar/categories-v2.json`. The categories file is derived mechanically from coverage-a3-v2 (`build-categories.mjs`).
   - **RESULTS.md must record:** D1–D3, plus the per-clause R1 of the one multi-clause record.
   - **What a pass means:** a pass is not a release. Release needs A, B and C together (coverage-a3-v4). OpenUnum does not re-vendor.
4. **Live Claude Code MCP redeployed (2026-11-12, corpunum-82, hub U-bc29b0bf).**
   - `~/.local/share/lunum-mcp`, the global `lunum` and `lunum-locator` servers for every Claude Code session, now runs local deploy commit **`475cdf2a`**. It is never pushed.
   - That commit is `5f6570bf` (contract `lunum-agent/0.19`, the same pin as OpenUnum) plus the dependency security update: MCP SDK 1.32.2, zod 4.6.7, fast-uri 3.1.9, hono 4.13.18, qs 6.17.1, ip-address 10.7.6, body-parser 2.4.0 and proxy-addr 2.0.8.
   - Smoke-tested over stdio before and after the switch: 12 tools, `lunum_compile_context` without error, contract 0.19, and the locator serving `lunum_ground`.
   - Sessions pick it up on their next MCP restart.
   - **Rollback:** `mv ~/.local/share/lunum-mcp ~/.local/share/lunum-mcp-475cdf2a && mv ~/.local/share/lunum-mcp-539c7086 ~/.local/share/lunum-mcp` restores the previous checkout (539c7086, contract 0.17).
5. **Client integrations** ([integrations/README.md](integrations/README.md)): Claude Code, Codex CLI, OpenCode, OpenClaw and Pi have versioned evidence. Gemini CLI is design only.

## How to measure on OpenUnum traffic without leaking it

- The harness lives in OpenUnum (`scripts/lunum-discourse-measure.mjs`, `scripts/lunum-live-gate.mjs`); this repository never imports OpenUnum code.
- Export read-only into a mode-700 directory outside both repositories. Commit aggregates only: counts, token sums, ratios. No message text, no session ids, no file paths from the sessions.
- Write the pre-registration and commit it before the first measurement; record deviations in the results file.

## Traps

- `packages/core/dist` is not committed. OpenUnum's pin is established against a clean checkout built at the pinned commit (`pnpm install --offline --frozen-lockfile`, `pnpm --filter ./packages/core build`).
- Stale `dist/` test files without a source counterpart break `pnpm verify` after switching commits; remove only those files, never a whole `dist/`.
- The git hooks block commits and pushes to `main` unless `ALLOW_MAIN_COMMIT=1` / `ALLOW_MAIN_PUSH=1` is set; that is intended for the single orchestrating agent after `pnpm verify`.
- Greek and multilingual intent work is the owner's; under [ADR 0030](decisions/0030-english-pivot-translation-adapters.md) the core is English-only with translation adapters.
