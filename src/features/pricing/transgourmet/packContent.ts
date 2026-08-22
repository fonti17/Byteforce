import type { TransgourmetProduct } from './types.ts';

/**
 * How much one purchasable sales unit of a PRODEGA article contains.
 *
 * This is the number the whole cost and leftover calculation rests on, and it
 * cannot be left to the model: asked directly, it reports the content of the
 * inner package instead of the sales unit, which turns a CHF 94.50 bucket of
 * minced beef into five of them.
 *
 * The catalog states it in three independent ways, and they agree:
 * `pricePerSellUnit / price` is how many `unitText` go into one sales unit, the
 * title spells the packaging out ("12 x 1 l", "ca. 5 kg"), and `approxWeight`
 * carries the weight of variable-weight articles.
 */

type Dimension = 'mass' | 'volume' | 'count' | 'pack';

interface UnitInfo {
  dimension: Dimension;
  /** How much of the dimension's base unit (kg, l, piece) one unit is. */
  perBase: number;
}

const UNITS: Record<string, UnitInfo> = {
  g: { dimension: 'mass', perBase: 0.001 },
  gr: { dimension: 'mass', perBase: 0.001 },
  kg: { dimension: 'mass', perBase: 1 },
  ml: { dimension: 'volume', perBase: 0.001 },
  cl: { dimension: 'volume', perBase: 0.01 },
  dl: { dimension: 'volume', perBase: 0.1 },
  l: { dimension: 'volume', perBase: 1 },
  lt: { dimension: 'volume', perBase: 1 },
  piece: { dimension: 'count', perBase: 1 },
  st: { dimension: 'count', perBase: 1 },
  stk: { dimension: 'count', perBase: 1 },
  stück: { dimension: 'count', perBase: 1 },
  pack: { dimension: 'pack', perBase: 1 },
};

function unitInfo(unit: string): UnitInfo | null {
  return UNITS[unit.trim().toLowerCase().replace(/\.$/, '')] ?? null;
}

/** Quantity expressed in the dimension's base unit (kg, l, piece). */
function toBase(quantity: number, unit: string): { quantity: number; dimension: Dimension } | null {
  const info = unitInfo(unit);
  return info ? { quantity: quantity * info.perBase, dimension: info.dimension } : null;
}

function fromBase(quantity: number, unit: string): number | null {
  const info = unitInfo(unit);
  return info ? quantity / info.perBase : null;
}

/** `1,5` and `1.5` both occur in catalog titles. */
function parseDecimal(value: string): number {
  return Number(value.replace(',', '.'));
}

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const CONTENT_UNIT = String.raw`(kg|g|lt|l|ml|cl|dl|stk|st|stück)`;
/** Container words that may sit between the count and the content in a title. */
const CONTAINER =
  String.raw`(?:fl(?:\.|asche[n]?)?|kt|karton|bx|box|pa|pk|pack(?:ung)?|bt|beutel|ds|dose[n]?|` +
  String.raw`be|becher|tp|topf|rl|rolle[n]?|sc|schachtel|ne|netz|bd|bund|hs|sack)`;

interface TitleContent {
  /** Total content of the packaging the title describes, in base units. */
  base: number;
  dimension: Dimension;
  /** The leading count of an "N x M" packaging, when the title states one. */
  count: number | null;
}

/**
 * The packaging a title spells out. "24 Fl. x 50 cl" is 12 litres in twenty-four
 * pieces; "ca. 5 kg" is five kilos in one.
 */
function contentFromTitle(title: string): TitleContent[] {
  const text = title.toLowerCase();
  const found: TitleContent[] = [];

  // "24 Fl. x 50 cl" and "6 x 1,5 l" — a count of containers, each holding some amount.
  const multiplied = new RegExp(
    String.raw`${NUMBER}\s*(?:${CONTAINER})?\s*[x×]\s*${NUMBER}\s*${CONTENT_UNIT}\b`,
    'g'
  );
  for (const match of text.matchAll(multiplied)) {
    const count = parseDecimal(match[1]);
    const each = toBase(parseDecimal(match[2]), match[3]);
    if (each && count > 0) {
      found.push({ base: count * each.quantity, dimension: each.dimension, count });
    }
  }
  if (found.length > 0) return found;

  // "ca. 5 kg", "500 g" — a plain amount. "5 mm" and "n°5" carry no unit we know.
  const plain = new RegExp(String.raw`${NUMBER}\s*${CONTENT_UNIT}\b`, 'g');
  for (const match of text.matchAll(plain)) {
    const amount = toBase(parseDecimal(match[1]), match[2]);
    if (amount) found.push({ base: amount.quantity, dimension: amount.dimension, count: null });
  }
  return found;
}

