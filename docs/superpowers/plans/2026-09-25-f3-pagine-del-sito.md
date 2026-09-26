# F3 — Site pages (single and collections) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a fork add its own pages from `custom/pages.config.js`: single pages (`/archivio`) and collections generated at build from content in the repo (`/codice/:slug` → one static HTML per entry, with its own title, description and preview image). No Worker change, correct routing in dev, and the dashboard refuses album slugs that a site page would shadow.

**Architecture:** `vite.config.js` loads `custom/pages.config.js` when it exists, validates it with a pure function, and adds each page's HTML as a build input. A Vite plugin relocates built site pages to their public path and expands collections into one file per entry, injecting `{{PAGE_*}}` placeholders. In production these are plain static files, so Workers Static Assets serves them before the Worker runs. `devRouteFallback` becomes a factory that knows the site pages. A virtual module exposes the reserved first path segments to the dashboard.

**Tech Stack:** Vite 8 (Rollup `generateBundle`, virtual modules, `transformIndexHtml`), Node `fs`/`url`, Vitest 4, Wrangler (local verification only).

**Spec:** `docs/superpowers/specs/2026-09-25-punti-di-aggancio-design.md`
**Depends on:** F2 (site page scripts import from `src/api/index.js`), and a single source of truth for reserved paths (Task 0).
**Status (2026-09-25):** deferred until the personal site has pages to publish. Tasks 3, 4, 5 and 8 are described in prose: detail them with complete code on the real codebase before executing, and use a standard-tier model, not a transcription-level one. Estimate revised from 4–5 h to 6–8 h. The fork folder is now `custom/` (spec §6); concept names such as `sitePages`, `docs/site-pages.md` and `virtual:site-pages` predate that rename — settle them when this plan is re-detailed.

## Global Constraints

- Without `custom/pages.config.js`, the build output is identical to today's (same files in `dist/`).
- Site page paths: one or two lowercase segments; collections use `:slug` as the **last** segment only. Allowed characters follow `SLUG_RE`.
- A site page may not claim `/`, a template page (read from the single list of Task 0, never re-declared in this plan), `/api/*`, `/assets/*`, or a path already declared by another site page.
- Site page HTML must live under `custom/pages/`. It goes through `injectSiteMeta` like every page, so `{{SITE_*}}` placeholders work; `{{PAGE_*}}` placeholders are filled only for collection entries.
- Collection output is `dist/<prefix>/<slug>.html`, served at `/<prefix>/<slug>` by the default `html_handling` (`auto-trailing-slash`), without redirects.
- No inline scripts or styles in site pages (CSP unchanged). Page scripts are regular `<script type="module" src>` entries bundled by Vite.
- The Worker is not modified. The residual case "album created by hand in `albums.json` with a reserved slug" is documented: the static page wins.
- The bare prefix of a collection (`/codice`) is not a page. Without a single page declared at that path it reaches the Worker's album branch and, after F4, answers 404 "album not found". `docs/site-pages.md` says so and suggests declaring a single page at the prefix.

## File Map

- `src/shared/html.js` (create if missing): `escapeHtml`, shared with `injectSiteMeta` (and F4).
- `src/utils/sitePages.js` (create) + test: `validateSitePages`, `sitePageInputs`, `expandCollection`, `reservedSlugsOf`.
- `src/utils/injectPageMeta.js` (create) + test.
- `src/utils/sitePagesPlugin.js` (create) + test: relocation and expansion in `generateBundle`, virtual module `virtual:site-pages`.
- `src/utils/devRouteFallback.js` (modify) + test: `createDevRouteFallback({ sitePages })`.
- `vite.config.js` (modify): load, validate, inputs, plugins.
- `src/admin/album-creation.js` (modify) + test: reject site-reserved slugs.
- `src/api/index.js` (modify) + test: add `slugFromPath`.
- `custom.example/pages.config.js`, `custom.example/pages/archivio.html|js`, `custom.example/pages/progetto.html|js`, `custom.example/content/progetti.json` (create).
- `docs/site-pages.md` (create), `docs/slots.md`, `CUSTOMIZING.md` (modify).

---

### Task 0: One source of truth for reserved paths

