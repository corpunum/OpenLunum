# Project status

**As of 2026-09-26.** Experimental research/reference implementation; not a qualified general production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track active work.

## What exists

Six workspace packages provide semantic types, candidate validation, canonicalization, versioned fingerprints, comparison/rendering, CLI/MCP surfaces, an HTTP scaffold and a typed product adapter. Some paths are legacy or experimental. Use the [package boundaries and runnable example](README.md), not historical completion scores, to find the entry point.

The runtime candidate schema is `lunum-sem/0.1-draft`; the current strict semantic fingerprint path emits `lfp:2.1`. Other schema/fingerprint contracts and migration fixtures coexist. A file named `1.0` or a frozen internal contract does not establish external ratification, universal compatibility or production support.

## What the current evidence says

**Live client extraction works end to end (2026-09-26, [run record](reports/diagnostic/2026-09-26/claude-code-v3/README.md), self-reviewed).** Claude Code (`claude-sonnet-5`) ran all 24 V8 items through the MCP tools with 0 tool errors. It answered 18/18 parse targets and matched the predicate, role names, modality and nesting of each. Exact identity matched 9 of 15 comparable parses, and 3 of 6 abstention targets were handled correctly. The other three are the safety failure: "Dana allows Mira to access." (object missing) was parsed as `theme: access` instead of refused, and core's grounding accepted it. The other misses are contract gaps: `%` versus `percent`, and nouns such as *battery* that have no term type. The Sep 15 attempt failed because `lunum_build_candidate` advertised no arguments; that is fixed.

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

1. **Missing-argument grounding.** Core must not treat a role filled only by the predicate's own lexical head (`allow … theme: access`) as grounded. This is a semantic rule change, so it gets a versioned decision and tests. Then re-run the three failing rows plus a small new set of missing-argument probes.
2. **Contract gaps from the live run.** Decide `%` → `percent` (or accept both) and extend the term-type table (battery, operator, task) in a new task-profile version. Do not edit V8 artifacts; supersede them.
3. **The standalone-consumer milestone.** One consumer with a frozen natural-text baseline, real extraction, a named tokenizer, task-quality results, costs and fallback coverage. No compression or benefit claim exists until this does.

#685 still needs a human native English review of the V8 English strings. It is recorded as blocked on that input, not re-audited.

OpenUnum is a separate product. The in-tree compatibility adapter is not independent adoption evidence and is not needed to use the core.

## Licensing and contributions

Original OpenLunum code is now **Apache-2.0**, following the owner's explicit authorization on 2026-09-14. [LICENSE](LICENSE) contains the terms; [LICENSE.md](LICENSE.md) explains scope and unchanged third-party terms. Package publication flags and all capability limitations above are unchanged. [CONTRIBUTING.md](CONTRIBUTING.md) separates human feedback from managed-agent coordination.

No readiness/completion percentages are maintained. Historical scorecards are [archived and superseded](research/archive/readiness-before-public-review-20260914.md), not erased or accepted as current evidence.
