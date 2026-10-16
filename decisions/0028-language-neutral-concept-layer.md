# ADR 0028: A language-neutral concept layer, and a pro-drop agent rule (proposed, design only)

**Status: Proposed 2026-10-16. Design only: no code, no contract change, no identity version.** Under [ADR 0025](0025-contract-freeze-pending-held-out-evidence.md) any implementation needs a pre-registered held-out test first. It needs the owner's review of the Greek parts. Self-reviewed.

## Context

The owner's direction: Lunum must preserve **meaning, not words**. «κάλεσε / πήρε / τηλεφώνησε στην αστυνομία / πήρε το 100» can all be one meaning, and a professional translation holds meaning fixed across languages.

What the evidence says today:

| Finding | Source |
|---|---|
| English and its human Greek translation get the same `lfp:2.1` identity in **0 of 5** pairs. Open terms keep their language, so `police` and `αστυνομία` hash differently. | [clc-v1](../experiments/cross-language-convergence-v1/RESULTS.md) |
| Ignoring the words, the **structure** agrees **3 of 5** across languages. Both misses are Greek **pro-drop**: the subject sits in the verb ending, so the extractor drops the agent. | same, post-hoc |
| A real OMW/CILI lookup of English and Greek lemmas converged for **1 of 20** EN–EL pairs (19 of 100 over five languages). 81 of 100 failed on **ambiguity** (several senses for one lemma), not on missing data. The Greek wordnet has 23,853 records against 186,642 for English. | [real OMW grounding summary](../reports/experiments/codex-agent-development-20260906/real-omw-grounding-summary.json) |
| Existing provider interface: exact lemma lookup, `resolved_exact` / `ambiguous` / `unresolved`; polysemy is ambiguous; a singleton intersection is `candidate_narrowed`, never exact. | [GROUNDING_PROVIDERS.md](../docs/GROUNDING_PROVIDERS.md) |
| On the owner's real agent memory: 0 identities on 21,291 units. | [ADR 0026](0026-working-scope-checkable-memory.md) |

The last row matters for priority: **a concept layer fixes the filler words of sentences that already get an identity. It does nothing for the units that get none.** It serves the "same meaning in two languages" claim, not the checkable-memory scope.

## Proposal

### 1. Three states for every filler

| State | Meaning | Identity |
|---|---|---|
| **grounded** | resolved to a concept ID by a pinned provider, in the sense the source uses | the concept ID is hashed, not the word |
| **narrowed / ambiguous** | candidates exist, no single verified sense | source-bound, as today; marked so |
| **source-bound** | names, code, free text, literals, anything without a concept | the words are hashed, as today |

Source-bound fillers are never described as language-neutral. A grounded filler keeps its surface form and language in the record for display and rollback; only the identity changes.

### 2. Four sources of concepts, in order of trust

1. **Closed Lunum vocabulary** (predicates, role names, kinds): already language-neutral. `call`, `phone`, «κάλεσε», «τηλεφώνησε» map to one predicate (`notify`) here, not in the concept layer.
2. **Open Multilingual Wordnet / CILI** snapshot (the existing provider): common nouns, verbs, adjectives. Pinned release and hash; per-resource licence review before any redistribution.
3. **Wikidata** items from a pinned dump: institutions, kinds of organisation, places, roles. Labels and aliases are candidate generation only, never evidence.
4. **An owner-reviewed Lunum concept table**: a small curated list of the concepts that agent traffic actually uses, each with EN and EL labels, the reviewer, the date and a relation to sources 2 and 3. **Greek entries are reviewed by the owner**; AI-drafted entries are marked as drafts until then. This is the table that covers what the wordnets get wrong or lack in Greek.

### 3. Who picks the sense: the extractor, from candidates, verified by core

The wordnet result shows lemma lookup cannot choose a sense. Context can. Therefore:

- A tool returns the candidate concept IDs, with glosses, for a surface form and language (this is the existing provider, exposed to the extractor).
- The model **picks one from the list**, or none.
- Core verifies the pick is in the list for that surface form and language. A made-up or off-list ID is rejected, as a made-up grounding is today.
- No embedding similarity, no fuzzy label match and no majority vote decides an identity ([GROUNDING_PROVIDERS.md](../docs/GROUNDING_PROVIDERS.md) already forbids these).

Two runs can still pick different senses. That is measured, not assumed away: stability of the concept pick is a pre-registered quantity.

### 4. Equivalence is a relation, and only `same` merges

The concept table records relations between concepts: `same`, `broader`, `implies`. Identity merges only on `same`.