/**
 * How many `unitText` one sales unit holds. The price ratio states it exactly,
 * including the fractional case of a variable-weight article, and it is right
 * where `sellAmount` is not.
 */
function unitsPerSalesUnit(product: TransgourmetProduct): number {
  if (product.price > 0 && product.pricePerSellUnit > 0) {
    const ratio = product.pricePerSellUnit / product.price;
    if (Number.isFinite(ratio) && ratio > 0) return Math.round(ratio * 1000) / 1000;
  }
  return product.sellAmount > 0 ? product.sellAmount : 1;
}

/**
 * The content of one sales unit, expressed in `requestedUnit`, or `null` when
 * the article cannot be measured in that unit at all — a 5 kg bucket says
 * nothing about how many pieces it holds.
 */
export function salesUnitContent(
  product: TransgourmetProduct,
  requestedUnit: string
): number | null {
  const requested = unitInfo(requestedUnit);
  if (requested === null) return null;
  if (requested.dimension === 'pack') return 1;

  const perSalesUnit = unitsPerSalesUnit(product);
  const priced = unitInfo(product.unitText);

  // The article is priced in a unit we can measure, so the ratio alone answers
  // it: 94.50 / 18.90 per kg is a 5 kg sales unit.
  if (priced && priced.dimension === requested.dimension) {
    return fromBase(perSalesUnit * priced.perBase, requestedUnit);
  }

  // Otherwise the article is priced per container and the title has to say what
  // the container holds.
  const fromTitle = contentFromTitle(product.title).filter(
    (entry) => entry.dimension === requested.dimension
  );
  if (fromTitle.length > 0) {
    // The largest reading is the packaging as a whole rather than one of its parts.
    const total = Math.max(...fromTitle.map((entry) => entry.base));
    // An "N x M" title already counts the containers of the sales unit. A plain
    // amount describes one container, so a tray of them still has to be
    // multiplied out: "Fonte Linda 50 cl" is sold as twenty-four bottles.
    const statesCount = fromTitle.some((entry) => entry.count !== null);
    return fromBase(statesCount ? total : total * perSalesUnit, requestedUnit);
  }

  if (requested.dimension === 'mass' && product.approxWeight !== null && product.approxWeight > 0) {
    return fromBase(product.approxWeight, requestedUnit);
  }

  if (requested.dimension === 'count') {
    // A container counts as the pieces it is stated to hold, else as itself.
    const counted = contentFromTitle(product.title).find((entry) => entry.count !== null);
    if (counted?.count) return counted.count;
    if (priced === null) return perSalesUnit;
  }

  return null;
}

export interface PurchaseOutcome {
  /** What one sales unit holds, in the requested unit. */
  content: number;
  packagePriceChf: number;
  packagesNeeded: number;
  purchasedQuantity: number;
  leftoverQuantity: number;
  /** Leftover as a share of the purchase, 0–1. */
  leftoverShare: number;
  totalCostChf: number;
}

/**
 * What buying this article for this position actually costs and leaves over.
 *
 * Both the prompt and the priced shopping list are built from this, so the
 * figures the model weighs are the same ones the customer is quoted.
 */
export function purchaseOutcome(
  product: TransgourmetProduct,
  requiredQuantity: number,
  requestedUnit: string,
  contentOverride?: number | null
): PurchaseOutcome | null {
  const content = contentOverride ?? salesUnitContent(product, requestedUnit);
  if (content === null || content <= 0 || requiredQuantity <= 0) return null;

  const packagePriceChf =
    product.pricePerSellUnit > 0 ? product.pricePerSellUnit : product.price;
  const packagesNeeded = Math.max(1, Math.ceil(requiredQuantity / content));
  const purchasedQuantity = packagesNeeded * content;
  const leftoverQuantity = Math.max(0, purchasedQuantity - requiredQuantity);

  const round = (value: number, digits: number) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  };

  return {
    content: round(content, 3),
    packagePriceChf: round(packagePriceChf, 2),
    packagesNeeded,
    purchasedQuantity: round(purchasedQuantity, 3),
    leftoverQuantity: round(leftoverQuantity, 3),
    leftoverShare: purchasedQuantity > 0 ? round(leftoverQuantity / purchasedQuantity, 4) : 0,
    totalCostChf: round(packagesNeeded * packagePriceChf, 2),
  };
}
