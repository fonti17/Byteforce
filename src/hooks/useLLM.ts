import { useState, useCallback, useRef, useEffect } from 'react';
import { llmService, LLMServiceError } from '../services/llmService.ts';
import type { LLMMessage, LLMRequestOptions, LLMResponse } from '../types/llm';

export function useLLM() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<LLMServiceError | Error | null>(null);
  const [data, setData] = useState<LLMResponse | null>(null);
  const [streamedText, setStreamedText] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup abort controller on component unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const sendPrompt = useCallback(
    async (promptText: string, options?: LLMRequestOptions): Promise<LLMResponse | null> => {
      abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const response = await llmService.prompt(promptText, {
          ...options,
          signal: options?.signal ?? controller.signal,
        });
        setData(response);
        return response;
      } catch (err) {
        if (err instanceof LLMServiceError && err.status === 0) {
          return null;
        }
        const serviceError =
          err instanceof Error ? err : new Error('Unknown error during LLM call');
        setError(serviceError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [abort]
  );

  const sendChat = useCallback(
    async (messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse | null> => {
      abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const response = await llmService.chat(messages, {
          ...options,
          signal: options?.signal ?? controller.signal,
        });
        setData(response);
        return response;
      } catch (err) {
        if (err instanceof LLMServiceError && err.status === 0) {
          return null;
        }
        const serviceError =
          err instanceof Error ? err : new Error('Unknown error during LLM call');
        setError(serviceError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [abort]
  );

  const streamChat = useCallback(
    async (
      messages: LLMMessage[],
      options?: LLMRequestOptions,
      onChunk?: (delta: string, accumulated: string) => void
    ): Promise<string | null> => {
      abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setStreamedText('');
      let accumulated = '';

      try {
        const generator = llmService.streamChat(messages, {
          ...options,
          signal: options?.signal ?? controller.signal,
        });
        for await (const chunk of generator) {
          accumulated += chunk.delta;
          setStreamedText(accumulated);
          if (onChunk) onChunk(chunk.delta, accumulated);
        }
        setData({ content: accumulated });
        return accumulated;
      } catch (err) {
        if (err instanceof LLMServiceError && err.status === 0) {
          return null;
        }
        const serviceError =
          err instanceof Error ? err : new Error('Unknown error during LLM streaming');
        setError(serviceError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [abort]
  );

  const reset = useCallback(() => {
    abort();
    setLoading(false);
    setError(null);
    setData(null);
    setStreamedText('');
  }, [abort]);

  return {
    loading,
    error,
    data,
    streamedText,
    sendPrompt,
    sendChat,
    streamChat,
    abort,
    reset,
  };
}
