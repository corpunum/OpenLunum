# Project status

**As of 2026-09-26.** Experimental research/reference implementation; not a qualified general production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track active work.

## What exists

Six workspace packages provide semantic types, candidate validation, canonicalization, versioned fingerprints, comparison/rendering, CLI/MCP surfaces, an HTTP scaffold and a typed product adapter. Some paths are legacy or experimental. Use the [package boundaries and runnable example](README.md), not historical completion scores, to find the entry point.

The runtime candidate schema is `lunum-sem/0.1-draft`; the current strict semantic fingerprint path emits `lfp:2.1`. Other schema/fingerprint contracts and migration fixtures coexist. A file named `1.0` or a frozen internal contract does not establish external ratification, universal compatibility or production support.

## What the current evidence says

**Live client extraction and consumer benchmark, 2026-09-26 ([evaluation summary](reports/diagnostic/2026-09-26/EVALUATION.md); [independent evaluation](reports/independent-evaluation/2026-09-26/REPORT.md)).** On the development set (V8) and the author's own probe sets, Claude Code (`claude-sonnet-5`) reliably refuses missing-argument sentences and parses fully specified sentences built from framed predicates. An independent session's fresh sentences in ordinary wording parsed only 8 of the 16 it expected to be representable. The gap is frame coverage (23 framed predicates) and permissions with no stated permitter.

In the consumer benchmark, natural text deduplicated by identity used about 60% fewer tokens. `claude-sonnet-5` kept every answer. **`claude-haiku-4-5` got one question wrong in 5 of 9 runs**, adding up paraphrases that extraction had not merged. The MCP default is therefore `natural`, and `identity_dedup` is opt-in. The default Lunum-Code renderer (0.1) loses answers. These are small, self-built corpora; nothing here is a general claim.

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

1. **Frame coverage.** Frame the common registered predicates (read, update, run, approve, access, …), so permissions without a stated permitter and plain statements with those verbs can be represented. Allow imperatives with no agent where other frames do.
2. **Run-time provenance.** The runner must hash the served build against the package it records, and refuse to run on a mismatch. Commit the fingerprint-stability scan used in ADRs.
3. **Out-of-sample evaluation by someone other than the author**, on a larger fresh set, after each change.
4. **Real memory data (owner).** Needed before any token-saving claim.
5. Remaining V8 misses: bare-identifier typing, and the unit `attempts` vs `times`.

#685 still needs a human native English review of the V8 English strings. It is recorded as blocked on that input, not re-audited.

OpenUnum is a separate product. The in-tree compatibility adapter is not independent adoption evidence and is not needed to use the core.

## Licensing and contributions

Original OpenLunum code is now **Apache-2.0**, following the owner's explicit authorization on 2026-09-14. [LICENSE](LICENSE) contains the terms; [LICENSE.md](LICENSE.md) explains scope and unchanged third-party terms. Package publication flags and all capability limitations above are unchanged. [CONTRIBUTING.md](CONTRIBUTING.md) separates human feedback from managed-agent coordination.

No readiness/completion percentages are maintained. Historical scorecards are [archived and superseded](research/archive/readiness-before-public-review-20260914.md), not erased or accepted as current evidence.
