# ADR 0026: Working scope, a checkable memory layer (proposed)

**Status: Proposed 2026-10-16. It needs the owner's acceptance.** Until it is accepted, [VISION.md](../VISION.md) is unchanged, and the binding principles in AGENTS.md still state the long-term goal.

## Context

The long-term vision is language-neutral structured meaning whose identities converge across paraphrase and language, to preserve meaning and cut agent context cost. Evidence against it as a near-term working scope:

| Evidence | Source |
|---|---|
| 0 identities on 21,291 units of the owner's real agent memory; only 0.8% of units start with a covered verb; the deduplication ceiling is 3.2% of tokens | [discourse-unit-identity-v1](../experiments/discourse-unit-identity-v1/RESULTS.md) |
| The same sentence extracted twice by the same model gets the same identity 7 times in 12, because of `kind`, term-type and id/value labels | [v17 report](../reports/independent-evaluation/2026-10-07-round2-v17-live/REPORT.md) |
| General frames (ADR 0024) reach ordinary sentences only by binding slots to source words: no paraphrase invariance, English only | [ADR 0024](0024-general-source-bound-frames.md) |
| Both compressed-context candidates failed their pre-registered bars | [ambient v1](../experiments/ambient-discourse-v1/RESULTS.md), [v2](../experiments/ambient-discourse-v2/RESULTS.md) |

Evidence for what works:
- **Exact recall over real memory.** Overall recall@5 went from 0.41 to 0.80; unaccented Greek queries reach 0.99. These changes shipped to OpenUnum.
- **Literal retention and refusal gates:** deterministic, and replayed with 0 identity movement.
- **Surface discourse records.** They keep literals under context pressure.

## Proposal

For the next 4–6 weeks, Lunum is developed as:

> **a checkable memory layer for agent systems:**
> - deterministic structure over source text;
> - exact literal retention;
> - verified recall;
> - refusal when a representation would lose meaning.
>
> **Semantic identity is issued, and claimed, only where convergence has been measured.**

Concretely:
1. **Identity claims are scoped to the measurement.** No document says "the same meaning in EN/EL gets the same identity" until the [owner-authored pair test](../experiments/owner-greek-review-v1/README.md) passes its bar.
2. **Run-to-run stability is the first identity problem.** A fingerprint projection that leaves out labels the source does not determine (`kind`, indistinguishable term types, the id/value form) is the first candidate change. It goes through ADR 0025's held-out gate.
3. **General-frame identities count as source-bound identities, not semantic ones**, until the yield and faithfulness test on fresh real text passes (the review's step 4).
4. **Work that serves OpenUnum's real memory comes first:** recall, discourse records, refusal and rollback to source.
5. **The long-term vision stays the destination.** It is not deleted. It returns as the working scope when cross-language and paraphrase convergence is measured on held-out data.

## What the owner decides

- Accept, amend or reject this scope.
- If accepted, a follow-up commit:
  - adds a "Current working scope" section to VISION.md that points here;
  - qualifies the AGENTS.md principle "Lunum-Sem is language-neutral structured meaning" as the goal of the representation, not a property the current identity has.
