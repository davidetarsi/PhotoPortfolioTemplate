# F3 — Custom pages (single and collections) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every code step contains the complete code: copy it, do not redesign it. If a step's expected output does not match, stop and report instead of improvising.

**Goal:** Let a fork add its own pages from `custom/pages.config.js`: single pages (`/archive`) and collections generated at build from content in the repo (`/projects/:slug` → one static HTML per entry, with its own title, description and preview image). No Worker change for these pages, correct routing in dev, and the dashboard refuses album slugs that a page would shadow.

**Architecture:** One exported list of template routes (`TEMPLATE_ROUTES` in `src/shared/content-rules.js`) feeds the Worker, the Vite dev server, the dashboard and the page validator. `vite.config.js` loads `custom/pages.config.js` when it exists, validates it with a pure function and adds each page's HTML as a build input. A Vite plugin moves built pages to their public path and expands collections into one file per entry, filling `{{PAGE_*}}` placeholders; it also serves `virtual:custom-pages` with the first path segments the pages take. In production the pages are plain static files, so Workers Static Assets serves them before the Worker runs.

**Tech Stack:** Vite 8 (Rolldown `generateBundle` with `order: 'post'`, `emitFile`, virtual modules, `transformIndexHtml`), Node `fs`/`url`, Vitest 4 (jsdom), Wrangler 4 (local verification only), Playwright/Chromium already installed in `/srv/claude/workspaces/f2-fixtures/browser/` (verification only).

**Spec:** `docs/maintainers/superpowers/specs/2026-09-25-punti-di-aggancio-design.md` §2.5 and §6 ("F3: decisions approved on 2026-09-26"). This plan replaces `docs/maintainers/superpowers/plans/2026-09-25-f3-pagine-del-sito.md`.

