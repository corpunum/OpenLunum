# OpenLunum semantic-compiler training program

Status: training-ready program design; no model training has been run.

## Boundary

The learned component proposes a semantic intermediate representation (IR):
world/kind intent, predicate/frame, typed roles, literals, control flow,
structured open-concept handles, grounding candidates, and an explicit
`unsupported`/`ambiguous`/`unresolved` outcome. It does not emit trusted
identity. OpenLunum remains responsible for transport/schema validation,
canonical frames, grounding evidence, canonicalization, `lfp:2.1`, promotion,
comparison, and safety.

Direct text-to-final-Sem generation remains a baseline. The preferred pilot
boundary is frame/slot plus open-concept decomposition because the current raw
evidence shows stage-valid, self-consistent candidates failing on kind,
term-type, and language-neutral open-concept naming rather than on hashing.

## Dataset governance

Each JSON/JSONL row follows `schemas/lunum-training-example.schema.json` and
must retain source text, language, semantic group, template family, concept and
entity identifiers, target IR, abstention reason when applicable, annotation
method, license, generator/version, and review status. Agent-generated labels
are proposals until deterministic contract validation and independent review
accept them. A row with unresolved disagreement is not accepted training gold.

The split validator rejects cross-split collisions in semantic groups,
template families, canonical concept IDs, external grounding IDs, entity IDs,
and normalized source text. A concept-disjoint split is stricter than a random
translation split; multilingual rows of one meaning stay in one split.

## Required data mix

The first pilot should contain hundreds of independent groups and at least six
languages (`en`, `el`, `es`, `fr`, `de`, `id`), with balanced supported frames,
open concepts, composition, polysemy, literals, conditions, modality,
negation, references, hard negatives, and abstentions. Hard-negative pairs
must be explicit and must differ in one critical dimension. Retired/protected
evaluation corpora are never training material.

## Objectives and baselines

Before training, freeze the same concept-disjoint dev split for these baselines:
one-shot agent, typed builder, frame-first, semantic-IR construction,
grounding-assisted, and independent verifier. Report transport, frame,
predicate/role/kind, grounding candidate recall, exact identity, convergence,
abstention, and critical-negative safety separately.

A practical pilot compares a small multilingual encoder/seq2seq or constrained
decoder against the best frozen baseline. Candidate losses are structured IR
generation, frame/predicate and role supervision, typed literal extraction,
multilingual contrastive agreement, hard-negative separation, and calibrated
abstention. Only losses supported by ablations should remain.

## Reproducible harness requirements

Training must be CLI/config driven and record dataset/split hashes, code SHA,
base model and tokenizer revisions, seed, configuration, checkpoint hashes,
resource versions, and all metrics. The harness must refuse a split with
leakage or rows lacking provenance. Evaluation always submits the model output
through OpenLunum's untrusted candidate path; no model confidence can bypass
the core.

No local inference or training was used for this program. Meaningful external
training spend or compute requires explicit authorization. Until that exists,
the deterministic dataset/split/harness work is the reproducible preparation
boundary, not evidence of learned capability.
