# F1 — Slot registry and replaceable landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a fork replace the home page landing with its own component, placed in an optional `custom/` folder that the template never ships, without editing any template file — and change nothing for forks that do not create `custom/`.

**Architecture:** A pure `createSlotResolver(defaults, overrides, contracts)` validates and resolves slot implementations. A thin `custom-slots.js` wires it to `import.meta.glob('/custom/slots.js')`, which yields `{}` when the file is absent. The current home rendering moves unchanged into a default `landing` slot with a `mount(container, ctx)` contract; `index.js` keeps owning data fetching and passes the data to the slot as a promise, so the skeleton still appears before the network answers.

**Tech Stack:** Vite 8 (`import.meta.glob`), JavaScript ES modules, Vitest 4 with jsdom, Markdown documentation.

**Spec:** `docs/superpowers/specs/2026-09-25-punti-di-aggancio-design.md`

**Verified against:** `main` @ `a757c45`; rechecked on `6b0d6db` (2026-09-25), no file of this plan changed.

**Fork folder name:** `custom/`, decided on 2026-09-26 (spec §6). The plan was first written with `site/`; every path, module and example has been renamed.

## Global Constraints

- Without `custom/`, the rendered home DOM keeps the same ids and classes as today: `#hero`, `#albums-heading.section-heading`, `#album-cards.album-cards`, `.album-card__skeleton`, `.page-error`.
- The existing assertions of `src/pages/index.test.js` keep passing. The test changes its fixture markup and gains one `vi.mock` that pins the template landing, so a fork whose `custom/` replaces the landing never breaks it.
- `custom/` is never committed to the template. `custom.example/` is the only template-owned example.
- The glob pattern matches exactly `/custom/slots.js`; `custom.example/` must never be picked up.
- An invalid `custom/slots.js` fails loudly: in the browser console in dev, and in `npm test` — which the documented deploy runs before building (`npm test && npm run build`) — through a test that runs only in forks that have `custom/`. Every message names `custom/slots.js`, the slot, and the expected contract. `vite build` alone never executes the resolver.
- No inline styles or inline scripts are introduced: the CSP (`style-src 'self'`, `script-src 'self'`) stays unchanged.
- Nav and footer stay template-owned in F1 (they become slots in F2).

## File Map

- `src/core/contracts.js` (create): `SLOT_CONTRACTS`, the single list of known slots and their contract kind.
- `src/core/slots.js` (create): `createSlotResolver`, pure and fully unit-tested.
- `src/core/slots.test.js` (create).
- `src/core/default-slots.js` (create): the template's implementation of every slot.
- `src/core/custom-slots.js` (create): glob wiring, exports `slot(name)`.
- `src/core/custom-slots.test.js` (create): proves the template resolves its defaults when `custom/` is absent.
- `src/components/Landing.js` (create): current home rendering behind the `mount` contract.
- `src/components/Landing.test.js` (create).
- `index.html` (modify): hero + albums markup replaced by `<div id="landing"></div>`.
- `src/styles/main.css` (modify): `#landing { display: contents; }`.
- `src/pages/index.js` (modify): fetch → data promise → `slot('landing')` → `mount`.
- `src/pages/index.test.js` (modify): fixture markup only.
- `src/pages/index.slots.test.js` (create): proves `index.js` delegates to the resolved slot.
- `custom.example/README.md`, `custom.example/slots.js`, `custom.example/landing/example-landing.js` (create).
- `docs/slots.md` (create), `CUSTOMIZING.md`, `docs/upgrading.md` (modify).

---

### Task 1: The slot resolver

> Added after review: a loader that throws or rejects is re-thrown as `custom/slots.js: slot "<name>" failed to load: <message>`, with the original error as `cause`, and a tenth test covers it. The code below is the version originally requested.

**Files:**
- Create: `src/core/contracts.js`, `src/core/slots.js`, `src/core/slots.test.js`

