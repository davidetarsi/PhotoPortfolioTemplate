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

Keep `custom/slots.js` to loaders only: the template imports it when the page loads, so anything else in it runs on every visit.

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

## The public API: `src/api/index.js`

Code in `custom/` imports from the template only through `src/api/index.js`. Import it with a path from the project root: it works at any depth inside `custom/`, in `npm test` and in the build.

```js
import { albumsToCards } from '/src/api/index.js';
```

| Export | Call | Returns |
|---|---|---|
| `albumsToCards` | `albumsToCards(albums, r2PublicUrl)` | an array of `{ slug, title, description, coverUrl }`. `coverUrl` is the full URL of the cover, or `null` when the album has no cover or `r2PublicUrl` is missing |

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

## What stays the template's

- The dashboard preview in `/admin` always shows the template landing, not yours.
- Nav and footer are the template's in this version.

## Stability

Slot names, contract methods, the fields of `ctx` and the exports of `src/api/index.js` are the public surface of `custom/`. Removing, renaming or changing any of them (what a contract method receives, what a `ctx` field contains, what an export takes or returns) is a breaking change, announced in `docs/upgrading.md`. Adding one, or adding a field to an object the template passes or returns, is not. Everything else in `src/` is internal and may change in any update.
