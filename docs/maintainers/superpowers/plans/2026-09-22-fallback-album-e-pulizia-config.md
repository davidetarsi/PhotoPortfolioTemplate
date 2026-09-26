# Album fallback and configuration cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh clone render the seeded album cards without `.env` or R2 data, while preserving visible errors for malformed or unavailable runtime data and removing duplicate Turnstile configuration.

**Architecture:** Make the Vite development server return a real JSON `404` for unavailable `/api/data/*` routes, serve clean album slugs through `album.html`, and allow the build seed to omit its R2 public URL. Add one pure `resolveAlbums(albumsRes, buildAlbums)` policy beside the existing site-content resolver. Both public page entrypoints consume that policy before rendering; runtime R2 data remains authoritative whenever it exists, and only `NOT_FOUND` falls back to the normalized build seed. Keep S3 credentials limited to the optional CLI migration/upload path and keep the Turnstile sitekey sourced only from `wrangler.json` through `/api/data/config`.

**Tech Stack:** JavaScript ES modules, Vite 8, Vitest 4 with jsdom, Cloudflare Worker runtime, Cloudflare R2.

**Spec:** `docs/maintainers/superpowers/specs/2026-09-22-fallback-album-e-pulizia-config-design.md`

## Global Constraints

- `resolveSiteContent` keeps its current fallback on every failed site-content fetch.
- Album fallback happens only for `error === 'NOT_FOUND'`; `NETWORK`, `UNKNOWN`, and `MALFORMED` remain visible errors.
- Seed albums are copied and normalized with `coverName: album.coverName || null`; the imported seed must not be mutated.
- R2 remains the runtime source of truth; `config/` remains the initial seed.
- `npm run migrate` and `npm run upload` remain functional and keep their current behavior.
- `VITE_TURNSTILE_SITEKEY` is removed completely; the runtime sitekey comes only from `wrangler.json` via `/api/data/config`.
- `VITE_R2_PUBLIC_URL` remains an optional browser/meta fallback; its absence must not fail public-page bootstrap.
- In `vite serve` only, `/api/data/*` returns JSON `404` before Vite's SPA fallback can turn a missing API route into `200 text/html`, and clean album slugs internally serve `album.html` as the Worker already does in production.
- This plan does not modify Terraform, Cloudflare resources, or staging behavior.
- User-facing documentation remains bilingual: `README.md` in English and `README.it.md` in Italian.

## File Map

- `src/pages/home-logic.js`: owns the pure site and album fallback policies.
- `src/pages/home-logic.test.js`: covers the complete album-result matrix and seed normalization.
- `src/utils/devRouteFallback.js`: returns a deterministic `404` for runtime data routes and maps clean album slugs when only Vite is running locally.
- `src/utils/devRouteFallback.test.js`: locks the middleware scope, response, and clean-slug rewrite.
- `src/utils/validateConfig.js`: accepts a seed without an R2 public URL because runtime config normally owns that value.
- `src/utils/validateConfig.test.js`: protects the zero-configuration validation path.
- `vite.config.js`: installs the data-API fallback only in the development server.
- `src/pages/index.js`: resolves albums before choosing cards versus the existing error UI.
- `src/pages/index.test.js`: jsdom regression test for home cards on `NOT_FOUND` and error UI on `MALFORMED`.
- `src/pages/album.js`: resolves albums before calling `resolveAlbumPage`.
- `src/pages/album.test.js`: jsdom regression test that a seeded album becomes an empty album when both R2 files are absent.
- `config/site.config.js`: retains only local display seed values; no Turnstile sitekey.
- `.env.example`: retains the optional R2 CLI credentials and browser URL fallback.
- `scripts/upload.js`: exposes English errors consistently with the public template.
- `scripts/upload.test.js`: locks the two credential-error messages.
- `README.md`, `README.it.md`: document zero-config local preview and optional CLI credentials.

---

### Task 1: Add the pure album fallback policy

**Files:**
- Modify: `src/pages/home-logic.js:7-45`
- Modify: `src/pages/home-logic.test.js:1-37`

**Interfaces:**
- Consumes: `albumsRes: {ok: true, data: Album[]} | {ok: false, error: 'NOT_FOUND'|'NETWORK'|'UNKNOWN'|'MALFORMED'}` and `buildAlbums: Album[]`.
- Produces: `resolveAlbums(albumsRes, buildAlbums): Album[] | null`.
- `null` means “preserve the error UI”; an array means “render these albums”.

