# Lunum — Complete Agent Handover

**Handover date:** 2026-07-15  
**Current package:** Lunum 2.7 — Production Shadow Integration  
**Primary local target tested by the user:** `supergemma4-Q5_K_M.gguf` through a llama.cpp-compatible local server and custom web UI  
**Primary product context:** OpenUnum-like local agent platform with memory, embeddings, anchors, precache, SQLite, guardrails, chat sessions, proof-of-work, tools, and a web UI

---

## 1. Executive summary

Lunum began as a proposal for a **new machine-first language** that could help language models:

1. understand meaning through a more regular, explicit representation;
2. use fewer characters and tokens;
3. preserve meaning across human languages;
4. reduce multilingual memory duplication;
5. work with existing local LLMs before any dedicated Lunum model can be trained.

The project initially produced a verbose semantic representation. That first design was useful for multilingual normalization, structural retrieval, and exact deduplication, but it expanded prompt tokens badly. Instead of abandoning the original two-goal vision, the design was split into stable layers:

```text
Human language
  -> Lunum-Sem   canonical, model-agnostic meaning
  -> Lunum-FP    retrieval/dedup fingerprint
  -> Lunum-Code  compact, tokenizer-aware model-facing rendering
  -> optional Lunum-Bin/L1B storage encoding
```

The key breakthrough was replacing punctuation-heavy symbolic notation with **telegraphic, tokenizer-native language**:

```text
Natural:
The API returned error 500 after deployment and the agent fixed the route bug.

Lunum-Code:
T error api 500 after deploy ; fix route bug
```

On the user's local SuperGemma setup, the latest controlled tests demonstrated both target achievements within one layered language system:

- **Multilingual/canonical semantic memory and retrieval:** Lunum-Sem and Lunum-FP provide a shared representation independent of source language.
- **Compact model-facing context:** Lunum-Code reduced memory-context tokens while preserving question-answering quality in controlled tests.

The strongest product result so far is **mixed mode**:

- low-risk, high-confidence memories use Lunum-Code;
- conditional, safety-sensitive, exact-wording, code, command, file-path, or nuanced memories remain in natural language;
- original natural text is always retained.

Lunum 2.7 packages this into a **shadow integration** approach rather than immediately replacing production context.

---

## 2. The two non-negotiable goals

### Goal A — multilingual semantic retrieval without language duplication

Store one canonical semantic memory instead of maintaining separate copies for English, Greek, Spanish, Indonesian, and every other supported language.

Example meanings:

```text
English: Mary gave John a book yesterday.
Greek:   Η Μαρία έδωσε στον Γιάννη ένα βιβλίο χθες.
Spanish: María le dio un libro a Juan ayer.
Indonesian: Mary memberi John sebuah buku kemarin.
```

Canonical representation:

```text
Lunum-Sem:
give(agent=mary, recipient=john, theme=book, time=yesterday, neg=false)

Lunum-FP:
give|a:mary|r:john|t:book|time:yesterday|n:0
```

Uses:

- multilingual memory normalization;
- exact structural deduplication;
- language-independent retrieval keys;
- graph- or predicate-aware retrieval signals alongside embeddings/BM25;
- one stored meaning that can later be rendered into the user's output language.

### Goal B — compact model-facing context

Render selected Lunum-Sem records into a controlled, compact form that existing LLMs understand without a custom tokenizer or full retraining.

Example:

```text
Natural:
The system canonicalizes memories in four languages into one fingerprint.

Lunum-Code:
T canon memories four languages one fingerprint
```

The compact layer must be judged by:

- actual target tokenizer counts, not character counts;
- comprehension and QA quality;
- validation success;
- reversibility/fallback;
- stability across multiple memories and distractors.

---

## 3. Critical design conclusions

### 3.1 Meaning and spelling must be separate

A single semantic layer can be provider-agnostic. A single compact spelling cannot be assumed optimal for Gemma, Llama, Qwen, Mistral, OpenAI, or Claude tokenizers.

```text
Lunum-Sem
  -> Lunum-Code-SuperGemma
  -> Lunum-Code-Llama
  -> Lunum-Code-Qwen
  -> Lunum-Code-Mistral
  -> Lunum-Code-OpenAI
```

The semantic ID stays stable while surface forms may differ.

### 3.2 Do not assume fewer characters means fewer tokens

Examples such as `yesterday -> yestrdy`, `give -> gv`, or `ph -> Φ` may look shorter but can tokenize worse. Candidate forms must be measured against the actual tokenizer.

