import { useCallback, useEffect, useRef, useState } from 'react';
import { cateringPlanService } from '../services/cateringPlanService';
import type { CateringPlan, CateringPlanOptions } from '../types/cateringPlan';
import type { GatheringResult } from '../types/gathering';

/**
 * Drives part 2: the completed part-1 payload goes to Apertus once and comes back
 * as the structure described by `config/cateringPlanConfig.json`.
 */
export function useCateringPlan(options: CateringPlanOptions = {}) {
  const [plan, setPlan] = useState<CateringPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Callers pass an options literal, which would otherwise re-create `generate`
  // on every render.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Generation is auto-started from an effect, so a second call while a request
  // is still open (StrictMode, a re-render) must not fire another request.
  const pendingRef = useRef(false);

  const generate = useCallback(async (result: GatheringResult): Promise<CateringPlan | null> => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setIsPlanning(true);
    setError(null);
    try {
      const turn = await cateringPlanService.plan(result, optionsRef.current);
      setPlan(turn.plan);
      return turn.plan;
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Planning failed'));
      return null;
    } finally {
      pendingRef.current = false;
      setIsPlanning(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPlan(null);
    setError(null);
  }, []);

  return { plan, isPlanning, error, generate, reset };
}