**Base:** `main` at `e4ad944` (F2 merged, PR #20). Work on a new branch `feat/f3-custom-pages`. Never commit on `main`.

## Execution

Approved by the user on 2026-09-26: one Haiku 4.5 implementer per task, given that task, this plan's Global Constraints and its Decisions; the maintainer (Opus) reviews each task's diff and test output before the next one starts, and checks Task 10's results independently. No nested agents.

## Decisions approved on 2026-09-26

1. **Reserved slugs block only new names.** `RESERVED_SLUGS` is checked when the dashboard creates an album and when `custom/pages.config.js` declares a page. It is **not** checked when reading `albums.json` (site and Worker), when saving it, or in the photo/manifest/delete routes: an album that already has a reserved slug keeps working in the dashboard, and on the public site the template route wins (the residual case of spec §3).
2. **English names with the `custom` prefix:** `custom/pages.config.js`, `custom/pages/`, `virtual:custom-pages`, `src/utils/customPages.js`, `src/utils/customPagesPlugin.js`, guide `docs/pages.md`, examples `/archive` and `/projects/:slug` with `custom/content/projects.json`.
3. **`/contatti` is removed.** The Worker no longer redirects it; it becomes an ordinary album path (404 "album not found" unless an album with that slug exists). `contatti` is not reserved. No `/contacts`.

## Facts verified before writing this plan (2026-09-26)

- Vite 8 build: an HTML input at `custom/pages/archive.html` appears in the bundle as the asset `custom/pages/archive.html`, with `{{SITE_*}}` already injected. Deleting it and calling `this.emitFile({ type: 'asset', fileName: 'archive.html', source })` in `generateBundle` with `order: 'post'` produces `dist/archive.html` with working `/assets/…` links.
- `wrangler dev` 4.107 with the default `html_handling`: `/archive` → 200 from `dist/archive.html`; `/projects/foo` → 200 from `dist/projects/foo.html`; trailing slash and `.html` → 307 to the clean path; the bare prefix `/projects` reaches the Worker's album branch.
- The custom theme plugin of F2 (`src/utils/customTheme.js`) links the theme only on `index.html`, `album.html`, `about.html`: custom pages need to be added explicitly (Task 6).
- `vi.mock('virtual:custom-pages', …)` works in Vitest on a module resolved by a plugin; without the mock the plugin's value is used.
- `src/shared/html.js` (`escapeHtml`) already exists (F4). The old plan's "Task 1: shared HTML escaping" is not needed.
- `validateAlbumsShape` is used for reading (`src/providers/data.js`, `src/worker/album-page.js`) and writing (`PUT /api/admin/albums`): adding slugs to its reserved check would reject a fork's whole album list. Hence decision 1.

## Global Constraints

- Without `custom/pages.config.js`, `dist/` contains the same files as before this plan (hash-normalized comparison in Task 6).
- Page paths: one or two lowercase segments matching `SLUG_RE` (`/^[a-z0-9][a-z0-9-]*$/`); a collection is exactly `/<prefix>/:slug`.
- A page may not use `/` or a path whose first segment is in `RESERVED_SLUGS` (`about`, `admin`, `album`, `api`, `assets`, `index`), nor a path declared twice.
- Page HTML lives under `custom/pages/`, ends in `.html`, and goes through `injectSiteMeta` like every page. `{{PAGE_*}}` placeholders are filled only for collection entries.
- Collection output: `dist/<prefix>/<slug>.html`. The bare prefix `/<prefix>` is not a page unless declared as a single page.
- No inline scripts or styles in pages (CSP unchanged); scripts are `<script type="module" src>` entries bundled by Vite.
- Code in `custom/` imports only from `/src/api/` (`/src/api/index.js` and the new `/src/api/base.css`).
- The Worker changes only for decisions 1 and 3; it does not learn about custom pages.
- Tests: `npm test` green after every task. Commit only the files a task names, with `git add <paths>`; never `git add -A`. Never commit `custom/`, `wrangler.json` or `.superpowers/`.
- Scratch and fixture files go under `/srv/claude/workspaces/f3-probes/`, never `/tmp` and never outside `/srv/claude/workspaces/`.
- No push, merge, deploy or `wrangler deploy`. `wrangler dev` locally is allowed.
- If `npm` adds only a `"license"` line to `package-lock.json`, do not commit it.

## File Map

- `src/shared/content-rules.js` (+ test): `TEMPLATE_ROUTES`, derived `RESERVED_SLUGS`; `validateAlbumsShape` without reserved check.
- `src/worker.js` (+ test), `src/worker/admin-routes.js` (+ test): read `TEMPLATE_ROUTES`; drop `/contatti` and reserved guards.
- `src/utils/devRouteFallback.js` (+ test): derived reserved paths; factory `createDevRouteFallback({ customPages })`.
- `src/utils/customPages.js` (+ test): `validateCustomPages`, `customPageInputs`, `expandCollection`, `reservedSlugsOf`.
- `src/utils/injectSiteMeta.js`: export `stripEmptyMeta`. `src/utils/injectPageMeta.js` (+ test).
- `src/utils/customPagesPlugin.js` (+ unit test, + build test).
- `src/utils/customTheme.js` (+ test): `publicPages` option.
- `vite.config.js`: load/validate config, inputs, plugins.
- `src/admin/album-creation.js` (+ test): refuse slugs taken by pages.
- `src/utils/slugFromPath.js` (+ test), `src/api/index.js` (+ test), `src/api/base.css`.
- `custom.example/pages.config.js`, `custom.example/pages/archive.html|js`, `custom.example/pages/project.html|js`, `custom.example/content/projects.json`.
- Docs: `docs/pages.md` (new), `docs/slots.md`, `docs/upgrading.md`, `CUSTOMIZING.md`, `custom.example/README.md`, `docs/maintainers/azioni-manuali.md`.

---

### Task 1: One list of template routes, reservations only for new names, `/contatti` removed

**Files:**
- Modify: `src/shared/content-rules.js`, `src/shared/content-rules.test.js`
- Modify: `src/worker.js`, `src/worker.test.js`
- Modify: `src/worker/admin-routes.js`, `src/worker/admin-routes.test.js`
- Modify: `src/utils/devRouteFallback.js`, `src/utils/devRouteFallback.test.js`
- Modify: `src/admin/album-creation.test.js`
- Modify: `docs/upgrading.md`, `CUSTOMIZING.md`, `docs/maintainers/azioni-manuali.md`

**Interfaces:**
- Produces: `TEMPLATE_ROUTES = { pages: { '/about': '/about.html', '/admin': '/admin.html' }, builtFiles: ['/album', '/index'], prefixes: ['/api', '/assets'] }` (frozen); `RESERVED_SLUGS = ['about', 'admin', 'album', 'api', 'assets', 'index']` (frozen, sorted, derived).

- [ ] **Step 1: Update the rules tests.** In `src/shared/content-rules.test.js`, add `TEMPLATE_ROUTES` to the existing import from `./content-rules.js`, then replace the test `'RESERVED_SLUGS contiene le rotte del sito'` with:

```js
  it('RESERVED_SLUGS deriva dai primi segmenti di TEMPLATE_ROUTES', () => {
    expect(RESERVED_SLUGS).toEqual(['about', 'admin', 'album', 'api', 'assets', 'index']);
    expect(TEMPLATE_ROUTES.pages).toEqual({ '/about': '/about.html', '/admin': '/admin.html' });
  });
```

and replace the test `'rifiuta slug riservati, duplicati, title vuoto, coverName invalido'` with these two:

```js
  it('accetta uno slug riservato: sul sito vince la rotta del template, la lista resta valida', () => {
    expect(validateAlbumsShape({ albums: [{ ...album, slug: 'admin' }, { ...album, slug: 'index' }] }).ok).toBe(true);
  });
  it('rifiuta duplicati, title vuoto, coverName invalido', () => {
    expect(validateAlbumsShape({ albums: [album, album] }).ok).toBe(false);
    expect(validateAlbumsShape({ albums: [{ ...album, title: '' }] }).ok).toBe(false);
    expect(validateAlbumsShape({ albums: [{ ...album, coverName: 'a.jpg' }] }).ok).toBe(false);
    expect(validateAlbumsShape({}).ok).toBe(false);
    expect(validateAlbumsShape({ albums: 'no' }).ok).toBe(false);
  });
```

- [ ] **Step 2: Update the Worker router tests.** In `src/worker.test.js`, add `import { TEMPLATE_ROUTES } from './shared/content-rules.js';` after the existing imports, then replace the two tests `'/contatti reindirizza a /about, in modo permanente'` and `'reindirizza anche /contatti con la barra finale'` with:

```js
  it('/contatti non è più un alias: arriva al ramo album come ogni slug', async () => {
    const res = await get('/contatti');
    expect(res.headers.get('Location')).toBeNull();
    expect(await res.text()).toBe('ASSET:/album.html');
  });

  it.each(Object.entries(TEMPLATE_ROUTES.pages))('%s serve %s', async (path, file) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`ASSET:${file}`);
  });
```

- [ ] **Step 3: Update the admin route tests.** In `src/worker/admin-routes.test.js` make these four replacements (decision 1: the Worker no longer refuses reserved slugs).

Replace the test `'salva albums.json valido; 400 su slug riservato'` with:

```js
  it('salva albums.json valido, anche con uno slug riservato scritto a mano', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/albums', ALBUMS)).status).toBe(200);
    expect(JSON.parse(env.BUCKET.store.get('_data/albums.json').text)).toEqual(ALBUMS);
    const reserved = { albums: [{ slug: 'admin', title: 'X', description: '', coverName: null }] };
    expect((await call(env, 'PUT', '/api/admin/albums', reserved)).status).toBe(200);
  });
```

Replace the manifest test `'404 su slug riservato (es. "admin") anche se passa SLUG_RE'` with:

```js
  it('salva il manifest anche per un album con slug riservato', async () => {
    const env = makeEnv();
    const manifest = [{ name: 'a.webp', width: 10, height: 20 }];
    expect((await call(env, 'PUT', '/api/admin/albums/admin/manifest', manifest)).status).toBe(200);
  });
```

Replace the photo test `'400 su slug riservato (es. "admin") anche se passa SLUG_RE'` with:

```js
  it('carica una foto anche in un album con slug riservato', async () => {
    const env = makeEnv();
    expect((await put(env, '/api/admin/albums/admin/photos/a.webp', new Uint8Array([1]))).status).toBe(200);
  });
```

Replace the album delete test `'404 su slug riservato (es. "admin") anche se passa SLUG_RE — nessuna scrittura tentata'` with:

```js
  it('elimina anche un album con slug riservato', async () => {
    const env = makeEnv({ 'admin/a.webp': 'BIN' });
    expect((await call(env, 'DELETE', '/api/admin/albums/admin')).status).toBe(200);
    expect(env.BUCKET.store.has('admin/a.webp')).toBe(false);
  });
```

- [ ] **Step 4: Update the dev fallback and dashboard tests.** In `src/utils/devRouteFallback.test.js`, in the `it.each([...])` list of `'passes through non-data route %s'`, replace `'/contatti'` with `'/album', '/index'`, and add this test inside the `describe`:

```js
  it('treats /contatti as an ordinary album slug', () => {
    const request = { url: '/contatti' };
    devRouteFallback(request, responseDouble(), vi.fn());
    expect(request.url).toBe('/album.html');
  });
```

In `src/admin/album-creation.test.js`, add inside `describe('createAlbum', …)`:

```js
  it('slug di un file del template (album, index) → ok:false con messaggio dedicato', async () => {
    const ctx = makeCtx();
    expect(await createAlbum('Album', ctx)).toEqual({ ok: false, error: formatText(texts.admin.albums.titleReserved, { slug: 'album' }) });
    expect(await createAlbum('Index', ctx)).toEqual({ ok: false, error: formatText(texts.admin.albums.titleReserved, { slug: 'index' }) });
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });
```

- [ ] **Step 5: Run the tests and verify they fail.**

Run: `npm test -- src/shared/content-rules.test.js src/worker.test.js src/worker/admin-routes.test.js src/utils/devRouteFallback.test.js src/admin/album-creation.test.js`
Expected: FAIL — `TEMPLATE_ROUTES` is undefined, `/contatti` still answers 301, reserved slugs still refused, `album`/`index` accepted.

- [ ] **Step 6: Implement the rules.** In `src/shared/content-rules.js` replace the line `export const RESERVED_SLUGS = ['admin', 'api', 'assets', 'about'];` with:

```js
/**
 * Paths the template answers before the Worker's album branch: the one list that routing
 * (Worker, Vite dev server) and reservations (dashboard, custom pages) derive from.
 */
export const TEMPLATE_ROUTES = Object.freeze({
  // Served by the Worker from a static file with another name.
  pages: Object.freeze({ '/about': '/about.html', '/admin': '/admin.html' }),
  // Built files that Workers Static Assets serves before the Worker runs:
  // /album is album.html itself, /index answers 307 → /.
  builtFiles: Object.freeze(['/album', '/index']),
  // Worker API routes and Vite build output.
  prefixes: Object.freeze(['/api', '/assets']),
});

/**
 * First path segments taken by the template. Refused for NEW names only: the dashboard
 * when it creates an album, and custom/pages.config.js. Not checked when reading or
 * saving albums.json: an existing album with one of these slugs keeps working in the
 * dashboard, and on the public site the template route wins.
 */
export const RESERVED_SLUGS = Object.freeze([
  ...Object.keys(TEMPLATE_ROUTES.pages),
  ...TEMPLATE_ROUTES.builtFiles,
  ...TEMPLATE_ROUTES.prefixes,
].map(path => path.split('/')[1]).sort());
```

In `validateAlbumsShape`, delete the line `if (RESERVED_SLUGS.includes(a.slug)) return fail(\`reserved slug: "${a.slug}"\`);` and change its doc comment line `Ensures slugs are unique, reserved names are not used, and all required fields are present.` to `Ensures slugs are valid and unique and all required fields are present. Reserved slugs are not checked here: see RESERVED_SLUGS.`

- [ ] **Step 7: Implement the Worker changes.** In `src/worker.js`:
  - add `import { TEMPLATE_ROUTES } from './shared/content-rules.js'` after the existing imports;
  - delete the `const STATIC_PAGES = { … }` block;
  - delete the `/contatti` block (the two comment lines and the `if (pathname === '/contatti') { … }`);
  - replace `if (STATIC_PAGES[pathname]) {` and the line after it with:

```js
    const page = TEMPLATE_ROUTES.pages[pathname]
    if (page) {
      return env.ASSETS.fetch(new URL(page, url))
```

In `src/worker/admin-routes.js`:
  - remove `RESERVED_SLUGS, ` from the import list;
  - `if (!SLUG_RE.test(slug) || RESERVED_SLUGS.includes(slug)) return jsonResponse({ error: 'NOT_FOUND' }, 404);` becomes `if (!SLUG_RE.test(slug)) return jsonResponse({ error: 'NOT_FOUND' }, 404);`
  - `if (!SLUG_RE.test(slug) || RESERVED_SLUGS.includes(slug) || !PHOTO_NAME_RE.test(name)) {` becomes `if (!SLUG_RE.test(slug) || !PHOTO_NAME_RE.test(name)) {`
  - delete the line `if (RESERVED_SLUGS.includes(slug)) return jsonResponse({ error: 'NOT_FOUND' }, 404);` in the album delete branch.

In `src/utils/devRouteFallback.js`:
  - add `import { RESERVED_SLUGS } from '../shared/content-rules.js';` at the top (after the doc comment);
  - replace `const RESERVED_PATHS = new Set(['/about', '/admin', '/contatti']);` with `const RESERVED_PATHS = new Set(RESERVED_SLUGS.map(slug => \`/${slug}\`));`

- [ ] **Step 8: Run the tests and verify they pass.**

Run: `npm test`
Expected: PASS, every file. If another test still expects the old `RESERVED_SLUGS` order, a 301 on `/contatti` or a refused reserved slug, update only that assertion to the new behavior and name it in the commit message.

- [ ] **Step 9: Documentation.**

In `docs/upgrading.md`, directly under the paragraph that ends with `No such change so far.` add:

```markdown
### F3 (2026-09-26): routes and reserved slugs

- `/contatti` no longer redirects to `/about`. Old links to `/contatti` now reach the album page and answer "album not found", unless you have an album with that slug.
- The dashboard refuses new albums named `album` or `index`, as it already did for `about`, `admin`, `api` and `assets`. Albums that already have one of these slugs are not touched: they stay in the list and in the dashboard, and on the public site the template page answers at that address.
- The Worker no longer refuses reserved slugs when albums are saved or photos are uploaded. The dashboard is where new names are checked.
```

In `CUSTOMIZING.md`, replace `(\`index.html\`, \`album.html\`, \`contatti.html\`, \`admin.html\`)` with `(\`index.html\`, \`album.html\`, \`about.html\`, \`admin.html\`)`.

In `docs/maintainers/azioni-manuali.md`, directly under the line that starts with `- **URL pubblico \`/about\`** (21 settembre 2026).` and its continuation lines, add:

```markdown
- **`/contatti` rimosso** (26 settembre 2026, F3). Il redirect 301 verso `/about` non c'è più: `/contatti` è un indirizzo di album come gli altri.
```

- [ ] **Step 10: Commit.**

```bash
git add src/shared/content-rules.js src/shared/content-rules.test.js src/worker.js src/worker.test.js src/worker/admin-routes.js src/worker/admin-routes.test.js src/utils/devRouteFallback.js src/utils/devRouteFallback.test.js src/admin/album-creation.test.js docs/upgrading.md CUSTOMIZING.md docs/maintainers/azioni-manuali.md
git commit -m "feat(routes): one list of template routes, reserve only new names, drop /contatti"
```

---

### Task 2: Custom page configuration, pure

**Files:**
- Create: `src/utils/customPages.js`, `src/utils/customPages.test.js`

**Interfaces:**
- Consumes: `SLUG_RE`, `RESERVED_SLUGS` from `src/shared/content-rules.js` (Task 1).
- Produces:
  - `validateCustomPages(pages, { fileExists }) → NormalizedPage[]`; throws `Error` whose message starts with `custom/pages.config.js:`.
  - `NormalizedPage` single: `{ kind: 'single', path, html, name, outFile }`; collection: `{ kind: 'collection', path, html, name, prefix, entries }`.
  - `customPageInputs(pages, resolvePath) → { ['page-' + name]: string }`.
  - `expandCollection(page, entries) → Array<{ outFile, url, meta }>` with `meta = { PAGE_TITLE, PAGE_DESCRIPTION, PAGE_IMAGE, PAGE_URL, PAGE_SLUG }`.
  - `reservedSlugsOf(pages) → string[]` (unique first segments, in declaration order).

- [ ] **Step 1: Write the failing tests** in `src/utils/customPages.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { customPageInputs, expandCollection, reservedSlugsOf, validateCustomPages } from './customPages.js';

const exists = () => true;
const validate = pages => validateCustomPages(pages, { fileExists: exists });

describe('validateCustomPages', () => {
  it('normalizes a single page, a two-segment single page and a collection', () => {
    expect(validate([
      { path: '/archive', html: 'custom/pages/archive.html' },
      { path: '/projects', html: 'custom/pages/projects.html' },
      { path: '/projects/:slug', html: 'custom/pages/project.html', entries: [] },
      { path: '/info/credits', html: 'custom/pages/credits.html' },
    ])).toEqual([
      { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' },
      { kind: 'single', path: '/projects', html: 'custom/pages/projects.html', name: 'projects', outFile: 'projects.html' },
      { kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries: [] },
      { kind: 'single', path: '/info/credits', html: 'custom/pages/credits.html', name: 'info-credits', outFile: 'info/credits.html' },
    ]);
  });

  it('accepts entries given as a function', () => {
    const entries = () => [];
    expect(validate([{ path: '/p/:slug', html: 'custom/pages/p.html', entries }])[0].entries).toBe(entries);
  });

  it.each([
    ['/', /"\/" is the home page/],
    ['/about', /template uses/],
    ['/admin/x', /template uses/],
    ['/album', /template uses/],
    ['/index', /template uses/],
    ['/api', /template uses/],
    ['/assets/x', /template uses/],
    ['archive', /must start with/],
    ['/Archive', /lowercase letters/],
    ['/a/b/c', /one or two segments/],
    ['/:slug', /":slug" must be the second of two segments/],
    ['/:slug/x', /":slug" must be the second of two segments/],
    ['/archive/', /lowercase letters/],
  ])('rejects path %s', (path, message) => {
    expect(() => validate([{ path, html: 'custom/pages/x.html' }])).toThrow(message);
  });

  it('prefixes every message with the config file name', () => {
    expect(() => validate([{ path: '/', html: 'custom/pages/x.html' }])).toThrow(/^custom\/pages\.config\.js: /);
  });

  it('rejects a config that is not an array', () => {
    expect(() => validate({ path: '/x' })).toThrow(/export default` an array/);
  });

  it.each(['index.html', 'custom/pages/x.htm', 'custom/pages/../../index.html', 'custom/x.html'])(
    'rejects html %s', html => {
      expect(() => validate([{ path: '/x', html }])).toThrow(/custom\/pages\//);
    },
  );

  it('rejects a missing html file, naming it', () => {
    expect(() => validateCustomPages([{ path: '/x', html: 'custom/pages/x.html' }], { fileExists: () => false }))
      .toThrow(/custom\/pages\/x\.html/);
  });

  it('rejects a path declared twice', () => {
    expect(() => validate([
      { path: '/x', html: 'custom/pages/x.html' },
      { path: '/x', html: 'custom/pages/y.html' },
    ])).toThrow(/"\/x" is declared twice/);
  });

  it('rejects an html file used by two pages', () => {
    expect(() => validate([
      { path: '/x', html: 'custom/pages/x.html' },
      { path: '/y', html: 'custom/pages/x.html' },
    ])).toThrow(/used by two pages/);
  });

  it('rejects a collection without entries and a single page with entries', () => {
    expect(() => validate([{ path: '/c/:slug', html: 'custom/pages/c.html' }])).toThrow(/is a collection: add entries/);
    expect(() => validate([{ path: '/c', html: 'custom/pages/c.html', entries: [] }])).toThrow(/only collections take entries/);
  });

  it('rejects a two-segment single page under a collection prefix', () => {
    expect(() => validate([
      { path: '/projects/:slug', html: 'custom/pages/project.html', entries: [] },
      { path: '/projects/about-us', html: 'custom/pages/about-us.html' },
    ])).toThrow(/collides with the collection/);
  });
});

