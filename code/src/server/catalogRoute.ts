import { MAX_BATCH_SIZE, candidatesForAll, searchCatalog } from './transgourmetCatalog.js';

/**
 * The catalog endpoint as a Web `Request` → `Response` handler.
 *
 * Two hosts serve it and both speak this shape: the Vite dev plugin adapts
 * Node's `IncomingMessage` onto it (`transgourmetProxy.ts`), and the Vercel
 * function exports it directly (`api/transgourmet/search.ts`). Neither owns
 * any parsing or error handling of its own, so the deployed endpoint and the
 * one used in development cannot drift apart.
 *
 *   GET  ?q=Butter&limit=12          one search term
 *   POST { ingredients: [], limit }  a whole shopping list, one invocation
 */

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

function clampLimit(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function failure(error: unknown): Response {
  return json(502, { error: error instanceof Error ? error.message : 'Catalog request failed' });
}

async function handleSingle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const limit = clampLimit(url.searchParams.get('limit'));

  if (query.trim() === '') return json(400, { error: 'Missing search term' });

  const startedAt = Date.now();
  try {
    const result = await searchCatalog(query, limit);
    console.info(
      `[transgourmet] "${query}" → ${result.products.length}/${result.totalCount} products ` +
        `in ${Date.now() - startedAt} ms`
    );
    return json(200, result);
  } catch (error) {
    console.error(`[transgourmet] "${query}" failed`, error);
    return failure(error);
  }
}

async function handleBatch(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Body is not valid JSON' });
  }

  const payload = (body ?? {}) as { ingredients?: unknown; limit?: unknown };
  if (!Array.isArray(payload.ingredients)) {
    return json(400, { error: 'Expected an "ingredients" array' });
  }

  const ingredients = payload.ingredients
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (ingredients.length === 0) return json(200, { results: [] });
  if (ingredients.length > MAX_BATCH_SIZE) {
    return json(400, { error: `At most ${MAX_BATCH_SIZE} ingredients per request` });
  }

  const limit = clampLimit(payload.limit);
  const startedAt = Date.now();
  try {
    const results = await candidatesForAll(ingredients, limit);
    const found = results.filter((result) => result.products.length > 0).length;
    console.info(
      `[transgourmet] batch of ${results.length} → ${found} with candidates ` +
        `in ${Date.now() - startedAt} ms`
    );
    return json(200, { results });
  } catch (error) {
    console.error(`[transgourmet] batch of ${ingredients.length} failed`, error);
    return failure(error);
  }
}

export function handleCatalogRequest(request: Request): Promise<Response> {
  if (request.method === 'GET') return handleSingle(request);
  if (request.method === 'POST') return handleBatch(request);
  return Promise.resolve(json(405, { error: 'Method not allowed' }, { Allow: 'GET, POST' }));
}
