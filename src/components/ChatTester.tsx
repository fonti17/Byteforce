import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { llmService, LLMServiceError } from '../services/llmService';
import type { ApertusModelId, LLMMessage } from '../types/llm';
import './ChatTester.css';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokens?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  durationMs?: number;
}

export function ChatTester() {
  const [model, setModel] = useState<ApertusModelId>('apertus-70b');
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [systemPrompt, setSystemPrompt] = useState<string>('You are a helpful and concise AI assistant.');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentStreamingText, setCurrentStreamingText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message or stream chunk
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingText, loading]);

  const handleSend = async () => {
    const promptText = inputPrompt.trim();
    if (!promptText || loading) return;

    setError(null);
    setInputPrompt('');

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: promptText,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);
    setCurrentStreamingText('');

    const startTime = performance.now();

    // Prepare API history
    const apiMessages: LLMMessage[] = newMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      if (isStreaming) {
        let accumulated = '';
        const generator = llmService.streamChat(apiMessages, {
          model,
          maxTokens,
          temperature,
          systemPrompt: systemPrompt.trim() || undefined,
        });

        for await (const chunk of generator) {
          accumulated += chunk.delta;
          setCurrentStreamingText(accumulated);
        }

        const durationMs = Math.round(performance.now() - startTime);

        const assistantMessage: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: accumulated,
          model,
          durationMs,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setCurrentStreamingText('');
      } else {
        const response = await llmService.chat(apiMessages, {
          model,
          maxTokens,
          temperature,
          systemPrompt: systemPrompt.trim() || undefined,
        });

        const durationMs = Math.round(performance.now() - startTime);

        const assistantMessage: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.content,
          model: response.model || model,
          tokens: response.usage,
          durationMs,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (err) {
      if (err instanceof LLMServiceError) {
        setError(`[Status ${err.status ?? 'Error'}]: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
      setCurrentStreamingText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
    setCurrentStreamingText('');
  };

  return (
    <div className="chat-tester-container">
      <div className="chat-tester-card">
        {/* Header with Model & Parameter Controls */}
        <div className="chat-header">
          <div className="chat-header-title">
            <h2>Apertus LLM Interface</h2>
            <p>Test prompt completions and tune parameters</p>
          </div>

          <div className="chat-controls-grid">
            <div className="control-group">
              <label>Model</label>
              <select
                className="control-select"
                value={model}
                onChange={(e) => setModel(e.target.value as ApertusModelId)}
                disabled={loading}
              >
                <option value="apertus-70b">Apertus v1.5 70B (onprem.ai)</option>
                <option value="apertus-8b">Apertus v1.5 8B (Stoney Cloud)</option>
              </select>
            </div>

            <div className="control-group">
              <label>Max Tokens</label>
              <input
                type="number"
                className="control-input"
                style={{ width: '90px' }}
                value={maxTokens}
                min={10}
                max={4096}
                step={64}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                disabled={loading}
              />
            </div>

            <div className="control-group">
              <label>Temperature: {temperature}</label>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                disabled={loading}
              />
            </div>

            <label className="control-checkbox-label">
              <input
                type="checkbox"
                checked={isStreaming}
                onChange={(e) => setIsStreaming(e.target.checked)}
                disabled={loading}
              />
              Stream
            </label>
          </div>
        </div>

        {/* System Prompt Bar */}
        <div className="system-prompt-bar">
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            System:
          </label>
          <input
            type="text"
            placeholder="System prompt (optional)..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Chat Messages */}
        <div className="chat-messages">
          {messages.length === 0 && !loading && (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <p>Type a prompt below to start testing the model.</p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message-bubble ${
                msg.role === 'user' ? 'message-user' : 'message-assistant'
              }`}
            >
              <div className="message-header">
                <span className="message-role">
                  {msg.role === 'user' ? 'You' : `Apertus (${msg.model || model})`}
                </span>
                {msg.durationMs !== undefined && (
                  <span className="message-meta">{msg.durationMs}ms</span>
                )}
              </div>
              <div className="message-content">{msg.content}</div>
              {msg.tokens && (
                <div className="message-tokens">
                  Tokens: prompt {msg.tokens.promptTokens} | completion {msg.tokens.completionTokens} | total {msg.tokens.totalTokens}
                </div>
              )}
            </div>
          ))}

          {/* Currently Streaming Response Bubble */}
          {loading && currentStreamingText && (
            <div className="message-bubble message-assistant">
              <div className="message-header">
                <span className="message-role">Apertus ({model})</span>
                <span className="message-meta">Streaming...</span>
              </div>
              <div className="message-content">
                {currentStreamingText}
                <span className="streaming-cursor" />
              </div>
            </div>
          )}

          {/* Loading placeholder when awaiting first chunk */}
          {loading && !currentStreamingText && (
            <div className="message-bubble message-assistant">
              <div className="message-header">
                <span className="message-role">Apertus ({model})</span>
              </div>
              <div className="message-content">
                <em>Thinking...</em>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Error Notification */}
        {error && <div className="chat-error">{error}</div>}

        {/* Input Controls */}
        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea
              className="chat-textarea"
              placeholder="Ask a question or enter a prompt... (Enter to send, Shift+Enter for new line)"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={2}
            />
            <div className="chat-buttons">
              <button
                type="button"
                className="btn-send"
                onClick={handleSend}
                disabled={loading || !inputPrompt.trim()}
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              className="btn-clear"
              onClick={handleClear}
              disabled={loading}
            >
              Clear Conversation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
