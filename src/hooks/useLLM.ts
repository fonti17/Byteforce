import { useState, useCallback } from 'react';
import { llmService, LLMServiceError } from '../services/llmService';
import type { LLMMessage, LLMRequestOptions, LLMResponse } from '../types/llm';

export function useLLM() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<LLMServiceError | Error | null>(null);
  const [data, setData] = useState<LLMResponse | null>(null);
  const [streamedText, setStreamedText] = useState<string>('');

  const sendPrompt = useCallback(
    async (promptText: string, options?: LLMRequestOptions): Promise<LLMResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await llmService.prompt(promptText, options);
        setData(response);
        return response;
      } catch (err) {
        const serviceError =
          err instanceof Error ? err : new Error('Unknown error during LLM call');
        setError(serviceError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const sendChat = useCallback(
    async (messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await llmService.chat(messages, options);
        setData(response);
        return response;
      } catch (err) {
        const serviceError =
          err instanceof Error ? err : new Error('Unknown error during LLM call');
        setError(serviceError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const streamPrompt = useCallback(
    async (
      promptText: string,
      options?: LLMRequestOptions,
      onChunk?: (delta: string, accumulated: string) => void
    ): Promise<string | null> => {
      setLoading(true);
      setError(null);
      setStreamedText('');
      let accumulated = '';

      try {
        const generator = llmService.streamChat([{ role: 'user', content: promptText }], options);
        for await (const chunk of generator) {
          accumulated += chunk.delta;
          setStreamedText(accumulated);
          if (onChunk) onChunk(chunk.delta, accumulated);
        }
        setData({ content: accumulated });
        return accumulated;
      } catch (err) {
        const serviceError =
          err instanceof Error ? err : new Error('Unknown error during LLM streaming');
        setError(serviceError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
    setStreamedText('');
  }, []);

  return {
    loading,
    error,
    data,
    streamedText,
    sendPrompt,
    sendChat,
    streamPrompt,
    reset,
  };
}
