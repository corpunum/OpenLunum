# ADR 0011 — Verb aliases for the `action` role

**Status:** Implemented 2026-09-26, amended the same day (protocol 0.4, contract `lunum-agent/0.9`). Self-reviewed vocabulary choice, reversible. `lfp:2.1` is unchanged.

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

## Amendment 1: aliases are not exhaustive (contract `lunum-agent/0.9`, protocol 0.4)

With the table published, the extractor treated it as the complete list of allowed verbs. In all three contract-0.8 repetitions it refused V8 "…System S-22 is permitted to **activate** F-22…" because "activate" had no listed alias ("dropping it … would misrepresent the sentence"). Before the table existed, it mapped activate→`enable` on its own.

- The contract adds: "Predicate aliases are accepted spellings, not an exhaustive list: when a verb clearly means a registered predicate (e.g. activate -> enable), use that predicate; abstain only when no registered predicate has the same meaning."
- The table adds activate/turn on → `enable` and deactivate/turn off → `disable`. "activate" is a V8 verb, so V8 is in-sample for this change.
- **Probes v4** were frozen before this change, using clear synonyms deliberately kept out of the table (switch on, shut off, purge, alter, kick off). They test the general rule rather than a table lookup.
- Fingerprinting the repository with the previous and new builds gives 3,192 identities byte-identical; none changed, gained or lost.
