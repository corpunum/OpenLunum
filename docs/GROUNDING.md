# Open-concept grounding (experimental)

OpenLunum cannot prove that two unseen lexicalizations name the same open
concept from their strings alone. `blue_folder` and `folder_blue` may be
different spellings of one concept, while `production` and `staging` must stay
different. The safe architecture therefore separates:

```text
source evidence
  -> candidate Sem
  -> structured grounding proposal
  -> optional, versioned external resolution
  -> canonical Sem identity or explicit deferral
```

`packages/core/src/grounding.ts` implements the first two layers. A grounding
proposal has a precise clause-role path and a typed compositional structure:

```json
{
  "path": "clauses[0].roles.theme",
  "termType": "concept",
  "head": { "kind": "symbol", "namespace": "open-concept", "key": "folder" },
  "modifiers": [
    {
      "relation": { "kind": "symbol", "namespace": "open-concept-relation", "key": "color" },
      "value": { "kind": "symbol", "namespace": "controlled-value", "key": "blue" }
    }
  ],
  "surface": "blue folder",
  "language": "en"
}
```

The path, term type, head, and typed modifiers are canonicalized
deterministically. Modifier ordering does not matter; role or clause ordering
does. Surface and language are evidence only. A `gnd:` fingerprint identifies
the proposal structure for comparison, but is not an `lfp:2.1` semantic
identity.

`submitCandidateWithGrounding()` deliberately returns `grounding_pending` and
removes candidate identity availability. An agent proposal is an untrusted
hypothesis, even when two agents agree. This prevents a plausible generated
key from silently becoming durable semantic identity.

Future resource adapters may resolve a proposal to an immutable,
namespace-qualified identifier. Such an adapter must be pinned to a named
registry version and snapshot hash, return `ambiguous` or `unresolved` rather
than guess, and preserve its evidence outside the LFP projection. Only an
explicitly verified resolution may be materialized into the existing Sem `id`
or `ref` field and then pass the existing `lfp:2.1` gates. This document does
not make any external resource mandatory and does not change `lfp:2.1`.

Safe development metrics include head/modifier accuracy, grounding proposal
convergence, accepted resolution coverage, full semantic exactness, and
critical-negative false equivalence. Unresolved concepts remain useful source
evidence but are not exact-identity records.
