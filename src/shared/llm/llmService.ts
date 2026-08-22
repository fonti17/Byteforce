import type {
  LLMMessage,
  LLMModel,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
} from './llm';

export class LLMServiceError extends Error {
  status?: number;
  responseBody?: unknown;

  constructor(message: string, status?: number, responseBody?: unknown) {
    super(message);
    this.name = 'LLMServiceError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

interface ModelConfig {
  modelName: string;
  directEndpoint: string;
  proxyEndpoint: string;
  apiKey: string;
}

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as unknown as Record<string, string | undefined>)
    : typeof globalThis !== 'undefined' && (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!
      : {};

const APERTUS_CONFIGS = {
  '8b': {
    modelName: env.VITE_APERTUS_8B_MODEL || 'apertus-ai/Apertus-v1.5-8B',
    directEndpoint:
      env.VITE_APERTUS_8B_ENDPOINT ||
      'https://llm.stoney-cloud.com/v1/chat/completions',
    proxyEndpoint: '/api/stoney/v1/chat/completions',
    apiKey: env.VITE_APERTUS_8B_KEY || '',
  },
  '70b': {
    modelName: env.VITE_APERTUS_70B_MODEL || 'apertus-v1.5-70b',
    directEndpoint:
      env.VITE_APERTUS_70B_ENDPOINT ||
      'https://llm-api2.b.onprem.ai/openai/v1/chat/completions',
    proxyEndpoint: '/api/onprem/openai/v1/chat/completions',
    apiKey: env.VITE_APERTUS_70B_KEY || '',
  },
};

function resolveModelConfig(model?: LLMModel): ModelConfig {
  const selected = model || env.VITE_DEFAULT_LLM_MODEL || 'apertus-70b';

  if (selected === 'apertus-8b' || selected === 'apertus-ai/Apertus-v1.5-8B' || selected === '8b') {
    return APERTUS_CONFIGS['8b'];
  }

  // Default to 70b
  return APERTUS_CONFIGS['70b'];
}

function resolveEndpoint(config: ModelConfig, useProxyOption?: boolean): string {
  // Use dev proxy when running in Vite dev server to bypass browser CORS preflight restrictions
  const preferProxy =
    useProxyOption ??
    (env.DEV && env.VITE_USE_PROXY !== 'false');

  return preferProxy ? config.proxyEndpoint : config.directEndpoint;
}

export const llmService = {
  /**
   * Build request headers with Bearer token authentication
   */
  getHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return headers;
  },

  /**
   * Send a chat completion request to the Apertus endpoint
   */
  async chat(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<LLMResponse> {
    const {
      model,
      temperature,
      maxTokens = 1024,
      systemPrompt,
      signal,
      customHeaders,
      extraBody,
      useProxy,
    } = options;

    const config = resolveModelConfig(model);

    if (!config.apiKey) {
      throw new LLMServiceError(
        `API key is missing for model '${config.modelName}'. Please configure it in your .env.local file.`
      );
    }

    const endpoint = resolveEndpoint(config, useProxy);

    const formattedMessages: LLMMessage[] = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push(...messages);

    const payload = {
      model: config.modelName,
      messages: formattedMessages,
      max_tokens: maxTokens,
      ...(temperature !== undefined && { temperature }),
      ...extraBody,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(config.apiKey, customHeaders),
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }
        throw new LLMServiceError(
          `Apertus API request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();

      return {
        content: data?.choices?.[0]?.message?.content ?? '',
        model: data?.model ?? config.modelName,
        raw: data,
        usage: data?.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof LLMServiceError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LLMServiceError('Request was aborted.', 0);
      }
      throw new LLMServiceError(
        error instanceof Error ? error.message : 'Unknown LLM service error'
      );
    }
  },

  /**
   * Convenience helper to send a single prompt query
   */
  async prompt(promptText: string, options: LLMRequestOptions = {}): Promise<LLMResponse> {
    return this.chat([{ role: 'user', content: promptText }], options);
  },

  /**
   * Stream response chunks (Server-Sent Events / streaming reader)
   */
  async *streamChat(
    messages: LLMMessage[],
    options: LLMRequestOptions = {}
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const {
      model,
      temperature,
      maxTokens = 1024,
      systemPrompt,
      signal,
      customHeaders,
      extraBody,
      useProxy,
    } = options;

    const config = resolveModelConfig(model);

    if (!config.apiKey) {
      throw new LLMServiceError(
        `API key is missing for model '${config.modelName}'. Please configure it in your .env.local file.`
      );
    }

    const endpoint = resolveEndpoint(config, useProxy);

    const formattedMessages: LLMMessage[] = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push(...messages);

    const payload = {
      model: config.modelName,
      messages: formattedMessages,
      max_tokens: maxTokens,
      stream: true,
      ...(temperature !== undefined && { temperature }),
      ...extraBody,
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(config.apiKey, customHeaders),
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LLMServiceError('Request was aborted.', 0);
      }
      throw new LLMServiceError(
        error instanceof Error ? error.message : 'Failed to connect to LLM stream.'
      );
    }

    if (!response.ok || !response.body) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      throw new LLMServiceError(
        `Streaming request failed with status ${response.status}`,
        response.status,
        errorData
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') return;

          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed?.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                yield { delta, raw: parsed };
              }
            } catch {
              // Non-JSON SSE line or keepalive ping
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
