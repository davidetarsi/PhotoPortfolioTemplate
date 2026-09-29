# Dashboard 4.4 — Messages and cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task, with only one worker or reviewer active at a time. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the React dashboard by adding the Messages screen, removing the obsolete dashboard/write API, applying the remaining 4.4 reliability/security refinements, and updating the template documentation.

**Architecture:** Keep React screens on the existing same-origin authenticated Worker API and TanStack Query. The Worker continues to own message access and draft storage; UI-only album summaries are returned alongside, not embedded in, persisted album records. Move reusable photo/upload utilities out of the legacy `src/admin` namespace before removing obsolete UI and write handlers; keep only code still consumed by the React dashboard.

**Tech Stack:** JavaScript/JSX with JSDoc, React 19, React Router, TanStack Query, Vitest, Testing Library, Cloudflare Worker/R2, Vite.

**Spec:** `docs/maintainers/superpowers/specs/2026-09-27-dashboard-react-design.md`, sections “4.4 Messaggi e pulizia”, “Da portare nei piani 4.2–4.4”, “Sicurezza”, “Test”.

## Global Constraints

- Do not add dependencies unless a concrete browser-test gap cannot be covered by the repository's existing tools.
- Visible dashboard text belongs in `config/texts.config.js` and `config/texts.it.js`, with matching keys and parameters.
- Keep persisted album data unchanged; computed gallery summaries are response-only metadata.
- Keep messages in `PRIVATE_BUCKET`; never fall back to or read them from the public photo bucket.
- Preserve `/api/admin/messages` GET/DELETE and the draft, staging, preview, and publish API; remove only superseded direct-write routes.
- No inline `<style>`, `style=`, `innerHTML`, or `dangerouslySetInnerHTML` in new dashboard code.
- Keep same-origin/Access protections and make `/admin` plus `/admin/*` non-embeddable; the public-site preview remains same-origin only.
- Keep real staging/production messages, photos and publication state untouched during acceptance. Destructive browser checks require an isolated disposable dataset; otherwise report them as unverified, not passed.
- The spec covers an administrator using two windows sequentially, not simultaneous multi-admin editing or atomic compare-and-swap of manifests. State and test that boundary explicitly.
- Use TDD for code changes, run focused tests after each behavior and the full suite/build before completion.
- Work on the current continuation branch; do not push or deploy. Preserve pre-existing untracked user files.

## Review Focus

1. A message list, deletion, or reply link must never render visitor-provided content as HTML or expose messages outside the private Worker route.
2. A failed manifest/message request must be distinguishable from a genuinely empty list and must not permit destructive actions against unknown state.
3. An upload that outlives its album screen must retain its outcome; a second window's already-saved names must be reread before the next batch. Truly simultaneous cross-window writes are outside this plan's concurrency guarantee and must not be claimed safe.
4. A stale/interrupted publication must not be mistaken for a publication running in this browser tab when deciding whether to allow uploads.
5. Removing legacy routes must leave the React draft workflow and message API working while rejecting old direct-write endpoints.

---

## Task 1: Messages screen

**Files:**
- Create: `src/dashboard/api/messages.js`, `src/dashboard/api/messages.test.jsx`
- Modify: `src/dashboard/features/messages/MessagesScreen.jsx`
- Create: `src/dashboard/features/messages/MessagesScreen.test.jsx`, `src/dashboard/features/messages/messages.css`
- Modify: `src/dashboard/app.css`, `config/texts.config.js`, `config/texts.it.js`
- Keep as contract: `GET /api/admin/messages`, `DELETE /api/admin/messages/:id` in `src/worker/admin-routes.js`

**Interfaces:**
- Consume `request(path, options)` and `ApiError` from `src/dashboard/api/client.js`, `ConfirmDialog`, and `texts.admin.messages`.
- Export query key `messages`; expose `useMessages()` and `useDeleteMessage()` with deletion invalidating the messages query.
- Render loading, empty, load-error, delete-error, and message-list states. Each row shows sender, date, optional subject, email, message, a `mailto:` reply link, and a confirmed delete action. Visitor data is rendered as React text, never interpreted as markup.

