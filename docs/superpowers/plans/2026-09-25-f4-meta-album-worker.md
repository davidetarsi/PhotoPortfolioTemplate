# F4 — Per-album meta tags from the Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared link to an album shows that album's title, description and cover in social previews and search results, and an album that does not exist answers with HTTP 404 — lifting the limit `CUSTOMIZING.md` currently accepts "by design".

**Architecture:** The Worker already answers every album slug with `album.html`. Its album branch moves to `serveAlbumPage`, which reads `_data/albums.json` and `_site/site.json` from R2, computes the meta with a pure function and rewrites the `<head>` of the built page with pure string functions. Missing or malformed data falls back to today's behavior (the page unchanged, status 200), so a fresh install that still relies on the build seed is unaffected.

**Tech Stack:** Cloudflare Workers, R2, Workers Static Assets, JavaScript ES modules, Vitest 4 (`// @vitest-environment node`).

**Spec:** `docs/superpowers/specs/2026-09-25-punti-di-aggancio-design.md`
**Depends on:** nothing. First phase of the roadmap (order: F4 → F1 → F2 → F3).
**Verified against:** `main` @ `6b0d6db` (2026-09-25). Baseline: 406 tests in 49 files, all passing.
**Executor:** every step below contains the complete code to write. A transcription-level implementer is enough; do not redesign.

## Global Constraints

- Values from R2 are escaped before entering HTML: an album title containing `"` or `<` cannot break out of an attribute or inject a tag.
- Every replacement that inserts an R2 value uses a **replacer function** — `str.replace(pattern, () => value)` — never a replacement string. `String.prototype.replace` interprets `$&`, `$1` and `$$` inside replacement strings, so an album titled `Q&A $& more` would otherwise be corrupted.
- Like the build (`injectSiteMeta`), a meta tag whose value is empty is **removed**, never written with `content=""`.
- `albums.json` missing, not JSON, or failing `validateAlbumsShape` → the asset is returned unchanged, status 200. This keeps the cold-start seed fallback in the browser working.
- `albums.json` valid and slug absent → same HTML, status **404**. The browser page already renders "not found"; only the status changes.
- `site.json` missing, not JSON, or failing `validateSiteShape` → treated as `{}`: the title is the album title alone, no bio fallback, no hero fallback.
- `rewriteHead` on HTML that has no `</head>` returns it unchanged.
- Responses rewritten by the Worker (both 200 and 404) carry `Cache-Control: no-store`, like `/api/data/*`, so dashboard edits appear immediately; `Content-Length` and `ETag` from the asset are dropped because the body changes. *(Revised after the final review: `no-cache` instead of `no-store` — same freshness, since the rewritten page has no validators, and the page stays eligible for the back/forward cache. The code blocks below keep the original value.)*
- The order of the router branches in `src/worker.js` does not change; only the body of the album branch does.
- Home and about pages are out of scope: they are static assets and never reach the Worker.
- **Commit only the files each task names**, with explicit `git add <paths>`. Never `git add -A` or `git add .`. Never commit `package-lock.json`.
- Code style: `src/worker.js` uses **no** semicolons; files under `src/worker/`, `src/shared/` and `src/utils/` use semicolons. Follow the file you are editing.

## Baseline facts (verified on `6b0d6db`)

| Fact | Value |
|---|---|
| `src/shared/html.js` | does not exist. `escapeHtml` is private in `src/utils/injectSiteMeta.js`; its map is `& < > " '` → `&amp; &lt; &gt; &quot; &#39;` |
| `<head>` of `album.html` | `<title>Album — {{SITE_NAME}}</title>`, `name="description"`, `og:type`, `og:title`, `og:description`, `og:image` (removed at build when the seed has no hero), `twitter:card`. **No** `og:url`, **no** canonical |
| `src/worker.js` | `fetch(request, env)`; `pathname` already has the trailing slash stripped; album branch is `return env.ASSETS.fetch(new URL('/album.html', url))` |
| Validation | `validateAlbumsShape(doc)` and `validateSiteShape(doc)` in `src/shared/content-rules.js` return `{ ok: true }` or `{ ok: false, error }`, and return a failure (no throw) for `null` |
| URLs | `photoUrl(r2PublicUrl, slug, name)` in `src/providers/r2.js` returns `null` for an empty `r2PublicUrl`. `resolveHeroUrl(hero, r2PublicUrl)` returns `null` for an incomplete hero. `r2.js` uses no DOM and no `import.meta`: safe in the Worker |
| Test fakes | `makeFakeBucket(initial)` stores objects as JSON and strings verbatim; `get(key).json()` parses. `makeFakeAssets()` takes no argument and answers `ASSET:<path>`, status 200, no headers |
| Existing routing test | `src/worker/data-routes.test.js`, *"slug album continua a servire album.html"*, uses `makeEnv()` whose bucket **contains** `albums.json` with slug `sport` and a `site.json`. After Task 3, `/sport` takes the rewrite path; the fake body `ASSET:/album.html` has no `</head>`, so `rewriteHead` returns it unchanged and the test stays green. It no longer exercises the cold-start path — `album-page.test.js` covers both paths explicitly |

