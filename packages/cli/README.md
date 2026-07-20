# @corpunum/lunum-cli

Command-line interface for Lunum semantic operations.

## Purpose

Provides inspect, encode, compile, and migrate operations via CLI for products and developers that prefer external preprocessing and evaluation.

## Commands

### Inspect

```bash
# Inspect a text string for Lunum semantics
node packages/cli/dist/src/cli.js inspect --text "The user prefers concise answers."
```

### Encode

```bash
# Encode text into Lunum-Sem JSON
node packages/cli/dist/src/cli.js encode --sem examples/preference.sem.json
```

### Migrate

```bash
# Forward migration 0.1 → 0.2 (dry-run, no file changes)
node packages/cli/dist/src/cli.js migrate record.json --from 0.1 --to 0.2 --dry-run

# Backward migration 0.2 → 0.1 (dry-run)
node packages/cli/dist/src/cli.js migrate record.json --from 0.2 --to 0.1 --dry-run

# In-place migration (transforms and writes back to file)
node packages/cli/dist/src/cli.js migrate record.json --from 0.1 --to 0.2
```

The migrate command supports:
- Single records or arrays of records
- Bidirectional migration: `--from 0.1 --to 0.2` (forward) and `--from 0.2 --to 0.1` (backward)
- `--dry-run` mode: reports schema versions, fingerprints, warnings, and validation status without modifying files
- In-place write mode: transforms records and writes back to file using atomic writes (temp file → rename)
- Source schema validation: verifies records match `--from` version before migrating
- Destination schema validation: verifies migrated records pass target schema constraints
- MigrationWarning details: field-level warnings with codes and messages for each record
- Fail-closed: exits with error (exit code 1) when destination validation fails in write mode
- Better record ID resolution: uses record.id or source.text prefix for error reporting

### Quality Gate

```bash
# Evaluate a single record from a file
node packages/cli/dist/src/cli.js quality-gate --input record.json

# Evaluate a batch (JSON array, JSONL, or a wrapped {"records": [...]} container) from stdin
cat records.jsonl | node packages/cli/dist/src/cli.js quality-gate

# Fail on warnings too (not just hard gate failures)
node packages/cli/dist/src/cli.js quality-gate --input records.json --strict

# Write the report to a file (atomic: temp file + rename) and print a markdown report to stdout
node packages/cli/dist/src/cli.js quality-gate --input records.json --output report.json --format markdown
```

`lunum quality-gate` runs the same record versions/schemas the `@corpunum/lunum` quality-gate library already validates (`lunum-record/0.1-draft` + `lunum-sem/0.1-draft`, or `lunum-record/0.2` + `lunum-sem/0.2`) — it does not invent a new input schema. Input can be:

- a single JSON record object,
- a JSON array of records,
- a wrapped object with a `records`, `items`, or `data` array,
- JSONL (one JSON record per line),

read from `--input <file>` / `--file <file>` (`-` or omitted means stdin).

Flags:
- `--strict` — warnings from any gate cause a non-zero exit, not just hard failures.
- `--min-pass-rate <0-1>` — override the library's default minimum overall pass rate.
- `--format json|markdown` — report format on stdout (default `json`); markdown is produced by the library's own `generateCIReport`.
- `--output <path>` — additionally write the JSON report to a file, atomically (temp file in the same directory, then renamed into place — never a partially written file).

Exit codes:
- `0` — all gates pass.
- `1` — gates pass but at least one gate reported a warning, and `--strict` was set.
- `2` — a gate failed, the input was malformed or empty, a record failed schema validation, or the command was used incorrectly. The report (if one was produced) goes to stdout; the error/diagnostic message always goes to stderr.

**Fail-closed batches:** if any record in a batch is malformed JSON or fails record-schema validation, the whole batch is rejected immediately (exit `2`) — there is no partial evaluation of the records that did parse.

**This command is a thin wrapper.** All scoring, thresholding, and pass/warn/fail policy lives in the `@corpunum/lunum` library (`runQualityGates` / `generateCIReport` in `packages/core/src/quality-gate-ci.ts`); `quality-gate` only parses flags, reads/validates input, calls that library, and formats the result. See "Three ways to run quality gates" below for how this relates to the library API and the hosted CI workflow.

## Usage

```bash
# Build the CLI
pnpm --filter @corpunum/lunum-cli build

# Run an operation
node packages/cli/dist/src/cli.js <command> [options]
```

## Three ways to run quality gates

It's easy to conflate these three surfaces — they wrap the same underlying logic but serve different audiences:

1. **Library API** (`packages/core`, `@corpunum/lunum`): `runQualityGates(records, config)` and `generateCIReport(report)`, exported from `packages/core/src/quality-gate-ci.ts`. This is the actual implementation — all scoring/thresholding policy lives here. Use it when you're integrating quality gates into your own Node.js program.
2. **This CLI command** (`packages/cli`, this file): `lunum quality-gate`, published as part of `@corpunum/lunum-cli`. A local, user-facing entry point for developers who want a pre-push/pre-commit feedback loop without writing code — it calls the library API above and does nothing else. Not used by CI.
3. **The hosted CI workflow** (`scripts/run-quality-gates-ci.mjs`, wired up by `.github/workflows/quality-gate.yml`): the repo-internal runner that evaluates the protected fixture dataset (`datasets/protected/`) on every relevant PR and posts a GitHub Step Summary. It is *not* published in `@corpunum/lunum-cli` or `@corpunum/lunum` and cannot be invoked by downstream consumers of either package — it only exists to gate this repository's own CI.

## Limitations

- CLI is a thin wrapper around the core package; heavy computation happens in `@corpunum/lunum`.
- Output formats are human-readable; programmatic consumers should prefer the library API.

## Status

**Prototype.** Functional CLI with inspect, encode, compile, and migrate. Production-grade error handling and streaming output are pending.
