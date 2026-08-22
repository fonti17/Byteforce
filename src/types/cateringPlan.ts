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

/**
 * Part-2 payload. Mirrors `config/cateringPlanConfig.json`, including
 * `additionalProperties: false`.
 */
export interface CateringPlan {
  menu: CateringMenu;
  shoppingList: ShoppingListEntry[];
}

export interface PricedShoppingListEntry extends ShoppingListEntry {
  pricingStatus: 'matched' | 'not_found' | 'quantity_unknown';
  pricingMessage: string | null;
  productName: string | null;
  articleNumber: string | null;
  unitPriceChf: number | null;
  priceUnit: string | null;
  packageQuantity: string | null;
  packagePriceChf: number | null;
  packagesNeeded: number | null;
  estimatedTotalChf: number | null;
  productUrl: string | null;
  isAvailable: boolean | null;
  /** German search term used for PRODEGA product lookup after translation. */
  searchIngredient?: string | null;
  /** Original untranslated ingredient name (e.g. in English). */
  originalIngredient?: string | null;
}

/** Final application-owned payload after PRODEGA pricing was added. */
export interface PricedCateringPlan extends Omit<CateringPlan, 'shoppingList'> {
  shoppingList: PricedShoppingListEntry[];
  pricing: {
    source: 'PRODEGA';
    currency: 'CHF';
    estimatedTotal: number;
    isComplete: boolean;
  };
}

export interface CateringPlanOptions extends LLMRequestOptions {
  language?: 'de' | 'en';
  /**
   * Recipes chosen for this event. Their quantities are scaled and merged into
   * the shopping list locally; the model only completes the menu around them.
   */
  recipes?: Recipe[];
  /**
   * When true, only the chosen recipes are used without inventing additional dishes.
   * Uses the compact model (e.g. Apertus 8B) for estimating quantities only.
   */
  onlyOwnRecipes?: boolean;
}

export interface CateringPlanInput {
  gatheringState: GatheringData | GatheringResult;
  originalRequest?: string | null;
}

export interface CateringPlanTurn {
  plan: CateringPlan;
  response: LLMResponse;
}
