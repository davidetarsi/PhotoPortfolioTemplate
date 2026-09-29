/**
 * Checking a link typed in the dashboard. Plain JavaScript (no React).
 */
import { isLinkUrl, MAX_LINK_LABEL } from '../../shared/content-rules.js';

/**
 * The address as it will be saved: a bare email becomes mailto:, a bare address https://.
 * @param {string} typed
 * @returns {string}
 */
export function completeLinkUrl(typed) {
  const url = typed.trim();
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url)) return `mailto:${url}`;
  return `https://${url.replace(/^\/+/, '')}`;
}

/**
 * The link to save, or why it cannot be saved.
 * @param {string} url - As typed.
 * @param {string} label - As typed; empty means "the name of the site".
 * @returns {{ok: true, link: {url: string, label?: string}} | {ok: false, problem: 'url'|'label'}}
 */
export function checkLink(url, label) {
  const complete = completeLinkUrl(url);
  if (!isLinkUrl(complete)) return { ok: false, problem: 'url' };
  const name = label.trim();
  if (name.length > MAX_LINK_LABEL) return { ok: false, problem: 'label' };
  return { ok: true, link: name ? { url: complete, label: name } : { url: complete } };
}
