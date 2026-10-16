# Parallel documents v1: plan (not yet pre-registered, data not yet reachable)

**2026-10-16. Proposed by the owner:** test Lunum on meaning as professional translators preserve it, paragraph by paragraph and page by page, using existing bilingual publications instead of per-item human review.

## Why this is the right reference

A professional translation is a human meaning judgement made at document scale. The words and sentence boundaries differ between EN and EL, but the meaning is held fixed. If Lunum is language-neutral middleware, then **what it records from the two versions of one document should match far better than what it records from two unrelated documents.**

## Sources

| Source | Translation | Status |
|---|---|---|
| **Europarl** (European Parliament debates, EN–EL, via OPUS) | Professional human translators; aligned by speech and paragraph | Preferred. **Blocked** by the environment network policy |
| **EUR-Lex** (EU legislation and summaries, EN and EL) | Professional human translators | **Blocked** (S1 already uses extracts) |
| Tatoeba (already in `datasets/third-party`) | Volunteer translators; single sentences | Available, but sentence-level only |
| en.protothema.gr | **Mostly machine-translated** with light human editing, by the outlet's own account | Not a human-meaning reference; would compare Lunum against another model. Also blocked. |
| Translated books | Professional translators | Copyrighted. Public-domain EN–EL pairs are rare; Gutenberg is blocked |

A model's *memory* of translated books is not used as a reference: recalled text cannot be verified and may be invented.

**Copyright:** only URLs, hashes and aggregates are published. Article and book text stays private to the run.

## Measures (to be fixed in the pre-registration)

1. **Anchors (free, deterministic):** for each document pair, the language-neutral literals found by core's discourse `unitLiterals`: numbers, dates, identifiers and URLs. The measure is the overlap between the EN and EL versions, compared with mismatched pairs (EN of doc *i* with EL of doc *j*). This tests the middleware's literal layer across languages, with no model involved.
2. **Meaning structure (paid, sampled):**
   - Lunum extraction on every sentence of both versions.
   - Per document, the multiset of meaning structures (predicate, role names, negation, modality, mood) compared EN vs EL and against mismatched pairs.
   - Coverage reported per language.
3. **Same meaning, judged:** a cross-vendor model with no shared training lineage judges whether the two documents' Lunum records state the same content, whatever words are used. The owner spot-checks a sample, and the agreement rate is reported.
4. **Exact identity overlap:** reported for completeness. Under `lfp:2.1` it is expected to be low, because open terms keep their language (clc-v1).

**Signal test for every measure:** the matched-pair score must be clearly above the mismatched-pair baseline. The exact margin is set in the pre-registration.

## Size and cost

Planned size: 20 Europarl speeches of about 8 sentences per side, so about 320 extractions. At about $0.14 each, that is **about $45**. The anchor measure (1) is free and can run on hundreds of documents.

## What is needed

The environment's network access must allow these hosts:
- `opus.nlpl.eu`
- `object.pouta.csc.fi` (the OPUS downloads)
- `eur-lex.europa.eu`
- optionally `huggingface.co`, for mirrored parallel corpora

Then:
1. a deterministic, seeded selection;
2. a pre-registration;
3. the run.
