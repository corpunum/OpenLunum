# Three-call Luna development pilot

**Not protected evaluation or readiness qualification.** Three fresh,
owner-authorized `gpt-6-luna` subagents received only the public v14 task
profile, current `lunum-agent/0.13` contract and one raw source. They returned
single builder inputs without tool use or retries. The parent executed the
actual core builder and submission API, not authored semantic outputs.

The English/Greek pair has one simple meaning with source-visible names and
an identifier. The third source reverses sender and recipient. No broad
extraction accuracy follows. Original request and result files include the
actual final response, source, prompt hashes, session identity, usage,
validation and unpromoted trust results. Private reasoning is not retained.

Model identity comes from the actual session's `turn_context`, not a weight
checksum. These were dirty-tree development calls, not immutable-candidate
protected runs; partial v14 bindings do not bind the whole runtime closure.
Temperature, seed, maximum output budget, HTTP endpoint and dollar billing
were not exposed and are not invented. No local model server was changed or
called. Instructions prohibited tools/files, but this was not technical
sandbox isolation; observed session receipts show no tool calls.

`node experiments/luna-source-only-pilot-v1/replay.mjs` after `pnpm build`
checks receipt hashes and rebuilds candidates from **actual raw model builder
responses**. It tests exact and experimental near retrieval, separately,
with English-to-Greek, Greek-to-English and a role-swap negative. Each query
uses the same routed raw corpus for semantic and token-Jaccard lexical
retrieval. Parsing is replayed, not called anew; duplicated raw sentences
reuse the corresponding response. This is a tiny development pipeline probe,
not a protected end-to-end benchmark. Embeddings and threshold calibration
are **NOT RUN**.

The OpenAI Docs skill informed fresh-session capture and usage reporting;
actual local session receipts, not documentation, establish these observations.
