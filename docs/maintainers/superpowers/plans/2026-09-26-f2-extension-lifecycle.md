# F2 — lifecycle-safe slots and custom theme Implementation Plan

> **For agentic workers:** use superpowers:executing-plans inside the single requested Luna 6 implementer; do not spawn agents. The maintainer performs independent final review and verification. User approved updating these documents and implementing the agreed direction on 2026-09-26.

**Goal:** Complete F2 without React: replaceable chrome and album components, page/photo events, owned cleanup, optional custom theme and cycle-safe public API.
**Architecture:** Extend existing F1 slots with thin adapters; introduce a small page owner and event bus. Public pages start independent mounts and retain their handles. Vite processes an optional custom stylesheet and emits an explicit final HTML link; no theme is loaded by admin.
**Tech Stack:** existing JavaScript ES modules, Vite 8, Vitest 4/jsdom, Cloudflare Worker unchanged. No new production dependency.
**Spec:** `docs/maintainers/superpowers/specs/2026-09-25-punti-di-aggancio-design.md`, particularly section 6, "F2: contracts approved on 2026-09-26".
**Base:** local main `0bb1a19`; work on `codex/f2-extension-lifecycle` in the existing linked worktree. F1, F2a and F4 are already implemented.

## Global Constraints

- Without custom/, preserve default DOM and page behavior, including album skeletons rendered before fetches.
- Keep current component signatures except additive optional `{ onClose }` on createLightbox.
- Preserve the four planned events; page:leave adds persisted, restored page:ready adds restored.
- Page owns optional slot destroy handles and setup cleanup; disposal is idempotent and isolated. Late handles are disposed if their owner has already left.
- Persisted pagehide preserves DOM/state; restored pageshow never duplicates setup or mounts.
- Nav/footer/content loads are independent; explicit custom errors, no automatic fallback and no unhandled rejection.
- Custom theme is processed by Vite, final explicit stylesheet on public HTML, absent from admin. No cascade layers.
- Public slot export is a lazy async facade, not an eager registry re-export. Keep albumsToCards and its behavior tests.
- Pin core page tests to defaults, while dedicated custom fixture tests exercise real extension paths.
- No React, F3 generator, routing migration, slug-rule changes, push, merge, deploy, apply, destructive cleanup or edits in other checkouts.
- Preserve user's ignored custom/ and wrangler.json. All custom example checks use disposable isolated copies, never overwrite those paths.

## Review Focus

1. pagehide during unresolved mount: dispose the eventual handle once; no duplicate setup on restoration.
2. One custom loader or cleanup throws: successful siblings still mount/dispose, errors are observable.
3. Theme with CSS imports/relative assets and a lazy slot stylesheet: build links resolve and computed theme overrides remain effective; admin untouched.
4. Statically imported custom component imports public API: build and real browser initialize without import-cycle errors.
5. Album error/empty/not-found states: skeleton timing, page readiness and photo event count remain correct.

## Task 1: Event bus and page ownership

**Files:** create `src/core/events.js`, `src/core/events.test.js`, `src/core/page.js`, `src/core/page.test.js`; update page tests later in Task 4.
**Interfaces:** `on(type, listener) -> unsubscribe`, `emit(type, detail)`, tests-only listener reset; `createPageLifecycle({ setup, bus, target }) -> start(page)`; `startPage(page)` uses optional eager setup glob. Owner exposes `track(handleOrPromise)`, `ready(detail)`, `destroy()`.

- [ ] Write event tests for ordered delivery, unsubscribe, isolated exception; owner tests for duplicate start, repeated destroy, setup cleanup, failed cleanup, persisted pagehide/pageshow, non-persisted disposal and promise resolving after disposal. Example assertion:

```js
const owner = start('home');
const destroy = vi.fn();
owner.track(Promise.resolve({ destroy }));
owner.destroy();
await Promise.resolve();
expect(destroy).toHaveBeenCalledTimes(1);
```

