import { handleCatalogRequest } from '../../src/server/catalogRoute.ts';

export const config = {
  maxDuration: 60,
};

export async function GET(request: Request): Promise<Response> {
  return handleCatalogRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCatalogRequest(request);
}

export default async function handler(request: Request): Promise<Response> {
  return handleCatalogRequest(request);
}
