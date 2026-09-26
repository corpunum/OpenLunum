# Probes v4: synonyms that are not in the alias list

Frozen 2026-09-26, before contract `lunum-agent/0.9` and before any run against it. The contract-0.8 runs showed the extractor treating the published verb-alias list as exhaustive: it refused "activate" because it was not listed, although `enable` clearly fits.

14 sentences (9 English, 5 Greek), scored by outcome only:
- **Clear synonyms deliberately absent from the alias table** (switch on, shut off, purge, alter, kick off, and the Greek "θέτει σε λειτουργία"), as clause predicates and as `allow` actions: expected `parse`.
  - Passing them tests the contract's general mapping rule, not a table lookup. None of these verbs will be added to the alias table while this probe set is in use.
- **Controls** with no clear registered predicate (juggle, paint), and sentences missing a required argument: expected `abstain`.

**Caveats:** "purge"→`delete` and "kick off"→`run` are the author's judgment. The same agent wrote this set and the contract change, and the Greek has not been reviewed by a human.