- [ ] **Step 1: Write the failing resolver tests**

Add `resolveAlbums` to the import and append this suite to `src/pages/home-logic.test.js`:

```js
import { resolveSiteContent, resolveAlbums, albumsToCards } from './home-logic.js';

describe('resolveAlbums', () => {
  const seed = [
    { slug: 'seed', title: 'Seed', description: '', coverName: '' },
  ];

  it('returns runtime albums unchanged when the fetch succeeds', () => {
    const runtime = [{ slug: 'live', title: 'Live', description: '', coverName: 'cover.webp' }];
    expect(resolveAlbums({ ok: true, data: runtime }, seed)).toBe(runtime);
  });

  it('falls back only on NOT_FOUND and normalizes an empty coverName to null', () => {
    expect(resolveAlbums({ ok: false, error: 'NOT_FOUND' }, seed)).toEqual([
      { slug: 'seed', title: 'Seed', description: '', coverName: null },
    ]);
    expect(seed[0].coverName).toBe('');
  });

  it.each(['NETWORK', 'UNKNOWN', 'MALFORMED'])(
    'returns null for %s so the caller keeps the error visible',
    error => {
      expect(resolveAlbums({ ok: false, error }, seed)).toBeNull();
    },
  );
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
npx vitest run src/pages/home-logic.test.js
```

Expected: FAIL because `resolveAlbums` is not exported.

- [ ] **Step 3: Implement the minimal resolver and update the policy comment**

In `src/pages/home-logic.js`, expand the asymmetric-fallback comment above `resolveSiteContent` and add the new function before `albumsToCards`:

```js
// Asymmetric fallback is deliberate: site identity falls back on every fetch
// failure so the page always has a frame; albums fall back only when R2 has no
// albums.json yet. Corrupt or unreachable runtime album data stays visible.
// Accepted risk: an accidentally emptied or misconfigured bucket also returns
// NOT_FOUND and therefore looks like a new installation using the seed.

/**
 * Resolves runtime albums or the normalized build seed for a new installation.
 * @param {{ok: boolean, data?: Array, error?: string}} albumsRes
 * @param {Array} buildAlbums
 * @returns {Array|null} Albums to render, or null when the fetch error must stay visible.
 */
export function resolveAlbums(albumsRes, buildAlbums) {
  if (albumsRes.ok) return albumsRes.data;
  if (albumsRes.error !== 'NOT_FOUND') return null;
  return buildAlbums.map(album => ({
    ...album,
    coverName: album.coverName || null,
  }));
}
```

- [ ] **Step 4: Run the focused tests and verify the green state**

Run:

```bash
npx vitest run src/pages/home-logic.test.js
```

Expected: all tests in `home-logic.test.js` PASS.

- [ ] **Step 5: Commit the policy**

```bash
git add src/pages/home-logic.js src/pages/home-logic.test.js
git commit -m "feat(content): fall back to seed albums on missing data"
```

---

### Task 2: Make the zero-configuration development path produce `NOT_FOUND`

**Files:**
- Create: `src/utils/devRouteFallback.js`
- Create: `src/utils/devRouteFallback.test.js`
- Modify: `src/utils/validateConfig.js:13-30`
- Modify: `src/utils/validateConfig.test.js:1-16`
- Modify: `vite.config.js:1-72`

**Interfaces:**
- Consumes: development-only requests for `/api/data/*` or one-segment album slugs.
- Produces: `404 application/json` so `fetchValidated` returns `{ok:false,error:'NOT_FOUND'}`, or an internal `/album.html` rewrite that preserves the clean browser URL used by `album.js`.
- Preserves: reserved static paths, other non-data routes, production Worker routing, build behavior, and the `MALFORMED` classification for an actual `200` response with invalid JSON.

- [ ] **Step 1: Write failing tests for optional build-time R2 configuration**

Split the combined rejection test in `src/utils/validateConfig.test.js` and add this case:

```js
it('accepts an omitted build-time R2 URL because runtime config owns it', () => {
  expect(() => validateSiteConfig({ ...ok, r2PublicUrl: undefined })).not.toThrow();
  expect(() => validateSiteConfig({ ...ok, r2PublicUrl: '' })).not.toThrow();
});

it('rejects an empty name, an unknown provider, and an invalid config object', () => {
  expect(() => validateSiteConfig({ ...ok, name: ' ' })).toThrow(/name/);
  expect(() => validateSiteConfig({ ...ok, provider: 'drive' })).toThrow(/provider/);
  expect(() => validateSiteConfig(null)).toThrow(/siteConfig/);
});
```

