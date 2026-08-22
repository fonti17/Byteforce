import type { CatalogBatchResponse, CatalogCandidates } from './types.ts';

/**
 * Live product candidates from `web.transgourmet.ch/de/webshop`.
 *
 * The webshop itself cannot be called from the browser: it opens a session with
 * a redirect chain across two hosts that hand out cookies of the same name, and
 * it sends no CORS headers. A server walks that chain instead and serves the
 * decoded catalog as JSON under this app's own origin — the Vite plugin in
 * `src/server/transgourmetProxy.ts` during development, the function in
 * `api/transgourmet/search.ts` once deployed.
 *
 * A whole shopping list is asked for in one request. Each position needs
 * several catalog searches before one of them matches, and on a serverless host
 * every request is its own instance with its own session handshake and its own
 * rate limit — so the list travels as a unit and the server walks it.
 */

const endpoint = import.meta.env.VITE_CATALOG_ENDPOINT ?? '/api/transgourmet/search';

const DEFAULT_LIMIT = 12;
/** Kept under the server's own ceiling, so a long list is split rather than refused. */
const CHUNK_SIZE = 40;

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

async function requestChunk(
  ingredients: string[],
  limit: number,
  signal?: AbortSignal
): Promise<CatalogCandidates[]> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredients, limit }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new CatalogError(
      `Catalog search for ${ingredients.length} ingredients failed with HTTP ${response.status}. ${detail}`
    );
  }

  return ((await response.json()) as CatalogBatchResponse).results;
}

/**
 * Candidates for every ingredient of a shopping list, keyed by the ingredient
 * as it was asked for.
 *
 * Repeated ingredients are asked for once. A position the catalog could not be
 * reached for carries its `error` and leaves the rest of the list usable.
 */
export async function findCandidatesForAll(
  ingredients: string[],
  { limit = DEFAULT_LIMIT, signal }: { limit?: number; signal?: AbortSignal } = {}
): Promise<Map<string, CatalogCandidates>> {
  const unique = [...new Set(ingredients.map((ingredient) => ingredient.trim()))].filter(
    (ingredient) => ingredient !== ''
  );

  const found = new Map<string, CatalogCandidates>();
  for (let start = 0; start < unique.length; start += CHUNK_SIZE) {
    const results = await requestChunk(unique.slice(start, start + CHUNK_SIZE), limit, signal);
    for (const result of results) found.set(result.ingredient, result);
  }

  return found;
}
