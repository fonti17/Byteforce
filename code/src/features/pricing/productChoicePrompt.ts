import { extractJsonObject } from '@/shared/utils/json';
import { purchaseOutcome, salesUnitContent } from './transgourmet/packContent';
import type { ShoppingListEntry, WasteRisk } from '@/features/catering-plan/types';
import type { TransgourmetProduct } from './transgourmet/types';

/**
 * The purchase brief sent to the model, kept apart from the orchestration in
 * `llmPriceService.ts` so the wording can be exercised on its own against real
 * catalog candidates.
 */

export type PromptLanguage = 'de' | 'en';

export class ProductChoiceError extends Error {
  content?: string;

  constructor(message: string, content?: string) {
    super(message);
    this.name = 'ProductChoiceError';
    this.content = content;
  }
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * One candidate, with the outcome of actually buying it already worked out.
 *
 * Packs needed, total price and leftover are calculated here from the live
 * catalog, so the model never has to multiply anything: it compares finished
 * outcomes and decides which one is the better buy. Everything it would have
 * had to derive — and got wrong when asked to — is handed to it instead.
 */
function describeCandidate(
  product: TransgourmetProduct,
  index: number,
  requiredQuantity: number,
  requestedUnit: string
): Record<string, unknown> {
  const content = salesUnitContent(product, requestedUnit);
  const outcome = purchaseOutcome(product, requiredQuantity, requestedUnit, content);

  return {
    n: index + 1,
    articleNumber: product.articleNumber,
    title: product.title,
    ...(product.brand ? { brand: product.brand } : {}),
    contentPerSalesUnit: content === null ? null : `${round(content, 3)} ${requestedUnit}`,
    pricePerSalesUnit: `CHF ${round(product.pricePerSellUnit)}`,
    ...(outcome
      ? {
          buy: `${outcome.packagesNeeded} x`,
          totalCost: `CHF ${outcome.totalCostChf}`,
          youGet: `${outcome.purchasedQuantity} ${requestedUnit}`,
          leftOver: `${outcome.leftoverQuantity} ${requestedUnit} (${Math.round(outcome.leftoverShare * 100)}% of the purchase)`,
        }
      : { outcome: 'cannot be calculated — content unknown in the requested unit' }),
    available: product.isAvailable,
    ...(product.isAction ? { action: `reduced from CHF ${product.oldPrice}` } : {}),
    ...(product.origin.length > 0 ? { origin: product.origin.join(', ') } : {}),
    ...(product.ecoScore ? { ecoScore: product.ecoScore } : {}),
  };
}

/**
 * The decision rules. They are deliberately explicit about the trade-off,
 * because the article that is cheapest per kilo and the article that wastes the
 * least food are regularly not the same one, and how to weigh them depends on
 * whether the surplus keeps — which is a judgement about the ingredient, not a
 * calculation.
 *
 * `schema` is `productChoice.config.json`.
 */
export function buildProductChoiceSystemPrompt(
  language: PromptLanguage | undefined,
  schema: unknown
): string {
  return [
    'You are the purchasing assistant of a Swiss catering kitchen that buys wholesale at PRODEGA / Transgourmet.',
    'For one ingredient of a shopping list you receive the articles that the webshop returned live for that ingredient.',
    'Choose exactly ONE article to buy.',
    '',
    'You are optimising two goals at once:',
    '  A. LOWEST TOTAL COST for the required amount — not the lowest price per kilo, litre, or piece.',
    '  B. LEAST FOOD WASTE — as little unused surplus as possible after the event.',
    '',
    'Every candidate has already been costed for you against the required amount:',
    '  contentPerSalesUnit  what one purchasable sales unit holds',
    '  buy                  how many sales units have to be bought to cover the requirement',
    '  totalCost            what those sales units cost together — this is the number to compare',
    '  youGet / leftOver    how much that buys, and how much of it the menu does not need',
    'Those figures are calculated from the live catalog and are correct. Do not recalculate them, do not',
    'second-guess them, and never claim a candidate has no leftover when leftOver says otherwise.',
    '',
    'The candidates are ordered by totalCost, cheapest first. Articles whose outcome cannot be',
    'calculated come last.',
    '',
    'How to decide — work down the list from the top and take the FIRST candidate that passes both tests:',
    '  TEST 1  It is the requested ingredient.',
    '          A different food never passes, not even a cheaper or a closely related one: parsley root is',
    '          not parsley, sweet potatoes are not potatoes, coffee cream is not whipping cream.',
    '          A different cut, form, brand, or packaging of the same ingredient does pass.',
    '  TEST 2  Its leftOver is acceptable.',
    '          For STORABLE goods — dry goods, pasta, rice, flour, sugar, tinned and jarred food, oil, UHT',
    '          products, frozen items, drinks, cleaning and non-food articles — ANY leftover is acceptable.',
    '          The surplus keeps and is used later, so it is not waste and never a reason to pay more.',
    '          For PERISHABLE goods — fresh meat, fish, seafood, fresh milk and cream, fresh cheese, salad,',
    '          herbs, fresh fruit and vegetables, bread, prepared chilled food — a leftOver up to about 15%',
    '          of the purchase is acceptable. Above that the surplus spoils and is thrown away, so skip the',
    '          candidate and keep going down the list.',
    '',
    'That first passing candidate is your answer. Do not pass over it for a better brand, a rounder number,',
    'or a smaller leftover that is already within the acceptable range — the money saved is real and the',
    'leftover it would avoid is not waste.',
    'If every candidate for a perishable ingredient fails TEST 2, choose the one with the smallest leftOver',
    'and say so in the reason.',
    'Between candidates with the same totalCost and the same leftOver, prefer in this order: currently',
    'available, on action price, regional or Swiss origin, better eco-score.',
    '',
    'Then set wasteRisk for the candidate you chose, from its stated leftOver: "none" only when leftOver is',
    '0 or the goods keep indefinitely, "low" for a storable leftover, "medium" for a perishable leftover',
    'that can plausibly still be used, "high" when it will most likely be thrown away.',
    'A candidate whose outcome cannot be calculated is a last resort. Choose it only when nothing above it',
    'is the requested ingredient, and then state its content as packageContentQuantity.',
    '',
    'If none of the candidates is the requested ingredient, return articleNumber, packageContentQuantity and',
    'packagesNeeded as null, wasteRisk "none", and say so in the reason.',
    '',
    'Return only one valid JSON object that conforms exactly to this JSON Schema:',
    JSON.stringify(schema),
    '',
    language === 'en'
      ? 'Write the reason in English, in one short sentence.'
      : 'Write the reason in German, in one short sentence.',
    'Copy articleNumber character for character from the candidate list, including leading zeros.',
    'Do not wrap the JSON in markdown code fences. Do not add any text before or after the JSON.',
  ].join('\n');
}

/**
 * Candidates cheapest first, so the order the model reads them in is the order
 * the decision procedure walks. What cannot be costed sinks to the bottom.
 */
function byTotalCost(
  products: TransgourmetProduct[],
  requiredQuantity: number,
  requestedUnit: string
): TransgourmetProduct[] {
  const cost = (product: TransgourmetProduct): number =>
    purchaseOutcome(product, requiredQuantity, requestedUnit)?.totalCostChf ?? Number.POSITIVE_INFINITY;
  return [...products].sort((left, right) => cost(left) - cost(right));
}

export function buildProductChoiceMessage(
  entry: ShoppingListEntry,
  products: TransgourmetProduct[],
  language?: PromptLanguage
): string {
  const german = language !== 'en';
  return [
    german ? 'Zutat der Einkaufsliste:' : 'Shopping list position:',
    JSON.stringify(
      {
        ingredient: entry.ingredient,
        requiredQuantity: entry.quantity,
        requiredUnit: entry.unit,
        ...(entry.category ? { category: entry.category } : {}),
      },
      null,
      2
    ),
    '',
    german
      ? `Kandidaten aus dem PRODEGA-Webshop (${products.length}), günstigste zuerst:`
      : `Candidates from the PRODEGA webshop (${products.length}), cheapest first:`,
    JSON.stringify(
      byTotalCost(products, entry.quantity, entry.unit).map((product, index) =>
        describeCandidate(product, index, entry.quantity, entry.unit)
      ),
      null,
      1
    ),
  ].join('\n');
}

export interface ProductChoice {
  articleNumber: string | null;
  /** Only set where the chosen article's content could not be derived. */
  packageContentQuantity: number | null;
  wasteRisk: WasteRisk;
  reason: string | null;
}

const WASTE_RISKS = new Set<string>(['none', 'low', 'medium', 'high']);

/** Reads the answer into `productChoice.config.json` shape. */
export function parseProductChoice(content: string): ProductChoice {
  const parsed = extractJsonObject(content);
  if (!parsed) throw new ProductChoiceError('The product choice held no JSON object.', content);

  const toNumber = (value: unknown): number | null => {
    const parsedValue = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
    return typeof parsedValue === 'number' && Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : null;
  };

  const risk = typeof parsed.wasteRisk === 'string' ? parsed.wasteRisk.toLowerCase() : '';

  return {
    articleNumber:
      typeof parsed.articleNumber === 'string' && parsed.articleNumber.trim() !== ''
        ? parsed.articleNumber.trim()
        : null,
    packageContentQuantity: toNumber(parsed.packageContentQuantity),
    wasteRisk: WASTE_RISKS.has(risk) ? (risk as WasteRisk) : 'medium',
    reason:
      typeof parsed.reason === 'string' && parsed.reason.trim() !== '' ? parsed.reason.trim() : null,
  };
}
