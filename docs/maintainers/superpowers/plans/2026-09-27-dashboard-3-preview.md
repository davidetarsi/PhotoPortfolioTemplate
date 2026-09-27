# Dashboard in React, piano 3: anteprima — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The real site as the dashboard's preview: `?preview=1` makes every page read the draft, the dashboard can update and focus texts while the owner types, and only the site's own origin can frame it.

**Architecture:** `src/providers/data.js` is the one place every page (template or `custom/`) reads data through: with `?preview=1` it reads `/api/admin/draft…` (behind Access) and serves photos from a new Worker route that tries the waiting photo first and the published one second (so photos an interrupted publication already moved still show). A small bridge (`src/core/preview-mode.js`) listens to `postMessage` from the embedding page on the same origin (`preview:field`, `preview:focus`, `preview:reload`), keeps internal links in preview, tells the parent `preview:ready`, and says when the preview is unavailable. Template components mark editable text with `data-field`; the list is `PREVIEW_FIELDS` in the public API. The CSP allows framing by the same origin only.

**Tech Stack:** Vitest 4 (jsdom and node), Cloudflare Workers, browser `postMessage`.

**Spec:** `docs/maintainers/superpowers/specs/2026-09-27-dashboard-react-design.md` (section "Anteprima", "Scelte fatte scrivendo il piano 2" → "Per il piano 3", item 3 of "I quattro piani").

## Global Constraints

- Branch `feat/dashboard-react`. Never commit on `main`, never push (the controller pushes).
- Commit messages: subject line, blank line, then the two trailer lines, with the heredoc shown in each task (trailers NOT in the subject).
- Stage files by name only: never `git add -A` or `git add .`. The untracked `wrangler.json` stays untracked; `.superpowers/` is git-ignored.
- Work only inside `/srv/claude/workspaces/`. Do not read or print credentials.
- Code, comments and test names in English. Visible copy only in `config/texts.config.js` and `config/texts.it.js`, same keys in both.
- The edits were applied to a disposable copy, checked in real Chromium (iframe on the same origin with the built CSP: 12/12), then replayed task by task from a clean checkout. They live as **checked scripts** and **ready files** in `/srv/claude/workspaces/qa-browser/p3/`: run the scripts from the repository root, never edit them; if one stops with an `AssertionError`, report NEEDS_CONTEXT with its message.
- Baseline before Task 1: 86 test files, 681 passed, 1 skipped.

---

### Task 1: Worker side — preview photos, unpublished album pages, framing by the same origin

**Files:** Modify `src/worker/draft-routes.js` (route `GET /api/admin/preview/photo/<slug>/<name>`), `src/worker/album-page.js` (`?preview=1` serves the page as it is), `src/utils/buildHeaders.js` (`frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`); tests `src/utils/buildHeaders.test.js`, `src/worker/album-page.test.js`, `src/worker/draft-routes.test.js`.

**Interfaces — Produces:** `GET /api/admin/preview/photo/<slug>/<name>` (behind Access): the waiting photo if any, else the published one, else 404; `Cache-Control: private, no-store`.

- [ ] **Step 1: Tests**

Run: `python3 /srv/claude/workspaces/qa-browser/p3/t1-tests.py`

`/srv/claude/workspaces/qa-browser/p3/t1-tests.py` — full text:

