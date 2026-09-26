# F2a — Minimal public API for `custom/` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give code in `custom/` one stable module to import from the template, `src/api/index.js`, starting with the single helper a custom landing needs to show album covers: `albumsToCards`.

**Architecture:** `src/api/index.js` re-exports `albumsToCards` from `src/pages/home-logic.js`; a test pins the export list, so removing or renaming an export becomes a deliberate, announced change. `custom.example/` uses the API to show covers and ships a test of its own component, which the template suite runs too. The documentation states how to import the API and what it returns.

**Tech Stack:** JavaScript ES modules, Vite 8, Vitest 4 (jsdom).

**Spec:** `docs/maintainers/superpowers/specs/2026-09-25-punti-di-aggancio-design.md`
**Depends on:** F1 (merged in `main` at `e609df7`).
**Decided by the user (2026-09-26):** `src/api` ships before the rest of F2, minimal: only what a landing needs to show covers. The rest of the API arrives with F2, by adding exports.
**Verified against:** `main` @ `e609df7`. Baseline: 464 passed, 1 skipped, 57 files.

## Global Constraints

- `src/api/index.js` exports exactly `albumsToCards`. The list is pinned by a test: adding an export later is safe, removing or renaming one breaks forks and must be announced in `docs/upgrading.md`.
- Code in `custom/` imports the API with a path from the project root: `import { albumsToCards } from '/src/api/index.js';`. Verified on `e609df7`: it resolves in `npm test` and in the build.
- `albumsToCards(albums, r2PublicUrl)` returns `[{ slug, title, description, coverUrl }]`; `coverUrl` is the full URL, or `null` when the album has no cover or `r2PublicUrl` is missing. Its behavior does not change in this plan.
- `custom/` is never committed; `custom.example/` is the only template-owned example.
- CSP: no inline styles or scripts, no `innerHTML` with data. Images from the photo bucket are allowed.
- Files in `src/` and `custom.example/` use semicolons.
- The template's build check is `ALLOW_PLACEHOLDER_CSP=1 npm run build`.
- Commit only the files each task names, with explicit `git add <paths>`. Never `git add -A` or `git add .`. Never commit `package-lock.json`.

## File Map

- `src/api/index.js` (create) + `src/api/index.test.js` (create).
- `docs/slots.md`, `custom.example/README.md`, `docs/upgrading.md` (modify).
- `custom.example/landing/example-landing.js`, `custom.example/landing/example-landing.css` (modify), `custom.example/landing/example-landing.test.js` (create).

---

### Task 1: The public API and its documentation

**Files:**
- Create: `src/api/index.js`, `src/api/index.test.js`
- Modify: `docs/slots.md`, `custom.example/README.md`, `docs/upgrading.md`

**Interfaces:**
- Consumes: `albumsToCards(albums, r2PublicUrl)` from `src/pages/home-logic.js` (unchanged).
- Produces: `src/api/index.js` exporting `albumsToCards`. Task 2 imports it as `/src/api/index.js`.

- [x] **Step 1: Write the failing test**

Create `src/api/index.test.js`:

```js
import { describe, expect, it } from 'vitest';
import * as api from './index.js';
import { albumsToCards } from '../pages/home-logic.js';

describe('public API for custom/', () => {
  it('exports exactly the documented surface', () => {
    // Pinned on purpose: removing or renaming an export breaks forks and must be a
    // deliberate change, announced in docs/upgrading.md. Adding one is safe.
    expect(Object.keys(api).sort()).toEqual(['albumsToCards']);
  });

  it('albumsToCards is the template helper: cards with a cover URL', () => {
    expect(api.albumsToCards).toBe(albumsToCards);
    expect(api.albumsToCards(
      [{ slug: 'sport', title: 'Sport', description: 'Gare', coverName: 'c.webp' }],
      'https://photos.example.com',
    )).toEqual([
      { slug: 'sport', title: 'Sport', description: 'Gare', coverUrl: 'https://photos.example.com/sport/c.webp' },
    ]);
  });
});
```

- [x] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/api/index.test.js`
Expected: FAIL — cannot find module `./index.js`.

- [x] **Step 3: Create the module**

Create `src/api/index.js`:

```js
/**
 * The only module code in custom/ may import. Everything else in src/ is internal
 * and may change in any template update. Removing or renaming an export here is a
 * breaking change for forks: note it in docs/upgrading.md. Adding one is safe.
 */
export { albumsToCards } from '../pages/home-logic.js';
```

- [x] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/api/index.test.js`
Expected: PASS, 2 tests.

- [x] **Step 5: Document the API in `docs/slots.md`**

