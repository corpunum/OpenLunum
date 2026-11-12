# Prompt-cache A/B chain: anchorAtTail and UNUM_SCHED (pre-registration)

**Pre-registered 2026-11-12, before any window opens. Times are UTC.** The windows were decided by corpunum-82 on 2026-11-12, after the security release on 11-12 and the release and engine promotion on 11-13 changed the build. This replaces the window plan in HANDOVER. It is a before/after measurement with no pass bar. The ceilings it is read against are in [AB-EXPECTATIONS.md](AB-EXPECTATIONS.md).

## Windows (one build: OpenUnum and engine as deployed after 2026-11-13 evening)

| Day | Window | `runtime.localPromptCache.anchorAtTail` | `UNUM_SCHED` |
|---|---|---|---|
| D1 | 2026-11-14 07:00–19:00Z | off | off |
| D2 | 2026-11-15 07:00–19:00Z | on (timer flip 2026-11-14 21:00Z) | off |
| D3 | 2026-11-16 07:00–19:00Z | on | on (s-engine flips between D2 and D3) |

- **anchorAtTail effect:** D1 against D2. **UNUM_SCHED effect:** D2 against D3. Each comparison changes exactly one flag.
- **Freeze:** no OpenUnum deploy and no engine change from 2026-11-14 07:00Z to 2026-11-16 19:00Z, nightly gaps included (corpunum-82). The only planned changes are the two flips.
- **Not measured:** 2026-11-13, which has a release and an engine promotion.
- **Pre-window:** 2026-11-12 from 11:03:53Z to 16:26:25Z, when OpenUnum restarted on `1ce50aa9`. It ran on the old build (`9095b4ff`), with 11:31:16Z–11:41:24Z and 12:18:12Z–12:19:46Z excluded. It is reported separately as context and is never part of a comparison.

## Rules

- **Harness:** OpenUnum `scripts/lunum-prefill-measure.mjs` at `1b663c10` or later (the provider filter), the same version for every window. Each window runs with `--base-only --provider openai-compatible`; each pair runs with `--compare`.
- **Counted requests:** local foreground requests with llama.cpp cache counters from provider `openai-compatible`. Before each report, the provider and model mix is checked, and anything else is reported and excluded.
- **Restarts:** any unplanned restart inside a window excludes restart to restart + 10 min from that window, and the same clock span from the window it is compared with.
- **Volume:** at least 300 counted requests per window. If a window has fewer, the comparison is reported as below the minimum and indicative only. Windows are not extended, because the freeze ends at D3.
- **Reported for each pair:** prefill per request; prefill share; history-miss and full-miss rates; p50 and p95 prefill ms; all of these by kind (`foreground_initial`, `foreground_tool_iteration`) and by divergence bucket; the request counts and kind mix of both days.
- **Expected direction (not a bar):**
  - anchorAtTail moves tool iterations from `mid_prompt` to `at_tail` divergence, with lower prefill per request.
  - UNUM_SCHED lowers full misses at turn starts. Its ceiling is 7.7% of foreground prefill (AB-EXPECTATIONS).
  - Load differs between days, so a change under about 10% in prefill per request is reported as within day-to-day variation.

## Reports

- anchorAtTail after 2026-11-15 19:00Z; UNUM_SCHED after 2026-11-16 19:00Z.
- Recipients: s-openunum, s-engine and corpunum-82. Aggregates only.
