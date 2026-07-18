# CLI Pipeline — Standalone Adoption Path

## Purpose

Standalone CLI pipeline: `lunum parse | lunum realize | lunum render`
with documented examples. Implements the WORK_QUEUE v4 release gate 6 item:
"Add a second adoption path: standalone CLI pipeline with documented examples."

## Motivation

The first adoption path is the OpenUnum adapter for product integration.
This provides a second path: a standalone CLI that can be used:

1. **Offline** — no external services required
2. **Pipeline-friendly** — supports stdin/stdout piping
3. **Scriptable** — easy to integrate into shell scripts
4. **Development-friendly** — quick experimentation with Lunum-Sem

## Commands

### `lunum pipeline`

The main pipeline command that chains parse → realize → render.

```bash
# Full pipeline (default)
lunum pipeline --text "The system processes requests." --language en

# Parse only
lunum pipeline --text "The system processes requests." --mode parse

# Realize only
lunum pipeline --text "The system processes requests." --mode realize

# Render only (requires input file)
lunum pipeline --input record.json --mode render

# Code output (for piping to other tools)
lunum pipeline --text "The system processes requests." --output code

# From stdin
echo '{"source": {"text": "Hello world"}}' | lunum pipeline
```

### Usage

```
lunum pipeline [options]

Options:
  --text <text>       Input text
  --input <file>      Input file (JSON)
  --language <lang>   Source language (default: en)
  --category <cat>    Semantic category (default: simple_fact)
  --risk <level>      Risk level: low/medium/high/unknown (default: low)
  --mode <mode>       Pipeline mode: full/parse/realize/render (default: full)
  --output <format>   Output format: json/code (default: json)
```

### Other Commands

```bash
# Inspect text as Lunum sidecar
lunum inspect --text "The meeting is at 3pm."

# Encode a Lunum-Sem JSON file
lunum encode --sem sem.json

# Compile context messages
lunum compile --messages messages.json --mode mixed

# Migrate schema versions
lunum migrate records.json --from 0.1 --to 0.2 [--dry-run]
```

## Examples

### Example 1: Simple Fact

```bash
$ lunum pipeline --text "The budget was approved for Q1."
{
  "pipeline": "parse | realize | render",
  "input": {
    "text": "The budget was approved for Q1.",
    "language": "en",
    "category": "simple_fact",
    "risk": "low"
  },
  "parse": {
    "sidecar": {
      "lunumCode": "budget approved Q1",
      "lunumFp": "lsf:0.1:sha256:...",
      "lunumMeta": { ... }
    }
  },
  "realize": {
    "recordVersion": "lunum-record/0.1-draft",
    "fingerprint": "sha256:...",
    "semSchema": "lunum-sem/0.1-draft",
    "clauses": 1,
    "renderings": { ... }
  },
  "output": {
    "code": "approve(budget, Q1)",
    "fingerprint": "sha256:...",
    "policy": { ... }
  }
}
```

### Example 2: Conditional Instruction

```bash
$ lunum pipeline --text "If the disk is full, delete temporary files." \
    --category conditional_instruction --risk medium
{
  "pipeline": "parse | realize | render",
  "input": {
    "text": "If the disk is full, delete temporary files.",
    "language": "en",
    "category": "conditional_instruction",
    "risk": "medium"
  },
  ...
}
```

### Example 3: Code Output (Piping)

```bash
# Extract just the Lunum code for use in other tools
$ lunum pipeline --text "User Alice sent a message." --output code
send_message(alice, message)

# Pipeline with grep
$ lunum pipeline --text "Server restart likely." --output code | grep -i restart
```

### Example 4: From JSON Input

```bash
$ echo '{"source": {"text": "Temperature is 25C."}}' | lunum pipeline --mode parse
{
  "pipeline": "parse | realize | render",
  "parse": {
    "sidecar": {
      "lunumCode": "temperature 25C",
      ...
    }
  },
  ...
}
```

### Example 5: Parse-Only Mode

```bash
$ lunum pipeline --text "The user did not receive notification." \
    --category simple_fact --mode parse
{
  "pipeline": "parse | realize | render",
  "parse": {
    "sidecar": {
      "lunumCode": "receive_notification user alert",
      "lunumFp": "lsf:0.1:sha256:...",
      "lunumMeta": {
        "eligible": false,
        "semantic": false,
        ...
      }
    }
  },
  ...
}
```

## Pipeline Architecture

```
Input (text/JSON) → Parse (deriveSidecar) → Realize (createRecord) → Render (renderSem)
                          ↓                        ↓                      ↓
                    lunumCode + fp          full LunumRecord       Lunum rendering code
```

### Steps

1. **Parse** — `deriveLunumSidecar()` creates a sidecar with lunumCode and fingerprint
   - Uses surface telegraph for unstructured text
   - Classifies category, risk, confidence

2. **Realize** — `createRecord()` creates a full LunumRecord
   - Canonicalizes the sem structure
   - Computes fingerprint
   - Generates rendering
   - Applies policy classification

3. **Render** — `renderSem()` produces the Lunum code
   - Safe/short/tight profile support
   - Token counting

## Integration with CI

The CLI pipeline can be used in CI/CD for:

```yaml
# GitHub Actions example
- name: Validate Lunum conversion
  run: |
    echo '{"source": {"text": "Test input"}}' | \
      lunum pipeline --mode parse --output json | \
      jq -e '.parse.sidecar.lunumCode != null'
```

## Limitations

- Parse step uses heuristic surface telegraph (not LLM-based parsing)
- Output quality depends on input text structure
- No automatic language detection
- Policy classification uses simple rules

## References

- WORK_QUEUE v4: Release gate 6 — adoption paths
- `packages/cli/src/cli.ts` — CLI implementation
- `packages/core/src/derive.ts` — deriveLunumSidecar, createRecord
- `packages/core/src/render.ts` — renderSem
