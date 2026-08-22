import type { CatalogSearchResponse, TransgourmetProduct } from '../types/transgourmet';

/**
 * Live product candidates from `web.transgourmet.ch/de/webshop`.
 *
 * The webshop itself cannot be called from the browser: it opens a session with
 * a redirect chain across two hosts that hand out cookies of the same name, and
 * it sends no CORS headers. The dev server walks that chain instead and serves
 * the decoded catalog as JSON under its own origin — see
 * `src/server/transgourmetProxy.ts`.
 */

const endpoint = import.meta.env.VITE_CATALOG_ENDPOINT ?? '/api/transgourmet/search';

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

/**
 * Search terms tried in order until one returns products. A shopping list says
 * "frische Rüebli, geschält"; the catalog is indexed on "Rüebli".
 */
export function searchTermsFor(ingredient: string): string[] {
  const cleaned = ingredient
    .replace(/\(.*?\)/g, ' ')
    .replace(/[,;/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter((word) => word.length > 2);
  const terms = [cleaned];

  // Swiss recipes name the state before the food: "frische Peterli" → "Peterli".
  const withoutQualifier = words.filter(
    (word) => !/^(frisch|frische|frischer|frisches|getrocknet|getrocknete|bio|ganze|ganzer|gemahlen|gemahlene|geschält|geschälte|gehackt|gehackte|fresh|dried|whole|ground|chopped|peeled)$/i.test(word)
  );
  if (withoutQualifier.length > 0 && withoutQualifier.length < words.length) {
    terms.push(withoutQualifier.join(' '));
  }

  // The head noun alone is the widest net the catalog still answers usefully.
  const longest = [...withoutQualifier].sort((a, b) => b.length - a.length)[0];
  if (longest) terms.push(longest);

  return [...new Set(terms.filter((term) => term.length > 1))];
}

async function requestOnce(term: string, limit: number, signal?: AbortSignal): Promise<CatalogSearchResponse> {
  const url = `${endpoint}?q=${encodeURIComponent(term)}&limit=${limit}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new CatalogError(`Catalog search for "${term}" failed with HTTP ${response.status}. ${detail}`);
  }
  return (await response.json()) as CatalogSearchResponse;
}

/**
 * Candidates for one ingredient. The broader fallback terms are only tried
 * while nothing was found, so a precise name still wins when it matches.
 */
export async function findCandidates(
  ingredient: string,
  { limit = 12, signal }: { limit?: number; signal?: AbortSignal } = {}
): Promise<{ term: string; products: TransgourmetProduct[] }> {
  let lastError: unknown = null;

  for (const term of searchTermsFor(ingredient)) {
    try {
      const result = await requestOnce(term, limit, signal);
      if (result.products.length > 0) return { term, products: result.products };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return { term: ingredient, products: [] };
}
