# Slots — replacing whole parts of the site

A *slot* is a part of the site that a fork can replace with its own component, declared in `custom/slots.js`, without editing template files. At runtime the template resolves each slot to the fork's implementation when `custom/slots.js` provides one, and to its own default otherwise.

| Slot | Contract | What it covers |
|---|---|---|
| `landing` | `mount(container, ctx)` | home page: hero, section heading and album cards |
| `nav` | `mount(container, ctx)` | site navigation |
| `footer` | `mount(container, ctx)` | shared page footer |
| `photoGrid` | `mount(container, ctx)` | album photo grid and click callback |
| `lightbox` | `create(photos, ctx)` | album lightbox and close callback |

This table is the complete list of slots in this version of the template.

## Declaring an override

`custom/slots.js` exports an object that maps slot names to **loaders**:

```js
export default {
  landing: () => import('./landing/my-landing.js'),
};
```

The loaded module exports the implementation as `default`; a loader may also return the implementation directly. A loader runs only when its slot is mounted.

Keep `custom/slots.js` to loaders only: the template imports it when the page loads, so anything else in it runs on every visit. The same holds for its static imports: they are evaluated with the file, on every page, while `() => import(…)` defers the implementation until the slot is mounted.

A loader written as `() => import(…)` puts your component in its own file, downloaded after the page starts: one extra round trip before your landing appears. To ship it with the page instead, import it at the top and return it:

```js
import myLanding from './landing/my-landing.js';

export default {
  landing: () => myLanding,
};
```

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

The page lifecycle owns each returned handle and calls `destroy()` once on a non-persisted `pagehide`. On a back/forward-cache restore, existing DOM and handles are retained and `page:ready` fires again with `restored: true`. Readiness means template mount operations settled; it does not promise that an arbitrary framework has committed asynchronous rendering.

### `landing`

- `container` — the `#landing` element of `index.html`. It has `display: contents`, so it adds no box of its own.
- `ctx.texts` — the UI texts from `config/texts.config.js`.
- `ctx.data` — a **promise** of `{ site, albums, albumsError, r2PublicUrl }`. It never rejects: a failed load arrives as `albums === null` with `albumsError` set.
  - `site` — `{ name, bio, heroUrl, social }`, read from R2 with the build values as fallback. `heroUrl` is a full URL or `null`; `social` maps network names to URLs.
  - `albums` — an array of `{ slug, title, description, coverName }`, or `null` when the albums could not be loaded. `coverName` is the cover's file name or `null`; it is not a URL.
  - `albumsError` — the error code when `albums` is `null` (for example `'NETWORK'`), otherwise `null`.
  - `r2PublicUrl` — the public URL of the photo bucket.

`ctx.data` is a promise so that a landing can draw its skeleton at once, before the network answers: render first, then `await ctx.data`. Fetching stays in the template, so every landing — default or custom — receives the same data with the same fallback rules.

To show covers, turn `albums` into cards with `albumsToCards` from the public API (below): each card has a `coverUrl`.

### `nav` and `footer`

Both receive `{ site, texts }`. `site` is the resolved site content above; `texts` is the UI copy from `config/texts.config.js`. Each returns an optional `{ destroy() }` handle.

### `photoGrid`

Receives `{ photos, texts, onPhotoClick }`. `photos` contains manifest entries enriched with image URLs. Call `onPhotoClick(index, triggerElement)` to open the template lightbox and emit `photo:open`. Return an optional destroy handle.

### `lightbox`

`create(photos, { onClose })` returns an instance with `open(index, triggerElement)`, `close()` and `destroy()`. Call `onClose(index)` once each time an open lightbox closes, including when `destroy()` closes it, and never for an instance that is already closed; the template emits `photo:close` from that callback.

## The public API: `src/api/index.js`

Code in `custom/` imports from the template only through `src/api/index.js`. Import it with a path from the project root: it works at any depth inside `custom/`, in `npm test` and in the build.

```js
import { albumsToCards } from '/src/api/index.js';
```

| Export | Call | Returns |
|---|---|---|
| `albumsToCards` | `albumsToCards(albums, r2PublicUrl)` | an array of `{ slug, title, description, coverUrl }`. `coverUrl` is the full URL of the cover, or `null` when the album has no cover or `r2PublicUrl` is missing |
| `fetchAlbums` | `fetchAlbums()` | response envelope for the album list |
| `fetchConfig` | `fetchConfig()` | response envelope for runtime config |
| `fetchManifest` | `fetchManifest(slug)` | response envelope for an album photo manifest |
| `fetchSite` | `fetchSite()` | response envelope for site content |
| `on` | `on(type, listener)` | idempotent unsubscribe function |
| `photosFromManifest` | `photosFromManifest(entries, slug, r2PublicUrl)` | photo objects with `gridUrl`, `fullUrl`, dimensions and name |
| `resolveAlbums` | `resolveAlbums(response, fallback)` | normalized album list or `null` |
| `resolveSiteContent` | `resolveSiteContent(response, fallback)` | normalized site content |
| `siteConfig` | — | build-time site fallback config |
| `slugFromPath` | `slugFromPath('/projects/:slug', location.pathname)` | the entry slug of a collection page, or `null` (see `docs/pages.md`) |
| `slot` | `await slot(name)` | the implementation for one of the five slots above |
| `texts` | — | UI text config |

