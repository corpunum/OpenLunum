import type { CompletionUsage, ModelCompletion, ModelCompletionOptions, ModelProfile, StreamingModelCompletion, StructuredOutputCapability } from './types.js';

export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Return the exact system message sent to the endpoint.  Evidence writers must
 * hash this value, rather than the pre-transport prompt, because `noThink`
 * changes the message the model actually receives.
 */
export function effectiveSystemPrompt(profile: ModelProfile, system: string): string {
  if (profile.chatTemplateKwargs?.enable_thinking === false) return system;
  return profile.noThink ? `/no_think\n${system}` : system;
}

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

/**
 * Provider boundary for constrained output.  This is deliberately a plain
 * capability description: providers may map it to JSON Schema, JSON mode,
 * grammar, or no constraint at all without leaking that choice into Lunum.
 */
export interface StructuredOutputAdapter {
  supports?(capability: StructuredOutputCapability): boolean;
  toRequest(capability: StructuredOutputCapability): Record<string, unknown> | undefined;
}

export const openAICompatibleStructuredOutputAdapter: StructuredOutputAdapter = {
  supports: (capability) => capability.mode !== 'prompt',
  toRequest(capability) {
    switch (capability.mode) {
      case 'json_schema':
        if (!capability.schema) throw new Error('json_schema structured output requires a schema');
        return {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'openlunum_output', strict: capability.strict ?? true, schema: capability.schema }
          }
        };
      case 'json_object':
        return { response_format: { type: 'json_object' } };
      case 'grammar':
        if (!capability.grammar) throw new Error('grammar structured output requires grammar text');
        // OpenAI-compatible servers that expose llama.cpp grammars accept this
        // provider extension. It remains confined to this adapter.
        return { grammar: capability.grammar };
      case 'prompt':
        return undefined;
    }
  }
};

export class ModelResponseError extends Error {
  constructor(message: string, readonly rawResponse: unknown, readonly rawRequest?: unknown) { super(message); this.name = 'ModelResponseError'; }
}

function finalContent(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;
  const parts = value.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];
    const typedPart = part as { type?: unknown; text?: unknown };
    // Providers may expose reasoning as typed content parts. Only final text
    // channels are eligible for Sem parsing; never concatenate private
    // reasoning/thinking into the answer channel.
    if (typeof typedPart.type === 'string' && /^(?:reasoning|thinking|thought)$/iu.test(typedPart.type)) return [];
    if (typeof typedPart.type === 'string' && !/^(?:text|output_text)$/iu.test(typedPart.type)) return [];
    const text = typedPart.text;
    return typeof text === 'string' ? [text] : [];
  });
  return parts.length > 0 ? parts.join('') : undefined;
}

function redactPrivateReasoning(value: unknown): unknown {
  if (Array.isArray(value)) return value
    .filter((entry) => !(entry && typeof entry === 'object' && typeof (entry as { type?: unknown }).type === 'string'
      && /^(?:reasoning|thinking|thought)$/iu.test((entry as { type: string }).type)))
    .map(redactPrivateReasoning);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(?:reasoning_content|reasoning|thinking|thought)$/iu.test(key))
    .map(([key, entry]) => [key, redactPrivateReasoning(entry)]));
}

