# Project status

**As of 2026-09-26.** Experimental research/reference implementation; not a qualified general production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track active work.

## What exists

Six workspace packages provide semantic types, candidate validation, canonicalization, versioned fingerprints, comparison/rendering, CLI/MCP surfaces, an HTTP scaffold and a typed product adapter. Some paths are legacy or experimental. Use the [package boundaries and runnable example](README.md), not historical completion scores, to find the entry point.

The runtime candidate schema is `lunum-sem/0.1-draft`; the current strict semantic fingerprint path emits `lfp:2.1`. Other schema/fingerprint contracts and migration fixtures coexist. A file named `1.0` or a frozen internal contract does not establish external ratification, universal compatibility or production support.

## What the current evidence says

**Live client extraction, 2026-09-26 ([evaluation summary](reports/diagnostic/2026-09-26/EVALUATION.md), self-reviewed).** Claude Code (`claude-sonnet-5`) was run through the MCP tools on V8 and on two fresh missing-argument probe sets: 64 English and Greek sentences, $12.56 in total.
- Tool delivery works.
- On V8, after closing contract gaps (in-sample), source-relative matches reached 18/18 and exact identity 15/15.
- Every probe sentence with its argument stated was parsed. 8 of 10 with a missing argument were refused, in each probe set.

The remaining failure is `allow`/`prohibit` with a verb complement ("allows Priya to view"): the model uses the verb as the theme, and the frame's own description permits that reading. Placeholder fillers no longer get identity (decisions/0007). An added instruction to abstain after rejection did not change model behaviour. Results move by about one item between identical runs.

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

1. **Owner decision: what `theme` means in `allow`/`prohibit`.** Either it is the object or resource, and a sentence without one must be refused; or add an `action` role. This is a frame change (new registry hash, golden vectors, new V8 profile) and blocks the last known missing-argument failure.
2. **Repeat runs before claiming differences.** Run each configuration at least three times and report spread. Single runs move by about one item.
3. **The standalone-consumer milestone.** One consumer with a frozen natural-text baseline, real extraction, a named tokenizer, task-quality results, costs and fallback coverage. No compression or benefit claim exists until this does.

#685 still needs a human native English review of the V8 English strings. It is recorded as blocked on that input, not re-audited.

OpenUnum is a separate product. The in-tree compatibility adapter is not independent adoption evidence and is not needed to use the core.

## Licensing and contributions

Original OpenLunum code is now **Apache-2.0**, following the owner's explicit authorization on 2026-09-14. [LICENSE](LICENSE) contains the terms; [LICENSE.md](LICENSE.md) explains scope and unchanged third-party terms. Package publication flags and all capability limitations above are unchanged. [CONTRIBUTING.md](CONTRIBUTING.md) separates human feedback from managed-agent coordination.

No readiness/completion percentages are maintained. Historical scorecards are [archived and superseded](research/archive/readiness-before-public-review-20260914.md), not erased or accepted as current evidence.