```python
# Plan 3, Task 1 tests. Checked edits.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/utils/buildHeaders.test.js', [('''    expect(h).toContain("frame-ancestors 'none'");''',
 '''    expect(h).toContain("frame-ancestors 'self'");
    expect(h).toContain('X-Frame-Options: SAMEORIGIN');''')])
edit('src/worker/album-page.test.js', [("""  it('albums.json with the wrong shape → page unchanged, 200', async () => {""",
"""  it('preview: an album not published yet still gets the page, 200', async () => {
    const res = await run('/nuovo?preview=1', { '_data/albums.json': albums, '_site/site.json': site });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(albumHtml);
  });

  it('albums.json with the wrong shape → page unchanged, 200', async () => {""")])
edit('src/worker/draft-routes.test.js', [("""  it('publish: POST only; 409 with the problems when the draft cannot be published', async () => {""",
"""  it('preview photos: the waiting one first, then the published one, else 404', async () => {
    const env = makeEnv({ 'notte/a.webp': 'PUBLIC-A', 'notte/b.webp': 'PUBLIC-B' }, { 'staging/notte/a.webp': 'STAGED-A' });
    const a = await call(env, 'GET', '/api/admin/preview/photo/notte/a.webp');
    expect(await a.text()).toBe('STAGED-A');
    expect(a.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await (await call(env, 'GET', '/api/admin/preview/photo/notte/b.webp')).text()).toBe('PUBLIC-B');
    expect((await call(env, 'GET', '/api/admin/preview/photo/notte/zzz.webp')).status).toBe(404);
    expect((await call(env, 'GET', '/api/admin/preview/photo/notte/..%2Fx.webp')).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/preview/photo/notte/a.webp', 'x')).status).toBe(405);
  });

  it('preview photos are closed without an Access token', async () => {
    const res = await handleAdminRequest(new Request('https://x.dev/api/admin/preview/photo/notte/a.webp'), makeEnv(), deps);
    expect(res.status).toBe(401);
  });

  it('publish: POST only; 409 with the problems when the draft cannot be published', async () => {""")])
print('t1 tests applied')
```

Run: `npm test` → 3 tests failed.

- [ ] **Step 2: Implement**

Run: `python3 /srv/claude/workspaces/qa-browser/p3/t1.py`

`/srv/claude/workspaces/qa-browser/p3/t1.py` — full text:

```python
# Plan 3, Task 1: Worker side of the preview. Checked edits.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/worker/draft-routes.js', [
 ("const STAGING_RE = /^\\/api\\/admin\\/staging\\/([^/]+)\\/([^/]+)$/;\n",
  "const STAGING_RE = /^\\/api\\/admin\\/staging\\/([^/]+)\\/([^/]+)$/;\nconst PREVIEW_PHOTO_RE = /^\\/api\\/admin\\/preview\\/photo\\/([^/]+)\\/([^/]+)$/;\n"),
 ("""    || pathname.startsWith('/api/admin/staging/') || pathname === '/api/admin/publish';""",
  """    || pathname.startsWith('/api/admin/staging/') || pathname === '/api/admin/publish'
    || pathname.startsWith('/api/admin/preview/');"""),
 ("""  if (pathname === '/api/admin/publish') {""",
  """  // Photos of the site preview: the waiting photo when there is one, else the published one.
  // Covers photos a stopped publication already moved out of the waiting area.
  const previewPhoto = pathname.match(PREVIEW_PHOTO_RE);
  if (previewPhoto) {
    if (method !== 'GET') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const slug = previewPhoto[1];
    let name;
    try { name = decodeURIComponent(previewPhoto[2]); } catch { return jsonResponse({ error: 'Invalid name or slug' }, 400); }
    if (!SLUG_RE.test(slug) || !PHOTO_NAME_RE.test(name)) return jsonResponse({ error: 'Invalid name or slug' }, 400);
    const obj = (await env.PRIVATE_BUCKET.get(STAGING.photo(slug, name))) ?? (await env.BUCKET.get(PUBLISHED.photo(slug, name)));
    if (!obj) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    return new Response(obj.body, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' } });
  }

  if (pathname === '/api/admin/publish') {"""),
])
edit('src/worker/album-page.js', [
 ("""  const asset = await env.ASSETS.fetch(new URL('/album.html', url));
  if (!asset.ok) return asset;
""", """  const asset = await env.ASSETS.fetch(new URL('/album.html', url));
  if (!asset.ok) return asset;
  // The dashboard's preview may show an album that is not published yet: serve the page
  // as it is, and let it read the draft.
  if (url.searchParams.get('preview') === '1') return asset;
"""),
])
edit('src/utils/buildHeaders.js', [
 ('''    "frame-ancestors 'none'",''', '''    // 'self': the dashboard shows the site in an iframe for its preview; no other site can.
    "frame-ancestors 'self'",'''),
 ("    '  X-Frame-Options: DENY',", "    '  X-Frame-Options: SAMEORIGIN',"),
])
print('t1 applied')
```

