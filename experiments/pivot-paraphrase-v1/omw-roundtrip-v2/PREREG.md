# Pivot miner v2: Greek variant-lemma merging on a fresh item set — pre-registration

**Committed 2026-10-17, before any run of the scorer on these items. No model call. CPU only. Self-reviewed.**

## Question

Greek verbs have spelling-variant lemmas the lemmatiser splits: τηλεφωνώ / τηλεφωνάω
(-ώ vs -άω), plus similar ending-class pairs. Does merging them — same stem,
ending-class swap only, never transitive chains (rule pinned in
[`main.rs`](../../../tools/pivot-miner/src/main.rs), `variant_classes` /
`variant_key` / `variant_merge`) — beat surface forms and plain lemma mode on a
**fresh** item set?

The 300 items of [v1](../omw-roundtrip/PREREGISTRATION.md) are **spent**: a rerun on
them counts only as an in-sample regression check, never as a claim.

## Gold and items (same generation method as v1, fresh seed)

- Gold: OMW 2.0 (pinned archive sha256 `c369a2ad…8d7d`); EN lemma and EL lemma are
  translations when they share a synset; nouns and verbs, single words only.
- Seed `pivot-omw-roundtrip-v2:2026-10-17`. Eligible = EN gold words with Europarl line
  frequency in [20, 20000] **excluding the 300 v1 items** ([`select.mjs`](select.mjs)
  reads v1's `items.json` and drops them before the cut), ranked by
  `sha256(seed|word)`, first **300** → [`items.json`](items.json).
- No item is chosen after running the tool on it.

## Procedure

Three configurations on Europarl v8, same scorer path as v1 (`score.mjs` pattern):
**surface** (baseline), **lemma** (UniMorph classes, no variant merge),
**lemma+variant** (variant classes merged). Candidates and gold mapped to lemma
classes with the tool's own rules (`--classify`, with `--variant-lemmas` for the
third config), so all three are scored alike.

## Bar (fixed before the run)

| | Bar |
|---|---|
| H1: variant merging helps | **lemma+variant top-5 ≥ surface top-5 + 0.03** |

H2 (usability, carried from v1): lemma+variant top-5 ≥ 0.60 is reported but not a bar.

## Also reported (fixed before the run)

- Number of merged classes and largest class size, from `--variant-stats` on the
  UniMorph Greek table (the merge is exact (stem, class) grouping; chains are
  impossible by construction — the v1 failure mode).
- Paired discordant counts (McNemar) between lemma and lemma+variant on the fresh items.

## Known limits, stated before the result

The wordnet gold is incomplete and sense-fine; absolute accuracy is a lower bound.
UniMorph lacks some Greek forms; unknown words stay as they are. Single words only.
