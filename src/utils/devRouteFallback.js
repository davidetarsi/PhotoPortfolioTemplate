/**
 * Makes Vite's local routing match the production Worker where the cold-start
 * preview depends on it: missing data APIs stay missing and clean album slugs
 * serve album.html instead of the SPA index.
 * Custom pages declared in custom/pages.config.js are served from their HTML under custom/pages/.
 */
import { RESERVED_SLUGS, SLUG_RE } from '../shared/content-rules.js';

const ALBUM_SLUG_RE = /^\/[a-z0-9][a-z0-9-]*\/?$/;
const RESERVED_PATHS = new Set(RESERVED_SLUGS.map(slug => `/${slug}`));

/**
 * @param {{ customPages?: Array<object> }} [options] - Normalized pages from validateCustomPages.
 * @returns {(request, response, next) => void} Connect middleware for the Vite dev server.
 */
export function createDevRouteFallback({ customPages = [] } = {}) {
  const singles = new Map(customPages.filter(p => p.kind === 'single').map(p => [p.path, p.html]));
  const collections = new Map(customPages.filter(p => p.kind === 'collection').map(p => [p.prefix, p.html]));

  return function devRouteFallback(request, response, next) {
    const url = new URL(request.url, 'http://localhost');
    const normalizedPath = url.pathname.replace(/\/$/, '') || '/';

    if (url.pathname.startsWith('/api/data/')) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: 'Runtime data API is unavailable in the Vite development server',
      }));
      return;
    }

    // Pages are static files in production, served before the Worker: match them first.
    const single = singles.get(normalizedPath);
    if (single) {
      request.url = `/${single}${url.search}`;
      next();
      return;
    }
    const [, prefix, slug, extra] = normalizedPath.split('/');
    if (slug !== undefined && extra === undefined && collections.has(prefix) && SLUG_RE.test(slug)) {
      request.url = `/${collections.get(prefix)}${url.search}`;
      next();
      return;
    }

    if (ALBUM_SLUG_RE.test(url.pathname) && !RESERVED_PATHS.has(normalizedPath)) {
      request.url = `/album.html${url.search}`;
    }
    next();
  };
}

export const devRouteFallback = createDevRouteFallback();
