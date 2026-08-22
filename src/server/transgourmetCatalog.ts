import { parseCatalogHtml } from '../features/pricing/transgourmet/articles.ts';
import { searchTermsFor } from '../features/pricing/transgourmet/searchTerms.ts';
import type {
  CatalogCandidates,
  CatalogSearchResponse,
} from '../features/pricing/transgourmet/types.ts';

/**
 * Server-side access to the Transgourmet webshop catalog.
 *
 * The webshop answers the first request of a session with a redirect chain that
 * runs a cookie check and a silent SSO probe across two hosts, and it hands out
 * cookies of the same name on both. A browser cannot walk that chain — one
 * origin cannot hold two `SCDID_S` values, and the webshop sends no CORS
 * headers either — so the handshake happens here, against a host-keyed cookie
 * jar. Afterwards every catalog search answers with 200 directly.
 *
 * This module knows nothing about how it is reached. `catalogRoute.ts` puts an
 * HTTP shape on it, which the Vite dev plugin and the Vercel function share.
 */

const WEBSHOP_ORIGIN = 'https://web.transgourmet.ch';
const WARMUP_URL = `${WEBSHOP_ORIGIN}/de/webshop`;
const CATALOG_URL = `${WEBSHOP_ORIGIN}/de/webshop/catalog`;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASE_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
};

const MAX_REDIRECTS = 12;
const REQUEST_TIMEOUT_MS = 20_000;
/** Politeness gap between two catalog requests, mirroring the scraper's rate limit. */
const MIN_REQUEST_GAP_MS = 350;
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Ingredients looked up at the same time inside one batch. */
const BATCH_CONCURRENCY = 6;
/** Longest shopping list one request may carry, so an invocation stays bounded. */
export const MAX_BATCH_SIZE = 60;

/** Cookies kept per host, because the two hosts issue colliding cookie names. */
const jar = new Map<string, Map<string, string>>();

function cookieHeaderFor(host: string): string {
  const cookies = jar.get(host);
  if (!cookies || cookies.size === 0) return '';
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

function storeCookies(host: string, setCookies: string[]): void {
  if (setCookies.length === 0) return;
  const cookies = jar.get(host) ?? new Map<string, string>();
  for (const header of setCookies) {
    const [pair, ...attributes] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const expired = attributes.some((attribute) => /^\s*max-age\s*=\s*0\s*$/i.test(attribute));
    if (expired) cookies.delete(name);
    else cookies.set(name, value);
  }
  jar.set(host, cookies);
}

/**
 * One request that walks the redirect chain by hand, so each hop is sent with
 * the cookies of the host it actually goes to.
 */
async function fetchWithJar(url: string): Promise<{ url: string; status: number; body: string }> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = new URL(current);
    const cookie = cookieHeaderFor(target.host);
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { ...BASE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    storeCookies(target.host, response.headers.getSetCookie());

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }

    return { url: current, status: response.status, body: await response.text() };
  }

  throw new Error(`Transgourmet redirected more than ${MAX_REDIRECTS} times`);
}

let warmup: Promise<void> | null = null;

/**
 * Runs the cookie-check and silent-SSO chain once per process. On a serverless
 * host that means once per cold instance rather than once per dev session, so
 * batching a whole shopping list into one invocation is what keeps this rare.
 */
function ensureWarmedUp(): Promise<void> {
  warmup ??= fetchWithJar(WARMUP_URL).then(
    () => undefined,
    (error) => {
      // A failed warmup must not poison the process — the next call retries.
      warmup = null;
      throw error;
    }
  );
  return warmup;
}

let nextRequestAt = 0;

/** Spaces catalog requests out so a whole shopping list does not arrive at once. */
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_REQUEST_GAP_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

const cache = new Map<string, { at: number; value: CatalogSearchResponse }>();

export async function searchCatalog(query: string, limit: number): Promise<CatalogSearchResponse> {
  const trimmed = query.trim();
  if (trimmed === '') return { query: trimmed, totalCount: 0, products: [] };

  const pageSize = Math.min(100, Math.max(limit, 24));
  const key = `${trimmed.toLowerCase()}|${pageSize}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.value, products: cached.value.products.slice(0, limit) };
  }

  await ensureWarmedUp();
  await throttle();

  const url = new URL(CATALOG_URL);
  url.searchParams.set('searchTerm', trimmed);
  url.searchParams.set('page', '0');
  url.searchParams.set('pageSize', String(pageSize));

  let page = await fetchWithJar(url.toString());
  // A session that expired lands on the cookie check again instead of the catalog.
  if (page.status !== 200 || !page.url.includes('/webshop/catalog')) {
    warmup = null;
    await ensureWarmedUp();
    page = await fetchWithJar(url.toString());
  }

  if (page.status !== 200) {
    throw new Error(`Transgourmet catalog answered HTTP ${page.status}`);
  }

  const parsed = parseCatalogHtml(page.body);
  const value: CatalogSearchResponse = {
    query: trimmed,
    totalCount: parsed.totalCount,
    products: parsed.products,
  };
  cache.set(key, { at: Date.now(), value });
  return { ...value, products: value.products.slice(0, limit) };
}

/**
 * Candidates for one ingredient. The broader fallback terms are only tried
 * while nothing was found, so a precise name still wins when it matches.
 */
export async function candidatesFor(
  ingredient: string,
  limit: number
): Promise<CatalogCandidates> {
  let lastError: unknown = null;

  for (const term of searchTermsFor(ingredient)) {
    try {
      const result = await searchCatalog(term, limit);
      if (result.products.length > 0) {
        return {
          ingredient,
          term,
          totalCount: result.totalCount,
          products: result.products,
          error: null,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ingredient,
    term: ingredient,
    totalCount: 0,
    products: [],
    error:
      lastError === null
        ? null
        : lastError instanceof Error
          ? lastError.message
          : 'Catalog request failed',
  };
}

/** Runs `worker` over `items`, never more than `limit` of them at a time. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Candidates for a whole shopping list in one go.
 *
 * Every position of a list used to be its own request from the browser, which
 * on a serverless host is its own invocation — a cold instance each, an empty
 * cookie jar each, and a rate limit none of them share. Asking for the list as
 * a unit puts all of it behind one warmup and one throttle.
 *
 * A position that cannot be looked up carries its `error` and leaves the rest
 * of the list priced.
 */
export function candidatesForAll(
  ingredients: string[],
  limit: number
): Promise<CatalogCandidates[]> {
  return mapWithConcurrency(ingredients, BATCH_CONCURRENCY, (ingredient) =>
    candidatesFor(ingredient, limit)
  );
}
