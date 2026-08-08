import type { LunumToolDefinition, McpToolResponse } from './types.js';
import {
  deriveLunumSidecar,
  deriveSurfaceSidecar,
  compileContext,
  fingerprintSem,
  validateSem,
  renderSem,
  compareSem,
  classifyByCategory,
} from '@corpunum/lunum';
import type { ContextMode, LunumSem } from '@corpunum/lunum';
import { resolveConfig } from './config.js';

function ok(data: unknown): McpToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): McpToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }], isError: true };
}

export const deriveTool: LunumToolDefinition = {
  name: 'lunum_derive',
  description: 'Derive a Lunum sidecar (semantic representation + fingerprint + compact code) from input text. If no pre-parsed Sem is provided, uses surface telegraph (heuristic, no LLM needed, ~22% char savings).',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Source text to derive from' },
      role: { type: 'string', description: 'Message role (user, assistant, system)', default: 'user' },
      category: { type: 'string', description: 'Content category for policy classification' },
      sem: { type: 'object', description: 'Pre-parsed Lunum-Sem (if available); omit for surface telegraph path' },
    },
    required: ['text'],
  },
  handler: async (input: Record<string, unknown>): Promise<McpToolResponse> => {
    try {
      const text = input.text as string;
      if (!text?.trim()) return err('text is required and must be non-empty');
      const sidecar = deriveLunumSidecar({
        content: text,
        role: (input.role as string) ?? 'user',
        category: (input.category as string) ?? undefined,
        sem: (input.sem as LunumSem) ?? undefined,
      });
      return ok({ success: true, sidecar });
    } catch (error) {
      return err((error as Error).message);
    }
  },
};

export const compileContextTool: LunumToolDefinition = {
  name: 'lunum_compile_context',
  description: 'Compile an array of messages into compacted context with token counts and savings estimate. Supports natural, lunum, mixed, and shadow_mixed modes.',
  inputSchema: {
    type: 'object',
    properties: {
      messages: {
        type: 'array',
        description: 'Array of message objects with role, content, and optional lunum_code/lunum_meta fields',
      },
      mode: {
        type: 'string',
        description: 'Context compilation mode',
        enum: ['natural', 'lunum', 'mixed', 'shadow_mixed'],
      },
    },
    required: ['messages'],
  },
  handler: async (input: Record<string, unknown>): Promise<McpToolResponse> => {
    try {
      const messages = input.messages as Array<Record<string, unknown>>;
      if (!Array.isArray(messages)) return err('messages must be an array');
      const config = resolveConfig();
      const mode = (input.mode as ContextMode) ?? config.contextMode;
      const result = compileContext(messages as never[], { mode });
      return ok({
        success: true,
        mode: result.mode,
        tokenCounter: result.tokenCounter,
        naturalTokens: result.naturalTokens,
        lunumTokens: result.lunumTokens,
        mixedTokens: result.mixedTokens,
        selectedTokens: result.mode === 'lunum' ? result.lunumTokens : result.mode === 'natural' ? result.naturalTokens : result.mixedTokens,
        ratio: result.ratio,
        estimatedSavings: `${(result.estimatedSavings * 100).toFixed(1)}%`,
        messageCount: result.selectedMessages.length,
      });
    } catch (error) {
      return err((error as Error).message);
    }
  },
};

export const fingerprintTool: LunumToolDefinition = {
  name: 'lunum_fingerprint',
  description: 'Generate a deterministic semantic fingerprint (lfp:VERSION:sha256:DIGEST) for a Lunum-Sem object. Identical meaning always produces the same fingerprint.',
  inputSchema: {
    type: 'object',
    properties: {
      sem: { type: 'object', description: 'Lunum-Sem object to fingerprint' },
      length: { type: 'number', description: 'Digest length in hex chars (16-64, default 32)', default: 32 },
    },
    required: ['sem'],
  },
  handler: async (input: Record<string, unknown>): Promise<McpToolResponse> => {
    try {
      const sem = input.sem;
      if (!sem || typeof sem !== 'object') return err('sem is required and must be an object');
      const length = typeof input.length === 'number' ? input.length : undefined;
      const fp = fingerprintSem(sem, length !== undefined ? { length } : {});
      return ok({ success: true, fingerprint: fp });
    } catch (error) {
      return err((error as Error).message);
    }
  },
};

