# Decisions (ADRs)

Every design decision that changes what Lunum accepts, how identity is computed or how evidence is handled. Each ADR states its cost and its limits. ADRs 0001–0005 lived in `docs/decisions/` until 2026-10-22; all ADRs are now here.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-independent-core-and-product-adapters.md) | Independent core and product adapters | Accepted |
| [0002](0002-separate-semantics-and-rendering.md) | Separate semantics and rendering | Accepted |
| [0003](0003-typescript-reference-python-research.md) | TypeScript reference implementation and Python research tools | Accepted |
| [0004](0004-language-neutral-sem-english-pivot-renderer.md) | Language-neutral Sem and an initial English-pivot renderer | Accepted |
| [0005](0005-agent-experiment-governance.md) | Bounded worker agents and external orchestration | Accepted |
| [0006](0006-merge-policy-fail-closed.md) | Fail-closed merge policy with exact-head binding | Implemented |
| [0007](0007-placeholder-role-fillers.md) | Placeholder role fillers are not arguments | Implemented |
| [0008](0008-allow-prohibit-action-role.md) | `action` role for allow and prohibit | Implemented |
| [0009](0009-lossless-renderer-profile.md) | Lossless renderer profile `generic-en-pivot/0.2` | Implemented |
| [0010](0010-permission-needs-stated-permitter.md) | `allow`/`prohibit` with an action need a distinct, stated recipient | Implemented |
| [0011](0011-action-verb-aliases.md) | Verb aliases for the `action` role | Implemented |
| [0012](0012-identity-dedup-context-mode.md) | `identity_dedup` context mode | Implemented |
| [0013](0013-recommended-model-facing-mode.md) | `identity_dedup` as the recommended model-facing context mode | Implemented |
| [0014](0014-frame-coverage-common-predicates.md) | Frames for common registered predicates | Implemented |
| [0015](0015-canonical-prohibition-and-imperative-grants.md) | Canonical prohibition encoding; imperative grant, revoke and share | Implemented |
| [0016](0016-source-literal-retention-gate.md) | Source literal retention gate | Implemented |
| [0017](0017-authoritative-transport-validation.md) | Enforce the authoritative wire schema at submission | Implemented |
| [0018](0018-date-and-evidence-retention-boundary.md) | Separate dates from quantities and evidence from retained meaning | Implemented |
| [0019](0019-month-name-date-retention.md) | Recognise English and Greek month-name dates in source retention | Implemented |
| [0020](0020-number-words-and-relative-times.md) | Number words and relative times are source literals; strict thresholds are conditions | Implemented |
| [0021](0021-discourse-records.md) | Discourse records: source-span units for long and structured text | Implemented |
| [0022](0022-inclusive-bound-predicates.md) | Inclusive comparison predicates `at_most` / `at_least` | Implemented |
| [0023](0023-imperative-frames.md) | Imperative frames (deploy/rotate agent, deploy theme, restart count) | Implemented |
| [0024](0024-general-source-bound-frames.md) | General source-bound frames for ordinary statements | Implemented |
| [0025](0025-contract-freeze-pending-held-out-evidence.md) | Freeze the extraction contract until held-out evidence exists | Accepted |
| [0026](0026-working-scope-checkable-memory.md) | Working scope, a checkable memory layer | Accepted with an amendment |
| [0027](0027-identity-projection-candidate.md) | A canonical identity projection for run-to-run stability | Proposed, parked |
| [0028](0028-language-neutral-concept-layer.md) | A language-neutral concept layer, and a pro-drop agent rule | Proposed; its cross-language part is off the critical path since 0030 |
| [0029](0029-greek-source-bound-frames.md) | Greek source-bound general frames, with deixis for pro-drop | Proposed; parked as optional research by 0030 |
| [0030](0030-english-pivot-translation-adapters.md) | English as the pivot, with translation adapters at the edges | Accepted |
| [0031](0031-mood-renderer-and-imperative-frames.md) | Mood in the English renderer (0.3), imperatives in contract 0.22, weekday/month guards | Implemented; unreleased candidate |
