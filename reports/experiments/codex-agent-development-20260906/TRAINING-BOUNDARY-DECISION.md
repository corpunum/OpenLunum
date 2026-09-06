# Training boundary decision

Decision: TRAINING IS JUSTIFIED AS THE NEXT HIGHEST-LEVERAGE RESEARCH STEP.

This is not a claim that training is mathematically unavoidable, and no
training was started. It is a decision that further prompt-only or deterministic
transport work is unlikely to address the demonstrated ceiling efficiently.

## Evidence

- Real OMW/CILI: 100 cross-language comparisons, 19 independently exact; 22
  retained multiple candidate senses despite shared candidate sets.
- Independent morphology audit: candidate-set recall improved for some
  languages, but broad identity eligibility remained low and morphology did
  not supply a reliable sense-selection signal.
- General extraction architectures tested: one-shot, frame-first, two-stage,
  ground-first/compositional, verifier, consensus, and typed builder workflows.
- Fresh source-only ladder: 3/24 exact, with 8/8 candidate self-consistency but
  1/8 convergence to private gold.
- Larger opaque-handle source-only run: 0/60 positive parse exact, 12/12
  abstention accuracy, 10/10 candidate self-consistency, 0/10 gold
  convergence, and 5/6 comparable critical-negative pairs with zero false
  equivalences.
- Blind source custody and deterministic validation are now independently
  tested; the large run passed 84/84 source-bound rows and all 70 returned
  candidates were identity-available.

The residual error is not primarily transport, schema, frame containment, or
identity safety. It is language-neutral selection of canonical kind, term type,
open concept, and grounded sense. Stable repeated wrong choices show that more
prompt wording alone is not a sufficient remedy.

## Proposed training task

Train or distill a multilingual semantic extraction model to predict a
structured intermediate representation, not arbitrary provider IDs:

1. source text and language;
2. protocol predicate/frame and clause structure;
3. typed role fills and critical literals;
4. structured open-concept decomposition (head, typed modifiers, lexical
   evidence, unresolved status);
5. candidate grounding set or explicit abstention.

The model must not directly self-certify `lfp:2.1`. OpenLunum remains the
validator, provider-evidence gate, canonicalizer, and fingerprint authority.

## Data design

- 6-language multilingual groups with independently authored translations;
- concept-disjoint train/dev/protected splits;
- OMW/CILI and entity-provider evidence stored as provenance, never copied as
  an opaque training shortcut;
- hard negatives for role swaps, opposites, modality, dates, quantities,
  units, visibility, environment, and polysemy;
- explicit unresolved/ambiguous examples and abstention labels;
- source evidence, gold Sem, grounding evidence, and provider version kept in
  separate fields;
- no reuse of inspected protected corpora as capability evidence.

## Candidate model and objectives

Start with a small multilingual instruction/seq2seq or structured-decoding
model that can emit the generated frame-first contract. Compare:

- supervised structured-output loss for frame/role fields;
- auxiliary grounding candidate-set loss;
- abstention/calibration loss for unresolved senses;
- contrastive loss for equivalent multilingual groups and critical negatives;
- optional consistency loss across independently translated rows.

The first milestone should compare a frozen base model with a distilled
adapter/LoRA-sized model; do not assume a large model is required.

## Evaluation

Use a new concept-disjoint development split for iteration and a fresh blind
protected corpus only after implementation freeze. Report transport, frame,
grounding candidate recall, exact identity, multilingual convergence,
critical-negative coverage/false equivalence, abstention, and raw-text
retrieval separately. Require improvement over the current source-only baseline
without increasing dangerous false equivalence. OpenLunum's deterministic
submission path must score every candidate.

## Risks and boundary

Training may memorize provider labels, over-collapse synonyms, or learn the
benchmark grammar. Mitigations are concept-disjoint splits, provider-version
held-out tests, hard negatives, abstention supervision, and independent
protected authoring. External providers remain optional evidence adapters.

Training requires explicit compute/data authorization and is therefore not
started autonomously. Until that authorization exists, the OpenLunum core
remains safe and useful as a deterministic protocol/validator, but raw text to
exact Sem is not empirically qualified.
