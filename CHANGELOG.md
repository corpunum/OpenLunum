# Changelog

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
