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

**Untested on this set: exposure 0/300.** The lemma and lemma+variant candidate classes in
results.json are identical on all 300 items, so the variant merge never touched a single item.
The "0/0 discordants" therefore means the test had zero power: it is **not** evidence that the
merge is safe or rank-neutral. **H1 FAIL** (margin 0.000 vs the +0.03 bar). Safety rests only
on the unit tests (same stem, ending-class swap only, no chains; 82 merged classes, all pairs).
The feature stays opt-in (`--variant-lemmas`, off by default). The v1 effect was in-sample.
