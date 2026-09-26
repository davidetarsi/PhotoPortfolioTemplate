import { escapeHtml } from '../shared/html.js';
import { stripEmptyMeta } from './injectSiteMeta.js';

/**
 * Fills the {{PAGE_*}} placeholders of a collection entry's HTML at build time,
 * so crawlers that do not run JavaScript see the entry's own title and preview.
 *
 * @param {string} html - Built page HTML, {{SITE_*}} already injected.
 * @param {Record<string, string>} meta - Values from expandCollection.
 * @returns {string} HTML with the entry's values and without empty meta tags.
 */
export function injectPageMeta(html, meta) {
  const replaced = html.replace(/\{\{(PAGE_[A-Z]+)\}\}/g, (match, key) =>
    key in meta ? escapeHtml(meta[key]) : match,
  );
  return stripEmptyMeta(replaced);
}