- «την αστυνομία», "the police", «το αστυνομικό τμήμα» (the station) are **not** automatically one thing: department, force and building are different concepts. The owner table decides which are `same` for the contract's purposes.
- «πήρε το 100» ("dialled 100", the Greek emergency police number) is at best `implies` the police were notified. It is **not** `same` as «κάλεσε την αστυνομία» by the ADR's own rule, and it is where the level (b) judge (a bilingual model from another vendor, validated against the owner) takes over from identity. This ADR does not pretend identity can reach it.

### 5. A new fingerprint version

A grounded filler changes what is hashed, so this is a new identity version (working name `lfp:3.0`), after the [ADR 0027](0027-identity-projection-candidate.md) projection (`lfp:2.2`) if that passes its gate. `lfp:2.1` and `lfp:2.2` are never rewritten. Required: goldens, a migration note and a replay of every recorded identity. Snapshots are pinned and recorded in the identity's provenance; a provider upgrade never rewrites an old identity.

### 6. Greek pro-drop rule: a subject carried by the verb ending is still the agent

- In pro-drop languages (Greek first; Spanish, Italian and Portuguese later), a finite verb with no written subject has an **implicit subject** fixed by its person and number: 1st singular → the speaker, 2nd → the addressee, 1st plural → the speaker and others. 3rd person → a referent that must be resolved from context or marked unresolved, but **present**.
- The same representation is used on the English side: "I" and «(εγώ)» both become the speaker referent, not `I` in one language and `speaker` in the other (the C30 and C37 difference in clc-v1).
- The imperative has an implicit addressee agent in every language ("Call the police.", «Κάλεσε την αστυνομία»).
- **Enforcement is mechanical where possible:** a validator checks that a finite Greek clause whose predicate requires an agent has an agent consistent with the verb's person and number, using the UD/UniMorph morphology tooling already used in the 2026-09-06 development reports. A missing or inconsistent agent is refused, not silently filled.
- Caveat: Greek homography (imperative against aorist, the owner's own review) means the analysis can be ambiguous; an ambiguous analysis is reported as ambiguous.

### 7. Not covered here

- **A filler that is a whole clause** ("theme": "talk to a lawyer", «μιλήσω σε δικηγόρο») cannot be a concept. It needs nested clauses, which is a contract question. It stays in clc-v1's cross-language misses until that is fixed.
- Names, code identifiers, quoted text and literals stay source-bound.

## How it will be evaluated (to be pre-registered, none of it run)

Every result states its level: (a) structure, (b) same meaning judged, (c) exact identity.

1. **Free, offline, first:**
   - *Concept coverage and convergence:* take the filler strings recorded in clc-v1 and the Europarl passages (parallel-document-v1) and report, per language, the share that resolve to a candidate set, to a single sense, and the EN/EL agreement. This is the OMW 1/20 experiment repeated with the owner table; the existing result is the baseline to beat.
   - *Pro-drop:* replay the morphology rule on the recorded Greek candidates and report how many dropped agents it would have required. Not a model test.
2. **Live, after the owner table exists:** the [parallel-document-v1](../experiments/parallel-document-v1/PLAN.md) measures, extended with the concept pick, at levels (a) and (b), and level (c) only for grounded fillers.
3. **Bars and the held-out set are fixed before the change is written** (ADR 0025).

## Risks

- **Coverage:** the OMW baseline is low and Greek is thinner than English. The owner table fixes the concepts that matter, at the cost of owner time. Its size must be bounded (a few hundred agent-domain concepts first), not a language.
- **Granularity:** wordnet senses are very fine; Wikidata items are coarse and uneven. Too fine a sense splits meaning; too coarse a merge hides it. Only `same` merges.
- **False merges** are the costly failure. The conservative direction of today's identity ("when it fails, it fails apart") must be kept; adversarial and contrast suites must be extended with cross-language hard negatives.
- **Cost of review:** every Greek entry needs the owner. Without that review there is no Greek concept layer, only a drafted one.
- **Scope:** a concept layer serves a claim ([ADR 0026](0026-working-scope-checkable-memory.md) scoped it out for now). It should not displace work on the owner's real memory.

## What the owner decides

1. Accept the direction, or hold it until the cross-language claim is again the working scope.
2. The sources and their order (section 2), and whether Wikidata is allowed as a source.
3. How Greek entries are reviewed (a worksheet like the earlier ones), and the size of the first table.
4. Whether the pro-drop rule goes first on its own, since it is free to measure and addresses both structural misses.
