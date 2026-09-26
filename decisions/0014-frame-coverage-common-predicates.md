# ADR 0014 — Frames for common registered predicates

**Status:** Implemented 2026-09-26. Self-reviewed, prompted by the [independent evaluation](../reports/independent-evaluation/2026-09-26/REPORT.md). `lunum-frame/0.4`, contract `lunum-agent/0.10`. `lfp:2.1` is unchanged.

## Context

Only 23 of 46 registered predicates had frames, and core gives no identity to a clause whose predicate is unframed. Together with decisions/0010 (a permission with no stated permitter goes on the action's own frame), that made ordinary sentences unrepresentable:
- "Nadia is permitted to **read** the payroll report."
- "Tom is not allowed to **approve** his own expenses."
- "**Start** the backup job."
- the imperative "**Retry** the upload 3 times…"

The independent evaluator's fresh sentences parsed 0/6 permitter-less permissions for that reason. Meanwhile "X allows Nadia to read R" parsed, because `action` accepts any registered predicate.

## Decision

- **Frame 14 predicates with a conventional argument structure:**
  - read, write, update, create, access, archive, store, approve, run, restart: `agent` optional (imperatives), `theme` required, as for enable/delete;
  - `share`: agent, theme, optional recipient;
  - `notify`: optional agent, required recipient, optional theme;
  - `grant` and `revoke`: agent, theme, optional recipient.
- **`retry`:** the agent becomes optional, so imperatives work as they already do for enable, disable and delete.
- **Still unframed:** require, observe, remind, authenticate, translate, state, is_healthy, wait and request_extension. Their argument structure needs a decision, not a default.

## Evidence

- The committed scan (`scripts/research/fingerprint-stability-scan.mjs`, builds `008e320` vs new) gives 3,433 identities byte-identical, 0 changed and 0 lost. 20 Sem objects gained an identity.
  - All 20 are in pre-existing datasets (adversarial, scorer-eval, retention), and use exactly these role structures: `run(agent, theme)`, `grant(agent, recipient, theme)`, `notify(agent, recipient, theme)`, …
  - That is independent support for the chosen shapes, since those files predate this decision.
- In the two adversarial suites of meaning pairs that must differ, all 19 pairs in which both sides now have identity get **distinct** identities, with 0 collisions.

## Limits

These are shapes, not lexical coverage. Verbs like "use", "open" or "enter" still have no predicate, and abstaining on them stays correct. Out-of-sample behaviour must be measured by someone other than the author.

## Amendment 1: corrections from the round-2 independent evaluation

- **"Independent support for the chosen shapes" was overstated.** The 20 datasets that gained identity were written in this same project, and the author could see them while choosing the frames.
- **"All 19 pairs … 0 collisions" covers only the pairs that have identity:** 19 of 58 adversarial pairs. The other 39 are untested by that check.
- **The Limits section was wrong about the product.** Live, the extractor mapped "use", "open" and "enter" to `access` on its own, although none of them is an alias. Whether those mappings are correct is an unreviewed semantic judgement.
- `grant`, `revoke` and `share` were made agent-required, which recreated the imperative gap this ADR fixed for `retry`. decisions/0015 makes them agent-optional.
