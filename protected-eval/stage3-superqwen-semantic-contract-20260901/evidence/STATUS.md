# Stage 3 protected evaluator status

This is an honest partial result, not a protected-gate pass.

- Full corpus: NOT RUN. Requested 54 items; completed 0/54 for the full gate.
- First untouched bounded parse subset: COMPLETE, 18/18, one attempt per item.
- Subset outcome: 1 passed, 17 failed, 0 errors; canonical exact rate 0.0000; abstention accuracy 0.1667.
- Retrieval: NOT RUN / no metric claimed. The evaluator client was stopped during the slow fixed raw-text retrieval stage before its buffered artifact flushed.
- Embedding baseline: NOT RUN because no already-available embedding endpoint was present.
- Live identity was verified at http://127.0.0.1:54523/v1; the model ID was openai/superqwen3.8-27b-abliterated.
- Requested SHA 6149dee6... is unresolvable. The available implementation used is 6149deed6b518020bc804b5db8f68f36ba00f4cf.

No retry, tuning, model restart, model replacement, or production-code change was performed. Raw parse requests and responses are in the subset evidence directory.
