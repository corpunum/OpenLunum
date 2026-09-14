# @corpunum/lunum

The core package provides a constrained semantic representation, canonicalization, versioned fingerprints, comparison, rendering and candidate-policy primitives. It is experimental. [Repository license](../../LICENSE.md) applies; the package is not an open-source or published-package promise.

## Run the checkout example

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm demo:core
pnpm test:public-demo
```

See [the executable demo](../../examples/structured-record-demo.mjs). It deliberately supplies Sem rather than pretending to parse natural language. Core does not depend on OpenUnum or require a model server.

## Main entry points

| Function | Meaning |
|---|---|
| `getExtractionContract()` | Generated public protocol/frame/builder instructions for an extractor. |
| `buildCandidateSem(...)` / `submitCandidate(...)` | Construct/validate candidate representations; acceptance does not certify source meaning or promote trust. |
| `semanticFingerprint(sem)` | Strict current `lfp:2.1` representation-identity path with canonical/frame/reference checks. |
| `fingerprintSem(sem)` | Legacy compatibility fingerprint path. Do not confuse it with the strict current path. |
| `surfaceFingerprint(text)` | Text-level fingerprint, not language-independent semantics. |
| `renderSem(sem)` | Installed renderer preview. Does not establish tokenizer savings or task-quality retention. |
| `createRecord(...)` | Retain source with Sem, renderings and policy/trust results. |
| `compileContext(messages, options)` | Select representations according to the provided policy shape. Supply original message content explicitly; do not assume a nested record alone supplies it. |

Executable definitions are exported from [src/index.ts](src/index.ts). The [demo regression tests](../../examples/structured-record-demo.test.mjs) exercise the documented basic path.

## Boundaries

Source evidence must be retained by the consuming application. The strict identity algorithm is deterministic over its defined fields, not an oracle for translation, grounding or truth. Model-proposed IDs do not by themselves establish real-world referent equality. Similarity is not exact identity.

The runtime candidate schema and versioned compatibility schemas coexist; inspect the actual contract for the function being used. Do not infer current production support from a historical `1.0` filename.

The package also contains experimental migration, rendering, safety, lifecycle and measurement modules. Some evidence is deterministic or simulated. [Evidence and limitations](../../docs/LUNUM_READINESS.md) is the public capability boundary.
