# ADR 0007 — Placeholder role fillers are not arguments

**Status:** Implemented 2026-09-26 (extraction contract `lunum-agent/0.4`). Self-reviewed.

## Context

In the V8 live runs, extractors did not abstain on sentences with a missing required argument. "Dana allows Mira to access." and its two Greek versions leave the object of *access* unstated. Codex and Claude (2026-09-15) and Claude Code with `claude-sonnet-5` (2026-09-26) all produced

```json
{"predicate": "allow", "roles": {"agent": …, "recipient": …, "theme": {"type": "access", "value": "access"}}}
```

Core accepted it at every stage (transport, protocol, frame, references) and issued an exact `lfp:2.1` identity. It was not promoted: trust stayed `candidate` and required review. Still, two different underspecified sentences would converge on the same exact identity through an invented argument.

## Decision

A role term is a **placeholder** when it has no `id` and its string `value`, after identifier normalization, equals its own `type` or the clause predicate. A bare string term equal to the predicate is also a placeholder. `validateClauseFrame` reports `placeholder_role` for any role filled this way. The frame is then invalid and no semantic identity is issued.

The extraction contract adds the abstention rule "Abstain when the source does not state a role the frame requires; never fill a role with its own term type or the predicate (placeholder_role)". That change moves the contract to `lunum-agent/0.4`.

## Why this rule

- It is mechanical and language-neutral: it compares protocol identifiers the extractor emitted, not source words.
- A scan of all 2,711 Sem objects in the repository (datasets, experiments, reviewed targets, fixtures, protected evaluation data, reports) found 22 hits. Every one is an extractor candidate for the "allow … access" abstention case. There were no hits in any dataset, target or fixture.

## Consequences and limits

- Canonicalization, fingerprint bytes and frame registry data are unchanged, and existing valid Sem keeps its identity. The frame registry hash is unchanged. The contract hash and version change.
- The rule catches only the self-echo pattern. An extractor that invents a different filler (`theme: {type: "concept", id: "system"}`) still passes. Detecting that needs source-evidence alignment, which core does not have.
- A sentence such as "Dana grants Mira access." with a filler of `{type: "access", value: "access"}` is also rejected. That is intended: the thing accessed is unstated, and failing closed is correct for identity.
