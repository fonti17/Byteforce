import type {
  CateringPlan,
  PricedCateringPlan,
  PricedShoppingListEntry,
} from '../types/cateringPlan';

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

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as unknown as Record<string, string | undefined>)
    : typeof globalThis !== 'undefined' && (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!
      : {};

const endpoint = env.VITE_PRICE_SERVICE_ENDPOINT ?? '/api/prodega/prices';

class PriceService {
  async enrich(plan: CateringPlan): Promise<PricedCateringPlan> {
    const startedAt = performance.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: plan.shoppingList.map(({ ingredient, quantity, unit }) => ({
          ingredient,
          quantity,
          unit,
        })),
      }),
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
      return {
        ...entry,
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
