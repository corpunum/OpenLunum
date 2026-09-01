# Stage 3 protected evaluation audit

Status: `COMPLETE_WITH_EVIDENCE_LIMITATION`; this is not a protected-gate success claim.

## Fixed inputs and live target

- Candidate implementation SHA: `6149deed6b518020bc804b5db8f68f36ba00f4cf` (resolvable).
- Protected corpus: `corpus.jsonl`, SHA-256 `bc392d724815419ed79b9db50103c7c62ebdc03c1b839fb5c9d672322dcaf3b8`.
- Model profile: `profiles/models/superqwen3.8-27b-abliterated-live.json`, SHA-256 `632183dcd88eb18f7837c8063519604b0da78a20bb1a00e5dbf5c8f9190944e0`.
- Endpoint: `http://127.0.0.1:54523/v1`.
- Advertised and requested model ID: `openai/superqwen3.8-27b-abliterated`.
- Semantic schema: `schemas/lunum-sem.schema.json`, SHA-256 `930c6adc7c1c48d83e732c3c4e30de91d105ef20f6c1d9bbd9adf329b8ef5a83`.
- Derived transport schema SHA-256: `c0a9ab5f283c7bb0ea10f1638986ea92b56f8de2ba4d669c0111763411ac84aa`.
- Prompt version: `parse-prompt/3`.
- Effective system prompt SHA-256: `02d25f7d8c8441ef183460780d6494a66651308baca6009a9daaf8042d3e9266`.
- Decoding: temperature `0`, seed `42`, max tokens `256`, `enable_thinking: false`.

## Runs and metrics

- Parse: `54/54` items, one attempt each. Raw request and response are present for all 54 records.
- Parse outcomes: `1 passed`, `23 failed`, `30 errors`; exact rate `0`; abstention accuracy `0.16666666666666666`.
- Retrieval: `32/32` raw-text extractions, covering `16` memories and `16` queries, with `el->en` and `en->el` scoring on identical raw candidate pools.
- Retrieval semantic metrics: precision `1`, recall `0`, F1 `0`, top-1 accuracy `0`, top-K recall `0`; semantic matching failures `16`.
- Lexical baseline on the same pools: precision `0.4`, recall `0.5`, F1 `0.4444444444444445`, top-1 accuracy `0.375`, top-K recall `0.5`, false-positive rate `0.10714285714285714`.
- Embedding baseline: `NOT RUN`; no already-available embedding endpoint was present without changing the loaded model.

## Evidence limitation

All 32 retrieval raw output contents are retained. However, 18 invalid retrieval records have null `rawRequest` and `rawResponse`: the pre-run evaluator catch path overwrote transport fields captured before semantic validation failed. No retry or replacement run was made. The evaluator file now preserves already-captured fields for future runs, but this completed run is not retroactively upgraded.

A duplicate retrieval-only process was started externally after the authoritative run; it was stopped to preserve the one-attempt protocol. Its partial 12-record output at `evidence/retrieval/2026-09-01T10-46-43-390Z/` is retained as non-authoritative diagnostic evidence and is excluded from metrics.

The prior bounded diagnostic remains at `evidence/parse-subset/2026-09-01T10-22-34-360Z/` and was not overwritten.
