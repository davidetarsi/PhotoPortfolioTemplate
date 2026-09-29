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
  let announced = false;
  let lifecycleStarted = false;
  const inFrame = win.parent !== win;
  const reduceMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // Scroll the preview itself, never the dashboard around it (scrollIntoView would move both).
  const scrollToElement = el => {
    const rect = el.getBoundingClientRect();
    const top = rect.top + (win.scrollY ?? 0) - Math.max(0, ((win.innerHeight ?? 0) - rect.height) / 2);
    win.scrollTo?.({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' });
  };

  const onMessage = event => {
    // Only the page that embeds this one, on the same origin. A page opened on its own has
    // itself as parent: nothing to listen to then.
    if (win.parent === win || event.origin !== win.location.origin || event.source !== win.parent) return;
    const message = event.data ?? {};
    if (message.type === 'preview:field' && typeof message.field === 'string' && typeof message.value === 'string') {
      // Only elements that hold plain text: a form or a list marked for focus is left alone.
      // An element with a fallback (the hero shows a default line when the bio is empty)
      // shows it for an empty value, as the page itself does.
      for (const el of fieldsNamed(doc, message.field)) {
        if (el.childElementCount > 0) continue;
        el.textContent = !message.value.trim() && el.dataset.fallback ? el.dataset.fallback : message.value;
      }
    } else if (message.type === 'preview:focus' && (typeof message.field === 'string' || message.field === null)) {
      // field: null removes the outline (the owner left the field).
      if (focused) {
        focused.style.outline = '';
        focused.style.outlineOffset = '';
      }
      focused = message.field === null ? null : fieldsNamed(doc, message.field)[0] ?? null;
      if (focused) {
        focused.style.outline = '2px solid var(--color-accent, currentColor)';
        focused.style.outlineOffset = '4px';
        scrollToElement(focused);
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

  // In the preview the contact form never sends a real message.
  const onSubmit = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  // "Ready" tells the dashboard it can send the unsaved texts and the focus again. Template
  // pages announce it with page:ready; a page of custom/ has no such event, so the load of
  // the page stands in for it. It may therefore arrive more than once: each time is fine.
  const announce = ({ page = null, restored = false } = {}) => {
    announced = true;
    if (inFrame) {
      win.parent.postMessage({ type: 'preview:ready', page, restored, path: win.location.pathname }, win.location.origin);
    }
  };
  const onLoad = () => {
    if (lifecycleStarted || announced) return;
    Promise.resolve(draft()).then(() => { if (!announced && !lifecycleStarted) announce(); });
  };
  // Back from the back/forward cache the page would show an old draft: read it again.
  const onPageShow = event => {
    if (event.persisted) win.location.reload();
  };

  win.addEventListener('message', onMessage);
  win.addEventListener('load', onLoad);
  win.addEventListener('pageshow', onPageShow);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onClick, true); // middle click: a new tab, still in preview
  doc.addEventListener('submit', onSubmit, true);
  const stopStart = on('page:start', () => { lifecycleStarted = true; });
  const stopReady = on('page:ready', detail => {
    if (detail?.restored || !announced) announce(detail ?? {});
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
    win.removeEventListener('load', onLoad);
    win.removeEventListener('pageshow', onPageShow);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('auxclick', onClick, true);
    doc.removeEventListener('submit', onSubmit, true);
    if (typeof stopStart === 'function') stopStart();
    if (typeof stopReady === 'function') stopReady();
  };
}