- [ ] **Step 1: Add failing tests** for loading/empty/error states, subject optionality, locale-formatted dates, reply `mailto:`, deletion confirmation/cancel/success/failure, and hostile HTML-looking message fields rendered literally.
- [ ] **Step 2: Run focused tests** with `npm test -- src/dashboard/api/messages.test.jsx src/dashboard/features/messages/MessagesScreen.test.jsx`; confirm failures are due to missing hooks/UI.
- [ ] **Step 3: Implement the query hooks and accessible screen** using the existing Worker routes and `ConfirmDialog`; add matching English/Italian copy and responsive styles.
- [ ] **Step 4: Re-run the focused tests** and `npm test -- src/dashboard`.
- [ ] **Step 5: Commit** the named Task 1 files only.

## Task 2: One-request gallery summaries and shared dashboard primitives

**Files:**
- Modify: `src/worker/draft-routes.js`, `src/worker/draft-routes.test.js`
- Modify: `src/dashboard/features/albums/AlbumCard.jsx`, `src/dashboard/features/albums/AlbumsScreen.jsx`, `src/dashboard/features/albums/AlbumsScreen.test.jsx`
- Create: `src/dashboard/lib/album-summary.js`, `src/dashboard/lib/album-summary.test.js`
- Modify: `src/dashboard/api/drafts.jsx`, `src/dashboard/api/drafts.test.jsx`
- Keep shared `.dash-screen-head`, `.dash-screen-head__actions`, and `.dash-empty` rules in `src/dashboard/styles/base.css`; verify no feature stylesheet duplicates them.

**Interfaces:**
- Add response-only `albumSummaries`, keyed by slug, to `GET /api/admin/draft`; each value contains `photoCount` and `firstPhoto` (photo name or `null`). Compute it from the draft manifest first, then the published manifest, matching `useManifest`. Read manifests only for slugs in the effective albums list; an absent manifest is empty, while a storage error must still fail the request.
- Keep the persisted `albums` array and all PUT payloads unchanged. `AlbumCard` reads the summary from the draft response and uses the saved `coverName` before `firstPhoto`.
- Move `photoCount` to `src/dashboard/lib/album-summary.js`; keep `.dash-screen-head`, `.dash-screen-head__actions`, and `.dash-empty` in the existing shared `styles/base.css`. Do not import from one feature into another.
- `useManifest.setManifest()` updates the manifest cache **and** `albumSummaries[slug]` in the `keys.draft` query data immediately. `overlayUnsaved(keys.draft, ...)` overlays summaries computed from any queued manifests after a refetch; saving a manifest invalidates both its manifest query and `keys.draft`. A newly created album starts with `{ photoCount: 0, firstPhoto: null }`. Discard/publish refresh the server summaries. Never persist `albumSummaries` through `PUT`.

- [ ] **Step 1: Add failing Worker tests** for published-only manifests, draft-over-published precedence, missing/empty manifests, and stable album response shape; assert PUT albums contains no computed summary fields.
- [ ] **Step 2: Add failing UI/cache tests** proving the gallery gets cover/count data from the draft response and does not request one manifest per album; test empty and multi-photo pluralization. Test upload/add, delete/reorder, new album, pending-save refetch, save completion, discard and publish: gallery summaries must reflect the latest manifest without a stale overwrite.
- [ ] **Step 3: Run focused Worker and dashboard tests**; verify expected failures before implementation.
- [ ] **Step 4: Implement the compact summary response and shared pure formatting helper**; remove gallery-only `useManifest` calls while preserving the open-album manifest query. Use one pure manifest-to-summary function on the client, and update the draft query cache through its key rather than storing summary fields on albums.
- [ ] **Step 5: Run focused tests and check imports** so no feature imports another feature's module or styles.
- [ ] **Step 6: Commit** the named Task 2 files only.

## Task 3: Album controls and error states

**Files:**
- Modify/test: `src/dashboard/features/album/AlbumScreen.jsx`, `AlbumScreen.test.jsx`, `AlbumDetails.jsx`, `PhotoGrid.jsx`, `src/dashboard/features/publish/PublishBar.jsx`, `PublishBar.test.jsx`
- Create: `src/dashboard/features/album/AlbumDetails.test.jsx`, `PhotoGrid.test.jsx`
- Modify: `config/texts.config.js`, `config/texts.it.js`

**Interfaces:** Disable cover selection and photo deletion only while a publication mutation is active in this tab; a server-reported interrupted publication does not lock them. Distinguish a failed manifest request from an empty manifest and disable actions without known data. A blank album title on blur reverts immediately to the latest saved title. Explain deletion of a never-published photo and an album/home-hero dependency in the confirmation copy.

