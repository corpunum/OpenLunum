# Vision

Lunum should let models and agent products exchange structured meaning without forcing every product to store duplicate human-language paraphrases or every model to consume the same compact spelling.

## North star

A product records meaning once, retains the original evidence, retrieves that meaning across languages, and renders only the representation best suited to the receiving model and task.

```text
source evidence → canonical semantics → stable identity → measured rendering → safe use
```

## Long-term capabilities

### Universal semantic layer

Represent preferences, facts, instructions, plans, tool events, observations, beliefs, fiction, uncertainty, provenance, conditions, modality, time, and references in a versioned model-independent form.

### Cross-language memory

Map equivalent meanings from English, Greek, Spanish, Indonesian, and other languages to shared semantic records without claiming that raw text fingerprints are language-independent.

### Model-specific code

Maintain renderer profiles for tokenizer/model families. A Gemma-efficient form may differ from a Llama-, Qwen-, Claude-, Gemini-, or OpenAI-efficient form while preserving the same `Lunum-Sem` and `Lunum-FP`.

### Retrieval and graph augmentation

Combine fingerprints, predicate/role graph matches, embeddings, lexical retrieval, freshness, importance, and provenance. Lunum augments retrieval; it does not require replacing proven retrieval methods.

### Agent-state protocol

Encode plans, steps, tool calls, results, constraints, evidence, and inter-agent handoffs in a format that can be validated, versioned, inspected, and rendered.

### Safe mixed context

Compile context using Lunum only where evidence shows semantic retention and acceptable risk. Preserve natural language for exact wording, complex conditions, safety, legal/medical material, code, commands, paths, URLs, social nuance, or uncertain parses.

### Native and non-native models

Work with existing models through familiar tokens and explicit instructions. Later research may train or fine-tune Lunum-native models, but the core protocol must remain useful without dedicated training.

## What success looks like

Lunum succeeds when:

- equivalent meanings converge to stable semantic identities across languages;
- model-facing context is measurably cheaper on named tokenizers;
- downstream task quality is preserved or improved;
- safety-critical information is not lost;
- integrations can upgrade through explicit contracts;
- failures are observable and reversible;
- at least several unrelated products adopt the same core representation without product names entering the schema.

Token compression alone is not success.
