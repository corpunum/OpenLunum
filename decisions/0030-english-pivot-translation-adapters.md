# ADR 0030: English as the pivot, with translation adapters at the edges

**Status: Accepted 2026-10-22 by the owner (a change of strategy agreed with the orchestrating session); design, with the deterministic guards implemented in [`packages/eval/src/pivot-adapter.ts`](../packages/eval/src/pivot-adapter.ts). No contract change, no identity version.** It refines [ADR 0004](0004-language-neutral-sem-english-pivot-renderer.md), supersedes the cross-language half of [ADR 0028](0028-language-neutral-concept-layer.md) for the critical path, and parks [ADR 0029](0029-greek-source-bound-frames.md) as optional research. Self-reviewed.

## Context

The plan of 2026-10-22 (first version) had three stages: English round trip, then a native Greek pipeline (Greek source-bound lists, a Greek realizer), then English ↔ Greek through a mined lexicon and a concept layer. The evidence for the native route is thin and expensive:

| Finding | Source |
|---|---|
| Greek coverage under the frozen contract: 0 / 50 (Sonnet), 0–1 / 16 (three extractors) | [Greek-frames baseline](../experiments/greek-frames-heldout-v1/RESULTS-baseline.md), [Stage 0](../experiments/parallel-document-v1/RESULTS-stage0.md) |
| English and its human Greek translation get the same identity in 0 of 5 pairs; structure agrees in 3 of 5, both misses pro-drop | [clc-v1](../experiments/cross-language-convergence-v1/RESULTS.md) |
| A mined EN → EL word lexicon reached top-5 0.50 against wordnet, failing both bars; wordnet lookups fail on polysemy 81 of 100 times | [OMW round trip](../experiments/pivot-paraphrase-v1/omw-roundtrip/RESULTS.md), ADR 0028 |
| Each new language would need its own closed-class lists, deixis rules, realizer and judge calibration | ADR 0029 |

Meanwhile every model the project uses translates Greek ↔ English well, and English is the only language the source-bound check, the frames and the Rust renderer support.

## Decision

1. **Lunum and the Rust engine deal only with English.** Extraction, the source-bound check, identity and rendering stay English-only. ADR 0024 rule 6 (non-English general frames fail closed) stays.
2. **Other languages connect through a translation adapter at the edges.** In: source text → a model translates it to English under a strict prompt and returns *meaning flags* → deterministic guards → extraction and identity on the English. Out: the record → the deterministic English writer (plan milestone A2) → a model translates the English into the target language, using the stored flags.
3. **What a record stores.** The language-neutral record (Sem and its identity), the meaning flags, and, as optional provenance, the source text, its language and the translations with the translators' model ids. **English text is not the stored meaning**: the English is a working form between two deterministic steps, kept only as provenance.
4. **The translation prompt is strict** ([`pivot-adapter.ts`](../packages/eval/src/pivot-adapter.ts), `PIVOT_PROMPT_VERSION`): keep every number, date, name and identifier exactly; never change negation or modality (may/must/can/will); do not resolve ambiguity silently. It returns the meaning English cannot carry:

   | Flag | Values | Why |
   |---|---|---|
   | `aspect` | perfective, imperfective, unmarked | Greek aspect («έφαγα» / «έτρωγα») collapses to English simple past |
   | `formality` | formal (V), informal (T), unmarked | «εσείς» of politeness and «εσύ» both become "you" |
   | `addresseeNumber` | singular, plural, unmarked | "you" drops number |
   | `gender` | list of {English referent words, masculine / feminine / neuter} | «φίλη» vs «φίλος» both become "friend" |
   | `evidentiality` | direct, reported, inferred, unmarked | hearsay and inference markers often vanish |
   | `droppedSubject` | true / false | the translator supplied a subject that Greek left in the verb ending (pro-drop) |
   | `literals` | list of {source span, English form, kind} | the translator's own map of numbers, dates, names, identifiers |
   | `ambiguous` + `ambiguityNote` | true / false, text | the source has two readings the translation had to choose between |

   The JSON schema is `MEANING_FLAGS_JSON_SCHEMA` in the same file.
5. **Guards, all deterministic, all fail closed (abstain):**
   - **Literal carry-through.** Every number (digits and number words), date, relative time and identifier found in the source by core's literal-retention functions ([ADR 0016](0016-source-literal-retention-gate.md), [0019](0019-month-name-date-retention.md), [0020](0020-number-words-and-relative-times.md), which already read English and Greek) must be found in the English; every Latin-script word of a non-English source must appear verbatim; every literal the translator declares must appear in the English in its declared form.
   - **Negation and modality.** A clitic negator in the source («δεν», «δε», «μην», «μη», «όχι», «ούτε») if and only if a negator in the English; necessity («πρέπει») and possibility («μπορ-», «ίσως») markers in both directions; future/conditional «θα» requires will / would / shall / going to / 'll / 'd.
   - **Ambiguity.** `ambiguous: true` → abstain.
   - **Dual-translator agreement.** Two translators from different model families (local Qwen on Halogen for bulk; Sonnet or Sol second) translate independently. An identity is accepted only if both translations pass the guards and **land on the same identity**. Extraction is memoised per exact English string, so two identical translations share one extraction.
6. **No parallel lexicon is needed to run the adapter.** A small held-out test set (Tatoeba EN–EL pairs) is needed to *measure* it; see plan stage P.

## What this changes in earlier ADRs

- **ADR 0004** said the English pivot renderer is "a measured representation profile, not canonical meaning". That stays true: the Sem is the meaning; English is now also the working language of extraction for every input language.
- **ADR 0028** §1–5 (a concept layer so `police` and «αστυνομία» hash alike) is no longer on the critical path: through the pivot both become the English word chosen by the translators, and dual agreement checks that choice. The concept layer remains a possible later step for English synonymy; §6 (pro-drop) is handled by the translator supplying the subject and setting `droppedSubject`.
- **ADR 0029** (Greek source-bound lists, Greek deixis) is **parked** as optional research. Its pre-registration and baseline stay valid if anyone runs it.

## Costs and limits

- **The translator is now part of the evidence chain.** A wrong translation that keeps every literal and every negation passes the guards. Dual agreement makes a shared mistake less likely but not impossible, since both models learned from overlapping data (Tatoeba itself is probably in their training data).
- **Extraction is not deterministic.** Two different English strings from the same Greek sentence get the same identity only as often as the extractor is stable; the same English sentence extracted twice gave the same `lfp:2.1` identity in 9 of 22 pairs ([ADR 0027 gate v2](../experiments/identity-heldout-v2/RESULTS.md)). Dual agreement therefore costs coverage, and P1/P2 measure how much.
- **Two model calls per sentence per direction**, plus extraction. Translation calls are short.
- **Meaning flags are self-reported** by a model. They are carried, not verified, except that the two translators' flags can be compared (reported, not gated).
- **Names across scripts** («Τομ» → "Tom") are checked only through the translator's declared literals and agreement between the two translators; there is no transliteration table.
- The guards' Greek word lists are AI-drafted and conservative: a mismatch abstains, so their errors cost coverage, not safety.

## Evidence

- Unit tests: [`packages/eval/test/pivot-adapter.test.ts`](../packages/eval/test/pivot-adapter.test.ts).
- Measurement plan and bars: stage P of the [plan](../docs/PLAN-rust-engine-language-pairs.md); pre-registration of P1/P2/P4 in [`experiments/pivot-el-en-v1/PREREGISTRATION.md`](../experiments/pivot-el-en-v1/PREREGISTRATION.md).