Three edits.

1. Replace this paragraph:

   ```text
   Cover images are not in `ctx` as URLs yet. The helpers that build photo URLs are planned as part of the public API for `custom/` code; until then, a custom landing that shows covers depends on template internals.
   ```

   with:

   ```text
   To show covers, turn `albums` into cards with `albumsToCards` from the public API (below): each card has a `coverUrl`.
   ```

2. Immediately before the line `## What your code runs under`, insert exactly the content of this block (not the outer fence lines):

````markdown
## The public API: `src/api/index.js`

Code in `custom/` imports from the template only through `src/api/index.js`. Import it with a path from the project root: it works at any depth inside `custom/`, in `npm test` and in the build.

```js
import { albumsToCards } from '/src/api/index.js';
```

| Export | Call | Returns |
|---|---|---|
| `albumsToCards` | `albumsToCards(albums, r2PublicUrl)` | an array of `{ slug, title, description, coverUrl }`. `coverUrl` is the full URL of the cover, or `null` when the album has no cover or `r2PublicUrl` is missing |

In a landing, pass the two fields of `ctx.data`:

```js
const { albums, r2PublicUrl } = await ctx.data;
const cards = albums === null ? [] : albumsToCards(albums, r2PublicUrl);
```

This is the complete list today. It grows as later versions of the template need it; an export is never removed or renamed without a note in `docs/upgrading.md`.

````

3. In the section `## Stability`, replace:

   ```text
   Slot names, contract methods and the fields of `ctx` are the public surface of `custom/`. Changing any of them is a breaking change, announced in `docs/upgrading.md`.
   ```

   with:

   ```text
   Slot names, contract methods, the fields of `ctx` and the exports of `src/api/index.js` are the public surface of `custom/`. Removing or renaming any of them is a breaking change, announced in `docs/upgrading.md`; adding one is not.
   ```

- [x] **Step 6: Update the rule in `custom.example/README.md`**

Replace this line:

```text
- Do not import from `src/`: those files are internal and may change in any template update.
```

with:

```text
- From the template, import only `src/api/index.js`, as `/src/api/index.js`: every other file in `src/` is internal and may change in any template update.
```

- [x] **Step 7: Update `docs/upgrading.md`**

In the subsection whose heading is the line below:

```text
### Slots and `custom/`
```

replace:

```text
An update that renames a slot, changes a contract method or changes a field of a slot's `ctx` is listed here.
```

with:

```text
An update that renames a slot, changes a contract method, changes a field of a slot's `ctx`, or removes or renames an export of `src/api/index.js` is listed here.
```

- [x] **Step 8: Full suite and commit**

Run: `npm test`
Expected: 466 passed, 1 skipped, 58 files.

```bash
git add src/api/index.js src/api/index.test.js docs/slots.md custom.example/README.md docs/upgrading.md
git commit -m "feat(api): public API for custom/ code, starting with albumsToCards"
```

---

### Task 2: The example shows covers through the API, with its own test

**Files:**
- Modify: `custom.example/landing/example-landing.js`, `custom.example/landing/example-landing.css`, `custom.example/README.md`
- Create: `custom.example/landing/example-landing.test.js`

**Interfaces:**
- Consumes: `albumsToCards` from `/src/api/index.js` (Task 1); the `landing` contract `mount(container, { texts, data })` from F1.
- Produces: nothing later tasks import.

Why a test inside `custom.example/`: `docs/slots.md` tells forks to test their own component in `custom/**/*.test.js`. The example shows how, and because Vitest's default include also picks up `custom.example/`, the template's own suite keeps the example from breaking.

- [x] **Step 1: Write the failing test**

Create `custom.example/landing/example-landing.test.js`:

```js
import { describe, expect, it } from 'vitest';
import landing from './example-landing.js';

const texts = { album: { error: { network: 'Rete assente', unknown: 'Errore' } } };
const site = { name: 'Nome', bio: '', heroUrl: null, social: {} };

const mountWith = async data => {
  const container = document.createElement('div');
  await landing.mount(container, { texts, data: Promise.resolve({ site, albumsError: null, r2PublicUrl: 'https://photos.example.com', ...data }) });
  return container;
};

describe('example landing', () => {
  it('links every album, with its cover when it has one', async () => {
    const container = await mountWith({
      albums: [
        { slug: 'sport', title: 'Sport', description: '', coverName: 'c.webp' },
        { slug: 'viaggi', title: 'Viaggi', description: '', coverName: null },
      ],
    });
    const sport = container.querySelector('a[href="/sport"]');
    expect(sport.textContent).toBe('Sport');
    expect(sport.querySelector('img').getAttribute('src')).toBe('https://photos.example.com/sport/c.webp');
    expect(container.querySelector('a[href="/viaggi"] img')).toBeNull();
  });

  it('shows the error message when the albums could not be loaded', async () => {
    const container = await mountWith({ albums: null, albumsError: 'NETWORK' });
    expect(container.querySelector('p').textContent).toBe('Rete assente');
    expect(container.querySelector('a')).toBeNull();
  });
});
```