### 3.3 Use ordinary tokens in extraordinary order

Modern models already understand common language tokens. The strongest compression came from:

- dropping articles and redundant function words;
- fixed role order;
- world markers;
- predicate-first clauses;
- carrying subject/context across semicolon-separated events;
- factoring shared conditions;
- retaining full words when they are already one token.

Good:

```text
R give mary john book yesterday
T rank exact fingerprints above embeddings
```

Poor for current SuperGemma tokenizer:

```text
w:real @gv(agt:mary,rec:john,thm:book,time:d-1)
```

### 3.4 Abbreviations must be registered and tested

Safe targets for abbreviation are closed-vocabulary items such as predicates, time markers, world markers, and style markers. Do not casually abbreviate:

- names;
- file paths;
- URLs;
- commands;
- code;
- quoted text;
- technical identifiers;
- rare entities.

### 3.5 Prefix caching helps compute, not logical context length

A stable Lunum grammar prefix can be cached or reused by runtimes that support KV/prefix caching. This can reduce repeated prompt evaluation and latency, but it does not reduce the logical context token count.

Recommended layout:

```text
[STABLE PREFIX]
Lunum version
world markers
operators
render rules
small examples
END_LUNUM_PREFIX

[DYNAMIC]
retrieved memories
current user request
```

### 3.6 Model priors are useful, but they are not reliable memory

Lunum deliberately uses familiar words because the model already has strong learned priors for them. Those priors help parsing and recovery. They must not be treated as a database or trusted memory source.

---

## 4. Current Lunum syntax

### World markers

```text
R = real/factual
F = fiction/story
T = tool/agent/system operation
D = dream
B = belief/perception world
M = metaphor/symbolic world
```

### Core operators

```text
not       negation
q         question
if/then   condition
that      nested proposition/event
;         next event / clause separator
```

### Examples

```text
R prefer user concise answers
R not give mary john red book yesterday
R q hide archivist what key before fire
R want mary that return john book
R if river rise then leave mira bridge ; call theo should
T error api 500 after deploy ; fix route bug
F mis knight windmills giants ; attack windmills
```

### Current rendering modes

- **Safe-Code:** clear and conservative.
- **Short-Code:** uses only measured cheaper abbreviations.
- **Tight-Code:** applies subject/world continuity and condition factoring.
- **Mixed context:** uses Lunum-Code only for eligible memories, with natural-text fallback.

---

## 5. Project evolution and test history

### Lunum-1 / v0.2 — semantic interlingua prototype

Initial design contained:

- human-readable Lunum-Text;
- compact symbolic Lunum-ID;
- binary L1B transport/storage;
- registries, roles, predicates, relations;
- validation, canonicalization, repair loop, tests.

Strengths:

- language-agnostic memory concept;
- exact canonical deduplication;
- structured retrieval potential;
- clean engineering prototype.

Failure:

- benchmark showed roughly **5.78x expansion** over source text;
- compact text form barely improved that;
- binary representation was compact but could not be consumed directly by the model;
- runtime middleman path required extra model calls and was unsuitable for the local hot path.

This established that Lunum was useful for memory semantics but not yet prompt compression.

### Lunum-2 — split semantic and compact responsibilities

Introduced:

```text
Lunum-Sem
Lunum-Min
Lunum-FP
Lunum-Bin
```

The important architectural change was to stop treating the readable semantic notation as the model-facing compact language.

### Lunum-2.1 — literary and semantic stress features

Added or explored:

- reality/world layers;
- false belief and misperception;
- nested events;
- generic/social rules;
- narrator/evidence stance;
- style/pragmatic sidecars;
- symbolic themes and arcs;
- expanded tool/agent predicates.

A short original stress-test story was used to exercise ambiguity, belief, metaphor, tools, constraints, preferences, and conditionals.

### Lunum-2.2 — exact tokenizer testing

Added a llama.cpp `/tokenize` benchmark harness and blind multilingual literary-style corpus.

Important finding from the user's SuperGemma test:

- English/Spanish/Indonesian expanded in Lunum 2.2;
- Greek appeared to compress because Greek source text was comparatively expensive for that tokenizer;
- punctuation-heavy syntax (`@`, `#`, `{}`, `w:`) was a major penalty;
- full natural words could be cheaper than artificial abbreviations.

This led to the Token Atlas approach.

### Lunum-2.3 — Token Atlas and telegraphic direction

Introduced:

- tokenizer-tested candidate spellings;
- Safe-Min, Short-Min, Ultra-Min;
- the principle: **do not guess tokenization**;
- telegraphic surface code using ordinary vocabulary.

