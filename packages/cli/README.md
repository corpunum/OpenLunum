# @corpunum/lunum-cli

Command-line interface for Lunum semantic operations.

## Purpose

Provides inspect, encode, and compile operations via CLI for products and developers that prefer external preprocessing and evaluation.

## Commands

```bash
# Inspect a text string for Lunum semantics
node packages/cli/dist/src/cli.js inspect --text "The user prefers concise answers."

# Encode text into Lunum-Sem JSON
node packages/cli/dist/src/cli.js encode --sem examples/preference.sem.json
```

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

**Prototype.** Functional CLI with inspect, encode, and compile. Production-grade error handling and streaming output are pending.