describe('expandCollection', () => {
  const page = { kind: 'collection', path: '/projects/:slug', prefix: 'projects' };

  it('produces one output per entry with its meta', () => {
    expect(expandCollection(page, [
      { slug: 'sea-sentinels', title: 'Sea Sentinels', description: 'App', image: 'https://x/y.webp' },
      { slug: 'bare', title: 'Bare' },
    ])).toEqual([
      {
        outFile: 'projects/sea-sentinels.html',
        url: '/projects/sea-sentinels',
        meta: { PAGE_TITLE: 'Sea Sentinels', PAGE_DESCRIPTION: 'App', PAGE_IMAGE: 'https://x/y.webp', PAGE_URL: '/projects/sea-sentinels', PAGE_SLUG: 'sea-sentinels' },
      },
      {
        outFile: 'projects/bare.html',
        url: '/projects/bare',
        meta: { PAGE_TITLE: 'Bare', PAGE_DESCRIPTION: '', PAGE_IMAGE: '', PAGE_URL: '/projects/bare', PAGE_SLUG: 'bare' },
      },
    ]);
  });

  it('rejects entries that are not an array', () => {
    expect(() => expandCollection(page, { slug: 'a' })).toThrow(/must be an array/);
  });

  it('rejects invalid or duplicate slugs and a missing title', () => {
    expect(() => expandCollection(page, [{ slug: 'Bad Slug', title: 'x' }])).toThrow(/slug "Bad Slug"/);
    expect(() => expandCollection(page, [{ slug: 'a', title: 'x' }, { slug: 'a', title: 'y' }])).toThrow(/"a" is declared twice/);
    expect(() => expandCollection(page, [{ slug: 'a', title: ' ' }])).toThrow(/needs a title/);
  });
});

