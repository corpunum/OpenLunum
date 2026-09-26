# Project status

**As of 2026-09-26.** Experimental research/reference implementation; not a qualified general production dependency. Current code and versioned evidence outrank this summary. [GitHub issues](https://github.com/corpunum/OpenLunum/issues) track active work.

## What exists

Six workspace packages provide semantic types, candidate validation, canonicalization, versioned fingerprints, comparison/rendering, CLI/MCP surfaces, an HTTP scaffold and a typed product adapter. Some paths are legacy or experimental. Use the [package boundaries and runnable example](README.md), not historical completion scores, to find the entry point.

The runtime candidate schema is `lunum-sem/0.1-draft`; the current strict semantic fingerprint path emits `lfp:2.1`. Other schema/fingerprint contracts and migration fixtures coexist. A file named `1.0` or a frozen internal contract does not establish external ratification, universal compatibility or production support.

## What the current evidence says

**Live client extraction and first consumer benchmark, 2026-09-26 ([evaluation summary](reports/diagnostic/2026-09-26/EVALUATION.md), self-reviewed).** Claude Code (`claude-sonnet-5`) was run through the MCP tools, with repeated runs.
- Missing-argument refusals are now reliable on the probe sets.
- V8 exact identity was stable at 16/16 across three repetitions.
- The new `allow` `action` role introduced a permission-encoding ambiguity (2 V8 rows) and over-refusal of unmapped verbs.

In the first standalone-consumer benchmark, natural text deduplicated by Lunum fingerprints kept every answer with 51% fewer tokens. **The saving comes entirely from identity-based deduplication, not from compact Lunum-Code**, which costs more tokens per fact than English. The default renderer loses meaning. The corpus is small and paraphrase-heavy, so this is a direction, not a general result.

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

1. **Permission encoding rule.** Use `allow`/`prohibit` only when a permitting party is stated; otherwise the modality is `permission` on the action's own predicate. Needs a mechanical check or a frame constraint; instructions alone have not held.
2. **Verb vocabulary.** Decide how to cover common actions (view, edit, download) as predicate aliases or new predicates. Evaluate on a fresh probe set, never on the verbs that motivated the change.
3. **A realistic consumer corpus.** The benchmark needs memory with a natural duplication rate, retrieval rather than full-context, more questions, a second answering model, and extraction cost amortized over queries. Until then the 51% figure is specific to a paraphrase-built corpus.
4. **Renderer default.** Do not ship 0.1 as the model-facing default; decide between 0.2 and natural-text-by-identity using the benchmark.

#685 still needs a human native English review of the V8 English strings. It is recorded as blocked on that input, not re-audited.

OpenUnum is a separate product. The in-tree compatibility adapter is not independent adoption evidence and is not needed to use the core.

## Licensing and contributions

Original OpenLunum code is now **Apache-2.0**, following the owner's explicit authorization on 2026-09-14. [LICENSE](LICENSE) contains the terms; [LICENSE.md](LICENSE.md) explains scope and unchanged third-party terms. Package publication flags and all capability limitations above are unchanged. [CONTRIBUTING.md](CONTRIBUTING.md) separates human feedback from managed-agent coordination.

No readiness/completion percentages are maintained. Historical scorecards are [archived and superseded](research/archive/readiness-before-public-review-20260914.md), not erased or accepted as current evidence.
