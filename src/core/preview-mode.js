/**
 * Preview mode: the real site, shown by the dashboard in an iframe with `?preview=1`,
 * fed with the draft instead of the published data (see src/providers/data.js).
 * The bridge listens to the dashboard: live text while typing, scroll to a field,
 * reload after a save. It accepts messages only from the page that embeds it, on the
 * same origin, and only ever sets textContent.
 */
import { texts } from '../../config/texts.config.js';
import { on as onEvent } from './events.js';

/** Query parameter that turns the preview on. */
export const PREVIEW_PARAM = 'preview';

/**
 * The dashboard's own pages: never in preview. Its saves go to the published site, so it
 * must always work on the published data, whatever its address says.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isAdminPath(pathname) {
  return /^\/admin(\/|\.html$|$)/.test(pathname);
}

/**
 * @param {{search?: string, pathname?: string}} [location] - Defaults to the page's location.
 * @returns {boolean} True when the page is a preview.
 */
export function isPreview({ search = '', pathname = '/' } = globalThis.location ?? {}) {
  return new URLSearchParams(search).get(PREVIEW_PARAM) === '1' && !isAdminPath(pathname);
}

const fieldsNamed = (doc, field) =>
  [...doc.querySelectorAll('[data-field]')].filter(el => el.getAttribute('data-field') === field);

/**
 * Starts listening to the dashboard. Call once per page, only in preview mode.
 * @param {object} options
 * @param {Window} [options.win]
 * @param {Document} [options.doc]
 * @param {() => Promise<{ok: boolean}>} options.draft - Resolves to the result of reading the draft.
 * @param {Function} [options.on] - Page event subscription (for page:ready).
 * @returns {Function} Stops listening.
 */
export function startPreviewBridge({ win = window, doc = document, draft, on = onEvent }) {
  let focused = null;
  const reduceMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const onMessage = event => {
    // Only the page that embeds this one, on the same origin. A page opened on its own has
    // itself as parent: nothing to listen to then.
    if (win.parent === win || event.origin !== win.location.origin || event.source !== win.parent) return;
    const message = event.data ?? {};
    if (message.type === 'preview:field' && typeof message.field === 'string' && typeof message.value === 'string') {
      // Only elements that hold plain text: a form or a list marked for focus is left alone.
      for (const el of fieldsNamed(doc, message.field)) {
        if (el.childElementCount === 0) el.textContent = message.value;
      }
    } else if (message.type === 'preview:focus' && typeof message.field === 'string') {
      if (focused) focused.style.outline = '';
      focused = fieldsNamed(doc, message.field)[0] ?? null;
      if (focused) {
        focused.style.outline = '2px solid var(--color-accent, currentColor)';
        focused.style.outlineOffset = '4px';
        focused.scrollIntoView?.({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
    } else if (message.type === 'preview:reload') {
      win.location.reload();
    }
  };

  // Links to other pages of the site stay in the preview; a link to the dashboard opens it
  // in the whole window, not inside the preview frame.
  const onClick = event => {
    const link = event.target?.closest?.('a[href]');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.getAttribute('href'), win.location.href);
    if (url.origin !== win.location.origin || url.pathname.startsWith('/api/')) return;
    if (isAdminPath(url.pathname)) {
      if (win.parent !== win) link.target = '_top';
      return;
    }
    if (url.searchParams.get(PREVIEW_PARAM) === '1') return;
    url.searchParams.set(PREVIEW_PARAM, '1');
    link.setAttribute('href', url.pathname + url.search + url.hash);
  };

  win.addEventListener('message', onMessage);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onClick, true); // middle click: a new tab, still in preview
  const stopReady = on('page:ready', ({ page } = {}) => {
    if (win.parent !== win) win.parent.postMessage({ type: 'preview:ready', page }, win.location.origin);
  });

  // Without the dashboard's sign-in the draft cannot be read: say so instead of
  // showing the published site as if it were the preview.
  Promise.resolve(draft()).then(result => {
    if (result.ok) return;
    const notice = doc.createElement('p');
    notice.className = 'preview-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = texts.preview.unavailable;
    Object.assign(notice.style, { margin: '0', padding: '0.75rem 1rem', textAlign: 'center', background: '#b3261e', color: '#fff' });
    doc.body.prepend(notice);
  });

  return () => {
    win.removeEventListener('message', onMessage);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('auxclick', onClick, true);
    if (typeof stopReady === 'function') stopReady();
  };
}