Remove the old expectation that an empty `r2PublicUrl` throws.

- [ ] **Step 2: Run the validator test and verify the red state**

Run:

```bash
npx vitest run src/utils/validateConfig.test.js
```

Expected: FAIL because the current validator requires `r2PublicUrl` for provider `r2`.

- [ ] **Step 3: Stop treating the runtime R2 URL as required build configuration**

Delete this block from `src/utils/validateConfig.js`:

```js
if (siteConfig.provider === 'r2' && !siteConfig.r2PublicUrl?.trim()) {
  throw new Error(
    '[validateSiteConfig] siteConfig.r2PublicUrl is required when provider is "r2". Check VITE_R2_PUBLIC_URL in .env file.'
  );
}
```

Keep validation for the config object, site name, and provider. Then rerun:

```bash
npx vitest run src/utils/validateConfig.test.js
```

Expected: PASS.

- [ ] **Step 4: Write the failing development-API middleware tests**

Create `src/utils/devRouteFallback.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { devRouteFallback } from './devRouteFallback.js';

function responseDouble() {
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

describe('devRouteFallback', () => {
  it('returns JSON 404 for runtime data API routes', () => {
    const response = responseDouble();
    const next = vi.fn();

    devRouteFallback({ url: '/api/data/albums?fresh=1' }, response, next);

    expect(response.statusCode).toBe(404);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
      error: 'Runtime data API is unavailable in the Vite development server',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rewrites a clean album slug to album.html and keeps the query string', () => {
    const request = { url: '/nome-album?preview=1' };
    const response = responseDouble();
    const next = vi.fn();

    devRouteFallback(request, response, next);

    expect(request.url).toBe('/album.html?preview=1');
    expect(next).toHaveBeenCalledOnce();
    expect(response.end).not.toHaveBeenCalled();
  });

  it.each(['/api/contact', '/assets/logo.svg', '/about', '/admin', '/contatti', '/'])(
    'passes through non-data route %s',
    url => {
      const response = responseDouble();
      const next = vi.fn();

      devRouteFallback({ url }, response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(response.end).not.toHaveBeenCalled();
    },
  );
});
```

Run:

```bash
npx vitest run src/utils/devRouteFallback.test.js
```

Expected: FAIL because `devRouteFallback.js` does not exist.

- [ ] **Step 5: Implement the narrow development-only fallback**

Create `src/utils/devRouteFallback.js`:

```js
/**
 * Makes Vite's local routing match the production Worker where the cold-start
 * preview depends on it: missing data APIs stay missing and clean album slugs
 * serve album.html instead of the SPA index.
 */
const ALBUM_SLUG_RE = /^\/[a-z0-9][a-z0-9-]*$/;
const RESERVED_PATHS = new Set(['/about', '/admin', '/contatti']);

export function devRouteFallback(request, response, next) {
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname.startsWith('/api/data/')) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      error: 'Runtime data API is unavailable in the Vite development server',
    }));
    return;
  }

  if (ALBUM_SLUG_RE.test(url.pathname) && !RESERVED_PATHS.has(url.pathname)) {
    request.url = `/album.html${url.search}`;
  }
  next();
}
```

Import it in `vite.config.js`:

```js
import { devRouteFallback } from './src/utils/devRouteFallback.js'
```

Add this plugin before `siteMetaPlugin`:

```js
const devRouteFallbackPlugin = () => ({
  name: 'dev-route-fallback',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(devRouteFallback)
  },
})
```

Register it first so it runs before Vite's HTML fallback:

```js
plugins: [devRouteFallbackPlugin(), siteMetaPlugin(), headersPlugin()],
```

- [ ] **Step 6: Verify the middleware and data-result boundary**

Run:

```bash
npx vitest run src/utils/devRouteFallback.test.js src/utils/validateConfig.test.js src/providers/data.test.js
```

Expected: all three files PASS. Do not change `fetchValidated`: a real `200` with malformed data must remain `MALFORMED`.

- [ ] **Step 7: Commit the cold-start prerequisites**

```bash
git add vite.config.js src/utils/devRouteFallback.js src/utils/devRouteFallback.test.js src/utils/validateConfig.js src/utils/validateConfig.test.js
git commit -m "fix(dev): expose missing runtime data as not found"
```

---

### Task 3: Wire the fallback into the home and album entrypoints

