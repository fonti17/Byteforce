import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleCatalogRequest } from './catalogRoute.js';

/**
 * The catalog endpoint under `npm run dev` and `npm run preview`.
 *
 * The handler itself is `catalogRoute.ts`, shared with the deployed function in
 * `api/transgourmet/search.ts`; this file only translates between Node's
 * request objects and the Web ones that handler speaks, so development and
 * production answer identically.
 */

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  // Vite strips the mount path, so only the query string survives here — the
  // handler dispatches on the method, never on the path.
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const method = request.method ?? 'GET';

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const entry of value) headers.append(name, entry);
    else headers.set(name, value);
  }

  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(url, { method, headers, body: hasBody ? await readBody(request) : undefined });
}

async function sendWebResponse(response: ServerResponse, result: Response): Promise<void> {
  response.statusCode = result.status;
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(await result.text());
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    await sendWebResponse(response, await handleCatalogRequest(await toWebRequest(request)));
  } catch (error) {
    console.error('[transgourmet] request failed', error);
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Catalog request failed' }));
  }
}

/**
 * Serves `/api/transgourmet/search` from the Vite server, so the browser talks
 * to its own origin and never sees the webshop's redirect chain.
 *
 * This is a dev-server hook, so it exists under `vite dev` and `vite preview`
 * but not in a statically hosted `dist/`. On Vercel the same route is served by
 * `api/transgourmet/search.ts` instead, and both call the same handler.
 */
export function transgourmetCatalogPlugin(): Plugin {
  return {
    name: 'transgourmet-catalog',
    configureServer(server) {
      server.middlewares.use('/api/transgourmet/search', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/transgourmet/search', handle);
    },
  };
}
