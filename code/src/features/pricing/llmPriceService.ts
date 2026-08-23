import productChoiceConfig from './productChoice.config.json';
import { llmService } from '@/shared/llm/llmService';
import {
  buildProductChoiceMessage,
  buildProductChoiceSystemPrompt,
  parseProductChoice,
} from './productChoicePrompt';
import { findCandidatesForAll } from './transgourmet/catalog';
import { purchaseOutcome, salesUnitContent } from './transgourmet/packContent';
import type {
  CateringPlan,
  PricedCateringPlan,
  PricedShoppingListEntry,
  ShoppingListEntry,
} from '@/features/catering-plan/types';
import type { LLMRequestOptions, LLMResponse } from '@/shared/llm/types';
import type { CatalogCandidates } from './transgourmet/types';

/**
 * Prices a shopping list against the live PRODEGA assortment.
 *
 * The catalog is read from `web.transgourmet.ch/de/webshop`, so every price and
 * article number below is real. Choosing between those articles is the part
 * that needs judgement — a 5 kg bucket of minced beef is cheaper per kilo than
 * five 1 kg packs but leaves half a kilo of fresh meat to throw away — and that
 * choice is made by one asynchronous model call per position. The arithmetic
 * that follows the choice is done here, not by the model.
 *
 * The two halves are asked for differently. Candidates for the whole list come
 * in one request, because each position costs the server several webshop
 * searches behind one session; the model calls that follow run several at a
 * time, because they are independent and a slow one must not hold up the rest.
 */