**Files:**
- Modify: `src/pages/index.js:1-37`
- Create: `src/pages/index.test.js`
- Modify: `src/pages/album.js:1-34`
- Create: `src/pages/album.test.js`

**Interfaces:**
- Consumes: `resolveAlbums` from Task 1 and `albums` from `config/albums.config.js`.
- Produces: home cards for `NOT_FOUND`; the existing `.page-error` for all other failures; an `{ok:true,data}` album result passed to `resolveAlbumPage` when the seed is selected.
- Preserves: the existing `resolveAlbumPage(slug, albumsRes, manifestRes)` signature.

- [ ] **Step 1: Add the failing home-page regression test**

Create `src/pages/index.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSite: vi.fn(),
  fetchAlbums: vi.fn(),
  fetchConfig: vi.fn(),
}));

vi.mock('../providers/data.js', () => mocks);
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../components/Nav.js', () => ({ renderNav: vi.fn() }));
vi.mock('../components/Footer.js', () => ({ renderFooter: vi.fn() }));
vi.mock('../components/Hero.js', () => ({ renderHero: vi.fn() }));
vi.mock('../components/AlbumCard.js', () => ({
  createAlbumCard(card) {
    const element = document.createElement('article');
    element.className = 'album-card';
    element.dataset.slug = card.slug;
    return element;
  },
}));

describe('home album bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <nav id="site-nav"></nav>
      <section id="hero"></section>
      <h2 id="albums-heading"></h2>
      <div id="album-cards"></div>
      <footer id="site-footer"></footer>
    `;
    mocks.fetchSite.mockResolvedValue({
      ok: true,
      data: { name: 'Runtime', bio: '', hero: null, social: {} },
    });
    mocks.fetchConfig.mockResolvedValue({
      ok: true,
      data: { r2PublicUrl: 'https://pub-test.r2.dev' },
    });
  });

  it('renders seed cards when albums.json is missing', async () => {
    mocks.fetchAlbums.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    await import('./index.js');
    expect(document.querySelector('[data-slug="nome-album"]')).not.toBeNull();
    expect(document.querySelector('.page-error')).toBeNull();
  });

  it('keeps malformed runtime data visible instead of hiding it behind the seed', async () => {
    mocks.fetchAlbums.mockResolvedValue({ ok: false, error: 'MALFORMED' });
    await import('./index.js');
    expect(document.querySelector('.album-card')).toBeNull();
    expect(document.querySelector('.page-error')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Add the failing single-album regression test**

Create `src/pages/album.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSite: vi.fn(),
  fetchAlbums: vi.fn(),
  fetchManifest: vi.fn(),
  fetchConfig: vi.fn(),
}));

vi.mock('../providers/data.js', () => mocks);
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../components/Nav.js', () => ({ renderNav: vi.fn() }));
vi.mock('../components/Footer.js', () => ({ renderFooter: vi.fn() }));
vi.mock('../components/PhotoGrid.js', () => ({ renderSkeletons: vi.fn(), renderGrid: vi.fn() }));
vi.mock('../components/Lightbox.js', () => ({ createLightbox: vi.fn() }));

describe('album bootstrap from the build seed', () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState({}, '', '/nome-album');
    document.body.innerHTML = `
      <nav id="site-nav"></nav>
      <h1 id="album-title"></h1>
      <div id="photo-grid"></div>
      <footer id="site-footer"></footer>
    `;
    mocks.fetchSite.mockResolvedValue({
      ok: true,
      data: { name: 'Runtime', bio: '', hero: null, social: {} },
    });
    mocks.fetchAlbums.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    mocks.fetchManifest.mockResolvedValue({ ok: false, error: 'NOT_FOUND' });
    mocks.fetchConfig.mockResolvedValue({
      ok: true,
      data: { r2PublicUrl: 'https://pub-test.r2.dev' },
    });
  });

  it('recognizes the seeded album and renders the empty-album state', async () => {
    await import('./album.js');
    expect(document.getElementById('album-title').textContent).toBe('Titolo Album');
    expect(document.querySelector('.photo-grid__error')).not.toBeNull();
    expect(document.querySelector('#photo-grid a[href="/"]')).toBeNull();
  });
});
```

- [ ] **Step 3: Run both page tests and verify the red state**

Run:

```bash
npx vitest run src/pages/index.test.js src/pages/album.test.js
```

Expected: the home test renders `.page-error`, and the album test renders the not-found state because neither entrypoint imports the seed yet.

- [ ] **Step 4: Resolve albums once in `index.js`**

Add the seed import, add `resolveAlbums` to the logic import, and replace the current `albumsRes.ok` branch:

```js
import { albums as buildAlbums } from '../../config/albums.config.js';
import { resolveSiteContent, resolveAlbums, albumsToCards } from './home-logic.js';

const resolvedAlbums = resolveAlbums(albumsRes, buildAlbums);
cardsEl.innerHTML = '';
if (resolvedAlbums === null) {
  const p = document.createElement('p');
  p.className = 'page-error';
  p.textContent = albumsRes.error === 'NETWORK'
    ? texts.album.error.network
    : texts.album.error.unknown;
  cardsEl.appendChild(p);
} else {
  albumsToCards(resolvedAlbums, r2PublicUrl)
    .forEach(card => cardsEl.appendChild(createAlbumCard(card)));
}
```

- [ ] **Step 5: Resolve albums upstream of `resolveAlbumPage` in `album.js`**

Add the same seed import and `resolveAlbums` import, then replace the current call at line 34:

```js
import { albums as buildAlbums } from '../../config/albums.config.js';
import { resolveSiteContent, resolveAlbums } from './home-logic.js';

const resolvedAlbums = resolveAlbums(albumsRes, buildAlbums);
const albumsForPage = resolvedAlbums === null
  ? albumsRes
  : { ok: true, data: resolvedAlbums };
const page = resolveAlbumPage(slug, albumsForPage, manifestRes);
```

Do not add fallback logic to `resolveAlbumPage`: the policy must remain centralized in `resolveAlbums`.

- [ ] **Step 6: Run page and logic tests**

Run:

```bash
npx vitest run src/pages/home-logic.test.js src/pages/index.test.js src/pages/album.test.js src/pages/album-logic.test.js
```

Expected: all four files PASS; the `MALFORMED` home test still renders an error.

- [ ] **Step 7: Commit the page integration**

```bash
git add src/pages/index.js src/pages/index.test.js src/pages/album.js src/pages/album.test.js
git commit -m "feat(content): render seed albums before migration"
```

---

### Task 4: Remove duplicate Turnstile configuration and translate CLI errors

**Files:**
- Modify: `.env.example:1-6`
- Modify: `config/site.config.js:14-18`
- Modify: `scripts/upload.js:23-28,56-59`
- Modify: `scripts/upload.test.js:31-65`

**Interfaces:**
- Preserves: `/api/data/config` as the only runtime source of `turnstileSitekey`.
- Preserves: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` for the optional CLI tools.
- Produces: English errors from `uploadAlbum` when CLI credentials are incomplete.

- [ ] **Step 1: Add failing upload credential tests**

Append inside `describe('uploadAlbum', ...)` in `scripts/upload.test.js`:

```js
  it('reports a missing bucket in English', async () => {
    delete process.env.R2_BUCKET_NAME;
    await expect(uploadAlbum('sport-album', '/fake/dir'))
      .rejects.toThrow('R2_BUCKET_NAME is missing from .env');
  });

  it('reports missing R2 credentials in English', async () => {
    delete process.env.R2_SECRET_ACCESS_KEY;
    await expect(uploadAlbum('sport-album', '/fake/dir'))
      .rejects.toThrow('Missing R2 credentials in .env');
  });
```

- [ ] **Step 2: Run the upload test and verify the red state**

Run:

```bash
npx vitest run scripts/upload.test.js
```

Expected: both new expectations FAIL because the messages are still Italian.

- [ ] **Step 3: Translate the two errors**

Use these exact messages in `scripts/upload.js`:

```js
throw new Error(
  'Missing R2 credentials in .env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required.'
);
```

```js
if (!bucket) throw new Error('R2_BUCKET_NAME is missing from .env');
```

- [ ] **Step 4: Remove the duplicate sitekey configuration**

Delete this line from `.env.example`:

```dotenv
VITE_TURNSTILE_SITEKEY=""
```

Delete this property from `config/site.config.js`:

```js
turnstileSitekey: import.meta.env?.VITE_TURNSTILE_SITEKEY ?? '',
```

Do not modify `src/pages/about.js`: its existing `configRes.ok ? ... : siteConfig.turnstileSitekey` expression correctly yields `undefined` locally, which means no widget when the Worker endpoint is unavailable.

- [ ] **Step 5: Verify tests and the single-source invariant**

Run:

```bash
npx vitest run scripts/upload.test.js src/components/ContactForm.test.js src/worker/data-routes.test.js
rg -n "VITE_TURNSTILE_SITEKEY" . --glob '!docs/maintainers/superpowers/specs/**' --glob '!docs/maintainers/superpowers/plans/**'
```

Expected: all tests PASS and `rg` exits with no matches.

- [ ] **Step 6: Commit the configuration cleanup**

```bash
git add .env.example config/site.config.js scripts/upload.js scripts/upload.test.js
git commit -m "refactor(config): keep Turnstile sitekey in Wrangler only"
```

---

### Task 5: Rewrite the setup path around an immediate local preview

**Files:**
- Modify: `README.md:110-202,238-250`
- Modify: `README.it.md:112-204,240-252`

**Interfaces:**
- Documents: `npm install && npm run dev` as the complete local quick start.
- Documents: `.env` as optional and required only by `npm run migrate` and `npm run upload`.
- Documents: a missing `albums.json` shows seeded album cards, while opening one shows an empty album until photos are uploaded.

- [ ] **Step 1: Simplify both quick-start blocks**

The English quick start becomes:

```bash
node --version   # requires v20+
npm install
npm run dev      # → http://localhost:5173/
ALLOW_PLACEHOLDER_CSP=1 npm run build
npm test
```

The Italian block uses the same commands and keeps its Italian comments. Remove `cp .env.example .env` and the credential-filling comment from both blocks.

- [ ] **Step 2: Mark local environment variables as optional**

Rename section 3 in each README to “Optional local CLI credentials” / “Credenziali locali facoltative per la CLI”. State explicitly:

- the browser preview does not need `.env`;
- `npm run migrate` and `npm run upload` need the four R2 variables;
- `VITE_R2_PUBLIC_URL` is optional for browser fallback/meta preview and is not an S3 credential;
- no Turnstile sitekey belongs in `.env`.

Keep the existing warning that credentials must never enter Git.

- [ ] **Step 3: Reframe migration as dashboard bootstrap**

In section 4, state that the seed is already visible locally. Explain that `npm run migrate` copies `site.config.js` and `albums.config.js` to R2 so `/admin` has runtime data to edit. Preserve the existing overwrite warning verbatim.

Add this behavior note in both languages:

> Before migration, the home page can render album cards from the build seed. Opening one shows an empty album because photo manifests and image files exist only in R2.

- [ ] **Step 4: Document `npm run upload` beside `compress`**

Add an architecture/tooling-table row explaining that:

```text
npm run upload -- --album <slug> --input <optimized-directory>
```

uploads a prepared directory and its `manifest.json` directly to R2, and requires the optional `.env` credentials. Do not present it as the normal dashboard workflow.

- [ ] **Step 5: Run documentation and full-project verification**

Run:

```bash
rg -n "VITE_TURNSTILE_SITEKEY" . --glob '!docs/maintainers/superpowers/specs/**' --glob '!docs/maintainers/superpowers/plans/**'
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build
git diff --check
```

Expected: no live-code/documentation references to `VITE_TURNSTILE_SITEKEY`, the full test suite passes, the build succeeds, and `git diff --check` is clean.

- [ ] **Step 6: Verify the cold local path manually**

In the isolated implementation worktree, confirm `.env` is absent:

```bash
test ! -e .env
npm run dev
```

Open `http://localhost:5173/`. Expected: the home shows the `nome-album` seed card; opening `/nome-album` shows the empty-album message, not the unknown-album page. Stop the dev server after the check.

- [ ] **Step 7: Commit the setup documentation**

```bash
git add README.md README.it.md
git commit -m "docs: make local preview work before R2 migration"
```

---

## Final Review Gate

- [ ] Every §2 decision in the spec maps to one completed task.
- [ ] `NOT_FOUND` is the only album fallback trigger.
- [ ] The fallback normalizes `coverName: ''` without mutating the seed.
- [ ] Both public entrypoints use the single resolver.
- [ ] `MALFORMED` remains visible in an integration-level home test.
- [ ] Missing `/api/data/*` routes return JSON `404` in Vite development only, and `/nome-album` serves `album.html`; production routing is untouched.
- [ ] `validateSiteConfig` accepts an omitted `r2PublicUrl`, while still rejecting invalid identity/provider configuration.
- [ ] `.env` is optional for local preview and contains no Turnstile sitekey.
- [ ] `migrate` and `upload` remain present and documented.
- [ ] Full tests, placeholder build, cold local preview, and `git diff --check` pass.