**Interfaces:**
- `SLOT_CONTRACTS: Record<string, 'mount' | 'create'>` — F1 declares only `landing: 'mount'`.
- `createSlotResolver(defaults, overrides, contracts) → (name: string) => Promise<object>`.
  - `defaults`: `{ [slot]: implementation }`, must cover every key of `contracts`.
  - `overrides`: `{ [slot]: () => Promise<module | implementation> }` from `custom/slots.js`.
  - Throws synchronously on unknown override keys or non-function loaders.
  - The returned function rejects on unknown slot names and on implementations missing the contract method.

- [ ] **Step 1: Write the failing tests**

Create `src/core/slots.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createSlotResolver } from './slots.js';

const contracts = { landing: 'mount', lightbox: 'create' };
const defaults = {
  landing: { mount: () => ({}) },
  lightbox: { create: () => ({ open() {}, close() {}, destroy() {} }) },
};

describe('createSlotResolver', () => {
  it('resolves the template default when custom/ overrides nothing', async () => {
    const slot = createSlotResolver(defaults, {}, contracts);
    expect(await slot('landing')).toBe(defaults.landing);
  });

  it('resolves an override exported as a module default', async () => {
    const custom = { mount: () => ({}) };
    const slot = createSlotResolver(defaults, { landing: async () => ({ default: custom }) }, contracts);
    expect(await slot('landing')).toBe(custom);
  });

  it('accepts an override loader that returns the implementation directly', async () => {
    const custom = { mount: () => ({}) };
    const slot = createSlotResolver(defaults, { landing: async () => custom }, contracts);
    expect(await slot('landing')).toBe(custom);
  });

  it('keeps defaults for slots custom/ does not override', async () => {
    const slot = createSlotResolver(defaults, { landing: async () => ({ mount() {} }) }, contracts);
    expect(await slot('lightbox')).toBe(defaults.lightbox);
  });

  it('rejects an unknown override name at creation, naming the known slots', () => {
    expect(() => createSlotResolver(defaults, { langing: async () => ({}) }, contracts))
      .toThrow(/custom\/slots\.js.*"langing".*landing, lightbox/);
  });

  it('rejects an override that is not a loader function', () => {
    expect(() => createSlotResolver(defaults, { landing: { mount() {} } }, contracts))
      .toThrow(/custom\/slots\.js.*"landing".*\(\) => import/);
  });

  it('rejects an implementation that misses its contract method', async () => {
    const slot = createSlotResolver(defaults, { lightbox: async () => ({ default: { mount() {} } }) }, contracts);
    await expect(slot('lightbox')).rejects.toThrow(/"lightbox".*create\(/);
  });

  it('rejects an unknown slot name asked by template code', async () => {
    const slot = createSlotResolver(defaults, {}, contracts);
    await expect(slot('sidebar')).rejects.toThrow(/Unknown slot "sidebar"/);
  });

  it('refuses defaults that do not cover every declared slot', () => {
    expect(() => createSlotResolver({ landing: defaults.landing }, {}, contracts))
      .toThrow(/default implementation.*"lightbox"/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/slots.test.js`
Expected: FAIL — `Cannot find module './slots.js'`.

- [ ] **Step 3: Implement the resolver and the contract list**

Create `src/core/contracts.js`:

```js
/**
 * Every slot the template knows, with the method its implementation must expose.
 * 'mount'  → mount(container, ctx) returning { destroy?() } (or a promise of it)
 * 'create' → create(items, ctx) returning an instance
 * Adding a slot here without a default in default-slots.js fails at startup.
 */
export const SLOT_CONTRACTS = {
  landing: 'mount',
};
```

Create `src/core/slots.js`:

```js
/**
 * Resolves replaceable parts of the site ("slots").
 * Pure: receives defaults, fork overrides and contracts, touches no global.
 * Errors name custom/slots.js because that is the only file a fork edits.
 *
 * @param {Record<string, object>} defaults - Template implementations, one per slot.
 * @param {Record<string, Function>} overrides - Lazy loaders from custom/slots.js.
 * @param {Record<string, 'mount'|'create'>} contracts - Known slots and their method.
 * @returns {(name: string) => Promise<object>} Resolver.
 */
export function createSlotResolver(defaults, overrides, contracts) {
  const known = Object.keys(contracts);

  for (const name of known) {
    if (!defaults[name]) {
      throw new Error(`Template bug: no default implementation for slot "${name}".`);
    }
  }
  for (const [name, loader] of Object.entries(overrides ?? {})) {
    if (!known.includes(name)) {
      throw new Error(`custom/slots.js: unknown slot "${name}". Known slots: ${known.join(', ')}.`);
    }
    if (typeof loader !== 'function') {
      throw new Error(`custom/slots.js: slot "${name}" must be a loader, e.g. () => import('./my-component.js').`);
    }
  }

  return async function slot(name) {
    if (!known.includes(name)) throw new Error(`Unknown slot "${name}".`);
    const loader = overrides?.[name];
    if (!loader) return defaults[name];
    const loaded = await loader();
    const impl = loaded?.default ?? loaded;
    const method = contracts[name];
    if (typeof impl?.[method] !== 'function') {
      throw new Error(`custom/slots.js: slot "${name}" must export default { ${method}(…) }.`);
    }
    return impl;
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/slots.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/contracts.js src/core/slots.js src/core/slots.test.js
git commit -m "feat(slots): add pure slot resolver and contract list"
```

---

### Task 2: The default landing component

**Files:**
- Create: `src/components/Landing.js`, `src/components/Landing.test.js`

**Interfaces:**
- `landing.mount(container, { texts, data }) → Promise<{ destroy() }>`
- `data: Promise<{ site, albums: Array|null, albumsError: string|null, r2PublicUrl: string|undefined }>`
- Renders synchronously, before awaiting `data`: the heading and two `.album-card__skeleton`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/Landing.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./Hero.js', () => ({ renderHero: vi.fn() }));

const texts = {
  landing: { albumsSectionHeading: 'Album' },
  album: { error: { network: 'Rete assente', unknown: 'Errore' } },
};
const site = { name: 'Nome', bio: '', heroUrl: null, social: {} };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

