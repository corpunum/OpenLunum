# Baseline and investigation

Baseline: `14c0ebc1e3db4cc99280778c14c12230790f95a3`, `main`.
Its GitHub CI run [36990913308](https://github.com/corpunum/OpenLunum/actions/runs/36990913308)
completed successfully, including verify, schema drift, and report validation.
That is deterministic verification, not semantic extraction qualification.

Luna workers independently traced these paths before implementation:

- Record creation normalizes and assigns exact identity without the agent
  submission path's source-literal gate.
- A registry-built deletion plan checks a source ID but not the registered
  source lineage; execution trusts the supplied target list.
- Raw retrieval uses an identity-available pool for semantic TN counts, a raw
  pool for lexical TN counts, and different global/per-language formulas.
  Query extraction failures also appear as semantic-matching failures, and
  baseline exceptions can count as successful negative rejection.
- Parent runtime reproduction also found that `isHighRisk()` returns false
  for a `delete` consequence and for canonical `obligation` on `send`. It
  checks only one condition level and legacy modality spellings, not the
  canonical modality vocabulary emitted by normalization.

The connected MCP tool returned `lunum-agent/0.3`, `lunum-protocol/0.1`,
`lunum-frame/0.1` (23 framed predicates), not current `0.13`/`0.4`/`0.5`.
It was inspected read-only and was not restarted or reconfigured. Future
current-contract tests must launch only their own bounded child process and
validate its returned receipt. This discrepancy is not a finding about a
particular running LLM's semantic understanding.

OpenUnum, other repositories, existing processes, compaction, and owner edits
are outside this experiment. Local registry tests are not storage acceptance.
