import type {
  CateringPlan,
  PricedCateringPlan,
  PricedShoppingListEntry,
} from '../types/cateringPlan';
import { translationService } from './translationService.ts';

interface PriceApiEntry {
  status: 'matched' | 'not_found' | 'quantity_unknown';
  pricing_message: string | null;
  product_name: string | null;
  article_number: string | null;
  price_chf: number | null;
  price_unit: string | null;
  package_quantity: string | null;
  package_price_chf: number | null;
  packages_needed: number | null;
  estimated_total_chf: number | null;
  product_url: string | null;
  is_available: boolean | null;
}

interface PriceApiResponse {
  ingredients: PriceApiEntry[];
}

interface PriceServiceOptions {
  signal?: AbortSignal;
  /** Whether to translate ingredients to German via smaller AI (default: true). */
  translateToGerman?: boolean;
}

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as unknown as Record<string, string | undefined>)
    : typeof globalThis !== 'undefined' && (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!
      : {};

const endpoint = env.VITE_PRICE_SERVICE_ENDPOINT ?? '/api/prodega/prices';

class PriceService {
  async enrich(plan: CateringPlan, options: PriceServiceOptions = {}): Promise<PricedCateringPlan> {
    const startedAt = performance.now();

    // 1. Translate ingredients into German via the smaller AI model (Apertus 8B)
    const rawIngredients = plan.shoppingList.map((entry) => entry.ingredient);
    let searchTerms = rawIngredients;

    if (options.translateToGerman !== false && rawIngredients.length > 0) {
      const translationStart = performance.now();
      try {
        searchTerms = await translationService.translateIngredientsToGerman(rawIngredients, {
          signal: options.signal,
        });
        console.info(
          `[price-service] Translated ${rawIngredients.length} ingredients to German via Apertus-8B in ${Math.round(performance.now() - translationStart)} ms`
        );
      } catch (translationError) {
        console.warn(
          '[price-service] Ingredient translation layer failed, proceeding with original terms:',
          translationError
        );
        searchTerms = rawIngredients;
      }
    }

    // 2. Query PRODEGA price service with translated German terms
    const requestIngredients = plan.shoppingList.map((entry, index) => ({
      ingredient: searchTerms[index] || entry.ingredient,
      quantity: entry.quantity,
      unit: entry.unit,
    }));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients: requestIngredients }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`PRODEGA price service failed with HTTP ${response.status}`);
    }

    console.info(
      `[price-service] ${endpoint} responded in ${Math.round(performance.now() - startedAt)} ms`
    );

    const payload = (await response.json()) as PriceApiResponse;
    if (!Array.isArray(payload.ingredients) || payload.ingredients.length !== plan.shoppingList.length) {
      throw new Error('PRODEGA price service returned an invalid shopping list');
    }

    const shoppingList: PricedShoppingListEntry[] = plan.shoppingList.map((entry, index) => {
      const price = payload.ingredients[index];
      const translated = searchTerms[index]?.trim();
      const hasTranslation = translated && translated !== entry.ingredient;
      return {
        ...entry,
        ingredient: hasTranslation ? translated : entry.ingredient,
        originalIngredient: hasTranslation ? entry.ingredient : null,
        searchIngredient: translated || null,
        pricingStatus: price.status,
        pricingMessage: price.pricing_message,
        productName: price.product_name,
        articleNumber: price.article_number,
        unitPriceChf: price.price_chf,
        priceUnit: price.price_unit,
        packageQuantity: price.package_quantity,
        packagePriceChf: price.package_price_chf,
        packagesNeeded: price.packages_needed,
        estimatedTotalChf: price.estimated_total_chf,
        productUrl: price.product_url,
        isAvailable: price.is_available,
      };
    });

    const pricedEntries = shoppingList.filter((entry) => entry.estimatedTotalChf !== null);
    return {
      ...plan,
      shoppingList,
      pricing: {
        source: 'PRODEGA',
        currency: 'CHF',
        estimatedTotal: Number(
          pricedEntries.reduce((sum, entry) => sum + (entry.estimatedTotalChf ?? 0), 0).toFixed(2)
        ),
        isComplete: pricedEntries.length === shoppingList.length,
      },
    };
  }
}

export const priceService = new PriceService();
