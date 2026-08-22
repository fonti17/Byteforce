import { useCallback, useEffect, useRef, useState } from 'react';
import { cateringPlanService } from '../services/cateringPlanService';
import { buildPlanFromRecipes } from '../services/recipeService';
import type { CateringPlan, CateringPlanInput, CateringPlanOptions } from '../types/cateringPlan';
import type { GatheringResult } from '../types/gathering';

/** Which side produced the plan currently on screen. */
export type PlanSource = 'model' | 'local';

/**
 * Drives part 2: the completed part-1 payload goes to Apertus once and comes back
 * as the structure described by `config/cateringPlanConfig.json`.
 */
export function useCateringPlan(options: CateringPlanOptions = {}) {
  const [plan, setPlan] = useState<CateringPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [source, setSource] = useState<PlanSource | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Callers pass an options literal, which would otherwise re-create `generate`
  // on every render.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // A second call while a request is still open must not fire another request.
  const pendingRef = useRef(false);

  const generate = useCallback(async (result: GatheringResult | CateringPlanInput): Promise<CateringPlan | null> => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setIsPlanning(true);
    setError(null);
    setStreamedText('');
    try {
      const turn = await cateringPlanService.stream(
        result,
        optionsRef.current,
        setStreamedText
      );
      setPlan(turn.plan);
      setSource('model');
      return turn.plan;
    } catch (caught) {
      // Chosen recipes already carry the menu and the quantities, so an
      // unreachable model costs the cost estimate, not the shopping list.
      const recipes = optionsRef.current.recipes ?? [];
      if (recipes.length > 0) {
        const gatheringResult = ('gatheringState' in result
          ? result.gatheringState
          : result) as GatheringResult;
        const local = buildPlanFromRecipes(recipes, gatheringResult);
        setPlan(local);
        setSource('local');
        return local;
      }
      setError(caught instanceof Error ? caught : new Error('Planning failed'));
      return null;
    } finally {
      pendingRef.current = false;
      setIsPlanning(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPlan(null);
    setSource(null);
    setStreamedText('');
    setError(null);
  }, []);

  return { plan, isPlanning, streamedText, source, error, generate, reset };
}
