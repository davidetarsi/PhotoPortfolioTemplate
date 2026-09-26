import { slugifyTitle, SLUG_RE, RESERVED_SLUGS } from '../shared/content-rules.js';
import { texts } from '../../config/texts.config.js';
import { formatText } from '../utils/formatText.js';

// First path segments of the fork's custom pages, from custom/pages.config.js at build time.
import { CUSTOM_PAGE_SLUGS } from 'virtual:custom-pages';

/**
 * Creates a new album in the portfolio.
 * @param {string} title - The album title to be slugified and validated.
 * @param {Object} ctx - The admin context containing albums array and API.
 * @param {Array} ctx.albums - List of existing albums.
 * @param {Object} ctx.api - API interface for persisting albums.
 * @returns {Promise<{ok: boolean, error?: string, slug?: string}>} Result object with success flag and either error message or slug.
 */
export async function createAlbum(title, ctx) {
  const trimmed = title.trim();
  const slug = slugifyTitle(trimmed);
  if (!trimmed || !SLUG_RE.test(slug)) return { ok: false, error: texts.admin.albums.titleInvalid };
  if (RESERVED_SLUGS.includes(slug) || CUSTOM_PAGE_SLUGS.includes(slug)) {
    return { ok: false, error: formatText(texts.admin.albums.titleReserved, { slug }) };
  }
  if (ctx.albums.some(a => a.slug === slug)) return { ok: false, error: formatText(texts.admin.albums.exists, { slug }) };
  const next = [...ctx.albums, { slug, title: trimmed, description: '', coverName: null }];
  await ctx.api.putAlbums(next);
  ctx.albums = next;
  return { ok: true, slug };
}
