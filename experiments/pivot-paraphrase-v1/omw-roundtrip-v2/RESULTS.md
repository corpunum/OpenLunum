# OMW round-trip v2 — RESULTS (fresh 300 items, run 2026-10-17)

Pre-registration was committed **before** this run (d4ee02eb, seed `pivot-omw-roundtrip-v2:2026-10-17`).
Scorer: [`score.mjs`](score.mjs) (same path as v1, third config added). Raw: `results.json`.

## Verdict

- **H1 (the bar): FAIL.** Bar was lemma+variant top-5 ≥ surface top-5 + 0.03. Observed margin: **0.000** (0.547 vs 0.547).
- H2 (usability, not a bar): lemma+variant top-5 = 0.547 < 0.60 — fail, reported only.

## Numbers (n = 300, Europarl v8 primary)

| config | top-1 | top-5 | noCandidates |
|---|---|---|---|
| surface | 0.330 | 0.547 | 7 |
| lemma | 0.357 | 0.547 | 10 |
| lemma+variant | 0.357 | 0.547 | 10 |

Paired top-5 discordants (McNemar counts): **lemma vs lemma+variant: 0 / 0** — per-item ranks are
identical; the variant merge changed nothing on this fresh set. surface vs lemma+variant: 10 / 10.

## Merge stats (UniMorph Greek table, `--variant-stats`)

`{"mergedClasses":82,"largestClass":2}` — every merged class is exactly a pair; no chains, as pinned
in code (same stem, ending-class swap only).

## Reading

The merge behaves exactly as specified — and is **rank-neutral** on a fresh held-out set: variant
pairs are rare among the top-5 candidates of these items, and where present they do not change
rank. Honest conclusion: variant-lemma merging is *safe* (never worse than plain lemma mode, 0/0
discordants) but does **not** clear the pre-registered +0.03 bar on fresh data. The v1 win was
in-sample; on a fresh set the effect is zero.