User-reported target tokenizer result:

```text
Safe-Min  ≈ 0.847x
Short-Min ≈ 0.829x
```

### Lunum-2.4 — renderer profiles and early multi-event compaction

Introduced:

- Safe-Code;
- Short-Code;
- Tight-Code;
- world markers;
- subject/world continuity;
- condition factoring;
- target-tokenizer measurements.

User-reported results:

```text
Safe-Code  0.882x
Short-Code 0.801x
Tight-Code 0.776x
validator   30/30
```

### Lunum-2.5 — 30-example stress corpus

Expanded test categories:

- negation;
- questions;
- nested propositions;
- conditionals;
- tool events;
- fiction, false belief, metaphor;
- preferences;
- multilingual-equivalent meanings;
- long entities;
- harmful instructions as data, not operational guidance.

User-reported results on the target tokenizer:

```text
Mode       total ratio wins
Safe       0.7971  28/30
Short      0.7336  29/30
Tight      0.7244  29/30
```

All three compressed on average. Short and Tight each compressed 29/30 examples.

### Lunum-2.5.1 — strict validation repair

Initial strict validator test revealed unknown names/predicates. Registry repair produced:

```text
smoke passed 90 / 90
strict passed 90 / 90
```

This confirmed the importance of registry completeness and strict-mode validation.

### Lunum-2.5.2 — first comprehension gate, invalid result

The first comprehension run produced:

```text
context ratio 0.7434
full prompt ratio 0.9195
mean quality delta -0.60
```

This result was **invalid** because the response extractor only accepted one JSON shape and missed valid model output fields. The harness was corrected rather than accepting a false negative.

### Lunum-2.5.3 / 2.5.4 — corrected comprehension harness

The corrected runner:

- supports `/v1/chat/completions` and `/completion`;
- extracts `choices[0].message.content`, `choices[0].text`, `content`, `response`, or `text`;
- strips `<think>` blocks and markdown fences;
- includes required auth headers for the local `/completion` path;
- uses simple semantic answer scoring.

User-reported corrected results:

Default/chat-style mode:

```text
Natural answer: Paris
Lunum answer:  Paris
Quality delta: 0.00
```

Completion mode:

```text
Natural answer: Paris
Lunum answer:  Paris
Quality delta: +0.05
```

Both preserved the approximately **25.7% context saving** and **8.1% full-prompt saving**.

### Lunum-2.6 — multi-memory integration gate

This package tested a realistic memory bundle with:

- relevant and irrelevant memories;
- exact user preference;
- tool events;
- negation;
- fiction;
- safety constraint;
- conditional instruction;
- multiple QA queries.

Exact target tokenizer counts:

```text
natural 270
lunum   207
mixed   217

Lunum ratio 0.7667
Mixed ratio 0.8037
```

Default/chat-style QA:

```text
natural 1.0
lunum   1.0
mixed   1.0
```

Completion mode QA:

```text
natural 1.0
lunum   0.9
mixed   1.0
```

The full-Lunum miss dropped one action from a conditional multi-action instruction. Mixed mode kept that memory natural and preserved full quality. This is the main reason the rollout recommendation is **mixed**, not **all_lunum**.

### Lunum-2.7 — production shadow integration package

Added:

- formal memory-record schema;
- eligibility classifier;
- context compiler supporting `natural`, `all_lunum`, `mixed`, and `shadow_mixed`;
- shadow evaluator;
- database migration templates;
- failure taxonomy;
- rollout guidance;
- static tests runnable without the user's live model server.

Static sample result on the included memory set:

```text
Natural rough tokens: 137
Lunum rough tokens:    98
Mixed rough tokens:    103
Lunum ratio:            0.715
Mixed ratio:            0.752
```

These are rough offline estimates, not exact target tokenizer counts. Exact counts require the user's local `/tokenize` endpoint.

---

## 6. Current recommended memory record

```json
{
  "id": "mem-123",
  "session_id": "sess-1",
  "source_text": "The user prefers concise answers.",
  "source_language": "en",
  "category": "preference",
  "lunum_sem": {
    "world": "real",
    "predicate": "prefer",
    "roles": {
      "experiencer": "user",
      "theme": "concise_answer"
    },
    "negated": false
  },
  "lunum_fp": "world:real|pred:prefer|x:user|theme:concise_answer|neg:0",
  "lunum_code": {
    "model_family": "supergemma",
    "renderer": "tight",
    "code": "R prefer user concise answers",
    "token_count": 5
  },
  "confidence": 0.97,
  "risk": "low",
  "context_eligible": true,
  "created_at": "...",
  "updated_at": "..."
}
```

