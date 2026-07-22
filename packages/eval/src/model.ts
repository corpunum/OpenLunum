import type { CompletionUsage, ModelCompletion, ModelProfile } from './types.js';

export const DEFAULT_MAX_TOKENS = 4096;

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeUsage(usage: unknown): CompletionUsage | null {
  if (!usage || typeof usage !== 'object') return null;
  const rawUsage = usage as Record<string, unknown>;
  const promptTokens = readNumber(rawUsage.prompt_tokens);
  const completionTokens = readNumber(rawUsage.completion_tokens);
  const totalTokens = readNumber(rawUsage.total_tokens);
  const promptDetails = rawUsage.prompt_tokens_details;
  const completionDetails = rawUsage.completion_tokens_details;
  const cachedTokens = promptDetails && typeof promptDetails === 'object'
    ? readNumber((promptDetails as Record<string, unknown>).cached_tokens)
    : undefined;
  const reasoningTokens = completionDetails && typeof completionDetails === 'object'
    ? readNumber((completionDetails as Record<string, unknown>).reasoning_tokens)
    : undefined;

  return {
    promptTokens: promptTokens ?? null,
    completionTokens: completionTokens ?? null,
    totalTokens: totalTokens ?? null,
    cachedTokens: cachedTokens ?? null,
    reasoningTokens: reasoningTokens ?? null
  };
}

export function resolveMaxTokens(value: number | undefined): number {
  const resolved = value ?? DEFAULT_MAX_TOKENS;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error('maxTokens must be a positive safe integer');
  }
  return resolved;
}

export class OpenAICompatibleModel {
  private readonly maxTokens: number;

  constructor(private readonly profile: ModelProfile) {
    this.maxTokens = resolveMaxTokens(profile.maxTokens);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const key = this.profile.apiKeyEnv ? process.env[this.profile.apiKeyEnv] : undefined;
    if (key) headers.authorization = `Bearer ${key}`;
    return headers;
  }

  private url(path: string): string {
    return `${this.profile.baseUrl.replace(/\/$/u, '')}/${path.replace(/^\//u, '')}`;
  }

  async doctor(): Promise<unknown> {
    const response = await fetch(this.url('models'), { headers: this.headers(), signal: AbortSignal.timeout(this.profile.timeoutMs) });
    if (!response.ok) throw new Error(`Model doctor failed: HTTP ${response.status} ${await response.text()}`);
    return response.json();
  }

  async complete(system: string, user: string): Promise<ModelCompletion> {
    const effectiveSystem = this.profile.noThink ? `/no_think\n${system}` : system;
    const body: Record<string, unknown> = {
      model: this.profile.model,
      temperature: this.profile.temperature,
      max_tokens: this.maxTokens,
      messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: user }]
    };
    if (this.profile.seed !== undefined) body.seed = this.profile.seed;

    const response = await fetch(this.url('chat/completions'), {
      method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(this.profile.timeoutMs),
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Model call failed: HTTP ${response.status} ${await response.text()}`);
    const payload = await response.json() as {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string;
      }>;
      usage?: unknown;
    };
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== 'string') throw new Error('Model response did not contain choices[0].message.content');

    return {
      content,
      finishReason: choice && typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
      usage: normalizeUsage(payload.usage)
    };
  }
}
