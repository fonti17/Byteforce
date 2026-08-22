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
  GatheringUncertainty,
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
  uncertain: GatheringUncertainty[];
}

/**
 * Drives the Part-1 flow: free text goes through Apertus, structured answers are
 * applied locally so chip and field input stays instant.
 */
export function useGathering(options: GatheringOptions = {}) {
  const [data, setData] = useState<GatheringData>(createInitialGatheringData);
  const [step, setStep] = useState<PlannerStep>('landing');
  const [source, setSource] = useState<ExtractionSource | null>(null);
  const [originalRequest, setOriginalRequest] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<AnalyseResult['uncertain']>([]);
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
      let nextData: GatheringData = data;
      setData((prev) => {
        const next = applyGatheringUpdates(prev, updates);
        nextData = next.data;
        return next.data;
      });
      return nextData;
    },
    [data]
  );

  /**
   * Reads a free-text message. Apertus is the primary extractor; if it is
   * unreachable the deterministic extractor still keeps the prototype usable.
   */
  const analyse = useCallback(
    async (
      message: string,
      expectedField?: GatheringField | null
    ): Promise<AnalyseResult> => {
      const text = message.trim();
      if (!text) return { data, updates: {}, source: 'local', uncertain: [] };

      const field =
        expectedField !== undefined ? expectedField : (getMissingRequiredFields(data)[0] ?? null);

      setIsAnalysing(true);
      setError(null);
      try {
        const turn = await gatheringService.process(
          text,
          {
            data,
            messages: [],
            originalRequest,
            expectedField: field,
          },
          optionsRef.current
        );

        setData(turn.data);
        setOriginalRequest(turn.originalRequest);
        setUncertain(turn.uncertain);
        setSource('model');
        return {
          data: turn.data,
          updates: turn.updates,
          source: 'model',
          uncertain: turn.uncertain,
        };
      } catch (caught) {
        setError(caught instanceof Error ? caught : new Error('Extraction failed'));
        const deterministic = extractDeterministicUpdates(text, field);
        const next = applyGatheringUpdates(data, deterministic);

        setData(next.data);
        setOriginalRequest(originalRequest ?? text);
        setUncertain([]);
        setSource('local');
        return { data: next.data, updates: next.updates, source: 'local', uncertain: [] };
      } finally {
        setIsAnalysing(false);
      }
    },
    [data, originalRequest]
  );

  const reset = useCallback(() => {
    setData(createInitialGatheringData());
    setStep('landing');
    setSource(null);
    setOriginalRequest(null);
    setUncertain([]);
    setError(null);
  }, []);

  return {
    data,
    missingFields,
    result,
    step,
    setStep,
    source,
    originalRequest,
    uncertain,
    isAnalysing,
    error,
    analyse,
    apply,
    reset,
  };
}
