# F2 — Chrome and album slots, page events, custom theme, public API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the extension surface started in F1: nav, footer, photo grid and lightbox become slots; pages emit lifecycle and photo events that `custom/setup.js` can listen to; `custom/theme.css` loads after `theme/`; `src/api/index.js` becomes the only module code in `custom/` may import.

**Architecture:** The slot registry from F1 gains four contracts. Template components stay as they are and get thin adapters in `default-slots.js`, so their existing tests keep covering them. A tiny event bus and a pure page-lifecycle factory emit `page:ready`, `page:leave`, `photo:open`, `photo:close`. `custom/setup.js` and `custom/theme.css` are discovered with `import.meta.glob`, like `custom/slots.js`.

**Tech Stack:** Vite 8 (`import.meta.glob`), JavaScript ES modules, Vitest 4 with jsdom.

**Spec:** `docs/superpowers/specs/2026-09-25-punti-di-aggancio-design.md`
**Depends on:** F1 (`docs/superpowers/plans/2026-09-25-f1-slot-landing.md`).
**Status (2026-09-26):** written before F1 shipped. The F1 final review found three points below that this plan must honour (the three new Global Constraints). Decided by the user on 2026-09-26: **(1) static defaults on every page — accepted.** Measured on the production build: +1.5 KB gzip on the home page, +1.8 on the album page, +3.9 on the about page (from 5.8 to 9.7); no component stylesheet has a selector outside a class, so loading them all changes no page's appearance. **(2) `src/api` ships earlier and minimal, in F2a** (`docs/superpowers/plans/2026-09-26-f2a-api-pubblica-minima.md`), with only `albumsToCards`. Re-verify the plan against the code before executing.

## Global Constraints

- Without `custom/`, every page renders the same DOM as after F1; all existing tests pass with fixture-only changes, if any.
- `renderNav`, `renderFooter`, `renderGrid`, `renderSkeletons`, `createLightbox` keep their current signatures; the only change is an optional second argument `{ onClose }` to `createLightbox`.
- Skeletons on the album page stay template-owned and appear before any fetch, exactly as today.
- A listener that throws never breaks the page: the bus logs and continues with the next listener.
- `custom/setup.js` runs at most once per page load, before any slot is mounted.
- The dashboard (`admin.html`) does not load `custom/theme.css` and does not use slots: it is template territory.
- `src/api/index.js` exports are pinned by a test; removing or renaming one is a breaking change noted in `docs/upgrading.md`.
- **Every page test pins `custom-slots.js` to the template defaults** — `vi.mock('../core/custom-slots.js', async () => { const defaults = await import('../core/default-slots.js'); return { slot: async name => defaults[name] }; })`, as `index.test.js` does since F1. In a fork, a page test that resolves the real slots would mount the fork's components under jsdom and fail the deploy, which runs `npm test`.
- **Nav and footer never wait for other slots to load.** Mount the chrome independently of the landing, grid and lightbox, so a slow or failing custom chunk never leaves a page without its frame; the failure still surfaces in the console.
- **`custom/theme.css` loads last by construction**, and the order is verified in the built `dist/*.html`, not in dev. In a production build the order of stylesheets follows the bundler's chunks, not import order: F1 alone changed the order of the home page's stylesheets.

## File Map

- `src/core/events.js` (create) + test: `on`, `emit`, `clearListeners` (tests only).
- `src/core/page.js` (create) + test: `createPageLifecycle` (pure) and `startPage` (wired).
- `src/core/contracts.js` (modify): add `nav`, `footer`, `photoGrid`, `lightbox`.
- `src/core/default-slots.js` (modify): adapters for the four new slots.
- `src/core/chrome.js` (create) + test: `mountChrome({ site, texts })`.
- `src/core/custom-theme.js` (create): eager glob of `/custom/theme.css`.
- `src/components/Lightbox.js` (modify) + test: optional `onClose`.
- `src/pages/index.js`, `src/pages/album.js`, `src/pages/about.js` (modify).
- `src/api/index.js` (modify, created in F2a) + its test.
- `custom.example/setup.js`, `custom.example/theme.css` (create), `docs/slots.md` (modify).