**Why first:** on `6b0d6db` three lists already disagree. `RESERVED_SLUGS` (`src/shared/content-rules.js`, used by the dashboard and `validateAlbumsShape`) lacks `contatti`, while `src/worker.js` redirects `/contatti` to `/about` before the album branch and `RESERVED_PATHS` in `src/utils/devRouteFallback.js` includes it: the dashboard can create an album `contatti` that production never serves. This plan would add two more lists (the template pages in `sitePages.js`, `SITE_RESERVED_SLUGS`). Unify first.

Two more slugs are shadowed before the Worker runs (verified on workerd during the F4 review): `/album` is served statically as `album.html`, and `/index` answers 307 → `/`. Neither is in `RESERVED_SLUGS`, so an album named `album` never gets per-album meta and `/album` never answers 404, and an album named `index` is unreachable. The unified list must include both.

**Direction** (detail with complete code when F3 starts):
- Export from `src/shared/content-rules.js` the template paths the Worker handles before the album branch (`about`, `admin`, `contatti`) alongside the reserved prefixes (`api`, `assets`), and derive `RESERVED_SLUGS` from them.
- Make `src/worker.js` (`STATIC_PAGES` and the redirect), `devRouteFallback` (`RESERVED_PATHS`) and `sitePages.js` (Task 2) read that export instead of declaring their own.
- A consistency test: every path the Worker answers before the album branch has its first segment in `RESERVED_SLUGS`.

> The `contatti` bug itself is fixed earlier, in a separate small change that adds it to `RESERVED_SLUGS`. If that has landed, Task 0 is the unification only.

---

### Task 1: Shared HTML escaping

**Files:** Create `src/shared/html.js`, `src/shared/html.test.js`; modify `src/utils/injectSiteMeta.js`.

> F4 runs first and creates `src/shared/html.js`: this task is normally skipped. Keep it only if F4 has not landed.

- [ ] **Step 1:** Test that `escapeHtml` escapes `& < > " '` and stringifies non-strings.
- [ ] **Step 2:** Move `ESCAPE_MAP` and `escapeHtml` from `injectSiteMeta.js` to `src/shared/html.js` (exported); import it back in `injectSiteMeta.js`.
- [ ] **Step 3:** `npm test` — `injectSiteMeta.test.js` passes unchanged.
- [ ] **Step 4:** `git commit -m "refactor: share escapeHtml between build and Worker"`

---

### Task 2: Site page configuration, pure

**Files:** Create `src/utils/sitePages.js`, `src/utils/sitePages.test.js`

**Interfaces:**
- Config entry shapes:
  - single: `{ path: '/archivio', html: 'custom/pages/archivio.html' }`
  - collection: `{ path: '/codice/:slug', html: 'custom/pages/progetto.html', entries: Entry[] | () => Entry[] | Promise<Entry[]> }` with `Entry = { slug, title, description?, image? }`
- `validateSitePages(pages, { fileExists }) → NormalizedPage[]` — throws with a message starting `custom/pages.config.js:`.
  - `NormalizedPage = { kind: 'single' | 'collection', path, html, name, prefix? }`, `name` = path without slashes and `:slug`, joined with `-` (`archivio`, `codice`).
- `sitePageInputs(pages, resolve) → { ['site-' + name]: absoluteHtmlPath }`
- `expandCollection(page, entries) → { outFile, url, meta }[]` — validates entry slugs with `SLUG_RE` and uniqueness.
- `reservedSlugsOf(pages) → string[]` — unique first segments.

- [ ] **Step 1: Write the failing tests** — cover at least:

