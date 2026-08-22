import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyGatheringUpdates,
  buildGatheringResult,
  createInitialGatheringData,
  extractDeterministicUpdates,
  gatheringService,
  getMissingRequiredFields,
} from '../services/gatheringService';
import type {
  GatheringData,
  GatheringField,
  GatheringOptions,
  GatheringUpdates,
} from '../types/gathering';

export type PlannerStep =
  | 'landing'
  | 'brief'
  | 'input'
  | 'result'
  | 'plan'
  | 'recipes'
  | 'recipeDetail';

/** Which extractor produced the most recent read of a free-text message. */
export type ExtractionSource = 'model' | 'local';

export interface AnalyseResult {
  /** Data after the message was read — available before React re-renders. */
  data: GatheringData;
  updates: GatheringUpdates;
  source: ExtractionSource;
}

/**
 * Drives the Part-1 flow: free text goes through Apertus, structured answers are
 * applied locally so chip and field input stays instant.
 */
export function useGathering(options: GatheringOptions = {}) {
  const [data, setData] = useState<GatheringData>(createInitialGatheringData);
  const [step, setStep] = useState<PlannerStep>('landing');
  const [source, setSource] = useState<ExtractionSource | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Callers pass an options literal, which would otherwise re-create `analyse`
  // on every render and invalidate every memo downstream.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const missingFields = useMemo(() => getMissingRequiredFields(data), [data]);
  const result = useMemo(() => buildGatheringResult(data), [data]);

  /** Applies structured answers and hands back the resulting data synchronously. */
  const apply = useCallback(
    (updates: GatheringUpdates): GatheringData => {
      const next = applyGatheringUpdates(data, updates);
      setData(next.data);
      return next.data;
    },
    [data]
  );

  /**
   * Reads a free-text message. Apertus is the primary extractor; if it is
   * unreachable the deterministic extractor still keeps the prototype usable.
   */
  const analyse = useCallback(
    async (message: string, expectedField?: GatheringField | null): Promise<AnalyseResult> => {
      const text = message.trim();
      if (!text) return { data, updates: {}, source: 'local' };

      const field =
        expectedField !== undefined ? expectedField : (getMissingRequiredFields(data)[0] ?? null);

      setIsAnalysing(true);
      setError(null);
      try {
        const turn = await gatheringService.process(
          text,
          { data, messages: [], expectedField: field },
          optionsRef.current
        );
        setData(turn.data);
        setSource('model');
        return { data: turn.data, updates: turn.updates, source: 'model' };
      } catch (caught) {
        setError(caught instanceof Error ? caught : new Error('Extraction failed'));
        const deterministic = extractDeterministicUpdates(text, field);
        const next = applyGatheringUpdates(data, deterministic);
        setData(next.data);
        setSource('local');
        return { data: next.data, updates: next.updates, source: 'local' };
      } finally {
        setIsAnalysing(false);
      }
    },
    [data]
  );

  const reset = useCallback(() => {
    setData(createInitialGatheringData());
    setStep('landing');
    setSource(null);
    setError(null);
  }, []);

  return {
    data,
    missingFields,
    result,
    step,
    setStep,
    source,
    isAnalysing,
    error,
    analyse,
    apply,
    reset,
  };
}
