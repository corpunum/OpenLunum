# Plan: language pairs on the Rust engine, with English as the pivot

**Drafted 2026-10-22; revised the same day after the owner approved English as the pivot ([ADR 0030](../decisions/0030-english-pivot-translation-adapters.md)). Self-reviewed.** Every "today" number links to the file it comes from. Nothing here changes the freeze ([ADR 0025](../decisions/0025-contract-freeze-pending-held-out-evidence.md)): each contract or identity change still needs a pre-registration, a baseline run and a change run, in that order. The first version of this plan (stages B and C: a native Greek pipeline, then a mined lexicon and a concept layer) is in the git history at `14db0979`.

**The strategy: English is the pivot.** Lunum and the Rust engine deal only with English. Other languages connect through a model translation adapter at the edges:

```
EL text ─► model translates to EN (strict prompt + meaning flags) ─► guards ─► Rust gates + identity on EN
                                                                                   │
EL text ◄─ model translates EN to EL (uses the flags) ◄─ Rust writes English ◄─────┘
```

A record stores the language-neutral Lunum record, the meaning flags, and the source text and language as optional provenance, **not** English text as the stored meaning. The guards are deterministic and abstain on any doubt: every literal of the source must reach the English, negation and modality must not change, and two translators from different model families must land on the same identity. No parallel lexicon is needed to run this; a small held-out test set is needed to measure it. Native Greek ([ADR 0029](../decisions/0029-greek-source-bound-frames.md)) is parked as optional research.

**Order of work:**
1. **Stage A (critical path):** English → Lunum → English. Unchanged in spirit.
2. **Stage P:** the pivot adapter: Greek → English → Lunum, and back. P0 and P1 can start now; P3 needs A2.

Each stage below gives what exists today, the gap, milestones with pre-registered bars, the data, who does what, the risks and an estimate.

## The Rust engine today

The Rust track so far is R1 to R4, approved by the owner on 2026-10-17 ([R4 pre-registration](../experiments/roundtrip-en-v1/PREREGISTRATION.md)).

| Step | Crate | What it does | Evidence |
|---|---|---|---|
| R1 | [`crates/lunum-sem`](../crates/lunum-sem) | Schema and frame validation, then the `lfp:2.1` fingerprint, byte for byte as `packages/core` | 7,089 of 7,089 golden entries ([`lfp21-golden.json`](../eval-results/golden-vectors/lfp21-golden.json)) |
| R2 | [`crates/lunum-store`](../crates/lunum-store) | Append-only SQLite store keyed by identity; CLI `put` / `get` / `lang` / `stats` | crate tests |
| R3 | [`crates/lunum-render`](../crates/lunum-render) | Renders a record as `generic-en-pivot/0.2` code; stdin/stdout JSONL CLI | 10,522 of 10,522 golden entries ([`render-en-golden.json`](../eval-results/golden-vectors/render-en-golden.json)) |
| R4 | (experiment) | English round trip, rendered in Rust | **PASS** by its bars ([results](../experiments/roundtrip-en-v1/RESULTS.md)) |
| — | [`tools/pivot-miner`](../tools/pivot-miner) | Phrase translations and paraphrases mined from aligned corpora (Europarl, OpenSubtitles); not needed by the English pivot, kept as research | [exploration](../experiments/pivot-paraphrase-v1/EXPLORATION.md) |

**What the Rust engine cannot do yet:**
- It cannot decide acceptance on its own. The source-bound check ([`source-bound.ts`](../packages/core/src/source-bound.ts)), the literal-retention gate ([`literal-retention.ts`](../packages/core/src/literal-retention.ts)) and transport validation are TypeScript only.
- It cannot write sentences. `generic-en-pivot/0.2` writes a notation such as `R not assert(subject=tom, object=red meat, action=eat)`, not English. The template engine in [`packages/eval/src/realization.ts`](../packages/eval/src/realization.ts) is a prototype: its predicates (`greeting`, `statement` and so on) are not the protocol's 55, so nothing in the repository writes natural English or Greek from a real record.
- Extraction stays a model behind the MCP server (`packages/mcp`). This plan does not move extraction to Rust.

## Who does what (all stages)