---

### Task 1: Event bus

**Files:** Create `src/core/events.js`, `src/core/events.test.js`

**Interfaces:**
- `on(type, listener) → unsubscribe()`
- `emit(type, detail)` — synchronous, in registration order, isolated failures.
- `clearListeners()` — for tests only.

- [ ] **Step 1: Write the failing tests**

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { on, emit, clearListeners } from './events.js';

afterEach(() => clearListeners());

describe('event bus', () => {
  it('delivers detail to listeners of that type only', () => {
    const a = vi.fn(); const b = vi.fn();
    on('photo:open', a); on('photo:close', b);
    emit('photo:open', { index: 2 });
    expect(a).toHaveBeenCalledWith({ index: 2 });
    expect(b).not.toHaveBeenCalled();
  });

  it('unsubscribe stops delivery', () => {
    const a = vi.fn();
    const off = on('page:ready', a);
    off();
    emit('page:ready', {});
    expect(a).not.toHaveBeenCalled();
  });

  it('a throwing listener does not stop the others', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    on('page:ready', () => { throw new Error('boom'); });
    on('page:ready', after);
    emit('page:ready', {});
    expect(after).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/core/events.test.js` → FAIL, module missing.

- [ ] **Step 3: Implement**

```js
/**
 * Minimal page event bus. Events: page:ready, page:leave, photo:open, photo:close.
 * Listeners run synchronously; one failing listener is logged and skipped,
 * because custom code must never be able to break a template page.
 */
const listeners = new Map();

export function on(type, listener) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(listener);
  return () => listeners.get(type)?.delete(listener);
}

export function emit(type, detail) {
  for (const listener of [...(listeners.get(type) ?? [])]) {
    try {
      listener(detail);
    } catch (error) {
      console.error(`Listener for "${type}" failed:`, error);
    }
  }
}

/** Test helper: removes every listener. */
export function clearListeners() {
  listeners.clear();
}
```

- [ ] **Step 4: Run to verify pass**, then commit:

```bash
git add src/core/events.js src/core/events.test.js
git commit -m "feat(slots): add page event bus"
```

---

### Task 2: Page lifecycle and `custom/setup.js`

**Files:** Create `src/core/page.js`, `src/core/page.test.js`

**Interfaces:**
- `createPageLifecycle({ setup, bus, target }) → start(page)`; `start(page)` returns `{ ready(detail) }`.
  - Calls `setup({ on: bus.on, page })` once, if `setup` is a function.
  - Registers `pagehide` on `target` → `bus.emit('page:leave', { page })`.
  - `ready(detail)` → `bus.emit('page:ready', { page, ...detail })`.
- `startPage(page)` — the same, wired to `import.meta.glob('/custom/setup.js')`, the real bus and `window`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it, vi } from 'vitest';
import { createPageLifecycle } from './page.js';

const makeBus = () => ({ on: vi.fn(), emit: vi.fn() });

describe('page lifecycle', () => {
  it('runs custom setup once with on() and the page name', () => {
    const setup = vi.fn();
    const bus = makeBus();
    createPageLifecycle({ setup, bus, target: new EventTarget() })('album');
    expect(setup).toHaveBeenCalledWith({ on: bus.on, page: 'album' });
  });

  it('works without a custom setup', () => {
    const bus = makeBus();
    expect(() => createPageLifecycle({ setup: undefined, bus, target: new EventTarget() })('home')).not.toThrow();
  });

  it('ready() emits page:ready with the page name and detail', () => {
    const bus = makeBus();
    const page = createPageLifecycle({ setup: undefined, bus, target: new EventTarget() })('home');
    page.ready({ site: { name: 'X' } });
    expect(bus.emit).toHaveBeenCalledWith('page:ready', { page: 'home', site: { name: 'X' } });
  });

  it('pagehide emits page:leave', () => {
    const bus = makeBus();
    const target = new EventTarget();
    createPageLifecycle({ setup: undefined, bus, target })('about');
    target.dispatchEvent(new Event('pagehide'));
    expect(bus.emit).toHaveBeenCalledWith('page:leave', { page: 'about' });
  });

  it('a failing custom setup is reported with its file name and does not stop the page', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = makeBus();
    const page = createPageLifecycle({ setup: () => { throw new Error('x'); }, bus, target: new EventTarget() })('home');
    expect(err.mock.calls[0][0]).toMatch(/custom\/setup\.js/);
    expect(() => page.ready({})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```js
import * as bus from './events.js';

/**
 * Pure factory: page lifecycle over an injected setup, bus and event target.
 * @returns {(page: string) => {ready: (detail?: object) => void}}
 */
export function createPageLifecycle({ setup, bus: b, target }) {
  return function start(page) {
    if (typeof setup === 'function') {
      try {
        setup({ on: b.on, page });
      } catch (error) {
        console.error('custom/setup.js failed; the page continues without it:', error);
      }
    }
    target.addEventListener('pagehide', () => b.emit('page:leave', { page }));
    return { ready: (detail = {}) => b.emit('page:ready', { page, ...detail }) };
  };
}

const found = import.meta.glob('/custom/setup.js', { eager: true });
const customSetup = Object.values(found)[0]?.default;

/** Starts the lifecycle of a template page ('home' | 'album' | 'about'). */
export const startPage = createPageLifecycle({ setup: customSetup, bus, target: window });
```

- [ ] **Step 4: Run to verify pass**, commit:

```bash
git add src/core/page.js src/core/page.test.js
git commit -m "feat(slots): add page lifecycle and custom/setup.js hook"
```

---

### Task 3: Lightbox close callback

**Files:** Modify `src/components/Lightbox.js`, `src/components/Lightbox.test.js`

**Interfaces:** `createLightbox(photos, { onClose } = {})` — `onClose(index)` is called once each time an **open** lightbox closes, whatever the cause (button, Escape, backdrop click, `destroy()` while open).

- [ ] **Step 1: Add failing tests** to `Lightbox.test.js`: `onClose` receives the current index after `open(2)` then Escape; `onClose` is not called by `close()` on an already closed lightbox; calling without the second argument still works (the existing tests cover this implicitly — keep them untouched).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — in `createLightbox`, accept `{ onClose } = {}`; in `close()`, return early if the element is not open; after restoring focus, call `onClose?.(current)`. Update the JSDoc.

- [ ] **Step 4: Run the full Lightbox suite**, commit:

```bash
git add src/components/Lightbox.js src/components/Lightbox.test.js
git commit -m "feat(lightbox): optional onClose callback"
```

---

### Task 4: Four new slots and the page chrome

**Files:**
- Modify: `src/core/contracts.js`, `src/core/default-slots.js`
- Create: `src/core/chrome.js`, `src/core/chrome.test.js`

**Interfaces:**
- `nav.mount(container, { site, texts })`, `footer.mount(container, { site, texts })`
- `photoGrid.mount(container, { photos, texts, onPhotoClick(index, triggerEl) })`
- `lightbox.create(photos, { onClose(index) }) → { open(index, triggerEl), close(), destroy() }`
- `mountChrome({ site, texts }) → Promise<void>` mounts `nav` in `#site-nav` and `footer` in `#site-footer`.

- [ ] **Step 1: Write the failing test** `src/core/chrome.test.js`: with `custom-slots.js` mocked to return spy implementations, `mountChrome` calls `nav.mount(#site-nav, { site, texts })` and `footer.mount(#site-footer, { site, texts })`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`src/core/contracts.js`:

```js
export const SLOT_CONTRACTS = {
  landing: 'mount',
  nav: 'mount',
  footer: 'mount',
  photoGrid: 'mount',
  lightbox: 'create',
};
```

`src/core/default-slots.js` — adapters only, no behavior of their own:

```js
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { renderGrid } from '../components/PhotoGrid.js';
import { createLightbox } from '../components/Lightbox.js';

export { landing } from '../components/Landing.js';

const clearing = container => ({ destroy() { container.replaceChildren(); } });

export const nav = {
  mount(container, { site, texts }) {
    renderNav(container, { name: site.name }, texts);
    return clearing(container);
  },
};

export const footer = {
  mount(container, { site, texts }) {
    renderFooter(container, texts, site.social);
    return clearing(container);
  },
};

export const photoGrid = {
  mount(container, { photos, onPhotoClick }) {
    renderGrid(container, photos, onPhotoClick);
    return clearing(container);
  },
};

export const lightbox = {
  create(photos, { onClose } = {}) {
    return createLightbox(photos, { onClose });
  },
};
```

`src/core/chrome.js`:

```js
import { slot } from './custom-slots.js';

/** Mounts the nav and footer slots in the containers every template page has. */
export async function mountChrome({ site, texts }) {
  const [nav, footer] = await Promise.all([slot('nav'), slot('footer')]);
  await Promise.all([
    nav.mount(document.getElementById('site-nav'), { site, texts }),
    footer.mount(document.getElementById('site-footer'), { site, texts }),
  ]);
}
```

- [ ] **Step 4: Run** `npx vitest run src/core` → PASS (F1 `slots.test.js` is unaffected: it uses its own contracts).

- [ ] **Step 5: Commit**

```bash
git add src/core/contracts.js src/core/default-slots.js src/core/chrome.js src/core/chrome.test.js
git commit -m "feat(slots): nav, footer, photoGrid and lightbox slots"
```

---

### Task 5: Pages use slots, events and the custom theme

**Files:**
- Create: `src/core/custom-theme.js`
- Modify: `src/pages/index.js`, `src/pages/album.js`, `src/pages/about.js`, their tests where fixtures or mocks need it.

- [ ] **Step 1: Create the theme loader**

```js
// Loads custom/theme.css after the template CSS when a fork provides it.
// NOTE (F1 final review): import order does NOT decide the order in production — the bundler's
// chunks do. Redesign this step so the theme is emitted last by construction, and verify the
// order of <link rel=stylesheet> in the built dist/*.html.
import.meta.glob('/custom/theme.css', { eager: true });
```

- [ ] **Step 2: Update the three pages**

For each page entry:
1. `import '../core/custom-theme.js';` immediately after `import '../styles/main.css';`.
2. `const page = startPage('<home|album|about>');` right after `validateSiteConfig(siteConfig);`.
3. Replace `renderNav(...)` + `renderFooter(...)` with `await mountChrome({ site, texts });`.
4. At the end, `page.ready({ site })` (album page: `page.ready({ site, album: page.album })` when found — rename the local `page` from `resolveAlbumPage` to `albumPage` to avoid the clash).

In `album.js`, replace:

```js
    const lb = createLightbox(photos);
    renderGrid(gridEl, photos, (i, triggerEl) => lb.open(i, triggerEl));
```

with:

```js
    const [grid, lightboxImpl] = await Promise.all([slot('photoGrid'), slot('lightbox')]);
    const lb = lightboxImpl.create(photos, {
      onClose: index => emit('photo:close', { index, photo: photos[index] }),
    });
    await grid.mount(gridEl, {
      photos,
      texts,
      onPhotoClick: (index, triggerEl) => {
        lb.open(index, triggerEl);
        emit('photo:open', { index, photo: photos[index] });
      },
    });
```

`renderSkeletons(gridEl, 12)` stays where it is: the skeleton is template-owned and appears before any fetch.

- [ ] **Step 3: Run the full suite** — `npm test`. Existing page tests mock `Nav.js`, `Footer.js`, `PhotoGrid.js`, `Lightbox.js` by path; the adapters import the same modules, so the mocks still apply — **but only without `custom/`**: every page test must also pin `custom-slots.js` to the defaults (Global Constraints). Fix only fixtures or mocks that the refactor legitimately changed; do not weaken assertions.

- [ ] **Step 4: Manual check** — `npm run dev`: home, one album (open and close a photo), about. Same look, no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/custom-theme.js src/pages
git commit -m "feat(slots): pages mount chrome and album parts through slots and emit events"
```

---

### Task 6: Public API for `custom/`

> After F2a, `src/api/index.js` and its pinned test already exist, exporting `albumsToCards`. This task **adds** the other exports and extends the pinned list; it never removes or renames `albumsToCards`.

**Files:** Modify `src/api/index.js`, `src/api/index.test.js` (both created in F2a)

Import cycle to keep harmless: exporting `slot` from `custom-slots.js` closes the loop `custom-slots.js` → eager glob → `custom/slots.js` → a statically imported landing → `src/api/index.js` → `custom-slots.js`. ES modules resolve it as long as no module calls `slot` at its top level. Keep it that way.

- [ ] **Step 1: Write the failing test** — in `src/api/index.test.js`, replace only the array in the test `exports exactly the documented surface` with the one below. Keep the rest of the file: its `albumsToCards` tests pin what forks rely on. Each new export also gets tests of what it returns, in the same style; write them when this plan is re-verified before execution. The array:

```js
    expect(Object.keys(api).sort()).toEqual([
      'albumsToCards',
      'fetchAlbums',
      'fetchConfig',
      'fetchManifest',
      'fetchSite',
      'on',
      'photosFromManifest',
      'resolveAlbums',
      'resolveSiteContent',
      'siteConfig',
      'slot',
      'texts',
    ]);
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```js
/**
 * The only module code in custom/ may import. Everything else in src/ is internal
 * and may change in any template update. Removing or renaming an export here, or
 * changing its arguments or what it returns, is a breaking change for forks: note it
 * in docs/upgrading.md. Adding an export, or a field to an object it returns, is safe.
 */
export { fetchSite, fetchAlbums, fetchManifest, fetchConfig } from '../providers/data.js';
export { photosFromManifest } from '../providers/r2.js';
export { resolveSiteContent, resolveAlbums, albumsToCards } from '../pages/home-logic.js';
export { slot } from '../core/custom-slots.js';
export { on } from '../core/events.js';
export { texts } from '../../config/texts.config.js';
export { siteConfig } from '../../config/site.config.js';
```

- [ ] **Step 4: Run to verify pass**, commit:

```bash
git add src/api
git commit -m "feat(api): pinned public surface for custom/ code"
```

---

### Task 7: Examples and documentation

**Files:** Create `custom.example/setup.js`, `custom.example/theme.css`; modify `docs/slots.md`, `custom.example/README.md`

- [ ] **Step 1: Examples**

`custom.example/setup.js`:

```js
// Runs once per page, before slots mount. Receives on() and the page name.
export default function setup({ on, page }) {
  on('page:ready', ({ site }) => {
    document.documentElement.dataset.page = page;
    console.info(`[site] ${page} ready for ${site.name}`);
  });
  on('photo:open', ({ index }) => console.info(`[site] photo ${index} opened`));
}
```

`custom.example/theme.css`: two rules that are visibly different (for example the accent colour token and the section heading weight), with a comment explaining it loads after `theme/`.

- [ ] **Step 2: `docs/slots.md`** — add: the table of the five slots with contract and ctx; the four events with their detail shapes (`page:ready { page, site, album? }`, `page:leave { page }`, `photo:open { index, photo }`, `photo:close { index, photo }`); `custom/setup.js`; `custom/theme.css`; one row per new export in the table of the section "The public API: `src/api/index.js`" (created in F2a), keeping the `/src/api/index.js` import form.

- [ ] **Step 3: End-to-end check with the example**

```bash
cp -r custom.example custom
npm test && npm run build && npm run dev
# home: example landing, example theme visible, console shows "[site] home ready"
# album: open a photo → "[site] photo N opened"
rm -rf custom
```

- [ ] **Step 4: Commit**

```bash
git add custom.example docs/slots.md
git commit -m "docs(slots): events, setup hook, custom theme and public API"
```
