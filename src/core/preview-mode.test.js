import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAdminPath, isPreview, startPreviewBridge } from './preview-mode.js';
import { texts } from '../../config/texts.config.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const ORIGIN = window.location.origin;

// A frame window: its own listeners, a separate parent, the page's origin.
function makeFrameWindow() {
  const listeners = {};
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    location: { origin: ORIGIN, href: `${ORIGIN}/`, pathname: '/', reload: vi.fn() },
    matchMedia: () => ({ matches: false }),
    scrollY: 0,
    innerHeight: 600,
    scrollTo: vi.fn(),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: type => { delete listeners[type]; },
  };
  const send = (data, { origin = ORIGIN, source = parent } = {}) => listeners.message?.({ data, origin, source });
  const fire = (type, event = {}) => listeners[type]?.(event);
  return { win, parent, send, fire };
}

describe('isPreview', () => {
  it('is on only with preview=1', () => {
    expect(isPreview({ search: '?preview=1', pathname: '/' })).toBe(true);
    expect(isPreview({ search: '?preview=1&x=2', pathname: '/notte' })).toBe(true);
    expect(isPreview({ search: '?preview=0', pathname: '/' })).toBe(false);
    expect(isPreview({ search: '', pathname: '/' })).toBe(false);
  });

  it('is never on in the dashboard, whatever its address says', () => {
    for (const pathname of ['/admin', '/admin/', '/admin.html']) {
      expect(isPreview({ search: '?preview=1', pathname })).toBe(false);
    }
  });

  it('tells the dashboard pages from albums whose name starts with admin', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/x')).toBe(true);
    expect(isAdminPath('/admin.html')).toBe(true);
    expect(isAdminPath('/administration')).toBe(false);
    expect(isAdminPath('/adminx')).toBe(false);
  });
});