| Role | Default | Why |
|---|---|---|
| Extraction (text → record) | `claude-sonnet-5-5` through [`run-claude-code-source-only.mjs`](../scripts/research/run-claude-code-source-only.mjs), subscription login | R4, the Greek-frames baseline and both ADR 0027 gates used it, so the baselines are comparable. About $0.10 per item notional (R4: $19.79 for 200). |
| Second extractor family | `gpt-6.1-sol` (medium) through [`run-codex-source-only.mjs`](../scripts/research/run-codex-source-only.mjs), when ChatGPT quota allows | Coverage depends strongly on the model (Sol 11/16 English, Luna 4/16, SuperGemma 1/16 in [Stage 0](../experiments/parallel-document-v1/RESULTS-stage0.md)); one extractor describes Lunum *with that extractor*. |
| Translation at the edges (stage P) | **Qwen** on Halogen (bulk, local, rig protocol) and **Sonnet** (`claude -p`, subscription) as the second family; Sol may replace Sonnet when quota allows | Two families, so a shared mistranslation is less likely; the two must agree on the identity ([ADR 0030](../decisions/0030-english-pivot-translation-adapters.md)) |
| Not an extractor | SuperGemma (Ally), Qwen (Halogen) | SuperGemma cannot follow the contract (1/16 English, 0/16 Greek); the owner ruled out Qwen/Halogen extraction on 2026-10-16. |
| Rendering (record → English) | **Deterministic Rust only** (`lunum-render`, and the English writer of A2). No model writes English from a record. Only the last hop into another language is a model, under the adapter's guards. | A failure in English is then the extractor's or the writer's, never a model's paraphrase. |
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