- [ ] Run focused tests and confirm failure before implementation.
- [ ] Implement a Map/Set event bus. Catch each listener independently. Owner caches one started page per factory, stores cleanup functions and last ready detail, binds named pagehide/pageshow handlers. `track` accepts optional handles and promises, logs rejected mounts, disposes a late handle immediately. Avoid double destruction of the same handle. Setup may return a function. For persisted hide emit leave without disposal; restored show emits ready with restored true only after prior readiness. On final disposal unregister global handlers and clean up owned callbacks individually.
- [ ] Run focused tests; record red/green and commit named files only.

## Task 2: Lightbox and component contracts

**Files:** modify `src/components/Lightbox.js` and tests; `src/core/contracts.js`, `src/core/default-slots.js`; add adapter tests.
**Interfaces:** landing/nav/footer/photoGrid use mount; lightbox uses create. Nav/footer ctx `{ site, texts }`; grid ctx `{ photos, texts, onPhotoClick }`; lightbox `{ open, close, destroy }` with optional onClose(index).

- [ ] Add tests that onClose fires once for Escape/button/backdrop/destroy while open, never for closing an already closed instance. After destroy, document keyboard handler is unregistered.
- [ ] Confirm red; implement a named document keydown handler and remove it in destroy. Keep focus restoration and current default behavior.
- [ ] Extend contracts:

```js
export const SLOT_CONTRACTS = {
  landing: 'mount', nav: 'mount', footer: 'mount',
  photoGrid: 'mount', lightbox: 'create',
};
```

- [ ] Add thin default adapters using renderNav, renderFooter, renderGrid and createLightbox. Mount adapters return container-clearing destroy handles; landing retains its existing implementation. Test ctx delegation and handle cleanup. Keep static default imports as already approved.
- [ ] Run component/core tests and commit explicit files.

## Task 3: Independent chrome and cycle-safe API

**Files:** create `src/core/chrome.js` and tests; modify `src/api/index.js` and tests.
**Interfaces:** `mountChrome({ site, texts, owner }) -> Promise<void>` starts nav and footer separately, tracks returned handles and logs rejected operations independently.

- [ ] Write delayed nav/fast footer and failing footer/successful nav tests. Check successful sibling mounts before releasing delayed loader, not merely eventual completion.
- [ ] Implement two separate async pipelines immediately, rather than one resolution barrier:

```js
const mountOne = async name => {
  const impl = await slot(name);
  return impl.mount(document.getElementById(`site-${name}`), { site, texts });
};
owner.track(mountOne('nav'));
owner.track(mountOne('footer'));
```

Use tracked promises as completion inputs and consume rejections; ensure mountChrome completion still waits for both settled operations. On disposed owner avoid new mounts where possible and dispose eventual handles.

- [ ] Preserve planned API export list: albumsToCards, fetchAlbums, fetchConfig, fetchManifest, fetchSite, on, photosFromManifest, resolveAlbums, resolveSiteContent, siteConfig, slot, texts. Retain existing behavior tests and add tests for new helpers. Implement slot via a lazy wrapper:

```js
export async function slot(name) {
  const registry = await import('../core/custom-slots.js');
  return registry.slot(name);
}
```

The other exports must not import this registry. Add a real fixture in which custom/slots.js statically imports a landing component importing public API; validate it in Task 7. Slot loaders are declarations at module scope, invoked only during runtime mounting.
- [ ] Run focused tests and commit explicit files.

## Task 4: Public page integration

**Files:** modify `src/pages/index.js`, `album.js`, `about.js` and their tests; only targeted optional cancellation checks in Landing.js if lifecycle testing proves required.