Original natural text is always retained.

Suggested runtime flags:

```text
LUNUM_ENABLED=true
LUNUM_WRITE=true
LUNUM_READ=true
LUNUM_USE_IN_MEMORY_CONTEXT=true
LUNUM_CONTEXT_MODE=mixed
```

Do not enable `all_lunum` yet.

---

## 7. Eligibility policy

### Eligible for compact context

Typical rule:

```text
confidence >= 0.90
risk == low
category in:
  preference
  simple_fact
  tool_event
  project_state
  retrieval_rule
  system_fact
  benchmark_result
```

### Natural-text fallback required

```text
conditional instruction
safety constraint/event
exact quote
code
command
file path
URL when exact form matters
legal or policy text
medical/high-stakes wording
emotion/social nuance
low confidence
ambiguous co-reference
complex modality
```

### Invariant

**Never delete the original natural text.** Lunum-Code is a compact representation and retrieval sidecar, not the sole source of truth.

---

## 8. Known weaknesses and open questions

1. **Conditionals and conjoined actions** can lose one action in completion mode.
2. **Lunum echo:** some model modes repeat Lunum-Code instead of answering in natural language.
3. **Role ambiguity:** telegraphic forms can become ambiguous if predicate signatures are incomplete.
4. **Style and social meaning:** tone, urgency, irony, politeness, and implied social intent should usually remain sidecar metadata or natural text.
5. **Cross-language candidates:** shorter words from other languages may help one tokenizer and hurt another; no mixed-language code should be adopted without measurement and comprehension tests.
6. **Provider agnosticism:** semantic representation is portable, but compact renderer profiles still need real tokenizer/token-count measurements for each provider.
7. **Evaluation scale:** current controlled sets are small. Production confidence requires larger corpora and real-session shadow logs.
8. **Conversion cost:** human text -> Lunum requires a model/parser. This should happen asynchronously during memory consolidation, in batches, or via a small skill/tool—not necessarily on every chat turn.
9. **Validator depth:** later validators should enforce predicate signatures, argument types, nesting, modality, negation, and co-reference—not merely legal tokens.
10. **Database migrations:** supplied SQL uses `ALTER TABLE`; product agent must inspect current schema and make migrations idempotent/safe.
11. **Node compatibility:** inspect JSON module imports and adjust for the local Node version where needed.
12. **Security:** Lunum must never bypass guardrails because it looks like an internal code. Safety checks must operate on both original meaning and decoded Lunum-Sem.

---

## 9. Predictive and tokenizer research directions

### Token Atlas

For every semantic concept, maintain candidates:

```json
{
  "semantic_id": "predicate.give",
  "candidates": ["give", "gave", "gv", "g", "dar", "δώσε", "给"],
  "supergemma": "give",
  "model_agnostic": "give"
}
```

Selection criteria:

```text
lowest measured token cost
meaning recovery above threshold
fingerprint consistency
validator success
no unacceptable ambiguity
```

### Predictive backtester

For each Lunum-Sem record:

1. generate Safe/Short/Tight candidate renderings;
2. measure tokens;
3. validate syntax;
4. convert back or answer questions from the representation;
5. score meaning recovery;
6. update model-specific renderer preferences.

### Parallel datasets worth exploring

The discussion identified multilingual parallel/evaluation resources such as:

- FLORES-200;
- OPUS collections;
- Tatoeba;
- WikiMatrix;
- CCMatrix;
- NLLB-related corpora;
- sentence-transformers parallel sentence datasets;
- human-translated public-domain literature and multi-generation translations for semantic calibration.

The literature idea is best used to **design and audit the language**, not to claim access to exact hidden training data. Multiple human translations can reveal which meaning survives across languages and which information is stylistic, ambiguous, or culturally specific.

---

## 10. Training position

The user does not currently need to train a full model in Lunum.

Recommended order:

1. prompt + grammar + validator;
2. Lunum skill/tool interface;
3. background memory conversion;
4. collect high-quality human-audited pairs;
5. optionally train LoRA/QLoRA elsewhere;
6. return the adapter to the local llama.cpp stack.

The GGUF file is primarily an inference artifact. A normal adapter path begins from the original/base training format rather than fully retraining a quantized GGUF on a handheld device. The ROG Ally X is suitable for inference, tokenizer experiments, corpus generation, and perhaps tiny adapter experiments, but not practical full 4B training.

