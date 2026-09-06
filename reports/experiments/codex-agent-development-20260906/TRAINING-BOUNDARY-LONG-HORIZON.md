# Training boundary assessment

Status: NOT PROVEN

The current evidence does not isolate a persistent model ceiling. The real
OMW/CILI replay has 100/100 shared candidate coverage but only 19/100 exact
cross-language convergence, while the source-only frame-complete Codex trial
has 6/6 deterministic identity-valid candidates and still fails the equivalent
EN/EL/ID send group because the agent chose different open identifiers. This
shows a grounding bottleneck, but it does not distinguish provider coverage
from agent proposal failure.

Already tested: conservative lexical normalization, real OMW/CILI grounding,
candidate-set intersection, UniMorph morphology as candidate generation,
compositional grounding, stable-entity evidence, frame-first extraction,
two-stage extraction, verifier/consensus trials, strict typed construction,
and exact raw-text retrieval. These tests establish safety boundaries and
transport behavior; they do not prove training is unavoidable.

Training remains deferred until a fresh development ladder audit measures,
with independently authored labels:

1. provider candidate-set recall and ambiguity;
2. blind agent grounding proposal recall conditional on provider coverage;
3. protocol-control acceptance of independently justified candidates;
4. critical-mutation false equivalence and abstention safety;
5. retrieval coverage and recall using only agent-produced candidates.

Subsequent deterministic safeguards now include authenticated candidate-set
intersection, a registry-generated frame-first transport schema, strict
source/contract claim binding, durable strictness in the run manifest, and
stage-level blind-evaluation receipts. These reduce evaluator and transport
confounding, but they do not create a sense-selection signal where OMW/CILI
returns multiple plausible candidates.

The current unresolved custody item is multi-process claim locking for shared
output directories. It is a reproducibility/concurrency hardening task, not
evidence that the semantic contract or identity projection is incorrect.

Interpretation rule:

- provider absence with high protocol control indicates a resource/coverage
  boundary;
- provider presence with agent proposal failure indicates extraction/grounding
  weakness;
- valid protocol-control failure or critical-mutant collapse indicates a core
  defect and requires repair before any training claim;
- only a persistent agent-grounding ceiling after these controls justifies a
  training proposal.

No protected corpus was created or consumed for this assessment. No local
inference or OpenUnum surface was used.