export const validateTool: LunumToolDefinition = {
  name: 'lunum_validate',
  description: 'Validate a Lunum-Sem object against the frozen schema. Returns ok/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      sem: { type: 'object', description: 'Lunum-Sem object to validate' },
    },
    required: ['sem'],
  },
  handler: async (input: Record<string, unknown>): Promise<McpToolResponse> => {
    try {
      const sem = input.sem;
      if (!sem || typeof sem !== 'object') return err('sem is required and must be an object');
      const result = validateSem(sem);
      return ok({ success: true, valid: result.ok, errors: result.errors });
    } catch (error) {
      return err((error as Error).message);
    }
  },
};

export const renderTool: LunumToolDefinition = {
  name: 'lunum_render',
  description: 'Render a Lunum-Sem to a compact code string using the default renderer profile.',
  inputSchema: {
    type: 'object',
    properties: {
      sem: { type: 'object', description: 'Lunum-Sem object to render' },
    },
    required: ['sem'],
  },
  handler: async (input: Record<string, unknown>): Promise<McpToolResponse> => {
    try {
      const sem = input.sem;
      if (!sem || typeof sem !== 'object') return err('sem is required and must be an object');
      const result = renderSem(sem as LunumSem);
      return ok({ success: true, profile: result.profile, code: result.code, semantic: result.semantic });
    } catch (error) {
      return err((error as Error).message);
    }
  },
};

export const compareTool: LunumToolDefinition = {
  name: 'lunum_compare',
  description: 'Compare two Lunum-Sem objects and return feature recall, precision, missing/extra features, and hard-mismatch detection.',
  inputSchema: {
    type: 'object',
    properties: {
      expected: { type: 'object', description: 'Expected (reference) Lunum-Sem' },
      actual: { type: 'object', description: 'Actual Lunum-Sem to compare against expected' },
      explain: { type: 'boolean', description: 'Include detailed explanation', default: false },
    },
    required: ['expected', 'actual'],
  },
  handler: async (input: Record<string, unknown>): Promise<McpToolResponse> => {
    try {
      const expected = input.expected;
      const actual = input.actual;
      if (!expected || typeof expected !== 'object') return err('expected is required and must be an object');
      if (!actual || typeof actual !== 'object') return err('actual is required and must be an object');
      const result = compareSem(expected as LunumSem, actual as LunumSem, { explain: input.explain === true });
      return ok({ success: true, comparison: result });
    } catch (error) {
      return err((error as Error).message);
    }
  },
};

export const classifyTool: LunumToolDefinition = {
  name: 'lunum_classify',
  description: 'Classify content by category and return an eligibility decision (whether Lunum compact representation is safe to use for this content).',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Content category (e.g., factual_claim, instruction, opinion)' },
      confidence: { type: 'number', description: 'Parse confidence (0-1)', default: 0.5 },
      sourceText: { type: 'string', description: 'Original source text' },
      semantic: { type: 'boolean', description: 'Whether the input was semantically parsed (vs surface heuristic)', default: false },
    },
    required: ['category'],
  },
  handler: async (input: Record<string, unknown>): Promise<McpToolResponse> => {
    try {
      const category = input.category as string;
      if (!category?.trim()) return err('category is required');
      const confidence = typeof input.confidence === 'number' ? input.confidence : 0.5;
      const sourceText = (input.sourceText as string) ?? '';
      const semantic = input.semantic === true;
      const result = classifyByCategory(category, confidence, sourceText, semantic);
      return ok({ success: true, decision: result });
    } catch (error) {
      return err((error as Error).message);
    }
  },
};

export const lunumTools: LunumToolDefinition[] = [
  deriveTool,
  compileContextTool,
  fingerprintTool,
  validateTool,
  renderTool,
  compareTool,
  classifyTool,
];
