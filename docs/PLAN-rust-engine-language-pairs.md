# Plan: language pairs on the Rust engine

**Drafted 2026-10-22 for the owner's review. Nothing in this plan has been run; no model was called to write it. Self-reviewed.** Every "today" number links to the file it comes from. Nothing here changes the freeze ([ADR 0025](../decisions/0025-contract-freeze-pending-held-out-evidence.md)): each contract or identity change still needs a pre-registration, a baseline run and a change run, in that order.

**The owner's order:**
1. **Stage A:** English → Lunum → English.
2. **Stage B:** Greek → Lunum → Greek.
3. **Stage C:** English → Lunum → Greek, and Greek → Lunum → English.

Each stage below gives what exists today, the gap, milestones with pre-registered bars, the data, who does what, the risks and an estimate. Stage B can start its free work while Stage A runs; Stage C needs A and B.

## The Rust engine today

The Rust track so far is R1 to R4, approved by the owner on 2026-10-17 ([R4 pre-registration](../experiments/roundtrip-en-v1/PREREGISTRATION.md)).

| Step | Crate | What it does | Evidence |
|---|---|---|---|
| R1 | [`crates/lunum-sem`](../crates/lunum-sem) | Schema and frame validation, then the `lfp:2.1` fingerprint, byte for byte as `packages/core` | 7,089 of 7,089 golden entries ([`lfp21-golden.json`](../eval-results/golden-vectors/lfp21-golden.json)) |
| R2 | [`crates/lunum-store`](../crates/lunum-store) | Append-only SQLite store keyed by identity; CLI `put` / `get` / `lang` / `stats` | crate tests |
| R3 | [`crates/lunum-render`](../crates/lunum-render) | Renders a record as `generic-en-pivot/0.2` code; stdin/stdout JSONL CLI | 10,522 of 10,522 golden entries ([`render-en-golden.json`](../eval-results/golden-vectors/render-en-golden.json)) |
| R4 | (experiment) | English round trip, rendered in Rust | **PASS** by its bars ([results](../experiments/roundtrip-en-v1/RESULTS.md)) |
| — | [`tools/pivot-miner`](../tools/pivot-miner) | Phrase translations and paraphrases mined from aligned corpora (Europarl, OpenSubtitles) | [exploration](../experiments/pivot-paraphrase-v1/EXPLORATION.md) |

**What the Rust engine cannot do yet:**
- It cannot decide acceptance on its own. The source-bound check ([`source-bound.ts`](../packages/core/src/source-bound.ts)), the literal-retention gate ([`literal-retention.ts`](../packages/core/src/literal-retention.ts)) and transport validation are TypeScript only.
- It cannot write sentences. `generic-en-pivot/0.2` writes a notation such as `R not assert(subject=tom, object=red meat, action=eat)`, not English. The template engine in [`packages/eval/src/realization.ts`](../packages/eval/src/realization.ts) is a prototype: its predicates (`greeting`, `statement` and so on) are not the protocol's 55, so nothing in the repository writes natural English or Greek from a real record.
- Extraction stays a model behind the MCP server (`packages/mcp`). This plan does not move extraction to Rust.

## Who does what (all stages)

| Role | Default | Why |
|---|---|---|
| Extraction (text → record) | `claude-sonnet-5-5` through [`run-claude-code-source-only.mjs`](../scripts/research/run-claude-code-source-only.mjs), subscription login | R4, the Greek-frames baseline and both ADR 0027 gates used it, so the baselines are comparable. About $0.10 per item notional (R4: $19.79 for 200). |
| Second extractor family | `gpt-6.1-sol` (medium) through [`run-codex-source-only.mjs`](../scripts/research/run-codex-source-only.mjs), when ChatGPT quota allows | Coverage depends strongly on the model (Sol 11/16 English, Luna 4/16, SuperGemma 1/16 in [Stage 0](../experiments/parallel-document-v1/RESULTS-stage0.md)); one extractor describes Lunum *with that extractor*. |
| Not an extractor | SuperGemma (Ally), Qwen (Halogen) | SuperGemma cannot follow the contract (1/16 English, 0/16 Greek); the owner ruled out Qwen/Halogen extraction on 2026-10-16. |
| Rendering (record → text) | **Deterministic Rust only** (`lunum-render`, and the new realizers below). No model in the rendering path. | A failure is then the extractor's or the realizer's, never a model's paraphrase. |
| Judging, level (b) | Two judges from vendors other than the extractor: **SuperGemma + Sol** | This pair reached kappa 0.634 on the [phrase worksheet](../experiments/pivot-paraphrase-v1/WORKSHEET-v2-filled.md); SuperGemma + Qwen reached kappa 0.08 on R4. Qwen stays as the tie-breaker. |
| Heavy local jobs | Rig protocol: ask the coordinating session for a slot, run under `flock ~/.cache/rig-heavy.lock`, never restart Halogen or OpenUnum | as in R4 |

