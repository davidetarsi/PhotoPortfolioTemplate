import { SLUG_RE } from '../shared/content-rules.js';

/**
 * Reads the entry slug from the current path of a collection page.
 * The address may carry a trailing slash or ".html" (the dev server and old links).
 *
 * @param {string} pattern - The collection path from custom/pages.config.js, e.g. '/projects/:slug'.
 * @param {string} pathname - Usually location.pathname.
 * @returns {string|null} The slug, or null when the path is not an entry of this collection.
 */
export function slugFromPath(pattern, pathname) {
  const [prefix, param, extra] = pattern.split('/').filter(Boolean);
  if (param !== ':slug' || extra !== undefined) {
    throw new TypeError(`slugFromPath: the pattern must look like "/prefix/:slug", got "${pattern}".`);
  }
  const [first, slug, rest] = pathname.replace(/\/$/, '').replace(/\.html$/, '').split('/').filter(Boolean);
  return first === prefix && rest === undefined && typeof slug === 'string' && SLUG_RE.test(slug) ? slug : null;
}
