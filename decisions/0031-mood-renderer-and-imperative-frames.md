# ADR 0031: Mood in the English renderer (generic-en-pivot/0.3), imperatives in contract 0.22, weekday/month guards

**Status:** Implemented 2026-10-23 as an **unreleased candidate**, with contract 0.21, under [ADR 0025](0025-contract-freeze-pending-held-out-evidence.md). Self-reviewed by the Claude Code agent (`claude-opus-5-5`). It is released only if the pre-registered bar-2 re-run ([experiments/coverage-a3-v2](../experiments/coverage-a3-v2/PREREGISTRATION.md)) and A3's other bars hold, and the orchestrator agrees. **2026-10-23: bar 2 failed again** ([results](../experiments/coverage-a3-v2/RESULTS.md)), so this stays unreleased.

| Component | Version |
| --- | --- |
| Agent contract | `lunum-agent/0.22` (from 0.21, both unreleased) |
| Instructions | `agent-extraction-instructions/0.10` |
| Instruction package | v28 (v27 stays the A3 run's binding) |
| Renderer | new profile `generic-en-pivot/0.3`; 0.1 and 0.2 unchanged |
| Pivot guards | `pivot-guards/0.3` |
| Protocol, frames, identity | `lunum-protocol/0.7`, `lunum-frame/0.9`, `lfp:2.1`: unchanged |

## Problem

A3 ([results](../experiments/coverage-a3-v1/RESULTS.md)) failed bar 2 for three reasons this ADR addresses:

1. **The renderer drops mood.** `generic-en-pivot/0.2` does not render `kind`, so "Did you sleep at all?" renders as `R assert(subject=you, manner=at all, action=sleep)`, a statement. Nemotron rejected 16 of 17 question records.
2. **Imperatives lumped the verb with its complement.** "Stop looking at me." became `assert(object=me, action=Stop looking)`; every judge rejected it. Contract 0.21 said only "imperatives omit subject".
3. **Judges were not calibrated** before they scored the bar (handled in coverage-a3-v2, not in code).

[pivot-el-en-v2](../experiments/pivot-el-en-v2/RESULTS.md) also left one guard false positive: «Κυριακές» (Sundays) is capitalised in Greek and was flagged as an undeclared name.

## Decision

**Renderer `generic-en-pivot/0.3`** (TS `MOOD_RENDERER`, Rust `render_sem_profile(.., Profile::V03)`, CLI `lunum-render --profile generic-en-pivot/0.3`). It is 0.2 plus mood taken from the record's `kind`:
- `question` → `R question: assert(subject=you, manner=at all, action=sleep)?`
- `instruction` / `command` → `R imperative: …`; when the first clause has no `agent`, `subject`, `actor` or `experiencer`, the implicit addressee is shown: `R imperative to you: assert(object=looking at me, action=Stop)`.
- Every other kind renders byte-identically to 0.2. 0.2 stays installed and unchanged, so earlier evidence keeps its meaning. Parity is checked on all 12,030 golden inputs (643 differ from 0.2) by `crates/lunum-render/tests/golden.rs` and the CLI test.

**Contract 0.22, imperatives.** An imperative uses the general frame its words have with kind `instruction`. The addressee is carried by the kind, so the subject is left out; `action` is the imperative verb alone, with its particle (Stop, Get off); what the verb governs stays whole in its own role (object, or a following -ing / to phrase in `object`); Please goes in `manner`; Don't is `negated`, not a modality. "Stop looking at me." → `assert(action: Stop, object: looking at me)`, kind `instruction`.

- **Why not `subject: you`.** The source-bound check (ADR 0024) refuses a filler that is not words of the source, and "you" is not in "Stop looking at me.". Allowing it would need a core exception, and would let an extractor insert words. The addressee is shown by the renderer from the kind instead ("imperative to you").
- When an extractor does insert "you" into an imperative, the refusal now names the fix ("an imperative's addressee is carried by kind "instruction", so leave the subject out"). This is diagnostic text only.
- **0.22, not 0.21.** The A3 run is bound to 0.21's contract hash (`cd2559d4…`, package v27). Changing the text under the same version would make that evidence ambiguous, so the change is a new version, still unreleased.

**Pivot guards 0.3.** A capitalised Greek weekday or month name (every inflected form as a whole folded word: «Κυριακές», «Μαΐου», «Σαββατοκύριακο») is not an undeclared name when the translation has the matching English word. Names that share letters (Μαίρη, Σάββας, Μάρτιν) are never matched. An English "May" that is capitalised and does not start a sentence is the month, not the modal, for the possibility guard. 0.1 and 0.2 stay reproducible through the `version` option.

## Safety

- Identity: the served-runtime manifest of v28 differs from v27 only in `agent-native.js` (contract text, one diagnostic) and `render.js` (the new profile). Fingerprinting, canonicalisation, the builder, the source-bound and literal-retention checks are byte-identical, so no recorded identity can move. The A3 builder rebuild check still passes (818 inputs, 0 moved).
- Protocol and frame registries, the transport schema and the Rust `lunum-sem` data are unchanged.

## Not established

- Whether 0.22's imperative guidance changes extractor behaviour: measured by coverage-a3-v2 on fresh sentences.
- `instruction` is also the kind of operational policy records ("Users must not delete X"); 0.3 renders those as `imperative:` too. That reads correctly for directives but has not been judged.
