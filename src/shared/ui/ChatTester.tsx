import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cateringPlanService } from '../../features/catering-plan/cateringPlanService.ts';
import { gatheringService } from '../../features/gathering/gatheringService.ts';
import type { GatheringState } from '../../features/gathering/gathering';
import type { ApertusModelId } from '../llm/llm';
import './ChatTester.css';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  tokens?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  durationMs?: number;
}

export function ChatTester() {
  const [model, setModel] = useState<ApertusModelId>('apertus-70b');
  const [maxTokens, setMaxTokens] = useState(700);
  const [temperature, setTemperature] = useState(0);
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [gatheringState, setGatheringState] = useState<GatheringState>(() => gatheringService.createState());
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Angaben werden geprüft...');
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    const promptText = inputPrompt.trim();
    if (!promptText || loading || finished) return;

    setError(null);
    setInputPrompt('');
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', content: promptText },
    ]);
    setLoading(true);
    setLoadingLabel('Angaben werden geprüft...');
    const startTime = performance.now();

    try {
      const turn = await gatheringService.process(promptText, gatheringState, {
        model,
        maxTokens,
        temperature,
        language: 'de',
      });
      setGatheringState({
        data: turn.data,
        messages: turn.messages,
        originalRequest: turn.originalRequest,
        expectedField: turn.expectedField,
      });
      if (turn.status === 'complete') {
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Part 1 ist vollständig.\n\nFertiger State:\n' + JSON.stringify(turn.data, null, 2),
            model: turn.response.model || model,
            tokens: turn.response.usage,
            durationMs: Math.round(performance.now() - startTime),
          },
        ]);

        setLoadingLabel('Menü und Einkaufsliste werden erstellt...');
        const planningStartedAt = performance.now();
        const planResponse = await cateringPlanService.create(turn.data, {
          model,
          temperature: 0.2,
          maxTokens: 1800,
        });
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: planResponse.content,
            model: planResponse.model || model,
            tokens: planResponse.usage,
            durationMs: Math.round(performance.now() - planningStartedAt),
          },
        ]);
        setFinished(true);
        return;
      }
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            turn.nextQuestion ??
            `Status: ${turn.status}\n\nUpdates:\n${JSON.stringify(turn.updates, null, 2)}\n\nErfasster State:\n${JSON.stringify(turn.data, null, 2)}`,
          model: turn.response.model || model,
          tokens: turn.response.usage,
          durationMs: Math.round(performance.now() - startTime),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setGatheringState(gatheringService.createState());
    setFinished(false);
    setError(null);
  };

  return (
    <div className="chat-tester-container">
      <div className="chat-tester-card">
        <div className="chat-header">
          <div className="chat-header-title">
            <h2>Catering-Erfassung</h2>
            <p>Der Assistent sammelt die erforderlichen Angaben für Ihre Catering-Anfrage.</p>
          </div>
          <div className="chat-controls-grid">
            <div className="control-group">
              <label>Modell</label>
              <select className="control-select" value={model} onChange={(event) => setModel(event.target.value as ApertusModelId)} disabled={loading}>
                <option value="apertus-70b">Apertus v1.5 70B (onprem.ai)</option>
                <option value="apertus-8b">Apertus v1.5 8B (Stoney Cloud)</option>
              </select>
            </div>
            <div className="control-group">
              <label>Max. Tokens</label>
              <input type="number" className="control-input" style={{ width: '90px' }} value={maxTokens} min={100} max={4096} step={100} onChange={(event) => setMaxTokens(Number(event.target.value))} disabled={loading} />
            </div>
            <div className="control-group">
              <label>Temperatur: {temperature}</label>
              <input type="range" min={0} max={1} step={0.1} value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} disabled={loading} />
            </div>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && !loading && (
            <div className="chat-empty"><div className="chat-empty-icon">💬</div><p>Beschreiben Sie Ihre Catering-Anfrage, um zu beginnen.</p></div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`message-bubble ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}>
              <div className="message-header">
                <span className="message-role">{message.role === 'user' ? 'Sie' : `Catering-Assistent (${message.model || model})`}</span>
                {message.durationMs !== undefined && <span className="message-meta">{message.durationMs}ms</span>}
              </div>
              <div className="message-content">{message.content}</div>
              {message.tokens && <div className="message-tokens">Tokens: Prompt {message.tokens.promptTokens} | Antwort {message.tokens.completionTokens} | Total {message.tokens.totalTokens}</div>}
            </div>
          ))}
          {loading && (
            <div className="message-bubble message-assistant">
              <div className="message-header"><span className="message-role">Catering-Assistent ({model})</span></div>
              <div className="message-content"><em>{loadingLabel}</em></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {error && <div className="chat-error">{error}</div>}

        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea className="chat-textarea" placeholder={finished ? 'Planung abgeschlossen – setzen Sie die Erfassung für einen neuen Anlass zurück.' : 'Beschreiben Sie Ihren Anlass … (Enter zum Senden, Shift+Enter für Zeilenumbruch)'} value={inputPrompt} onChange={(event) => setInputPrompt(event.target.value)} onKeyDown={handleKeyDown} disabled={loading || finished} rows={2} />
            <div className="chat-buttons">
              <button type="button" className="btn-send" onClick={() => void handleSend()} disabled={loading || finished || !inputPrompt.trim()}>{loading ? 'Wird verarbeitet…' : 'Senden'}</button>
            </div>
          </div>
          {messages.length > 0 && <button type="button" className="btn-clear" onClick={handleClear} disabled={loading}>Erfassung zurücksetzen</button>}
        </div>
      </div>
    </div>
  );
}