describe('reservedSlugsOf / customPageInputs', () => {
  const pages = [
    { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' },
    { kind: 'single', path: '/projects', html: 'custom/pages/projects.html', name: 'projects', outFile: 'projects.html' },
    { kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries: [] },
  ];

  it('reserves unique first segments', () => {
    expect(reservedSlugsOf(pages)).toEqual(['archive', 'projects']);
  });

  it('maps each page to a build input', () => {
    expect(customPageInputs(pages, p => `/abs/${p}`)).toEqual({
      'page-archive': '/abs/custom/pages/archive.html',
      'page-projects': '/abs/custom/pages/projects.html',
      'page-projects-collection': '/abs/custom/pages/project.html',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/utils/customPages.test.js`
Expected: FAIL — cannot resolve `./customPages.js`.

- [ ] **Step 3: Implement** `src/utils/customPages.js`:

```js
/**
 * Validates custom/pages.config.js and turns it into build inputs and output files.
 * Pure: file access comes in as fileExists, so vite.config.js and tests share it.
 */
import { RESERVED_SLUGS, SLUG_RE } from '../shared/content-rules.js';

const CONFIG = 'custom/pages.config.js';
const HTML_RE = /^custom\/pages\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\.html$/;

function fail(message) {
  throw new Error(`${CONFIG}: ${message}`);
}

function checkPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) fail(`path ${JSON.stringify(path)} must start with "/".`);
  if (path === '/') fail('"/" is the home page: replace it with the landing slot, not with a page.');
  const segments = path.slice(1).split('/');
  if (RESERVED_SLUGS.includes(segments[0])) fail(`"${path}" starts with "/${segments[0]}", which the template uses.`);
  if (segments.length > 2) fail(`"${path}" must have one or two segments.`);
  segments.forEach((segment, index) => {
    if (segment === ':slug') {
      if (index !== 1) fail(`"${path}": ":slug" must be the second of two segments, as in "/projects/:slug".`);
    } else if (!SLUG_RE.test(segment)) {
      fail(`"${path}": segments must be lowercase letters, digits and dashes.`);
    }
  });
  return segments;
}

/**
 * @param {unknown} pages - The default export of custom/pages.config.js.
 * @param {{ fileExists: (path: string) => boolean }} deps - Tells whether a repo-relative file exists.
 * @returns {Array<object>} Normalized pages, in declaration order.
 */
export function validateCustomPages(pages, { fileExists }) {
  if (!Array.isArray(pages)) {
    fail("must `export default` an array of pages, e.g. [{ path: '/archive', html: 'custom/pages/archive.html' }].");
  }
  const paths = new Set();
  const htmls = new Set();
  const normalized = pages.map(page => {
    if (typeof page !== 'object' || page === null) fail('every page must be an object with path and html.');
    const { path, html, entries } = page;
    const segments = checkPath(path);
    if (typeof html !== 'string' || !HTML_RE.test(html)) {
      fail(`"${path}": html ${JSON.stringify(html)} must be an .html file under custom/pages/.`);
    }
    if (!fileExists(html)) fail(`"${path}": ${html} does not exist.`);
    if (paths.has(path)) fail(`"${path}" is declared twice.`);
    if (htmls.has(html)) fail(`${html} is used by two pages.`);
    paths.add(path);
    htmls.add(html);

    if (segments[1] === ':slug') {
      if (entries === undefined) fail(`"${path}" is a collection: add entries (an array, or a function returning one).`);
      return { kind: 'collection', path, html, name: `${segments[0]}-collection`, prefix: segments[0], entries };
    }
    if (entries !== undefined) fail(`"${path}": only collections take entries.`);
    return { kind: 'single', path, html, name: segments.join('-'), outFile: `${segments.join('/')}.html` };
  });

  const prefixes = new Set(normalized.filter(p => p.kind === 'collection').map(p => p.prefix));
  for (const page of normalized) {
    const [first, second] = page.path.slice(1).split('/');
    if (page.kind === 'single' && second && prefixes.has(first)) {
      fail(`"${page.path}" collides with the collection "/${first}/:slug".`);
    }
  }
  return normalized;
}

/** Build inputs for vite.config.js, keyed so they never clash with the template's. */
export function customPageInputs(pages, resolvePath) {
  return Object.fromEntries(pages.map(page => [`page-${page.name}`, resolvePath(page.html)]));
}

/**
 * One output file per collection entry, with the values of its {{PAGE_*}} placeholders.
 * @param {{ path: string, prefix: string }} page - A normalized collection.
 * @param {unknown} entries - The resolved entries.
 */
export function expandCollection(page, entries) {
  if (!Array.isArray(entries)) fail(`entries of "${page.path}" must be an array (or a function returning one).`);
  const seen = new Set();
  return entries.map(entry => {
    const slug = entry?.slug;
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      fail(`"${page.path}": entry slug ${JSON.stringify(slug)} must be lowercase letters, digits and dashes.`);
    }
    if (seen.has(slug)) fail(`"${page.path}": entry "${slug}" is declared twice.`);
    seen.add(slug);
    if (typeof entry.title !== 'string' || !entry.title.trim()) fail(`"${page.path}": entry "${slug}" needs a title.`);
    const url = `/${page.prefix}/${slug}`;
    return {
      outFile: `${page.prefix}/${slug}.html`,
      url,
      meta: {
        PAGE_TITLE: entry.title,
        PAGE_DESCRIPTION: entry.description ?? '',
        PAGE_IMAGE: entry.image ?? '',
        PAGE_URL: url,
        PAGE_SLUG: slug,
      },
    };
  });
}

/** First path segments taken by the pages: the dashboard refuses them as album slugs. */
export function reservedSlugsOf(pages) {
  return [...new Set(pages.map(page => page.path.split('/')[1]))];
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npm test -- src/utils/customPages.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/customPages.js src/utils/customPages.test.js
git commit -m "feat(pages): validate and normalize custom/pages.config.js"
```

---

### Task 3: Page meta injection

**Files:**
- Modify: `src/utils/injectSiteMeta.js`
- Create: `src/utils/injectPageMeta.js`, `src/utils/injectPageMeta.test.js`

**Interfaces:**
- Produces: `stripEmptyMeta(html) → string` (exported from `injectSiteMeta.js`); `injectPageMeta(html, meta) → string`.

- [ ] **Step 1: Write the failing test** in `src/utils/injectPageMeta.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { injectPageMeta } from './injectPageMeta.js';

const meta = { PAGE_TITLE: 'Sea <Sentinels>', PAGE_DESCRIPTION: 'App "one"', PAGE_IMAGE: '', PAGE_URL: '/projects/sea', PAGE_SLUG: 'sea' };

describe('injectPageMeta', () => {
  it('replaces PAGE placeholders with escaped values', () => {
    expect(injectPageMeta('<title>{{PAGE_TITLE}}</title><p data-slug="{{PAGE_SLUG}}">{{PAGE_DESCRIPTION}}</p>', meta))
      .toBe('<title>Sea &lt;Sentinels&gt;</title><p data-slug="sea">App &quot;one&quot;</p>');
  });

  it('removes meta tags left empty, like injectSiteMeta', () => {
    const html = '<head>\n  <meta property="og:image" content="{{PAGE_IMAGE}}">\n  <link rel="canonical" href="{{PAGE_URL}}">\n</head>';
    expect(injectPageMeta(html, meta)).toBe('<head>\n  <link rel="canonical" href="/projects/sea">\n</head>');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(injectPageMeta('{{PAGE_OTHER}} {{SITE_NAME}}', meta)).toBe('{{PAGE_OTHER}} {{SITE_NAME}}');
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/utils/injectPageMeta.test.js`
Expected: FAIL — cannot resolve `./injectPageMeta.js`.

- [ ] **Step 3: Implement.** In `src/utils/injectSiteMeta.js` replace the last statement `return replaced.replace(/[ \t]*<meta[^>]*content=""[^>]*>\n?/g, '');` with `return stripEmptyMeta(replaced);` and add at the end of the file:

```js
/**
 * Removes meta tags whose content ended up empty, with their indentation and newline.
 * @param {string} html - HTML after placeholder replacement.
 * @returns {string} HTML without empty meta tags.
 */
export function stripEmptyMeta(html) {
  return html.replace(/[ \t]*<meta[^>]*content=""[^>]*>\n?/g, '');
}
```

Create `src/utils/injectPageMeta.js`:

```js
import { escapeHtml } from '../shared/html.js';
import { stripEmptyMeta } from './injectSiteMeta.js';

/**
 * Fills the {{PAGE_*}} placeholders of a collection entry's HTML at build time,
 * so crawlers that do not run JavaScript see the entry's own title and preview.
 *
 * @param {string} html - Built page HTML, {{SITE_*}} already injected.
 * @param {Record<string, string>} meta - Values from expandCollection.
 * @returns {string} HTML with the entry's values and without empty meta tags.
 */
export function injectPageMeta(html, meta) {
  const replaced = html.replace(/\{\{(PAGE_[A-Z]+)\}\}/g, (match, key) =>
    key in meta ? escapeHtml(meta[key]) : match,
  );
  return stripEmptyMeta(replaced);
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npm test -- src/utils/injectPageMeta.test.js src/utils/injectSiteMeta.test.js`
Expected: PASS, both files (`injectSiteMeta.test.js` unchanged).

- [ ] **Step 5: Commit.**

```bash
git add src/utils/injectSiteMeta.js src/utils/injectPageMeta.js src/utils/injectPageMeta.test.js
git commit -m "feat(pages): fill per-entry meta placeholders"
```

---

### Task 4: The Vite plugin

**Files:**
- Create: `src/utils/customPagesPlugin.js`, `src/utils/customPagesPlugin.test.js`, `src/utils/customPagesPlugin.build.test.js`

**Interfaces:**
- Consumes: `expandCollection`, `reservedSlugsOf` (Task 2); `injectPageMeta` (Task 3).
- Produces: `customPagesPlugin(pages) → VitePlugin`. Virtual module `virtual:custom-pages` exporting `CUSTOM_PAGE_SLUGS: string[]` (always available, `[]` without pages).

- [ ] **Step 1: Write the failing unit test** in `src/utils/customPagesPlugin.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { customPagesPlugin } from './customPagesPlugin.js';

const single = { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' };
const collection = (entries) => ({ kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries });
const asset = source => ({ type: 'asset', source });

function run(pages, bundle) {
  const emitted = [];
  const ctx = {
    emitFile: vi.fn(file => emitted.push(file)),
    error: message => { throw new Error(message); },
  };
  return customPagesPlugin(pages).generateBundle.handler.call(ctx, {}, bundle).then(() => emitted);
}

describe('customPagesPlugin', () => {
  it('serves the reserved first segments as a virtual module', () => {
    const plugin = customPagesPlugin([single, collection([])]);
    const id = plugin.resolveId('virtual:custom-pages');
    expect(id).toBe('\0virtual:custom-pages');
    expect(plugin.load(id)).toBe('export const CUSTOM_PAGE_SLUGS = ["archive","projects"];');
    expect(plugin.resolveId('other')).toBeNull();
    expect(plugin.load('other')).toBeNull();
  });

  it('serves an empty list without pages', () => {
    const plugin = customPagesPlugin([]);
    expect(plugin.load(plugin.resolveId('virtual:custom-pages'))).toBe('export const CUSTOM_PAGE_SLUGS = [];');
  });

  it('moves a single page to its public path', async () => {
    const bundle = { 'custom/pages/archive.html': asset('<h1>Archive</h1>'), 'index.html': asset('home') };
    const emitted = await run([single], bundle);
    expect(emitted).toEqual([{ type: 'asset', fileName: 'archive.html', source: '<h1>Archive</h1>' }]);
    expect(Object.keys(bundle)).toEqual(['index.html']);
  });

  it('expands a collection, from an array or an async function', async () => {
    const source = '<title>{{PAGE_TITLE}}</title>';
    for (const entries of [
      [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }],
      async () => [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }],
    ]) {
      const bundle = { 'custom/pages/project.html': asset(source) };
      const emitted = await run([collection(entries)], bundle);
      expect(emitted.map(f => [f.fileName, f.source])).toEqual([
        ['projects/a.html', '<title>A</title>'],
        ['projects/b.html', '<title>B</title>'],
      ]);
      expect(bundle).toEqual({});
    }
  });

  it('fails the build when a declared page was not built', async () => {
    await expect(run([single], {})).rejects.toThrow('custom/pages.config.js: custom/pages/archive.html was not built.');
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/utils/customPagesPlugin.test.js`
Expected: FAIL — cannot resolve `./customPagesPlugin.js`.

- [ ] **Step 3: Implement** `src/utils/customPagesPlugin.js`:

```js
import { expandCollection, reservedSlugsOf } from './customPages.js';
import { injectPageMeta } from './injectPageMeta.js';

const VIRTUAL_ID = 'virtual:custom-pages';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Builds the pages of custom/pages.config.js at their public path and tells the
 * dashboard which first segments they take (virtual:custom-pages).
 *
 * @param {Array<object>} pages - Output of validateCustomPages; [] when there is no config.
 */
export function customPagesPlugin(pages) {
  return {
    name: 'custom-pages',
    enforce: 'post',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      return id === RESOLVED_ID ? `export const CUSTOM_PAGE_SLUGS = ${JSON.stringify(reservedSlugsOf(pages))};` : null;
    },
    generateBundle: {
      // After Vite's HTML generation: the built page assets exist only from that point.
      order: 'post',
      async handler(_options, bundle) {
        for (const page of pages) {
          const built = bundle[page.html];
          if (!built || built.type !== 'asset') this.error(`custom/pages.config.js: ${page.html} was not built.`);
          const source = String(built.source);
          delete bundle[page.html];
          if (page.kind === 'single') {
            this.emitFile({ type: 'asset', fileName: page.outFile, source });
            continue;
          }
          const entries = typeof page.entries === 'function' ? await page.entries() : page.entries;
          for (const { outFile, meta } of expandCollection(page, entries)) {
            this.emitFile({ type: 'asset', fileName: outFile, source: injectPageMeta(source, meta) });
          }
        }
      },
    },
  };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npm test -- src/utils/customPagesPlugin.test.js`
Expected: PASS.

- [ ] **Step 5: Write the real build test** in `src/utils/customPagesPlugin.build.test.js` (same fixture pattern as `src/utils/customTheme.test.js`):

```js
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { customPageInputs, validateCustomPages } from './customPages.js';
import { customPagesPlugin } from './customPagesPlugin.js';

const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

describe('custom pages in a real Vite build', () => {
  it('writes single pages and collection entries at their public path', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'f3-custom-pages-')));
    roots.push(root);
    mkdirSync(join(root, 'custom/pages'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>');
    writeFileSync(join(root, 'main.js'), 'document.title = "home";');
    writeFileSync(join(root, 'custom/pages/archive.html'), '<!doctype html><html><head><title>Archive</title></head><body><script type="module" src="/custom/pages/archive.js"></script></body></html>');
    writeFileSync(join(root, 'custom/pages/archive.js'), 'document.body.dataset.page = "archive";');
    writeFileSync(join(root, 'custom/pages/project.html'), '<!doctype html><html><head><title>{{PAGE_TITLE}}</title>\n<meta property="og:image" content="{{PAGE_IMAGE}}">\n</head><body></body></html>');

    const pages = validateCustomPages([
      { path: '/archive', html: 'custom/pages/archive.html' },
      { path: '/projects/:slug', html: 'custom/pages/project.html', entries: async () => [{ slug: 'one', title: 'One & only' }] },
    ], { fileExists: p => existsSync(join(root, p)) });

    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [customPagesPlugin(pages)],
      build: {
        outDir: join(root, 'dist'),
        rollupOptions: { input: { main: join(root, 'index.html'), ...customPageInputs(pages, p => join(root, p)) } },
      },
    });

    const archive = readFileSync(join(root, 'dist/archive.html'), 'utf8');
    expect(archive).toMatch(/<script type="module" crossorigin src="\/assets\/page-archive-[^"]+\.js"><\/script>/);
    expect(readFileSync(join(root, 'dist/projects/one.html'), 'utf8')).toContain('<title>One &amp; only</title>');
    expect(readFileSync(join(root, 'dist/projects/one.html'), 'utf8')).not.toContain('og:image');
    expect(existsSync(join(root, 'dist/custom'))).toBe(false);
  });
});
```

- [ ] **Step 6: Run it.**

Run: `npm test -- src/utils/customPagesPlugin.build.test.js`
Expected: PASS. If `dist/archive.html` is missing or `dist/custom/` exists, stop and report: the verified relocation mechanism no longer holds.

- [ ] **Step 7: Commit.**

```bash
git add src/utils/customPagesPlugin.js src/utils/customPagesPlugin.test.js src/utils/customPagesPlugin.build.test.js
git commit -m "feat(pages): build custom pages at their public path"
```

---

### Task 5: Dev server routing

**Files:**
- Modify: `src/utils/devRouteFallback.js`, `src/utils/devRouteFallback.test.js`

**Interfaces:**
- Consumes: normalized pages (Task 2).
- Produces: `createDevRouteFallback({ customPages = [] } = {}) → (request, response, next) => void`; `devRouteFallback` stays exported as `createDevRouteFallback()`.

- [ ] **Step 1: Write the failing tests.** In `src/utils/devRouteFallback.test.js` change the import to `import { createDevRouteFallback, devRouteFallback } from './devRouteFallback.js';` and add this `describe` at the end of the file:

```js
describe('createDevRouteFallback with custom pages', () => {
  const middleware = createDevRouteFallback({
    customPages: [
      { kind: 'single', path: '/archive', html: 'custom/pages/archive.html', name: 'archive', outFile: 'archive.html' },
      { kind: 'single', path: '/info/credits', html: 'custom/pages/credits.html', name: 'info-credits', outFile: 'info/credits.html' },
      { kind: 'collection', path: '/projects/:slug', html: 'custom/pages/project.html', name: 'projects-collection', prefix: 'projects', entries: [] },
    ],
  });
  const route = url => {
    const request = { url };
    const next = vi.fn();
    middleware(request, responseDouble(), next);
    expect(next).toHaveBeenCalledOnce();
    return request.url;
  };

  it.each([
    ['/archive', '/custom/pages/archive.html'],
    ['/archive/?x=1', '/custom/pages/archive.html?x=1'],
    ['/info/credits', '/custom/pages/credits.html'],
    ['/projects/sea-sentinels', '/custom/pages/project.html'],
    ['/projects/sea-sentinels/?x=1', '/custom/pages/project.html?x=1'],
  ])('serves %s from %s', (url, expected) => {
    expect(route(url)).toBe(expected);
  });

  it('keeps album slugs and invalid collection slugs as before', () => {
    expect(route('/sport')).toBe('/album.html');
    expect(route('/projects/Bad')).toBe('/projects/Bad');
    expect(route('/projects/a/b')).toBe('/projects/a/b');
  });

  it('treats the bare collection prefix as an album slug, like production', () => {
    expect(route('/projects')).toBe('/album.html');
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/utils/devRouteFallback.test.js`
Expected: FAIL — `createDevRouteFallback` is not a function.

- [ ] **Step 3: Implement.** Replace the whole content of `src/utils/devRouteFallback.js` below its doc comment with:

```js
import { RESERVED_SLUGS, SLUG_RE } from '../shared/content-rules.js';

const ALBUM_SLUG_RE = /^\/[a-z0-9][a-z0-9-]*\/?$/;
const RESERVED_PATHS = new Set(RESERVED_SLUGS.map(slug => `/${slug}`));

/**
 * @param {{ customPages?: Array<object> }} [options] - Normalized pages from validateCustomPages.
 * @returns {(request, response, next) => void} Connect middleware for the Vite dev server.
 */
export function createDevRouteFallback({ customPages = [] } = {}) {
  const singles = new Map(customPages.filter(p => p.kind === 'single').map(p => [p.path, p.html]));
  const collections = new Map(customPages.filter(p => p.kind === 'collection').map(p => [p.prefix, p.html]));

  return function devRouteFallback(request, response, next) {
    const url = new URL(request.url, 'http://localhost');
    const normalizedPath = url.pathname.replace(/\/$/, '') || '/';

    if (url.pathname.startsWith('/api/data/')) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: 'Runtime data API is unavailable in the Vite development server',
      }));
      return;
    }

    // Pages are static files in production, served before the Worker: match them first.
    const single = singles.get(normalizedPath);
    if (single) {
      request.url = `/${single}${url.search}`;
      next();
      return;
    }
    const [, prefix, slug, extra] = normalizedPath.split('/');
    if (slug !== undefined && extra === undefined && collections.has(prefix) && SLUG_RE.test(slug)) {
      request.url = `/${collections.get(prefix)}${url.search}`;
      next();
      return;
    }

    if (ALBUM_SLUG_RE.test(url.pathname) && !RESERVED_PATHS.has(normalizedPath)) {
      request.url = `/album.html${url.search}`;
    }
    next();
  };
}

export const devRouteFallback = createDevRouteFallback();
```

Keep the existing doc comment at the top of the file, and add this sentence at its end: `Custom pages declared in custom/pages.config.js are served from their HTML under custom/pages/.`

- [ ] **Step 4: Run to verify pass.**

Run: `npm test -- src/utils/devRouteFallback.test.js`
Expected: PASS, old and new tests.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/devRouteFallback.js src/utils/devRouteFallback.test.js
git commit -m "feat(pages): dev server serves custom pages"
```

---

### Task 6: Wire into `vite.config.js`, theme on custom pages

**Files:**
- Modify: `src/utils/customTheme.js`, `src/utils/customTheme.test.js`
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces: `createCustomThemePlugins({ root, themeFile, publicPages = [] })` where `publicPages` are repo-relative HTML paths that also get the theme link.

- [ ] **Step 1: Record the template build before the change.** From the repo root:

```bash
mkdir -p /srv/claude/workspaces/f3-probes
ALLOW_PLACEHOLDER_CSP=1 npx vite build > /dev/null
find dist -type f | sed -E 's/-[A-Za-z0-9_-]{8}\./-HASH./' | sort > /srv/claude/workspaces/f3-probes/dist-before.txt
```

(`wrangler.json` must exist in the checkout; if it does not, run `cp wrangler.example.json wrangler.json` and delete it again at the end of the task. Never commit it.)

- [ ] **Step 2: Write the failing theme test.** In `src/utils/customTheme.test.js`, add this test inside `describe('custom theme Vite integration', …)`:

```js
  it('links the theme on custom pages passed as publicPages', async () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'custom/pages'), { recursive: true });
    writeFileSync(join(root, 'custom/theme.css'), '.theme { color: red; }');
    writeFileSync(join(root, 'custom/pages/archive.html'), '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>');
    const themeFile = join(root, 'custom/theme.css');

    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: createCustomThemePlugins({ root, themeFile, publicPages: ['custom/pages/archive.html'] }),
      build: {
        outDir: join(root, 'dist'),
        rollupOptions: {
          input: {
            index: join(root, 'index.html'),
            admin: join(root, 'admin.html'),
            archive: join(root, 'custom/pages/archive.html'),
            ...customThemeRollupInput(themeFile),
          },
        },
      },
    });

    expect(readFileSync(join(root, 'dist/custom/pages/archive.html'), 'utf8')).toContain('data-custom-theme');
    expect(readFileSync(join(root, 'dist/admin.html'), 'utf8')).not.toContain('data-custom-theme');
  });
```

- [ ] **Step 3: Run to verify failure.**

Run: `npm test -- src/utils/customTheme.test.js`
Expected: FAIL — the page has no `data-custom-theme` link.

- [ ] **Step 4: Implement the theme option.** In `src/utils/customTheme.js`:
  - change the import to `import { resolve } from 'node:path';` (`basename` is no longer used);
  - replace `const PUBLIC_PAGES = new Set(['index.html', 'album.html', 'about.html']);` with `const TEMPLATE_PUBLIC_PAGES = ['index.html', 'album.html', 'about.html'];`
  - change the signature to `export function createCustomThemePlugins({ root = process.cwd(), themeFile = resolve(root, 'custom/theme.css'), publicPages = [] } = {}) {` and add as its first lines:

```js
  // Public pages get the theme; /admin never does. Paths are compared absolute.
  const publicHtml = new Set([...TEMPLATE_PUBLIC_PAGES, ...publicPages].map(page => resolve(root, page)));
  const isPublic = filename => publicHtml.has(resolve(filename));
```

  - in both `transformIndexHtml` handlers replace `!PUBLIC_PAGES.has(basename(context.filename))` with `!isPublic(context.filename)`.
  - update the JSDoc above the function to: `/** Vite theme entry plus public HTML linking, tied to the \`theme\` CSS input. publicPages: extra repo-relative HTML files (custom pages) that get the theme. */`

- [ ] **Step 5: Run to verify pass.**

Run: `npm test -- src/utils/customTheme.test.js`
Expected: PASS, all four tests.

- [ ] **Step 6: Wire `vite.config.js`.**
  - Change `import { readFileSync, existsSync } from 'fs'` — keep it — and add after it `import { pathToFileURL } from 'url'`.
  - Replace `import { devRouteFallback } from './src/utils/devRouteFallback.js'` with `import { createDevRouteFallback } from './src/utils/devRouteFallback.js'`.
  - Add after the `customTheme.js` import:

```js
import { customPageInputs, validateCustomPages } from './src/utils/customPages.js'
import { customPagesPlugin } from './src/utils/customPagesPlugin.js'
```

  - Add after the `r2PublicUrl` constant:

```js
// Pagine aggiuntive del fork, facoltative: il template non spedisce mai custom/pages.config.js.
// Un errore di configurazione ferma subito build, dev e test, con il nome del file.
const customPagesFile = resolve(__dirname, 'custom/pages.config.js')
const customPages = existsSync(customPagesFile)
  ? validateCustomPages((await import(pathToFileURL(customPagesFile).href)).default, {
      fileExists: path => existsSync(resolve(__dirname, path)),
    })
  : []
```

  - In `devRouteFallbackPlugin`, replace `server.middlewares.use(devRouteFallback)` with `server.middlewares.use(createDevRouteFallback({ customPages }))`.
  - Replace the `plugins:` line with:

```js
  plugins: [
    devRouteFallbackPlugin(),
    siteMetaPlugin(),
    ...createCustomThemePlugins({ root: __dirname, publicPages: customPages.map(page => page.html) }),
    customPagesPlugin(customPages),
    headersPlugin(),
  ],
```

  - In `rollupOptions.input`, add after the `customThemeRollupInput(...)` line: `...customPageInputs(customPages, path => resolve(__dirname, path)),`

- [ ] **Step 7: Verify the template build is unchanged.**

```bash
ALLOW_PLACEHOLDER_CSP=1 npx vite build > /dev/null
find dist -type f | sed -E 's/-[A-Za-z0-9_-]{8}\./-HASH./' | sort > /srv/claude/workspaces/f3-probes/dist-after.txt
diff /srv/claude/workspaces/f3-probes/dist-before.txt /srv/claude/workspaces/f3-probes/dist-after.txt && echo "dist unchanged"
npm test
```

Expected: `dist unchanged`; `npm test` PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/utils/customTheme.js src/utils/customTheme.test.js vite.config.js
git commit -m "build: load optional custom/pages.config.js and theme its pages"
```

---

### Task 7: Dashboard refuses slugs taken by custom pages

**Files:**
- Modify: `src/admin/album-creation.js`, `src/admin/album-creation.test.js`

**Interfaces:**
- Consumes: `virtual:custom-pages` → `CUSTOM_PAGE_SLUGS` (Task 4, wired in Task 6).

- [ ] **Step 1: Write the failing test.** In `src/admin/album-creation.test.js`, add after the imports:

```js
vi.mock('virtual:custom-pages', () => ({ CUSTOM_PAGE_SLUGS: ['archive'] }));
```

and inside `describe('createAlbum', …)`:

```js
  it('slug preso da una pagina di custom/pages.config.js → ok:false con messaggio dedicato', async () => {
    const ctx = makeCtx();
    const result = await createAlbum('Archive', ctx);
    expect(result).toEqual({ ok: false, error: formatText(texts.admin.albums.titleReserved, { slug: 'archive' }) });
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/admin/album-creation.test.js`
Expected: FAIL — `createAlbum('Archive')` returns `ok: true`.

- [ ] **Step 3: Implement.** In `src/admin/album-creation.js` add after the existing imports:

```js
// First path segments of the fork's custom pages, from custom/pages.config.js at build time.
import { CUSTOM_PAGE_SLUGS } from 'virtual:custom-pages';
```

and change the reserved check to:

```js
  if (RESERVED_SLUGS.includes(slug) || CUSTOM_PAGE_SLUGS.includes(slug)) {
    return { ok: false, error: formatText(texts.admin.albums.titleReserved, { slug }) };
  }
```

- [ ] **Step 4: Run to verify pass.**

Run: `npm test`
Expected: PASS, including `src/admin/**` tests that import `album-creation.js` without mocking (they get `[]` from the plugin).

- [ ] **Step 5: Verify the admin build resolves the virtual module.**

Run: `ALLOW_PLACEHOLDER_CSP=1 npx vite build 2>&1 | tail -3`
Expected: build succeeds, no "virtual:custom-pages" resolution error.

- [ ] **Step 6: Commit.**

```bash
git add src/admin/album-creation.js src/admin/album-creation.test.js
git commit -m "feat(admin): refuse album slugs taken by custom pages"
```

---

### Task 8: Public API for pages: `slugFromPath` and base styles

**Files:**
- Create: `src/utils/slugFromPath.js`, `src/utils/slugFromPath.test.js`, `src/api/base.css`
- Modify: `src/api/index.js`, `src/api/index.test.js`

**Interfaces:**
- Produces: `slugFromPath(pattern, pathname) → string | null` exported from `src/api/index.js`; stylesheet `/src/api/base.css`.

- [ ] **Step 1: Write the failing tests.** Create `src/utils/slugFromPath.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { slugFromPath } from './slugFromPath.js';

describe('slugFromPath', () => {
  it.each([
    ['/projects/sea-sentinels', 'sea-sentinels'],
    ['/projects/sea-sentinels/', 'sea-sentinels'],
    ['/projects/sea-sentinels.html', 'sea-sentinels'],
  ])('reads the slug of %s', (pathname, slug) => {
    expect(slugFromPath('/projects/:slug', pathname)).toBe(slug);
  });

  it.each(['/projects', '/other/sea', '/projects/a/b', '/projects/Bad'])('returns null for %s', pathname => {
    expect(slugFromPath('/projects/:slug', pathname)).toBeNull();
  });

  it('rejects a pattern that is not /prefix/:slug', () => {
    expect(() => slugFromPath('/projects', '/projects')).toThrow(/"\/prefix\/:slug"/);
  });
});
```

In `src/api/index.test.js`, in the pinned list, insert `'slugFromPath'` between `'slot'` and `'texts'` (the list is sorted: `slot` < `slugFromPath`), and add at the end of the top `describe`:

```js
  describe('slugFromPath', () => {
    it('reads the entry slug of a collection page', () => {
      expect(api.slugFromPath('/projects/:slug', '/projects/sea-sentinels')).toBe('sea-sentinels');
    });
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/utils/slugFromPath.test.js src/api/index.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** Create `src/utils/slugFromPath.js`:

```js
import { SLUG_RE } from '../shared/content-rules.js';

/**
 * Reads the entry slug from the current path of a collection page.
 * The address may carry a trailing slash or ".html" (the dev server and old links).
 *
 * @param {string} pattern - The collection path from custom/pages.config.js, e.g. '/projects/:slug'.
 * @param {string} pathname - Usually location.pathname.
 * @returns {string|null} The slug, or null when the path is not an entry of this collection.
 */
export function slugFromPath(pattern, pathname) {
  const [prefix, param, extra] = pattern.split('/').filter(Boolean);
  if (param !== ':slug' || extra !== undefined) {
    throw new TypeError(`slugFromPath: the pattern must look like "/prefix/:slug", got "${pattern}".`);
  }
  const [first, slug, rest] = pathname.replace(/\/$/, '').replace(/\.html$/, '').split('/').filter(Boolean);
  return first === prefix && rest === undefined && typeof slug === 'string' && SLUG_RE.test(slug) ? slug : null;
}
```

Create `src/api/base.css`:

```css
/* Public entry for the template's base styles: custom pages import it instead of src/styles/. */
@import '../styles/main.css';
```

In `src/api/index.js`, add after the `export { on } …` line:

```js
export { slugFromPath } from '../utils/slugFromPath.js';
```

- [ ] **Step 4: Run to verify pass.**

Run: `npm test -- src/utils/slugFromPath.test.js src/api/index.test.js`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/slugFromPath.js src/utils/slugFromPath.test.js src/api/base.css src/api/index.js src/api/index.test.js
git commit -m "feat(api): slugFromPath and base styles for custom pages"
```

---

### Task 9: Example pages and documentation

**Files:**
- Create: `custom.example/pages.config.js`, `custom.example/pages/archive.html`, `custom.example/pages/archive.js`, `custom.example/pages/project.html`, `custom.example/pages/project.js`, `custom.example/pages/chrome.js`, `custom.example/content/projects.json`, `docs/pages.md`
- Modify: `docs/slots.md`, `custom.example/README.md`, `CUSTOMIZING.md`

- [ ] **Step 1: Example configuration and content.**

`custom.example/pages.config.js`:

```js
// Read by vite.config.js at build time (Node), never shipped to the browser.
import projects from './content/projects.json' with { type: 'json' };

export default [
  { path: '/archive', html: 'custom/pages/archive.html' },
  { path: '/projects/:slug', html: 'custom/pages/project.html', entries: projects },
];
```

`custom.example/content/projects.json`:

```json
[
  { "slug": "harbour-lights", "title": "Harbour lights", "description": "Night series on the old port." },
  { "slug": "salt-roads", "title": "Salt roads", "description": "A year along the salt pans." }
]
```

- [ ] **Step 2: Shared chrome helper and the archive page.**

`custom.example/pages/chrome.js`:

```js
import { fetchConfig, fetchSite, resolveSiteContent, siteConfig, slot, texts } from '/src/api/index.js';

/** Resolves site content and mounts the template (or overridden) nav and footer. */
export async function mountChrome() {
  const [siteRes, configRes] = await Promise.all([fetchSite(), fetchConfig()]);
  const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
  const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
  await Promise.all(['nav', 'footer'].map(async name => {
    const component = await slot(name);
    component.mount(document.getElementById(`site-${name}`), { site, texts });
  }));
  return { site, r2PublicUrl };
}
```

`custom.example/pages/archive.html`:

```html
<!doctype html>
<html lang="{{SITE_LANG}}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Archive — {{SITE_NAME}}</title>
    <meta name="description" content="{{SITE_BIO}}" />
  </head>
  <body>
    <header id="site-nav"></header>
    <main class="page-main">
      <div class="container">
        <h1 class="section-heading">Archive</h1>
        <ul id="archive-list"></ul>
      </div>
    </main>
    <footer id="site-footer"></footer>
    <script type="module" src="/custom/pages/archive.js"></script>
  </body>
</html>
```

`custom.example/pages/archive.js`:

```js
import '/src/api/base.css';
import { fetchAlbums, resolveAlbums, texts } from '/src/api/index.js';
import { mountChrome } from './chrome.js';

mountChrome();

const list = document.getElementById('archive-list');
const albums = resolveAlbums(await fetchAlbums(), []);
if (albums === null) {
  list.replaceWith(Object.assign(document.createElement('p'), { textContent: texts.album.error.unknown }));
} else {
  for (const album of albums) {
    const link = Object.assign(document.createElement('a'), { href: `/${album.slug}`, textContent: album.title });
    const item = document.createElement('li');
    item.appendChild(link);
    list.appendChild(item);
  }
}
```

- [ ] **Step 3: The collection page.**

`custom.example/pages/project.html`:

```html
<!doctype html>
<html lang="{{SITE_LANG}}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{PAGE_TITLE}} — {{SITE_NAME}}</title>
    <meta name="description" content="{{PAGE_DESCRIPTION}}" />
    <meta property="og:title" content="{{PAGE_TITLE}}" />
    <meta property="og:description" content="{{PAGE_DESCRIPTION}}" />
    <meta property="og:image" content="{{PAGE_IMAGE}}" />
    <link rel="canonical" href="{{PAGE_URL}}" />
  </head>
  <body>
    <header id="site-nav"></header>
    <main class="page-main">
      <div class="container">
        <h1 id="project-title" class="section-heading"></h1>
        <p id="project-description"></p>
      </div>
    </main>
    <footer id="site-footer"></footer>
    <script type="module" src="/custom/pages/project.js"></script>
  </body>
</html>
```

`custom.example/pages/project.js`:

```js
import '/src/api/base.css';
import { slugFromPath, texts } from '/src/api/index.js';
import projects from '../content/projects.json';
import { mountChrome } from './chrome.js';

mountChrome();

// The build already wrote title and meta into the HTML; the script fills the body.
const project = projects.find(p => p.slug === slugFromPath('/projects/:slug', location.pathname));
document.getElementById('project-title').textContent = project?.title ?? texts.album.notFound;
document.getElementById('project-description').textContent = project?.description ?? '';
```

- [ ] **Step 4: `docs/pages.md`.** Create it with this content:

````markdown
# Pages — adding your own pages

`custom/pages.config.js` declares pages the template does not have. Two kinds:

| Kind | Declaration | Built file | Address |
|---|---|---|---|
| single | `{ path: '/archive', html: 'custom/pages/archive.html' }` | `dist/archive.html` | `/archive` |
| collection | `{ path: '/projects/:slug', html: 'custom/pages/project.html', entries }` | `dist/projects/<slug>.html`, one per entry | `/projects/<slug>` |

`entries` is an array, or a function (also async) returning one, of `{ slug, title, description?, image? }`. It runs at build time in Node: read your content from the repo, for example a JSON file under `custom/content/`.

## Paths

- One or two segments of lowercase letters, digits and dashes. A collection is exactly `/<prefix>/:slug`.
- Not `/`: the home page is the `landing` slot.
- Not a first segment the template uses: `about`, `admin`, `album`, `api`, `assets`, `index`.
- Every path and every HTML file only once. A two-segment single page cannot live under a collection prefix.
- The bare prefix of a collection (`/projects`) is not a page: without a single page declared there, it reaches the album page and answers "album not found". Declare `{ path: '/projects', html: … }` to give it an index.

A wrong declaration stops `npm run dev`, `npm test` and `npm run build` with a message that starts with `custom/pages.config.js:`.

## The HTML

Files live under `custom/pages/`. Like every page they get `{{SITE_NAME}}`, `{{SITE_BIO}}`, `{{SITE_LANG}}`, `{{SITE_IMAGE}}`. Collection entries also get:

| Placeholder | Value |
|---|---|
| `{{PAGE_TITLE}}` | entry `title` |
| `{{PAGE_DESCRIPTION}}` | entry `description`, or empty |
| `{{PAGE_IMAGE}}` | entry `image`, or empty |
| `{{PAGE_URL}}` | `/<prefix>/<slug>` |
| `{{PAGE_SLUG}}` | entry `slug` |

Values are HTML-escaped. A `<meta>` whose `content` ends up empty is removed. In `npm run dev` the placeholders stay visible: they are filled by the build.

No inline `<script>` or `<style>`: the Content Security Policy blocks them. Use `<script type="module" src="/custom/pages/….js">`.

## The script

Import only from `/src/api/`: `/src/api/index.js` for data, slots and `slugFromPath`, and `/src/api/base.css` for the template's base styles. `custom.example/pages/` shows a single page and a collection, with a small helper that mounts nav and footer through `slot`. `slugFromPath('/projects/:slug', location.pathname)` returns the current entry's slug, or `null`.

If `custom/theme.css` exists, it is linked on your pages too.

## Where they are served

They are static files: Cloudflare serves them before the Worker runs, so the Worker needs no change. `/archive/` and `/archive.html` redirect to `/archive`.

## Albums and pages

The dashboard refuses to create an album whose slug is the first segment of one of your pages. An album created by hand in `albums.json` with such a slug is shadowed: the page wins.
````

- [ ] **Step 5: Link the guide.**

In `docs/slots.md`, in the public API table, add after the `siteConfig` row:

```markdown
| `slugFromPath` | `slugFromPath('/projects/:slug', location.pathname)` | the entry slug of a collection page, or `null` (see `docs/pages.md`) |
```

and at the end of the section "Page setup and events" add:

```markdown
To add whole pages rather than replace parts of existing ones, see [pages](pages.md).
```

In `custom.example/README.md`, add before the line `- Commit \`custom/\` in your fork. Never commit it to the template itself.`:

```markdown
- `pages.config.js` declares two example pages: `/archive` (single) and `/projects/:slug` (a collection built from `content/projects.json`). See `docs/pages.md`.
```

In `CUSTOMIZING.md`, directly after the paragraph that links `docs/slots.md` (or, if there is none, at the end of the file), add:

```markdown
To add pages of your own — a single page or a collection with one page per entry — see [`docs/pages.md`](docs/pages.md).
```

- [ ] **Step 6: Commit.**

```bash
git add custom.example/pages.config.js custom.example/pages custom.example/content docs/pages.md docs/slots.md custom.example/README.md CUSTOMIZING.md
git commit -m "docs(pages): example pages and guide for custom pages"
```

- [ ] **Step 7: Check the example builds, in a disposable copy of the committed tree.**

```bash
F=/srv/claude/workspaces/f3-probes/example
rm -rf $F && mkdir -p $F && git archive HEAD | tar -x -C $F
cp -r custom.example $F/custom && cp wrangler.example.json $F/wrangler.json && ln -s "$PWD/node_modules" $F/node_modules
( cd $F && npm test 2>&1 | grep -E "Test Files|Tests " && ALLOW_PLACEHOLDER_CSP=1 npx vite build > build.log 2>&1; echo "build exit $?"; grep -ci warn build.log )
ls $F/dist/archive.html $F/dist/projects/harbour-lights.html $F/dist/projects/salt-roads.html
grep -o '<title>[^<]*' $F/dist/projects/harbour-lights.html
grep -c 'data-custom-theme' $F/dist/archive.html $F/dist/projects/harbour-lights.html
test ! -e $F/dist/custom && echo "no dist/custom"
```

Expected: tests PASS; `build exit 0`; `0` warnings; the three files listed; `<title>Harbour lights — Nome Fotografo`; `data-custom-theme` count 1 in each file; `no dist/custom`.

If anything differs, fix it in a new commit and repeat this step.


---

### Task 10: Final verification

**Files:** none in the repo, except the verification report `docs/maintainers/superpowers/reviews/2026-09-26-f3-verification.md`.

- [ ] **Step 1: Full matrix.** Rebuild `/srv/claude/workspaces/f3-probes/example` as in Task 9 Step 7 from the final `HEAD`, plus a template copy without `custom/` in `/srv/claude/workspaces/f3-probes/template`. In each: `npm test` and `ALLOW_PLACEHOLDER_CSP=1 npx vite build`. Record counts, exit codes and warnings.

- [ ] **Step 2: Real runtime routing** (example copy):

```bash
cd /srv/claude/workspaces/f3-probes/example
npx wrangler dev --port 8799 --ip 127.0.0.1 > wrangler.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8799/ && break; sleep 1; done
for u in /archive /archive/ /projects/harbour-lights /projects/salt-roads/ /projects /contatti /about /travel; do
  printf "%-26s " "$u"; curl -s -o page.html -w "%{http_code} %{redirect_url} " "http://127.0.0.1:8799$u"; grep -o "<title>[^<]*" page.html | head -1; echo
done
kill %1
```

Expected: `/archive` 200 "Archive — …"; `/archive/` 307 → `/archive`; `/projects/harbour-lights` 200 "Harbour lights — …"; `/projects/salt-roads/` 307; `/projects` 200 album page (no `albums.json` locally); `/contatti` 200 album page, no redirect; `/about` 200 "Contatti — …"; `/travel` 200 album page.

- [ ] **Step 3: Dev server routing** (example copy): run `npx vite --port 5199 --strictPort` in the background, then `curl -s http://127.0.0.1:5199/archive | grep -o '<title>[^<]*'` (expect `Archive — …`) and `curl -s http://127.0.0.1:5199/projects/harbour-lights | grep -o '<title>[^<]*'` (expect the raw `{{PAGE_TITLE}} — …`, documented). Stop the server.

- [ ] **Step 4: Browser check.** With the example `dist/` served by `/srv/claude/workspaces/f2-fixtures/browser/server.mjs` (do not modify it), open the archive and a project page with Playwright (`PLAYWRIGHT_BROWSERS_PATH=/srv/claude/workspaces/f2-fixtures/browser/ms-playwright`, `channel: 'chromium'`): nav and footer mounted, list or project text rendered, theme link last, no console errors. Note: `server.mjs` maps every one-segment path to `album.html` and serves other paths as files, so request `/archive.html` and `/projects/harbour-lights.html` (`slugFromPath` accepts the `.html` suffix).

- [ ] **Step 5: Report.** Write `docs/maintainers/superpowers/reviews/2026-09-26-f3-verification.md` with the results of Steps 1–4, exact counts, and anything that did not match. `git diff --check`, then commit it:

```bash
git add docs/maintainers/superpowers/reviews/2026-09-26-f3-verification.md
git commit -m "docs(f3): verification report"
```

No push, no merge: the maintainer reviews and the user decides.
