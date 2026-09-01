# OpenLunum semantic contract

This document describes the contract implemented by the versioned protocol
registry in `packages/core/src/semantic-registry.ts`. It does not replace the
vision or freeze an application ontology.

## Flow

Source text remains authoritative. A model may produce a candidate Sem, but
JSON/schema validity is only structural evidence:

```
source evidence -> candidate Sem -> structural validation
               -> protocol normalization -> canonical Sem
               -> trust/promotion -> semantic identity and retrieval
```

An unresolved closed-field symbol remains a candidate and cannot receive a
semantic identity fingerprint or semantic promotion. Callers may retain it
alongside the natural source text for review or later protocol migration.

## Controlled versus open data

The registry controls a small, versioned set of protocol symbols:

- `world` describes semantic reality context: `real`, `fiction`, `tool`,
  `dream`, `belief`, or `metaphor`.
- `kind` describes the semantic content class, such as `simple_fact`,
  `preference`, `instruction`, `event`, or `uncertainty`.
- predicates, roles, term types, and modality values are protocol symbols.

The registry is not a domain ontology. Names of people, projects, documents,
resources, arbitrary concepts, and other instance identifiers remain open and
are preserved as data. `production` and `staging`, for example, are not worlds;
they are distinct instance/environment values. `privacy`, `security`, and
`operations` are not worlds either and must remain routing, policy, or domain
metadata when a caller has such metadata.

Aliases are explicit protocol decisions. A lexical alias may map to one
canonical symbol only where the meaning is justified. Structural aliases such
as `keep_private` expand to `keep` plus `visibility=private`. The normalizer
rejects collisions and does not alias role swaps (`subject`/`agent`,
`object`/`theme`) or environment and access distinctions.

## Identity fields

The `lfp:2.0` semantic identity projection includes protocol version, schema,
world, kind, clauses, nested control flow, references, predicates, roles, term
types, identifiers, values, negation, modality, and time. It excludes Sem
provenance and annotations because those describe evidence and policy rather
than the proposition itself. This does not weaken safety checks: trusted
promotion still requires independent verification and policy eligibility.

OpenLunum keeps three distinct representations:

- `surfaceFingerprint` (`lsf:*`) for normalized source-text identity;
- legacy `fingerprint` (`lfp:0.1`) for compatibility and migration;
- `semanticFingerprint` (`lfp:2.0`) for validated protocol-canonical identity.

Near-semantic fingerprints are similarity features, not semantic identity.
They apply hard gates to schema/world/kind, control flow, critical literals,
actor authority, and critical role/term shapes before scoring softer features.

## Compatibility and migration

Existing `lfp:0.1` output is not reinterpreted. New identity output is
versioned as `lfp:2.0`; migration code can compare or backfill it explicitly.
The active transport schema remains `lunum-sem/0.1-draft`. Frozen historical
schemas are not silently rewritten. Evaluation startup validates every gold
Sem against the exact transport schema sent to the model.
