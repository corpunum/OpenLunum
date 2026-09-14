# Project status

**As of 2026-09-14.** Experimental research/reference implementation; not a qualified general production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track active work.

## What exists

Six workspace packages provide semantic types, candidate validation, canonicalization, versioned fingerprints, comparison/rendering, CLI/MCP surfaces, an HTTP scaffold and a typed product adapter. Some paths are legacy or experimental. Use the [package boundaries and runnable example](README.md), not historical completion scores, to find the entry point.

The runtime candidate schema is `lunum-sem/0.1-draft`; the current strict semantic fingerprint path emits `lfp:2.1`. Other schema/fingerprint contracts and migration fixtures coexist. A file named `1.0` or a frozen internal contract does not establish external ratification, universal compatibility or production support.

## What the current evidence says

The [V8 iteration-2 report](experiments/natural-development-v8/extraction/results-iteration2.json) records a 24-row English/Greek development task: 18 parse targets, 17 parse submissions, one false abstention, and six correct expected abstentions. It reports 14 exact matches among 14 legitimately comparable outputs, not 24/24 task success. Five of six parse groups are complete. See the [freeze/iteration manifest](experiments/natural-development-v8/extraction/iteration2-manifest.json), [review scope](experiments/natural-development-v8/README.md), and [issue #685](https://github.com/corpunum/OpenLunum/issues/685) for limitations and acceptance state.

This is a narrow development result after iterative work, not protected generalization, broad multilingual support, or a training result. Human Greek review covers specific strings; it is not human validation of every target or English sentence.

## What is not established

- Reliable general raw-text-to-Sem conversion across languages and domains.
- A validated general near-semantic threshold under extraction errors.
- Model/tokenizer-specific compaction that preserves downstream task quality in a qualified live benchmark.
- Production-scale security, operations, source-retention/deletion integration or unrelated-product adoption.
- A trained semantic compiler that improves an untouched evaluation set.

The repository contains relevant code, tests, historical runs and simulations. Their existence does not close these gaps. [Evidence and limitations](docs/LUNUM_READINESS.md) distinguishes those categories.

## Current work and boundaries

#685 remains the source-only evaluation track. Its specific review and false-abstention limitations must be resolved or explicitly retained; this public-docs correction does not change its acceptance criteria or declare it complete. Do not keep launching audits when the required external input has not changed.

A useful subsequent public milestone is one standalone consumer with a frozen natural-text baseline, actual extraction where claimed, named tokenizer/model, task-quality results, costs, failures and fallback coverage. The supplied-Sem demo is an onboarding aid, not that milestone.

OpenUnum is a separate product. The in-tree compatibility adapter is not independent adoption evidence and is not needed to use the core.

## Licensing and contributions

Original OpenLunum code is now **Apache-2.0**, following the owner's explicit authorization on 2026-09-14. [LICENSE](LICENSE) contains the terms; [LICENSE.md](LICENSE.md) explains scope and unchanged third-party terms. Package publication flags and all capability limitations above are unchanged. [CONTRIBUTING.md](CONTRIBUTING.md) separates human feedback from managed-agent coordination.

No readiness/completion percentages are maintained. Historical scorecards are [archived and superseded](research/archive/readiness-before-public-review-20260914.md), not erased or accepted as current evidence.
