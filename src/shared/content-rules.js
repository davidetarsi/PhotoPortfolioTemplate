/**
 * Validation rules shared across Worker (write validation), public site (read validation),
 * and admin dashboard (naming and slug generation). Single source of truth.
 */

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Paths the template answers before the Worker's album branch: the one list that routing
 * (Worker, Vite dev server) and reservations (dashboard, custom pages) derive from.
 */
export const TEMPLATE_ROUTES = Object.freeze({
  // Served by the Worker from a static file with another name.
  pages: Object.freeze({ '/about': '/about.html', '/admin': '/admin.html' }),
  // Built files that Workers Static Assets serves before the Worker runs:
  // /album is album.html itself, /index answers 307 → /.
  builtFiles: Object.freeze(['/album', '/index']),
  // Worker API routes and Vite build output.
  prefixes: Object.freeze(['/api', '/assets']),
});

/**
 * First path segments taken by the template. Refused for NEW names only: the dashboard
 * when it creates an album, and custom/pages.config.js. Not checked when reading or
 * saving albums.json: an existing album with one of these slugs keeps working in the
 * dashboard, and on the public site the template route wins.
 */
export const RESERVED_SLUGS = Object.freeze([
  ...Object.keys(TEMPLATE_ROUTES.pages),
  ...TEMPLATE_ROUTES.builtFiles,
  ...TEMPLATE_ROUTES.prefixes,
].map(path => path.split('/')[1]).sort());

// Legacy photo names uploaded by upload.js contain uppercase letters; the server accepts them.
export const PHOTO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.webp$/;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Converts a title into a URL-safe slug.
 * @param {string} title - The title to slugify.
 * @returns {string} The slugified version: lowercase, hyphen-separated, no special chars.
 */
export function slugifyTitle(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const fail = error => ({ ok: false, error });
const OK = { ok: true };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPhotoName = v => typeof v === 'string' && PHOTO_NAME_RE.test(v);

/**
 * Validates the structure of site metadata (name, bio, hero image, social links).
 * @param {unknown} data - The site configuration object to validate.
 * @returns {{ok: true} | {ok: false, error: string}} Validation result.
 */
export function validateSiteShape(data) {
  if (!isObj(data)) return fail('site: not an object');
  if (typeof data.name !== 'string' || !data.name.trim()) return fail('site.name is required');
  if (typeof data.bio !== 'string') return fail('site.bio must be a string');
  if (data.hero !== null) {
    if (!isObj(data.hero)) return fail('site.hero must be null or an object');
    if (typeof data.hero.album !== 'string' || !SLUG_RE.test(data.hero.album)) return fail('site.hero.album is invalid');
    if (!isPhotoName(data.hero.name)) return fail('site.hero.name is invalid');
  }
  if (!isObj(data.social)) return fail('site.social must be an object');
  for (const v of Object.values(data.social)) {
    if (typeof v !== 'string') return fail('site.social: values must be strings');
  }
  return OK;
}

/**
 * Validates the structure of the albums collection.
 * Ensures slugs are valid and unique and all required fields are present. Reserved slugs are not checked here: see RESERVED_SLUGS.
 * @param {unknown} data - The albums configuration object to validate.
 * @returns {{ok: true} | {ok: false, error: string}} Validation result.
 */
export function validateAlbumsShape(data) {
  if (!isObj(data) || !Array.isArray(data.albums)) return fail('albums: invalid shape');
  const seen = new Set();
  for (const a of data.albums) {
    if (!isObj(a)) return fail('albums: entry is not an object');
    if (typeof a.slug !== 'string' || !SLUG_RE.test(a.slug)) return fail(`invalid slug: "${a?.slug}"`);
    if (seen.has(a.slug)) return fail(`duplicate slug: "${a.slug}"`);
    seen.add(a.slug);
    if (typeof a.title !== 'string' || !a.title.trim()) return fail(`title is required for "${a.slug}"`);
    if (typeof a.description !== 'string') return fail(`description must be a string for "${a.slug}"`);
    if (a.coverName !== null && !isPhotoName(a.coverName)) return fail(`coverName is invalid for "${a.slug}"`);
  }
  return OK;
}

/**
 * Validates the structure of the photo manifest (list of uploaded photos with metadata).
 * Ensures names are unique and dimensions are valid.
 * @param {unknown} data - The manifest array to validate.
 * @returns {{ok: true} | {ok: false, error: string}} Validation result.
 */
export function validateManifestShape(data) {
  if (!Array.isArray(data)) return fail('manifest: not an array');
  const seen = new Set();
  for (const e of data) {
    if (!isObj(e)) return fail('manifest: entry is not an object');
    if (!isPhotoName(e.name)) return fail(`manifest: invalid name "${e?.name}"`);
    if (seen.has(e.name)) return fail(`manifest: duplicate name "${e.name}"`);
    seen.add(e.name);
    if (!Number.isFinite(e.width) || e.width <= 0) return fail(`manifest: invalid width for "${e.name}"`);
    if (!Number.isFinite(e.height) || e.height <= 0) return fail(`manifest: invalid height for "${e.name}"`);
    if (e.capturedAt !== undefined && !Number.isFinite(e.capturedAt)) return fail(`manifest: invalid capturedAt for "${e.name}"`);
    if (e.uploadedAt !== undefined && !Number.isFinite(e.uploadedAt)) return fail(`manifest: invalid uploadedAt for "${e.name}"`);
  }
  return OK;
}

/**
 * Validates the structure of the runtime configuration (R2 URL and Turnstile sitekey).
 * @param {unknown} data - The configuration object to validate.
 * @returns {{ok: true} | {ok: false, error: string}} Validation result.
 */
export function validateConfigShape(data) {
  if (!isObj(data)) return fail('config: not an object');
  if (typeof data.r2PublicUrl !== 'string' || !data.r2PublicUrl.trim()) {
    return fail('config.r2PublicUrl must be a non-empty string');
  }
  if (data.turnstileSitekey !== null && data.turnstileSitekey !== undefined) {
    if (typeof data.turnstileSitekey !== 'string') return fail('config.turnstileSitekey must be a string or null');
  }
  return OK;
}
