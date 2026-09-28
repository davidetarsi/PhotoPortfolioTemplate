import { RESERVED_SLUGS, SLUG_RE, slugifyTitle } from '../../../shared/content-rules.js';
import { formatText } from '../../../utils/formatText.js';
import { texts } from '../../../../config/texts.config.js';
// First path segments of the fork's custom pages, from custom/pages.config.js at build time.
import { CUSTOM_PAGE_SLUGS } from 'virtual:custom-pages';

const t = texts.admin.albums;

/**
 * Checks the title of a new album and gives its address (slug).
 * @param {string} title
 * @param {Array<{slug: string}>} albums - The draft's albums.
 * @returns {{ok: true, album: object} | {ok: false, error: string}}
 */
export function newAlbum(title, albums) {
  const trimmed = String(title).trim();
  const slug = slugifyTitle(trimmed);
  if (!trimmed || !SLUG_RE.test(slug)) return { ok: false, error: t.titleInvalid };
  if (RESERVED_SLUGS.includes(slug) || CUSTOM_PAGE_SLUGS.includes(slug)) return { ok: false, error: formatText(t.titleReserved, { slug }) };
  if (albums.some(album => album.slug === slug)) return { ok: false, error: formatText(t.exists, { slug }) };
  return { ok: true, album: { slug, title: trimmed, description: '', coverName: null } };
}
