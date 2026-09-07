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

## Current certification status

`experiments/training-pilot-20260908-v2` is a development harness fixture. Its
contract and split checks pass, but the deterministic generator is not an
independent semantic reviewer. Run
`scripts/research/audit-training-pilot.mjs` before considering any future
training material; the audit intentionally reports `trainingGoldEligible:
false` until independent review exists. The audit also checks that each
multilingual group has six consistent language rows and that each declared
critical-negative pair preserves its non-concept structure while changing its
concept identity.

Independent semantic certification is a separate blind workflow. The
`scripts/research/training-review.mjs` utility creates source/language plus
candidate packets while withholding group, pair, concept, entity, generator,
split, and prior-review metadata. Decisions are append-only, hash-bound, and
never promote training gold by themselves. With no independent reviewer
ledger for this fixture, its training eligibility remains false.

The preprocessing-only dry run in
`scripts/research/training-dry-run.mjs` validates batches, objective inputs,
run-manifest hashes, checkpoint creation, and resume. Its estimates are not
training or capability metrics. Current model-class considerations are
recorded in `docs/TRAINING_MODEL_RESEARCH.md`.

## Standards alignment

The learned compiler remains responsible for natural-language interpretation
into the Lunum semantic IR. UMR/UCCA/PropBank may provide optional auxiliary
supervision only through reviewed, explicitly loss-aware mappings. They do not
replace Lunum frames or exact identity, and licensing is checked per corpus.
RDF canonicalization, SHACL, and PROV-O inform optional interoperability and
diagnostic-report exports; MCP/A2A remain transport boundaries. See
`docs/ECOSYSTEM_ALIGNMENT.md` and the experimental, non-core
`scripts/research/semantic-crosswalk.mjs`.
The current UP2.0 audit and conservative license disposition are recorded in
`docs/UNIVERSAL_PROPBANK_AUDIT.md` and
`docs/UNIVERSAL_PROPBANK_LICENSE_MANIFEST.json`; no UP2 data is bundled or
approved as training gold.
