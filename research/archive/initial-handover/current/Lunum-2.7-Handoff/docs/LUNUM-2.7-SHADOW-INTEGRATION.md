# Lunum-2.7 Shadow Integration

## Why 2.7 exists

Lunum-2.6 showed that mixed mode is the robust product candidate:

- Full Lunum compressed well but had one conditional miss in completion mode.
- Mixed mode compressed strongly and preserved quality across modes.

So 2.7 does **not** recommend immediate full replacement. It recommends shadow-mode rollout.

## Architecture

```text
Memory extraction
  -> original natural text
  -> Lunum-Sem
  -> Lunum-FP
  -> Lunum-Code
  -> eligibility classifier
  -> context compiler
  -> shadow evaluator
```

## Runtime modes

### natural

Inject only original natural memory text.

### lunum

Inject only Lunum-Code.

### mixed

Inject Lunum-Code only for eligible memories; otherwise inject original natural text.

### shadow_mixed

User-visible model gets natural context. System also compiles mixed context and logs token savings / optional evaluation.

## First production target

Use `mixed`, not `lunum`.

## Eligibility

Eligible for Lunum-Code context:

```text
confidence >= 0.90
risk == low
category in:
  preference
  simple_fact
  tool_event
  project_state
  retrieval_rule
  system_fact
```

Not eligible:

```text
conditional_instruction
safety_constraint
safety_event
exact_quote
code
command
file_path
legal
emotional_nuance
low_confidence
```

## Required invariant

Always keep the original natural text.
