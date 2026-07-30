import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateModelProfile,
  buildParseInstruction,
  buildRealizeInstruction,
  buildModelFamilyProfile,
  type LunumNativeProfile
} from '../src/index.js';

describe('native-model', () => {
  function buildProfile(overrides: Partial<LunumNativeProfile> = {}): LunumNativeProfile {
    return {
      family: 'native',
      version: '1.0.0',
      tokenizerId: 'lunum-native-v1',
      mappings: [
        { token: '<world>', id: 1, semantics: 'world', category: 'marker' },
        { token: '<pred>', id: 2, semantics: 'predicate', category: 'predicate' }
      ],
      instructions: {
        parse: {
          kind: 'parse',
          systemPrompt: 'Parse into Lunum-Sem.',
          examples: ['Input: hello\nOutput: { clauses: [] }'],
          constraints: ['Preserve meaning']
        },
        realize: {
          kind: 'realize',
          systemPrompt: 'Realize to natural language.',
          examples: ['Lunum: ...\nOutput: hello'],
          constraints: ['Preserve literals']
        },
        render: {
          kind: 'render',
          systemPrompt: 'Render compact.',
          examples: [],
          constraints: ['Preserve identity']
        },
        classify: {
          kind: 'classify',
          systemPrompt: 'Classify risk.',
          examples: [],
          constraints: ['Use standard levels']
        },
        mixed: {
          kind: 'mixed',
          systemPrompt: 'Mix as appropriate.',
          examples: [],
          constraints: ['Use Lunum for structure']
        }
      },
      maxContextTokens: 4096,
      ...overrides
    };
  }

  it('validates a complete native profile', () => {
    const profile = buildProfile();
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('validates a complete non-native profile', () => {
    const profile = buildProfile({
      family: 'llama',
      tokenizerId: 'llama3-8b',
      mappings: [
        { token: '<world>', id: 100, semantics: 'world', category: 'marker' }
      ]
    });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('rejects profile missing family', () => {
    const profile = buildProfile({ family: undefined as unknown as 'native' });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('family')));
  });

  it('rejects profile with invalid family', () => {
    const profile = buildProfile({ family: 'xyz' as 'native' });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('family')));
  });

  it('rejects profile missing version', () => {
    const profile = buildProfile({ version: '' });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('version')));
  });

  it('rejects profile missing tokenizerId', () => {
    const profile = buildProfile({ tokenizerId: '' });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('tokenizerId')));
  });

  it('rejects profile with invalid maxContextTokens', () => {
    const profile = buildProfile({ maxContextTokens: 0 });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('maxContextTokens')));
  });

  it('rejects profile with empty mappings', () => {
    const profile = buildProfile({ mappings: [] });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('mappings')));
  });

  it('rejects profile with invalid instruction kind', () => {
    const badInstructions = {
      parse: { kind: 'parse', systemPrompt: 'x', examples: [], constraints: [] },
      realize: { kind: 'realize', systemPrompt: 'x', examples: [], constraints: [] },
      render: { kind: 'render', systemPrompt: 'x', examples: [], constraints: [] },
      classify: { kind: 'classify', systemPrompt: 'x', examples: [], constraints: [] },
      mixed: { kind: 'mixed', systemPrompt: 'x', examples: [], constraints: [] }
    };
    (badInstructions.parse as any).systemPrompt = '';
    const profile = buildProfile({ instructions: badInstructions as any });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('kind') || e.includes('systemPrompt')));
  });

  it('rejects instruction missing systemPrompt', () => {
    const profile = buildProfile({
      instructions: {
        parse: {
          kind: 'parse',
          systemPrompt: '',
          examples: [],
          constraints: []
        },
        realize: buildProfile().instructions.realize,
        render: buildProfile().instructions.render,
        classify: buildProfile().instructions.classify,
        mixed: buildProfile().instructions.mixed
      }
    });
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('systemPrompt')));
  });

  it('buildParseInstruction returns valid template', () => {
    const template = buildParseInstruction('native');
    assert.strictEqual(template.kind, 'parse');
    assert.ok(template.systemPrompt.length > 0);
    assert.ok(template.examples.length > 0);
    assert.ok(template.constraints.length > 0);
  });

  it('buildRealizeInstruction returns valid template', () => {
    const template = buildRealizeInstruction('native');
    assert.strictEqual(template.kind, 'realize');
    assert.ok(template.systemPrompt.length > 0);
    assert.ok(template.examples.length > 0);
    assert.ok(template.constraints.length > 0);
  });

  it('buildModelFamilyProfile creates valid native profile', () => {
    const profile = buildModelFamilyProfile('native', '1.0.0', 'native-v1', 8192);
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(profile.family, 'native');
    assert.strictEqual(profile.mappings.length > 5, true); // Native has more mappings
  });

  it('buildModelFamilyProfile creates valid non-native profile', () => {
    const profile = buildModelFamilyProfile('llama', '1.0.0', 'llama3', 8192);
    const result = validateModelProfile(profile);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(profile.family, 'llama');
  });

  it('all five instruction kinds are valid', () => {
    for (const kind of ['parse', 'realize', 'render', 'classify', 'mixed'] as const) {
      const template = kind === 'parse' ? buildParseInstruction('native') : buildRealizeInstruction('native');
      if (template.kind === kind) {
        assert.strictEqual(template.kind, kind);
      }
    }
  });

  it('all model families are valid', () => {
    for (const family of ['native', 'gemma', 'llama', 'qwen', 'claude', 'gemini', 'openai', 'unknown'] as const) {
      const profile = buildModelFamilyProfile(family, '1.0.0', 'test', 4096);
      const result = validateModelProfile(profile);
      assert.strictEqual(result.ok, true, `family ${family} should be valid`);
    }
  });
});