export function normalizeModelResponse(payload: unknown): ModelCompletion {
  if (!payload || typeof payload !== 'object') throw new ModelResponseError('Model response was not a JSON object', payload);
  const raw = payload as { choices?: unknown; usage?: unknown };
  const choice = Array.isArray(raw.choices) ? raw.choices[0] : undefined;
  const message = choice && typeof choice === 'object' ? (choice as { message?: unknown }).message : undefined;
  const messageObject = message && typeof message === 'object' ? message as Record<string, unknown> : undefined;
  const content = finalContent(messageObject?.content);
  if (content === undefined) throw new ModelResponseError('Model response did not contain a final choices[0].message.content channel', redactPrivateReasoning(payload));
  const finishReason = choice && typeof choice === 'object' && typeof (choice as { finish_reason?: unknown }).finish_reason === 'string'
    ? (choice as { finish_reason: string }).finish_reason : null;
  return { content, finishReason, usage: normalizeUsage(raw.usage), rawResponse: redactPrivateReasoning(payload) };
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

  constructor(private readonly profile: ModelProfile, private readonly structuredOutputAdapter: StructuredOutputAdapter = openAICompatibleStructuredOutputAdapter) {
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

  async complete(system: string, user: string, options: ModelCompletionOptions = {}): Promise<ModelCompletion> {
    const effectiveSystem = effectiveSystemPrompt(this.profile, system);
    const body: Record<string, unknown> = {
      model: this.profile.model,
      temperature: this.profile.temperature,
      max_tokens: this.maxTokens,
      messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: user }]
    };
    if (this.profile.seed !== undefined) body.seed = this.profile.seed;
    if (this.profile.chatTemplateKwargs) body.chat_template_kwargs = this.profile.chatTemplateKwargs;
    const capability = options.structuredOutput;
    const supported = capability && this.structuredOutputAdapter.supports ? this.structuredOutputAdapter.supports(capability) : true;
    const selectedCapability = capability && !supported
      ? capability.fallback === 'json_object' ? { mode: 'json_object' as const } : { mode: 'prompt' as const }
      : capability;
    const structuredRequest = selectedCapability ? this.structuredOutputAdapter.toRequest(selectedCapability) : undefined;
    if (structuredRequest) Object.assign(body, structuredRequest);

    const response = await fetch(this.url('chat/completions'), {
      method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(this.profile.timeoutMs),
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new ModelResponseError(`Model call failed: HTTP ${response.status} ${responseText}`, {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText
      }, body);
    }
    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new ModelResponseError('Model response was not valid JSON', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText
      }, body);
    }
    try {
      const completion = normalizeModelResponse(payload);
      return { ...completion, rawRequest: body };
    } catch (error) {
      if (error instanceof ModelResponseError) throw new ModelResponseError(error.message, error.rawResponse, body);
      throw error;
    }
  }

  /**
   * Opt-in streaming alternative to complete() (R14.1). Sends the same request shape as
   * complete() plus `stream: true`, and reconstructs the completion by reading the
   * server-sent-event chunks as they arrive. Captures time-to-first-token (TTFT), total
   * generation wall time, and time-per-output-token (TPOT) alongside the same
   * content/finishReason/usage fields complete() returns.
   *
   * This method is entirely additive: complete() is untouched, and no existing caller's
   * behavior or request shape changes unless it explicitly switches to this method.
   */
  async completeStreaming(system: string, user: string): Promise<StreamingModelCompletion> {
    const effectiveSystem = effectiveSystemPrompt(this.profile, system);
    const body: Record<string, unknown> = {
      model: this.profile.model,
      temperature: this.profile.temperature,
      max_tokens: this.maxTokens,
      messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: user }],
      stream: true,
      stream_options: { include_usage: true }
    };
    if (this.profile.seed !== undefined) body.seed = this.profile.seed;
    if (this.profile.chatTemplateKwargs) body.chat_template_kwargs = this.profile.chatTemplateKwargs;

    const startedAt = performance.now();
    const response = await fetch(this.url('chat/completions'), {
      method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(this.profile.timeoutMs),
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Model call failed: HTTP ${response.status} ${await response.text()}`);
    if (!response.body) throw new Error('Streaming model response had no body');

    // Mutable accumulator object (rather than separate `let` bindings) so the nested
    // per-event handler below can update state without relying on cross-closure
    // control-flow narrowing.
    const state: {
      content: string;
      finishReason: string | null;
      usage: CompletionUsage | null;
      ttftMs: number | null;
      tokenCount: number;
      done: boolean;
    } = { content: '', finishReason: null, usage: null, ttftMs: null, tokenCount: 0, done: false };

    const handleEvent = (data: string): void => {
      if (data === '[DONE]') { state.done = true; return; }
      let parsed: { choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string }; finish_reason?: string }>; usage?: unknown };
      try {
        parsed = JSON.parse(data) as typeof parsed;
      } catch {
        return;
      }
      const choice = parsed.choices?.[0];
      const deltaContent = choice?.delta?.content;
      if (typeof deltaContent === 'string' && deltaContent.length > 0) {
        if (state.ttftMs === null) state.ttftMs = performance.now() - startedAt;
        state.content += deltaContent;
        state.tokenCount += 1;
      }
      if (choice && typeof choice.finish_reason === 'string') state.finishReason = choice.finish_reason;
      if (parsed.usage) state.usage = normalizeUsage(parsed.usage);
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!state.done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of rawEvent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            handleEvent(trimmed.slice('data:'.length).trim());
          }
          if (state.done) break;
          boundary = buffer.indexOf('\n\n');
        }
      }
    } finally {
      reader.releaseLock();
    }

    const totalMs = performance.now() - startedAt;
    const effectiveTokenCount = state.usage?.completionTokens ?? state.tokenCount;
    const tpotMs = state.ttftMs !== null && effectiveTokenCount > 1
      ? (totalMs - state.ttftMs) / (effectiveTokenCount - 1)
      : null;

    const completion: StreamingModelCompletion = {
      content: state.content,
      finishReason: state.finishReason,
      usage: state.usage,
      ttftMs: state.ttftMs,
      totalMs,
      tpotMs,
      tokenCount: effectiveTokenCount
    };
    return completion;
  }
}
