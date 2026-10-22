# Native Model Protocol

## Purpose

Protocol annotations for Lunum-native model compatibility:
- Token mappings for native Lunum tokenizers
- Instruction templates for native and non-native models
- Fallback profiles for non-native models

## Motivation

Lunum must work with existing models (Gemma, Llama, Qwen, Claude, Gemini, OpenAI)
through familiar tokens and explicit instructions. Later research may train or
fine-tune Lunum-native models, but the core protocol must remain useful without
dedicated training.

## Architecture

```
Lunum-Sem → ModelRendererProfile → Model-facing text
                    ↑
         Token mappings + Instructions
```

## Types

### Model Families

| Family | Description |
|--------|-------------|
| `native` | Lunum-native model, trained on Lunum tokens |
| `gemma` | Gemma family models |
| `llama` | Llama family models |
| `qwen` | Qwen family models |
| `claude` | Claude family models |
| `gemini` | Gemini family models |
| `openai` | OpenAI family models |
| `unknown` | Unspecified or unknown family |

### Instruction Kinds

| Kind | Purpose |
|------|---------|
| `parse` | Convert natural language → Lunum-Sem |
| `realize` | Convert Lunum-Sem → natural language |
| `render` | Compact Lunum-Sem for model context |
| `classify` | Classify by risk, confidence, category |
| `mixed` | Mix Lunum with natural language per policy |

### Token Mapping Categories

| Category | Examples |
|----------|----------|
| `predicate` | `<predicate>`, action verbs |
| `role` | `<role>`, agent, object, location |
| `modifier` | `<neg>`, `<mod>`, negation, modality |
| `marker` | `<world>`, real/fiction/tool markers |
| `separator` | `⟨sep⟩`, clause/record separators |
| `special` | EOS, BOS, mask tokens |

## Instruction Templates

Each `InstructionTemplate` contains:

```typescript
interface InstructionTemplate {
  kind: InstructionKind;
  systemPrompt: string;   // Base instruction for the model
  examples: string[];     // Few-shot examples
  constraints: string[];  // Hard constraints the model must follow
}
```

## Model Renderer Profile

```typescript
interface ModelRendererProfile {
  family: ModelFamily;
  version: string;
  tokenizerId: string;
  mappings: LunumTokenMapping[];  // Native → model tokens
  instructions: Record<InstructionKind, InstructionTemplate>;
  fallbackProfile?: string;       // When native tokens unavailable
  maxContextTokens: number;
}
```

## Native vs Non-Native Profiles

**Native profile:**
- Full token vocabulary for Lunum primitives
- Optimized instruction templates
- Higher token density (more meaning per token)

**Non-native profile:**
- Reduced mapping set (only tokens the model understands)
- Fallback to English-like renderings where needed
- May use `translationTable` for cross-family conversion

## Fallback Profiles

When a model doesn't have native Lunum tokens:

```typescript
interface FallbackProfile {
  sourceProfile: string;    // Original profile
  targetFamily: ModelFamily; // Family to fall back to
  translationTable: Record<string, string>;
  qualityScore: number;     // 0-1 expected quality retention
}
```

## Validation

All `ModelRendererProfile` instances must pass `validateModelProfile()` before use.
Required fields: `family`, `version`, `tokenizerId`, `maxContextTokens`, `mappings`,
`instructions` (with all 5 kinds).

## Implementation

See `packages/core/src/native-model.ts` for types and utilities.

## References

- VISION.md: "Native and non-native models" long-term capability
- AGENTS.md: Model-specific code section
- ARCHITECTURE.md: Layer 4 — Lunum-Code renderers