## File Map

- `src/shared/html.js` (create) + test: `escapeHtml`.
- `src/utils/injectSiteMeta.js` (modify): import `escapeHtml` instead of defining it.
- `src/worker/page-meta.js` (create) + test: `albumMeta`, `rewriteHead`.
- `src/worker/album-page.js` (create) + test: `serveAlbumPage`.
- `src/worker/test-helpers.js` (modify): `makeFakeAssets(pages?)`.
- `src/worker.js` (modify): album branch delegates to `serveAlbumPage`.
- `CUSTOMIZING.md` (modify): section "Social previews (Open Graph)".

---

### Task 1: Shared HTML escaping

**Files:**
- Create: `src/shared/html.js`, `src/shared/html.test.js`
- Modify: `src/utils/injectSiteMeta.js`

**Interfaces:**
- Produces: `escapeHtml(value: unknown) → string`, exported from `src/shared/html.js`. Tasks 2 imports it.

- [ ] **Step 1: Write the failing test**

Create `src/shared/html.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('stringifies non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/shared/html.test.js`
Expected: FAIL — cannot find module `./html.js`.

- [ ] **Step 3: Create the module**

Create `src/shared/html.js`:

```js
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
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/shared/html.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Use it from `injectSiteMeta.js`**

In `src/utils/injectSiteMeta.js`, delete the whole `ESCAPE_MAP` constant and the whole `function escapeHtml(value) { … }`, and add the import. The top of the file becomes exactly:

```js
import { resolveHeroUrl } from './resolveHeroUrl.js';
import { escapeHtml } from '../shared/html.js';

