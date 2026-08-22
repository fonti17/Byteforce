import { handleCatalogRequest } from '../../src/server/catalogRoute.ts';

/**
 * `/api/transgourmet/search` on Vercel.
 *
 * `dist/` is static, so the Vite plugin that serves this route in development
 * does not exist here — this function takes its place, over the same handler.
 * Its duration is set in `vercel.json`; the work is almost entirely waiting on
 * the webshop, which does not count towards Vercel's active-CPU allowance.
 */
export default {
  fetch(request: Request): Promise<Response> {
    return handleCatalogRequest(request);
  },
};
