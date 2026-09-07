# Training model research

Status: preparation only; no model was downloaded, trained, or run.

The learned boundary remains a semantic-IR/frame-slot compiler. Its output is
an untrusted proposal. OpenLunum still performs schema, frame, grounding,
canonicalization, identity, and fail-closed checks.

## Candidates

| Class | Candidate | Evidence relevant to this task | Strength | Risk / pilot decision |
| --- | --- | --- | --- | --- |
| multilingual encoder + heads | `FacebookAI/xlm-roberta-base` | The model card reports 94 languages and MIT licensing. [Model card](https://huggingface.co/FacebookAI/xlm-roberta-base) | Good fit for predicate/frame, role, modality, and abstention classifiers; deterministic slot heads can avoid free-form JSON | 125M-scale encoder and task-specific heads require a real training backend; candidate for a later classification pilot |
| multilingual encoder-decoder | `google/mt5-small` | The model card reports 102 languages including English, Greek, Spanish, French, German, and Indonesian, and Apache-2.0 licensing. [Model card](https://huggingface.co/google/mt5-small) | Natural fit for semantic IR text generation and multilingual transfer | Decoder can hallucinate structure; requires constrained decoding and deterministic IR validation; strongest first generative candidate |
| byte-level encoder-decoder | `google/byt5-small` | The model card describes a tokenizer-free byte-level T5 and Apache-2.0 licensing. [Model card](https://huggingface.co/google/byt5-small) | Avoids tokenizer vocabulary gaps and is robust to spelling/orthography variation | Longer sequences and higher compute; useful Greek/morphology follow-up, not the cheapest first pilot |
| distilled small instruction model | compact multilingual instruction checkpoint | Must be selected only after verifying a specific revision, license, languages, and training access | May simplify frame-first prompting | Instruction tuning does not establish canonical identity and model cards often lack uniform commercial/training terms; not selected without a concrete authorized backend |
| hybrid classifier + slot extractor | XLM-R encoder with structured heads plus deterministic IR builder | Uses the same contract boundary without requiring the model to serialize final Sem | Narrow learned task, strong transport reliability, easier per-field error analysis | More engineering but best alignment with the evidence; preferred pilot architecture |

## Recommendation

The cheapest meaningful pilot is a multilingual encoder with shared structured
heads for outcome, world/kind, predicate, role labels, typed literals, and
abstention, followed by the existing deterministic IR-to-candidate builder.
An mT5-small IR generator is a useful second experiment if the first pilot
shows that the classification boundary cannot express nested or variable-size
structures.

No current tool in this environment exposes an already-authorized, free,
non-local training job. No paid backend, model download, or local training was
started. The program is therefore ready for authorization rather than claiming
pilot capability.

## Scientific guardrails

- Train/dev semantic groups, grounded IDs, entities, template families, and
  near-duplicate source text must be disjoint.
- A candidate model never receives protected gold or semantic atoms.
- All outputs pass through OpenLunum's untrusted IR/candidate path.
- Success requires concept-disjoint dev improvement over frozen agent-native
  baselines without increased critical false equivalence or unsafe grounding.
- A model checkpoint is evidence only together with its dataset, split,
  tokenizer, revision, config, seed, code SHA, and evaluation artifacts.
