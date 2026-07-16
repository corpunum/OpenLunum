# Architecture

## Layer 1 — source evidence

Products retain original text, source language, timestamps, authorship, permissions, and references. Lunum never becomes an excuse to discard evidence.

## Layer 2 — Lunum-Sem

A versioned semantic record representing worlds, kinds, clauses, predicates, roles, negation, modality, time, conditions, references, provenance, and confidence.

Semantic parsers may be model-assisted or deterministic, but their output is not trusted until validated. Low-confidence parses remain ineligible for compact serving.

## Layer 3 — canonicalization and Lunum-FP

Canonicalization normalizes schema-defined identifiers, ordering, Unicode, default values, and serialization. Fingerprints are generated from canonical semantics and namespaced by version:

```text
lfp:0.1:sha256:<digest>
```

A hash of surface text or telegraph code is not a semantic fingerprint and must be labeled accordingly.

## Layer 4 — Lunum-Code renderers

Renderers convert canonical semantics to model-facing text. They are profile-specific:

```text
generic-en-pivot/0.1
safe/<model-profile>/<tokenizer-version>
short/<model-profile>/<tokenizer-version>
tight/<model-profile>/<tokenizer-version>
```

Profiles record exact tokenizer counts, model comprehension tests, prompt scaffolding, and known failures.

## Layer 5 — policy and context compilation

Products or shared policies classify records by confidence, risk, category, exactness, and task. The context compiler chooses natural, Lunum, mixed, or shadow-mixed representations.

## Layer 6 — product adapter

Adapters map product data structures and lifecycle hooks to Lunum APIs. Adapters own field names, migrations, telemetry wiring, and product-specific feature flags.

## Dependency rule

```text
product → adapter → @corpunum/lunum
```

Never:

```text
@corpunum/lunum → product internals
```

## Parsing and realization

Parsing and realization are separate model-profile operations:

```text
source language -> parser profile -> Lunum-Sem
Lunum-Sem -> realizer profile -> target language
```

The same semantic record may have many model renderings and many human-language realizations. Neither changes semantic identity.
