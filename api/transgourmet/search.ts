import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleCatalogRequest } from '../../src/server/catalogRoute.ts';

export const config = {
  maxDuration: 60,
};

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function toWebRequest(request: IncomingMessage & { body?: unknown }): Promise<Request> {
  const host = request.headers.host ?? 'localhost';
  const url = new URL(request.url ?? '/', `https://${host}`);
  const method = request.method ?? 'GET';

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else {
      headers.set(name, value);
    }
  }

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (request.body !== undefined && request.body !== null) {
      body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    } else {
      body = await readBody(request);
    }
  }

  return new Request(url, { method, headers, body });
}

async function sendWebResponse(response: ServerResponse, result: Response): Promise<void> {
  response.statusCode = result.status;
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(await result.text());
}

/**
 * Universal Vercel Serverless & Edge Function handler for `/api/transgourmet/search`.
 * Supports both standard Web `(Request) -> Response` and Node `(req, res)` runtimes.
 */
export async function GET(request: Request): Promise<Response> {
  return handleCatalogRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCatalogRequest(request);
}

export default async function handler(
  requestOrReq: Request | (IncomingMessage & { body?: unknown }),
  maybeRes?: ServerResponse
): Promise<Response | void> {
  // 1. Standard Web Fetch API (Edge runtime / Web Request)
  if (requestOrReq instanceof Request || (requestOrReq && !maybeRes)) {
    return handleCatalogRequest(requestOrReq as Request);
  }

  // 2. Node.js runtime (IncomingMessage & ServerResponse)
  const req = requestOrReq as IncomingMessage & { body?: unknown };
  const res = maybeRes!;
  try {
    const webRequest = await toWebRequest(req);
    const webResponse = await handleCatalogRequest(webRequest);
    await sendWebResponse(res, webResponse);
  } catch (error) {
    console.error('[transgourmet] vercel handler failed', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Server error' }));
  }
}
