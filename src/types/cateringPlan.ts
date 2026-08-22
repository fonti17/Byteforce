import type { GatheringData, GatheringResult } from './gathering';
import type { LLMRequestOptions, LLMResponse } from './llm';
import type { Recipe } from './recipe';

/** Units allowed by `config/cateringPlanConfig.json`. */
export const CATERING_UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'pack'] as const;
export type CateringUnit = (typeof CATERING_UNITS)[number];

export interface CateringMenuItem {
  name: string;
  description: string | null;
}

export interface CateringMenu {
  name: string;
  items: CateringMenuItem[];
}

export interface ShoppingListEntry {
  ingredient: string;
  quantity: number;
  /** A `CateringUnit` whenever the model stays inside the schema enum. */
  unit: string;
  category: string | null;
}

export interface CateringPlanBudget {
  currency: string;
  estimatedTotal: number;
  note: string;
}

/**
 * Part-2 payload. Mirrors `config/cateringPlanConfig.json`, including
 * `additionalProperties: false`.
 */
export interface CateringPlan {
  menu: CateringMenu;
  shoppingList: ShoppingListEntry[];
  budget: CateringPlanBudget;
  /** Explains budget trade-offs and any unmet or adapted requests. */
  reasoning: string;
}

export interface CateringPlanOptions extends LLMRequestOptions {
  language?: 'de' | 'en';
  /**
   * Recipes chosen for this event. Their quantities are scaled and merged into
   * the shopping list locally; the model only completes the menu around them.
   */
  recipes?: Recipe[];
}

export interface CateringPlanInput {
  gatheringState: GatheringData | GatheringResult;
  originalRequest?: string | null;
}

export interface CateringPlanTurn {
  plan: CateringPlan;
  response: LLMResponse;
}
