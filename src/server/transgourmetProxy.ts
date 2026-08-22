import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { parseCatalogHtml } from '../features/pricing/transgourmet/articles.ts';
import type { CatalogSearchResponse } from '../features/pricing/transgourmet/types.ts';

/**
 * Dev-server access to the Transgourmet webshop catalog.
 *
 * The webshop answers the first request of a session with a redirect chain that
 * runs a cookie check and a silent SSO probe across two hosts, and it hands out
 * cookies of the same name on both. A browser cannot walk that chain through a
 * dev proxy — one origin cannot hold two `SCDID_S` values — so the handshake
 * happens here, in Node, against a host-keyed cookie jar. Afterwards every
 * catalog search answers with 200 directly.
 *
 * The result is a plain JSON endpoint the app can call:
 * `GET /api/transgourmet/search?q=Butter&limit=12`
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

/** Runs the cookie-check and silent-SSO chain once per dev-server session. */
function ensureWarmedUp(): Promise<void> {
  warmup ??= fetchWithJar(WARMUP_URL).then(
    () => undefined,
    (error) => {
      // A failed warmup must not poison the session — the next call retries.
      warmup = null;
      throw error;
    }
  );
  return warmup;
}

let nextRequestAt = 0;

/** Serialises catalog requests so a whole shopping list does not arrive at once. */
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

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(body);
}

async function handleSearch(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const query = url.searchParams.get('q') ?? '';
  const limitRaw = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 12;

  if (query.trim() === '') {
    sendJson(response, 400, { error: 'Missing search term' });
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await searchCatalog(query, limit);
    console.info(
      `[transgourmet] "${query}" → ${result.products.length}/${result.totalCount} products ` +
        `in ${Date.now() - startedAt} ms`
    );
    sendJson(response, 200, result);
  } catch (error) {
    console.error(`[transgourmet] "${query}" failed`, error);
    sendJson(response, 502, {
      error: error instanceof Error ? error.message : 'Catalog request failed',
    });
  }
}

/**
 * Serves `/api/transgourmet/search` from the Vite server, so the browser talks
 * to its own origin and never sees the webshop's redirect chain.
 *
 * This is a server-side route, so it exists under `vite dev` and `vite preview`
 * but not in a statically hosted `dist/`. A deployment needs the same handler in
 * front of it — `searchCatalog` is exported for exactly that, and
 * `VITE_CATALOG_ENDPOINT` points the app at wherever it ends up.
 */
export function transgourmetCatalogPlugin(): Plugin {
  return {
    name: 'transgourmet-catalog',
    configureServer(server) {
      server.middlewares.use('/api/transgourmet/search', handleSearch);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/transgourmet/search', handleSearch);
    },
  };
}
