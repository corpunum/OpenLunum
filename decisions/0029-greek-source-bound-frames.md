# ADR 0029: Greek source-bound general frames, with deixis for pro-drop (proposed)

**Status: Proposed 2026-10-17. Design; no code yet. Renumbered to package v26 on 2026-10-17 (greek-frames amendment 2).** It implements part of [ADR 0028](0028-language-neutral-concept-layer.md) (§6 pro-drop, and the Greek half of "language-neutral"), which the owner approved on 2026-10-17 ("do what is better", relayed by the orchestrating session corpunum-6b). It is a contract change, so it follows [ADR 0025](0025-contract-freeze-pending-held-out-evidence.md): a held-out pre-registration and a baseline live run come **before** the change is written. Self-reviewed.

## Problem

Greek sentences get no Lunum record from the general frames, whatever the model:
- Stage 0 of parallel-document-v1: Sol 6.1 medium covered **11 of 16 English and 0 of 16 Greek** sentences, all Greek abstaining as "unsupported" ([results](../experiments/parallel-document-v1/RESULTS-stage0.md)).
- The cause is one line: [`source-bound.ts`](../packages/core/src/source-bound.ts) returns `language_unsupported` for any non-English source using a general frame ([ADR 0024](0024-general-source-bound-frames.md), rule 6).
- The source-bound check that keeps open slots honest depends on English closed-class word lists: articles, copulas, `do`, ten prepositions, `and`, negation and modal words, pronouns, contractions and topic markers.

Separately, Greek is pro-drop: «Θα καλέσω την αστυνομία» has no word for "I". A source-bound filler cannot name the speaker, so the agent is dropped and the English and Greek records disagree ([pro-drop replay](../experiments/prodrop-replay-v1/README.md): 3 of 9 Greek records, all first person).

## Decision (proposed)

### 1. A Greek closed class for the source-bound check

The same rules as ADR 0024, with Greek lists. Language is chosen by `sourceLanguage` (`el`), never guessed. Words are folded as elsewhere in core: lower case, accents off, final sigma.

| Class | English today | Greek (proposed) |
|---|---|---|
| Articles (free) | a, an, the | ο, η, το, οι, τα, του, της, των, τον, την, τη, τους, τις |
| Copulas (free) | is, are, was, were, be, been, being, am | είμαι, είσαι, είναι, είμαστε, είστε, είσαστε, ήμουν(α), ήσουν(α), ήταν, ήμασταν, ήσασταν |
| Particles (free) | do, does, did; "to" via prepositions | να (subjunctive particle, like "to") |
| Prepositions (free) | of, in, on, at, by, for, from, to, with, as | σε and its contractions (στο, στη, στην, στον, στα, στους, στις, στου, στης), από, με, για, ως |
| Conjunction (free) | and | και |
| Negation (free if negated) | not, no, never, n't … | δεν, δε, μην, μη, όχι |
| Modal (free if modality) | will, would, can, must, should … | θα, πρέπει, μπορεί, μπορώ (and its persons) |
| Pronoun-only fillers (refused) | it, this, they … | αυτός, αυτή, αυτό, αυτοί, αυτές, αυτά (and their cases), εκείνος …, του/της/το/τον/την as **clitics** |
| Elision | n't, 'll, 'd … | μ' (με / μου), σ' (σε / σου), τ' (το / του): expanded before the check |

**Known ambiguity, accepted and stated:** «τον, την, το, του, της, τους, τις» are articles and object clitics. They stay free words, so a dropped clitic object («τον είδα») is not caught by the word-coverage rule. The frame's required roles still catch a missing object where a frame requires one.

### 2. Deixis: speaker and addressee as referents, in both languages

- A new convention: an agent, experiencer or subject that is the **speaker** or the **addressee** is written as a deictic referent: `{ "type": "actor", "id": "speaker" }`, `"speakers"` (we), `"addressee"`, or `"addressees"` (plural you). This applies **in both languages**, so English "I will call the police" and Greek «Θα καλέσω την αστυνομία» build the same record.
- **Source binding for deixis.** A deictic referent is exempt from rule 1 (filler words occur in the source) only when the source licenses it:
  - English: the source contains the matching pronoun (I, me, my → speaker; we → speakers; you → addressee(s)), which then counts as covered.
  - Greek: the pronoun («εγώ», «εμείς», «εσύ», «εσείς»), **or** a finite verb in the source carries the matching person. The person is read from a small, closed table of Greek person endings in core (1st singular -ω/-ώ/-ομαι/-ούμαι/-άμαι, -α and -ηκα only in a past-tense verb already covered by a filler; 1st plural -ουμε/-ούμε/-αμε/-όμαστε; 2nd singular -εις/-είς/-ες/-ησες; 2nd plural -ετε/-είτε/-ατε/-όσαστε), applied only to words covered by an `action` or predicate-bearing filler. Third person never licenses a deictic referent.
  - The imperative convention is unchanged: an imperative leaves `agent` out in both languages.
- Without that licence, a deictic referent is refused (failure class `unbound_deixis`), as a made-up identifier is today.

### 3. Versions

- **Identity:** `lfp:2.1` unchanged. Existing records do not move; the Sem shapes are already valid, and only which candidates are accepted changes. A replay of every recorded candidate must show 0 identity movement for English.
- **Contract:** `lunum-agent/0.20`, instructions `0.10`, package **v26** (v24 and v25 were taken on 2026-10-17 by bug-fix refreezes with the same contract text: the `__proto__` fix, #723, and the renderer tie-break and prototype-lookup fix, #729): Greek allowed for general frames, the deixis convention, and Greek examples. Frames 0.8 and protocol 0.6 are unchanged (no new predicate or role).
- **English extraction changes too:** "I" becomes `speaker` when a new extractor follows the v26 instructions. New English records of first-person sentences therefore differ from old ones; old records keep their identities. This is stated in the migration note, and it is the price of cross-language convergence.

## Evidence plan (ADR 0025 order; to be pre-registered before any code)

1. **Held-out set, committed first:** a fresh seeded selection of professionally translated EN/EL sentence pairs (Europarl, a new seed, excluding every line already selected by parallel-document-v1), plus fresh Tatoeba Greek sentences never used in the repository, weighted towards first and second person.
2. **Baseline:** the extractor named in the [pre-registration](../experiments/greek-frames-heldout-v1/PREREGISTRATION.md) on that set under the frozen contract (package v25, contract 0.19). Greek coverage is expected near 0.
3. **The change, then the same run under package v26.** Bars, fixed in the pre-registration:
   - Greek coverage rises to at least half of English coverage on the same pairs;
   - level (a): on pairs where both sides are covered, structure agreement EN↔EL at least 60%, with pro-drop pairs reported separately;
   - level (b): a cross-vendor judge (not OpenAI, since the extractor is Sol: SuperGemma, validated on controls) finds the Greek record states the source's content on at least 80% of covered Greek sentences;
   - 0 new merges in the adversarial, collision and contrast suites; 0 identity movement on the English replay.
4. Only then are the Greek lists and deixis merged, with goldens and the migration note.

## Risks

- **Closed lists are heuristics,** in Greek as in English; the article/clitic overlap is the largest known gap.
- **Person endings are ambiguous** (-α in nouns and past verbs), which is why only words inside an `action`/predicate filler count.
- **Owner review of the Greek lists:** the owner delegated Greek judgements to models on 2026-10-17. The lists here are AI-drafted; a model-consensus review (as for the worksheet) is the minimum before merging, and the record says so.
- This does not make open fillers converge across languages («αστυνομία» vs "police"); that is the concept layer (ADR 0028 §1–5), a later step.
