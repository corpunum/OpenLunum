# Lunum-I language scope

Lunum-I is a semantic intermediate representation plus a family of model-facing renderings.

## Worlds

| Marker | Semantic world |
|---|---|
| `R` | real/factual |
| `F` | fiction/story |
| `T` | tool, system, or agent operation |
| `D` | dream |
| `B` | belief or perception |
| `M` | metaphor or symbolic world |

## Core semantic features

- predicate and typed roles;
- negation;
- questions;
- conditions and consequences;
- nested propositions;
- modality and obligation;
- time and ordering;
- references and provenance;
- confidence and uncertainty;
- multiple worlds without conflation.

## Reference rendering

The generic renderer favors ordinary tokens, predicate-first order, explicit negation, and restrained punctuation:

```text
R prefer user concise_answers
T error api 500 after deploy ; fix route_bug
R if river rise then leave mira bridge ; call mira theo
```

These strings are renderings, not canonical meaning. Another renderer may spell them differently while preserving the same Lunum-Sem and Lunum-FP.

## Unsupported claim

OpenLunum does not currently provide a production-grade universal natural-language-to-Lunum parser. The included text derivation path is an explicitly labeled surface heuristic for compatibility and experimentation.
