import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPreview, startPreviewBridge } from './preview-mode.js';
import { texts } from '../../config/texts.config.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const send = (data, { origin = window.location.origin, source = window } = {}) =>
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));

describe('isPreview', () => {
  it('is on only with preview=1', () => {
    expect(isPreview('?preview=1')).toBe(true);
    expect(isPreview('?preview=1&x=2')).toBe(true);
    expect(isPreview('?preview=0')).toBe(false);
    expect(isPreview('')).toBe(false);
  });
});

describe('startPreviewBridge', () => {
  let stop;
  let readyListener;
  const on = vi.fn((type, listener) => { readyListener = listener; return () => {}; });

  beforeEach(() => {
    document.body.innerHTML = `
      <h1 data-field="site.name">Old name</h1>
      <a data-field="site.name" href="/">Old name</a>
      <form data-field="texts.about.form.successMessage"><input name="x"></form>
      <a id="about" href="/about">About</a>
      <a id="album" href="/notte#top">Album</a>
      <a id="admin" href="/admin">Admin</a>
      <a id="out" href="https://example.com/">Out</a>`;
    stop = startPreviewBridge({ draft: async () => ({ ok: true }), on });
  });
  afterEach(() => stop());

  it('updates every element of a field while the dashboard types, as text', () => {
    send({ type: 'preview:field', field: 'site.name', value: '<b>Davide</b>' });
    const names = [...document.querySelectorAll('[data-field="site.name"]')];
    expect(names.map(el => el.textContent)).toEqual(['<b>Davide</b>', '<b>Davide</b>']);
    expect(document.querySelector('b')).toBeNull();
  });

  it('never replaces the content of an element that holds other elements', () => {
    send({ type: 'preview:field', field: 'texts.about.form.successMessage', value: 'Grazie' });
    expect(document.querySelector('form input')).not.toBeNull();
  });

  it('ignores messages from another origin or another window', () => {
    send({ type: 'preview:field', field: 'site.name', value: 'Evil' }, { origin: 'https://evil.example' });
    send({ type: 'preview:field', field: 'site.name', value: 'Evil' }, { source: null });
    expect(document.querySelector('h1').textContent).toBe('Old name');
  });

  it('focus: outlines the first element of the field and moves the outline on the next focus', () => {
    const h1 = document.querySelector('h1');
    h1.scrollIntoView = vi.fn();
    send({ type: 'preview:focus', field: 'site.name' });
    expect(h1.style.outline).not.toBe('');
    expect(h1.scrollIntoView).toHaveBeenCalled();
    send({ type: 'preview:focus', field: 'texts.about.form.successMessage' });
    expect(h1.style.outline).toBe('');
    expect(document.querySelector('form').style.outline).not.toBe('');
  });

  it('keeps links to the site inside the preview', () => {
    // jsdom cannot navigate: stop the click after the bridge has rewritten the link.
    const noNavigation = event => event.preventDefault();
    document.addEventListener('click', noNavigation);
    for (const id of ['about', 'album', 'admin', 'out']) document.getElementById(id).click();
    expect(document.getElementById('about').getAttribute('href')).toBe('/about?preview=1');
    expect(document.getElementById('album').getAttribute('href')).toBe('/notte?preview=1#top');
    expect(document.getElementById('admin').getAttribute('href')).toBe('/admin');
    expect(document.getElementById('out').getAttribute('href')).toBe('https://example.com/');
    document.removeEventListener('click', noNavigation);
  });

  it('tells the embedding page when the page is ready', () => {
    const post = vi.fn();
    const win = { ...window, parent: { postMessage: post }, location: window.location, addEventListener() {}, removeEventListener() {} };
    let listener;
    const stopOther = startPreviewBridge({ win, draft: async () => ({ ok: true }), on: (type, l) => { listener = l; return () => {}; } });
    listener({ page: 'home' });
    expect(post).toHaveBeenCalledWith({ type: 'preview:ready', page: 'home' }, window.location.origin);
    stopOther();
    expect(readyListener).toBeTypeOf('function');
  });
});

describe('preview unavailable', () => {
  it('says so when the draft cannot be read (no dashboard sign-in)', async () => {
    document.body.innerHTML = '<main></main>';
    const stop = startPreviewBridge({ draft: async () => ({ ok: false, error: 'NETWORK' }), on: () => () => {} });
    await flush();
    expect(document.querySelector('.preview-notice').textContent).toBe(texts.preview.unavailable);
    stop();
  });

  it('shows nothing when the draft is readable', async () => {
    document.body.innerHTML = '<main></main>';
    const stop = startPreviewBridge({ draft: async () => ({ ok: true }), on: () => () => {} });
    await flush();
    expect(document.querySelector('.preview-notice')).toBeNull();
    stop();
  });
});
