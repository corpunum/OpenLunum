# Changelog

## Since 0.2.0

### Added — semantic contract

- Expanded typed structures: time, quantity, uncertainty, reference, and modality.
- Canonical conformance vectors and property tests.
- Near-semantic fingerprint design separate from exact identity.

### Added — renderer and tokenizer

- Tokenizer measurement framework for `generic-en-pivot/0.1`.
- Safe, short, and tight renderer profiles without changing semantics.
- llama.cpp-compatible tokenizer counting.
- Full-prompt quality gates for local-model evaluation.

### Added — realization

- Lunum-Sem → English and Greek realization.
- Protected-literal and independent semantic scoring.
- Round-trip self-consistency as a secondary metric.
- Spanish and Indonesian realization after English/Greek gates.

### Added — multilingual parsing

- English and Greek parse baselines on `multilingual-core-v1`.
- Spanish and Indonesian baseline fixtures.
- Abstention and clarification outputs for low-confidence parses.
- Error taxonomy for entity, role, negation, condition, quantity, time, and ambiguity failures.

### Added — context and retrieval

- Context quality measurement framework.
- Category/risk/confidence policy datasets.
- Multilingual retrieval and false-equivalence tests.

### Added — adoption

- MCP (Model Context Protocol) reference implementation server with parse, realize, fingerprint, retrieve, and validate tools.
- Conformance reports for hook/plugin/CLI integration paths.
- OpenUnum adapter shadow-mode experiment.

### Added — infrastructure

- Local PR reviewer with Tier 3 benchmark and review loop.
- Pi-watchdog for mechanical loop babysitting.
- PR-fixing mode in Pi task prompt.
- Docs maintenance loop for post-merge documentation sync.

### Changed

- `fix(mcp)`: use workspace protocol for `@corpunum/lunum` and update lockfile.
- Various TypeScript type-error fixes across packages.

### Known limitations

- The MCP reference server uses placeholder handlers for parse/realize/fingerprint/retrieve/validate; production integration with `@corpunum/lunum` core is pending.
- Multilingual realization measures protected-literal coverage; independent semantic judgment remains required.
- Tokenizer profiles are measured but not yet optimized per-target.
- Near-semantic fingerprints are designed but not yet implemented.

## 0.2.0 — 2026-07-15

### Added

- Strict TypeScript reference SDK, CLI, evaluation harness, and OpenUnum adapter package.
- Reproducible pnpm lockfile/CI contract and protected-dataset PR boundary.
- `START_HERE.md`, worker/orchestrator operating model, experiment and evaluation protocols, and work queue.
- Local OpenAI-compatible model doctor and bounded parse/realization experiment runner.
- Machine-readable model, renderer, and experiment profile schemas.
- English, Greek, Spanish, and Indonesian bootstrap development fixtures with shared gold semantics.
- Generated per-item results, failures, summaries, and reports.

### Changed

- Renamed the default renderer profile to `generic-en-pivot/0.1` to make its non-universal role explicit.
- Active implementation moved from untyped `.mjs` source to TypeScript while publishing ESM JavaScript.

### Known limitations

- The parser and realizer are model-prompt experiment runners, not production semantic engines.
- Bootstrap multilingual fixtures are visible development data and do not prove language support.
- Realization currently measures protected-literal coverage; independent semantic judging remains required.
- Exact tokenizer adapters and protected product datasets remain future work.

## 0.1.0 — 2026-07-15

Initial OpenLunum and Lunum-I foundation.