In a landing, pass the two fields of `ctx.data`. Check `albums` first: it is `null` when the albums could not be loaded, and `albumsToCards` needs an array. `custom.example/landing/example-landing.js` shows both branches.

```js
const { albums, albumsError, r2PublicUrl } = await ctx.data;
if (albums === null) {
  // show a message: albumsError says what went wrong
} else {
  for (const card of albumsToCards(albums, r2PublicUrl)) {
    // one link per album; card.coverUrl may be null
  }
}
```

This is the complete list today. It grows as later versions of the template need it; an export is never removed, renamed or changed in what it takes or returns without a note in `docs/upgrading.md`.

Do not resolve a slot at module top level. Declare its loader in `custom/slots.js` and request it from the page mount path. This keeps API imports cycle-safe when a component also imports the public API.

## Page setup and events

An optional `custom/setup.js` default function runs once for each page entry and receives `{ page, on, emit }`. It may return a cleanup function, called when the page is permanently left. `custom.example/setup.js` shows a subscription that returns its unsubscribe function.

The public events are `page:ready` (`{ page, site, album?, restored? }`), `page:leave` (`{ page, persisted }`), `photo:open` (`{ index, photo }`) and `photo:close` (`{ index, photo }`). `on(type, listener)` returns an idempotent unsubscribe function. Always unregister subscriptions so listeners do not outlive a component.

To add whole pages rather than replace parts of existing ones, see [pages](pages.md).

## Optional custom theme

If `custom/theme.css` exists, Vite processes it as a separate stylesheet, including CSS imports and relative assets. It is linked last on home, About, album and custom pages, never `/admin`. After a lazy slot adds its stylesheet, runtime ordering restores the custom theme to the end. Equal-specificity rules in the theme therefore override the lazy stylesheet. Without the file, no custom theme stylesheet is emitted. See the matching `.example-photo-grid__item` rules in `custom.example/photo-grid/` and `custom.example/theme.css`.

## What your code runs under

### In the browser: the Content Security Policy

In production every page is served with a strict Content Security Policy, generated at build time. `npm run dev` does not apply it, so a mistake shows up only on staging or in production: check the browser console there. For code in `custom/`:

- Style with classes and stylesheets. A landing may `import './my-landing.css'`: it is bundled and allowed. `style="…"` attributes in HTML strings are blocked; setting `element.style.x` from JavaScript works.
- No inline event handlers (`onclick="…"`) and no inline `<script>`: attach listeners with `addEventListener`.
- Scripts only from the site itself: bundle libraries with your code instead of loading them from a CDN.
- Fonts only from Google Fonts. Images and network requests only to the site itself and the photo bucket (images may also be `data:` URLs).

The policy cannot be extended from `custom/` in this version.

### In `npm test`: jsdom

In a fork that has `custom/`, `npm test` loads every slot you declare and checks that it exposes its contract method. It runs in jsdom, not in a browser, and the deploy runs `npm test` before building, so:

- Code at the top level of your modules must not need browser-only APIs that jsdom lacks (`matchMedia`, `IntersectionObserver`, `ResizeObserver`, canvas, …). Use them inside `mount`, or import the library that needs them dynamically from `mount`.
- The check does not call `mount`. Test your own component in files under `custom/` named `*.test.js`: `npm test` runs them too.

## Errors you can meet

They appear in the browser console, and in a fork they make `npm test` fail — which also stops the deploy, since it runs `npm test && npm run build`:

- ``custom/slots.js: must `export default` an object that maps slot names to loaders, …`` — the file exists but has no default export, or its default is not an object.
- `custom/slots.js: unknown slot "<name>". Known slots: …` — a key of `custom/slots.js` is not a slot.
- `custom/slots.js: slot "<name>" must be a loader, e.g. () => import('./my-component.js').` — the value is not a function.
- `custom/slots.js: slot "<name>" must export default { mount(…) }.` — the loaded module does not implement the contract.
- `custom/slots.js: slot "<name>" failed to load: …` — the module could not be imported, or threw while being imported: a wrong path, or an error at the top level of your code. The original error follows the colon. Errors thrown inside `mount` are not wrapped: they appear in the console when the page runs.

A declared override that fails validation or loading is reported explicitly; it is not silently replaced by the default slot. Fix the loader or implementation contract, otherwise that page area cannot render.

## What stays the template's

- The dashboard preview in `/admin` always shows the template landing, not yours.
- Every slot not listed in `custom/slots.js` uses the template implementation.

## Stability

Slot names, contract methods, the fields of `ctx` and the exports of `src/api/index.js` are the public surface of `custom/`. Removing, renaming or changing any of them (what a contract method receives, what a `ctx` field contains, what an export takes or returns) is a breaking change, announced in `docs/upgrading.md`. Adding one, or adding a field to an object the template passes or returns, is not. Everything else in `src/` is internal and may change in any update.