/**
 * Injects site metadata placeholders into HTML templates.
```

Nothing else in the file changes.

- [ ] **Step 6: Verify the build-time behavior did not change**

Run: `npx vitest run src/utils/injectSiteMeta.test.js src/shared/html.test.js`
Expected: PASS. `injectSiteMeta.test.js` is not modified.

- [ ] **Step 7: Commit**

```bash
git add src/shared/html.js src/shared/html.test.js src/utils/injectSiteMeta.js
git commit -m "refactor: share escapeHtml between build and Worker"
```

---

### Task 2: Meta computation and head rewriting, pure

**Files:**
- Create: `src/worker/page-meta.js`, `src/worker/page-meta.test.js`

**Interfaces:**
- Consumes: `escapeHtml` from `src/shared/html.js` (Task 1); `photoUrl` from `src/providers/r2.js`; `resolveHeroUrl` from `src/utils/resolveHeroUrl.js`.
- Produces:
  - `albumMeta({ site, album, r2PublicUrl, url }) → { title, description, image, canonical }` — `site` is a validated `site.json` or `{}`; `album` is one entry of a validated `albums.json`; `url` is a `URL`.
  - `rewriteHead(html: string, meta) → string`.
  Task 3 imports both.

- [ ] **Step 1: Write the failing tests**

Create `src/worker/page-meta.test.js`:

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { albumMeta, rewriteHead } from './page-meta.js';

const built = `<!doctype html><html><head>
<title>Album — Seed</title>
<meta name="description" content="Seed bio" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Album — Seed" />
<meta property="og:description" content="Seed bio" />
<meta name="twitter:card" content="summary_large_image" />
</head><body></body></html>`;

const url = new URL('https://example.com/sport');
const site = { name: 'Davide', bio: 'Foto e codice', hero: null };

describe('albumMeta', () => {
  it('uses album title, description and cover', () => {
    expect(albumMeta({
      site,
      album: { slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' },
      r2PublicUrl: 'https://photos.example.com',
      url,
    })).toEqual({
      title: 'Sport — Davide',
      description: 'Gare',
      image: 'https://photos.example.com/sport/c.webp',
      canonical: 'https://example.com/sport',
    });
  });

  it('falls back to the site bio and to no image', () => {
    const meta = albumMeta({
      site,
      album: { slug: 'sport', title: 'Sport', description: '', coverName: null },
      r2PublicUrl: '',
      url,
    });
    expect(meta.description).toBe('Foto e codice');
    expect(meta.image).toBe('');
  });

  it('falls back to the site hero when the album has no cover', () => {
    const meta = albumMeta({
      site: { ...site, hero: { album: 'viaggi', name: 'h.webp' } },
      album: { slug: 'sport', title: 'Sport', description: 'Gare', coverName: null },
      r2PublicUrl: 'https://photos.example.com',
      url,
    });
    expect(meta.image).toBe('https://photos.example.com/viaggi/h.webp');
  });

  it('uses the album title alone when the site is unavailable', () => {
    const meta = albumMeta({
      site: {},
      album: { slug: 'sport', title: 'Sport', description: '', coverName: null },
      r2PublicUrl: '',
      url,
    });
    expect(meta.title).toBe('Sport');
    expect(meta.description).toBe('');
  });
});

describe('rewriteHead', () => {
  const meta = {
    title: 'Sport — Davide',
    description: 'Gare',
    image: 'https://p/sport/c.webp',
    canonical: 'https://example.com/sport',
  };

  it('replaces title and existing tags, inserts missing ones', () => {
    const out = rewriteHead(built, meta);
    expect(out).toContain('<title>Sport — Davide</title>');
    expect(out).toContain('<meta name="description" content="Gare">');
    expect(out).toContain('<meta property="og:title" content="Sport — Davide">');
    expect(out).toContain('<meta property="og:description" content="Gare">');
    expect(out).toContain('<meta property="og:image" content="https://p/sport/c.webp">');
    expect(out).toContain('<meta property="og:url" content="https://example.com/sport">');
    expect(out).toContain('<link rel="canonical" href="https://example.com/sport">');
    expect(out.match(/og:title/g)).toHaveLength(1);
  });

  it('leaves unrelated tags alone', () => {
    const out = rewriteHead(built, meta);
    expect(out).toContain('<meta property="og:type" content="website" />');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('escapes values coming from R2', () => {
    const out = rewriteHead(built, { ...meta, title: 'A "quoted" <b>title</b>' });
    expect(out).toContain('<title>A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt;</title>');
    expect(out).not.toContain('<b>');
  });

  it('keeps $ sequences in values literally', () => {
    const out = rewriteHead(built, { ...meta, title: 'Q&A $& $1 $$' });
    expect(out).toContain('<title>Q&amp;A $&amp; $1 $$</title>');
    expect(out).toContain('<meta property="og:title" content="Q&amp;A $&amp; $1 $$">');
  });

  it('removes og:image when there is no image', () => {
    const withImage = rewriteHead(built, meta);
    expect(rewriteHead(withImage, { ...meta, image: '' })).not.toContain('og:image');
  });

  it('removes the description tags when there is no description', () => {
    const out = rewriteHead(built, { ...meta, description: '' });
    expect(out).not.toContain('name="description"');
    expect(out).not.toContain('og:description');
  });

  it('replaces an existing canonical instead of adding a second one', () => {
    const once = rewriteHead(built, meta);
    const twice = rewriteHead(once, { ...meta, canonical: 'https://example.com/altro' });
    expect(twice.match(/rel="canonical"/g)).toHaveLength(1);
    expect(twice).toContain('<link rel="canonical" href="https://example.com/altro">');
  });

  it('returns HTML without </head> unchanged', () => {
    expect(rewriteHead('ASSET:/album.html', meta)).toBe('ASSET:/album.html');
  });
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npx vitest run src/worker/page-meta.test.js`
Expected: FAIL — cannot find module `./page-meta.js`.

- [ ] **Step 3: Implement**

Create `src/worker/page-meta.js`:

```js
import { escapeHtml } from '../shared/html.js';
import { photoUrl } from '../providers/r2.js';
import { resolveHeroUrl } from '../utils/resolveHeroUrl.js';

/**
 * Meta values for one album page, computed from the runtime data in R2.
 *
 * @param {object} input
 * @param {object} input.site - A validated site.json, or {} when it is unavailable.
 * @param {object} input.album - One entry of a validated albums.json.
 * @param {string|undefined} input.r2PublicUrl - Public URL of the photo bucket.
 * @param {URL} input.url - URL of the incoming request.
 * @returns {{title: string, description: string, image: string, canonical: string}}
 */
