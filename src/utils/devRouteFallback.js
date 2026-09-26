/**
 * Makes Vite's local routing match the production Worker where the cold-start
 * preview depends on it: missing data APIs stay missing and clean album slugs
 * serve album.html instead of the SPA index.
 */
import { RESERVED_SLUGS } from '../shared/content-rules.js';

const ALBUM_SLUG_RE = /^\/[a-z0-9][a-z0-9-]*\/?$/;
const RESERVED_PATHS = new Set(RESERVED_SLUGS.map(slug => `/${slug}`));

export function devRouteFallback(request, response, next) {
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

  if (ALBUM_SLUG_RE.test(url.pathname) && !RESERVED_PATHS.has(normalizedPath)) {
    request.url = `/album.html${url.search}`;
  }
  next();
}
