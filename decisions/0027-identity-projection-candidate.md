# ADR 0027: A canonical identity projection for run-to-run stability (proposed)

**Status: Proposed 2026-10-16; parked 2026-10-17 after two held-out gates failed bar 1 (Sonnet): v1 candidate 23/26 = 88.5% ([gate v1](../experiments/identity-heldout-v1/RESULTS.md)); revised v2 candidate (leading articles/prepositions stripped) 18/22 = 81.8% ([gate v2](../experiments/identity-heldout-v2/RESULTS.md)). The remaining splits are mostly frame choice, which a projection cannot fold; that is a contract question. Not implemented; `lfp:2.1` unchanged.**

## Context

The same sentence, extracted twice by the same model under a frozen contract, gets the same `lfp:2.1` identity:
- **7 of 12** times in the round-2 sentences ([v17 report](../reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md));
- **4 of 12** times in cross-language-convergence-v1 ([results](../experiments/cross-language-convergence-v1/RESULTS.md)). That run failed its pre-registered stability bar of < 75%.

The splits come from labels and forms that the source does not determine:
- `kind`;
- term types;
- `id` vs `value`;
- a bare string vs a wrapped term;
- case and underscores.

Identity-based deduplication cannot work while one extractor disagrees with itself.

## Proposal

A new identity version (`lfp:2.2`) uses the [candidate projection](../experiments/identity-projection-candidate-v1/README.md):
- `kind` is reduced to a mood class, directive or assertive;
- term types are dropped, except literal types (quantity, date, time, duration, percent, money);
- `id` and `value` are folded;
- bare and wrapped fillers count as the same;
- case and underscores are folded.

Everything else is kept:
- world, predicate, negation, modality and roles;
- clause time, conditions and consequences;
- every filler's words.

Offline and in-sample, stability rises from 4/12 to 8/12 and from 7/12 to 11/12. In the repository, 114 identities collapse into 47 groups, none of them in adversarial, collision or contrast suites. All the spot-checked collapses are the same words with different labels.

## Gate before implementation

1. **Pre-register** a fresh held-out set, using a new seed over the Tatoeba export and English sentences that need no general frame. Run it twice under the frozen contract.
2. **Bars:**
   - candidate stability of at least 90%, with at least 20 sentences covered in both runs;
   - 0 merges in the adversarial, collision and contrast suites;
   - every candidate merge on the held-out set judged the same meaning by the owner.
3. **Only then** implement `lfp:2.2`, with golden vectors, `lfp:2.1` → `2.2` migration notes and a replay of every recorded identity. `lfp:2.1` is never rewritten.

## What it does not do

- It does not make English and Greek converge: 0 of 5 either way. Open terms stay in their source language.
- Cross-language identity needs a term-identity layer, or it must be scoped out ([ADR 0026](0026-working-scope-checkable-memory.md)).
- Homonyms told apart only by term type would merge. They belong to grounding.