- [ ] **Step 3: Check** — `npm test` → 86 files, 684 passed, 1 skipped.

- [ ] **Step 4: Commit**

```bash
git add src/worker/draft-routes.js src/worker/draft-routes.test.js src/worker/album-page.js src/worker/album-page.test.js src/utils/buildHeaders.js src/utils/buildHeaders.test.js
git commit -F - <<'EOF'
feat(worker): preview photos, unpublished album pages, framing by the same origin

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: Preview mode — data from the draft, and the bridge to the dashboard

**Files:** Create `src/core/preview-mode.js`, `src/core/preview-mode.test.js`, `src/providers/data.preview.test.js`; modify `src/providers/data.js`, `config/texts.config.js`, `config/texts.it.js` (`texts.preview.unavailable`).

**Interfaces — Produces:** `isPreview(search)`, `startPreviewBridge({ win, doc, draft, on })`, `PREVIEW_PARAM` (`src/core/preview-mode.js`); `PREVIEW_PHOTO_BASE` (`src/providers/data.js`). Messages accepted from the parent (same origin only): `{ type: 'preview:field', field, value }`, `{ type: 'preview:focus', field }`, `{ type: 'preview:reload' }`; sent to the parent: `{ type: 'preview:ready', page }`.

- [ ] **Step 1: Tests**

```bash
cp /srv/claude/workspaces/qa-browser/p3/files/src/core/preview-mode.test.js src/core/
cp /srv/claude/workspaces/qa-browser/p3/files/src/providers/data.preview.test.js src/providers/
```

`src/core/preview-mode.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p3/files/src/core/preview-mode.test.js`; full text:

```js
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
```

`src/providers/data.preview.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p3/files/src/providers/data.preview.test.js`; full text:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Preview mode is decided when data.js loads: set the address first, then import it.
const SITE = { name: 'Bozza', bio: '', hero: null, links: [] };
const ALBUMS = [{ slug: 'notte', title: 'Notte', description: '', coverName: null }];
const jsonRes = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

let data;
beforeEach(async () => {
  vi.resetModules();
  window.history.replaceState(null, '', '/?preview=1');
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (url === '/api/admin/draft') return jsonRes({ site: SITE, albums: ALBUMS, hasDraft: true });
    if (url === '/api/admin/draft/albums/notte/manifest') return jsonRes([{ name: 'a.webp', width: 4, height: 3 }]);
    if (url === '/api/data/config') return jsonRes({ r2PublicUrl: 'https://pub.r2.dev', turnstileSitekey: null });
    return jsonRes({ error: 'NOT_FOUND' }, 404);
  }));
  data = await import('./data.js');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('data in preview mode', () => {
  it('reads site and albums from the draft, with one request', async () => {
    expect(await data.fetchSite()).toEqual({ ok: true, data: SITE });
    expect(await data.fetchAlbums()).toEqual({ ok: true, data: ALBUMS });
    expect(fetch.mock.calls.filter(([url]) => url === '/api/admin/draft')).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => url.startsWith('/api/data/site'))).toBe(false);
  });

  it('reads manifests from the draft', async () => {
    expect((await data.fetchManifest('notte')).data).toHaveLength(1);
  });

  it('serves photos through the Worker, so unpublished ones show', async () => {
    const res = await data.fetchConfig();
    expect(res.data.r2PublicUrl).toBe(`${window.location.origin}/api/admin/preview/photo`);
  });

  it('a site never published: NOT_FOUND, so the page uses the seed', async () => {
    vi.resetModules();
    fetch.mockImplementation(async () => jsonRes({ site: null, albums: [], hasDraft: false }));
    data = await import('./data.js');
    expect(await data.fetchSite()).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await data.fetchAlbums()).toEqual({ ok: true, data: [] });
  });

  it('without the dashboard sign-in the draft fails, and so do site and albums', async () => {
    vi.resetModules();
    fetch.mockImplementation(async () => { throw new TypeError('redirected to the sign-in page'); });
    data = await import('./data.js');
    expect((await data.fetchSite()).error).toBe('NETWORK');
    expect((await data.fetchAlbums()).error).toBe('NETWORK');
  });
});
```