export function albumMeta({ site, album, r2PublicUrl, url }) {
  const siteName = typeof site.name === 'string' ? site.name.trim() : '';
  const title = siteName ? `${album.title} — ${siteName}` : album.title;

  const bio = typeof site.bio === 'string' ? site.bio : '';
  const description = album.description.trim() ? album.description : bio;

  const cover = album.coverName ? photoUrl(r2PublicUrl, album.slug, album.coverName) : null;
  const image = cover ?? resolveHeroUrl(site.hero, r2PublicUrl) ?? '';

  return { title, description, image, canonical: `${url.origin}/${album.slug}` };
}

const TITLE_RE = /<title>[\s\S]*?<\/title>/;
const CANONICAL_RE = /<link\b[^>]*\brel="canonical"[^>]*>/;

function metaTagPattern(attr, key) {
  return new RegExp(`<meta\\b[^>]*\\b${attr}="${key}"[^>]*>`);
}

// Includes indentation and the trailing newline, so a removal leaves no blank line.
function metaLinePattern(attr, key) {
  return new RegExp(`[ \\t]*<meta\\b[^>]*\\b${attr}="${key}"[^>]*>\\n?`);
}

// Replacer functions everywhere: a replacement *string* would interpret `$&`, `$1`, `$$`.
function insertBeforeHeadEnd(html, tag) {
  return html.replace('</head>', () => `${tag}\n</head>`);
}

function setMeta(html, attr, key, value) {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
  const pattern = metaTagPattern(attr, key);
  return pattern.test(html) ? html.replace(pattern, () => tag) : insertBeforeHeadEnd(html, tag);
}

function setOrRemoveMeta(html, attr, key, value) {
  return value ? setMeta(html, attr, key, value) : html.replace(metaLinePattern(attr, key), '');
}

/**
 * Rewrites the <head> of the built album.html with one album's meta.
 * String functions rather than HTMLRewriter: the head is template-owned and
 * stable, and the tests run in Node, where HTMLRewriter does not exist.
 *
 * @param {string} html - The built album.html.
 * @param {{title: string, description: string, image: string, canonical: string}} meta
 * @returns {string} The rewritten HTML, or `html` unchanged when it has no </head>.
 */
export function rewriteHead(html, meta) {
  if (!html.includes('</head>')) return html;

  let out = html.replace(TITLE_RE, () => `<title>${escapeHtml(meta.title)}</title>`);
  out = setMeta(out, 'property', 'og:title', meta.title);
  out = setOrRemoveMeta(out, 'name', 'description', meta.description);
  out = setOrRemoveMeta(out, 'property', 'og:description', meta.description);
  out = setMeta(out, 'property', 'og:url', meta.canonical);
  out = setOrRemoveMeta(out, 'property', 'og:image', meta.image);

  const canonical = `<link rel="canonical" href="${escapeHtml(meta.canonical)}">`;
  return CANONICAL_RE.test(out)
    ? out.replace(CANONICAL_RE, () => canonical)
    : insertBeforeHeadEnd(out, canonical);
}
```

- [ ] **Step 4: Run them and verify they pass**

Run: `npx vitest run src/worker/page-meta.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/worker/page-meta.js src/worker/page-meta.test.js
git commit -m "feat(worker): compute album meta and rewrite the page head"
```

---

### Task 3: Serve album pages with their meta

**Files:**
- Create: `src/worker/album-page.js`, `src/worker/album-page.test.js`
- Modify: `src/worker/test-helpers.js`, `src/worker.js`

**Interfaces:**
- Consumes: `albumMeta`, `rewriteHead` from `src/worker/page-meta.js` (Task 2); `validateAlbumsShape`, `validateSiteShape` from `src/shared/content-rules.js`.
- Produces: `serveAlbumPage(env, url: URL, slug: string) → Promise<Response>`; `makeFakeAssets(pages?: Record<string, string>)`.

- [ ] **Step 1: Let the fake assets return real HTML**

In `src/worker/test-helpers.js`, replace the whole `makeFakeAssets` function **and its JSDoc** with:

```js
/**
 * Creates a fake Assets binding for testing.
 * Records fetch calls for verification. `pages` maps a pathname to the HTML body
 * to return; any other path answers `ASSET:<path>`.
 * @param {Record<string, string>} [pages] - Bodies to return, by pathname.
 * @returns {Object} Fake assets with calls array and fetch method.
 */
