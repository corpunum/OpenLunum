# Stage 3 protected evaluator status

Status: `COMPLETE_WITH_EVIDENCE_LIMITATION`; this is not a protected-gate pass.

- Candidate: `6149deed6b518020bc804b5db8f68f36ba00f4cf`.
- Corpus: 54/54 raw parse items, one attempt each; raw request and response are present for all parse records.
- Parse outcome: 1 passed, 23 failed, 30 errors; exact rate 0; abstention accuracy 0.16666666666666666.
- Retrieval: 32/32 raw-text extraction attempts, 16 memories and 16 queries, both `el->en` and `en->el`, identical raw candidate pools.
- Retrieval semantic metrics: precision 1, recall 0, F1 0, top-1 accuracy 0, top-K recall 0; 16 semantic matching failures.
- Lexical baseline on the same pools: precision 0.4, recall 0.5, F1 0.4444444444444445, top-1 accuracy 0.375, top-K recall 0.5, false-positive rate 0.10714285714285714.
- Embedding baseline: `NOT RUN`; no already-available embedding endpoint was present without changing the loaded model.
- Live target: `http://127.0.0.1:54523/v1`, advertised model `openai/superqwen3.8-27b-abliterated`.
- Retrieval evidence limitation: all 32 raw output contents are preserved, but 18 invalid records have null `rawRequest` and `rawResponse` because the pre-run evaluator catch path overwrote captured transport fields. No retry was performed.
- Prior untouched 18-case diagnostic remains at `evidence/parse-subset/2026-09-01T10-22-34-360Z/`.

See `PROVENANCE_AUDIT.md` for hashes, prompt/schema provenance, exact artifact paths, and the complete limitation record.