Run: `npm test` → 2 files fail.

- [ ] **Step 2: Implement**

```bash
cp /srv/claude/workspaces/qa-browser/p3/files/src/core/preview-mode.js src/core/
python3 /srv/claude/workspaces/qa-browser/p3/t2.py
```

`src/core/preview-mode.js` — copy it from `/srv/claude/workspaces/qa-browser/p3/files/src/core/preview-mode.js`; full text:

```js
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
 * @param {string} [search] - A location.search string.
 * @returns {boolean} True when the page is a preview.
 */
export function isPreview(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get(PREVIEW_PARAM) === '1';
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
    if (event.origin !== win.location.origin || event.source !== win.parent) return;
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
        focused.style.outline = '2px solid currentColor';
        focused.style.outlineOffset = '4px';
        focused.scrollIntoView?.({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
    } else if (message.type === 'preview:reload') {
      win.location.reload();
    }
  };

  // Links to other pages of the site stay in the preview.
  const onClick = event => {
    const link = event.target?.closest?.('a[href]');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.getAttribute('href'), win.location.href);
    if (url.origin !== win.location.origin || url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/')) return;
    if (url.searchParams.get(PREVIEW_PARAM) === '1') return;
    url.searchParams.set(PREVIEW_PARAM, '1');
    link.setAttribute('href', url.pathname + url.search + url.hash);
  };

  win.addEventListener('message', onMessage);
  doc.addEventListener('click', onClick, true);
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
    if (typeof stopReady === 'function') stopReady();
  };
}
```

`/srv/claude/workspaces/qa-browser/p3/t2.py` — full text:

```python
# Plan 3, Task 2: preview data source and the bridge's copy. Checked edits.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/providers/data.js', [
 ("""import { validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape } from '../shared/content-rules.js';
""", """import { validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape } from '../shared/content-rules.js';
import { isPreview, startPreviewBridge } from '../core/preview-mode.js';
"""),
 ("""/**
 * Fetches site metadata (name, bio, hero, social).
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>} Site data or error.
 */
export function fetchSite() {
  return fetchValidated('/api/data/site', validateSiteShape);
}

/**
 * Fetches the albums collection.
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: string}>} Albums array or error.
 */
export async function fetchAlbums() {
  const res = await fetchValidated('/api/data/albums', validateAlbumsShape);
  return res.ok ? { ok: true, data: res.data.albums } : res;
}

/**
 * Fetches the photo manifest for an album.
 * @param {string} slug - Album slug.
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: string}>} Photo array or error.
 */
export function fetchManifest(slug) {
  return fetchValidated(`/api/data/albums/${slug}/manifest`, validateManifestShape);
}

/**
 * Fetches runtime configuration (R2 URL, Turnstile sitekey).
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>} Config or error.
 */
export function fetchConfig() {
  return fetchValidated('/api/data/config', validateConfigShape);
}""", """// Preview mode (`?preview=1`, the dashboard's iframe): every page — template or custom/ —
// reads its data through this module, so this is where the draft replaces the published
// data. The draft routes are behind Cloudflare Access: without the dashboard's sign-in
// they fail, and the preview bridge says the preview is unavailable.
const PREVIEW = isPreview();
let draftRequest;
const fetchDraft = () => {
  draftRequest ??= fetchValidated('/api/admin/draft', data => (
    data && typeof data === 'object' && Array.isArray(data.albums) ? { ok: true } : { ok: false }
  ));
  return draftRequest;
};
if (PREVIEW) startPreviewBridge({ draft: fetchDraft });

/** Where preview photos come from: the draft's waiting photos first, then the public ones. */
export const PREVIEW_PHOTO_BASE = '/api/admin/preview/photo';

/**
 * Fetches site metadata (name, bio, hero, links, texts).
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>} Site data or error.
 */
export async function fetchSite() {
  if (!PREVIEW) return fetchValidated('/api/data/site', validateSiteShape);
  const res = await fetchDraft();
  if (!res.ok) return res;
  if (res.data.site === null) return { ok: false, error: 'NOT_FOUND' };
  return validateSiteShape(res.data.site).ok ? { ok: true, data: res.data.site } : { ok: false, error: 'MALFORMED' };
}

/**
 * Fetches the albums collection.
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: string}>} Albums array or error.
 */
export async function fetchAlbums() {
  if (PREVIEW) {
    const res = await fetchDraft();
    if (!res.ok) return res;
    return validateAlbumsShape({ albums: res.data.albums }).ok ? { ok: true, data: res.data.albums } : { ok: false, error: 'MALFORMED' };
  }
  const res = await fetchValidated('/api/data/albums', validateAlbumsShape);
  return res.ok ? { ok: true, data: res.data.albums } : res;
}

/**
 * Fetches the photo manifest for an album.
 * @param {string} slug - Album slug.
 * @returns {Promise<{ok: true, data: Array} | {ok: false, error: string}>} Photo array or error.
 */
export function fetchManifest(slug) {
  const base = PREVIEW ? '/api/admin/draft/albums' : '/api/data/albums';
  return fetchValidated(`${base}/${slug}/manifest`, validateManifestShape);
}

/**
 * Fetches runtime configuration (R2 URL, Turnstile sitekey). In preview mode photos are
 * served by the Worker, so that photos not yet published show too.
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>} Config or error.
 */
export async function fetchConfig() {
  const res = await fetchValidated('/api/data/config', validateConfigShape);
  if (!PREVIEW || !res.ok) return res;
  return { ok: true, data: { ...res.data, r2PublicUrl: `${globalThis.location.origin}${PREVIEW_PHOTO_BASE}` } };
}"""),
])
edit('config/texts.config.js', [("  nav: {\n", "  preview: {\n    unavailable: 'Preview unavailable: sign in to the dashboard, then open the preview again.',\n  },\n  nav: {\n")])
edit('config/texts.it.js', [("  nav: {\n", "  preview: {\n    unavailable: 'Anteprima non disponibile: entra nella dashboard, poi riapri l\\'anteprima.',\n  },\n  nav: {\n")])
print('t2 applied')
```

- [ ] **Step 3: Check** — `npm test` → 88 files, 698 passed, 1 skipped; the output has no `Not implemented` lines from jsdom.

- [ ] **Step 4: Commit**

```bash
git add src/core/preview-mode.js src/core/preview-mode.test.js src/providers/data.js src/providers/data.preview.test.js config/texts.config.js config/texts.it.js
git commit -F - <<'EOF'
feat(site): preview mode reads the draft and listens to the dashboard

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: `data-field` marks, `PREVIEW_FIELDS`, docs

**Files:** Modify `src/components/Hero.js`, `src/components/Nav.js`, `src/components/Footer.js`, `src/components/Landing.js`, `src/components/ContactForm.js`, `about.html`, `src/shared/content-rules.js` (`PREVIEW_FIELDS`), `src/api/index.js`, `src/api/index.test.js`, `docs/slots.md` (public API rows for `linkKind`, `linkLabel`, `PREVIEW_FIELDS`, and the section "The dashboard's preview"); create `src/core/preview-fields.test.js`.

**Interfaces — Produces:** `PREVIEW_FIELDS` = `['site.name', 'site.bio', 'site.links', ...EDITABLE_TEXT_KEYS.map(k => 'texts.' + k)]`, exported by the public API.

- [ ] **Step 1: Tests**

```bash
cp /srv/claude/workspaces/qa-browser/p3/files/src/core/preview-fields.test.js src/core/
python3 /srv/claude/workspaces/qa-browser/p3/t3-tests.py
```

`src/core/preview-fields.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p3/files/src/core/preview-fields.test.js`; full text:

```js
import { describe, expect, it } from 'vitest';
import aboutHtml from '../../about.html?raw';
import { PREVIEW_FIELDS, EDITABLE_TEXT_KEYS } from '../shared/content-rules.js';
import { renderHero } from '../components/Hero.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { landing } from '../components/Landing.js';
import { createContactForm } from '../components/ContactForm.js';
import { texts } from '../../config/texts.config.js';

