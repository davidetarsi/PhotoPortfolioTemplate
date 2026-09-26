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

/** A string known to be safe HTML: produced by the `html` tag, never by concatenation. */
export class SafeHtml extends String {}

function render(value) {
  if (value instanceof SafeHtml) return String(value);
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

/**
 * Tagged template for HTML: every interpolated value is escaped, except nested `html`
 * templates (and arrays of them), which are already safe. Use it for every template
 * assigned to innerHTML: a guard test fails on raw template literals there.
 *
 * @example el.innerHTML = html`<p class="note">${userText}</p>`;
 * @returns {SafeHtml} The HTML, usable wherever a string is.
 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += render(value) + strings[i + 1]; });
  return new SafeHtml(out);
}
