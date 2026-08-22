import { useCallback, useEffect, useRef, useState } from 'react';
import { cateringPlanService } from '../cateringPlanService';
import { llmPriceService } from '@/features/pricing/llmPriceService';
import type {
  CateringPlan,
  CateringPlanInput,
  CateringPlanOptions,
  PricedCateringPlan,
} from '../types';
import { buildPlanFromRecipes } from '@/features/recipes/recipeService';
import type { GatheringResult } from '@/features/gathering/types';

/** Which side produced the plan currently on screen. */
export type PlanSource = 'model' | 'local';

/**
 * Drives part 2: the completed part-1 payload goes to Apertus once and comes back
 * as the structure described by `cateringPlan.config.json`.
 */
export function useCateringPlan(options: CateringPlanOptions = {}) {
  const [plan, setPlan] = useState<PricedCateringPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [source, setSource] = useState<PlanSource | null>(null);
  /** How many shopping list positions the model has priced so far. */
  const [pricingProgress, setPricingProgress] = useState<{ completed: number; total: number } | null>(
    null
  );
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
    const totalStartedAt = performance.now();
    try {
      const gatheringResult = ('gatheringState' in input
        ? input.gatheringState
        : input) as GatheringResult;
      const recipes = optionsRef.current.recipes ?? [];
      let basePlan: CateringPlan;
      let planSource: PlanSource = 'model';

      const planningStartedAt = performance.now();
      try {
        const turn = await cateringPlanService.plan(input, optionsRef.current);
        basePlan = turn.plan;
        const usage = turn.response.usage;
        console.info(
          `[catering-plan] Apertus ${turn.response.model ?? 'unknown'} completed in ` +
          `${Math.round(performance.now() - planningStartedAt)} ms` +
          (usage
            ? ` (prompt ${usage.promptTokens ?? '?'} / completion ${usage.completionTokens ?? '?'} tokens)`
            : '')
        );
      } catch (planningError) {
        console.info(
          `[catering-plan] Apertus failed after ${Math.round(performance.now() - planningStartedAt)} ms`
        );
        // Recipe quantities are deterministic, so they can still form the plan
        // when Apertus is unavailable. Pricing happens once after this branch.
        if (recipes.length === 0) throw planningError;
        basePlan = buildPlanFromRecipes(recipes, gatheringResult);
        planSource = 'local';
      }

      const pricingStartedAt = performance.now();
      setPricingProgress({ completed: 0, total: basePlan.shoppingList.length });
      const pricingModel =
        recipes.length > 0 || optionsRef.current.onlyOwnRecipes
          ? 'apertus-8b'
          : optionsRef.current.model ?? 'apertus-8b';
      const pricedPlan = await llmPriceService.enrich(basePlan, {
        language: optionsRef.current.language,
        model: pricingModel,
        onProgress: (completed, total) => setPricingProgress({ completed, total }),
      });
      console.info(
        `[catering-plan] LLM pricing completed in ${Math.round(performance.now() - pricingStartedAt)} ms ` +
        `for ${basePlan.shoppingList.length} ingredients ` +
        `(average leftover ${pricedPlan.pricing.averageLeftoverShare === null
          ? 'n/a'
          : `${Math.round(pricedPlan.pricing.averageLeftoverShare * 100)}%`})`
      );
      setPlan(pricedPlan);
      setSource(planSource);
      console.info(
        `[catering-plan] Complete flow finished in ${Math.round(performance.now() - totalStartedAt)} ms`
      );
      return pricedPlan;
    } catch (caught) {
      console.error(
        `[catering-plan] Flow failed after ${Math.round(performance.now() - totalStartedAt)} ms`,
        caught
      );
      setError(caught instanceof Error ? caught : new Error('Planning failed'));
      return null;
    } finally {
      pendingRef.current = false;
      setIsPlanning(false);
      setPricingProgress(null);
    }
  }, []);

  const reset = useCallback(() => {
    setPlan(null);
    setSource(null);
    setStreamedText('');
    setPricingProgress(null);
    setError(null);
  }, []);

  return { plan, setPlan, isPlanning, streamedText, source, pricingProgress, error, generate, reset };
}