export interface LlmPricingOptions extends LLMRequestOptions {
  language?: 'de' | 'en';
  /** How many live catalog articles are offered per position. */
  candidateLimit?: number;
  /** How many positions are priced at the same time. */
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

const DEFAULT_CANDIDATE_LIMIT = 12;
const DEFAULT_CONCURRENCY = 4;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function unpricedEntry(
  entry: ShoppingListEntry,
  message: string,
  candidateCount: number | null
): PricedShoppingListEntry {
  return {
    ...entry,
    pricingStatus: 'not_found',
    pricingMessage: message,
    productName: null,
    articleNumber: null,
    unitPriceChf: null,
    priceUnit: null,
    packageQuantity: null,
    packagePriceChf: null,
    packagesNeeded: null,
    estimatedTotalChf: null,
    productUrl: null,
    isAvailable: null,
    isAction: null,
    packageContentQuantity: null,
    purchasedQuantity: null,
    leftoverQuantity: null,
    leftoverShare: null,
    wasteRisk: null,
    selectionReason: null,
    candidateCount,
  };
}

/* ----------------------------------------------------------------- pricing -- */

async function priceEntry(
  entry: ShoppingListEntry,
  found: CatalogCandidates | null,
  options: LlmPricingOptions
): Promise<PricedShoppingListEntry> {
  const { language, signal } = options;
  const german = language !== 'en';

  // No entry at all means the batch request never arrived; an `error` on the
  // entry means this one position failed while the rest of the list was fine.
  if (found === null || found.error !== null) {
    return unpricedEntry(
      entry,
      german ? 'Der PRODEGA-Webshop war nicht erreichbar.' : 'The PRODEGA webshop was unreachable.',
      null
    );
  }

  const candidates = found.products;

  if (candidates.length === 0) {
    return unpricedEntry(
      entry,
      german
        ? 'Der PRODEGA-Webshop kennt zu dieser Zutat kein Produkt.'
        : 'The PRODEGA webshop lists no product for this ingredient.',
      0
    );
  }

  let response: LLMResponse;
  const primaryModel = options.model ?? 'apertus-8b';
  try {
    response = await llmService.chat(
      [{ role: 'user', content: buildProductChoiceMessage(entry, candidates, language) }],
      {
        model: primaryModel,
        temperature: options.temperature ?? 0.1,
        maxTokens: options.maxTokens ?? 600,
        systemPrompt: buildProductChoiceSystemPrompt(language, productChoiceConfig),
        signal,
        customHeaders: options.customHeaders,
        extraBody: options.extraBody,
        useProxy: options.useProxy,
      }
    );
  } catch (primaryErr) {
    console.warn('[llm-pricing] Primary pricing model failed, attempting fallback...', primaryErr);
    const fallbackModel = primaryModel === 'apertus-8b' ? 'apertus-70b' : 'apertus-8b';
    response = await llmService.chat(
      [{ role: 'user', content: buildProductChoiceMessage(entry, candidates, language) }],
      {
        model: fallbackModel,
        temperature: options.temperature ?? 0.1,
        maxTokens: options.maxTokens ?? 600,
        systemPrompt: buildProductChoiceSystemPrompt(language, productChoiceConfig),
        signal,
        customHeaders: options.customHeaders,
        extraBody: options.extraBody,
        useProxy: options.useProxy,
      }
    );
  }

  const choice = parseProductChoice(response.content);
  const product =
    choice.articleNumber === null
      ? null
      : candidates.find((candidate) => candidate.articleNumber === choice.articleNumber) ?? null;

  if (product === null) {
    return unpricedEntry(
      entry,
      choice.reason ??
        (german
          ? 'Kein Kandidat entsprach dieser Zutat.'
          : 'No candidate matched this ingredient.'),
      candidates.length
    );
  }

  // From here the numbers are the application's own, so a miscounted model
  // answer cannot reach the customer's price. What one sales unit holds is read
  // off the catalog rather than taken from the answer: asked for it directly the
  // model reported the inner package instead, which multiplied a CHF 94.50
  // bucket of minced beef by five. Its own figure is the fallback for articles
  // that give nothing to derive.
  const content = salesUnitContent(product, entry.unit) ?? choice.packageContentQuantity;
  const outcome = purchaseOutcome(product, entry.quantity, entry.unit, content);

  const base: PricedShoppingListEntry = {
    ...entry,
    pricingStatus: 'quantity_unknown',
    pricingMessage: german
      ? 'Packungsinhalt und angeforderte Menge sind nicht sicher vergleichbar.'
      : 'The pack content cannot be compared to the requested amount with certainty.',
    productName: product.title,
    articleNumber: product.articleNumber,
    unitPriceChf: round(product.price),
    priceUnit: product.unitText,
    packageQuantity: `${product.sellAmount} ${product.unitText}`,
    packagePriceChf: round(
      product.pricePerSellUnit > 0 ? product.pricePerSellUnit : product.price
    ),
    packagesNeeded: null,
    estimatedTotalChf: null,
    productUrl: product.productUrl,
    isAvailable: product.isAvailable,
    isAction: product.isAction,
    packageContentQuantity: null,
    purchasedQuantity: null,
    leftoverQuantity: null,
    leftoverShare: null,
    wasteRisk: choice.wasteRisk,
    selectionReason: choice.reason,
    candidateCount: candidates.length,
  };

  if (outcome === null) return base;

  return {
    ...base,
    pricingStatus: 'matched',
    pricingMessage: null,
    packageQuantity: `${outcome.content} ${entry.unit}`,
    packagePriceChf: outcome.packagePriceChf,
    packagesNeeded: outcome.packagesNeeded,
    estimatedTotalChf: outcome.totalCostChf,
    packageContentQuantity: outcome.content,
    purchasedQuantity: outcome.purchasedQuantity,
    leftoverQuantity: outcome.leftoverQuantity,
    leftoverShare: outcome.leftoverShare,
  };
}

/** Runs `worker` over `items`, never more than `limit` of them at a time. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

export const llmPriceService = {
  /**
   * The merged shopping list priced position by position. The live candidates
   * for every position are read first, in one request; each position is then one
   * asynchronous model call over them, so a slow or failing position does not
   * hold up the rest of the list.
   */
  async enrich(plan: CateringPlan, options: LlmPricingOptions = {}): Promise<PricedCateringPlan> {
    const {
      concurrency = DEFAULT_CONCURRENCY,
      candidateLimit = DEFAULT_CANDIDATE_LIMIT,
      onProgress,
      language,
      signal,
    } = options;
    const german = language !== 'en';
    const total = plan.shoppingList.length;
    let completed = 0;

    // An empty map prices nothing but still returns the list — every position
    // then reports the webshop as unreachable, as it would have one by one.
    let candidates = new Map<string, CatalogCandidates>();
    try {
      candidates = await findCandidatesForAll(
        plan.shoppingList.map((entry) => entry.ingredient),
        { limit: candidateLimit, signal }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      console.warn('[llm-price] catalog candidates could not be read', error);
    }

    const shoppingList = await mapWithConcurrency(plan.shoppingList, concurrency, async (entry) => {
      const startedAt = performance.now();
      let priced: PricedShoppingListEntry;
      try {
        priced = await priceEntry(entry, candidates.get(entry.ingredient.trim()) ?? null, options);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        console.warn(`[llm-price] "${entry.ingredient}" failed`, error);
        priced = unpricedEntry(
          entry,
          german
            ? 'Die Produktauswahl konnte nicht abgeschlossen werden.'
            : 'The product choice could not be completed.',
          null
        );
      }

      completed += 1;
      onProgress?.(completed, total);
      console.info(
        `[llm-price] "${entry.ingredient}" → ${priced.productName ?? 'no match'} ` +
          `(${priced.pricingStatus}, ${Math.round(performance.now() - startedAt)} ms)`
      );
      return priced;
    });

    const priced = shoppingList.filter((entry) => entry.estimatedTotalChf !== null);
    const shares = priced
      .map((entry) => entry.leftoverShare)
      .filter((share): share is number => share !== null);

    return {
      ...plan,
      shoppingList,
      pricing: {
        source: 'PRODEGA',
        currency: 'CHF',
        estimatedTotal: round(
          priced.reduce((sum, entry) => sum + (entry.estimatedTotalChf ?? 0), 0)
        ),
        isComplete: priced.length === shoppingList.length,
        averageLeftoverShare:
          shares.length > 0
            ? round(shares.reduce((sum, share) => sum + share, 0) / shares.length, 4)
            : null,
      },
    };
  },
};
