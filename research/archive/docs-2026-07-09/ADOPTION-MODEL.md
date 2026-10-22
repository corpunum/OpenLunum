# Product adoption model

## Adoption levels

### Level 0 — evaluation only

Export text or memory records and compare natural, compact, and mixed contexts. No runtime behavior changes.

### Level 1 — sidecar storage

Store natural source plus Lunum-Sem, fingerprint, code, metadata, and version. Serve natural context.

### Level 2 — retrieval augmentation

Use exact fingerprints and structural signals alongside embeddings/BM25. Do not replace retrieval wholesale.

### Level 3 — shadow compilation

Compile mixed context, log savings and semantic/answer comparisons, but serve natural context.

### Level 4 — guarded mixed context

Serve Lunum-Code only for allowlisted, low-risk, high-confidence records. Retain immediate natural fallback.

### Level 5 — broader protocol use

Represent plans, tool events, evidence, and inter-agent state after independent conformance gates.

## Integration mechanisms

- direct JavaScript/TypeScript dependency;
- native library in another language implementing the schemas;
- product plugin or lifecycle hooks;
- MCP/local service;
- CLI wrapper;
- offline evaluator.

## Upgrade contract

Products should pin pre-1.0 versions exactly, run contract and shadow tests on update, and migrate fingerprints explicitly when canonicalization changes. Tracking the repository main branch in production is not supported.
