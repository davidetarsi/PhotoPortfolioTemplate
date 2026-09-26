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

- ``custom/slots.js: must `export default` an object that maps slot names to loaders, …`` — the file exists but has no default export, or its default is not an object.
- `custom/slots.js: unknown slot "<name>". Known slots: …` — a key of `custom/slots.js` is not a slot.
- `custom/slots.js: slot "<name>" must be a loader, e.g. () => import('./my-component.js').` — the value is not a function.
- `custom/slots.js: slot "<name>" must export default { mount(…) }.` — the loaded module does not implement the contract.
- `custom/slots.js: slot "<name>" failed to load: …` — the loader threw or the module could not be imported: a wrong path, or an error inside your component. The original error follows the colon.

## Stability

Slot names, contract methods and the fields of `ctx` are the public surface of `custom/`. Changing any of them is a breaking change, announced in `docs/upgrading.md`. Everything else in `src/` is internal and may change in any update.
