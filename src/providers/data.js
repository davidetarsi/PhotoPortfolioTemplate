/**
 * Runtime content reads: site, albums, manifests, and config.
 * Every function returns a result object, never throws. Callers decide asymmetric
 * fallback behavior for each case (e.g., use build config if fetch fails).
 */
import { validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape } from '../shared/content-rules.js';
import { isPreview, startPreviewBridge } from '../core/preview-mode.js';

/**
 * Fetches and validates JSON from a URL.
 * @param {string} url - Endpoint URL.
 * @param {Function} validate - Validation function returning {ok: boolean, error?: string}.
 * @returns {Promise<{ok: true, data: any} | {ok: false, error: string}>} Result object.
 */
async function fetchValidated(url, validate) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, error: 'NETWORK' };
  }
  if (res.status === 404) return { ok: false, error: 'NOT_FOUND' };
  if (!res.ok) return { ok: false, error: 'UNKNOWN' };
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }
  if (!validate(data).ok) return { ok: false, error: 'MALFORMED' };
  return { ok: true, data };
}

// Preview mode (`?preview=1`, the dashboard's iframe): every page — template or custom/ —
// reads its data through this module, so this is where the draft replaces the published
// data. The draft routes are behind Cloudflare Access: without the dashboard's sign-in
// they fail, and the preview bridge says the preview is unavailable.
const PREVIEW = isPreview();
let draftRequest;
const fetchDraft = () => {
  draftRequest ??= fetchValidated('/api/admin/draft', data => (
    data && typeof data === 'object' && Array.isArray(data.albums) ? { ok: true } : { ok: false }
  ));
  return draftRequest;
};
if (PREVIEW) startPreviewBridge({ draft: fetchDraft });

/** Where preview photos come from: the draft's waiting photos first, then the public ones. */
export const PREVIEW_PHOTO_BASE = '/api/admin/preview/photo';

/**
 * Fetches site metadata (name, bio, hero, links, texts).
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>} Site data or error.
 */
export async function fetchSite() {
  if (!PREVIEW) return fetchValidated('/api/data/site', validateSiteShape);
  const res = await fetchDraft();
  if (!res.ok) return res;
  if (res.data.site === null) return { ok: false, error: 'NOT_FOUND' };
  return validateSiteShape(res.data.site).ok ? { ok: true, data: res.data.site } : { ok: false, error: 'MALFORMED' };
}

/**
 * Fetches the albums collection.
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: string}>} Albums array or error.
 */
export async function fetchAlbums() {
  if (PREVIEW) {
    const res = await fetchDraft();
    if (!res.ok) return res;
    return validateAlbumsShape({ albums: res.data.albums }).ok ? { ok: true, data: res.data.albums } : { ok: false, error: 'MALFORMED' };
  }
  const res = await fetchValidated('/api/data/albums', validateAlbumsShape);
  return res.ok ? { ok: true, data: res.data.albums } : res;
}

/**
 * Fetches the photo manifest for an album.
 * @param {string} slug - Album slug.
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: string}>} Photo array or error.
 */
export function fetchManifest(slug) {
  const base = PREVIEW ? '/api/admin/draft/albums' : '/api/data/albums';
  return fetchValidated(`${base}/${slug}/manifest`, validateManifestShape);
}

/**
 * Fetches runtime configuration (R2 URL, Turnstile sitekey). In preview mode photos are
 * served by the Worker, so that photos not yet published show too.
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>} Config or error.
 */
export async function fetchConfig() {
  const res = await fetchValidated('/api/data/config', validateConfigShape);
  if (!PREVIEW || !res.ok) return res;
  return { ok: true, data: { ...res.data, r2PublicUrl: `${globalThis.location.origin}${PREVIEW_PHOTO_BASE}` } };
}