describe('startPreviewBridge', () => {
  let frame;
  let stop;

  beforeEach(() => {
    document.body.innerHTML = `
      <h1 data-field="site.name">Old name</h1>
      <a data-field="site.name" href="/">Old name</a>
      <form data-field="texts.about.form.successMessage"><input name="x"></form>
      <a id="about" href="/about">About</a>
      <a id="album" href="/notte#top">Album</a>
      <a id="administration" href="/administration">Album named administration</a>
      <a id="admin" href="/admin">Admin</a>
      <a id="out" href="https://example.com/">Out</a>`;
    frame = makeFrameWindow();
    stop = startPreviewBridge({ win: frame.win, doc: document, draft: async () => ({ ok: true }), on: () => () => {} });
  });
  afterEach(() => stop());

  it('updates every element of a field while the dashboard types, as text', () => {
    frame.send({ type: 'preview:field', field: 'site.name', value: '<b>Davide</b>' });
    const names = [...document.querySelectorAll('[data-field="site.name"]')];
    expect(names.map(el => el.textContent)).toEqual(['<b>Davide</b>', '<b>Davide</b>']);
    expect(document.querySelector('b')).toBeNull();
  });

  it('never replaces the content of an element that holds other elements', () => {
    frame.send({ type: 'preview:field', field: 'texts.about.form.successMessage', value: 'Grazie' });
    expect(document.querySelector('form input')).not.toBeNull();
  });

  it('ignores messages from another origin, another window, or values that are not text', () => {
    frame.send({ type: 'preview:field', field: 'site.name', value: 'Evil' }, { origin: 'https://evil.example' });
    frame.send({ type: 'preview:field', field: 'site.name', value: 'Evil' }, { source: {} });
    frame.send({ type: 'preview:field', field: 'site.name', value: 42 });
    expect(document.querySelector('h1').textContent).toBe('Old name');
  });

  it('focus: outlines the first element of the field and moves the outline on the next focus', () => {
    const h1 = document.querySelector('h1');
    frame.send({ type: 'preview:focus', field: 'site.name' });
    expect(h1.style.outline).toContain('solid');
    frame.send({ type: 'preview:focus', field: 'texts.about.form.successMessage' });
    expect(h1.style.outline).toBe('');
    expect(document.querySelector('form').style.outline).toContain('solid');
  });

  it('focus scrolls the preview itself, never the dashboard around it', () => {
    const h1 = document.querySelector('h1');
    h1.scrollIntoView = vi.fn();
    frame.send({ type: 'preview:focus', field: 'site.name' });
    expect(frame.win.scrollTo).toHaveBeenCalledTimes(1);
    expect(h1.scrollIntoView).not.toHaveBeenCalled();
  });

  it('focus with field null removes the outline', () => {
    frame.send({ type: 'preview:focus', field: 'site.name' });
    frame.send({ type: 'preview:focus', field: null });
    expect(document.querySelector('h1').style.outline).toBe('');
  });

  it('an empty value shows the element\'s fallback, as the page does', () => {
    document.querySelector('h1').dataset.fallback = 'Photography portfolio.';
    frame.send({ type: 'preview:field', field: 'site.name', value: '  ' });
    expect(document.querySelector('h1').textContent).toBe('Photography portfolio.');
  });

  it('the contact form never sends from the preview', () => {
    const sent = vi.fn();
    const form = document.querySelector('form');
    form.addEventListener('submit', sent);
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(sent).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('back from the back/forward cache, the page reads the draft again', () => {
    frame.fire('pageshow', { persisted: false });
    expect(frame.win.location.reload).not.toHaveBeenCalled();
    frame.fire('pageshow', { persisted: true });
    expect(frame.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('reload: only when the parent asks', () => {
    frame.send({ type: 'preview:reload' }, { source: {} });
    expect(frame.win.location.reload).not.toHaveBeenCalled();
    frame.send({ type: 'preview:reload' });
    expect(frame.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('keeps links to the site inside the preview; the dashboard opens in the whole window', () => {
    // jsdom cannot navigate: stop the click after the bridge has rewritten the link.
    const noNavigation = event => event.preventDefault();
    document.addEventListener('click', noNavigation);
    for (const id of ['about', 'album', 'administration', 'admin', 'out']) document.getElementById(id).click();
    document.removeEventListener('click', noNavigation);
    expect(document.getElementById('about').getAttribute('href')).toBe('/about?preview=1');
    expect(document.getElementById('album').getAttribute('href')).toBe('/notte?preview=1#top');
    expect(document.getElementById('administration').getAttribute('href')).toBe('/administration?preview=1');
    expect(document.getElementById('admin').getAttribute('href')).toBe('/admin');
    expect(document.getElementById('admin').target).toBe('_top');
    expect(document.getElementById('out').getAttribute('href')).toBe('https://example.com/');
  });

  it('a middle click keeps the preview too', () => {
    const link = document.getElementById('about');
    link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(link.getAttribute('href')).toBe('/about?preview=1');
  });
});

describe('page ready and availability', () => {
  it('tells the embedding page when the page is ready', () => {
    const frame = makeFrameWindow();
    let listener;
    const stop = startPreviewBridge({ win: frame.win, doc: document, draft: async () => ({ ok: true }), on: (type, l) => { listener = l; return () => {}; } });
    listener({ page: 'home', restored: true });
    expect(frame.parent.postMessage).toHaveBeenCalledWith({ type: 'preview:ready', page: 'home', restored: true, path: '/' }, ORIGIN);
    stop();
  });

  it('a page of custom/ (no page:ready) announces itself once loaded', async () => {
    const frame = makeFrameWindow();
    frame.win.location.pathname = '/archive';
    const stop = startPreviewBridge({ win: frame.win, doc: document, draft: async () => ({ ok: true }), on: () => () => {} });
    frame.fire('load');
    await flush();
    expect(frame.parent.postMessage).toHaveBeenCalledWith({ type: 'preview:ready', page: null, restored: false, path: '/archive' }, ORIGIN);
    stop();
  });

  it('after page:ready, the load does not announce a second time', async () => {
    const frame = makeFrameWindow();
    let listener;
    const stop = startPreviewBridge({ win: frame.win, doc: document, draft: async () => ({ ok: true }), on: (type, l) => { listener = l; return () => {}; } });
    listener({ page: 'home' });
    frame.fire('load');
    await flush();
    expect(frame.parent.postMessage).toHaveBeenCalledTimes(1);
    stop();
  });

  it('not in a frame: announces nothing', async () => {
    const frame = makeFrameWindow();
    frame.win.parent = frame.win;
    frame.win.postMessage = vi.fn();
    let listener;
    const stop = startPreviewBridge({ win: frame.win, doc: document, draft: async () => ({ ok: true }), on: (type, l) => { listener = l; return () => {}; } });
    listener({ page: 'home' });
    frame.fire('load');
    await flush();
    expect(frame.win.postMessage).not.toHaveBeenCalled();
    stop();
  });

  it('a page opened on its own (not in a frame) listens to nobody', () => {
    const frame = makeFrameWindow();
    frame.win.parent = frame.win;
    document.body.innerHTML = '<h1 data-field="site.name">Old</h1>';
    const stop = startPreviewBridge({ win: frame.win, doc: document, draft: async () => ({ ok: true }), on: () => () => {} });
    frame.send({ type: 'preview:field', field: 'site.name', value: 'New' }, { source: frame.win });
    expect(document.querySelector('h1').textContent).toBe('Old');
    stop();
  });

  it('says so when the draft cannot be read (no dashboard sign-in)', async () => {
    document.body.innerHTML = '<main></main>';
    const stop = startPreviewBridge({ win: makeFrameWindow().win, doc: document, draft: async () => ({ ok: false, error: 'NETWORK' }), on: () => () => {} });
    await flush();
    expect(document.querySelector('.preview-notice').textContent).toBe(texts.preview.unavailable);
    stop();
  });

  it('shows nothing when the draft is readable', async () => {
    document.body.innerHTML = '<main></main>';
    const stop = startPreviewBridge({ win: makeFrameWindow().win, doc: document, draft: async () => ({ ok: true }), on: () => () => {} });
    await flush();
    expect(document.querySelector('.preview-notice')).toBeNull();
    stop();
  });
});