describe('default landing slot', () => {
  let container;
  beforeEach(() => {
    document.body.innerHTML = '<div id="landing"></div>';
    container = document.getElementById('landing');
  });

  it('shows heading and skeletons before data arrives', async () => {
    const { landing } = await import('./Landing.js');
    const d = deferred();
    const mounted = landing.mount(container, { texts, data: d.promise });

    expect(container.querySelector('#albums-heading').textContent).toBe('Album');
    expect(container.querySelectorAll('.album-card__skeleton')).toHaveLength(2);
    expect(container.querySelector('#hero')).not.toBeNull();

    d.resolve({ site, albums: [], albumsError: null, r2PublicUrl: 'https://pub-test.r2.dev' });
    await mounted;
    expect(container.querySelectorAll('.album-card__skeleton')).toHaveLength(0);
  });

  it('renders one card per album', async () => {
    const { landing } = await import('./Landing.js');
    const albums = [{ slug: 'sport', title: 'Sport', description: '', coverName: null }];
    await landing.mount(container, {
      texts,
      data: Promise.resolve({ site, albums, albumsError: null, r2PublicUrl: 'https://pub-test.r2.dev' }),
    });
    expect(container.querySelector('a.album-card[href="/sport"]')).not.toBeNull();
  });

  it('shows the network message when albums could not be loaded', async () => {
    const { landing } = await import('./Landing.js');
    await landing.mount(container, {
      texts,
      data: Promise.resolve({ site, albums: null, albumsError: 'NETWORK', r2PublicUrl: undefined }),
    });
    expect(container.querySelector('.page-error').textContent).toBe('Rete assente');
  });

  it('destroy empties its container', async () => {
    const { landing } = await import('./Landing.js');
    const handle = await landing.mount(container, {
      texts,
      data: Promise.resolve({ site, albums: [], albumsError: null, r2PublicUrl: undefined }),
    });
    handle.destroy();
    expect(container.children).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/Landing.test.js`
Expected: FAIL — `Cannot find module './Landing.js'`.

- [ ] **Step 3: Implement the landing by moving today's home rendering**

Create `src/components/Landing.js`. The markup is the one `index.html` contains today, moved verbatim so CSS and ids do not change:

```js
import { renderHero } from './Hero.js';
import { createAlbumCard } from './AlbumCard.js';
import { albumsToCards } from '../pages/home-logic.js';

/**
 * Default "landing" slot: hero, section heading, album cards.
 * Skeletons appear synchronously; content replaces them when `data` resolves.
 */
export const landing = {
  /**
   * @param {HTMLElement} container - The #landing element.
   * @param {{texts: object, data: Promise<object>}} ctx - UI texts and the home data promise.
   * @returns {Promise<{destroy: Function}>} Handle.
   */
  async mount(container, { texts, data }) {
    container.innerHTML = `
      <section id="hero"></section>
      <main class="page-main">
        <div class="container">
          <h2 id="albums-heading" class="section-heading"></h2>
          <div id="album-cards" class="album-cards"></div>
        </div>
      </main>
    `;
    container.querySelector('#albums-heading').textContent = texts.landing.albumsSectionHeading;
    const cardsEl = container.querySelector('#album-cards');
    cardsEl.innerHTML = '<div class="album-card__skeleton"></div><div class="album-card__skeleton"></div>';

    const { site, albums, albumsError, r2PublicUrl } = await data;
    renderHero(container.querySelector('#hero'), site, texts);

    cardsEl.innerHTML = '';
    if (albums === null) {
      const p = document.createElement('p');
      p.className = 'page-error';
      p.textContent = albumsError === 'NETWORK' ? texts.album.error.network : texts.album.error.unknown;
      cardsEl.appendChild(p);
    } else {
      albumsToCards(albums, r2PublicUrl).forEach(card => cardsEl.appendChild(createAlbumCard(card)));
    }

    return { destroy() { container.replaceChildren(); } };
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/Landing.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/Landing.js src/components/Landing.test.js
git commit -m "feat(slots): move home rendering into the default landing slot"
```

---

### Task 3: Wire the landing slot into the home page

**Files:**
- Create: `src/core/default-slots.js`, `src/core/custom-slots.js`, `src/core/custom-slots.test.js`, `src/pages/index.slots.test.js`
- Modify: `index.html`, `src/styles/main.css`, `src/pages/index.js`, `src/pages/index.test.js`

**Interfaces:**
- `slot(name) → Promise<implementation>` exported by `src/core/custom-slots.js`.
- `index.js` passes `{ texts, data }` to `landing.mount(document.getElementById('landing'), …)`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/custom-slots.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { landing } from '../components/Landing.js';
import { SLOT_CONTRACTS } from './contracts.js';

const hasCustom = Object.keys(import.meta.glob('/custom/slots.js')).length > 0;

describe('custom slots wiring', () => {
  // The template ships custom.example/ but never custom/: resolving the default here
  // also proves that the example is never picked up.
  it.skipIf(hasCustom)('resolves the template landing when custom/ is absent', async () => {
    const { slot } = await import('./custom-slots.js');
    expect(await slot('landing')).toBe(landing);
  });

  // Runs only in forks. An invalid custom/slots.js fails npm test — and therefore the
  // deploy — instead of breaking the page in front of visitors.
  it.runIf(hasCustom)('custom/slots.js is valid: every slot resolves', async () => {
    const { slot } = await import('./custom-slots.js');
    for (const name of Object.keys(SLOT_CONTRACTS)) {
      await expect(slot(name)).resolves.toBeTruthy();
    }
  });
});
```

Create `src/pages/index.slots.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted: vi.mock factories are hoisted above plain declarations.
const { mount } = vi.hoisted(() => ({ mount: vi.fn(async () => ({ destroy() {} })) }));

vi.mock('../core/custom-slots.js', () => ({ slot: vi.fn(async () => ({ mount })) }));
vi.mock('../providers/data.js', () => ({
  fetchSite: vi.fn(async () => ({ ok: true, data: { name: 'Runtime', bio: '', hero: null, social: {} } })),
  fetchAlbums: vi.fn(async () => ({ ok: true, data: [] })),
  fetchConfig: vi.fn(async () => ({ ok: true, data: { r2PublicUrl: 'https://pub-test.r2.dev' } })),
}));
vi.mock('../utils/validateConfig.js', () => ({ validateSiteConfig: vi.fn() }));
vi.mock('../components/Nav.js', () => ({ renderNav: vi.fn() }));
vi.mock('../components/Footer.js', () => ({ renderFooter: vi.fn() }));

describe('home page delegates to the landing slot', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<nav id="site-nav"></nav><div id="landing"></div><footer id="site-footer"></footer>';
  });

  it('mounts the resolved slot in #landing with texts and a data promise', async () => {
    await import('./index.js');
    expect(mount).toHaveBeenCalledTimes(1);
    const [container, ctx] = mount.mock.calls[0];
    expect(container.id).toBe('landing');
    expect(ctx.texts.landing).toBeDefined();
    const data = await ctx.data;
    expect(data.site.name).toBe('Runtime');
    expect(data.albums).toEqual([]);
    expect(data.albumsError).toBeNull();
    expect(data.r2PublicUrl).toBe('https://pub-test.r2.dev');
  });
});
```

In `src/pages/index.test.js`, make two changes and nothing else. First, replace the fixture in `beforeEach` — the whole `document.body.innerHTML = …;` statement — with the block below. Second, right after the line `vi.mock('../components/Hero.js', () => ({ renderHero: vi.fn() }));`, add:

```js
// This test covers the home page with the template landing. Pinning the slot keeps it
// true in a fork whose custom/ replaces the landing; custom-slots.test.js checks the fork's own slots.
vi.mock('../core/custom-slots.js', async () => {
  const { landing } = await import('../components/Landing.js');
  return { slot: async () => landing };
});
```

The new fixture:

```js
    document.body.innerHTML = `
      <nav id="site-nav"></nav>
      <div id="landing"></div>
      <footer id="site-footer"></footer>
    `;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/custom-slots.test.js src/pages/index.slots.test.js src/pages/index.test.js`
Expected: FAIL — `./custom-slots.js` does not exist; `index.test.js` fails because `#albums-heading` is no longer in the fixture.

- [ ] **Step 3: Implement the wiring**

Create `src/core/default-slots.js`:

```js
// The template's implementation of every slot declared in contracts.js.
export { landing } from '../components/Landing.js';
```

Create `src/core/custom-slots.js`:

```js
/**
 * Connects the resolver to the fork's optional custom/slots.js.
 * import.meta.glob returns {} when the file does not exist: forks without
 * custom/ need no configuration and see the template defaults.
 */
import { createSlotResolver } from './slots.js';
import { SLOT_CONTRACTS } from './contracts.js';
import * as defaults from './default-slots.js';

const found = import.meta.glob('/custom/slots.js', { eager: true });
const customModule = Object.values(found)[0];

export const slot = createSlotResolver({ ...defaults }, customModule?.default ?? {}, SLOT_CONTRACTS);
```

In `index.html`, replace:

```html
    <section id="hero"></section>
    <main class="page-main">
      <div class="container">
        <h2 id="albums-heading" class="section-heading"></h2>
        <div id="album-cards" class="album-cards"></div>
      </div>
    </main>
```

with:

```html
    <div id="landing"></div>
```

Append to `src/styles/main.css` (the wrapper must not change layout; a class in a stylesheet, not an inline style, because the CSP forbids inline styles):

```css
/* Slot container: generates no box, so the landing's children lay out as before. */
#landing {
  display: contents;
}
```

Replace the body of `src/pages/index.js` after the imports with:

```js
import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { albums as buildAlbums } from '../../config/albums.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums, fetchConfig } from '../providers/data.js';
import { resolveSiteContent, resolveAlbums } from './home-logic.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { slot } from '../core/custom-slots.js';

validateSiteConfig(siteConfig);

// Fetching stays here, not in the slot: every landing — template or custom/ —
// receives the same resolved data, with the same seed fallback rules.
const data = (async () => {
  const [siteRes, albumsRes, configRes] = await Promise.all([fetchSite(), fetchAlbums(), fetchConfig()]);
  const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
  const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
  const albums = resolveAlbums(albumsRes, buildAlbums);
  return { site, albums, albumsError: albums === null ? albumsRes.error : null, r2PublicUrl };
})();

const landing = await slot('landing');
const mounted = landing.mount(document.getElementById('landing'), { texts, data });

const { site } = await data;
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);
renderFooter(document.getElementById('site-footer'), texts, site.social);
await mounted;
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new ones. In particular `index.test.js` still finds `a.album-card[href="/nome-album"]` and `.page-error`, now rendered inside `#landing`.

- [ ] **Step 5: Verify the page did not change** *(controller, in a browser — the implementer skips this step)*

Run: `npm run dev`, open `/`.
Expected: hero, heading and album cards look exactly as before; no console error; the DOM shows the same elements one level deeper, inside `<div id="landing">`.

- [ ] **Step 6: Commit**

```bash
git add index.html src/styles/main.css src/core/default-slots.js src/core/custom-slots.js src/core/custom-slots.test.js src/pages/index.js src/pages/index.test.js src/pages/index.slots.test.js
git commit -m "feat(slots): home page resolves its landing through the slot registry"
```

---

### Task 4: `custom.example/` and documentation

**Files:**
- Create: `custom.example/README.md`, `custom.example/slots.js`, `custom.example/landing/example-landing.js`, `docs/slots.md`
- Modify: `CUSTOMIZING.md`, `docs/upgrading.md`

- [ ] **Step 1: Create the example**

`custom.example/slots.js`:

```js
// Copy this folder to custom/ to activate it. Only the slots listed here are replaced;
// every other part of the site keeps the template implementation.
export default {
  landing: () => import('./landing/example-landing.js'),
};
```

`custom.example/landing/example-landing.js`:

```js
/**
 * Minimal landing: site name and a plain list of albums.
 * Shows the contract only — style it from custom/theme.css (F2).
 */
export default {
  async mount(container, { data }) {
    const { site, albums } = await data;

    const main = document.createElement('main');
    main.className = 'page-main';
    const inner = document.createElement('div');
    inner.className = 'container';

    const h1 = document.createElement('h1');
    h1.className = 'section-heading';
    h1.textContent = site.name;

    const list = document.createElement('ul');
    for (const album of albums ?? []) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `/${album.slug}`;
      a.textContent = album.title;
      li.appendChild(a);
      list.appendChild(li);
    }

    inner.append(h1, list);
    main.appendChild(inner);
    container.replaceChildren(main);
    return { destroy() { container.replaceChildren(); } };
  },
};
```

`custom.example/README.md`, with exactly the content of this block (not the outer fence lines):

````markdown
# `custom/` — your own code, never in the template

`custom/` is the one folder the template never ships and never changes. A fork creates it to replace whole parts of the site with its own components without editing any file that comes from the template, so `git merge upstream/main` never conflicts there.

This folder, `custom.example/`, is a minimal working example.

## Activate it

```bash
cp -r custom.example custom
```

`custom/slots.js` lists the parts to replace; every part it does not list keeps the template implementation. Delete `custom/` and the site is back to the template defaults.

## Rules

- A slot implementation gets everything it needs as arguments: the element to render into and a context object. See `docs/slots.md`.
- Do not import from `src/`: those files are internal and may change in any template update.
- Commit `custom/` in your fork. Never commit it to the template itself.
````

- [ ] **Step 2: Write `docs/slots.md`**

Create `docs/slots.md` with exactly the content of this block (not the outer fence lines):

````markdown
# Slots — replacing whole parts of the site

A *slot* is a part of the site that a fork can replace with its own component, declared in `custom/slots.js`, without editing template files. At runtime the template resolves each slot to the fork's implementation when `custom/slots.js` provides one, and to its own default otherwise.

| Slot | Contract | What it covers |
|---|---|---|
| `landing` | `mount` | home page: hero, section heading and album cards |

This table is the complete list of slots in this version of the template.

## Declaring an override

`custom/slots.js` exports an object that maps slot names to **loaders**:

```js
export default {
  landing: () => import('./landing/my-landing.js'),
};
```

The loaded module exports the implementation as `default`; a loader may also return the implementation directly.

## The `mount` contract

```js
export default {
  async mount(container, ctx) {
    // render into container
    return { destroy() { container.replaceChildren(); } };
  },
};
```

`mount` receives the element to render into and a context object. It returns — or resolves to — a handle whose optional `destroy()` removes what it rendered.

### `landing`

- `container` — the `#landing` element of `index.html`. It has `display: contents`, so it adds no box of its own.
- `ctx.texts` — the UI texts from `config/texts.config.js`.
- `ctx.data` — a **promise** of `{ site, albums, albumsError, r2PublicUrl }`:
  - `site` — name, bio, hero image URL and social links, read from R2 with the build values as fallback;
  - `albums` — the albums to show, or `null` when they could not be loaded;
  - `albumsError` — the error code when `albums` is `null` (for example `'NETWORK'`), otherwise `null`;
  - `r2PublicUrl` — the public URL of the photo bucket.

`ctx.data` is a promise so that a landing can draw its skeleton at once, before the network answers: render first, then `await ctx.data`. Fetching stays in the template, so every landing — default or custom — receives the same data with the same fallback rules.

## Errors you can meet

They appear in the browser console, and in a fork they make `npm test` fail — which also stops the deploy, since it runs `npm test && npm run build`:

- `custom/slots.js: unknown slot "<name>". Known slots: …` — a key of `custom/slots.js` is not a slot.
- `custom/slots.js: slot "<name>" must be a loader, e.g. () => import('./my-component.js').` — the value is not a function.
- `custom/slots.js: slot "<name>" must export default { mount(…) }.` — the loaded module does not implement the contract.
- `custom/slots.js: slot "<name>" failed to load: …` — the loader threw or the module could not be imported: a wrong path, or an error inside your component. The original error follows the colon.

## Stability

Slot names, contract methods and the fields of `ctx` are the public surface of `custom/`. Changing any of them is a breaking change, announced in `docs/upgrading.md`. Everything else in `src/` is internal and may change in any update.
````

- [ ] **Step 3: Update `CUSTOMIZING.md`**

Two edits, nothing else.

1. In the section whose heading is the line below:

   ```text
   ### Behavior (`src/`)
   ```

   replace this sentence:

   ```text
   Keep customizations in `config/` and `theme/`, the only designated extension points.
   ```

   with:

   ```text
   Keep customizations in `config/`, `theme/` and `custom/`, the designated extension points: to replace a whole part of the site, use `custom/` (see below) instead of editing `src/`.
   ```

2. Immediately before the line `## After every file change`, insert exactly the content of this block (not the outer fence lines). The `---` line that already precedes the insertion point stays where it is:

````markdown
## Replacing a whole part: `custom/`

When `config/` and `theme/` are not enough — a different landing, for example — create `custom/` from the example and declare there the parts you replace:

```bash
cp -r custom.example custom
```

The template never contains `custom/`, so `git merge upstream/main` never conflicts there. Commit it in your fork. The parts you can replace, their contracts and the errors you can meet are in [`docs/slots.md`](docs/slots.md).

---

````

- [ ] **Step 4: Update `docs/upgrading.md`**

Add a row to the table "What each file does during an update":

| File | What happens | Is that right? |
|---|---|---|
| `custom/` | untouched — the template never ships it | yes. Read the release notes for slot contract changes |

- [ ] **Step 5: Verify the example end to end**

```bash
cp -r custom.example custom
npm test
npm run build
rm -rf custom
npm test
npm run build
```

Expected: with `custom/` present, tests pass — the default-landing test is skipped and the validation test runs and passes, which proves the example is valid — and the build succeeds. After removing `custom/`, tests and build pass exactly as before. `custom/` must not exist when you commit. The browser check of the example landing is done by the controller; the implementer skips it.

- [ ] **Step 6: Commit**

```bash
git add custom.example docs/slots.md CUSTOMIZING.md docs/upgrading.md
git commit -m "docs(slots): add custom.example and document the custom/ extension point"
```
