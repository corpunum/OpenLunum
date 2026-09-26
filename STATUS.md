# Project status

**As of 2026-09-26.** Experimental research/reference implementation; not a qualified general production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track active work.

## What exists

Six workspace packages provide semantic types, candidate validation, canonicalization, versioned fingerprints, comparison/rendering, CLI/MCP surfaces, an HTTP scaffold and a typed product adapter. Some paths are legacy or experimental. Use the [package boundaries and runnable example](README.md), not historical completion scores, to find the entry point.

The runtime candidate schema is `lunum-sem/0.1-draft`; the current strict semantic fingerprint path emits `lfp:2.1`. Other schema/fingerprint contracts and migration fixtures coexist. A file named `1.0` or a frozen internal contract does not establish external ratification, universal compatibility or production support.

## What the current evidence says

**Live client extraction and consumer benchmark, 2026-09-26 ([evaluation summary](reports/diagnostic/2026-09-26/EVALUATION.md), self-reviewed).** Claude Code (`claude-sonnet-5`) was run through the MCP tools, three repetitions per configuration, on contract `lunum-agent/0.8`:
- fresh probes: 16/16 in every repetition;
- earlier probes: 38/38 in every repetition;
- V8: refusals 3/3 and exact identity 16–17/16–17 in every repetition, source-relative 19/21.

In the consumer benchmark, **natural text deduplicated by Lunum identity** (context mode `identity_dedup`) kept every answer with 60–62% fewer tokens, for two answering models. **The saving comes from identity-based deduplication, not compact Lunum-Code**, and it grows as extraction converges more paraphrases. The default renderer (0.1) loses answers. The corpus is small and paraphrase-built, so the percentage is not a general claim.

The earlier [V8 iteration-2 report](experiments/natural-development-v8/extraction/results-iteration2.json) (an agent extractor given the repository-side packet) recorded 17/18 source-relative matches, 14/14 exact among comparable, 6/6 abstentions and one false abstention. Both are narrow 24-row development results in English and Greek, not protected generalization, broad multilingual support or a training result. Human Greek review covers specific strings only.

## What is not established

- Reliable general raw-text-to-Sem conversion across languages and domains.
- A validated general near-semantic threshold under extraction errors.
- Model/tokenizer-specific compaction that preserves downstream task quality in a qualified live benchmark.
- Production-scale security, operations, source-retention/deletion integration or unrelated-product adoption.
- A trained semantic compiler that improves an untouched evaluation set.

The repository contains relevant code, tests, historical runs and simulations. Their existence does not close these gaps. [Evidence and limitations](docs/LUNUM_READINESS.md) distinguishes those categories.

## Current work and boundaries

Development is trunk-based on `main` ([operating model](docs/REPOSITORY_OPERATING_MODEL.md)). The earlier multi-agent process is archived.

Next, in order:

1. **Real memory data (blocked on the owner).** The saving depends on how often real memory repeats itself, which a self-authored corpus cannot tell us. Needs a sample of real product memory (for example OpenUnum conversation logs, with consent and redaction), then the same benchmark with retrieval rather than full context, and extraction cost amortized over queries.
2. **Renderer default.** Renderer 0.1 loses answers for both tested models. Make `identity_dedup` or `natural` the recommended model-facing mode, and stop presenting 0.1 as a compact context.
3. **Remaining extraction misses.** A false abstention on "Once …, X is permitted to …", and bare-identifier typing (`attempts on U-31` → `identifier`, not `task`).

#685 still needs a human native English review of the V8 English strings. It is recorded as blocked on that input, not re-audited.

OpenUnum is a separate product. The in-tree compatibility adapter is not independent adoption evidence and is not needed to use the core.

## Licensing and contributions

Original OpenLunum code is now **Apache-2.0**, following the owner's explicit authorization on 2026-09-14. [LICENSE](LICENSE) contains the terms; [LICENSE.md](LICENSE.md) explains scope and unchanged third-party terms. Package publication flags and all capability limitations above are unchanged. [CONTRIBUTING.md](CONTRIBUTING.md) separates human feedback from managed-agent coordination.

No readiness/completion percentages are maintained. Historical scorecards are [archived and superseded](research/archive/readiness-before-public-review-20260914.md), not erased or accepted as current evidence.
