import type { ModelProfile } from './types.js';

export class OpenAICompatibleModel {
  constructor(private readonly profile: ModelProfile) {}

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
    const body: Record<string, unknown> = {
      model: this.profile.model,
      temperature: this.profile.temperature,
      seed: this.profile.seed,
      max_tokens: this.profile.maxTokens ?? 4096,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    };
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