**A0. Why it abstains (free, no model calls). Done 2026-10-22: [results](../experiments/abstention-shapes-v1/RESULTS.md).** The 151 uncovered R4 items, classified from the run ledgers (declared reason, every refused attempt, a counterfactual replay through today's core) and by sentence shape:

| Primary cause | Items |
|---|---|
| First- or second-person subject (`I`, `you`, `we`); core accepts them, but the contract's "never fill it with you" seems to deter the extractor | 42 |
| `assert.action` written as a bare string, read as an unregistered predicate; **37 get an identity once the action is a text term** | 37 |
| Questions parsed as a `topic` label (all 29 sentence copies are questions) | 29 |
| Third-person pronoun as a whole argument (refused filler, cannot be left out) | 25 |
| Questions that abstained | 4 |
| Other (imperative, multi-clause, existential, modal, complement) | 14 |

The string-`action` repair alone would have taken R4 from 49 to 86 of 200 covered (43%), if the repaired parses are right; the same mistake ends 33 and 41 abstains in the two ADR 0027 gate runs. This changes A3's candidate list (below).

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

**A3. Coverage change (contract 0.21 candidate).** From A0, the smallest set of changes that covers the commonest causes, in order: (1) a string `action` on a general frame is written as a text term by the builder, or refused with a message that names the fix; (2) a question form of the general frames (`kind` carries the mood; `topic` keeps only headings and labels); (3) one contract sentence saying that `I`, `you`, `we` as written are valid fillers of a general frame. Third-person pronouns stay abstains. Follow ADR 0025: pre-register, run a baseline on fresh sentences, change, run again. Cause 3 matters twice: English produced from Greek starts with `I`, `you` and `we` more often than Tatoeba English (Greek is pro-drop).
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
- **Judges.** If SuperGemma + Sol disagree as much as SuperGemma + Qwen did, level (b) stays weak. A 40-item judge-calibration set checked by the owner would fix this at small cost (decision 4 below).

### Estimate

| Milestone | Work | Model cost (notional) |
|---|---|---|
| A0 | 1 session (done) | $0 |
| A1 | 2–3 sessions (Rust port + goldens) | $0 |
| A2 | 2 sessions | $0 |
| A3 | 2 sessions + 2 runs of 200 | about $40, plus judge hours on the Ally and ChatGPT quota |
| A4 | 1 session + 1 run of about 300 extractions (200 + re-extractions) | about $30 |

## Stage P: the pivot adapter (Greek ↔ English at the edges)

### Today

| Measure | Result | Source |
|---|---|---|
| Greek coverage, native route, frozen contract | **0 / 50** (Sonnet), 0–1 / 16 (three extractors): non-English general frames fail closed by design | [Greek-frames baseline](../experiments/greek-frames-heldout-v1/RESULTS-baseline.md), [Stage 0](../experiments/parallel-document-v1/RESULTS-stage0.md) |
| English and its human Greek translation get the same identity, native route | **0 of 5** both-covered pairs | [clc-v1](../experiments/cross-language-convergence-v1/RESULTS.md) |
| Same English sentence, two extractions, same identity | 9 / 22 (`lfp:2.1`) | [ADR 0027 gate v2](../experiments/identity-heldout-v2/RESULTS.md) |
| Literal readers for English and Greek (numbers and number words, month-name dates, relative times, identifiers) | implemented in core | [ADR 0016](../decisions/0016-source-literal-retention-gate.md), [0019](../decisions/0019-month-name-date-retention.md), [0020](../decisions/0020-number-words-and-relative-times.md) |
| Adapter: prompt `pivot-translate/0.1`, meaning-flags schema, guards, dual agreement | implemented, unit-tested; **not yet measured** | [`pivot-adapter.ts`](../packages/eval/src/pivot-adapter.ts), [ADR 0030](../decisions/0030-english-pivot-translation-adapters.md) |

### Gap

1. Nothing has measured what the translation hop costs in coverage, identity and literals.
2. The way back (EN → EL) needs a real English sentence first (A2).
3. No judge has been checked on Greek output (needed for P3).

### Milestones

**P0. The adapter (done 2026-10-22, no model calls in the guards).** [ADR 0030](../decisions/0030-english-pivot-translation-adapters.md) and [`packages/eval/src/pivot-adapter.ts`](../packages/eval/src/pivot-adapter.ts):
- **Translation prompts** for both hops (`buildPivotPrompt`, `buildRenderPrompt`): keep numbers, dates, names and identifiers exactly; never change negation or modality (may / must / can / will); keep mood; flag ambiguity instead of resolving it silently.
- **Meaning flags** (`MEANING_FLAGS_JSON_SCHEMA`, kept to the subset constrained decoding enforces): aspect (perfective / imperfective), formality (T / V), addressee number, gender of referents, evidentiality, dropped subject (pro-drop), the translator's literal map, and an ambiguity flag with a note.
- **Guards** (`checkPivotGuards`, deterministic, abstain on failure): literal carry-through with core's EN/EL literal readers; Latin-script words verbatim; every mid-sentence name declared and present; negation and necessity/possibility markers unchanged in both directions; future «θα» not dropped; ambiguity abstains.
- **Dual agreement** (`agreePivotIdentity`): two families, both pass, same identity; extraction memoised per exact English string.
- **Stored record** (`PivotRecord`): identity, Sem, meaning flags; source text and translations only as provenance.
- The guards stay in TypeScript at the edge, next to the runners; porting them to Rust is not on the critical path (A1 ports the acceptance gates, which decide identity).
- Translator runner [`translate.mjs`](../experiments/pivot-el-en-v1/translate.mjs) (Qwen through Halogen's OpenAI-compatible endpoint with schema-constrained output; Sonnet through `claude -p` with `--json-schema`), smoke-tested on dev pairs only.

**P1. Coverage through the pivot.** Greek via the pivot gets records about as often as the human English side of the same Tatoeba pairs. **P2. Identity agreement.** The Greek sentence lands on the same identity as its human English translation. **P4. Literals.** Every literal survives into the stored record. One run measures all three; pre-registered in [`experiments/pivot-el-en-v1/PREREGISTRATION.md`](../experiments/pivot-el-en-v1/PREREGISTRATION.md).
- **Data:** 160 held-out Tatoeba EN–EL pairs (seeded, neither side found anywhere else in the repository), plus 20 disjoint dev pairs for smoke tests.

| # | Measure | Bar |
|---|---|---|
| P1 | Pivot-covered Greek sentences against human-English-covered | ≥ **0.8 ×** human coverage; verdict needs ≥ 30 human-covered |
| P2 | Same identity as the human English, over pairs covered on both sides | ≥ **50%** over ≥ 20 pairs (native baseline 0 / 5; the extractor's own same-sentence stability is 9 / 22 = 41%, so 50% asks the translation not to be the bottleneck), and 0 collisions with other pairs |
| P4 | Literal carry-through into the stored record (numbers, dates, relative times, identifiers, declared names) | **100%** |

*Reported, not bars:* guard failures by kind and translator, single-translator coverage, how often a translation reproduces the human English string, flag agreement between the translators, dropped subjects.

**P3. The Greek round trip (needs A2).** EL → pivot → record → `en-natural` English (A2) → model translates to Greek using the stored flags (`buildRenderPrompt`), with the guards applied to the outbound hop as well (English → Greek). Pre-registered on a fresh held-out set after A2 exists.

| # | Measure | Bar |
|---|---|---|
| 1 | Level (b): the final Greek states the Greek source's content (who did what to whom, negation, modality, mood), judged by **SuperGemma + Sol**, both first valid on 20 seeded controls (≤ 10% "yes") | within **10 percentage points** of the English round trip (A4 level (b)) measured by the same judges, and ≥ 30 covered |
| 2 | Judge agreement | ≥ 75% |
| 3 | Literal retention across both hops | 100% (as P4) |

*Reported:* flag-preservation per flag (aspect, formality, gender) read by the judges; items where the round trip is fine but a flag was lost.

**P4** is measured inside P1/P2 for the inbound hop and inside P3 for the outbound hop.

### Risks

- **Dual agreement costs coverage.** Two translators that word a sentence differently produce different fillers, so different identities: the pivot then abstains. Single-translator coverage is reported so the cost is visible. If P1 fails on this alone, the honest next step is a pre-registered relaxation (for example, agreement on the record's structure plus identical fillers after a deterministic normalisation), not a quiet one.
- **Extraction is not deterministic.** Even identical English extracted twice agrees 9 / 22 times; memoisation per exact string removes this for identical translations only.
- **The translator joins the evidence chain.** A fluent mistranslation that keeps every literal and every negation passes the guards; two families make a shared error less likely, not impossible.
- **Training-data contamination.** Tatoeba is probably in both translators' training data, which flatters P2 (a model may reproduce the human English). Europarl or the owner's own text would be the follow-up test.
- **Pro-drop.** English from Greek starts with `I`, `you`, `we` more often; A0 found these subjects to be the commonest no-attempt abstain, so A3's cause 3 matters for P1.
- **Guard lists are conservative.** Greek «κανείς», «ποτέ», «τίποτα» are not counted as negators (they also mean anyone, ever, anything); a Greek perception verb translated with "can" ("I can't hear you") trips the possibility check. Both abstain: lost coverage, not safety. Reported by kind.
- **Names across scripts** are checked through the translators' declared literals and their agreement, not a transliteration table.

### Estimate

| Milestone | Work | Model cost (notional) |
|---|---|---|
| P0 | 1 session (done) | about $0.05 (dev smoke test) |
| P1 / P2 / P4 | 1 session + 160 Qwen and 160 Sonnet translations + about 160 + 250 Sonnet extractions | about $40 |
| P3 | 2 sessions, after A2 + 1 run of about 200 | about $35, plus judge hours |

## Order of work and the owner's decisions

| Order | Step | Depends on | Needs the owner |
|---|---|---|---|
| 1 | A0 (done); P0 (done); A1 Rust acceptance gates | — | no |
| 2 | P1 / P2 / P4 run (pre-registered) | P0 | budget (about $40 notional) |
| 3 | A2 English writer | A1 | no |
| 4 | A3 coverage change (string `action`, questions, deictic subjects) | A0 | budget (about $40), contract 0.21 under ADR 0025 |
| 5 | A4 English round trip, closed | A2, A3 | budget (about $30) |
| 6 | P3 Greek round trip | A2, P1 | budget (about $35) |

**Decisions for the owner:**
1. **Run P1/P2/P4 now on the frozen contract (about $40 notional), or after A3?** Now gives the pivot's cost against today's English; after A3 both sides would cover more. Running now keeps A3 and P separable.
2. **Second translator:** Sonnet (also the extractor, so the same vendor appears twice in the chain) or Sol when quota allows?
3. **Judges for P3:** SuperGemma + Sol, Qwen as tie-breaker?
4. **Calibration.** 20 minutes of native-speaker checking for a 40-item Greek judge-calibration set would make P3 stronger; the owner delegated Greek judgements to models on 2026-10-17, so this asks for an exception.
5. **Contract 0.21.** Accept that A3 is a contract change under ADR 0025, with its own pre-registration, and that its first item is the string-`action` repair?

**The owner's answers (2026-10-22):**
1. **Run P1/P2/P4 now**, on the frozen contract, with **Haiku (`claude-haiku-5-5`) as the extractor** instead of Sonnet, for cost. Recorded as [Amendment 1](../experiments/pivot-el-en-v1/PREREGISTRATION.md#amendment-1-2026-10-22-haiku-extracts-luna-low-is-the-second-translator) before any held-out call; bars unchanged.
2. **Second translator: Luna at low effort** (`gpt-6-luna`, `codex exec` on the ChatGPT login, `model_reasoning_effort="low"`, no retries; Codex quota is scarce). Qwen on Halogen stays the first translator.
3. **P3 judges: SuperGemma on the ROG Ally** (`supergemma4-Q5_K_M` on the Ally's llama.cpp router, `http://127.0.0.1:18084/v1` on the Ally, reached through an SSH tunnel as in [`judge.mjs`](../experiments/parallel-document-v1/judge.mjs)) **plus a free hosted model from another vendor**: NVIDIA NIM free endpoints (`nemotron-super-49b`, key already configured) or opencode's free tier (`opencode run --auto -m opencode/nemotron-3-ultra-free`, one session at a time). This replaces "SuperGemma + Sol" for P3; both judges must first pass the 20 seeded controls, and Qwen stays the tie-breaker. P3 is not run until A2 exists.
4. **Calibration: yes.** The owner hand-labels a 40-item Greek judge-calibration worksheet (`experiments/pivot-el-en-v1/calibration/`, produced separately); P3's judges are checked against it.
5. **A3 approved as contract 0.21 under ADR 0025**, in this order: the bare-string `action` repair, then questions, then `I` / `you` / `we` as fillers.

**Total, if every step runs once:** about 14 to 18 agent sessions and about $175 notional (Max-plan usage, no API charge), plus judge time on the Ally and ChatGPT quota. Each step stops at its own verdict; a failed bar is published and the next step is re-planned, not forced.
