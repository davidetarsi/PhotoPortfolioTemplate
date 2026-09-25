const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes a value for HTML text or a double-quoted attribute.
 * Shared by the build (injectSiteMeta) and the Worker (album meta).
 *
 * @param {unknown} value - Any value; non-strings are stringified.
 * @returns {string} The escaped string.
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);
}