```js
import { describe, expect, it } from 'vitest';
import { validateSitePages, expandCollection, reservedSlugsOf, sitePageInputs } from './sitePages.js';

const exists = () => true;

describe('validateSitePages', () => {
  it('normalizes a single page and a collection', () => {
    const pages = validateSitePages([
      { path: '/archivio', html: 'custom/pages/archivio.html' },
      { path: '/codice/:slug', html: 'custom/pages/progetto.html', entries: [] },
    ], { fileExists: exists });
    expect(pages).toEqual([
      { kind: 'single', path: '/archivio', html: 'custom/pages/archivio.html', name: 'archivio' },
      { kind: 'collection', path: '/codice/:slug', html: 'custom/pages/progetto.html', name: 'codice', prefix: 'codice', entries: [] },
    ]);
  });

  it.each([
    ['/', /root/],
    ['/about', /template page/],
    ['/admin', /template page/],
    ['/api/x', /reserved/],
    ['/assets', /reserved/],
    ['/Archivio', /lowercase/],
    ['/a/b/c', /one or two segments/],
    ['/:slug/codice', /last segment/],
  ])('rejects path %s', (path, message) => {
    expect(() => validateSitePages([{ path, html: 'custom/pages/x.html' }], { fileExists: exists }))
      .toThrow(message);
  });

  it('rejects html outside custom/pages/', () => {
    expect(() => validateSitePages([{ path: '/x', html: 'index.html' }], { fileExists: exists }))
      .toThrow(/custom\/pages\//);
  });

  it('rejects a missing html file, naming it', () => {
    expect(() => validateSitePages([{ path: '/x', html: 'custom/pages/x.html' }], { fileExists: () => false }))
      .toThrow(/custom\/pages\/x\.html/);
  });

  it('rejects duplicate paths', () => {
    const p = { path: '/x', html: 'custom/pages/x.html' };
    expect(() => validateSitePages([p, p], { fileExists: exists })).toThrow(/declared twice/);
  });

  it('rejects a collection without entries', () => {
    expect(() => validateSitePages([{ path: '/c/:slug', html: 'custom/pages/c.html' }], { fileExists: exists }))
      .toThrow(/entries/);
  });
});

describe('expandCollection', () => {
  const page = { kind: 'collection', prefix: 'codice', path: '/codice/:slug' };

  it('produces one output per entry with its meta', () => {
    expect(expandCollection(page, [{ slug: 'sea-sentinels', title: 'Sea Sentinels', description: 'App', image: 'https://x/y.webp' }]))
      .toEqual([{
        outFile: 'codice/sea-sentinels.html',
        url: '/codice/sea-sentinels',
        meta: { PAGE_TITLE: 'Sea Sentinels', PAGE_DESCRIPTION: 'App', PAGE_IMAGE: 'https://x/y.webp', PAGE_URL: '/codice/sea-sentinels', PAGE_SLUG: 'sea-sentinels' },
      }]);
  });

  it('rejects invalid or duplicate slugs', () => {
    expect(() => expandCollection(page, [{ slug: 'Bad Slug', title: 'x' }])).toThrow(/slug/);
    expect(() => expandCollection(page, [{ slug: 'a', title: 'x' }, { slug: 'a', title: 'y' }])).toThrow(/twice/);
  });
});

describe('reservedSlugsOf / sitePageInputs', () => {
  const pages = [
    { kind: 'single', path: '/archivio', html: 'custom/pages/archivio.html', name: 'archivio' },
    { kind: 'collection', path: '/codice/:slug', html: 'custom/pages/progetto.html', name: 'codice', prefix: 'codice' },
  ];
  it('reserves first segments', () => expect(reservedSlugsOf(pages)).toEqual(['archivio', 'codice']));
  it('maps inputs', () => expect(sitePageInputs(pages, p => `/abs/${p}`)).toEqual({
    'site-archivio': '/abs/custom/pages/archivio.html',
    'site-codice': '/abs/custom/pages/progetto.html',
  }));
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** `src/utils/sitePages.js`. Rules, in the order the tests expect: `/` → "root is the landing, use the landing slot"; template pages from the list exported in Task 0 → "is a template page"; first segment in `RESERVED_SLUGS` from `src/shared/content-rules.js` (`admin`, `api`, `assets`, `about`) → "is reserved"; segment pattern `/^[a-z0-9][a-z0-9-]*$/` or `:slug` → otherwise "must be lowercase letters, digits and dashes"; 1–2 segments; `:slug` only last; `html` must start with `custom/pages/` and end with `.html`; `fileExists(html)`; duplicates; collections require `entries`. Every message starts with `custom/pages.config.js:` and quotes the offending value.

- [ ] **Step 4: Run to verify pass**, commit:

```bash
git add src/utils/sitePages.js src/utils/sitePages.test.js
git commit -m "feat(site-pages): validate and normalize custom/pages.config.js"
```

---

### Task 3: Page meta injection

**Files:** Create `src/utils/injectPageMeta.js`, `src/utils/injectPageMeta.test.js`

**Interfaces:** `injectPageMeta(html, meta) → html` — replaces `{{PAGE_TITLE|PAGE_DESCRIPTION|PAGE_IMAGE|PAGE_URL|PAGE_SLUG}}` with escaped values (missing → `''`), then removes `<meta>` tags whose `content=""`, exactly like `injectSiteMeta`. Unknown placeholders are left untouched.

- [ ] **Step 1: Tests** — replacement and escaping (`<script>` in a title becomes `&lt;script&gt;`), empty image removes the `og:image` tag, unknown `{{SITE_X}}` untouched.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** with `escapeHtml` from `src/shared/html.js`.
- [ ] **Step 4: Run to verify pass**, `git commit -m "feat(site-pages): inject per-page meta placeholders"`

---

### Task 4: The Vite plugin

**Files:** Create `src/utils/sitePagesPlugin.js`, `src/utils/sitePagesPlugin.test.js`

**Interfaces:** `sitePagesPlugin(pages) → VitePlugin` with:
- `resolveId('virtual:site-pages')` / `load` → `export const SITE_RESERVED_SLUGS = [...]` (from `reservedSlugsOf`). Active in dev, build and test.
- `generateBundle(_, bundle)` (build only):
  - single: the HTML asset whose `fileName === page.html` is re-emitted as `<name>.html` and the original deleted;
  - collection: `entries` resolved (array or function, awaited), expanded, each output emitted with `injectPageMeta(source, meta)`; the template asset deleted.

- [ ] **Step 1: Tests** — call `plugin.generateBundle.call(ctx, {}, bundle)` with a fake `ctx.emitFile` that records `{ fileName, source }` and a `bundle` holding `{ 'custom/pages/archivio.html': { type: 'asset', fileName: 'custom/pages/archivio.html', source: '<title>{{PAGE_TITLE}}</title>' } }`. Assert: emitted `archivio.html`, original key removed; for a collection with two entries, emitted `codice/a.html` and `codice/b.html` with their titles, template removed; a function returning a promise of entries works; `load('\0virtual:site-pages')` returns the reserved list.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Use the `\0` prefix convention for the resolved virtual id. Treat `source` as string (`String(asset.source)`).
- [ ] **Step 4: Run to verify pass**, `git commit -m "feat(site-pages): relocate and expand site pages at build"`

---

### Task 5: Dev server routing

**Files:** Modify `src/utils/devRouteFallback.js`, `src/utils/devRouteFallback.test.js`

**Interfaces:** `createDevRouteFallback({ sitePages = [] } = {}) → middleware`; keep `export const devRouteFallback = createDevRouteFallback();` so current imports and tests keep working.

Order inside the middleware:
1. `/api/data/*` → 404 JSON (unchanged).
2. Site single page path (with or without trailing slash) → `request.url = '/' + page.html + search`.
3. Collection `/<prefix>/<slug>` → `request.url = '/' + page.html + search` (placeholders stay visible in dev; the page script reads the slug from `location.pathname`).
4. Album slug regex and `RESERVED_PATHS` (unchanged), where `RESERVED_PATHS` now also contains the single site page paths.

- [ ] **Step 1: Tests** for 2, 3 and "a site page never falls into the album regex"; existing tests unchanged.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** `git commit -m "feat(site-pages): dev server serves site pages"`

---

### Task 6: Wire into `vite.config.js`

**Files:** Modify `vite.config.js`

- [ ] **Step 1: Load and validate the site config** before `defineConfig`:

```js
import { pathToFileURL } from 'url'
import { validateSitePages, sitePageInputs } from './src/utils/sitePages.js'
import { sitePagesPlugin } from './src/utils/sitePagesPlugin.js'
import { createDevRouteFallback } from './src/utils/devRouteFallback.js'

// Optional: forks declare extra pages in custom/pages.config.js. The template never ships it.
const sitePagesFile = resolve(__dirname, 'custom/pages.config.js')
const sitePages = existsSync(sitePagesFile)
  ? validateSitePages((await import(pathToFileURL(sitePagesFile).href)).default, {
      fileExists: p => existsSync(resolve(__dirname, p)),
    })
  : []
```

- [ ] **Step 2:** In the dev middleware plugin use `createDevRouteFallback({ sitePages })` instead of `devRouteFallback`; add `sitePagesPlugin(sitePages)` to `plugins`; spread `...sitePageInputs(sitePages, p => resolve(__dirname, p))` into `rollupOptions.input`.

- [ ] **Step 3: Verify the template build is unchanged**

```bash
npm run build && ls dist > /tmp/dist-after.txt
git stash && npm run build && ls dist > /tmp/dist-before.txt && git stash pop
diff /tmp/dist-before.txt /tmp/dist-after.txt   # expected: no difference
```

- [ ] **Step 4:** `git commit -m "build: load optional custom/pages.config.js"`

---

### Task 7: Dashboard refuses shadowed slugs

**Files:** Modify `src/admin/album-creation.js`, `src/admin/album-creation.test.js`

- [ ] **Step 1: Test** — with `vi.mock('virtual:site-pages', () => ({ SITE_RESERVED_SLUGS: ['archivio'] }))`, `createAlbum('Archivio', ctx)` returns `{ ok: false }` with the `titleReserved` message and does not call `ctx.api.putAlbums`.
- [ ] **Step 2: Implement** — `import { SITE_RESERVED_SLUGS } from 'virtual:site-pages';` and check it right after `RESERVED_SLUGS`, with the same message.
- [ ] **Step 3:** `npm test`, `git commit -m "feat(admin): refuse album slugs taken by site pages"`

---

### Task 8: `slugFromPath` in the public API

**Files:** Modify `src/api/index.js`, `src/api/index.test.js`; create `src/utils/slugFromPath.js` + test.

- [ ] `slugFromPath('/codice/:slug', '/codice/sea-sentinels/') → 'sea-sentinels'`; returns `null` when the path does not match. Export it from `src/api/index.js` and add it to the pinned list. Commit: `feat(api): slugFromPath for collection pages`.

---

### Task 9: Example pages, documentation, real routing check

**Files:** Create in `custom.example/`: `pages.config.js`, `pages/archivio.html`, `pages/archivio.js`, `pages/progetto.html`, `pages/progetto.js`, `content/progetti.json`; create `docs/site-pages.md`; modify `docs/slots.md`, `CUSTOMIZING.md`.

- [ ] **Step 1: Example config**

```js
// custom.example/pages.config.js
import { readFileSync } from 'node:fs';

export default [
  { path: '/archivio', html: 'custom/pages/archivio.html' },
  {
    path: '/progetti/:slug',
    html: 'custom/pages/progetto.html',
    entries: () => JSON.parse(readFileSync(new URL('./content/progetti.json', import.meta.url), 'utf8')),
  },
];
```

`progetto.html` uses `<title>{{PAGE_TITLE}} — {{SITE_NAME}}</title>`, `<meta name="description" content="{{PAGE_DESCRIPTION}}">`, `og:title`, `og:description`, `og:image` with `{{PAGE_IMAGE}}`, `<link rel="canonical" href="{{PAGE_URL}}">`, the usual `#site-nav`/`#site-footer`, and `<script type="module" src="/custom/pages/progetto.js">`. The script imports only from `/src/api/index.js`, reads the slug with `slugFromPath`, finds the entry in the same JSON and renders it. `archivio.js` lists albums with `fetchAlbums`.

- [ ] **Step 2: `docs/site-pages.md`** — the two page kinds, the path rules, the placeholders, where files end up in `dist/`, why the Worker is not involved (static assets are served first), the reserved-slug behavior and its residual case, and that the bare prefix of a collection is not a page (404 unless a single page is declared there).

- [ ] **Step 3: Check routing on the real runtime, not only the Vite dev server**

```bash
cp -r custom.example custom
npm test && npm run build
ls dist/archivio.html dist/progetti/          # files exist
npx wrangler dev                              # local Workers runtime with static assets
curl -sI http://localhost:8787/archivio       # 200, no redirect
curl -s  http://localhost:8787/progetti/<slug> | grep '<title>'   # entry title in the HTML
curl -sI http://localhost:8787/sport          # still album.html via the Worker
rm -rf custom
```

Expected: the three checks as annotated. If `/archivio` redirects or falls to `album.html`, stop: the assumption about `html_handling` does not hold and the spec must be revisited before going further.

- [ ] **Step 4: Commit**

```bash
git add custom.example docs/site-pages.md docs/slots.md CUSTOMIZING.md
git commit -m "docs(site-pages): examples and guide for site pages"
```
