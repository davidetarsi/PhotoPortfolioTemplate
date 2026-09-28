/**
 * Where each field of the site is shown, for the preview of the dashboard (spec,
 * "Protocollo dell'anteprima, lato dashboard"). Plain JavaScript (no React).
 */

/** The query parameter that turns a page of the site into a preview of the draft. */
export const PREVIEW_QUERY = 'preview=1';

/**
 * The page of the site where a field is shown: the contact page's texts on /about,
 * everything else (name, bio, links, home) on the home page.
 * @param {string|null} field - A PREVIEW_FIELDS value, or null.
 * @returns {'/'|'/about'}
 */
export function fieldPage(field) {
  return typeof field === 'string' && field.startsWith('texts.about.') ? '/about' : '/';
}

/**
 * The address of the preview of a page.
 * @param {string} page - A path of the site, e.g. '/about'.
 * @returns {string}
 */
export function previewSrc(page) {
  return `${page}?${PREVIEW_QUERY}`;
}
