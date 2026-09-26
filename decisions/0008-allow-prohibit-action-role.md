# ADR 0008 — `action` role for allow and prohibit

**Status:** Implemented 2026-09-26. Owner decision (option "add an action role"); implementation self-reviewed. Versions: `lunum-protocol/0.2`, `lunum-frame/0.2`, extraction contract `lunum-agent/0.6`. `lfp:2.1` is unchanged.

## Context

The `allow` and `prohibit` frames had a single required `theme`. Their description said: "permits a recipient to perform an action **or** access a theme". Faced with "Lena allows Tomas to edit.", extractors put the verb in `theme` (`{type: "task", value: "edit"}`). The V8 targets and the missing-argument probes read `theme` as the object, so they expected abstention. The contract allowed both readings, so neither the model nor the targets could be scored as wrong ([evaluation](../reports/diagnostic/2026-09-26/EVALUATION.md)).

## Decision

- The protocol registry gains the role `action`.
- `allow` and `prohibit` are now: `agent` (required), `recipient`, `theme`, `action`, with **at least one of `theme` or `action`**.
- `theme` is the object or resource acted on.
- `action` is the permitted or forbidden action. Its filler must be a **registered protocol predicate given as a bare identifier** (`"read"`, `"update"`, `"access"`). Anything else is `unregistered_action`. If no registered predicate expresses the action, the extractor abstains. A closed vocabulary means an English and a Greek sentence converge only when both map to the same predicate. Free text would never converge ("view" vs "see").
- The builder schema offers the predicate list for `action`. The predicate itself (`action: "allow"`) is still a placeholder (decisions/0007).

| Source | Sem roles |
|---|---|
| Lena allows Tomas to edit. | `action: "update"` |
| Lena allows Tomas to edit page P-3. | `action: "update", theme: document P-3` |
| Dana allows Mira to access. | `action: "access"` |
| Lena allows Tomas. | neither → `missing_required_role` → abstain |

## Identity and migration

- **Existing identities are unchanged.** I fingerprinted all 3,022 Sem objects in the repository with the pre-change build (`7b0c21f`) and the new build. All 1,942 that had an identity under both builds are byte-identical.
  - 41 lost identity. Every one is a type-only `allow … theme: {type: access}` placeholder rejected by the 0.5 amendment of decisions/0007, not by this change.
- The fingerprint projection keeps its frozen tag `lunum-protocol/0.1`. The registry version is not part of identity, so this additive change moves no existing fingerprint. Golden `lfp:2.1` vectors for the new forms are in `packages/core/test/action-role-golden.test.ts`.
- **No automatic migration.** Older Sem that encoded a verb as `theme` (`theme: {type: task, value: edit}`) stays valid, with its own identity. It will not match the new `action: "update"` form. Converting it would require knowing which predicate the verb meant, and core cannot know that. Records produced before contract 0.6 that put a verb in `theme` should be re-extracted if cross-record matching matters.

## Consequences for evaluation data

The V8 rows "Dana allows Mira to access." (and its two Greek versions) were abstention targets because the frame had no place for the action. Under frame 0.2 they are answerable (`action: "access"`). The same holds for the `allow`/`prohibit` "abstain" probes in probe sets v1 and v2.

V8 and the probe files are frozen and are not edited. Successor expectations under frame 0.2 are published as new versioned files that name what they supersede and why (see `experiments/natural-development-v8/frame-0.2-successor/` and `private-expectations-frame-0.2.jsonl` in each probe set).