- [ ] **Step 1: Write failing tests** for those controls, the manifest failure, both deletion confirmations, and the blank-title revert after a server refetch.
- [ ] **Step 2: Run** `npm test -- src/dashboard/features/album src/dashboard/features/publish/PublishBar.test.jsx`; check expected RED failures.
- [ ] **Step 3: Implement the narrow UI changes** with matching English/Italian text keys and no storage/API changes.
- [ ] **Step 4: Re-run focused tests and all dashboard tests**; commit only Task 3 files.

## Task 4: Persistent upload outcome and dashboard-wide file-drop guard

**Files:**
- Create: `src/dashboard/features/album/upload-context.jsx`, `upload-context.test.jsx`, `src/dashboard/test-setup.js`
- Modify/test: `src/dashboard/App.jsx`, `App.test.jsx`, `src/dashboard/features/album/UploadPanel.jsx`, `UploadPanel.test.jsx`, `vite.config.js`
- Modify: `config/texts.config.js`, `config/texts.it.js`

**Interfaces:** Keep the mutation/job, per-file rows and final summary above route-level screens, keyed by album slug; leaving and returning to an album must not cancel the job or lose its outcome. Do not persist transient upload state across reloads. Keep retry for failed files. Move the `dragover`/`drop` navigation guard to the persistent dashboard shell and remove its route-level copy. A persistent `aria-live` region announces start and each file's phases. `IS_REACT_ACT_ENVIRONMENT` is explicitly set in Vitest `setupFiles`. Only an active mutation in this tab blocks uploads; a stale server status does not.

- [ ] **Step 1: Write failing tests** for navigation away/back during pending, success and error outcomes; retry; announcements; dashboard-wide drop prevention on Albums/Site/Messages; active versus interrupted publication; the explicit test setup.
- [ ] **Step 2: Run** `npm test -- src/dashboard/features/album src/dashboard/App.test.jsx`; check the RED failures.
- [ ] **Step 3: Implement persistent state and global guard** without changing Worker upload routes or browser-reload semantics.
- [ ] **Step 4: Re-run focused and all dashboard tests**; commit only Task 4 files.

## Task 5: Upload names with two sequential windows

**Files:**
- Modify/test: `src/dashboard/features/album/UploadPanel.jsx`, `UploadPanel.test.jsx`, `src/dashboard/api/drafts.jsx`, `drafts.test.jsx`
- Modify: `config/texts.config.js`, `config/texts.it.js`

**Interfaces:** At **each batch start**, force a network read of the draft manifest for the slug and read the published manifest before choosing names; do not use the mounted component's captured `photos` as the naming baseline or trust a fresh-looking query cache. Preserve locally queued unsaved manifest changes through `overlayUnsaved` when that response arrives. Add successful entries via the latest manifest cache/list, retaining local deletions and reorders. Explain Worker `409 NAME_PUBLISHED` in localized copy, and log a failed post-upload manifest reread to the console while showing a retryable error. Do not claim atomic safety for simultaneous writes from two tabs: this task covers an already-saved change in another window before the next batch begins.

- [ ] **Step 1: Write failing tests** simulating window A saving `a.webp`, then window B starting a batch with a stale mounted list; test that B chooses a new name. Also test a queued local manifest overlay, merge after a local reorder/delete, `NAME_PUBLISHED` copy, and failed reread logging/error.
- [ ] **Step 2: Run** `npm test -- src/dashboard/features/album/UploadPanel.test.jsx src/dashboard/api/drafts.test.jsx`; check the RED failures.
- [ ] **Step 3: Implement fresh naming and latest-list merge** without broadening Worker upload semantics or introducing a cross-tab lock.
- [ ] **Step 4: Re-run focused and all dashboard tests**; commit only Task 5 files.

## Task 6: Move reusable photo/upload modules out of the legacy namespace

**Files:**
- Move `src/admin/{sortable,pipeline,encoder,exif,naming,upload-manager}.js` and their applicable tests to `src/dashboard/lib/`.
- Modify imports in `src/dashboard/features/albums/AlbumsScreen.jsx`, `src/dashboard/features/album/{AlbumScreen,UploadPanel}.jsx`, `src/dashboard/ui/useSortable.js`, `src/dashboard/features/site/LinksEditor.jsx` and any other actual consumers found by `rg`.
- Preserve `src/utils/adminTheme.js` and its tests: the Vite plugin still consumes them.

