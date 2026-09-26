# ADR 0015 — Canonical prohibition encoding; imperative grant, revoke and share

**Status:** Implemented 2026-09-26. Self-reviewed, prompted by the [round-2 independent evaluation](../reports/independent-evaluation/2026-09-26-round2/REPORT.md). `lunum-frame/0.5`, contract `lunum-agent/0.11`. `lfp:2.1` is unchanged.

## Context

**Prohibitions split across two identities.** A prohibition with no stated authority ("The interns may not approve purchase orders", Greek "Απαγορεύεται …") was encoded two ways. The live runs gave 4 × `obligation` + `negated` and 3 × `permission` + `negated`. Core accepted both, with different identities.
- The protocol already normalizes `must_not`, `forbidden` and `prohibited` to `obligation` + `negated`.
- `permission` + `negated` literally means "permitted *not* to".

**Imperative grants were unrepresentable.** decisions/0014 made `grant`, `revoke` and `share` agent-required, so "Grant Priya access to the staging database" abstained. That is the same gap 0014 fixed for `retry`.

## Decision

1. **Prohibition:** `permission` with `negated: true` is a frame issue, `ambiguous_negated_permission`, and fails closed. A prohibition without a stated authority is `obligation` + `negated`; with a stated authority it is `prohibit`. The contract states this rule.
2. **Imperatives:** `grant`, `revoke` and `share` take an optional agent, as `retry`, `enable` and `delete` do.
3. **Meaning retention:** the contract adds "If the sentence states a restriction, threshold, deadline, recurrence or exception that no role of the chosen frame can hold, abstain rather than drop it." This is an instruction, and instructions have not reliably changed extractor behaviour here, so its effect must be measured.

## Cost, stated plainly

- The committed scan (`a2909a3` vs new) finds 3,580 identities byte-identical, 0 changed and **15 lost**, all to rule 1.
  - 11 are extractor outputs: the round-2 evaluator's prohibitions and older runs.
  - **4 are rows of `datasets/adversarial/mutation-false-positive-v2.jsonl`** that legitimately mean "the assistant *may decline to* approve" (en, el, es, id).
- Core cannot tell that rare legitimate reading apart from the common misuse, so those rows now get no identity. The decision accepts this fail-closed loss rather than keeping a second identity for every misencoded prohibition.
