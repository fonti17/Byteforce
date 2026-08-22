import { useCallback, useEffect, useRef, useState } from 'react';
import { cateringPlanService } from '../services/cateringPlanService';
import { priceService } from '../services/priceService';
import type {
  CateringPlan,
  CateringPlanInput,
  CateringPlanOptions,
  PricedCateringPlan,
} from '../types/cateringPlan';
import { buildPlanFromRecipes } from '../services/recipeService';
import type { GatheringResult } from '../types/gathering';

/** Which side produced the plan currently on screen. */
export type PlanSource = 'model' | 'local';

/**
 * Drives part 2: the completed part-1 payload goes to Apertus once and comes back
 * as the structure described by `config/cateringPlanConfig.json`.
 */
export function useCateringPlan(options: CateringPlanOptions = {}) {
  const [plan, setPlan] = useState<PricedCateringPlan | null>(null);
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

  const generate = useCallback(async (
    input: GatheringResult | CateringPlanInput
  ): Promise<PricedCateringPlan | null> => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setIsPlanning(true);
    setError(null);
    setStreamedText('');
    try {
      const gatheringResult = ('gatheringState' in input
        ? input.gatheringState
        : input) as GatheringResult;
      const recipes = optionsRef.current.recipes ?? [];
      let basePlan: CateringPlan;
      let planSource: PlanSource = 'model';

      try {
        const turn = await cateringPlanService.plan(input, optionsRef.current);
        basePlan = turn.plan;
      } catch (planningError) {
        // Recipe quantities are deterministic, so they can still form the plan
        // when Apertus is unavailable. Pricing happens once after this branch.
        if (recipes.length === 0) throw planningError;
        basePlan = buildPlanFromRecipes(recipes, gatheringResult);
        planSource = 'local';
      }

      const pricedPlan = await priceService.enrich(basePlan);
      setPlan(pricedPlan);
      setSource(planSource);
      return pricedPlan;
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
    setSource(null);
    setStreamedText('');
    setError(null);
  }, []);

  return { plan, isPlanning, streamedText, source, error, generate, reset };
}
