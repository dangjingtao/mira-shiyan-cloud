import type { LlmFailure, LlmUsage } from './llm';

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export interface OpenAiCompatConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export interface LlmCallInput {
  systemPrompt: string;
  userPrompt: string;
}

export type LlmCallResult =
  | {
      ok: true;
      content: string;
      provider: string;
      model: string;
      latencyMs: number;
      usage?: LlmUsage;
      providerRequestId?: string;
    }
  | { ok: false; error: LlmFailure };

type ChatCompletionResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * One adapter for every OpenAI-compatible chat completions provider
 * (DeepSeek / Moonshot / Volcano / ...). Provider identity, endpoint and model
 * come from configuration; only the API key is a secret.
 *
 * Normalized failures never embed the raw upstream body, so provider details
 * or keys cannot leak to callers.
 */
export class OpenAiCompatibleChatProvider {
  constructor(
    private readonly config: OpenAiCompatConfig,
    private readonly fetchLike: FetchLike = fetch,
  ) {}

  async complete(input: LlmCallInput): Promise<LlmCallResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchLike(
        `${this.config.baseUrl.replace(/\/+$/u, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: 'system', content: input.systemPrompt },
              { role: 'user', content: input.userPrompt },
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      clearTimeout(timer);
      return {
        ok: false,
        error: isAbort(error)
          ? {
              kind: 'retryable',
              code: 'timeout',
              message: `${this.config.provider} request timed out after ${this.config.timeoutMs}ms`,
            }
          : {
              kind: 'retryable',
              code: 'provider_error',
              message: `${this.config.provider} request failed before a response arrived`,
            },
      };
    }
    clearTimeout(timer);

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return { ok: false, error: this.httpFailure(response.status) };
    }

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          code: 'invalid_response',
          message: `${this.config.provider} returned HTTP 200 with a non-JSON body`,
        },
      };
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          code: 'invalid_response',
          message: `${this.config.provider} returned no completion content`,
        },
      };
    }

    const usage = payload.usage;
    return {
      ok: true,
      content,
      provider: this.config.provider,
      model: this.config.model,
      latencyMs,
      ...(usage
        ? {
            usage: {
              ...(typeof usage.prompt_tokens === 'number'
                ? { promptTokens: usage.prompt_tokens }
                : {}),
              ...(typeof usage.completion_tokens === 'number'
                ? { completionTokens: usage.completion_tokens }
                : {}),
              ...(typeof usage.total_tokens === 'number'
                ? { totalTokens: usage.total_tokens }
                : {}),
            },
          }
        : {}),
      ...(payload.id ? { providerRequestId: payload.id } : {}),
    };
  }

  private httpFailure(status: number): LlmFailure {
    const provider = this.config.provider;
    if (status === 429) {
      return {
        kind: 'retryable',
        code: 'rate_limited',
        message: `${provider} rate limited the request (HTTP 429)`,
      };
    }
    if (status >= 500) {
      return {
        kind: 'retryable',
        code: 'provider_error',
        message: `${provider} returned HTTP ${status}`,
      };
    }
    if (status === 401 || status === 403) {
      return {
        kind: 'terminal',
        code: 'provider_error',
        message: `${provider} rejected the configured credential (HTTP ${status})`,
      };
    }
    // 400/404/422 and other 4xx are input or contract problems: retrying the
    // identical request or failing over cannot fix them.
    return {
      kind: 'terminal',
      code: 'invalid_request',
      message: `${provider} rejected the request (HTTP ${status})`,
    };
  }
}