---

## 11. Lunum as a skill/tool

Recommended explicit tool contract:

```json
{
  "input": {
    "text": "...",
    "source_language": "en",
    "task": "canonicalize_memory",
    "category": "preference"
  },
  "output": {
    "lunum_sem": {},
    "lunum_fp": "...",
    "lunum_code": "...",
    "valid": true,
    "confidence": 0.94,
    "risk": "low",
    "context_eligible": true
  }
}
```

The local product should own:

- calling the converter;
- validation/repair;
- persistence;
- retrieval integration;
- context selection;
- fallback;
- logging.

---

## 12. Shadow rollout plan

### Phase 1 — storage only

- generate Lunum fields during memory consolidation;
- validate;
- store original and Lunum forms;
- use fingerprints for analysis/dedup, not context.

### Phase 2 — shadow mixed

- compile natural and mixed contexts;
- serve natural context;
- measure exact token savings;
- optionally evaluate both answers;
- log differences and failure categories.

### Phase 3 — guarded mixed

- inject mixed context for low-risk categories;
- maintain natural fallback;
- disable per session or per category on failure.

### Phase 4 — expansion

- expand eligible categories only after enough real data;
- improve conditionals, co-reference, and role signatures;
- test other model/provider renderer profiles.

Suggested stop conditions:

```text
failure rate > 3%
quality delta < -0.05
negation or safety constraint changes
conditional-action loss increases
wrong-entity rate increases
```

---

## 13. Failure taxonomy

Log at least:

```text
dropped_conjoined_action
condition_loss
negation_loss
subject_loss
wrong_entity
wrong_time
wrong_modality
Lunum_echo
style_loss
exact_wording_loss
safety_constraint_loss
invalid_code
low_confidence_conversion
```

A recurring failure should downgrade the associated category/predicate from Lunum context eligibility until fixed.

---

## 14. Current evidence and interpretation

### What has been demonstrated

- A verbose semantic interlingua alone is not prompt compression.
- Telegraph-style Lunum-Code can beat natural text under the target tokenizer.
- Single-memory QA can preserve quality while reducing context tokens.
- Multi-memory contexts with distractors can preserve quality in default mode.
- Mixed mode remains robust when full Lunum loses part of a conditional instruction.
- A stable semantic layer plus adaptive renderer is a credible route to provider agnosticism.

### What has not been demonstrated

- universal savings across all tokenizers/providers;
- reliable full-chat or chain-of-thought replacement;
- robust handling of all conditionals, nested events, and nuanced language;
- production-scale multilingual independent conversion convergence;
- a trained Lunum-native model;
- safety validation at product scale.

---

## 15. Immediate tasks for the receiving agent

1. Read the current 2.7 package under `current/Lunum-2.7-Handoff/`.
2. Run its static tests.
3. Inspect the actual OpenUnum database schema before applying migrations.
4. Port/merge eligibility and context compiler logic into the product's ES module architecture.
5. Implement **shadow_mixed**, not immediate mixed production serving.
6. Add exact `/tokenize` measurements to real context compilation.
7. Add answer comparison using the already successful local response extraction/scoring approach.
8. Log failures by memory category and predicate.
9. Run at least 100 representative shadow sessions before changing the user-visible context path.
10. Add an independent multilingual conversion test: each language must be converted separately, then fingerprints compared. Do not reuse one gold Lunum line for all translations.
11. Improve conditional rendering before considering conditionals eligible.
12. Build renderer profiles for at least SuperGemma plus one other tokenizer/model family.

---

## 16. Public-safe summary

A short public description used in the discussion:

> Lunum is one machine-first language layer targeting both multilingual semantic memory/retrieval and compact model-facing context. In controlled local SuperGemma tests, mixed-mode memory preserved QA quality while reducing memory-context tokens by roughly 20–25%.

Do not publicly disclose full registry, grammar, internal evaluation corpus, or product integration details unless intentionally open-sourcing them.

---

## 17. Artifact layout in this handover

```text
README.md
LUNUM-COMPLETE-HANDOVER.md
MANIFEST-SHA256.txt
FILE-INVENTORY.md
current/
  Lunum-2.7-Handoff/          extracted current package
artifacts/
  version_zips/               every Lunum zip still available in the session
  standalone_docs/            standalone plans, reports, contracts, and notes
  legacy_extracted/           early extracted package directories still available
```

The version zips are intentionally preserved as originally generated. Some content is duplicated between standalone documents, extracted legacy folders, and version zips; this preserves provenance and prevents accidental loss.
