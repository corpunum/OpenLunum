# Guarded codec v1: plan and stage-0 result

**2026-10-27. Self-reviewed. Owner direction:** compression in the spirit of zip/mp3/mp4, with a Rust engine in the middle (stdin → compact view, `expand` → exact original), reaching high levels without losing meaning.

## Idea

Lossy prompt compressors such as the LLMLingua family drop words a small model thinks are unimportant. They make **no guarantee** about what they drop: a "not", a number or a name can go.

Lunum already has deterministic, tested checks for exactly those things. This project combines the two:
1. Any compressor proposes a view of each unit (a sentence, list item or tool field), or omits it.
2. **Lunum verifies every unit:**
   - every literal is kept, counted (paths, hashes, IDs, numbers including number words);
   - negation and modality markers are unchanged (necessity, possibility, future; English and Greek lists);
   - an omitted unit carries a pointer to the exact original, checked by SHA-256.
3. **Units that fail are shown verbatim** (fallback), so the output never breaks an invariant.
4. The engine keeps the originals. `expand(ref)` returns them exactly: lossless for the system, compact for the model.

Prior work, from memory and not re-surveyed here:
- **Lossless compressors** (zstd/xz, and LLM-based ones such as LLMZip and ts_zip) save storage, not context. A model cannot read their output.
- **Soft-token compressors** (gist tokens, in-context autoencoders) need model internals.
- **Prompt pruners** (LLMLingua, Selective Context) are lossy and unguarded.
- **Paging** (MemGPT/Letta, RAG) fetches on demand.

The guarded and verified combination is not something we know to exist.

## What is built

- [`packages/eval/src/guarded-codec.ts`](../../packages/eval/src/guarded-codec.ts):
  - `verifyCompaction(units, language)` and `expandCompaction(units, store)`;
  - built on core's `literalSpellings` and `numbersInText`, and the pivot adapter's `pivotMarkers`;
  - 7 unit tests.
- Unsupported languages fail closed.
- It does not compress: compressors are pluggable.

## Stage 0: free, offline, done

[`stage0.mjs`](stage0.mjs) runs on the English sentence units of the Claude Code transcript of the session that built this. That is 782 units (transcript SHA-256 prefix `7923a3f1`, private). Results are in [stage0-session-aggregates.json](stage0-session-aggregates.json). The compressor is a classic stopword pruner, with a standard toolkit-style English list that includes not/no/nor/can/will/should.

| Mode | Characters saved | Sentences that broke an invariant |
|---|---|---|
| Unguarded stopword pruning | 24.1% | **177 / 782 (22.6%)**: 116 lost a negation, 40 a possibility marker, 22 a necessity marker, 13 a future marker |
| Guarded (never removes negators and modals) | 22.8% | 8 / 782 (1.0%), all "has to" / "need to" necessity |
| **Guarded, verified, with fallback** | **22.5%** | **0** by construction |

Readings:
- A standard compression trick silently flips meaning in about 1 sentence in 5.
- The guards keep almost all of the saving (22.5% against 24.1%) and remove every violation.
- **The verifier also caught a bug in the compressor.** The first version of the pruner deleted "S1" as the stopword "s", "8am" as "am", and "7-of-12" as "of". That made 36 units lose literals, which the verifier flagged. The pruner was fixed before the numbers above.

**Limits:**
- Characters, not tokens.
- No question-answering check.
- One session, in one language for pruning.
- Stopword pruning is a weak compressor. Its numbers show why the guards matter, not how far compression can go.

## Next stages

### Stage 1: real compressors on the owner's data, pre-registered

This runs on the owner's machine: the sessions are private and the model downloads need network access.

**Conditions**, on the same prompt points:
1. verbatim;
2. discourse compaction (existing);
3. a learned token pruner such as LLMLingua-2, unguarded;
4. the same pruner, guarded, verified, with fallback;
5. discourse compaction plus the guarded pruner.

**Measures:**
- **Tokens counted by the target model's own tokenizer or usage**, not characters.
- **Graded question answering**, reusing the frozen 42-question harness of [compacted-context-graded-qa-v1](../compacted-context-graded-qa-v1/PREREGISTRATION.md).
- The rate of invariant violations.
- Exact recall after `expand`.

**Bars, to fix in the pre-registration:**
- condition 4 or 5 saves at least X% tokens over condition 2;
- question answering is non-inferior to verbatim;
- 0 invariant violations in the output;
- 100% exact expansion.

### Stage 2: Rust engine, only if stage 1 passes

A `crates/lunum-codec` crate with a stdin/stdout CLI, alongside `lunum-render`:
- `lunum-codec compress`: JSONL units in, a verified view and pointers out;
- `lunum-codec verify`;
- `lunum-codec expand <ref>`.

It must reach parity with the TypeScript verifier on a golden file. The store is `lunum-store`, keyed by SHA-256.

## What needs the owner

- Stage 1 data: the OpenUnum sessions and question harness on the rig.
- A choice of compressor model (LLMLingua-2 needs a Hugging Face download).
- A budget for answering and grading.