// Every field the dashboard can edit must be marked somewhere in the template, and
// every mark must name a known field: otherwise the preview silently shows nothing.
async function templateMarks() {
  const root = document.createElement('div');
  const hero = document.createElement('section');
  renderHero(hero, { name: 'N', bio: 'B', heroUrl: null }, texts);
  const nav = document.createElement('div');
  renderNav(nav, { name: 'N' }, texts);
  const footer = document.createElement('div');
  renderFooter(footer, texts, [{ url: 'https://instagram.com/x' }]);
  const land = document.createElement('div');
  await landing.mount(land, { texts, data: Promise.resolve({ site: { name: 'N', bio: '', heroUrl: null }, albums: [], albumsError: null, r2PublicUrl: '' }) });
  const about = new DOMParser().parseFromString(aboutHtml, 'text/html');
  root.append(hero, nav, footer, land, createContactForm({ turnstileSitekey: '' }, texts));
  return new Set([...root.querySelectorAll('[data-field]'), ...about.querySelectorAll('[data-field]')]
    .map(el => el.getAttribute('data-field')));
}

describe('preview fields', () => {
  it('are the site fields plus every editable text', () => {
    expect(PREVIEW_FIELDS).toEqual(['site.name', 'site.bio', 'site.links', ...EDITABLE_TEXT_KEYS.map(key => `texts.${key}`)]);
  });

  it('are all marked in the template, and the template marks nothing else', async () => {
    const marks = await templateMarks();
    expect([...marks].sort()).toEqual([...PREVIEW_FIELDS].sort());
  });
});
```

`/srv/claude/workspaces/qa-browser/p3/t3-tests.py` — full text:

```python
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)
edit('src/api/index.test.js', [("      'albumsToCards', 'fetchAlbums',", "      'PREVIEW_FIELDS', 'albumsToCards', 'fetchAlbums',")])
print('t3 tests applied')
```

Run: `npm test` → 3 tests failed.

- [ ] **Step 2: Implement and document**

```bash
python3 /srv/claude/workspaces/qa-browser/p3/t3.py
python3 /srv/claude/workspaces/qa-browser/p3/t3-docs.py
```

`/srv/claude/workspaces/qa-browser/p3/t3.py` — full text:

```python
# Plan 3, Task 3: data-field marks and PREVIEW_FIELDS. Checked edits.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/components/Hero.js', [
 ("""        <h1 class="hero__title"></h1>
        <p class="hero__subtitle"></p>""", """        <h1 class="hero__title" data-field="site.name"></h1>
        <p class="hero__subtitle" data-field="site.bio"></p>"""),
])
edit('src/components/Nav.js', [('<a href="/" class="site-nav__brand"></a>', '<a href="/" class="site-nav__brand" data-field="site.name"></a>')])
edit('src/components/Footer.js', [('${links.length ? html`<nav class="site-footer__links"></nav>` : \'\'}', '${links.length ? html`<nav class="site-footer__links" data-field="site.links"></nav>` : \'\'}')])
edit('src/components/Landing.js', [('<h2 id="albums-heading" class="section-heading"></h2>', '<h2 id="albums-heading" class="section-heading" data-field="texts.landing.albumsSectionHeading"></h2>')])
edit('about.html', [
 ('<h1 id="about-heading" class="section-heading"></h1>', '<h1 id="about-heading" class="section-heading" data-field="texts.about.heading"></h1>'),
 ('<p id="about-body"></p>', '<p id="about-body" data-field="texts.about.body"></p>'),
])
edit('src/components/ContactForm.js', [("  const form = document.createElement('form');\n",
 "  const form = document.createElement('form');\n  // For the dashboard's preview: focusing the success message scrolls to the form.\n  form.setAttribute('data-field', 'texts.about.form.successMessage');\n")])
