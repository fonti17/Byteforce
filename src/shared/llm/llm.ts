export type LLMRole = 'system' | 'user' | 'assistant';

export type ApertusModelId =
  | 'apertus-8b'
  | 'apertus-70b'
  | 'apertus-ai/Apertus-v1.5-8B'
  | 'apertus-v1.5-70b';

export type LLMModel = ApertusModelId | (string & {});

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMRequestOptions {
  model?: LLMModel;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  signal?: AbortSignal;
  customHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  useProxy?: boolean;
}

export interface LLMResponse {
  content: string;
  raw?: unknown;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMStreamChunk {
  delta: string;
  raw?: unknown;
}