**Interfaces:** Preserve exports and runtime behavior. `src/dashboard/features/albums/new-album.js` remains the feature implementation; `src/admin/album-creation.js` is a legacy duplicate for Task 7. Do not remove a module while a runtime/test import still needs it.

- [ ] **Step 1: Inventory all imports** of each named module with `rg -n 'src/admin|\.\./admin|admin/(sortable|pipeline|encoder|exif|naming|upload-manager)' src config custom.example` and record the consumers.
- [ ] **Step 2: Move the modules and tests, then update imports only**; leave temporary re-export shims in `src/admin/` for legacy UI/tests until Task 7, so the full suite stays runnable between commits. Add focused encoder coverage if its moved behavior has no test.
- [ ] **Step 3: Run moved-module tests, dashboard tests and `npm test`**; verify no stale imports and commit the moves separately.

## Task 7: Remove legacy UI/direct writes and deduplicate photo-path validation

**Files:**
- Modify/test: `src/worker/admin-routes.js`, `admin-routes.test.js`, `src/worker/draft-routes.js`, `draft-routes.test.js`, `src/worker/access-jwt.test.js`, `src/dashboard/App.jsx`, `App.test.jsx`
- Remove after reference checks: `src/pages/admin.js`, `src/admin/api.js` and test, `bootstrap.js` and test, `router.js` and test, `status.js` and test, `preview.js` and test, `views/*`, `album-creation.js` and test, `src/styles/admin.css`, the temporary Task 6 compatibility shims, and other files proven to have only legacy consumers.
- Keep `admin.html` as the React entry. Add a source guard test for imports of removed legacy UI modules.

**Interfaces:** Old direct writes `/api/admin/site`, `/api/admin/albums*`, `/api/admin/albums/:slug/photos/*` return `404` without bucket mutations. Authenticated draft, staging, preview, publish and private Messages routes retain their contracts. The dashboard shell presents a localized draft-load error, with destructive actions unavailable when draft state is unknown. Extract a shared photo slug/name decoder-validator for both staging and preview photo routes; preserve existing `400` behavior on malformed encoding/invalid names.

- [ ] **Step 1: Add failing route/UI tests** for retired write URLs returning `404` with untouched buckets; authenticated allowed routes still work; Access gate still rejects unauthenticated calls; malformed staging/preview photo names share the same validation; shell draft-load error appears.
- [ ] **Step 2: Run focused route/dashboard tests** and check the RED failures; inventory legacy references before deleting any file.
- [ ] **Step 3: Remove the obsolete frontend and route handlers** only after Task 6's import move; introduce the shared validator in `draft-routes.js` (or a small adjacent module) and update both callers.
- [ ] **Step 4: Run focused tests, source guard, `npm test`, and `ALLOW_PLACEHOLDER_CSP=1 npm run build`**; commit only the Task 7 deletions/changes.

## Task 8: Single preview-ready signal and dashboard CSP

**Files:**
- Modify: `src/core/preview-mode.js`, `src/core/preview-mode.test.js`, `src/core/page.js`, `src/core/page.test.js`
- Modify: `src/utils/buildHeaders.js`, `src/utils/buildHeaders.test.js`, generated `_headers` expectations and `src/worker/data-routes.test.js`
- Modify: `src/shared/content-rules.test.js` only if route normalization assertions need updating

**Interfaces:**
- A template page that starts `createPageLifecycle` emits one initial `preview:ready`; the load bridge emits only for pages that did not start a lifecycle. Back-forward-cache restoration remains a distinct restored ready signal.
- `/admin` and every `/admin/*` response use `frame-ancestors 'none'` and `X-Frame-Options: DENY`; public pages preserve their existing same-origin preview policy.

- [ ] **Step 1: Add failing tests** for one initial ready with and without a page lifecycle, duplicate load/page-ready signals, BFCache restore, and CSP values on `/admin`, `/admin/`, `/admin.html`, `/admin/child`, and ordinary site pages. Test the Worker `/admin` route mapping and inspect the built `_headers` rules, not just the generator's helper string.
- [ ] **Step 2: Run focused preview/header tests** and verify they fail on current duplicate ready or broad CSP behavior.
- [ ] **Step 3: Implement the ready ownership guard and path-specific CSP** using existing header-generation patterns.
- [ ] **Step 4: Re-run focused tests**, including built `_headers` output checks.
- [ ] **Step 5: Commit** the named Task 8 files only.

