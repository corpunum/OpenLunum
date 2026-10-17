# WORKSHEET-v2 fill by models: results

**Run 2026-10-17 against [PREREGISTRATION.md](PREREGISTRATION.md) and amendments 1–2. Level (b), model consensus, owner-delegated; not owner gold. Self-reviewed.** Filled sheet: [WORKSHEET-v2-filled.md](../WORKSHEET-v2-filled.md).

| | |
|---|---|
| Items | 156 pairs + 20 seed checks + 40 controls |
| Judge A | SuperGemma (Ally): every batch parsed after amendment 1 (token budget) |
| Judge B | Sol 6.1 medium (Codex): every batch parsed |
| Judge C (43 disagreements) | Qwen 3.8 Flash (Halogen), replacing Luna (amendment 2): every batch parsed |
| A–B agreement | **0.801**, Cohen's kappa **0.634** |
| False "same" on 40 controls | **0** (A), **0** (B): both judges valid; all 40 controls labelled D |
| Gold, 176 pairs and seed checks | **128 S, 27 B, 0 I, 8 D, 0 X, 13 unresolved** |
| Pairs SuperGemma proposed | A–B agree on 81 of 112 (72%), below the overall 80% |
| Pairs Qwen proposed among the tie-breaks | 16; Qwen's vote matched the gold on 13 |

Prediction check: agreement (0.80) was above the predicted 0.6 to 0.7. Both judges passed the controls; I had expected SuperGemma to fail them.

## What this does and does not show

- The attested pairs from the pivot miner are mostly translation-equivalent by model consensus: 128 same and 27 broader or narrower of 163 resolved. The corpus layer finds meaning-preserving variants, not noise.
- It is consensus among three model families, not a native speaker. The 13 unresolved items, and any the owner wants to overrule, are his.
- Example of a split: Sol labelled the seed "call the police" = «καλώ την αστυνομία» *different* (plausibly first-person «καλώ» against an English that could be imperative); SuperGemma and Qwen said same, so the gold is S.
- No "implies" label was given anywhere, including «πάρε το 100»-style localisations; none of those were in WORKSHEET-v2's rows.