export function makeFakeAssets(pages = {}) {
  const calls = [];
  return {
    calls,
    async fetch(urlOrRequest) {
      // urlOrRequest can be string | URL | Request: the real binding (Fetcher.fetch)
      // accepts all three. URL has no .url property (only .href).
      const href = typeof urlOrRequest === 'string' ? urlOrRequest : (urlOrRequest.url ?? urlOrRequest.href);
      const u = new URL(href);
      calls.push(u.pathname);
      const body = pages[u.pathname] ?? `ASSET:${u.pathname}`;
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
    },
  };
}
```

Existing callers pass no argument and keep the `ASSET:<path>` body.

- [ ] **Step 2: Write the failing tests**

Create `src/worker/album-page.test.js`:

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker from '../worker.js';
import { makeFakeAssets, makeFakeBucket } from './test-helpers.js';

const albumHtml = '<html><head><title>Album — Seed</title><meta name="description" content="Seed" /></head><body></body></html>';
const albums = { albums: [{ slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' }] };
const site = { name: 'Davide', bio: 'Bio', hero: null, social: {} };

const run = (path, bucket) => worker.fetch(
  new Request(`https://example.com${path}`),
  {
    ASSETS: makeFakeAssets({ '/album.html': albumHtml }),
    BUCKET: makeFakeBucket(bucket),
    R2_PUBLIC_URL: 'https://photos.example.com',
  },
);

