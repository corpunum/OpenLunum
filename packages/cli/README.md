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
- In-place write mode: transforms records and writes back to file
- Detailed results per record: old/new schema, old/new fingerprints, validation status, field-level warnings

## Usage

```bash
# Build the CLI
pnpm --filter @corpunum/lunum-cli build

# Run an operation
node packages/cli/dist/src/cli.js <command> [options]
```

## Limitations

- CLI is a thin wrapper around the core package; heavy computation happens in `@corpunum/lunum`.
- Output formats are human-readable; programmatic consumers should prefer the library API.

## Status

**Prototype.** Functional CLI with inspect, encode, compile, and migrate. Production-grade error handling and streaming output are pending.
