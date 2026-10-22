# Training authorization options

No training was launched. These are backend-neutral planning options; they are
not cost quotes and require explicit approval of model license, data handling,
external provider, retention, and budget.

## Cheap pilot

- model: small multilingual encoder or encoder-decoder, roughly 100M–500M
  parameters;
- data: 300–1,000 independently reviewed rows, concept-disjoint dev;
- objective: frame/predicate, role/typed-slot, IR generation, abstention;
- compute: one modest cloud GPU or free authorized notebook, hours rather than
  days;
- question: does an IR boundary beat the frozen agent/typed-builder baseline?

## Medium pilot

- model: 0.5B–3B multilingual encoder-decoder or constrained decoder;
- data: 3,000–15,000 reviewed rows across hundreds of groups;
- objective: structured IR plus multilingual contrastive and hard-negative
  losses, with ablations;
- compute: one 24–48GB GPU for several hours to a day, provider dependent;
- question: does improvement survive concept-, entity-, template-, and
  language-disjoint validation?

## Serious run

- model: selected small multilingual compiler with adapter/LoRA or distilled
  checkpoint;
- data: 15,000+ reviewed rows and a separately frozen protected template;
- compute: multi-GPU or equivalent external job, with checkpoint/resume and
  independent evaluation;
- question: does the learned compiler provide reproducible exact identity,
  multilingual convergence, safety, and retrieval gains across providers?

## Authorization checklist

Approval must name the base checkpoint and license, tokenizer revision,
permitted external compute/provider, maximum budget, data residency and
retention, whether source text may leave the machine, checkpoint storage,
random seeds, and whether protected evaluation is authorized. The job must
export candidates only; every output is submitted to OpenLunum's untrusted IR
or candidate path. A model confidence score cannot grant identity.

The first permitted job should be the cheap pilot and must compare against the
same concept-disjoint development baseline. No protected corpus is needed for
the pilot.
