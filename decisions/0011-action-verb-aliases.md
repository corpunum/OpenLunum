# ADR 0011 — Verb aliases for the `action` role

**Status:** Implemented 2026-09-26. Self-reviewed vocabulary choice, reversible. `lunum-protocol/0.3`, contract `lunum-agent/0.8`. `lfp:2.1` is unchanged.

## Context

After decisions/0008, `action` accepted only registered predicate identifiers. In three repetitions the extractor refused 9 of 12 verb-only permissions ("Lena allows Tomas to edit.", "Omar allows Priya to view."): it would not map edit→`update` or view→`read` on its own. Refusing is safe but loses meaning.

## Decision

- The existing predicate alias table gains common verbs that are clear near-synonyms of registered predicates:

  | Registered predicate | Aliases |
  |---|---|
  | `read` | view, see, inspect, browse |
  | `update` | edit, modify, change, amend |
  | `delete` | remove, erase |
  | `run` | execute, launch |
  | `notify` | inform, alert |
  | `store` | save |
  | `authenticate` | log in, login, sign in |

- `action` values go through predicate alias normalization, in core and in the builder. The builder schema lists the aliases, so the extractor can name the verb it sees. Canonical Sem stores the registered predicate, so "edit", "modify" and the Greek `τροποποιήσει` (if the extractor names any alias) converge on one identity.
- **Deliberately absent:** download, upload and open. Each has more than one plausible predicate, so those sentences keep abstaining.

## Evidence

- Fingerprinting the repository with the frame-0.3 build and the alias build gives 2,464 identities byte-identical; none changed, gained or lost.
- Golden test: `edit`, `modify` and `Change` produce the same identity as `update`; `download` gets none.
- **Contamination:** view, see and edit are the verbs that motivated this decision, so probes v1/v2 are in-sample for them. Probes v3 were frozen before the table was written, but by the same author.
