import type { ModelProfile } from './types.js';

export const DEFAULT_MAX_TOKENS = 4096;

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

  async complete(system: string, user: string): Promise<string> {
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
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Model response did not contain choices[0].message.content');
    return content;
  }
}
