# A0: why English sentences get no record (R4 abstentions): results

**Run 2026-10-22. Offline: no model was called. Self-reviewed.** Milestone A0 of the [language-pairs plan](../../docs/PLAN-rust-engine-language-pairs.md). A diagnostic, so no bar was pre-registered.

**Input.** The R4 extraction run ([`roundtrip-en-v1`](../roundtrip-en-v1/RESULTS.md); raw ledgers in [`reports/independent-evaluation/2026-10-17-rt1-sonnet/`](../../reports/independent-evaluation/2026-10-17-rt1-sonnet/)): `claude-sonnet-5-5`, contract `lunum-agent/0.19`, 200 Tatoeba English sentences. 49 were covered; **151 were not**: 122 abstains (one of them the invalid `rt1-82c61fa5322209c0`) and 29 sentence copies.

**Method.** [`classify.mjs`](classify.mjs), output [`classification.json`](classification.json) (one row per uncovered item with its sentence, declared reason, every submission attempt and its diagnostics). The ledgers keep every tool call, but no free-text reasoning: an abstention carries only `unsupported`, `unresolved` or `ambiguous`. So the causes below come from three sources: (1) what the extractor tried and what core said; (2) a counterfactual replay of those attempts through today's `submitCandidate`, with one mechanical repair; (3) deterministic surface rules on the sentence. Reproduce with `pnpm --filter @corpunum/lunum build && node experiments/abstention-shapes-v1/classify.mjs`.

## What the extractor did

| Of the 122 abstains | Count |
|---|---|
| Declared `unsupported` / `unresolved` / `ambiguous` | 75 / 45 / 2 |
| Read the contract and abstained without submitting anything | **81** |
| Submitted, was refused, then abstained | 41 (27 after one attempt, 14 after two) |
| ... last refusal: `assert.action` written as a bare string (`"action": "listened_to"`), which core reads as an unregistered predicate symbol (`protocol_noncanonical`) | **39** |
| ... last refusal: `unbound_source_content` | 2 |

**The 29 sentence copies are all questions,** all parsed as `topic` whose subject is the whole question. The contract tells the extractor to do exactly that (a `topic` is "a question that only poses itself"), so under contract 0.19 a question can only be a copy or an abstain.

## The counterfactual replay

Each refused attempt with a string `action` was re-submitted with that action as a text term (`{"type":"text","value":"listened to"}`, underscores to spaces), nothing else changed.

| | Count |
|---|---|
| Abstains with at least one string-`action` attempt | 40 |
| ... that get an `lfp:2.1` identity that is not a sentence copy after the repair | **37** |
| ... still refused (`unbound_source_content`: the extractor lemmatised `eats` → `eat`, `came` → `come`, or dropped `going`) | 3 |

The 37 repaired records were not judged for meaning; they show what core would accept, not that the parse is right. The same mistake is the commonest refused attempt in both ADR 0027 gate runs on the same contract: 33 of 137 abstains (idg1) and 41 of 139 (idg2) end on it.

## One primary cause per uncovered item

First matching rule wins, in this order (rules in `primaryCause()`):

| Primary cause | Items | Fixable how |
|---|---|---|
| First- or second-person subject (`I`, `you`, `we`) | **42** | see below |
| `assert.action` as a bare string; identity once written as a text term | **37** | builder or contract (below) |
| Question parsed as a `topic` label (sentence copy) | **29** | a question form of the general frames (below) |
| Third-person pronoun as a whole argument (`he`, `she`, `they`, `him`, `them`, `it`) | **25** | needs anaphora or a deixis term; not cheap |
| Question, abstained | 4 | as the questions above |
| Other: imperative 4, multi-clause 4, existential "there is" 2, modal 2, complement 1, simple 1 | 14 | case by case |
| **Total** | **151** | |

Surface features of the 122 abstains (several per sentence): first/second-person subject 55 (47 of them among the 81 that never submitted), third-person pronoun 30, negation 34, modal or future 27, multi-clause 15, question 4. For comparison, only **3 of the 49 covered** sentences have a first/second-person subject (`I think Tom is fair.`, `I want to live in the city.`, `I have a cat.`), and all three use `I` as a plain filler, which core accepts: the pronoun rule refuses only third-person and demonstrative pronouns.

## The top fixable causes

1. **String `action` on `assert` (37 items, 18.5% of the set).** The frame prompt says the action is "the verb phrase as written", but the builder accepts a string there and core then reads it as a predicate symbol; the diagnostic ("predicate 'listened_to' is not registered") does not say how to fix it, and Sonnet abstains after one or two tries. Two fixes, either enough: the builder writes a string `action` on a general frame as a text term, or the refusal names the fix. Neither changes an existing identity (a string action never received one), but both are contract changes under [ADR 0025](../../decisions/0025-contract-freeze-pending-held-out-evidence.md). **With this alone, R4 coverage would have been 86 / 200 = 43%,** above A3's 40% bar, if the repaired parses are right.
2. **Questions (33 items).** Give the general frames a question form (`kind` carries interrogative mood; the clause holds the question's words), and let `topic` keep only headings and labels. This also removes the commonest sentence copies.
3. **First/second-person subjects (42 items).** Core already accepts `I`, `you`, `we` as fillers; the extractor seems to avoid them because the contract says to "never fill [an agent] with you, the reader, the user", which was written for operational frames. This is a reading of the evidence, not a measurement: there is no free text to confirm it. A one-line contract clarification (a pronoun of the speaker or addressee, as written, is a valid filler of a general frame), or the deixis rule of [ADR 0028](../../decisions/0028-language-neutral-concept-layer.md), would test it. It matters twice for the English pivot: Greek is pro-drop, so English produced from Greek will start with `I`, `you` and `we` more often than Tatoeba English does.
4. **Third-person pronouns (25).** Not cheap: a lone `he` names nobody without context. Leave as abstain.

Causes 1 and 2 are mechanical and A3 can pre-register them as contract 0.21. Cause 3 needs a model run to confirm.

## Limits

- One extractor and one run. The causes are what this run did, not what any extractor would do.
- Shapes are surface rules (regular expressions) and misfire on some sentences (`before` and `after` as prepositions, progressive `is teaching`); the per-item rows in `classification.json` show each assignment.
- The replay measures acceptance only. Meaning of the 37 repaired records is unjudged.
