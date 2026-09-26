import { validateAlbumsShape, validateSiteShape } from '../shared/content-rules.js';
import { albumMeta, rewriteHead } from './page-meta.js';

/**
 * Reads a JSON document from R2.
 * A failed read counts as a missing document: the page must never break
 * because R2 is unavailable.
 * @returns {Promise<unknown>} The parsed value, or null when missing, not JSON, or unreadable.
 */
async function readJson(bucket, key) {
  try {
    const obj = await bucket.get(key);
    return obj ? await obj.json() : null;
  } catch {
    return null;
  }
}

/**
 * Serves album.html with the album's own title, description, cover and canonical URL.
 * Any doubt about the data → the page exactly as today, so the browser's seed
 * fallback keeps working on fresh installs that have no albums.json yet.
 *
 * @param {object} env - Worker environment with ASSETS, BUCKET and R2_PUBLIC_URL.
 * @param {URL} url - URL of the incoming request.
 * @param {string} slug - Album slug taken from the path.
 * @returns {Promise<Response>}
 */
export async function serveAlbumPage(env, url, slug) {
  const asset = await env.ASSETS.fetch(new URL('/album.html', url));
  if (!asset.ok) return asset;

  const [albumsDoc, siteDoc] = await Promise.all([
    readJson(env.BUCKET, '_data/albums.json'),
    readJson(env.BUCKET, '_site/site.json'),
  ]);
  if (!validateAlbumsShape(albumsDoc).ok) return asset;

  const headers = new Headers(asset.headers);
  // no-cache, not no-store: the rewritten page has no validators, so every visit refetches it
  // anyway, and the page stays eligible for the browser's back/forward cache.
  headers.set('Cache-Control', 'no-cache');
  headers.delete('Content-Length');
  headers.delete('ETag');
  const html = await asset.text();

  const album = albumsDoc.albums.find(a => a.slug === slug);
  if (!album) return new Response(html, { status: 404, headers });

  const site = validateSiteShape(siteDoc).ok ? siteDoc : {};
  const meta = albumMeta({ site, album, r2PublicUrl: env.R2_PUBLIC_URL, url });
  return new Response(rewriteHead(html, meta), { status: 200, headers });
}