**Conventions kept from the existing experiments:**
- **Covered** = a valid parse with an identity that is not a sentence copy (a filler holding ≥ 90% of the folded source).
- A verdict needs at least 30 covered items; with fewer, the result is a non-verdict.
- A judge is valid only if it says "yes" to at most 10% of 20 seeded controls (a rendering paired with another item's source).
- Invalid evidence (`CONTRACT_UNBOUND`) is re-run once and otherwise reported as not run.
- Sentences are drawn by a seeded `select.mjs` that excludes every sentence already in the tracked repository.
- Results are reported by level: (a) structure, (b) judged meaning, (c) exact identity.

## Stage A: English → Lunum → English

### Today

| Measure | Result | Source |
|---|---|---|
| Rust render equals TypeScript render on live records | 49 / 49 | [R4](../experiments/roundtrip-en-v1/RESULTS.md) |
| Level (b), lenient judge (SuperGemma) | 48 / 49 (98%); controls 1 / 20 | same |
| Level (b), strict judge (Qwen) | 33 / 49 (67%); controls 0 / 20 | same |
| Agreement between the judges | 34 / 49 (69%), kappa **0.08** | same |
| **Coverage** | **49 / 200 (24.5%)**: 122 abstains, 29 sentence copies | same |
| Coverage, other Sonnet sets | 9 / 50 English (18%), 26 / 120 (22%) | [Greek-frames baseline](../experiments/greek-frames-heldout-v1/RESULTS-baseline.md), [ADR 0027 gate v2](../experiments/identity-heldout-v2/RESULTS.md) |
| Same sentence, two runs, same identity | 9 / 22 non-copy pairs (`lfp:2.1`) | [ADR 0027 gate v2](../experiments/identity-heldout-v2/RESULTS.md) |

The extraction errors in R4 were a wrong predicate (saw → `read`), a wrong modality (will → `intention`), a lost participant and a lost question mood (`kind: simple_fact`). The validator accepts all of them, because each word is in the source or the frame allows it.

### Gap

1. **Coverage.** Three quarters of plain English sentences get no record.
2. **The way back is a notation, not English.** Nobody can read `describe(subject=tom, attribute=swims very fast)` as a sentence, and the renderer drops `kind`, so questions look like statements.
3. **Judging is weak.** The two R4 judges barely agree.
4. **No closed loop.** Nothing checks that the English we write back would be extracted to the same record again.

### Milestones

**A0. Why it abstains (free, no model calls).** Classify the 122 R4 abstains, the 36 English abstains of the Greek-frames baseline and the ADR 0027 gate abstains by declared reason and by sentence shape (question, existential "there is", possession "have", copula with a prepositional phrase, multi-clause). Output: a table of the shapes worth a frame. *Deliverable:* `experiments/abstention-shapes-v1/README.md`. No bar; this is a diagnostic.

**A1. The acceptance gates in Rust (R5).** Port the source-bound check, the literal-retention gate and transport validation to `lunum-sem` (or a new `lunum-accept` crate), so the Rust engine alone decides accept or refuse.

| # | Bar |
|---|---|
| 1 | The Rust accept/refuse verdict and failure class equal TypeScript's on **100%** of every recorded candidate in the repository (all `candidate-ledger.jsonl` files; at least the 391 the ADR 0024 replay used) |
| 2 | A new golden file of at least 5,000 generated accept/refuse cases, 100% parity, run in the `rust` CI workflow |

**A2. An English realizer (R6).** A new crate `lunum-realize` with a profile `en-natural/0.1`: one deterministic template per framed predicate (46 of them), plus negation, modality, kind (question, command, statement), conditions and time. Fillers are written as they appear in the source. *Deliverable:* the crate, goldens, and a CLI shaped like `lunum-render`.

Pre-registered on R4's 49 covered records (in-sample for the templates, so this is a development bar, not evidence):

| # | Bar |
|---|---|
| 1 | Every covered record renders (0 errors) |
| 2 | Every number, identifier and date in the source appears in the sentence (the literal gate, applied to the output) |
| 3 | No question rendered as a statement, and no negation lost: 0 cases |

**A3. Coverage change (contract 0.21 candidate).** From A0's table, propose the smallest set of frame or contract changes that covers the commonest abstain shapes: questions keep `kind`; existential and possession frames; copula + prepositional phrase. Follow ADR 0025: pre-register, run a baseline on fresh sentences, change, run again.
- **Data:** 200 fresh Tatoeba English sentences, new seed, excluding R4 and every earlier set.

| # | Measure | Bar |
|---|---|---|
| 1 | Coverage | **≥ 40%** of items (R4 baseline 24.5%), with sentence copies ≤ 10% of parses |
| 2 | Level (b) on covered items, both judges valid on controls | ≥ 80% "states the content" by **each** judge, and judge agreement ≥ 75% |
| 3 | Safety | 0 new merges in the adversarial, collision and contrast suites; 0 identity movement on a replay of every recorded candidate |

**A4. The English round trip, closed (R7).** The full loop: English → record → `en-natural` English → the same extractor again → record. Pre-registered on a fresh set (not A3's).

| # | Measure | Bar |
|---|---|---|
| 1 | Level (b): the realized sentence states the source's content (who did what to whom, negation, modality, mood) | ≥ 85% by each judge over ≥ 60 covered; agreement ≥ 75%; controls ≤ 10% |
| 2 | Level (c), closure: the re-extracted record has the same identity as the first | ≥ the **same-sentence** stability measured in the same run (each source extracted twice). A realizer cannot be held to more than the extractor's own repeatability |
| 3 | Literal retention in the realized text | 100% |

*Reported, not bars:* coverage, the closure rate under ADR 0027's v2 projection, every judge "no" with its sentence, tokens of the record and of the realized text against the source (named tokenizer).

### Risks

- **The bottleneck is extraction, not the engine.** A1 and A2 can pass while A3 fails. Coverage and errors move with the model ([Stage 0](../experiments/parallel-document-v1/RESULTS-stage0.md): 1, 4 and 11 of 16 by model).
- **Template English sounds stiff.** That is accepted: the bar is meaning, not style. A model "polish" pass would hide realizer errors, so it stays outside the bars.
- **`describe` and `define` absorb a lot.** `describe(subject=tom, attribute=swims very fast)` realizes back to the source almost word for word, which flatters level (b). Report level (b) per frame, and A4's closure separately for general frames and framed predicates.
- **Judges.** If SuperGemma + Sol disagree as much as SuperGemma + Qwen did, level (b) stays weak. A 40-item judge-calibration set checked by the owner would fix this at small cost (decision 3 below).

### Estimate

| Milestone | Work | Model cost (notional) |
|---|---|---|
| A0 | 1 session | $0 |
| A1 | 2–3 sessions (Rust port + goldens) | $0 |
| A2 | 2 sessions | $0 |
| A3 | 2 sessions + 2 runs of 200 | about $40, plus judge hours on the Ally and ChatGPT quota |
| A4 | 1 session + 1 run of about 300 extractions (200 + re-extractions) | about $30 |

## Stage B: Greek → Lunum → Greek

### Today

| Measure | Result | Source |
|---|---|---|
| Greek coverage, general frames, Sonnet | **0 / 50** (43 declared "unsupported") | [Greek-frames baseline](../experiments/greek-frames-heldout-v1/RESULTS-baseline.md) |
| Greek coverage, Europarl, three extractors | 0 / 16 (SuperGemma), 1 / 16 (Luna), 0 / 16 (Sol) | [Stage 0](../experiments/parallel-document-v1/RESULTS-stage0.md) |
| Greek coverage, framed predicates (clc-v1) | 3 / 40 on two sets, 2 / 40 on the repeat | [clc-v1](../experiments/cross-language-convergence-v1/RESULTS.md) |
| Meaning against the owner's readings, Greek | 3 / 10 and 4 / 10 | [meaning targets](../experiments/meaning-targets-owner-v1/README.md) |
| Greek pro-drop records without an agent | 3 of 9, all first person | [pro-drop replay](../experiments/prodrop-replay-v1/README.md) |
| Exact recall over unaccented Greek queries | 0.283 → 0.992 recall@5 with Greek folding | [greek-fold-recall-v1](../experiments/greek-fold-recall-v1/RESULTS.md) |

**The known Stage-0 contract limit.** Greek is refused by design, not by the model: [`source-bound.ts`](../packages/core/src/source-bound.ts) returns `language_unsupported` for any non-English source using a general frame ([ADR 0024](../decisions/0024-general-source-bound-frames.md), rule 6), because the source-bound check needs closed-class word lists and only English has them. [ADR 0029](../decisions/0029-greek-source-bound-frames.md) designs the Greek lists and a deixis rule for pro-drop; its [pre-registration](../experiments/greek-frames-heldout-v1/PREREGISTRATION.md) and baseline exist; the change run does not.

### Gap

1. ADR 0029 is not implemented, in TypeScript or in Rust.
2. There is no Greek realizer.
3. No judge has been checked for Greek competence on this task.

### Milestones

**B0. Implement ADR 0029 in TypeScript, then Rust (R8).** The Greek closed class, elision expansion and the person-ending table go into `source-bound.ts` (contract 0.20, package v26), then into the Rust acceptance gates from A1, with the same parity bars as A1. The Greek lists are AI-drafted; the ADR asks for a model-consensus review before merging (SuperGemma + Sol, as for the phrase worksheet), and the owner's native check if he has the time.

**B1. Run the Greek-frames change run as pre-registered.** The data (50 EN/EL pairs), the bars (5) and the scorer are committed. Run it unchanged.
- **A known problem to state first, without changing the bar:** bar 1 asks for Greek coverage of at least half the English coverage *and* at least 15 Greek sentences. The baseline covered only 9 English sentences, so 15 Greek would be more than English itself. Bar 1 will probably fail on the "15" clause even if Greek works. The plan is to run it as registered, publish the verdict, and then pre-register a v2 with a larger set (B3), not to amend the bar after seeing the baseline.

**B2. A Greek realizer, `el-natural/0.1` (R9).** Same crate as A2. The insight that keeps this small: in a **same-language** round trip the fillers are Greek words copied from the Greek source, already inflected. The realizer only needs the closed-class glue (articles that are not in fillers, «δεν»/«μην», «θα»/«να», «αν», prepositions and their contractions), word order, the Greek question mark `;`, and for deixis one rule: a `speaker`/`addressee` agent is not written as a pronoun when the verb filler already carries the person (pro-drop).

| # | Bar (development, on B1's covered records) |
|---|---|
| 1 | Every covered record renders (0 errors) |
| 2 | Literal retention 100%, with Greek numerals, dates («14 Ιανουαρίου 2027») and relative times («αύριο») |
| 3 | 0 lost negations, 0 questions rendered as statements |

**B3. The Greek round trip, held out.** EL → record → `el-natural` Greek → judged, plus the closure loop as in A4.
- **Data:** 200 fresh Greek Tatoeba sentences, weighted towards first and second person, plus 100 Europarl Greek sentences (text outside the repository, handles and hashes committed). Exclude everything earlier.

| # | Measure | Bar |
|---|---|---|
| 1 | Greek coverage | ≥ 25% of items, and at least 50 covered |
| 2 | Level (b), both judges first validated on a 40-item Greek calibration set (≥ 85% against the gold) | ≥ 80% by each judge; agreement ≥ 75%; controls ≤ 10% |
| 3 | Level (c), closure | ≥ the Greek same-sentence stability measured in the same run |
| 4 | Pro-drop | of covered first/second-person items, ≥ 80% carry a deictic agent |
| 5 | Safety | as A3 bar 3, plus 0 identity movement on English replays |

### Risks

- **Morphology.** Greek inflects for case, gender and number. Same-language rendering avoids the problem by reusing source forms; any filler the realizer must *change* (an agent moved to a different case, for instance) is out of scope for `el-natural/0.1` and is reported as a realizer limit.
- **Article/clitic homography.** «τον, την, το, του, της» are articles and object clitics. ADR 0029 keeps them free words, so a dropped clitic object («τον είδα») is not caught by word coverage; only frames with a required object catch it.
- **Imperative/aorist homography and person endings.** Confirmed by the owner ([intake](../experiments/owner-greek-review-v1/INTAKE.md)). The ending table applies only inside `action` or predicate fillers; «-α» is ambiguous between nouns and past verbs.
- **Modal «μπορεί».** It has two or three readings that a parse silently collapses (same intake). Report modal items separately.
- **Tokenisation and folding.** Identity folds case, accents and final sigma under the pinned Unicode 17.0 (Node 22.22.2); the Rust crate must reproduce the same folding for Greek (covered by A1's parity bar, with a Greek-only slice of the goldens). Greek costs more tokens than English on most tokenizers, so token counts must name the tokenizer and never compare languages raw.
- **Judges' Greek.** No judge's Greek has been measured on this task. The phrase worksheet (SuperGemma + Sol, kappa 0.634) is the best evidence so far, and it is about phrases, not sentences. Hence the calibration set in B3 bar 2.
- **Extractor.** Sonnet abstained on all Greek under the frozen contract; whether it covers Greek once allowed is the open question of B1.

### Estimate

| Milestone | Work | Model cost (notional) |
|---|---|---|
| B0 | 2–3 sessions (TS + Rust + goldens + model-consensus review of the lists) | judge quota only |
| B1 | 1 session + 1 run of 100 | about $10 |
| B2 | 2 sessions | $0 |
| B3 | 2 sessions + 1 run of about 450 extractions | about $45, plus judge hours |

## Stage C: English → Lunum → Greek, and Greek → Lunum → English

### Today

| Measure | Result | Source |
|---|---|---|
| English and its human Greek translation get the same identity | **0 of 5** both-covered pairs | [clc-v1](../experiments/cross-language-convergence-v1/RESULTS.md) |
| Same pairs, structure only (predicate, roles, negation, modality, mood) | **3 of 5**; both misses are Greek pro-drop | same, post-hoc |
| Single-word EN → EL translation from mined corpora, against wordnet | top-5 0.500 (lemma) and 0.540 (surface) on Europarl; both pre-registered bars failed | [OMW round trip](../experiments/pivot-paraphrase-v1/omw-roundtrip/RESULTS.md) |
| Model-proposed Greek phrasings attested in human translations | 49% when two families agree, 28% when one does | [exploration](../experiments/pivot-paraphrase-v1/EXPLORATION.md) |
| Phrase-level EN–EL gold | 176 pairs labelled by model consensus (128 same, 27 broader/narrower, 8 different, 13 unresolved), kappa 0.634 | [worksheet v2](../experiments/pivot-paraphrase-v1/WORKSHEET-v2-filled.md), [`fill/gold.json`](../experiments/pivot-paraphrase-v1/fill/gold.json) |
| Parallel passages found by language-neutral anchors (numbers, dates, IDs) | top-1 0.817, matched/mismatched Jaccard 0.947 / 0.041 | [anchors](../experiments/parallel-document-v1/RESULTS-anchors.md) |

**Why identities cannot match today:** the closed vocabulary (predicates, roles, negation, modality, kind) is already language-neutral, but open fillers stay in their source language: `police` and «αστυνομία» hash differently. The [concept layer](../decisions/0028-language-neutral-concept-layer.md) (ADR 0028, proposed) is the design for that.

### Gap

1. A way to carry open fillers across languages: a lexicon or concept IDs.
2. Cross-language realization: target-language morphology for fillers that were not in a target source.
3. A cross-language judge.

### Milestones

**C0. Structure agreement, free from B1 and B3.** Level (a) on pairs covered on both sides: B1's bar 2 (≥ 60% over ≥ 15 pairs) is already pre-registered. No new run.

**C1. A filler lexicon, `lunum-lex` (R10).** A Rust crate built from `pivot-miner` output: EN ↔ EL phrase pairs with attestation counts from Europarl and OpenSubtitles, lemma-aware, deterministic lookup, pinned corpus hashes. Pre-registered against the 176-pair phrase gold, held out from its construction.

| # | Measure | Bar |
|---|---|---|
| 1 | The gold Greek phrase is in the top 5 for an English phrase | ≥ 70% of "same" gold pairs |
| 2 | False translations: a "different" gold pair in the top 1 | ≤ 5% |

**C2. EN → Lunum → EL (R11).** Render an English record in Greek: closed vocabulary through `el-natural` glue, open fillers through `lunum-lex` (top-1, attested); a filler with no attested translation is kept in English and marked, never guessed.
- **Data:** the English side of 200 fresh Tatoeba EN/EL pairs, with the human Greek as a reference for the judges.

| # | Measure | Bar |
|---|---|---|
| 1 | Level (b): the Greek output states the English source's content | ≥ 70% by each judge (validated on Greek controls), agreement ≥ 75% |
| 2 | Untranslated fillers | reported; ≤ 20% of fillers |
| 3 | Literal retention across the language change (numbers, dates, IDs) | 100% |

**C3. EL → Lunum → EN (R12).** The mirror of C2, with the same bars. Pro-drop is the extra risk here: the English output needs a pronoun the Greek never wrote, so B0's deixis rule is a precondition.

**C4. Same meaning, same identity (level (c)), only after C2/C3 pass.** The concept layer of ADR 0028: grounded fillers hash a concept ID instead of the word, chosen by the extractor from a candidate list and verified by core. That is a new identity version (`lfp:2.2` or later) with goldens, migration notes and the Rust port in the same change.
- **Data:** fresh Europarl and Tatoeba pairs.

| # | Measure | Bar |
|---|---|---|
| 1 | EN and EL record of a translation pair get the same identity | ≥ 50% over ≥ 20 pairs covered on both sides (clc-v1: 0 of 5) |
| 2 | False merges of different meanings | 0 |
| 3 | English-only identity movement | only as declared in the migration note |

### Risks

- **Morphology, now unavoidable.** An English filler translated into Greek must take the right case and gender in its new sentence; C2's realizer will get this wrong in places. Mitigation: prefer attested Greek phrases that carry their article and case («την αστυνομία»); report case errors separately; a model that only inflects, checked by the literal gate, is a possible later step, outside these bars.
- **Polysemy.** 81 of 100 wordnet lookups failed on ambiguity, not missing data ([ADR 0028](../decisions/0028-language-neutral-concept-layer.md)). The lexicon must keep candidates, not force one sense.
- **Corpus bias.** Europarl is parliamentary and OpenSubtitles conversational; Tatoeba is short everyday sentences and probably in model training data.
- **Licences.** Europarl and OpenSubtitles text stays outside the repository; only hashes, handles, aggregates and derived counts are committed.

### Estimate

| Milestone | Work | Model cost (notional) |
|---|---|---|
| C0 | included in B1/B3 | $0 |
| C1 | 2–3 sessions (CPU only) | $0 |
| C2 | 2 sessions + 1 run of 200 | about $20 + judge hours |
| C3 | 1–2 sessions + 1 run of 200 | about $20 + judge hours |
| C4 | 4+ sessions (ADR, identity version, migration, Rust port) + 2 runs | about $60 |

## Order of work and the owner's decisions

| Order | Step | Depends on | Needs the owner |
|---|---|---|---|
| 1 | A0 abstention shapes; A1 Rust acceptance gates; B0 TypeScript part | — | no |
| 2 | A2 English realizer; B1 Greek-frames change run | A1; B0 | B1 budget (about $10) |
| 3 | A3 coverage change | A0 | budget (about $40), contract 0.21 under ADR 0025 |
| 4 | A4 English round trip, closed | A2, A3 | budget (about $30) |
| 5 | B2 Greek realizer; B3 Greek round trip | B0, B1, A2 | budget (about $45) |
| 6 | C1 lexicon; C2/C3 cross-language | B2, A2 | budget (about $40) |
| 7 | C4 concept-layer identity | C2, C3 | an identity version |

**Decisions for the owner before work starts:**
1. **Extractor.** Sonnet on the subscription as the default (comparable with every 2026-10-17 baseline), with Sol as the second family when quota allows? Or Sol first?
2. **Judges.** SuperGemma + Sol for level (b), Qwen as tie-breaker?
3. **Calibration.** 20 minutes of native-speaker checking for a 40-item Greek calibration set would make every Greek level-(b) number stronger. The owner delegated Greek judgements to models on 2026-10-17; this asks for an exception, not a change of policy.
4. **Greek-frames bar 1.** Run B1 as pre-registered, knowing its "at least 15 Greek sentences" clause will probably fail, and treat B3 as the real Greek test?
5. **Contract 0.21.** Accept that A3 is a contract change under ADR 0025, with its own pre-registration?

**Total, if every step runs once:** about 25 to 30 agent sessions and about $225 notional (Max-plan usage, no API charge), plus judge time on the Ally and ChatGPT quota. Each step stops at its own verdict; a failed bar is published and the next step is re-planned, not forced.