## Task 9: Example correctness and documentation

**Files:**
- Modify: `README.md`, `README.it.md`, `CUSTOMIZING.md`, `docs/runbook-cloudflare.md`, `custom.example/README.md`
- Modify/test: `custom.example/pages/chrome.js`, create `custom.example/pages/chrome.test.js`.
- Modify/test: `src/api/index.js`, `src/api/index.test.js` (additive public export of `mergeTexts` for `custom.example`).

**Interfaces:** The example's `mountChrome()` passes `mergeTexts(texts, site.texts)` to both nav and footer. `src/api/index.js` is the sole supported import from `custom.example`, so expose `mergeTexts` there rather than importing an internal `src/shared` path directly. A missing/blank override retains config text. Keep all other example-site behavior unchanged.

- [ ] **Step 1: Write failing example tests**: an editable `site.texts` value reaches nav and footer, while an absent or blank value keeps config copy; API index exports `mergeTexts`.
- [ ] **Step 2: Run focused example/API tests** and check RED; add the public export and use it in `mountChrome()`; rerun GREEN and commit the example fix separately.
- [ ] **Step 3: Search documentation and examples** for old dashboard routes, old folder paths, and inaccurate description of message access; record every remaining match.
- [ ] **Step 4: Update English and Italian docs together** with React dashboard flow, private Messages screen, draft/publish behavior, protected routes, old-route removal and `/admin/*` framing; explain the sequential-two-window limit and that browser acceptance must use disposable data.
- [ ] **Step 5: Verify documentation locally**: every newly added relative Markdown link resolves to a file or anchor, and `rg` finds no stale legacy endpoint or dashboard instructions in these five documentation targets; do not add a doc-test dependency.
- [ ] **Step 6: Run `npm test` and verify README links/anchors**; commit documentation separately.

## Task 10: Safe browser acceptance and full verification

**Files:**
- Use the in-app browser or existing Chromium QA tooling against a **local or otherwise disposable** environment. Do not create a checked-in browser harness solely for this pass.
- Update only this plan's SDD ledger, resolved from `scripts/sdd-workspace`; do not modify a different plan's 4.3 ledger.

- [ ] **Step 1: Preflight the browser environment before any mutable test**: record URL/host, bucket bindings or mocked API, and proof it has disposable messages/photos and cannot publish to the user's real site. Browser upload, delete, and publish checks require a demonstrated disposable dataset; never run them against real staging or production data. A local Vite page without an authenticated same-origin Worker API is suitable for layout/navigation only, not delete/upload/publish acceptance. If no safe mutable environment exists, run the read-only checks and deterministic Vitest integration checks, mark the mutable browser checks **unverified**, and stop without using real staging or production data.
- [ ] **Step 2: Run** `npm test`, `ALLOW_PLACEHOLDER_CSP=1 npm run build`, and `git diff --check BASE..HEAD` with BASE set to the SHA recorded before Task 1; record exact totals and the placeholder CSP limitation.
- [ ] **Step 3: Run desktop and phone browser checks** on the safe environment: Albums/Site/Messages navigation and responsive layout, message load/reply/cancel/delete, upload then navigate away and observe completion, gallery count/cover, preview editing, publication and console errors. Only exercise delete/upload/publish if Step 1 proved isolation; otherwise list them as unverified. Check actual response headers for `/admin`, `/admin/` and an `/admin/*` path where the host serves one; generated `_headers` tests alone do not prove deployment behavior.
- [ ] **Step 4: Verify route inventory**: no active imports/references to removed direct-write endpoints or legacy UI, while required message and draft routes remain.
- [ ] **Step 5: Record exact verified and unverified results** in this plan's SDD ledger; stop before pushing/deploying. Do not say 4.4 browser acceptance passed if destructive flows were unverified.

## Final review gate

After all implementation and fresh verification, request one independent read-only review from `gpt-6-sol` over the complete 4.4 range against this plan and the spec. The reviewer must inspect the diff and tests, report Critical/Important/Minor findings, and make no edits. Fix every Critical/Important finding, rerun the full suite and build, then request a focused confirmation from the same model; record remaining Minor findings. No push or deploy is included.
