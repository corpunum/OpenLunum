# Gap analysis

| Area | OpenUnum baseline | Lunum target |
|---|---|---|
| Semantics | metadata labeled as semantic JSON | validated Lunum-Sem clauses and provenance |
| Unicode/languages | ASCII-oriented stripping | Unicode-preserving input and evaluated multilingual canonicalization |
| Fingerprint | telegraph SHA-derived identity | versioned canonical semantic fingerprint |
| Renderer | one generic telegraph | measured model/tokenizer profiles |
| Token counts | rough chars/4 | exact tokenizer adapters plus rough fallback |
| Persistence | sidecars available; user path inconsistent | sidecars for all eligible consolidated records |
| Retrieval | no canonical FP/graph integration | exact fingerprint and structural boost alongside embeddings/BM25 |
| Context | natural served, mixed estimated | shadow-mixed, then guarded mixed compiler |
| Safety | length/structure eligibility | category, confidence, risk, exactness, and failure taxonomy |
| Evaluation | compression log | quality, semantic retention, safety, latency, and rollback metrics |
| Upgrade | local code copied into product | pinned dependency plus adapter and contract tests |

## Important non-gap

OpenUnum should keep natural `content` and existing sidecar columns. The adoption does not require redesigning the database before the package can improve semantic records.
