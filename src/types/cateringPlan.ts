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

/**
 * How likely the surplus of a purchase is thrown away. Judged by the model from
 * how perishable the ingredient is and how large the surplus turns out.
 */
export type WasteRisk = 'none' | 'low' | 'medium' | 'high';

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
  /** True while the chosen article is on a PRODEGA action price. */
  isAction: boolean | null;
  /** What one sales unit contains, expressed in `unit`. */
  packageContentQuantity: number | null;
  /** `packagesNeeded × packageContentQuantity`, expressed in `unit`. */
  purchasedQuantity: number | null;
  /** How much of the purchase is not needed by the menu, expressed in `unit`. */
  leftoverQuantity: number | null;
  /** `leftoverQuantity` as a share of the purchase, 0–1. */
  leftoverShare: number | null;
  wasteRisk: WasteRisk | null;
  /** The model's one-sentence justification for this article over the others. */
  selectionReason: string | null;
  /** How many live catalog articles the choice was made from. */
  candidateCount: number | null;
}

/** Final application-owned payload after PRODEGA pricing was added. */
export interface PricedCateringPlan extends Omit<CateringPlan, 'shoppingList'> {
  shoppingList: PricedShoppingListEntry[];
  pricing: {
    source: 'PRODEGA';
    currency: 'CHF';
    estimatedTotal: number;
    isComplete: boolean;
    /**
     * Share of the purchased amount that exceeds what the menu needs, averaged
     * over the priced positions. `null` while nothing could be calculated.
     */
    averageLeftoverShare: number | null;
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
