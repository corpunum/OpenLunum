/**
 * Native Model Protocol types and utilities.
 *
 * Protocol annotations for Lunum-native model compatibility:
 * - Token mappings for native Lunum tokenizers
 * - Instruction templates for native and non-native models
 * - Fallback profiles for non-native models
 */

export type ModelFamily = 'native' | 'gemma' | 'llama' | 'qwen' | 'claude' | 'gemini' | 'openai' | 'unknown';

export type InstructionKind = 'parse' | 'realize' | 'render' | 'classify' | 'mixed';

/** A token mapping for a native Lunum tokenizer. */
export interface LunumTokenMapping {
  token: string;
  id: number;
  semantics: string;
  category: 'predicate' | 'role' | 'modifier' | 'marker' | 'separator' | 'special';
}

/** An instruction template for a model family. */
export interface InstructionTemplate {
  kind: InstructionKind;
  systemPrompt: string;
  examples: string[];
  constraints: string[];
}

/** A renderer profile optimized for a specific model family. */
export interface ModelRendererProfile {
  family: ModelFamily;
  version: string;
  tokenizerId: string;
  mappings: LunumTokenMapping[];
  instructions: Record<InstructionKind, InstructionTemplate>;
  fallbackProfile?: string;
  maxContextTokens: number;
}

/** A fallback profile when native tokens aren't available. */
export interface FallbackProfile {
  sourceProfile: string;
  targetFamily: ModelFamily;
  translationTable: Record<string, string>;
  qualityScore: number;
}

/** Validate a model renderer profile. */
export function validateModelProfile(profile: ModelRendererProfile): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile.family) errors.push('missing family');
  if (!profile.version) errors.push('missing version');
  if (!profile.tokenizerId) errors.push('missing tokenizerId');
  if (!profile.maxContextTokens || profile.maxContextTokens <= 0) errors.push('invalid maxContextTokens');
  if (!Array.isArray(profile.mappings) || profile.mappings.length === 0) errors.push('empty or missing mappings');

  const validFamilies = new Set<ModelFamily>(['native', 'gemma', 'llama', 'qwen', 'claude', 'gemini', 'openai', 'unknown']);
  if (!validFamilies.has(profile.family)) errors.push(`invalid family: ${profile.family}`);

  const validKinds = new Set<InstructionKind>(['parse', 'realize', 'render', 'classify', 'mixed']);
  for (const [kind, template] of Object.entries(profile.instructions)) {
    if (!validKinds.has(kind as InstructionKind)) errors.push(`invalid instruction kind: ${kind}`);
    if (!template.systemPrompt) errors.push(`instruction ${kind} missing systemPrompt`);
    if (!Array.isArray(template.examples)) errors.push(`instruction ${kind} missing examples`);
    if (!Array.isArray(template.constraints)) errors.push(`instruction ${kind} missing constraints`);
  }

  return { ok: errors.length === 0, errors };
}

/** Generate a native Lunum instruction for parsing. */
export function buildParseInstruction(modelFamily: ModelFamily): InstructionTemplate {
  const baseSystemPrompt = 'Parse the input into Lunum-Sem structure. Preserve all meaning, entities, roles, and modifiers.';
  const examples = [
    'Input: "The cat sat on the mat."\nLunum: { world: "R", kind: "fact", clauses: [{ predicate: "sat", roles: { agent: "cat", location: "mat" } }] }',
    'Input: "Is the store open?"\nLunum: { world: "R", kind: "query", clauses: [{ predicate: "open", roles: { subject: "store" } }] }'
  ];
  const constraints = [
    'Preserve original source text in provenance',
    'Use "R" for real, "F" for fiction, "T" for tool, "D" for dream, "B" for belief, "M" for metaphor',
    'Never discard entities or roles',
    'Mark negation explicitly with negated: true'
  ];

  return { kind: 'parse', systemPrompt: baseSystemPrompt, examples, constraints };
}

/** Generate a native Lunum instruction for realization. */
export function buildRealizeInstruction(modelFamily: ModelFamily): InstructionTemplate {
  const baseSystemPrompt = 'Realize the Lunum-Sem structure into natural language. Preserve all meaning and protected literals.';
  const examples = [
    'Lunum: { world: "R", kind: "fact", clauses: [{ predicate: "sat", roles: { agent: "cat", location: "mat" } }] }\nOutput: "The cat sat on the mat."',
    'Lunum: { world: "R", kind: "query", clauses: [{ predicate: "open", roles: { subject: "store" } }] }\nOutput: "Is the store open?"'
  ];
  const constraints = [
    'Preserve protected literals exactly (names, URLs, dates, versions)',
    'Use the target language specified in the Lunum record',
    'Do not add meaning not present in the Lunum structure',
    'Do not omit entities or roles'
  ];

  return { kind: 'realize', systemPrompt: baseSystemPrompt, examples, constraints };
}

/** Build a complete profile for a model family. */
export function buildModelFamilyProfile(
  family: ModelFamily,
  version: string,
  tokenizerId: string,
  maxContextTokens: number
): ModelRendererProfile {
  const isNative = family === 'native';

  const mappings: LunumTokenMapping[] = isNative
    ? [
        { token: '<world>', id: 1, semantics: 'world marker', category: 'marker' },
        { token: '<predicate>', id: 2, semantics: 'predicate', category: 'predicate' },
        { token: '<role>', id: 3, semantics: 'role label', category: 'role' },
        { token: '<neg>', id: 4, semantics: 'negation', category: 'modifier' },
        { token: '<mod>', id: 5, semantics: 'modality', category: 'modifier' },
        { token: '⟨sep⟩', id: 6, semantics: 'separator', category: 'separator' }
      ]
    : [
        { token: '<world>', id: 100, semantics: 'world marker', category: 'marker' },
        { token: '<predicate>', id: 101, semantics: 'predicate', category: 'predicate' },
        { token: '<role>', id: 102, semantics: 'role label', category: 'role' }
      ];

  return {
    family,
    version,
    tokenizerId,
    mappings,
    instructions: {
      parse: buildParseInstruction(family),
      realize: buildRealizeInstruction(family),
      render: {
        kind: 'render',
        systemPrompt: isNative ? 'Render Lunum-Sem to compact native tokens.' : 'Render Lunum-Sem to model-efficient text.',
        examples: [],
        constraints: ['Preserve semantic identity', 'Minimize tokens where safe']
      },
      classify: {
        kind: 'classify',
        systemPrompt: 'Classify the Lunum record by risk, confidence, and category.',
        examples: [],
        constraints: ['Use low/medium/high/unknown risk levels', 'Track confidence 0-1']
      },
      mixed: {
        kind: 'mixed',
        systemPrompt: isNative ? 'Mix native tokens with natural language as appropriate.' : 'Mix Lunum with natural language based on policy.',
        examples: [],
        constraints: ['Use Lunum for structured meaning', 'Preserve natural language for exact wording']
      }
    },
    maxContextTokens
  };
}
