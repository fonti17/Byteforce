import { decodeTurbostreamHtml, extractSearchResponse } from './turbostream.ts';
import type { TransgourmetProduct } from './types.ts';

const CATALOG_URL = 'https://web.transgourmet.ch/de/webshop/catalog';
const IMAGE_BASE = 'https://webshop.transgourmet.ch/shop/productimages/article';

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Country names out of the `rohstoffHerkunft` records, which vary in shape. */
function parseOrigin(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const text = asText(record.text) ?? asText(record.name);
    return text ? [text] : [];
  });
}

/**
 * One raw catalog article turned into a `TransgourmetProduct`. Articles without
 * a number, a title, or a usable price are dropped, because they cannot carry a
 * pricing decision.
 */
function parseArticle(raw: unknown): TransgourmetProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const article = raw as Record<string, unknown>;

  const articleNumber = asText(article.articleNumber);
  const title = asText(article.description) ?? asText(article.title);
  const price = asNumber(article.price) ?? asNumber(article.actionPrice);
  if (articleNumber === null || title === null || price === null || price <= 0) return null;

  const oldPriceRaw = asNumber(article.oldPrice) ?? asNumber(article.normalPrice);
  const oldPrice = oldPriceRaw !== null && oldPriceRaw > price ? oldPriceRaw : null;
  const sellAmount = asNumber(article.sellAmount) ?? 1;
  const ecoScore = article.ecoScore;
  const celumId = asNumber(article.celumId);

  return {
    articleNumber,
    title,
    brand: asText(article.brand),
    price,
    unitText: asText(article.unitText) ?? 'St',
    pricePerSellUnit: asNumber(article.pricePerSellUnit) ?? price * (sellAmount || 1),
    sellAmount: sellAmount > 0 ? sellAmount : 1,
    sellUnit: asText(article.sellUnit),
    isAction: Boolean(article.isAction) || oldPrice !== null,
    oldPrice,
    isAvailable: !article.showCurrentlyNotAvailableMessage && !article.isInactive,
    origin: parseOrigin(article.rohstoffHerkunft),
    ecoScore:
      ecoScore && typeof ecoScore === 'object'
        ? asText((ecoScore as Record<string, unknown>).text)
        : asText(ecoScore),
    approxWeight: asNumber(article.approxWeight),
    imageUrl: celumId !== null ? `${IMAGE_BASE}/${celumId}.jpg` : null,
    productUrl: `${CATALOG_URL}?searchTerm=${encodeURIComponent(articleNumber)}`,
  };
}

export interface ParsedCatalogPage {
  totalCount: number;
  products: TransgourmetProduct[];
}

/** Catalog HTML straight from the webshop, read into purchasable products. */
export function parseCatalogHtml(html: string): ParsedCatalogPage {
  const searchResponse = extractSearchResponse(decodeTurbostreamHtml(html));
  const articles = searchResponse.articles;
  if (!Array.isArray(articles)) return { totalCount: 0, products: [] };

  return {
    totalCount: asNumber(searchResponse.totalCount) ?? articles.length,
    products: articles.flatMap((article) => {
      const product = parseArticle(article);
      return product ? [product] : [];
    }),
  };
}

export { CATALOG_URL };