- [x] **Step 2: Run it and verify it fails**

Run: `npx vitest run custom.example/landing/example-landing.test.js`
Expected: FAIL on the first test — the example does not render covers yet. The second test may already pass: it pins behavior that exists.

- [x] **Step 3: Use the API in the example**

Replace the whole content of `custom.example/landing/example-landing.js` with:

```js
import './example-landing.css';
import { albumsToCards } from '/src/api/index.js';

/**
 * Minimal landing: site name and the albums with their covers.
 * Shows the contract and the public API. A landing can import its own stylesheet, as this one does.
 */
export default {
  async mount(container, { texts, data }) {
    const { site, albums, albumsError, r2PublicUrl } = await data;

    const main = document.createElement('main');
    main.className = 'page-main example-landing';
    const inner = document.createElement('div');
    inner.className = 'container';

    const h1 = document.createElement('h1');
    h1.className = 'section-heading';
    h1.textContent = site.name;
    inner.appendChild(h1);

    if (albums === null) {
      // ctx.data never rejects: a failed load arrives as albums === null plus albumsError.
      const p = document.createElement('p');
      p.textContent = albumsError === 'NETWORK' ? texts.album.error.network : texts.album.error.unknown;
      inner.appendChild(p);
    } else {
      const list = document.createElement('ul');
      for (const card of albumsToCards(albums, r2PublicUrl)) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `/${card.slug}`;
        if (card.coverUrl) {
          const img = document.createElement('img');
          img.src = card.coverUrl;
          img.alt = '';
          img.loading = 'lazy';
          a.appendChild(img);
        }
        a.append(card.title);
        li.appendChild(a);
        list.appendChild(li);
      }
      inner.appendChild(list);
    }

    main.appendChild(inner);
    container.replaceChildren(main);
    return { destroy() { container.replaceChildren(); } };
  },
};
```

`alt` is empty on purpose: the album title follows the image inside the same link, so the image is decorative.

- [x] **Step 4: Size the covers**

Append to `custom.example/landing/example-landing.css`:

```css

.example-landing img {
  display: block;
  width: 12rem;
  aspect-ratio: 4 / 5;
  object-fit: cover;
}
```

- [x] **Step 5: Point to the example test in `custom.example/README.md`**

In the `## Rules` list, after the bullet that begins `- Your code runs under the site's Content Security Policy`, add:

```text
- `landing/example-landing.test.js` shows how to test your own component: `npm test` runs every `*.test.js` under `custom/`. Replace it with tests for your landing.
```

- [x] **Step 6: Run the tests**

Run: `npx vitest run custom.example/landing/example-landing.test.js`
Expected: PASS, 2 tests.

Run: `npm test`
Expected: 468 passed, 1 skipped, 59 files.

- [x] **Step 7: Verify the example as a fork uses it**

```bash
cp -r custom.example custom
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build
rm -rf custom
git status --short
```

Expected: with `custom/` present, 470 passed and 1 skipped in 60 files — the example test runs twice, from `custom.example/` and from `custom/`, and a different test is the skipped one; the build succeeds; after `rm -rf custom` the status shows only this task's files.

The browser check of the example is done by the controller; the implementer skips it.

- [x] **Step 8: Commit**

```bash
git add custom.example/landing/example-landing.js custom.example/landing/example-landing.css custom.example/landing/example-landing.test.js custom.example/README.md
git commit -m "docs(api): the example shows covers through the public API, with its own test"
```

## Completion record — 2026-09-26

Merged locally into `main` by merge commit `8f3b4d8785fa840c5c311a73390c398c5721dee0` (parent before merge: `e609df7`). On the merged tree, `npm test` passed with 59 files, 470 passed, 1 skipped; `ALLOW_PLACEHOLDER_CSP=1 npm run build` passed. At `13bd30f`, the controller separately verified the example copied to a temporary `custom/`: 60 files, 472 passed, 1 skipped, and placeholder-CSP build passed. The final-review correction to Vitest discovery was verified with a temporary nested `.worktrees` test fixture: RED collected it (60 files); GREEN excluded it (59 files). The fixture was removed. No remote or deployment was checked.