edit('src/shared/content-rules.js', [(
 "export const MAX_TEXT_LENGTH = 500;\n",
 """export const MAX_TEXT_LENGTH = 500;

/**
 * Values of the `data-field` attribute that the dashboard's preview can update and focus:
 * the site's name, bio and links, and every editable text as `texts.<key>`.
 */
export const PREVIEW_FIELDS = Object.freeze([
  'site.name',
  'site.bio',
  'site.links',
  ...EDITABLE_TEXT_KEYS.map(key => `texts.${key}`),
]);
""")])
edit('src/api/index.js', [("export { linkKind, linkLabel } from '../shared/site-links.js';\n",
 "export { linkKind, linkLabel } from '../shared/site-links.js';\nexport { PREVIEW_FIELDS } from '../shared/content-rules.js';\n")])
print('t3 applied')
```

`/srv/claude/workspaces/qa-browser/p3/t3-docs.py` — full text:

````python
# Plan 3 docs: public API table rows and the preview section of docs/slots.md.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('docs/slots.md', [
 ("| `fetchSite` | `fetchSite()` | response envelope for site content |\n",
  "| `fetchSite` | `fetchSite()` | response envelope for site content |\n"
  "| `linkKind` | `linkKind(url)` | the kind of a link, from its address: `'instagram'`, `'github'`, … `'email'` for `mailto:`, otherwise `'website'` |\n"
  "| `linkLabel` | `linkLabel(link, texts)` | the text to show for a link: its own `label`, else the name of its kind |\n"),
 ("| `photosFromManifest` | `photosFromManifest(entries, slug, r2PublicUrl)` | photo objects with `gridUrl`, `fullUrl`, dimensions and name |\n",
  "| `photosFromManifest` | `photosFromManifest(entries, slug, r2PublicUrl)` | photo objects with `gridUrl`, `fullUrl`, dimensions and name |\n"
  "| `PREVIEW_FIELDS` | — | the `data-field` values the dashboard's preview can update and focus (see below) |\n"),
 ("## Page setup and events\n",
  """## The dashboard's preview

The dashboard shows the real site in an iframe, at the same address with `?preview=1`. In that mode `fetchSite`, `fetchAlbums` and `fetchManifest` read the **draft** instead of the published site, and `fetchConfig` gives an `r2PublicUrl` that also serves photos not published yet. Your components get the preview for free as long as they read data through the public API and build photo URLs from `r2PublicUrl`.

While the owner types, the dashboard updates the text of every element whose `data-field` names that field, and it scrolls to and outlines the element of the field being edited. The values are in `PREVIEW_FIELDS`: `site.name`, `site.bio`, `site.links`, and `texts.<key>` for each text the dashboard edits (for example `texts.about.heading`). Mark your own elements the same way:

```js
const title = document.createElement('h1');
title.dataset.field = 'site.name';
title.textContent = site.name;
```

Only elements with no child elements have their text replaced; a container marked with a field (a list of links, a form) is only scrolled to and outlined. An element without a mark simply shows the saved draft when the preview reloads.

Links inside the site keep `?preview=1`, so the owner can browse the whole site as it will be. The preview works only after signing in to the dashboard: opened elsewhere, the page says the preview is unavailable.

## Page setup and events
"""),
])
print('p3 docs applied')
````

- [ ] **Step 3: Check** — `npm test` → 89 files, 700 passed, 1 skipped. `node /srv/claude/workspaces/qa-audit/check-links.mjs` → `0 broken`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Hero.js src/components/Nav.js src/components/Footer.js src/components/Landing.js src/components/ContactForm.js about.html src/shared/content-rules.js src/api/index.js src/api/index.test.js src/core/preview-fields.test.js docs/slots.md
git commit -F - <<'EOF'
feat(site): mark the fields the dashboard preview edits

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```