describe('album pages', () => {
  it('cold start: no albums.json → page unchanged, 200', async () => {
    const res = await run('/sport', {});
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(albumHtml);
  });

  it('known album → its title, cover and canonical, no-store', async () => {
    const res = await run('/sport', { '_data/albums.json': albums, '_site/site.json': site });
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('<title>Sport — Davide</title>');
    expect(body).toContain('<meta property="og:image" content="https://photos.example.com/sport/c.webp">');
    expect(body).toContain('<link rel="canonical" href="https://example.com/sport">');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('unknown album with valid albums.json → 404 with the same page, no-store', async () => {
    const res = await run('/non-esiste', { '_data/albums.json': albums, '_site/site.json': site });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(albumHtml);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('albums.json with the wrong shape → page unchanged, 200', async () => {
    const res = await run('/sport', { '_data/albums.json': '{"albums": "nope"}' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(albumHtml);
  });

  it('albums.json that is not JSON → page unchanged, 200', async () => {
    const res = await run('/sport', { '_data/albums.json': '{not json' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(albumHtml);
  });

  it('invalid site.json → the album title alone', async () => {
    const res = await run('/sport', { '_data/albums.json': albums, '_site/site.json': '{"name": 42}' });
    expect(await res.text()).toContain('<title>Sport</title>');
  });

  it('trailing slash is the same album', async () => {
    const res = await run('/sport/', { '_data/albums.json': albums, '_site/site.json': site });
    expect(await res.text()).toContain('<title>Sport — Davide</title>');
  });
});
```

- [ ] **Step 3: Run them and verify they fail**

Run: `npx vitest run src/worker/album-page.test.js`
Expected: FAIL — the Worker still returns the page unchanged, so "known album", "unknown album" (status 200, not 404), "invalid site.json" and "trailing slash" fail. The three "unchanged" cases may already pass: that is expected, they pin today's behavior.

- [ ] **Step 4: Implement `serveAlbumPage`**

Create `src/worker/album-page.js`:

```js
import { validateAlbumsShape, validateSiteShape } from '../shared/content-rules.js';
import { albumMeta, rewriteHead } from './page-meta.js';

/**
 * Reads a JSON document from R2.
 * @returns {Promise<unknown>} The parsed value, or null when missing or not JSON.
 */
async function readJson(bucket, key) {
  const obj = await bucket.get(key);
  if (!obj) return null;
  try {
    return await obj.json();
  } catch {
    return null;
  }
}

/**
 * Serves album.html with the album's own title, description, cover and canonical URL.
 * Any doubt about the data → the page exactly as today, so the browser's seed
 * fallback keeps working on fresh installs that have no albums.json yet.
 *
 * @param {object} env - Worker environment with ASSETS, BUCKET and R2_PUBLIC_URL.
 * @param {URL} url - URL of the incoming request.
 * @param {string} slug - Album slug taken from the path.
 * @returns {Promise<Response>}
 */
export async function serveAlbumPage(env, url, slug) {
  const asset = await env.ASSETS.fetch(new URL('/album.html', url));
  if (!asset.ok) return asset;

  const [albumsDoc, siteDoc] = await Promise.all([
    readJson(env.BUCKET, '_data/albums.json'),
    readJson(env.BUCKET, '_site/site.json'),
  ]);
  if (!validateAlbumsShape(albumsDoc).ok) return asset;

  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  const html = await asset.text();

  const album = albumsDoc.albums.find(a => a.slug === slug);
  if (!album) return new Response(html, { status: 404, headers });

  const site = validateSiteShape(siteDoc).ok ? siteDoc : {};
  const meta = albumMeta({ site, album, r2PublicUrl: env.R2_PUBLIC_URL, url });
  return new Response(rewriteHead(html, meta), { status: 200, headers });
}
```

- [ ] **Step 5: Route the album branch through it**

In `src/worker.js` (no semicolons in this file), add the import after the `handleContactRequest` import:

```js
import { serveAlbumPage } from './worker/album-page.js'
```

and replace the album branch:

```js
    if (ALBUM_SLUG_RE.test(pathname)) {
      return env.ASSETS.fetch(new URL('/album.html', url))
    }
```

with:

```js
    if (ALBUM_SLUG_RE.test(pathname)) {
      return serveAlbumPage(env, url, pathname.slice(1))
    }
```

`pathname` already has the trailing slash stripped. Do not move any other branch.

- [ ] **Step 6: Run the new tests, then the whole suite**

Run: `npx vitest run src/worker/album-page.test.js`
Expected: PASS, 7 tests.

Run: `npm test`
Expected: PASS — the 406 baseline tests plus the new ones (2 + 12 + 7 = 427). In particular `src/worker/data-routes.test.js` stays green unmodified, for the reason given in "Baseline facts".

- [ ] **Step 7: Commit**

```bash
git add src/worker/album-page.js src/worker/album-page.test.js src/worker/test-helpers.js src/worker.js
git commit -m "feat(worker): album pages carry their own meta and 404 when missing"
```

---

### Task 4: Documentation

**Files:**
- Modify: `CUSTOMIZING.md`

- [ ] **Step 1: Rewrite the section "Social previews (Open Graph)"**

In `CUSTOMIZING.md`, replace everything from the line `## Social previews (Open Graph)` up to (not including) the `---` line that follows the section, with exactly:

```markdown
## Social previews (Open Graph)

Title, description, and preview image (WhatsApp, Instagram DM, LinkedIn, iMessage…) come from two places:

- **Album pages** (`/<album>`): the Worker writes the album's own title, description and cover into the page, read live from R2. A change made in the dashboard is used by the next share — social networks may still show their cached copy for a while. An album without a cover uses the site hero; an album without a description uses the site bio. An address that is not an album answers 404.
- **Home and about**: injected **at build time** from `site.config.js`, with the image URL built from the photo domain declared in `wrangler.json`. These pages are static files served before the Worker runs, so they keep the build-time values.

Two limits to know:

- On a fresh install, before the dashboard has saved any album, album pages keep the build-time preview.
- If `heroImage` is empty, home and about have no preview image.

```

- [ ] **Step 2: Commit**

```bash
git add CUSTOMIZING.md
git commit -m "docs: albums now have their own social preview"
```

---

## Manual check after deploy (Davide, not the implementer)

Runs on a real deploy — staging if enabled, otherwise production after merge. **Implementers must not deploy.**

```bash
curl -s https://<your-domain>/<existing-album> | grep -E '<title>|og:image|canonical'
curl -sI https://<your-domain>/album-che-non-esiste | head -1   # HTTP/2 404
```

Then paste an album link into a social preview inspector (for example LinkedIn Post Inspector) and confirm title and cover.
