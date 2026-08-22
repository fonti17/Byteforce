import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_BATCH_SIZE, candidatesForAll, searchCatalog } from '../../src/server/transgourmetCatalog.js';

export const config = {
  maxDuration: 60,
};

interface VercelNodeRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelNodeResponse extends ServerResponse {
  status?: (code: number) => VercelNodeResponse;
  json?: (data: unknown) => void;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

function clampLimit(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

async function parseBody(req: VercelNodeRequest): Promise<unknown> {
  // If Vercel has already parsed req.body:
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
  }

  // Otherwise read from stream:
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Universal Vercel Serverless Function handler for `/api/transgourmet/search`.
 * Safely handles both Node.js (req, res) serverless execution and Web Fetch API.
 */
export default async function handler(
  req: VercelNodeRequest | Request,
  res?: VercelNodeResponse
): Promise<Response | void> {
  try {
    // 1. Vercel Node.js Serverless runtime (req: IncomingMessage, res: ServerResponse)
    if (res && (typeof res.status === 'function' || typeof res.setHeader === 'function')) {
      const nodeReq = req as VercelNodeRequest;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');

      const method = (nodeReq.method ?? 'GET').toUpperCase();

      if (method === 'GET') {
        const url = new URL(nodeReq.url ?? '/', `https://${nodeReq.headers?.host ?? 'localhost'}`);
        const query = (nodeReq.query?.q as string | undefined) ?? url.searchParams.get('q') ?? '';
        const limitRaw = nodeReq.query?.limit ?? url.searchParams.get('limit');
        const limit = clampLimit(limitRaw);

        if (!query.trim()) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing search term' }));
          return;
        }

        try {
          const result = await searchCatalog(query, limit);
          res.statusCode = 200;
          res.end(JSON.stringify(result));
          return;
        } catch (err) {
          console.error(`[transgourmet] GET "${query}" failed:`, err);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Catalog request failed' }));
          return;
        }
      }

      if (method === 'POST') {
        const body = await parseBody(nodeReq);
        if (!body || typeof body !== 'object') {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Body is not valid JSON' }));
          return;
        }

        const payload = body as { ingredients?: unknown; limit?: unknown };
        if (!Array.isArray(payload.ingredients)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Expected an "ingredients" array' }));
          return;
        }

        const ingredients = payload.ingredients
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '');

        if (ingredients.length === 0) {
          res.statusCode = 200;
          res.end(JSON.stringify({ results: [] }));
          return;
        }

        if (ingredients.length > MAX_BATCH_SIZE) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: `At most ${MAX_BATCH_SIZE} ingredients per request` }));
          return;
        }

        const limit = clampLimit(payload.limit);
        try {
          const results = await candidatesForAll(ingredients, limit);
          res.statusCode = 200;
          res.end(JSON.stringify({ results }));
          return;
        } catch (err) {
          console.error(`[transgourmet] POST batch of ${ingredients.length} failed:`, err);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Catalog request failed' }));
          return;
        }
      }

      res.statusCode = 405;
      res.setHeader('Allow', 'GET, POST');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // 2. Web standard Fetch API (Edge runtime)
    const request = req as Request;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const query = url.searchParams.get('q') ?? '';
      const limit = clampLimit(url.searchParams.get('limit'));
      if (!query.trim()) return new Response(JSON.stringify({ error: 'Missing search term' }), { status: 400 });
      const result = await searchCatalog(query, limit);
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { ingredients?: unknown; limit?: unknown } | null;
      if (!body || !Array.isArray(body.ingredients)) {
        return new Response(JSON.stringify({ error: 'Expected an "ingredients" array' }), { status: 400 });
      }
      const ingredients = body.ingredients.filter((e): e is string => typeof e === 'string' && e.trim() !== '');
      const limit = clampLimit(body.limit);
      const results = await candidatesForAll(ingredients, limit);
      return new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  } catch (fatalError) {
    console.error('[transgourmet] Fatal serverless error:', fatalError);
    if (res && typeof res.end === 'function') {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: fatalError instanceof Error ? fatalError.message : 'Server error' }));
      return;
    }
    return new Response(
      JSON.stringify({ error: fatalError instanceof Error ? fatalError.message : 'Server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
