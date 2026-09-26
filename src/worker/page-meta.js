import { escapeHtml } from '../shared/html.js';
import { photoUrl } from '../providers/r2.js';
import { resolveHeroUrl } from '../utils/resolveHeroUrl.js';

/**
 * Meta values for one album page, computed from the runtime data in R2.
 *
 * @param {object} input
 * @param {object} input.site - A validated site.json, or {} when it is unavailable.
 * @param {object} input.album - One entry of a validated albums.json.
 * @param {string|undefined} input.r2PublicUrl - Public URL of the photo bucket.
 * @param {URL} input.url - URL of the incoming request.
 * @returns {{title: string, description: string, image: string, canonical: string}}
 */
export function albumMeta({ site, album, r2PublicUrl, url }) {
  const siteName = typeof site.name === 'string' ? site.name.trim() : '';
  const title = siteName ? `${album.title} — ${siteName}` : album.title;

  const bio = typeof site.bio === 'string' ? site.bio : '';
  const description = album.description.trim() ? album.description : bio;

  const cover = album.coverName ? photoUrl(r2PublicUrl, album.slug, album.coverName) : null;
  const image = cover ?? resolveHeroUrl(site.hero, r2PublicUrl) ?? '';

  return { title, description, image, canonical: `${url.origin}/${album.slug}` };
}

const TITLE_RE = /<title>[\s\S]*?<\/title>/;
const CANONICAL_RE = /<link\b[^>]*\brel="canonical"[^>]*>/;

function metaTagPattern(attr, key) {
  return new RegExp(`<meta\\b[^>]*\\b${attr}="${key}"[^>]*>`);
}

// Includes indentation and the trailing newline, so a removal leaves no blank line.
function metaLinePattern(attr, key) {
  return new RegExp(`[ \\t]*<meta\\b[^>]*\\b${attr}="${key}"[^>]*>\\n?`);
}

// Replacer functions everywhere: a replacement *string* would interpret `$&`, `$1`, `$$`.
function insertBeforeHeadEnd(html, tag) {
  return html.replace('</head>', () => `${tag}\n</head>`);
}

function setMeta(html, attr, key, value) {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
  const pattern = metaTagPattern(attr, key);
  return pattern.test(html) ? html.replace(pattern, () => tag) : insertBeforeHeadEnd(html, tag);
}

function setOrRemoveMeta(html, attr, key, value) {
  return value ? setMeta(html, attr, key, value) : html.replace(metaLinePattern(attr, key), '');
}

/**
 * Rewrites the <head> of the built album.html with one album's meta.
 * String functions rather than HTMLRewriter: the head is template-owned and
 * stable, and the tests run in Node, where HTMLRewriter does not exist.
 *
 * @param {string} html - The built album.html.
 * @param {{title: string, description: string, image: string, canonical: string}} meta
 * @returns {string} The rewritten HTML, or `html` unchanged when it has no </head>.
 */
export function rewriteHead(html, meta) {
  if (!html.includes('</head>')) return html;

  let out = html.replace(TITLE_RE, () => `<title>${escapeHtml(meta.title)}</title>`);
  out = setMeta(out, 'property', 'og:title', meta.title);
  out = setOrRemoveMeta(out, 'name', 'description', meta.description);
  out = setOrRemoveMeta(out, 'property', 'og:description', meta.description);
  out = setMeta(out, 'property', 'og:url', meta.canonical);
  out = setOrRemoveMeta(out, 'property', 'og:image', meta.image);

  const canonical = `<link rel="canonical" href="${escapeHtml(meta.canonical)}">`;
  return CANONICAL_RE.test(out)
    ? out.replace(CANONICAL_RE, () => canonical)
    : insertBeforeHeadEnd(out, canonical);
}
