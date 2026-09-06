# Grounding research ledger

## Cycle 1: direct extraction baseline

- Hypothesis: complete-schema agents can independently choose stable open IDs.
- Evidence: the frozen Codex-agent run produced 11/11 comparable identities but only 3/11 exact; equivalent open concepts diverged.
- Decision: reject as insufficient for multilingual open-concept identity.

## Cycle 2: frame-first, two-stage, verifier

- Hypothesis: better decomposition instructions alone will normalize open concepts.
- Evidence: on nine development cases, frame-first, two-stage, and verifier variants each reached 1/8 exact supported cases; term typing and compound identifier conventions still differed.
- Decision: reject prompt-only improvement; do not alter protocol to fit agent naming.

## Cycle 3: structured grounding sidecar

- Hypothesis: typed head/modifier structures can make compositional evidence comparable without granting unsafe identity.
- Implementation: `packages/core/src/grounding.ts`, exported through core, generated in the extraction contract, and exposed optionally through MCP/CLI candidate submission.
- Evidence: modifier order and evidence surface/language normalize away; red versus blue and different heads remain distinct; agent proposals return `gnd:` fingerprints but no `lfp:2.1`.
- Decision: keep as an auxiliary contract.

## Cycle 4: exact registry resolution

- Hypothesis: an immutable, pinned registry can resolve exact structured proposals safely.
- Implementation: exact-only registry adapter and materialization; unresolved, ambiguous, malformed, namespace-free, or fingerprint-mismatched results fail closed.
- Evidence: equivalent blue-folder proposals materialized to one LFP; red-folder remained distinct; unknown green remained unresolved.
- Decision: keep as an opt-in authority boundary. A registry implementation and independent authority are still external work.

## Current blocker

Unseen multilingual synonymy and open-concept grounding cannot be proven by deterministic string normalization or agent consensus alone. The next safe gain requires a scoped, versioned grounding resource or trained multilingual grounding capability. No protected corpus is created or rerun in these development cycles.