- [ ] Pin core page tests to default resolver as F1 home tests already do. Add order tests: chrome starts while a landing/grid custom loader is pending; readiness follows settled mounting. Keep default DOM assertions.
- [ ] Start page owner before mounts; start data work concurrently. Home starts chrome from data promise independently from landing loader. Track landing promise. Album skeletons remain before fetch; resolve album data as today, mount chrome independently, create and track lightbox, emit photo:open after opening and photo:close through onClose. Track grid handle. About starts chrome without awaiting a content slot. Rename existing album `page` variable to `albumPage`.
- [ ] Emit ready with `{ site }`, album with album data when available. Define readiness as completed template mount operations, not a guarantee that an arbitrary framework's asynchronous rendering has committed. This phase adds no framework adapter.
- [ ] Exercise success/empty/not-found/network paths, full test suite, commit explicit files.

## Task 5: Production-first custom theme

**Files:** create optional theme Vite plugin/helper under `src/utils/` and tests; optional runtime link-order helper under `src/core/`; modify vite.config.js and slot loading hook only as required. No eager CSS glob replacing the final-link contract.

- [ ] First build a disposable fixture with custom/theme.css containing imports and a relative local asset, plus a lazy custom slot importing its own CSS. Record actual public/admin stylesheet output. This is the approved feasibility check, not authority to change the contract.
- [ ] Add failing build integration assertions: theme absent without custom, final explicit public stylesheet link with custom, no admin inclusion, emitted imports/assets resolve. Test order after lazy loading in the browser during maintainer verification.
- [ ] Implement using Vite's CSS pipeline and HTML hooks. Mark the theme link with a stable data attribute so a small runtime helper can restore its position after lazy slot CSS loads if required. Do not copy raw CSS or manually concatenate stylesheets. Default styles remain static and untouched. If the probe shows the agreed mechanism cannot work without changing the contract, report to maintainer rather than add cascade layers silently.
- [ ] Run build fixture tests and full build; commit explicit files.

## Task 6: Examples, documentation and route audit

**Files:** custom.example/setup.js, theme.css, optional example override component; custom.example/README.md, docs/slots.md, docs/upgrading.md, README.md as needed; `docs/maintainers/superpowers/reviews/2026-09-26-f2-verification.md`.

- [ ] Make setup example return cleanup for subscriptions:

```js
export default function setup({ on, page }) {
  const off = on('page:ready', ({ site }) => console.info(`[site] ${page} ready for ${site.name}`));
  return () => off();
}
```

- [ ] Provide visible theme override and one lazy override so example validates actual extension paths. Keep core tests pinned to defaults and custom-specific tests behavioral.
- [ ] Document five slot contracts, handle ownership, readiness/restoration semantics, explicit custom errors, CSS order, lazy API and no top-level resolution. Ensure README reaches the guide.
- [ ] Audit canonical route declarations, legacy aliases and example paths separately. Report `/contatti -> /about` as retained legacy alias; no new `/contacts` or path migration. Record older F3 Italian examples as pending English conversion, not implemented. User album slugs remain unrestricted by language. Record unresolved reserved-slug list inconsistency for F3.
- [ ] Update revised plan progress and report; no claim of deploy or remote main update.

## Task 7: Final matrix and maintainer handoff

- [ ] Run clean template baseline in a disposable tracked snapshot with example wrangler configuration: full tests and ALLOW_PLACEHOLDER_CSP=1 build. Preserve original ignored files.
- [ ] Copy custom.example into a second disposable snapshot, run full tests/build and a real fixture API-cycle check.
- [ ] Implementer returns commits, exact counts, any concerns and fixture paths. Maintainer independently reviews full diff, reruns both matrices and opens browser previews. Browser checks home default/example, album fixture with lightbox open/close, error/empty states, About contact rendering, admin theme isolation, lazy CSS computed priority and back/forward restoration. Use neutral synthetic data and no real contact submission.
- [ ] git diff --check and clean tracked status. Retain branch/worktree and all recovery notes. No push, local main merge or deploy without separate user instruction.

## Execution method

One Luna 6 implementer for this connected change, no nested agents; maintainer performs review and independent verification. This deliberately overrides per-task fresh-worker/reviewer defaults to honor the user's cost-conscious workflow. User approved the choices and requested document updates followed by implementation in this turn. No second approval is inferred for publishing or routing changes.
