# Dashboard in React, piano 4.3: sito e anteprima — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Site screen of the new dashboard — name, bio, links with icons, home image, the page texts — with the real site as a live preview (a slice of the page in the sheet on a phone, beside the fields on a computer), and a save queue that a refused value no longer blocks.

**Architecture:** The screen reads and changes the site through `useSite()`, which goes through the same save queue as the albums (plan 4.2). Texts go to the preview at every key through `postMessage` (the site's half of the protocol exists since plan 3) and are saved while valid; links and the home image are saved when confirmed, then the preview reads the draft again. The preview is the real site in an iframe of the same origin with `?preview=1`; the dashboard picks its page from the field being edited. Logic without React lives in `src/dashboard/lib/`; link icons are shared with the site's footer in `src/shared/`.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vitest 4 + Testing Library.

**Spec:** `docs/maintainers/superpowers/specs/2026-09-27-dashboard-react-design.md` — "Dati" (Formati, Testi, Icone dei social), "Anteprima", "Dashboard" (Schermate: Sito; Telefono e computer), "Da portare nel piano 4" (Protocollo dell'anteprima, lato dashboard; Form contatti in anteprima), "Da portare nel 4.3 (revisione finale del 4.2)", "Foglio (4.3)", "Moduli (4.2, 4.3)".

## Global Constraints

- Branch `feat/dashboard-react`. Never commit on `main`, never push (the controller pushes).
- Commit messages: subject, blank line, the two trailer lines, with the heredoc shown in each task.
- Stage files by name only (each task's list): never `git add -A` or `git add .`. The untracked `wrangler.json` stays untracked; `.superpowers/` is git-ignored.
- Work only inside `/srv/claude/workspaces/`. Do not read or print credentials.
- Code, comments and test names in English. Visible copy only in `config/texts.config.js` and `config/texts.it.js`, same keys in both.
- A feature uses `ui/`, `lib/` and `api/`, never another feature; `ui/` does not know the features; `lib/` does not know React (spec, "React: vincoli fissati qui").
- No inline `<style>` and no `style=` from React (CSP); no `innerHTML` or `dangerouslySetInnerHTML`.
- The plan was built on a disposable copy, checked in real Chromium (`qa-browser/site-check.mjs`, desktop and phone: rows from the draft, a text typed shows at once in the preview and is outlined, the contact page in the phone sheet, whole page, a link added shows in the preview footer with its icon, the home image shows in the preview, Done saves at once, no console errors; `album-check.mjs` still passes), then replayed task by task. Each task's files are **ready snapshots** in `/srv/claude/workspaces/qa-browser/p43/t<N>/` (lists: `TESTS` copied first, `IMPL` the rest; `FILES` both). Copy them, never edit them. The diff of each task below is the authoritative description of the change.
- Baseline before Task 1: 101 files, 810 passed, 1 skipped.

## Left to plan 4.4 (not in this plan)

The Messages screen; removing the old dashboard and its write routes; moving the reusable modules to `lib/`; a single `ready` on template pages; `frame-ancestors 'none'` for `/admin/*`; the items listed in the spec under "4.4"; README.md and README.it.md.

---

### Task 1: Refused saves, and the site in the draft

From the final review of plan 4.2 (spec, "Da portare nel 4.3"): a save the Worker refuses (400, 413, 415, 422: the value itself is wrong) would fail again unchanged, so it no longer blocks the saves after it. It is set aside: the other resources keep saving, the refused value stays on screen (it is still overlaid on every answer), the top bar says "Not accepted: <reason>. Change it to save it." without Retry, and the next change of that resource is saved normally. Any other failure (network, session, server) keeps its place and blocks the ones after it until Retry, as before.

The Site screen needs the site of the draft: `useSite()` gives it always in the current shape (`links`, never the old `social`; the defaults of `config/site.config.js` on a new installation) with a setter like `setAlbums`.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/dashboard/App.jsx`, `src/dashboard/App.test.jsx`, `src/dashboard/api/drafts.jsx`, `src/dashboard/api/drafts.test.jsx`, `src/dashboard/api/save-queue.js`, `src/dashboard/api/save-queue.test.js`, `src/dashboard/lib/site.js`, `src/dashboard/lib/site.test.js`

**Interfaces:**
- Consumes: `createSaveQueue`, `useAlbums`/`useManifest` pattern and `overlayUnsaved` from plan 4.2; `normalizeLinks` (`src/shared/site-links.js`).
- Produces:
  - queue state `error: { key, message, refused: boolean } | null`; `holds`/`valueOf`/`busy` also count a refused value;
  - `siteForEditing(site, defaults) → { name, bio, hero, links, texts }` in `src/dashboard/lib/site.js`;
  - `useSite() → { ...draftQuery, site, setSite(next | prev => next, { now }?) → boolean }` in `src/dashboard/api/drafts.jsx` (false and nothing saved before the draft loads);
  - text `admin.publish.saveRefused`.

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t1/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t1/$f" "$f"; done
```

Run: `npm test` → 4 files fail, 6 tests fail.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t1/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t1/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 102 files, 821 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "not wrapped in act"` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/dashboard/App.jsx src/dashboard/App.test.jsx src/dashboard/api/drafts.jsx src/dashboard/api/drafts.test.jsx src/dashboard/api/save-queue.js src/dashboard/api/save-queue.test.js src/dashboard/lib/site.js src/dashboard/lib/site.test.js
git commit -F - <<'EOF'
feat(dashboard): refused saves no longer block the others; the site in the draft

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The tests (diff):**

````diff
diff --git a/src/dashboard/App.test.jsx b/src/dashboard/App.test.jsx
index 417b407..621afe8 100644
--- a/src/dashboard/App.test.jsx
+++ b/src/dashboard/App.test.jsx
@@ -3,6 +3,7 @@ import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
 import { createMemoryRouter, RouterProvider } from 'react-router';
 import { texts } from '../../config/texts.config.js';
 import { DraftState, routes } from './App.jsx';
+import { formatText } from '../utils/formatText.js';
 import { useSaveQueue } from './api/drafts.jsx';
 import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers, renderWithQuery } from './test-utils.jsx';
 
@@ -63,6 +64,21 @@ describe('dashboard frame', () => {
     expect(await screen.findByText(texts.admin.publish.draftSaved)).toBeTruthy();
   });
 
+  it('a value the Worker refuses is explained without Retry: the next change saves it', async () => {
+    fakeWorker({
+      'GET /api/admin/draft/status': STATUS,
+      'PUT /api/admin/draft/site': { status: 400, body: { error: 'site.name is required' } },
+    });
+    let queue;
+    function WithQueue() { queue = useSaveQueue(); return <DraftState />; }
+    renderWithQuery(<WithQueue />);
+    await screen.findByText(texts.admin.publish.allPublished);
+    act(() => { queue.set('site', { name: '' }); });
+    await act(() => queue.flush());
+    expect(screen.getByRole('alert').textContent).toBe(formatText(texts.admin.publish.saveRefused, { message: 'site.name is required' }));
+    expect(screen.queryByRole('button', { name: texts.admin.publish.retry })).toBeNull();
+  });
+
   it('says so when the draft cannot be loaded', async () => {
     fakeWorker({ 'GET /api/admin/draft/status': STATUS });
     renderDashboard('/');
diff --git a/src/dashboard/api/drafts.test.jsx b/src/dashboard/api/drafts.test.jsx
index 2cfe597..28d9773 100644
--- a/src/dashboard/api/drafts.test.jsx
+++ b/src/dashboard/api/drafts.test.jsx
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { act, renderHook, waitFor } from '@testing-library/react';
-import { overlayUnsaved, savePath, useAlbums, useManifest, useSaveQueue, useSaveState } from './drafts.jsx';
+import { overlayUnsaved, savePath, useAlbums, useManifest, useSaveQueue, useSaveState, useSite } from './drafts.jsx';
 import { keys } from './queries.js';
 import { fakeWorker, makeQueryClient, Providers } from '../test-utils.jsx';
 
@@ -153,3 +153,51 @@ describe('useManifest', () => {
     expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft/albums/notte/manifest' && init?.method === 'PUT')).toBe(true);
   });
 });
+
+describe('useSite', () => {
+  it('gives the site in the current shape and saves a change of it', async () => {
+    const legacy = { ...DRAFT, site: { name: 'D', bio: '', hero: null, social: { instagram: 'https://instagram.com/d' } } };
+    const fetchMock = fakeWorker({ 'GET /api/admin/draft': legacy, 'PUT /api/admin/draft/site': { ok: true } });
+    const { result } = renderHook(() => ({ ...useSite(), queue: useSaveQueue() }), { wrapper: wrapper(makeQueryClient()) });
+    await waitFor(() => expect(result.current.site).toBeDefined());
+    expect(result.current.site.links).toEqual([{ url: 'https://instagram.com/d' }]);
+    act(() => { result.current.setSite(prev => ({ ...prev, bio: 'Fotografo' })); });
+    await waitFor(() => expect(result.current.site.bio).toBe('Fotografo'));
+    await act(() => result.current.queue.flush());
+    const put = fetchMock.mock.calls.find(([path, init]) => path === '/api/admin/draft/site' && init?.method === 'PUT');
+    // Saved in the current shape: links, no social.
+    expect(JSON.parse(put[1].body)).toEqual({ name: 'D', bio: 'Fotografo', hero: null, links: [{ url: 'https://instagram.com/d' }], texts: {} });
+  });
+
+  it('does nothing before the draft has loaded', () => {
+    const fetchMock = fakeWorker({ 'GET /api/admin/draft': () => new Promise(() => {}) });
+    const { result } = renderHook(() => useSite(), { wrapper: wrapper(makeQueryClient()) });
+    let changed;
+    act(() => { changed = result.current.setSite(prev => ({ ...prev, bio: 'x' })); });
+    expect(changed).toBe(false);
+    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
+  });
+
+  it('a refused site stays on screen while the albums keep saving', async () => {
+    const fetchMock = fakeWorker({
+      'GET /api/admin/draft': DRAFT,
+      'PUT /api/admin/draft/site': { status: 400, body: { error: 'site.name is required' } },
+      'PUT /api/admin/draft/albums': { ok: true },
+    });
+    const client = makeQueryClient();
+    const { result } = renderHook(() => ({ site: useSite(), albums: useAlbums(), queue: useSaveQueue(), save: useSaveState() }), { wrapper: wrapper(client) });
+    await waitFor(() => expect(result.current.site.site).toBeDefined());
+    act(() => {
+      result.current.site.setSite(prev => ({ ...prev, name: '' }));
+      result.current.albums.setAlbums(prev => prev.map(album => ({ ...album, title: 'Edited' })));
+    });
+    await act(() => result.current.queue.flush());
+    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft/albums' && init?.method === 'PUT')).toBe(true);
+    expect(result.current.save.error).toEqual({ key: 'site', message: 'site.name is required', refused: true });
+    // A refetch keeps what was typed on screen.
+    await act(() => client.invalidateQueries({ queryKey: keys.draft }));
+    await waitFor(() => expect(client.isFetching()).toBe(0));
+    expect(result.current.site.site.name).toBe('');
+  });
+});
+
diff --git a/src/dashboard/api/save-queue.test.js b/src/dashboard/api/save-queue.test.js
index 911317b..ca1d19a 100644
--- a/src/dashboard/api/save-queue.test.js
+++ b/src/dashboard/api/save-queue.test.js
@@ -130,4 +130,54 @@ describe('createSaveQueue', () => {
     expect(listener).toHaveBeenCalled();
     stop();
   });
+
+  it('a value the Worker refuses is set aside: the other resources still save, and it stays on screen', async () => {
+    const refusal = Object.assign(new Error('site.name is required'), { status: 400 });
+    const { queue, saved } = makeQueue(async key => { if (key === 'site') throw refusal; });
+    queue.set('site', { name: '' });
+    queue.set('albums', 'renamed');
+    await queue.flush();
+    expect(saved).toEqual([['albums', 'renamed']]);
+    expect(queue.getState().error).toEqual({ key: 'site', message: 'site.name is required', refused: true });
+    // Still the value shown for the site, until it changes.
+    expect(queue.holds('site')).toBe(true);
+    expect(queue.valueOf('site')).toEqual({ name: '' });
+    expect(queue.busy()).toBe(true);
+  });
+
+  it('the next change of a refused resource is saved normally and clears the error', async () => {
+    let refuse = true;
+    const { queue, saved } = makeQueue(async key => {
+      if (key === 'site' && refuse) throw Object.assign(new Error('site.name is required'), { status: 400 });
+    });
+    queue.set('site', { name: '' });
+    await queue.flush();
+    refuse = false;
+    queue.set('site', { name: 'D' });
+    await queue.flush();
+    expect(saved).toEqual([['site', { name: 'D' }]]);
+    expect(queue.getState().error).toBeNull();
+    expect(queue.busy()).toBe(false);
+  });
+
+  it('any other failure (network, session, server) keeps its place and stops the saves after it', async () => {
+    const { queue, saved } = makeQueue(async key => {
+      if (key === 'site') throw Object.assign(new Error('HTTP 503'), { status: 503 });
+    });
+    queue.set('site', { name: 'D' });
+    queue.set('albums', 'renamed');
+    await queue.flush();
+    expect(saved).toEqual([]);
+    expect(queue.getState().error).toEqual({ key: 'site', message: 'HTTP 503', refused: false });
+    expect(queue.getState().pending).toBe(2);
+  });
+
+  it('clear() also forgets a refused value', async () => {
+    const { queue } = makeQueue(async () => { throw Object.assign(new Error('bad'), { status: 400 }); });
+    queue.set('site', { name: '' });
+    await queue.flush();
+    queue.clear();
+    expect(queue.holds('site')).toBe(false);
+    expect(queue.busy()).toBe(false);
+  });
 });
diff --git a/src/dashboard/lib/site.test.js b/src/dashboard/lib/site.test.js
new file mode 100644
index 0000000..34d5931
--- /dev/null
+++ b/src/dashboard/lib/site.test.js
@@ -0,0 +1,23 @@
+// @vitest-environment node
+import { describe, expect, it } from 'vitest';
+import { siteForEditing } from './site.js';
+
+const DEFAULTS = { name: 'Photographer Name', bio: 'Short bio', heroImage: null, links: [{ url: 'https://instagram.com/x' }] };
+
+describe('siteForEditing', () => {
+  it('starts from config/site.config.js when there is no site yet', () => {
+    expect(siteForEditing(null, DEFAULTS)).toEqual({
+      name: 'Photographer Name', bio: 'Short bio', hero: null, links: [{ url: 'https://instagram.com/x' }], texts: {},
+    });
+  });
+
+  it('turns the old social shape into links and drops it', () => {
+    const site = { name: 'D', bio: '', hero: null, social: { instagram: 'https://instagram.com/d' } };
+    expect(siteForEditing(site, DEFAULTS)).toEqual({ name: 'D', bio: '', hero: null, links: [{ url: 'https://instagram.com/d' }], texts: {} });
+  });
+
+  it('keeps links, texts and hero as they are', () => {
+    const site = { name: 'D', bio: 'B', hero: { album: 'notte', name: 'a.webp' }, links: [], texts: { 'about.heading': 'Ciao' } };
+    expect(siteForEditing(site, DEFAULTS)).toEqual(site);
+  });
+});
````

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index a057b85..7b22f46 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -92,6 +92,7 @@ export const texts = {
       saving: 'Saving…',
       waitingPublication: 'Changes wait for the publication',
       saveFailed: 'Not saved: {message}',
+      saveRefused: 'Not accepted: {message}. Change it to save it.',
       retry: 'Retry',
       changesTitle: 'What publishing changes',
       close: 'Close',
diff --git a/config/texts.it.js b/config/texts.it.js
index d29c9af..7f76370 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -90,6 +90,7 @@ export const texts = {
       saving: 'Salvataggio…',
       waitingPublication: 'Le modifiche aspettano la pubblicazione',
       saveFailed: 'Non salvato: {message}',
+      saveRefused: 'Non accettato: {message}. Correggilo per salvarlo.',
       retry: 'Riprova',
       changesTitle: 'Cosa cambia pubblicando',
       close: 'Chiudi',
diff --git a/src/dashboard/App.jsx b/src/dashboard/App.jsx
index 50e2578..125a5f5 100644
--- a/src/dashboard/App.jsx
+++ b/src/dashboard/App.jsx
@@ -36,6 +36,15 @@ export function DraftState() {
   const { data } = useDraftStatus();
   const queue = useSaveQueue();
   const save = useSaveState();
+  if (save.error?.refused) {
+    // The Worker said the value is wrong: retrying cannot help, the next change is saved.
+    return (
+      <span className="dash-state dash-state--error" role="alert">
+        <span className="dash-state__dot" aria-hidden="true" />
+        {formatText(t.publish.saveRefused, { message: save.error.message })}
+      </span>
+    );
+  }
   if (save.error) {
     return (
       <span className="dash-state dash-state--error" role="alert">
diff --git a/src/dashboard/api/drafts.jsx b/src/dashboard/api/drafts.jsx
index cc74b0a..670fb13 100644
--- a/src/dashboard/api/drafts.jsx
+++ b/src/dashboard/api/drafts.jsx
@@ -12,6 +12,8 @@ import { keys, useDraft } from './queries.js';
 import { createSaveQueue } from './save-queue.js';
 import { SaveQueueContext } from './save-context.js';
 import { SLUG_RE } from '../../shared/content-rules.js';
+import { siteConfig } from '../../../config/site.config.js';
+import { siteForEditing } from '../lib/site.js';
 
 /** Where each queued resource is saved. */
 export function savePath(key) {
@@ -146,3 +148,27 @@ export function useManifest(slug) {
   };
   return { ...manifest, photos: manifest.data, setManifest };
 }
+
+/**
+ * The site being edited (name, bio, home image, links, page texts), always in the current
+ * shape, and a setter like `setAlbums`: a value or a function of the latest one, nothing
+ * (and false) before the draft has loaded.
+ */
+export function useSite() {
+  const client = useQueryClient();
+  const queue = useSaveQueue();
+  const draft = useDraft();
+  const loaded = draft.data?.site;
+  const site = useMemo(() => (draft.data ? siteForEditing(loaded, siteConfig) : undefined), [draft.data, loaded]);
+  const setSite = (next, options) => {
+    const data = client.getQueryData(keys.draft);
+    if (!data) return false;
+    const value = resolve(next, siteForEditing(data.site, siteConfig));
+    client.cancelQueries({ queryKey: keys.draft });
+    client.setQueryData(keys.draft, old => ({ ...old, site: value }));
+    queue.set('site', value, options);
+    return true;
+  };
+  return { ...draft, site, setSite };
+}
+
diff --git a/src/dashboard/api/save-queue.js b/src/dashboard/api/save-queue.js
index a478e00..6f81009 100644
--- a/src/dashboard/api/save-queue.js
+++ b/src/dashboard/api/save-queue.js
@@ -15,12 +15,22 @@
  * `clear()` drops what waits (the draft is being discarded): a save already running that
  * fails afterwards is not brought back.
  *
+ * A save the Worker refuses (the value is not valid: 400, 413, 415, 422) would fail again
+ * unchanged, so it is set aside instead of kept first in line: the other resources go on
+ * saving, the refused value stays on screen with the Worker's reason, and the next change
+ * of that resource is saved normally. A save that failed for any other reason (network,
+ * session expired, server error) keeps its place and blocks the ones after it until Retry.
+ *
  * Plain JavaScript (no React).
  */
 
 /** Wait after the last change before saving. */
 export const SAVE_DELAY_MS = 800;
 
+/** Answers that say the value itself is wrong: saving it again cannot work. */
+const REFUSED = new Set([400, 413, 415, 422]);
+const isRefusal = e => REFUSED.has(e?.status);
+
 /**
  * @param {{save: (key: string, value: any) => Promise<void>, delay?: number,
  *   onSaved?: (key: string) => void}} options
@@ -30,7 +40,8 @@ export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
   const listeners = new Set();
   let inFlight = null; // { key, value } being saved
   let paused = false;
-  let error = null; // { key, message }
+  let error = null; // { key, message, refused }
+  const refused = new Map(); // key → value the Worker refused, until the next change of it
   let timer = null;
   let running = null; // the promise of the flush in progress
   let generation = 0; // bumped by clear(): a save started before it is not put back
@@ -57,11 +68,16 @@ export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
         if (error?.key === key) error = null;
         onSaved?.(key);
       } catch (e) {
-        if (started === generation) {
-          // Keep the change, first in line, unless a newer one arrived meanwhile.
-          if (!pending.has(key)) pending = new Map([[key, value], ...pending]);
-          error = { key, message: e?.message ?? String(e) };
+        if (started !== generation) return;
+        if (isRefusal(e)) {
+          // Set aside, unless a newer value arrived meanwhile: the others keep saving.
+          if (!pending.has(key)) refused.set(key, value);
+          error = { key, message: e?.message ?? String(e), refused: true };
+          continue;
         }
+        // Keep the change, first in line, unless a newer one arrived meanwhile.
+        if (!pending.has(key)) pending = new Map([[key, value], ...pending]);
+        error = { key, message: e?.message ?? String(e), refused: false };
         return;
       } finally {
         inFlight = null;
@@ -82,6 +98,7 @@ export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
   return {
     /** Queues the latest value of a resource; saved after the delay, or now with { now: true }. */
     set(key, value, { now = false } = {}) {
+      refused.delete(key); // a new value gets its own chance
       pending.set(key, value); // an existing key keeps its place in the order
       notify();
       if (now) flush(); else schedule();
@@ -105,18 +122,21 @@ export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
       clearTimeout(timer);
       timer = null;
       pending.clear();
+      refused.clear();
       generation += 1;
       error = null;
       notify();
     },
     /** Resolves once no save is running. */
     whenIdle: () => running ?? Promise.resolve(),
-    /** True while something is waiting or being saved: the screens must not overwrite it. */
-    busy: () => pending.size > 0 || inFlight !== null,
-    /** True when this resource has a value waiting or being saved. */
-    holds: key => pending.has(key) || inFlight?.key === key,
-    /** The value waiting (else being saved) for this resource, or undefined. */
-    valueOf: key => (pending.has(key) ? pending.get(key) : inFlight?.key === key ? inFlight.value : undefined),
+    /** True while something is not saved (waiting, being saved, refused): the screens must not overwrite it. */
+    busy: () => pending.size > 0 || inFlight !== null || refused.size > 0,
+    /** True when this resource has a value that is not saved: waiting, being saved or refused. */
+    holds: key => pending.has(key) || inFlight?.key === key || refused.has(key),
+    /** The value waiting (else being saved, else refused) for this resource, or undefined. */
+    valueOf: key => (pending.has(key) ? pending.get(key)
+      : inFlight?.key === key ? inFlight.value
+        : refused.get(key)),
     getState: () => state,
     subscribe(listener) {
       listeners.add(listener);
diff --git a/src/dashboard/lib/site.js b/src/dashboard/lib/site.js
new file mode 100644
index 0000000..7b20a2f
--- /dev/null
+++ b/src/dashboard/lib/site.js
@@ -0,0 +1,20 @@
+/**
+ * The site as the dashboard edits it: always in the current shape (`links`, never the old
+ * `social`), with defaults where the draft has nothing yet. Plain JavaScript (no React).
+ */
+import { normalizeLinks } from '../../shared/site-links.js';
+
+/**
+ * @param {object|null} site - The draft's site (the published one when there is no draft),
+ *   or null on a new installation.
+ * @param {{name: string, bio?: string, heroImage?: object|null, links?: Array, social?: object}} defaults -
+ *   config/site.config.js, used when there is no site yet.
+ * @returns {{name: string, bio: string, hero: {album: string, name: string}|null,
+ *   links: Array<{url: string, label?: string}>, texts: Record<string, string>}}
+ */
+export function siteForEditing(site, defaults) {
+  if (!site) {
+    return { name: defaults.name, bio: defaults.bio ?? '', hero: defaults.heroImage ?? null, links: normalizeLinks(defaults), texts: {} };
+  }
+  return { name: site.name, bio: site.bio ?? '', hero: site.hero ?? null, links: normalizeLinks(site), texts: site.texts ?? {} };
+}
````

---

### Task 2: The preview, dashboard side

The dashboard's half of the preview protocol (spec, "Anteprima" and "Protocollo dell'anteprima, lato dashboard"). The site's half (plan 3) already answers `preview:field`, `preview:focus`, `preview:reload` and says `preview:ready`.
- `fieldPage(field)`: `texts.about.*` live on `/about`, everything else on `/`; the dashboard sets the frame's address itself.
- `usePreview()`: sends each text as it is typed and the focused field; on **every** `preview:ready` (it can come more than once) sends again the texts not yet saved and the focus; accepts messages only from its own iframe on this origin; `forget(field)` once a text is saved (so Discard cannot bring it back into the page); `reload()` after changes that are not text.
- `PreviewFrame`: the iframe, `/<page>?preview=1`, a slice of the page or the whole page.
- `useMediaQuery(query)` in `ui/`, for the computer layout of the next task.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/dashboard/features/site/PreviewFrame.jsx`, `src/dashboard/features/site/site.css`, `src/dashboard/features/site/usePreview.js`, `src/dashboard/features/site/usePreview.test.jsx`, `src/dashboard/lib/preview.js`, `src/dashboard/lib/preview.test.js`, `src/dashboard/ui/useMediaQuery.js`, `src/dashboard/ui/useMediaQuery.test.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fieldPage`, `previewSrc`, `PREVIEW_QUERY` (`src/dashboard/lib/preview.js`); `useMediaQuery(query) → boolean` (`src/dashboard/ui/useMediaQuery.js`); `usePreview() → { frameRef, field(name, value), focus(name | null), forget(name), reload() }` and `<PreviewFrame frameRef page full? />` (`src/dashboard/features/site/`); `site.css` with `.dash-preview`; text `admin.site.previewTitle`.

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t2/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t2/$f" "$f"; done
```

Run: `npm test` → 3 files fail (modules not found).

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t2/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t2/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 105 files, 830 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "not wrapped in act"` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/dashboard/features/site/PreviewFrame.jsx src/dashboard/features/site/site.css src/dashboard/features/site/usePreview.js src/dashboard/features/site/usePreview.test.jsx src/dashboard/lib/preview.js src/dashboard/lib/preview.test.js src/dashboard/ui/useMediaQuery.js src/dashboard/ui/useMediaQuery.test.jsx
git commit -F - <<'EOF'
feat(dashboard): the preview of the site, dashboard side

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The tests (diff):**

````diff
diff --git a/src/dashboard/features/site/usePreview.test.jsx b/src/dashboard/features/site/usePreview.test.jsx
new file mode 100644
index 0000000..802bd40
--- /dev/null
+++ b/src/dashboard/features/site/usePreview.test.jsx
@@ -0,0 +1,73 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { act, cleanup, render } from '@testing-library/react';
+import { usePreview } from './usePreview.js';
+
+afterEach(cleanup);
+
+let preview;
+function Frame() {
+  preview = usePreview();
+  return <iframe ref={preview.frameRef} title="preview" />;
+}
+
+function setup() {
+  render(<Frame />);
+  const frame = document.querySelector('iframe');
+  const posted = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
+  const ready = (source = frame.contentWindow, origin = window.location.origin) =>
+    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, origin, source })); });
+  return { frame, posted, ready };
+}
+
+describe('usePreview', () => {
+  it('sends each text as it is typed, and the focus, to the page on this origin', () => {
+    const { posted } = setup();
+    preview.field('site.bio', 'Fotografo');
+    preview.focus('site.bio');
+    expect(posted.mock.calls).toEqual([
+      [{ type: 'preview:field', field: 'site.bio', value: 'Fotografo' }, window.location.origin],
+      [{ type: 'preview:focus', field: 'site.bio' }, window.location.origin],
+    ]);
+  });
+
+  it('on every ready sends again the texts not saved and the focused field', () => {
+    const { posted, ready } = setup();
+    preview.field('site.name', 'D');
+    preview.field('site.name', 'Davide');
+    preview.focus('site.name');
+    posted.mockClear();
+    ready();
+    ready();
+    const once = [
+      [{ type: 'preview:field', field: 'site.name', value: 'Davide' }, window.location.origin],
+      [{ type: 'preview:focus', field: 'site.name' }, window.location.origin],
+    ];
+    expect(posted.mock.calls).toEqual([...once, ...once]);
+  });
+
+  it('a text forgotten after its save is not sent again; no focus after leaving the field', () => {
+    const { posted, ready } = setup();
+    preview.field('site.name', 'Davide');
+    preview.focus('site.name');
+    preview.forget('site.name');
+    preview.focus(null);
+    posted.mockClear();
+    ready();
+    expect(posted).not.toHaveBeenCalled();
+  });
+
+  it('ignores a ready from another window or another origin', () => {
+    const { posted, ready } = setup();
+    preview.field('site.name', 'Davide');
+    posted.mockClear();
+    ready(window);
+    ready(undefined, 'https://evil.example');
+    expect(posted).not.toHaveBeenCalled();
+  });
+
+  it('asks the page to read the draft again', () => {
+    const { posted } = setup();
+    preview.reload();
+    expect(posted).toHaveBeenCalledWith({ type: 'preview:reload' }, window.location.origin);
+  });
+});
diff --git a/src/dashboard/lib/preview.test.js b/src/dashboard/lib/preview.test.js
new file mode 100644
index 0000000..33cb9ea
--- /dev/null
+++ b/src/dashboard/lib/preview.test.js
@@ -0,0 +1,24 @@
+// @vitest-environment node
+import { describe, expect, it } from 'vitest';
+import { PREVIEW_FIELDS } from '../../shared/content-rules.js';
+import { fieldPage, previewSrc } from './preview.js';
+
+describe('fieldPage', () => {
+  it('shows the contact page texts on /about, the rest on the home page', () => {
+    expect(fieldPage('texts.about.heading')).toBe('/about');
+    expect(fieldPage('texts.about.form.successMessage')).toBe('/about');
+    expect(fieldPage('site.name')).toBe('/');
+    expect(fieldPage('texts.landing.albumsSectionHeading')).toBe('/');
+    expect(fieldPage(null)).toBe('/');
+  });
+
+  it('knows a page for every field the site marks', () => {
+    for (const field of PREVIEW_FIELDS) expect(['/', '/about']).toContain(fieldPage(field));
+  });
+});
+
+describe('previewSrc', () => {
+  it('asks the page for the draft', () => {
+    expect(previewSrc('/about')).toBe('/about?preview=1');
+  });
+});
diff --git a/src/dashboard/ui/useMediaQuery.test.jsx b/src/dashboard/ui/useMediaQuery.test.jsx
new file mode 100644
index 0000000..5ca6918
--- /dev/null
+++ b/src/dashboard/ui/useMediaQuery.test.jsx
@@ -0,0 +1,24 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { act, cleanup, renderHook } from '@testing-library/react';
+import { useMediaQuery } from './useMediaQuery.js';
+
+afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
+
+function fakeMatchMedia(initial) {
+  const listeners = new Set();
+  const list = { matches: initial, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
+  vi.stubGlobal('matchMedia', () => list);
+  return { set(value) { list.matches = value; for (const fn of listeners) fn(); }, listeners };
+}
+
+describe('useMediaQuery', () => {
+  it('follows the media query as it changes', () => {
+    const media = fakeMatchMedia(false);
+    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 900px)'));
+    expect(result.current).toBe(false);
+    act(() => media.set(true));
+    expect(result.current).toBe(true);
+    unmount();
+    expect(media.listeners.size).toBe(0);
+  });
+});
````

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index 7b22f46..90b2fb9 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -121,6 +121,7 @@ export const texts = {
       heroReadError: 'Could not read the photos of this album.',
       heroChooseAlbum: 'Choose an album…',
       heroNone: 'none',
+      previewTitle: 'Preview of the site, with the changes not yet published',
     },
     albums: {
       sectionTitle: 'Albums',
diff --git a/config/texts.it.js b/config/texts.it.js
index 7f76370..4819bed 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -118,6 +118,7 @@ export const texts = {
       heroUpdated: 'Hero aggiornata.',
       heroReadError: 'Impossibile leggere le foto di questo album.',
       heroChooseAlbum: 'Scegli album…',
+      previewTitle: 'Anteprima del sito, con le modifiche non ancora pubblicate',
       heroNone: 'nessuna',
     },
     albums: {
diff --git a/src/dashboard/features/site/PreviewFrame.jsx b/src/dashboard/features/site/PreviewFrame.jsx
new file mode 100644
index 0000000..6d207a6
--- /dev/null
+++ b/src/dashboard/features/site/PreviewFrame.jsx
@@ -0,0 +1,17 @@
+import { texts } from '../../../../config/texts.config.js';
+import { previewSrc } from '../../lib/preview.js';
+import './site.css';
+
+const t = texts.admin.site;
+
+/**
+ * The real site, reading the draft, in a frame. `page` picks the page of the site shown
+ * (changing it loads that page); `full` makes the frame as tall as the space it has.
+ * @param {{frameRef: object, page: string, full?: boolean, className?: string}} props
+ */
+export function PreviewFrame({ frameRef, page, full = false, className = '' }) {
+  return (
+    <iframe ref={frameRef} src={previewSrc(page)} title={t.previewTitle}
+      className={`dash-preview${full ? ' dash-preview--full' : ''} ${className}`.trim()} />
+  );
+}
diff --git a/src/dashboard/features/site/site.css b/src/dashboard/features/site/site.css
new file mode 100644
index 0000000..04e47f9
--- /dev/null
+++ b/src/dashboard/features/site/site.css
@@ -0,0 +1,6 @@
+/* The real site in a frame: a slice of the page while a field is edited, or all of it. */
+.dash-preview {
+  display: block; width: 100%; height: min(40vh, 22rem); border: 1px solid var(--admin-line);
+  border-radius: var(--admin-radius); background: #fff;
+}
+.dash-preview--full { height: calc(100dvh - 12rem); }
diff --git a/src/dashboard/features/site/usePreview.js b/src/dashboard/features/site/usePreview.js
new file mode 100644
index 0000000..4e6d1cc
--- /dev/null
+++ b/src/dashboard/features/site/usePreview.js
@@ -0,0 +1,55 @@
+import { useCallback, useEffect, useMemo, useRef } from 'react';
+
+/**
+ * The dashboard's side of the preview protocol (spec, "Anteprima" and "Protocollo
+ * dell'anteprima, lato dashboard"). The preview is the real site in an iframe of the same
+ * origin, reading the draft:
+ * - `field(name, value)` shows a text as it is typed (`preview:field`), before it is saved;
+ * - `focus(name | null)` scrolls to a field and outlines it, or removes the outline;
+ * - `reload()` makes the page read the draft again, after a change that is not a text;
+ * - `forget(name)` stops sending a text again once it is saved (after Discard it would
+ *   otherwise come back into the page).
+ * The page says `preview:ready` each time it (re)loads, possibly more than once: every time
+ * the texts typed and not yet saved, and the focused field, are sent again. Messages are
+ * accepted only from the iframe itself, on this origin.
+ * @returns {{frameRef: {current: HTMLIFrameElement|null}, field: Function, focus: Function, forget: Function, reload: Function}}
+ */
+export function usePreview() {
+  const frameRef = useRef(null);
+  const live = useRef(new Map()); // field → text typed, sent again on every ready
+  const focused = useRef(null);
+
+  const post = useCallback(message => {
+    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
+  }, []);
+
+  useEffect(() => {
+    const onMessage = event => {
+      if (event.origin !== window.location.origin || !frameRef.current || event.source !== frameRef.current.contentWindow) return;
+      if (event.data?.type !== 'preview:ready') return;
+      for (const [name, value] of live.current) post({ type: 'preview:field', field: name, value });
+      if (focused.current) post({ type: 'preview:focus', field: focused.current });
+    };
+    window.addEventListener('message', onMessage);
+    return () => window.removeEventListener('message', onMessage);
+  }, [post]);
+
+  return useMemo(() => ({
+    frameRef,
+    field(name, value) {
+      live.current.set(name, value);
+      post({ type: 'preview:field', field: name, value });
+    },
+    focus(name) {
+      focused.current = name;
+      post({ type: 'preview:focus', field: name });
+    },
+    forget(name) {
+      live.current.delete(name);
+    },
+    reload() {
+      // After a reload the page shows what is saved: the texts typed are sent again on ready.
+      post({ type: 'preview:reload' });
+    },
+  }), [post]);
+}
diff --git a/src/dashboard/lib/preview.js b/src/dashboard/lib/preview.js
new file mode 100644
index 0000000..dcacd8c
--- /dev/null
+++ b/src/dashboard/lib/preview.js
@@ -0,0 +1,26 @@
+/**
+ * Where each field of the site is shown, for the preview of the dashboard (spec,
+ * "Protocollo dell'anteprima, lato dashboard"). Plain JavaScript (no React).
+ */
+
+/** The query parameter that turns a page of the site into a preview of the draft. */
+export const PREVIEW_QUERY = 'preview=1';
+
+/**
+ * The page of the site where a field is shown: the contact page's texts on /about,
+ * everything else (name, bio, links, home) on the home page.
+ * @param {string|null} field - A PREVIEW_FIELDS value, or null.
+ * @returns {'/'|'/about'}
+ */
+export function fieldPage(field) {
+  return typeof field === 'string' && field.startsWith('texts.about.') ? '/about' : '/';
+}
+
+/**
+ * The address of the preview of a page.
+ * @param {string} page - A path of the site, e.g. '/about'.
+ * @returns {string}
+ */
+export function previewSrc(page) {
+  return `${page}?${PREVIEW_QUERY}`;
+}
diff --git a/src/dashboard/ui/useMediaQuery.js b/src/dashboard/ui/useMediaQuery.js
new file mode 100644
index 0000000..8bcd602
--- /dev/null
+++ b/src/dashboard/ui/useMediaQuery.js
@@ -0,0 +1,16 @@
+import { useSyncExternalStore } from 'react';
+
+/**
+ * Whether a CSS media query matches now, following its changes (a window resized, a
+ * phone turned).
+ * @param {string} query - e.g. '(min-width: 900px)'.
+ * @returns {boolean}
+ */
+export function useMediaQuery(query) {
+  const subscribe = onChange => {
+    const list = window.matchMedia?.(query);
+    list?.addEventListener?.('change', onChange);
+    return () => list?.removeEventListener?.('change', onChange);
+  };
+  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false);
+}
````

---

### Task 3: Site screen: identity, home heading, contact page

The Site screen (spec, "Sito"; "Telefono e computer"): groups "Who you are" (name, bio), "Home" (albums heading), "Contact page" (title, text, message after sending). Each field is a row that opens a sheet. What is typed goes to the preview at every key and is saved while valid (an empty name, or a page text over 500 characters, is not: the last good value stays and the sheet says why); closing the sheet saves at once. A page text shows the template's text until changed ("Template text" on the row) and can go back to it.
- Phone: the sheet shows the page of the field above it, with "Whole page".
- Computer (`min-width: 900px`): the preview stands beside the fields and follows the field being edited; the sheet opens over the fields so the preview stays in view.
- The contact form does not send in the preview: the sheet of "Message after sending" says so (spec, "Form contatti in anteprima").
- `Sheet` closes on the backdrop only when both press and release are on it (spec, "Foglio (4.3)").
- The form styles shared by the screens (`.dash-screen-head`, `.dash-hint`, `.dash-empty`, `.dash-form`, `.dash-input`, `.dash-form__error`) move from `features/albums/albums.css` to `styles/base.css`, so the Site screen does not import another feature's CSS; `AlbumScreen` stops importing `albums.css`.
- The fields follow the draft when no sheet is open (spec, "Da portare nel 4.3"): rows read the draft; the sheet is modal, so Discard cannot run while a field is being edited.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/dashboard/features/album/AlbumScreen.jsx`, `src/dashboard/features/albums/albums.css`, `src/dashboard/features/site/FieldSheet.jsx`, `src/dashboard/features/site/SiteScreen.jsx`, `src/dashboard/features/site/SiteScreen.test.jsx`, `src/dashboard/features/site/site.css`, `src/dashboard/lib/site-fields.js`, `src/dashboard/lib/site-fields.test.js`, `src/dashboard/styles/base.css`, `src/dashboard/ui/Sheet.jsx`, `src/dashboard/ui/Sheet.test.jsx`

**Interfaces:**
- Consumes: `useSite` (Task 1); `usePreview`, `PreviewFrame`, `fieldPage`, `useMediaQuery` (Task 2).
- Produces: `textFields(texts)`, `fieldProblem(field, value)`, `defaultText(key, texts)` (`src/dashboard/lib/site-fields.js`); `<FieldSheet field site onChange onClose preview side? />`; `SiteScreen` with the groups `who`, `home`, `contact` and a `group(name, title, first?)` helper that Task 5 uses; `WIDE`; texts `admin.site.group*`, field labels, `nameRequired`, `textTooLong`, `templateText`, `restoreDefault`, `formNote`, `previewFull`, `previewPart`, `done`, `emptyValue`.

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t3/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t3/$f" "$f"; done
```

Run: `npm test` → 3 files fail, 7 tests fail.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t3/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t3/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 107 files, 840 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "not wrapped in act"` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/dashboard/features/album/AlbumScreen.jsx src/dashboard/features/albums/albums.css src/dashboard/features/site/FieldSheet.jsx src/dashboard/features/site/SiteScreen.jsx src/dashboard/features/site/SiteScreen.test.jsx src/dashboard/features/site/site.css src/dashboard/lib/site-fields.js src/dashboard/lib/site-fields.test.js src/dashboard/styles/base.css src/dashboard/ui/Sheet.jsx src/dashboard/ui/Sheet.test.jsx
git commit -F - <<'EOF'
feat(dashboard): the Site screen — identity, home heading, contact page, live preview

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The tests (diff):**

````diff
diff --git a/src/dashboard/features/site/SiteScreen.test.jsx b/src/dashboard/features/site/SiteScreen.test.jsx
new file mode 100644
index 0000000..2c28bf5
--- /dev/null
+++ b/src/dashboard/features/site/SiteScreen.test.jsx
@@ -0,0 +1,109 @@
+import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
+import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { createMemoryRouter, RouterProvider } from 'react-router';
+import { texts } from '../../../../config/texts.config.js';
+import { routes } from '../../App.jsx';
+import { useSaveQueue } from '../../api/drafts.jsx';
+import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';
+
+const t = texts.admin.site;
+beforeAll(installDialogPolyfill);
+afterEach(() => vi.unstubAllGlobals());
+
+const SITE = { name: 'Davide', bio: 'Fotografo', hero: null, links: [], texts: { 'about.heading': 'Scrivimi' } };
+const DRAFT = { site: SITE, albums: [], hasDraft: false };
+const STATUS = { hasDraft: false, publishing: false, changes: [] };
+
+let queue;
+function QueueSpy() { queue = useSaveQueue(); return null; }
+function renderSite() {
+  const router = createMemoryRouter(routes, { initialEntries: ['/site'] });
+  render(<Providers client={makeQueryClient()}><QueueSpy /><RouterProvider router={router} /></Providers>);
+}
+// A Worker that keeps what is saved, as the real one does: a refetch after a save reads it back.
+function worker(extra = {}) {
+  let draft = DRAFT;
+  return fakeWorker({
+    'GET /api/admin/draft': () => draft,
+    'GET /api/admin/draft/status': STATUS,
+    'PUT /api/admin/draft/site': init => { draft = { ...draft, site: JSON.parse(init.body) }; return { ok: true }; },
+    ...extra,
+  });
+}
+const siteSaves = fetchMock => fetchMock.mock.calls
+  .filter(([path, init]) => path === '/api/admin/draft/site' && init?.method === 'PUT').map(([, init]) => JSON.parse(init.body));
+// A row, once the draft has loaded (before that the rows are there but cannot be opened).
+async function row(label) {
+  const button = await screen.findByRole('button', { name: new RegExp(`^${label}`) });
+  await waitFor(() => expect(button.disabled).toBe(false));
+  return button;
+}
+
+describe('Site screen', () => {
+  it('shows each field as a row with its value; a page text not changed says it is the template text', async () => {
+    worker();
+    renderSite();
+    expect((await row(t.nameLabel)).textContent).toContain('Davide');
+    expect((await row(t.aboutHeadingLabel)).textContent).toContain('Scrivimi');
+    const body = await row(t.aboutBodyLabel);
+    expect(body.textContent).toContain(texts.about.body);
+    expect(body.textContent).toContain(t.templateText);
+  });
+
+  it('edits a field in a sheet and saves it as soon as the sheet closes', async () => {
+    const fetchMock = worker();
+    renderSite();
+    fireEvent.click(await row(t.bioLabel));
+    const sheet = await screen.findByRole('dialog', { name: t.bioLabel });
+    fireEvent.change(within(sheet).getByLabelText(t.bioLabel), { target: { value: 'Fotografo di montagna' } });
+    fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
+    await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.bio).toBe('Fotografo di montagna'));
+    expect((await row(t.bioLabel)).textContent).toContain('Fotografo di montagna');
+  });
+
+  it('never saves an empty name: the field says why and the last one is kept', async () => {
+    const fetchMock = worker();
+    renderSite();
+    fireEvent.click(await row(t.nameLabel));
+    const sheet = await screen.findByRole('dialog', { name: t.nameLabel });
+    fireEvent.change(within(sheet).getByLabelText(t.nameLabel), { target: { value: ' ' } });
+    expect(within(sheet).getByRole('alert').textContent).toBe(t.nameRequired);
+    fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
+    await act(() => queue.flush());
+    expect(siteSaves(fetchMock)).toEqual([]);
+  });
+
+  it('gives a page text back to the template', async () => {
+    const fetchMock = worker();
+    renderSite();
+    fireEvent.click(await row(t.aboutHeadingLabel));
+    const sheet = await screen.findByRole('dialog', { name: t.aboutHeadingLabel });
+    fireEvent.click(within(sheet).getByRole('button', { name: t.restoreDefault }));
+    expect(within(sheet).getByLabelText(t.aboutHeadingLabel).value).toBe(texts.about.heading);
+    fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
+    await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.texts).toEqual({}));
+  });
+
+  it('on a phone the sheet shows the page of the field above it, and the whole page on request', async () => {
+    worker();
+    renderSite();
+    fireEvent.click(await row(t.successMessageLabel));
+    const sheet = await screen.findByRole('dialog', { name: t.successMessageLabel });
+    const frame = within(sheet).getByTitle(t.previewTitle);
+    expect(frame.getAttribute('src')).toBe('/about?preview=1');
+    expect(within(sheet).getByText(t.formNote)).toBeTruthy();
+    fireEvent.click(within(sheet).getByRole('button', { name: t.previewFull }));
+    expect(frame.className).toContain('dash-preview--full');
+  });
+
+  it('on a computer the preview stands beside the fields and follows the field being edited', async () => {
+    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
+    worker();
+    renderSite();
+    const frame = await screen.findByTitle(t.previewTitle);
+    expect(frame.getAttribute('src')).toBe('/?preview=1');
+    fireEvent.click(await row(t.aboutBodyLabel));
+    await waitFor(() => expect(frame.getAttribute('src')).toBe('/about?preview=1'));
+    expect(screen.getAllByTitle(t.previewTitle)).toHaveLength(1);
+  });
+});
diff --git a/src/dashboard/lib/site-fields.test.js b/src/dashboard/lib/site-fields.test.js
new file mode 100644
index 0000000..3c307b5
--- /dev/null
+++ b/src/dashboard/lib/site-fields.test.js
@@ -0,0 +1,31 @@
+// @vitest-environment node
+import { describe, expect, it } from 'vitest';
+import { EDITABLE_TEXT_KEYS, MAX_TEXT_LENGTH } from '../../shared/content-rules.js';
+import { defaultText, fieldProblem, textFields } from './site-fields.js';
+
+const TEXTS = { landing: { albumsSectionHeading: 'Albums' }, about: { heading: 'Contact', body: 'Write', form: { successMessage: 'Sent' } } };
+const SITE = { name: 'D', bio: '', hero: null, links: [], texts: { 'about.heading': 'Scrivimi' } };
+const byId = id => textFields(TEXTS).find(field => field.id === id);
+
+describe('site fields', () => {
+  it('has one field for the name, the bio and every editable page text', () => {
+    expect(textFields(TEXTS).map(field => field.id)).toEqual(['site.name', 'site.bio', ...EDITABLE_TEXT_KEYS.map(key => `texts.${key}`)]);
+  });
+
+  it('a page text shows the template text until it is changed, and can go back to it', () => {
+    expect(defaultText('about.form.successMessage', TEXTS)).toBe('Sent');
+    expect(byId('texts.about.body').read(SITE)).toBe('Write');
+    expect(byId('texts.about.heading').read(SITE)).toBe('Scrivimi');
+    expect(byId('texts.about.heading').isDefault(SITE)).toBe(false);
+    const reset = byId('texts.about.heading').reset(SITE);
+    expect(reset.texts).toEqual({});
+    expect(byId('texts.about.body').write(SITE, 'Ciao').texts).toEqual({ 'about.heading': 'Scrivimi', 'about.body': 'Ciao' });
+  });
+
+  it('the name is required; a page text has a length limit', () => {
+    expect(fieldProblem(byId('site.name'), '  ')).toBe('required');
+    expect(fieldProblem(byId('site.bio'), '')).toBeNull();
+    expect(fieldProblem(byId('texts.about.body'), 'x'.repeat(MAX_TEXT_LENGTH + 1))).toBe('tooLong');
+    expect(fieldProblem(byId('texts.about.body'), 'x'.repeat(MAX_TEXT_LENGTH))).toBeNull();
+  });
+});
diff --git a/src/dashboard/ui/Sheet.test.jsx b/src/dashboard/ui/Sheet.test.jsx
index e9175e3..d954088 100644
--- a/src/dashboard/ui/Sheet.test.jsx
+++ b/src/dashboard/ui/Sheet.test.jsx
@@ -24,10 +24,20 @@ describe('Sheet', () => {
     render(<Sheet open onClose={onClose} title="T"><button type="button">inside</button></Sheet>);
     const dialog = screen.getByRole('dialog');
     fireEvent(dialog, new Event('cancel', { cancelable: true }));
+    fireEvent.pointerDown(dialog);
     fireEvent.click(dialog);
     fireEvent.click(screen.getByRole('button', { name: 'inside' }));
     expect(onClose).toHaveBeenCalledTimes(2);
   });
+
+  it('selecting text inside and releasing on the backdrop does not close it', () => {
+    const onClose = vi.fn();
+    render(<Sheet open onClose={onClose} title="T"><input aria-label="field" /></Sheet>);
+    const dialog = screen.getByRole('dialog');
+    fireEvent.pointerDown(screen.getByLabelText('field'));
+    fireEvent.click(dialog);
+    expect(onClose).not.toHaveBeenCalled();
+  });
 });
 
 describe('ConfirmDialog', () => {
````

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index 90b2fb9..3b35497 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -122,6 +122,23 @@ export const texts = {
       heroChooseAlbum: 'Choose an album…',
       heroNone: 'none',
       previewTitle: 'Preview of the site, with the changes not yet published',
+      groupWho: 'Who you are',
+      groupLinks: 'Links',
+      groupHome: 'Home',
+      groupContact: 'Contact page',
+      albumsHeadingLabel: 'Albums heading',
+      aboutHeadingLabel: 'Page title',
+      aboutBodyLabel: 'Page text',
+      successMessageLabel: 'Message after sending',
+      nameRequired: 'The name cannot be empty: the last one is kept.',
+      textTooLong: 'At most {n} characters: the last text that fits is kept.',
+      templateText: 'Template text',
+      restoreDefault: 'Use the template text',
+      formNote: 'In the preview the form does not send messages.',
+      previewFull: 'Whole page',
+      previewPart: 'Just this part',
+      done: 'Done',
+      emptyValue: 'Empty',
     },
     albums: {
       sectionTitle: 'Albums',
diff --git a/config/texts.it.js b/config/texts.it.js
index 4819bed..a057e76 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -119,6 +119,23 @@ export const texts = {
       heroReadError: 'Impossibile leggere le foto di questo album.',
       heroChooseAlbum: 'Scegli album…',
       previewTitle: 'Anteprima del sito, con le modifiche non ancora pubblicate',
+      groupWho: 'Chi sei',
+      groupLinks: 'Link',
+      groupHome: 'Home',
+      groupContact: 'Pagina contatti',
+      albumsHeadingLabel: 'Titolo della sezione album',
+      aboutHeadingLabel: 'Titolo della pagina',
+      aboutBodyLabel: 'Testo della pagina',
+      successMessageLabel: "Messaggio dopo l'invio",
+      nameRequired: "Il nome non può essere vuoto: resta l'ultimo.",
+      textTooLong: "Al massimo {n} caratteri: resta l'ultimo testo che ci stava.",
+      templateText: 'Testo del template',
+      restoreDefault: 'Usa il testo del template',
+      formNote: "Nell'anteprima il modulo non invia messaggi.",
+      previewFull: 'Pagina intera',
+      previewPart: 'Solo questo pezzo',
+      done: 'Fatto',
+      emptyValue: 'Vuoto',
       heroNone: 'nessuna',
     },
     albums: {
diff --git a/src/dashboard/features/album/AlbumScreen.jsx b/src/dashboard/features/album/AlbumScreen.jsx
index c8e008d..f1e1f73 100644
--- a/src/dashboard/features/album/AlbumScreen.jsx
+++ b/src/dashboard/features/album/AlbumScreen.jsx
@@ -13,7 +13,6 @@ import { AlbumDetails } from './AlbumDetails.jsx';
 import { PhotoGrid } from './PhotoGrid.jsx';
 import { UploadPanel } from './UploadPanel.jsx';
 import { photoCount } from '../albums/AlbumCard.jsx';
-import '../albums/albums.css';
 import './album.css';
 
 const t = texts.admin.album;
diff --git a/src/dashboard/features/albums/albums.css b/src/dashboard/features/albums/albums.css
index 6beb8fc..286377d 100644
--- a/src/dashboard/features/albums/albums.css
+++ b/src/dashboard/features/albums/albums.css
@@ -1,8 +1,3 @@
-.dash-screen-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
-.dash-screen-head .dash-screen-title { margin: 0; }
-.dash-screen-head__actions { display: flex; gap: 0.5rem; }
-.dash-hint, .dash-empty { color: var(--admin-muted); margin: 0 0 1rem; }
-
 .dash-album-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); }
 .dash-album-card { position: relative; }
 .dash-album-grid--reordering .dash-album-card { cursor: grab; }
@@ -22,14 +17,6 @@
 }
 .dash-album-card__move button[aria-disabled="true"] { opacity: 0.4; cursor: default; }
 
-.dash-form { display: grid; gap: 0.5rem; }
-.dash-input {
-  width: 100%; min-height: 44px; padding: 0 0.75rem; border-radius: var(--admin-radius);
-  border: 1px solid var(--admin-line); background: var(--admin-bg);
-}
-.dash-input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 0; }
-.dash-form__error { margin: 0; color: var(--admin-danger); font-size: 0.85rem; }
-
 @media (max-width: 640px) {
   .dash-album-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
 }
diff --git a/src/dashboard/features/site/FieldSheet.jsx b/src/dashboard/features/site/FieldSheet.jsx
new file mode 100644
index 0000000..1cddbec
--- /dev/null
+++ b/src/dashboard/features/site/FieldSheet.jsx
@@ -0,0 +1,69 @@
+import { useEffect, useId, useState } from 'react';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { MAX_TEXT_LENGTH } from '../../../shared/content-rules.js';
+import { fieldProblem } from '../../lib/site-fields.js';
+import { Sheet } from '../../ui/Sheet.jsx';
+import { Button } from '../../ui/Button.jsx';
+
+const t = texts.admin.site;
+
+/**
+ * Edits one text of the site in a sheet. What is typed stays here and goes to the preview
+ * at every key; it is saved while it is valid (an empty name or a text over the limit is
+ * not: the last good value is kept, and the field says why). `preview` is the slice of the
+ * page shown above the field on a phone; on a computer (`side`) the sheet opens over the
+ * fields, leaving the preview beside it in view.
+ * @param {{field: object|null, site: object, onChange: (update: (site: object) => object) => void, onClose: Function,
+ *   preview: {field: Function}, side?: boolean, children?: any}} props
+ */
+export function FieldSheet({ field, site, onChange, onClose, preview, side = false, children }) {
+  const [value, setValue] = useState('');
+  const inputId = useId();
+  const errorId = useId();
+
+  // A field opened: start from its value in the draft.
+  useEffect(() => {
+    if (field) setValue(field.read(site));
+  }, [field?.id]); // eslint-disable-line react-hooks/exhaustive-deps
+
+  const problem = field ? fieldProblem(field, value) : null;
+  const change = next => {
+    setValue(next);
+    preview.field(field.id, next);
+    // A function of the latest site: another change saved meanwhile is kept.
+    if (!fieldProblem(field, next)) onChange(latest => field.write(latest, next));
+  };
+  const reset = () => {
+    onChange(latest => field.reset(latest));
+    const text = field.read(field.reset(site));
+    setValue(text);
+    preview.field(field.id, text);
+  };
+
+  const Input = field?.multiline ? 'textarea' : 'input';
+  return (
+    <Sheet open={field !== null} onClose={onClose} title={field ? t[field.label] : ''} className={`dash-field-sheet${side ? ' dash-field-sheet--side' : ''}`}>
+      {children}
+      {field && (
+        <div className="dash-form">
+          {/* The sheet's title already names the field: the label is for screen readers. */}
+          <label htmlFor={inputId} className="visually-hidden">{t[field.label]}</label>
+          <Input id={inputId} className="dash-input" value={value} rows={field.multiline ? 4 : undefined}
+            aria-invalid={problem ? 'true' : undefined} aria-describedby={problem ? errorId : undefined}
+            onChange={event => change(event.target.value)} />
+          {problem && (
+            <p id={errorId} className="dash-form__error" role="alert">
+              {problem === 'required' ? t.nameRequired : formatText(t.textTooLong, { n: MAX_TEXT_LENGTH })}
+            </p>
+          )}
+          {field.id === 'texts.about.form.successMessage' && <p className="dash-hint">{t.formNote}</p>}
+        </div>
+      )}
+      <div className="dash-confirm__actions">
+        {field?.reset && !field.isDefault(site) && <Button onClick={reset}>{t.restoreDefault}</Button>}
+        <Button variant="primary" onClick={onClose}>{t.done}</Button>
+      </div>
+    </Sheet>
+  );
+}
diff --git a/src/dashboard/features/site/SiteScreen.jsx b/src/dashboard/features/site/SiteScreen.jsx
index 03f39c2..fdd16a5 100644
--- a/src/dashboard/features/site/SiteScreen.jsx
+++ b/src/dashboard/features/site/SiteScreen.jsx
@@ -1,6 +1,90 @@
+import { useState } from 'react';
 import { texts } from '../../../../config/texts.config.js';
+import { useSaveQueue, useSite } from '../../api/drafts.jsx';
+import { fieldPage } from '../../lib/preview.js';
+import { textFields } from '../../lib/site-fields.js';
+import { useMediaQuery } from '../../ui/useMediaQuery.js';
+import { Button } from '../../ui/Button.jsx';
+import { FieldSheet } from './FieldSheet.jsx';
+import { PreviewFrame } from './PreviewFrame.jsx';
+import { usePreview } from './usePreview.js';
+import './site.css';
 
-/** Identity, texts and links of the site. Filled in plan 4.3. */
+const t = texts.admin.site;
+const FIELDS = textFields(texts);
+/** Wide enough to show the preview beside the fields. */
+export const WIDE = '(min-width: 900px)';
+
+/**
+ * The site's identity, links, home and contact page (spec, "Sito"). Each field is a row
+ * that opens a sheet to edit it. The preview is the real site reading the draft: beside the
+ * fields on a computer, above the field in the sheet on a phone.
+ */
 export function SiteScreen() {
-  return <h1 className="dash-screen-title">{texts.admin.site.sectionTitle}</h1>;
+  const { site, setSite } = useSite();
+  const queue = useSaveQueue();
+  const wide = useMediaQuery(WIDE);
+  const preview = usePreview();
+  const [editing, setEditing] = useState(null);
+  const [page, setPage] = useState('/');
+  const [full, setFull] = useState(false);
+
+  const open = field => {
+    setEditing(field);
+    setFull(false);
+    setPage(fieldPage(field.id));
+    preview.focus(field.id);
+  };
+  const close = () => {
+    const field = editing;
+    if (!field) return;
+    setEditing(null);
+    preview.focus(null);
+    // Leaving a field saves it at once (spec); then the page shows the saved text itself.
+    queue.flush().then(() => preview.forget(field.id));
+  };
+
+  const group = (name, title) => (
+    <section className="dash-site-group" aria-labelledby={`dash-site-${name}`}>
+      <h2 id={`dash-site-${name}`} className="dash-label">{title}</h2>
+      <ul className="dash-site-rows">
+        {FIELDS.filter(field => field.group === name).map(field => {
+          const value = site ? field.read(site) : '';
+          return (
+            <li key={field.id}>
+              <button type="button" className="dash-site-row" onClick={() => open(field)} disabled={!site}>
+                <span className="dash-site-row__label">{t[field.label]}</span>
+                <span className={`dash-site-row__value${value ? '' : ' dash-site-row__value--empty'}`}>{value || t.emptyValue}</span>
+                {site && field.isDefault?.(site) && <span className="dash-site-row__badge">{t.templateText}</span>}
+              </button>
+            </li>
+          );
+        })}
+      </ul>
+    </section>
+  );
+
+  return (
+    <div className={`dash-site${wide ? ' dash-site--wide' : ''}`}>
+      <div className="dash-site__fields">
+        <h1 className="dash-screen-title">{t.sectionTitle}</h1>
+        {group('who', t.groupWho)}
+        {group('home', t.groupHome)}
+        {group('contact', t.groupContact)}
+      </div>
+      {wide && (
+        <div className="dash-site__preview">
+          <PreviewFrame frameRef={preview.frameRef} page={page} full />
+        </div>
+      )}
+      <FieldSheet field={editing} site={site} onChange={setSite} onClose={close} preview={preview} side={wide}>
+        {!wide && editing && (
+          <div className="dash-site__slice">
+            <PreviewFrame frameRef={preview.frameRef} page={page} full={full} />
+            <Button onClick={() => setFull(value => !value)} aria-pressed={full}>{full ? t.previewPart : t.previewFull}</Button>
+          </div>
+        )}
+      </FieldSheet>
+    </div>
+  );
 }
diff --git a/src/dashboard/features/site/site.css b/src/dashboard/features/site/site.css
index 04e47f9..956c29b 100644
--- a/src/dashboard/features/site/site.css
+++ b/src/dashboard/features/site/site.css
@@ -4,3 +4,26 @@
   border-radius: var(--admin-radius); background: #fff;
 }
 .dash-preview--full { height: calc(100dvh - 12rem); }
+
+.dash-site { display: grid; gap: 1.5rem; }
+.dash-site--wide { grid-template-columns: minmax(18rem, 26rem) 1fr; align-items: start; }
+.dash-site__preview { position: sticky; top: 1rem; }
+.dash-site--wide .dash-preview--full { height: calc(100dvh - 10rem); }
+.dash-site-group { display: grid; gap: 0.5rem; margin-bottom: 1.25rem; }
+.dash-site-group h2 { margin: 0; }
+.dash-site-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; border-radius: var(--admin-radius); overflow: hidden; background: var(--admin-line); }
+.dash-site-row {
+  display: grid; grid-template-columns: 1fr auto; gap: 0.15rem 0.75rem; width: 100%; padding: 0.75rem 1rem;
+  border: 0; background: var(--admin-surface); color: inherit; text-align: left; cursor: pointer;
+}
+.dash-site-row:hover { background: var(--admin-raised); }
+.dash-site-row__label { font-size: 0.8rem; color: var(--admin-muted); }
+.dash-site-row__value { grid-column: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
+.dash-site-row__value--empty { color: var(--admin-muted); font-style: italic; }
+.dash-site-row__badge { grid-column: 2; grid-row: 1 / span 2; align-self: center; font: 0.7rem/1 var(--admin-font-mono); color: var(--admin-muted); text-transform: uppercase; letter-spacing: 0.06em; }
+.dash-site__slice { display: grid; gap: 0.5rem; justify-items: end; }
+.dash-field-sheet { width: min(40rem, calc(100vw - 2rem)); }
+/* On a computer the sheet opens over the fields: the preview beside it stays in view. */
+.dash-field-sheet--side { margin: 6rem auto auto 1.25rem; width: min(26rem, calc(100vw - 2rem)); }
+.dash-field-sheet--side::backdrop { background: rgb(0 0 0 / 0.25); }
+
diff --git a/src/dashboard/lib/site-fields.js b/src/dashboard/lib/site-fields.js
new file mode 100644
index 0000000..7cb0479
--- /dev/null
+++ b/src/dashboard/lib/site-fields.js
@@ -0,0 +1,57 @@
+/**
+ * The text fields of the Site screen: where each one lives in site.json, how it is read
+ * and written, and what it accepts. Plain JavaScript (no React).
+ */
+import { EDITABLE_TEXT_KEYS, MAX_TEXT_LENGTH } from '../../shared/content-rules.js';
+
+/** The template's own text for a key of EDITABLE_TEXT_KEYS ('about.form.successMessage'). */
+export function defaultText(key, texts) {
+  return key.split('.').reduce((node, part) => node?.[part], texts) ?? '';
+}
+
+const identity = [
+  { id: 'site.name', group: 'who', label: 'nameLabel', required: true, multiline: false,
+    read: site => site.name, write: (site, value) => ({ ...site, name: value }) },
+  { id: 'site.bio', group: 'who', label: 'bioLabel', required: false, multiline: true,
+    read: site => site.bio, write: (site, value) => ({ ...site, bio: value }) },
+];
+
+const PAGE_TEXTS = {
+  'landing.albumsSectionHeading': { group: 'home', label: 'albumsHeadingLabel', multiline: false },
+  'about.heading': { group: 'contact', label: 'aboutHeadingLabel', multiline: false },
+  'about.body': { group: 'contact', label: 'aboutBodyLabel', multiline: true },
+  'about.form.successMessage': { group: 'contact', label: 'successMessageLabel', multiline: true },
+};
+
+/**
+ * Every text field, in the order of the screen. A page text shows the template's text until
+ * it is changed; `reset` gives it back (the key leaves site.texts).
+ * @param {object} texts - config/texts.config.js.
+ * @returns {Array<{id: string, group: string, label: string, required: boolean, multiline: boolean,
+ *   textKey?: string, read: Function, write: Function, reset?: Function, isDefault?: Function}>}
+ */
+export function textFields(texts) {
+  const pageTexts = EDITABLE_TEXT_KEYS.map(key => ({
+    id: `texts.${key}`, textKey: key, required: false, ...PAGE_TEXTS[key],
+    read: site => site.texts[key] ?? defaultText(key, texts),
+    write: (site, value) => ({ ...site, texts: { ...site.texts, [key]: value } }),
+    reset: site => {
+      const { [key]: _dropped, ...rest } = site.texts;
+      return { ...site, texts: rest };
+    },
+    isDefault: site => site.texts[key] === undefined,
+  }));
+  return [...identity, ...pageTexts];
+}
+
+/**
+ * Why a value cannot be saved, or null.
+ * @param {{required: boolean, textKey?: string}} field
+ * @param {string} value
+ * @returns {'required'|'tooLong'|null}
+ */
+export function fieldProblem(field, value) {
+  if (field.required && !value.trim()) return 'required';
+  if (field.textKey && value.length > MAX_TEXT_LENGTH) return 'tooLong';
+  return null;
+}
diff --git a/src/dashboard/styles/base.css b/src/dashboard/styles/base.css
index ba4885f..3f67681 100644
--- a/src/dashboard/styles/base.css
+++ b/src/dashboard/styles/base.css
@@ -17,3 +17,17 @@ button, input, textarea, select { font: inherit; color: inherit; }
   text-transform: uppercase;
   color: var(--admin-muted);
 }
+
+/* Shared by the screens: heading row, hints, form fields. */
+.dash-screen-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
+.dash-screen-head .dash-screen-title { margin: 0; }
+.dash-screen-head__actions { display: flex; gap: 0.5rem; }
+.dash-hint, .dash-empty { color: var(--admin-muted); margin: 0 0 1rem; }
+.dash-form { display: grid; gap: 0.5rem; }
+.dash-input {
+  width: 100%; min-height: 44px; padding: 0 0.75rem; border-radius: var(--admin-radius);
+  border: 1px solid var(--admin-line); background: var(--admin-bg);
+}
+textarea.dash-input { padding: 0.6rem 0.75rem; resize: vertical; }
+.dash-input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 0; }
+.dash-form__error { margin: 0; color: var(--admin-danger); font-size: 0.85rem; }
diff --git a/src/dashboard/ui/Sheet.jsx b/src/dashboard/ui/Sheet.jsx
index da5d565..0b1b140 100644
--- a/src/dashboard/ui/Sheet.jsx
+++ b/src/dashboard/ui/Sheet.jsx
@@ -16,6 +16,9 @@ export function Sheet({ open, onClose, title, children, className = '', role, de
   // The latest `open`, for the browser's own "close" event.
   const openRef = useRef(open);
   openRef.current = open;
+  // Where the pointer went down: selecting text inside and releasing outside is not a click
+  // on the backdrop, and must not close the panel (with what was being typed).
+  const downOnBackdrop = useRef(false);
 
   // A <dialog> is opened with a method, not an attribute: this is where React talks to the DOM.
   useEffect(() => {
@@ -41,8 +44,13 @@ export function Sheet({ open, onClose, title, children, className = '', role, de
       onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }}
       // Some browsers close the dialog anyway (a second Esc): keep the parent in step.
       onClose={() => { if (openRef.current) onClose(); }}
-      // A click on the backdrop lands on the dialog element itself.
-      onClick={event => { if (dismissible && event.target === ref.current) onClose(); }}
+      // A press and a release on the backdrop both land on the dialog element itself.
+      onPointerDown={event => { downOnBackdrop.current = event.target === ref.current; }}
+      onClick={event => {
+        const onBackdrop = event.target === ref.current && downOnBackdrop.current;
+        downOnBackdrop.current = false;
+        if (dismissible && onBackdrop) onClose();
+      }}
     >
       <div className="dash-sheet__body">
         <h2 id={titleId} className="dash-sheet__title">{title}</h2>
````

---

### Task 4: Links with icons

Links as a list with the icon of their kind (spec, "Social"; "Icone dei social"), in the dashboard and in the site's footer (same module).
- `src/shared/link-icons.js`: the brand marks are copied from Simple Icons 16.33.0 (CC0 1.0), filled; Simple Icons has no LinkedIn, so LinkedIn, email and website are outlines drawn here. No dependency is added (the package is 26 MB for twelve paths).
- The footer shows the icon before each link's name (DOM, no `innerHTML`; decorative, `aria-hidden`).
- The editor: rows with icon, name and address; arrows up and down (and dragging) change the order; a link opens in a sheet to edit or remove it; "Add link". A bare address gets `https://`, a bare email `mailto:`; anything else is refused with a reason; the label is optional (at most 40 characters; empty shows the name of the kind). At most 12 links. A link is saved when the sheet is confirmed (a half-typed address never reaches the site); the preview then reads the draft again.
- `MoveButtons` gains `vertical` (↑ ↓) for lists read top to bottom; rows keep their key when they move, so the arrow keeps the focus.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/components/Footer.js`, `src/components/Footer.test.js`, `src/dashboard/features/site/LinkSheet.jsx`, `src/dashboard/features/site/LinksEditor.jsx`, `src/dashboard/features/site/SiteScreen.jsx`, `src/dashboard/features/site/SiteScreen.test.jsx`, `src/dashboard/features/site/site.css`, `src/dashboard/lib/links.js`, `src/dashboard/lib/links.test.js`, `src/dashboard/ui/LinkIcon.jsx`, `src/dashboard/ui/MoveButtons.jsx`, `src/shared/content-rules.js`, `src/shared/content-rules.test.js`, `src/shared/link-icons.js`, `src/shared/link-icons.test.js`, `src/styles/footer.css`

**Interfaces:**
- Consumes: `useSite` (Task 1); `usePreview` (Task 2); `SiteScreen` (Task 3); `linkKind`, `linkLabel`, `LINK_KINDS` (`src/shared/site-links.js`); `MoveButtons`, `useSortable`, `moveItem`.
- Produces: `linkIcon(kind) → { d, filled }`, `createLinkIcon(kind, doc?) → SVGSVGElement` (`src/shared/link-icons.js`); `isLinkUrl(url)` (`src/shared/content-rules.js`); `completeLinkUrl`, `checkLink` (`src/dashboard/lib/links.js`); `<LinkIcon kind size? />` (`ui/`); `<LinkSheet />`, `<LinksEditor links onChange onOpen onClose side? />`; `MoveButtons` prop `vertical`; link texts in `admin.site`.

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t4/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t4/$f" "$f"; done
```

Run: `npm test` → 5 files fail, 7 tests fail.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t4/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t4/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 109 files, 852 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "not wrapped in act"` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/components/Footer.js src/components/Footer.test.js src/dashboard/features/site/LinkSheet.jsx src/dashboard/features/site/LinksEditor.jsx src/dashboard/features/site/SiteScreen.jsx src/dashboard/features/site/SiteScreen.test.jsx src/dashboard/features/site/site.css src/dashboard/lib/links.js src/dashboard/lib/links.test.js src/dashboard/ui/LinkIcon.jsx src/dashboard/ui/MoveButtons.jsx src/shared/content-rules.js src/shared/content-rules.test.js src/shared/link-icons.js src/shared/link-icons.test.js src/styles/footer.css
git commit -F - <<'EOF'
feat(dashboard): links with icons, in the dashboard and in the footer

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The tests (diff):**

````diff
diff --git a/src/components/Footer.test.js b/src/components/Footer.test.js
index ad7a572..48c684e 100644
--- a/src/components/Footer.test.js
+++ b/src/components/Footer.test.js
@@ -33,4 +33,13 @@ describe('renderFooter', () => {
     expect(links.map(a => a.getAttribute('href'))).toEqual(['https://instagram.com/x', 'https://github.com/x', 'mailto:a@b.c']);
     expect(links.map(a => a.textContent)).toEqual(['Instagram', 'Codice', 'Email']);
   });
+
+  it('shows the icon of each kind of link, hidden from screen readers', () => {
+    renderFooter(container, { footer: { copyright: '© 2026' } }, [{ url: 'https://instagram.com/x' }, { url: 'mailto:a@b.c' }]);
+    const icons = [...container.querySelectorAll('.site-footer__link svg')];
+    expect(icons).toHaveLength(2);
+    expect(icons.every(svg => svg.getAttribute('aria-hidden') === 'true')).toBe(true);
+    expect(icons[0].querySelector('path').getAttribute('fill')).toBe('currentColor');
+    expect(icons[1].querySelector('path').getAttribute('fill')).toBe('none');
+  });
 });
diff --git a/src/dashboard/features/site/SiteScreen.test.jsx b/src/dashboard/features/site/SiteScreen.test.jsx
index 2c28bf5..373a33a 100644
--- a/src/dashboard/features/site/SiteScreen.test.jsx
+++ b/src/dashboard/features/site/SiteScreen.test.jsx
@@ -2,6 +2,8 @@ import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
 import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
 import { createMemoryRouter, RouterProvider } from 'react-router';
 import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { MAX_LINKS } from '../../../shared/content-rules.js';
 import { routes } from '../../App.jsx';
 import { useSaveQueue } from '../../api/drafts.jsx';
 import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';
@@ -106,4 +108,79 @@ describe('Site screen', () => {
     await waitFor(() => expect(frame.getAttribute('src')).toBe('/about?preview=1'));
     expect(screen.getAllByTitle(t.previewTitle)).toHaveLength(1);
   });
+
+  describe('links', () => {
+    const withLinks = links => ({ ...DRAFT, site: { ...SITE, links } });
+    function linksWorker(links) {
+      let draft = withLinks(links);
+      return fakeWorker({
+        'GET /api/admin/draft': () => draft,
+        'GET /api/admin/draft/status': STATUS,
+        'PUT /api/admin/draft/site': init => { draft = { ...draft, site: JSON.parse(init.body) }; return { ok: true }; },
+      });
+    }
+    const addButton = async () => {
+      const button = await screen.findByRole('button', { name: t.addLink });
+      await waitFor(() => expect(button.disabled).toBe(false));
+      return button;
+    };
+
+    it('adds a link from a bare address; its icon and name follow the address', async () => {
+      const fetchMock = linksWorker([]);
+      renderSite();
+      expect(await screen.findByText(t.linksEmpty)).toBeTruthy();
+      fireEvent.click(await addButton());
+      const sheet = await screen.findByRole('dialog', { name: t.newLink });
+      fireEvent.change(within(sheet).getByLabelText(t.linkUrlLabel), { target: { value: 'instagram.com/davide' } });
+      expect(within(sheet).getByLabelText(t.linkLabelLabel).getAttribute('placeholder')).toBe('Instagram');
+      fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
+      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links).toEqual([{ url: 'https://instagram.com/davide' }]));
+      expect(await screen.findByRole('button', { name: /^Instagram/ })).toBeTruthy();
+    });
+
+    it('refuses an address that is not a web or email address, saying why', async () => {
+      const fetchMock = linksWorker([]);
+      renderSite();
+      fireEvent.click(await addButton());
+      const sheet = await screen.findByRole('dialog', { name: t.newLink });
+      fireEvent.change(within(sheet).getByLabelText(t.linkUrlLabel), { target: { value: 'http://old.example' } });
+      fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
+      expect(within(sheet).getByRole('alert').textContent).toBe(t.linkUrlInvalid);
+      await act(() => queue.flush());
+      expect(siteSaves(fetchMock)).toEqual([]);
+    });
+
+    it('gives a link a name of its own, and removes one', async () => {
+      const fetchMock = linksWorker([{ url: 'https://github.com/d' }, { url: 'mailto:d@example.com' }]);
+      renderSite();
+      fireEvent.click(await screen.findByRole('button', { name: /^GitHub/ }));
+      let sheet = await screen.findByRole('dialog', { name: t.editLink });
+      fireEvent.change(within(sheet).getByLabelText(t.linkLabelLabel), { target: { value: 'Codice' } });
+      fireEvent.click(within(sheet).getByRole('button', { name: t.done }));
+      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links[0]).toEqual({ url: 'https://github.com/d', label: 'Codice' }));
+      fireEvent.click(await screen.findByRole('button', { name: /^Email/ }));
+      sheet = await screen.findByRole('dialog', { name: t.editLink });
+      fireEvent.click(within(sheet).getByRole('button', { name: t.removeLink }));
+      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links).toEqual([{ url: 'https://github.com/d', label: 'Codice' }]));
+    });
+
+    it('moves a link with the arrows; the arrow keeps its place in the page', async () => {
+      const fetchMock = linksWorker([{ url: 'https://github.com/d' }, { url: 'https://instagram.com/d' }]);
+      renderSite();
+      const up = await screen.findByRole('button', { name: formatText(t.moveLinkEarlier, { link: 'Instagram' }) });
+      fireEvent.click(up);
+      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.links.map(link => link.url)).toEqual(['https://instagram.com/d', 'https://github.com/d']));
+      // The same button, now at the top: still in the page, marked as unable to move further.
+      await waitFor(() => expect(up.getAttribute('aria-disabled')).toBe('true'));
+      expect(up.isConnected).toBe(true);
+    });
+
+    it('offers no more links past the limit', async () => {
+      linksWorker(Array.from({ length: MAX_LINKS }, (_, i) => ({ url: `https://example.com/${i}` })));
+      renderSite();
+      expect(await screen.findByText(formatText(t.linksFull, { n: MAX_LINKS }))).toBeTruthy();
+      expect(screen.getByRole('button', { name: t.addLink }).disabled).toBe(true);
+    });
+  });
 });
+
diff --git a/src/dashboard/lib/links.test.js b/src/dashboard/lib/links.test.js
new file mode 100644
index 0000000..cfa4c64
--- /dev/null
+++ b/src/dashboard/lib/links.test.js
@@ -0,0 +1,27 @@
+// @vitest-environment node
+import { describe, expect, it } from 'vitest';
+import { MAX_LINK_LABEL } from '../../shared/content-rules.js';
+import { checkLink, completeLinkUrl } from './links.js';
+
+describe('completeLinkUrl', () => {
+  it('adds https:// to a bare address and mailto: to an email', () => {
+    expect(completeLinkUrl(' instagram.com/davide ')).toBe('https://instagram.com/davide');
+    expect(completeLinkUrl('davide@example.com')).toBe('mailto:davide@example.com');
+    expect(completeLinkUrl('https://x.com/d')).toBe('https://x.com/d');
+    expect(completeLinkUrl('http://old.example')).toBe('http://old.example');
+  });
+});
+
+describe('checkLink', () => {
+  it('accepts https:// and mailto:, with or without a label', () => {
+    expect(checkLink('github.com/d', '')).toEqual({ ok: true, link: { url: 'https://github.com/d' } });
+    expect(checkLink('github.com/d', ' Codice ')).toEqual({ ok: true, link: { url: 'https://github.com/d', label: 'Codice' } });
+  });
+
+  it('refuses another scheme, an empty address or a label too long', () => {
+    expect(checkLink('http://old.example', '')).toEqual({ ok: false, problem: 'url' });
+    expect(checkLink('  ', '')).toEqual({ ok: false, problem: 'url' });
+    expect(checkLink('a b.com', '')).toEqual({ ok: false, problem: 'url' });
+    expect(checkLink('github.com/d', 'x'.repeat(MAX_LINK_LABEL + 1))).toEqual({ ok: false, problem: 'label' });
+  });
+});
diff --git a/src/shared/content-rules.test.js b/src/shared/content-rules.test.js
index 81af758..b22b9c6 100644
--- a/src/shared/content-rules.test.js
+++ b/src/shared/content-rules.test.js
@@ -1,7 +1,7 @@
 import { describe, it, expect } from 'vitest';
 import {
   SLUG_RE, RESERVED_SLUGS, TEMPLATE_ROUTES, PHOTO_NAME_RE, MAX_PHOTO_BYTES, slugifyTitle,
-  validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape,
+  validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape, isLinkUrl,
 } from './content-rules.js';
 
 describe('regex e costanti', () => {
@@ -133,3 +133,14 @@ describe('validateConfigShape', () => {
     expect(validateConfigShape({}).ok).toBe(false);
   });
 });
+
+describe('isLinkUrl', () => {
+  it('accepts https:// and mailto: without spaces, as the site validator does', () => {
+    expect(isLinkUrl('https://instagram.com/x')).toBe(true);
+    expect(isLinkUrl('mailto:a@b.c')).toBe(true);
+    expect(isLinkUrl('http://x.com')).toBe(false);
+    expect(isLinkUrl('https://a b')).toBe(false);
+    expect(isLinkUrl(undefined)).toBe(false);
+  });
+});
+
diff --git a/src/shared/link-icons.test.js b/src/shared/link-icons.test.js
new file mode 100644
index 0000000..5971e28
--- /dev/null
+++ b/src/shared/link-icons.test.js
@@ -0,0 +1,23 @@
+import { describe, expect, it } from 'vitest';
+import { LINK_KINDS } from './site-links.js';
+import { createLinkIcon, linkIcon } from './link-icons.js';
+
+describe('linkIcon', () => {
+  it('has an icon for every kind of link', () => {
+    for (const kind of [...Object.keys(LINK_KINDS), 'email', 'website']) {
+      const icon = linkIcon(kind);
+      expect(icon.d.length, kind).toBeGreaterThan(10);
+    }
+    expect(linkIcon('instagram').filled).toBe(true);
+    expect(linkIcon('email').filled).toBe(false);
+    expect(linkIcon('unknown')).toEqual(linkIcon('website'));
+  });
+
+  it('builds a decorative SVG for pages without React', () => {
+    const svg = createLinkIcon('github');
+    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
+    expect(svg.getAttribute('aria-hidden')).toBe('true');
+    expect(svg.querySelector('path').getAttribute('fill')).toBe('currentColor');
+    expect(createLinkIcon('website').querySelector('path').getAttribute('stroke')).toBe('currentColor');
+  });
+});
````

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index 3b35497..df89ad9 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -139,6 +139,21 @@ export const texts = {
       previewPart: 'Just this part',
       done: 'Done',
       emptyValue: 'Empty',
+      linksEmpty: 'No links yet: add your profiles, your website or your email.',
+      addLink: 'Add link',
+      newLink: 'New link',
+      editLink: 'Link',
+      linkUrlLabel: 'Address',
+      linkUrlHint: 'A web address, or an email address.',
+      linkLabelLabel: 'Name shown (optional)',
+      linkLabelHint: 'Empty: "{kind}".',
+      linkUrlInvalid: 'Use a web address (https://…) or an email address.',
+      linkLabelTooLong: 'At most {n} characters.',
+      removeLink: 'Remove link',
+      cancel: 'Cancel',
+      moveLinkEarlier: 'Move {link} up',
+      moveLinkLater: 'Move {link} down',
+      linksFull: 'At most {n} links.',
     },
     albums: {
       sectionTitle: 'Albums',
diff --git a/config/texts.it.js b/config/texts.it.js
index a057e76..c92936d 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -136,6 +136,21 @@ export const texts = {
       previewPart: 'Solo questo pezzo',
       done: 'Fatto',
       emptyValue: 'Vuoto',
+      linksEmpty: 'Nessun link: aggiungi i tuoi profili, il tuo sito o la tua email.',
+      addLink: 'Aggiungi link',
+      newLink: 'Nuovo link',
+      editLink: 'Link',
+      linkUrlLabel: 'Indirizzo',
+      linkUrlHint: 'Un indirizzo web, oppure un indirizzo email.',
+      linkLabelLabel: 'Nome mostrato (facoltativo)',
+      linkLabelHint: 'Vuoto: "{kind}".',
+      linkUrlInvalid: 'Usa un indirizzo web (https://…) o un indirizzo email.',
+      linkLabelTooLong: 'Al massimo {n} caratteri.',
+      removeLink: 'Togli il link',
+      cancel: 'Annulla',
+      moveLinkEarlier: 'Sposta {link} in su',
+      moveLinkLater: 'Sposta {link} in giù',
+      linksFull: 'Al massimo {n} link.',
       heroNone: 'nessuna',
     },
     albums: {
diff --git a/src/components/Footer.js b/src/components/Footer.js
index eecfcc3..082c6bf 100644
--- a/src/components/Footer.js
+++ b/src/components/Footer.js
@@ -1,6 +1,7 @@
 import '../styles/footer.css';
 import { html } from '../shared/html.js';
-import { linkLabel } from '../shared/site-links.js';
+import { linkKind, linkLabel } from '../shared/site-links.js';
+import { createLinkIcon } from '../shared/link-icons.js';
 
 /**
  * Renders the site footer with copyright and the site's links.
@@ -24,7 +25,10 @@ export function renderFooter(container, texts, links = []) {
       a.href = link.url;
       a.target = '_blank';
       a.rel = 'noopener noreferrer';
-      a.textContent = linkLabel(link, texts);
+      // The icon of its kind, then its name: the name is what screen readers read.
+      const label = document.createElement('span');
+      label.textContent = linkLabel(link, texts);
+      a.append(createLinkIcon(linkKind(link.url)), label);
       nav.appendChild(a);
     }
   }
diff --git a/src/dashboard/features/site/LinkSheet.jsx b/src/dashboard/features/site/LinkSheet.jsx
new file mode 100644
index 0000000..6db071b
--- /dev/null
+++ b/src/dashboard/features/site/LinkSheet.jsx
@@ -0,0 +1,76 @@
+import { useEffect, useId, useState } from 'react';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { MAX_LINK_LABEL } from '../../../shared/content-rules.js';
+import { LINK_KINDS, linkKind } from '../../../shared/site-links.js';
+import { checkLink, completeLinkUrl } from '../../lib/links.js';
+import { Sheet } from '../../ui/Sheet.jsx';
+import { Button } from '../../ui/Button.jsx';
+import { LinkIcon } from '../../ui/LinkIcon.jsx';
+
+const t = texts.admin.site;
+
+/** The name a link shows when it has no label of its own. */
+const kindName = kind => LINK_KINDS[kind] ?? texts.links[kind] ?? kind;
+
+/**
+ * Adds or edits one link: its address (its icon follows as it is typed) and an optional
+ * name. A link is saved when the sheet is confirmed with Done, once it is valid: a half-typed
+ * address never reaches the site.
+ * @param {{open: boolean, link: {url: string, label?: string}|null, onDone: (link: object) => void,
+ *   onRemove?: Function, onClose: Function, side?: boolean}} props - `link` null adds a new one.
+ */
+export function LinkSheet({ open, link, onDone, onRemove, onClose, side = false }) {
+  const [url, setUrl] = useState('');
+  const [label, setLabel] = useState('');
+  const [problem, setProblem] = useState(null);
+  const urlId = useId();
+  const labelId = useId();
+  const errorId = useId();
+
+  useEffect(() => {
+    if (!open) return;
+    setUrl(link?.url ?? '');
+    setLabel(link?.label ?? '');
+    setProblem(null);
+  }, [open, link]);
+
+  const kind = linkKind(completeLinkUrl(url));
+  const done = () => {
+    const checked = checkLink(url, label);
+    if (!checked.ok) {
+      setProblem(checked.problem);
+      return;
+    }
+    onDone(checked.link);
+  };
+  const message = problem === 'url' ? t.linkUrlInvalid : problem === 'label' ? formatText(t.linkLabelTooLong, { n: MAX_LINK_LABEL }) : null;
+
+  return (
+    <Sheet open={open} onClose={onClose} title={link ? t.editLink : t.newLink}
+      className={`dash-field-sheet${side ? ' dash-field-sheet--side' : ''}`}>
+      <div className="dash-form">
+        <label htmlFor={urlId} className="dash-label">{t.linkUrlLabel}</label>
+        <div className="dash-link-input">
+          <LinkIcon kind={kind} />
+          <input id={urlId} className="dash-input" type="text" inputMode="url" autoComplete="off" value={url}
+            placeholder="https://" aria-invalid={problem === 'url' ? 'true' : undefined}
+            aria-describedby={problem === 'url' ? errorId : undefined}
+            onChange={event => { setUrl(event.target.value); setProblem(null); }} />
+        </div>
+        <p className="dash-hint">{t.linkUrlHint}</p>
+        <label htmlFor={labelId} className="dash-label">{t.linkLabelLabel}</label>
+        <input id={labelId} className="dash-input" value={label} placeholder={kindName(kind)}
+          aria-invalid={problem === 'label' ? 'true' : undefined} aria-describedby={problem === 'label' ? errorId : undefined}
+          onChange={event => { setLabel(event.target.value); setProblem(null); }} />
+        <p className="dash-hint">{formatText(t.linkLabelHint, { kind: kindName(kind) })}</p>
+        {message && <p id={errorId} className="dash-form__error" role="alert">{message}</p>}
+      </div>
+      <div className="dash-confirm__actions">
+        {onRemove && <Button variant="danger" onClick={onRemove}>{t.removeLink}</Button>}
+        <Button onClick={onClose}>{t.cancel}</Button>
+        <Button variant="primary" onClick={done}>{t.done}</Button>
+      </div>
+    </Sheet>
+  );
+}
diff --git a/src/dashboard/features/site/LinksEditor.jsx b/src/dashboard/features/site/LinksEditor.jsx
new file mode 100644
index 0000000..2d29384
--- /dev/null
+++ b/src/dashboard/features/site/LinksEditor.jsx
@@ -0,0 +1,77 @@
+import { useState } from 'react';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { MAX_LINKS } from '../../../shared/content-rules.js';
+import { linkKind, linkLabel } from '../../../shared/site-links.js';
+import { moveItem } from '../../../admin/sortable.js';
+import { Button } from '../../ui/Button.jsx';
+import { LinkIcon } from '../../ui/LinkIcon.jsx';
+import { MoveButtons } from '../../ui/MoveButtons.jsx';
+import { useSortable } from '../../ui/useSortable.js';
+import { LinkSheet } from './LinkSheet.jsx';
+
+const t = texts.admin.site;
+
+/**
+ * The site's links, in the order of the footer: each with the icon of its kind, opened to
+ * edit or remove it; arrows (and dragging) change the order; "Add link" at the end.
+ * `onChange(update)` receives a function of the latest list.
+ * @param {{links: Array|undefined, onChange: Function, onOpen: Function, onClose: Function, side?: boolean}} props
+ *   `onOpen` / `onClose` tell the screen when a link is being edited (the preview shows the footer).
+ */
+export function LinksEditor({ links, onChange, onOpen, onClose, side = false }) {
+  const [editing, setEditing] = useState(null); // { index } of a link, or { index: -1 } for a new one
+  const move = (from, to) => onChange(prev => moveItem(prev, from, to));
+  const listRef = useSortable(move);
+
+  const open = index => { setEditing({ index }); onOpen(); };
+  const close = () => { setEditing(null); onClose(); };
+  const done = link => {
+    const { index } = editing;
+    onChange(prev => (index === -1 ? [...prev, link] : prev.map((item, i) => (i === index ? link : item))));
+    close();
+  };
+  const remove = () => {
+    const { index } = editing;
+    onChange(prev => prev.filter((_, i) => i !== index));
+    close();
+  };
+
+  const full = (links?.length ?? 0) >= MAX_LINKS;
+  // Keys that follow a link when it moves (the arrow keeps the focus); the same address twice
+  // gets a number.
+  const seen = new Map();
+  const keyOf = link => {
+    const n = (seen.get(link.url) ?? 0) + 1;
+    seen.set(link.url, n);
+    return `${link.url}#${n}`;
+  };
+  return (
+    <div className="dash-links">
+      {links?.length === 0 && <p className="dash-hint">{t.linksEmpty}</p>}
+      <ul ref={listRef} className="dash-site-rows">
+        {(links ?? []).map((link, index) => {
+          const name = linkLabel(link, texts);
+          return (
+            <li key={keyOf(link)} className="dash-link-row" draggable="true">
+              <button type="button" className="dash-site-row dash-link-row__open" onClick={() => open(index)}>
+                <span className="dash-link-row__name"><LinkIcon kind={linkKind(link.url)} />{name}</span>
+                <span className="dash-site-row__value dash-link-row__url">{link.url.replace(/^(https:\/\/|mailto:)/, '')}</span>
+              </button>
+              <span className="dash-link-row__move">
+                <MoveButtons vertical index={index} total={links.length} onMove={move}
+                  earlierLabel={formatText(t.moveLinkEarlier, { link: name })}
+                  laterLabel={formatText(t.moveLinkLater, { link: name })} />
+              </span>
+            </li>
+          );
+        })}
+      </ul>
+      <Button onClick={() => open(-1)} disabled={!links || full}>{t.addLink}</Button>
+      {full && <p className="dash-hint">{formatText(t.linksFull, { n: MAX_LINKS })}</p>}
+      <LinkSheet open={editing !== null} side={side}
+        link={editing && editing.index !== -1 ? links?.[editing.index] ?? null : null}
+        onDone={done} onRemove={editing && editing.index !== -1 ? remove : undefined} onClose={close} />
+    </div>
+  );
+}
diff --git a/src/dashboard/features/site/SiteScreen.jsx b/src/dashboard/features/site/SiteScreen.jsx
index fdd16a5..794992e 100644
--- a/src/dashboard/features/site/SiteScreen.jsx
+++ b/src/dashboard/features/site/SiteScreen.jsx
@@ -6,6 +6,7 @@ import { textFields } from '../../lib/site-fields.js';
 import { useMediaQuery } from '../../ui/useMediaQuery.js';
 import { Button } from '../../ui/Button.jsx';
 import { FieldSheet } from './FieldSheet.jsx';
+import { LinksEditor } from './LinksEditor.jsx';
 import { PreviewFrame } from './PreviewFrame.jsx';
 import { usePreview } from './usePreview.js';
 import './site.css';
@@ -44,6 +45,15 @@ export function SiteScreen() {
     queue.flush().then(() => preview.forget(field.id));
   };
 
+  // Links are not live text: once saved, the preview reads the draft again.
+  const changeLinks = update => {
+    if (setSite(prev => ({ ...prev, links: update(prev.links) }), { now: true })) queue.flush().then(() => preview.reload());
+  };
+  const linksOpen = () => {
+    setPage('/');
+    preview.focus('site.links');
+  };
+
   const group = (name, title) => (
     <section className="dash-site-group" aria-labelledby={`dash-site-${name}`}>
       <h2 id={`dash-site-${name}`} className="dash-label">{title}</h2>
@@ -69,6 +79,10 @@ export function SiteScreen() {
       <div className="dash-site__fields">
         <h1 className="dash-screen-title">{t.sectionTitle}</h1>
         {group('who', t.groupWho)}
+        <section className="dash-site-group" aria-labelledby="dash-site-links">
+          <h2 id="dash-site-links" className="dash-label">{t.groupLinks}</h2>
+          <LinksEditor links={site?.links} onChange={changeLinks} onOpen={linksOpen} onClose={() => preview.focus(null)} side={wide} />
+        </section>
         {group('home', t.groupHome)}
         {group('contact', t.groupContact)}
       </div>
diff --git a/src/dashboard/features/site/site.css b/src/dashboard/features/site/site.css
index 956c29b..bacdd0d 100644
--- a/src/dashboard/features/site/site.css
+++ b/src/dashboard/features/site/site.css
@@ -27,3 +27,18 @@
 .dash-field-sheet--side { margin: 6rem auto auto 1.25rem; width: min(26rem, calc(100vw - 2rem)); }
 .dash-field-sheet--side::backdrop { background: rgb(0 0 0 / 0.25); }
 
+.dash-links { display: grid; gap: 0.5rem; justify-items: start; }
+.dash-links .dash-site-rows { width: 100%; }
+.dash-link-row { display: flex; align-items: stretch; background: var(--admin-surface); }
+.dash-link-row__open { flex: 1; min-width: 0; }
+.dash-link-row__name { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 500; }
+.dash-link-row__url { font: 0.8rem/1.3 var(--admin-font-mono); color: var(--admin-muted); }
+.dash-link-row__move { display: flex; align-items: center; gap: 0.25rem; padding: 0 0.5rem; }
+.dash-link-row__move button {
+  width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--admin-line);
+  background: transparent; color: var(--admin-ink); cursor: pointer;
+}
+.dash-link-row__move button[aria-disabled="true"] { opacity: 0.4; cursor: default; }
+.dash-link-input { display: flex; align-items: center; gap: 0.5rem; }
+.dash-link-icon { flex: none; }
+
diff --git a/src/dashboard/lib/links.js b/src/dashboard/lib/links.js
new file mode 100644
index 0000000..8fed8fb
--- /dev/null
+++ b/src/dashboard/lib/links.js
@@ -0,0 +1,30 @@
+/**
+ * Checking a link typed in the dashboard. Plain JavaScript (no React).
+ */
+import { isLinkUrl, MAX_LINK_LABEL } from '../../shared/content-rules.js';
+
+/**
+ * The address as it will be saved: a bare email becomes mailto:, a bare address https://.
+ * @param {string} typed
+ * @returns {string}
+ */
+export function completeLinkUrl(typed) {
+  const url = typed.trim();
+  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
+  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url)) return `mailto:${url}`;
+  return `https://${url.replace(/^\/+/, '')}`;
+}
+
+/**
+ * The link to save, or why it cannot be saved.
+ * @param {string} url - As typed.
+ * @param {string} label - As typed; empty means "the name of the site".
+ * @returns {{ok: true, link: {url: string, label?: string}} | {ok: false, problem: 'url'|'label'}}
+ */
+export function checkLink(url, label) {
+  const complete = completeLinkUrl(url);
+  if (!isLinkUrl(complete)) return { ok: false, problem: 'url' };
+  const name = label.trim();
+  if (name.length > MAX_LINK_LABEL) return { ok: false, problem: 'label' };
+  return { ok: true, link: name ? { url: complete, label: name } : { url: complete } };
+}
diff --git a/src/dashboard/ui/LinkIcon.jsx b/src/dashboard/ui/LinkIcon.jsx
new file mode 100644
index 0000000..388fe78
--- /dev/null
+++ b/src/dashboard/ui/LinkIcon.jsx
@@ -0,0 +1,17 @@
+import { linkIcon } from '../../shared/link-icons.js';
+
+/**
+ * The icon of a kind of link (the same drawing as the site's footer). Decorative: the text
+ * next to it names the link.
+ * @param {{kind: string, size?: number}} props
+ */
+export function LinkIcon({ kind, size = 20 }) {
+  const { d, filled } = linkIcon(kind);
+  return (
+    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="dash-link-icon">
+      {filled
+        ? <path d={d} fill="currentColor" />
+        : <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
+    </svg>
+  );
+}
diff --git a/src/dashboard/ui/MoveButtons.jsx b/src/dashboard/ui/MoveButtons.jsx
index d7702f6..a57ca82 100644
--- a/src/dashboard/ui/MoveButtons.jsx
+++ b/src/dashboard/ui/MoveButtons.jsx
@@ -4,9 +4,10 @@
  * disabled button loses the focus, and a keyboard user who has just moved an item to the top
  * would find themselves back at the start of the page.
  * @param {{index: number, total: number, onMove: (from: number, to: number) => void,
- *   earlierLabel: string, laterLabel: string}} props
+ *   earlierLabel: string, laterLabel: string, vertical?: boolean}} props
+ *   `vertical`: up and down arrows, for a list read from top to bottom.
  */
-export function MoveButtons({ index, total, onMove, earlierLabel, laterLabel }) {
+export function MoveButtons({ index, total, onMove, earlierLabel, laterLabel, vertical = false }) {
   const arrow = (to, label, symbol) => {
     const blocked = to < 0 || to >= total;
     return (
@@ -16,8 +17,8 @@ export function MoveButtons({ index, total, onMove, earlierLabel, laterLabel })
   };
   return (
     <>
-      {arrow(index - 1, earlierLabel, '←')}
-      {arrow(index + 1, laterLabel, '→')}
+      {arrow(index - 1, earlierLabel, vertical ? '↑' : '←')}
+      {arrow(index + 1, laterLabel, vertical ? '↓' : '→')}
     </>
   );
 }
diff --git a/src/shared/content-rules.js b/src/shared/content-rules.js
index 281fbb1..968a738 100644
--- a/src/shared/content-rules.js
+++ b/src/shared/content-rules.js
@@ -50,6 +50,9 @@ export const MAX_LINKS = 12;
 export const MAX_LINK_LABEL = 40;
 const LINK_URL_RE = /^(https:\/\/[^\s]+|mailto:[^\s]+)$/;
 
+/** Whether an address can be a link of the site: https:// or mailto:, no spaces. */
+export const isLinkUrl = url => typeof url === 'string' && LINK_URL_RE.test(url);
+
 /**
  * Values of the `data-field` attribute that the dashboard's preview can update and focus:
  * the site's name, bio and links, and every editable text as `texts.<key>`.
diff --git a/src/shared/link-icons.js b/src/shared/link-icons.js
new file mode 100644
index 0000000..ac8c103
--- /dev/null
+++ b/src/shared/link-icons.js
@@ -0,0 +1,72 @@
+/**
+ * Icons of the site's links, one per kind of linkKind(): drawn inline on a 24×24 grid (no
+ * external files, compatible with the CSP). Shared by the site (footer) and the dashboard.
+ *
+ * The brand marks are copied from Simple Icons 16.33.0 (https://simpleicons.org), released
+ * under CC0 1.0: filled shapes. Simple Icons has no LinkedIn mark; LinkedIn, email and
+ * website are drawn here as outlines.
+ */
+
+/** Filled brand marks (Simple Icons, CC0 1.0). */
+const BRANDS = {
+  instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
+  behance: "M16.969 16.927a2.561 2.561 0 0 0 1.901.677 2.501 2.501 0 0 0 1.531-.475c.362-.235.636-.584.779-.99h2.585a5.091 5.091 0 0 1-1.9 2.896 5.292 5.292 0 0 1-3.091.88 5.839 5.839 0 0 1-2.284-.433 4.871 4.871 0 0 1-1.723-1.211 5.657 5.657 0 0 1-1.08-1.874 7.057 7.057 0 0 1-.383-2.393c-.005-.8.129-1.595.396-2.349a5.313 5.313 0 0 1 5.088-3.604 4.87 4.87 0 0 1 2.376.563c.661.362 1.231.87 1.668 1.485a6.2 6.2 0 0 1 .943 2.133c.194.821.263 1.666.205 2.508h-7.699c-.063.79.184 1.574.688 2.187ZM6.947 4.084a8.065 8.065 0 0 1 1.928.198 4.29 4.29 0 0 1 1.49.638c.418.303.748.711.958 1.182.241.579.357 1.203.341 1.83a3.506 3.506 0 0 1-.506 1.961 3.726 3.726 0 0 1-1.503 1.287 3.588 3.588 0 0 1 2.027 1.437c.464.747.697 1.615.67 2.494a4.593 4.593 0 0 1-.423 2.032 3.945 3.945 0 0 1-1.163 1.413 5.114 5.114 0 0 1-1.683.807 7.135 7.135 0 0 1-1.928.259H0V4.084h6.947Zm-.235 12.9c.308.004.616-.029.916-.099a2.18 2.18 0 0 0 .766-.332c.228-.158.411-.371.534-.619.142-.317.208-.663.191-1.009a2.08 2.08 0 0 0-.642-1.715 2.618 2.618 0 0 0-1.696-.505h-3.54v4.279h3.471Zm13.635-5.967a2.13 2.13 0 0 0-1.654-.619 2.336 2.336 0 0 0-1.163.259 2.474 2.474 0 0 0-.738.62 2.359 2.359 0 0 0-.396.792c-.074.239-.12.485-.137.734h4.769a3.239 3.239 0 0 0-.679-1.785l-.002-.001Zm-13.813-.648a2.254 2.254 0 0 0 1.423-.433c.399-.355.607-.88.56-1.413a1.916 1.916 0 0 0-.178-.891 1.298 1.298 0 0 0-.495-.533 1.851 1.851 0 0 0-.711-.274 3.966 3.966 0 0 0-.835-.073H3.241v3.631h3.293v-.014ZM21.62 5.122h-5.976v1.527h5.976V5.122Z",
+  flickr: "M5.334 6.666C2.3884 6.666 0 9.055 0 12c0 2.9456 2.3884 5.334 5.334 5.334 2.9456 0 5.332-2.3884 5.332-5.334 0-2.945-2.3864-5.334-5.332-5.334zm13.332 0c-2.9456 0-5.332 2.389-5.332 5.334 0 2.9456 2.3864 5.334 5.332 5.334C21.6116 17.334 24 14.9456 24 12c0-2.945-2.3884-5.334-5.334-5.334Z",
+  "500px": "M7.451 8.9995A3.0005 3.0005 0 1 0 10.4514 12a3.0275 3.0275 0 0 0-3.0006-3.0005Zm0 5.371A2.3554 2.3554 0 1 1 9.7912 12a2.3704 2.3704 0 0 1-2.3404 2.3704Zm6.448-5.371A3.0005 3.0005 0 1 0 16.8997 12a3.0005 3.0005 0 0 0-3.0005-3.0005Zm0 5.371A2.3554 2.3554 0 1 1 16.2396 12a2.3314 2.3314 0 0 1-2.3404 2.3704zM2.29 10.7997a2.0224 2.0224 0 0 0-1.5903.42V9.6297h2.7005c.09 0 .15-.03.15-.3 0-.2701-.12-.2701-.18-.2701H.3997a.27.27 0 0 0-.27.27V11.97c0 .15.09.18.24.21a.228.228 0 0 0 .27-.06A1.7073 1.7073 0 0 1 2.14 11.4 1.5603 1.5603 0 0 1 3.4902 12.72 1.5183 1.5183 0 0 1 2.17 14.4004h-.18a1.5303 1.5303 0 0 1-1.4103-.9901c-.03-.09-.09-.15-.33-.06-.2401.09-.2701.15-.2401.24a2.1274 2.1274 0 0 0 2.7005 1.2602A2.1274 2.1274 0 0 0 3.9703 12.15 2.1004 2.1004 0 0 0 2.29 10.7998zm16.65-1.7703a1.6263 1.6263 0 0 0-1.4403 1.6203v2.6704c0 .15.12.18.3.18s.3001-.03.3001-.18v-2.6704a1.0082 1.0082 0 0 1 .8702-1.0202.9872.9872 0 0 1 .7501.24.9572.9572 0 0 1 .33.7202 1.2002 1.2002 0 0 1-.21.57A.9452.9452 0 0 1 19 11.55c-.12 0-.21 0-.24.27 0 .1801 0 .2701.15.3001a1.4763 1.4763 0 0 0 .8701-.18 1.6113 1.6113 0 0 0 .8702-1.2602 1.5543 1.5543 0 0 0-1.4463-1.6803.8311.8311 0 0 1-.264.03zm3.9307 1.5602 1.0802-1.0801c.03-.03.12-.12-.06-.3301a.3.3 0 0 0-.2101-.12.156.156 0 0 0-.12.06l-1.0802 1.0802-1.0802-1.1102c-.09-.09-.18-.06-.33.06-.15.12-.15.24-.06.33l1.0801 1.0802-1.0862 1.1102a.228.228 0 0 0-.06.12.252.252 0 0 0 .12.2101.483.483 0 0 0 .21.12.318.318 0 0 0 .1501-.06l1.0802-1.0802 1.0802 1.0802a.156.156 0 0 0 .12.06.3.3 0 0 0 .21-.12c.09-.12.12-.24.03-.3z",
+  vimeo: "M23.9765 6.4168c-.105 2.338-1.739 5.5429-4.894 9.6088-3.2679 4.247-6.0258 6.3699-8.2898 6.3699-1.409 0-2.578-1.294-3.553-3.881l-1.9179-7.1138c-.719-2.584-1.488-3.878-2.312-3.878-.179 0-.806.378-1.8809 1.132l-1.129-1.457a315.06 315.06 0 003.501-3.1279c1.579-1.368 2.765-2.085 3.5539-2.159 1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.5069.5389 2.45 1.1309 3.674 1.7759 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.8679 3.434-5.7568 6.7619-5.6368 2.4729.06 3.6279 1.664 3.4929 4.7969z",
+  youtube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
+  tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
+  facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
+  threads: "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
+  bluesky: "M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026",
+  x: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
+  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
+};
+
+/** Outlines drawn for this template. */
+const OUTLINES = {
+  linkedin: 'M4 4h16v16H4z M8 10.5V16 M8 7.5v.01 M11.5 16v-5.5 M11.5 13a2.75 2.75 0 0 1 5.5 0V16',
+  email: 'M3 6h18v12H3z M3 6l9 7 9-7',
+  website: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3c3 3.5 3 14.5 0 18 M12 3c-3 3.5-3 14.5 0 18',
+};
+
+/**
+ * The icon of a kind of link.
+ * @param {string} kind - A value of linkKind(): a LINK_KINDS key, 'email' or 'website'.
+ * @returns {{d: string, filled: boolean}} The SVG path, and whether it is filled (else an outline).
+ */
+export function linkIcon(kind) {
+  if (BRANDS[kind]) return { d: BRANDS[kind], filled: true };
+  return { d: OUTLINES[kind] ?? OUTLINES.website, filled: false };
+}
+
+const SVG_NS = 'http://www.w3.org/2000/svg';
+
+/**
+ * The icon as an SVG element, for pages built without React (the footer). Decorative: the
+ * link's text names it.
+ * @param {string} kind
+ * @param {Document} [doc]
+ * @returns {SVGSVGElement}
+ */
+export function createLinkIcon(kind, doc = document) {
+  const { d, filled } = linkIcon(kind);
+  const svg = doc.createElementNS(SVG_NS, 'svg');
+  svg.setAttribute('viewBox', '0 0 24 24');
+  svg.setAttribute('aria-hidden', 'true');
+  svg.setAttribute('focusable', 'false');
+  svg.setAttribute('class', 'link-icon');
+  const path = doc.createElementNS(SVG_NS, 'path');
+  path.setAttribute('d', d);
+  if (filled) {
+    path.setAttribute('fill', 'currentColor');
+  } else {
+    path.setAttribute('fill', 'none');
+    path.setAttribute('stroke', 'currentColor');
+    path.setAttribute('stroke-width', '1.6');
+    path.setAttribute('stroke-linecap', 'round');
+    path.setAttribute('stroke-linejoin', 'round');
+  }
+  svg.appendChild(path);
+  return svg;
+}
diff --git a/src/styles/footer.css b/src/styles/footer.css
index c1305a5..86a2440 100644
--- a/src/styles/footer.css
+++ b/src/styles/footer.css
@@ -15,10 +15,19 @@
 }
 
 .site-footer__link {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4em;
   color: var(--color-muted);
   text-decoration: none;
 }
 
+.site-footer__link .link-icon {
+  width: 1.4em;
+  height: 1.4em;
+  flex: none;
+}
+
 .site-footer__link:hover {
   color: var(--color-text);
 }
````

---

### Task 5: Home image, and deleting it

The home image (spec, "Sito" → "Home"): a row with the chosen photo, a sheet to pick an album and one of its photos, or no image; saved when picked, then the preview reads the draft again.

From the final review of plan 4.2 (spec, "Da portare nel 4.3"): deleting the photo used as the home image, or its album, would block publishing (`HERO_NOT_IN_ALBUM`) with Discard as the only way out. Now the confirmation says it is also the home image, and confirming clears the home image too.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/dashboard/features/album/AlbumScreen.jsx`, `src/dashboard/features/album/AlbumScreen.test.jsx`, `src/dashboard/features/site/HeroField.jsx`, `src/dashboard/features/site/SiteScreen.jsx`, `src/dashboard/features/site/SiteScreen.test.jsx`, `src/dashboard/features/site/site.css`

**Interfaces:**
- Consumes: `useSite` (Task 1); `SiteScreen` `group(name, title, first)` (Task 3); `useAlbums`, `useManifest`, `photoSrc` (plan 4.2).
- Produces: `<HeroField hero onChange onOpen onClose side? />`; texts `admin.site.hero*` and `admin.album.heroGoes`.

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t5/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t5/$f" "$f"; done
```

Run: `npm test` → 2 files fail, 4 tests fail.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p43/t5/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p43/t5/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 109 files, 857 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "not wrapped in act"` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/dashboard/features/album/AlbumScreen.jsx src/dashboard/features/album/AlbumScreen.test.jsx src/dashboard/features/site/HeroField.jsx src/dashboard/features/site/SiteScreen.jsx src/dashboard/features/site/SiteScreen.test.jsx src/dashboard/features/site/site.css
git commit -F - <<'EOF'
feat(dashboard): the home image, cleared with the photo or album it comes from

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The tests (diff):**

````diff
diff --git a/src/dashboard/features/album/AlbumScreen.test.jsx b/src/dashboard/features/album/AlbumScreen.test.jsx
index 378868b..130e5c7 100644
--- a/src/dashboard/features/album/AlbumScreen.test.jsx
+++ b/src/dashboard/features/album/AlbumScreen.test.jsx
@@ -140,4 +140,41 @@ describe('open album', () => {
     await act(() => queue.flush());
     expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0]).toEqual({ ...NOTTE, description: 'Cieli stellati' });
   });
+
+  it('deleting the home image says so, and leaves the home without one (publishing would stop otherwise)', async () => {
+    const fetchMock = worker({
+      'GET /api/admin/draft': { ...DRAFT, site: { ...DRAFT.site, hero: { album: 'notte', name: 'b.webp' } } },
+      'PUT /api/admin/draft/site': { ok: true },
+      'DELETE /api/admin/staging/notte/b.webp': { ok: true },
+    });
+    renderAt('/album/notte');
+    fireEvent.click(await screen.findByRole('button', { name: `${t.deletePhoto} · Photo 2` }));
+    const dialog = await screen.findByRole('alertdialog');
+    expect(dialog.textContent).toContain(t.heroGoes);
+    fireEvent.click(within(dialog).getByRole('button', { name: t.deletePhoto }));
+    await act(() => queue.flush());
+    expect(lastPut(fetchMock, '/api/admin/draft/site').hero).toBeNull();
+  });
+
+  it('deleting the album of the home image does the same', async () => {
+    const fetchMock = worker({
+      'GET /api/admin/draft': { ...DRAFT, site: { ...DRAFT.site, hero: { album: 'notte', name: 'a.webp' } } },
+      'PUT /api/admin/draft/site': { ok: true },
+    });
+    renderAt('/album/notte');
+    fireEvent.click(await screen.findByRole('button', { name: t.deleteAlbum }));
+    const dialog = await screen.findByRole('alertdialog');
+    expect(dialog.textContent).toContain(t.heroGoes);
+    fireEvent.click(within(dialog).getByRole('button', { name: t.deleteAlbum }));
+    await act(() => queue.flush());
+    expect(lastPut(fetchMock, '/api/admin/draft/site').hero).toBeNull();
+  });
+
+  it('deleting another photo leaves the home image alone', async () => {
+    worker({ 'GET /api/admin/draft': { ...DRAFT, site: { ...DRAFT.site, hero: { album: 'notte', name: 'a.webp' } } } });
+    renderAt('/album/notte');
+    fireEvent.click(await screen.findByRole('button', { name: `${t.deletePhoto} · Photo 2` }));
+    expect((await screen.findByRole('alertdialog')).textContent).not.toContain(t.heroGoes);
+  });
 });
+
diff --git a/src/dashboard/features/site/SiteScreen.test.jsx b/src/dashboard/features/site/SiteScreen.test.jsx
index 373a33a..a52d4ed 100644
--- a/src/dashboard/features/site/SiteScreen.test.jsx
+++ b/src/dashboard/features/site/SiteScreen.test.jsx
@@ -182,5 +182,40 @@ describe('Site screen', () => {
       expect(screen.getByRole('button', { name: t.addLink }).disabled).toBe(true);
     });
   });
+
+  describe('home image', () => {
+    function heroWorker(hero) {
+      let draft = { site: { ...SITE, hero }, albums: [{ slug: 'notte', title: 'Notte', description: '', coverName: null }], hasDraft: false };
+      return fakeWorker({
+        'GET /api/admin/draft': () => draft,
+        'GET /api/admin/draft/status': STATUS,
+        'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp', width: 4, height: 3 }, { name: 'b.webp', width: 4, height: 3 }]],
+        'PUT /api/admin/draft/site': init => { draft = { ...draft, site: JSON.parse(init.body) }; return { ok: true }; },
+      });
+    }
+
+    it('picks a photo of an album as the home image, and saves it at once', async () => {
+      const fetchMock = heroWorker(null);
+      renderSite();
+      const heroRow = await row(t.heroLabel);
+      expect(heroRow.textContent).toContain(t.heroNoImage);
+      fireEvent.click(heroRow);
+      const sheet = await screen.findByRole('dialog', { name: t.heroLabel });
+      fireEvent.click(await within(sheet).findByRole('button', { name: formatText(t.heroPick, { n: 2, album: 'Notte' }) }));
+      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.hero).toEqual({ album: 'notte', name: 'b.webp' }));
+      expect((await row(t.heroLabel)).querySelector('img').getAttribute('src')).toBe('/api/admin/preview/photo/notte/b.webp');
+    });
+
+    it('shows the chosen photo, and can leave the home without an image', async () => {
+      const fetchMock = heroWorker({ album: 'notte', name: 'a.webp' });
+      renderSite();
+      fireEvent.click(await row(t.heroLabel));
+      const sheet = await screen.findByRole('dialog', { name: t.heroLabel });
+      const chosen = await within(sheet).findByRole('button', { name: formatText(t.heroPick, { n: 1, album: 'Notte' }) });
+      expect(chosen.getAttribute('aria-pressed')).toBe('true');
+      fireEvent.click(within(sheet).getByRole('button', { name: t.heroNoImage }));
+      await waitFor(() => expect(siteSaves(fetchMock).at(-1)?.hero).toBeNull());
+    });
+  });
 });
````

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index df89ad9..d6df99f 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -154,6 +154,11 @@ export const texts = {
       moveLinkEarlier: 'Move {link} up',
       moveLinkLater: 'Move {link} down',
       linksFull: 'At most {n} links.',
+      heroNoImage: 'No image',
+      heroAlbumLabel: 'Album',
+      heroPick: 'Use photo {n} of {album} as the home image',
+      heroEmptyAlbum: 'This album has no photos yet.',
+      heroNoAlbums: 'Create an album and upload photos first.',
     },
     albums: {
       sectionTitle: 'Albums',
@@ -223,6 +228,7 @@ export const texts = {
       deleteAlbum: 'Delete album',
       deleteAlbumTitle: 'Delete "{album}"?',
       deleteAlbumBody: 'The album and its photos disappear from the site when you publish.',
+      heroGoes: 'It is also the home image: the home will have none until you choose another in Site.',
       upload: 'Upload photos',
       uploadFailedItem: '{nome}: {motivo}',
       uploadWaits: 'Uploads wait until publishing is finished.',
diff --git a/config/texts.it.js b/config/texts.it.js
index c92936d..02adc82 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -151,6 +151,11 @@ export const texts = {
       moveLinkEarlier: 'Sposta {link} in su',
       moveLinkLater: 'Sposta {link} in giù',
       linksFull: 'Al massimo {n} link.',
+      heroNoImage: 'Nessuna immagine',
+      heroAlbumLabel: 'Album',
+      heroPick: "Usa la foto {n} di {album} come immagine della home",
+      heroEmptyAlbum: 'Questo album non ha ancora foto.',
+      heroNoAlbums: 'Prima crea un album e carica delle foto.',
       heroNone: 'nessuna',
     },
     albums: {
@@ -221,6 +226,7 @@ export const texts = {
       deleteAlbum: 'Elimina l\'album',
       deleteAlbumTitle: 'Eliminare «{album}»?',
       deleteAlbumBody: 'L\'album e le sue foto spariscono dal sito quando pubblichi.',
+      heroGoes: "È anche l'immagine della home: la home resta senza finché non ne scegli un'altra in Sito.",
       upload: 'Carica foto',
       uploadFailedItem: '{nome}: {motivo}',
       uploadWaits: 'I caricamenti aspettano la fine della pubblicazione.',
diff --git a/src/dashboard/features/album/AlbumScreen.jsx b/src/dashboard/features/album/AlbumScreen.jsx
index f1e1f73..ff667fb 100644
--- a/src/dashboard/features/album/AlbumScreen.jsx
+++ b/src/dashboard/features/album/AlbumScreen.jsx
@@ -5,7 +5,7 @@ import { texts } from '../../../../config/texts.config.js';
 import { formatText } from '../../../utils/formatText.js';
 import { moveItem } from '../../../admin/sortable.js';
 import { request } from '../../api/client.js';
-import { useAlbums, useManifest } from '../../api/drafts.jsx';
+import { useAlbums, useManifest, useSite } from '../../api/drafts.jsx';
 import { useIsPublishing } from '../../api/queries.js';
 import { Button } from '../../ui/Button.jsx';
 import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
@@ -26,6 +26,7 @@ export function AlbumScreen() {
   const navigate = useNavigate();
   const { albums, setAlbums, isPending: albumsPending } = useAlbums();
   const { photos, setManifest, isError: manifestError } = useManifest(slug);
+  const { site, setSite } = useSite();
   const publishing = useIsPublishing();
   // An upload still running would add its photos to the album after it is deleted.
   const uploading = useIsMutating({ mutationKey: ['draft-save', 'upload', slug] }) > 0;
@@ -47,7 +48,14 @@ export function AlbumScreen() {
   // Changes are functions of the latest list: quick successive changes never undo each other.
   const updateAlbum = fields => setAlbums(prev => prev.map(item => (item.slug === slug ? { ...item, ...fields } : item)));
 
+  // The home image in this album would block publishing once its photo is gone (spec, 4.3):
+  // deleting it also clears the home image, and the confirmation says so.
+  const heroHere = site?.hero?.album === slug;
+  const isHero = name => heroHere && site.hero.name === name;
+  const clearHero = () => setSite(prev => ({ ...prev, hero: null }), { now: true });
+
   const deletePhoto = name => {
+    if (isHero(name)) clearHero();
     setManifest(prev => prev.filter(photo => photo.name !== name));
     if (album.coverName === name) updateAlbum({ coverName: null });
     // A photo still waiting to be published is removed from the waiting area now; a
@@ -57,6 +65,7 @@ export function AlbumScreen() {
   };
 
   const deleteAlbum = () => {
+    if (heroHere) clearHero();
     setAlbums(prev => prev.filter(item => item.slug !== slug), { now: true });
     setDeletingAlbum(false);
     navigate('/');
@@ -94,11 +103,13 @@ export function AlbumScreen() {
       </div>
 
       <ConfirmDialog open={deletingPhoto !== null}
-        title={formatText(t.confirmDeletePhoto, { nome: deletingPhoto ?? '' })} body={t.deletePhotoBody}
+        title={formatText(t.confirmDeletePhoto, { nome: deletingPhoto ?? '' })}
+        body={isHero(deletingPhoto) ? `${t.deletePhotoBody} ${t.heroGoes}` : t.deletePhotoBody}
         confirmLabel={t.deletePhoto} cancelLabel={t.cancel}
         onConfirm={() => deletePhoto(deletingPhoto)} onCancel={() => setDeletingPhoto(null)} />
       <ConfirmDialog open={deletingAlbum}
-        title={formatText(t.deleteAlbumTitle, { album: album.title })} body={t.deleteAlbumBody}
+        title={formatText(t.deleteAlbumTitle, { album: album.title })}
+        body={heroHere ? `${t.deleteAlbumBody} ${t.heroGoes}` : t.deleteAlbumBody}
         confirmLabel={t.deleteAlbum} cancelLabel={t.cancel}
         onConfirm={deleteAlbum} onCancel={() => setDeletingAlbum(false)} />
     </section>
diff --git a/src/dashboard/features/site/HeroField.jsx b/src/dashboard/features/site/HeroField.jsx
new file mode 100644
index 0000000..d4c6447
--- /dev/null
+++ b/src/dashboard/features/site/HeroField.jsx
@@ -0,0 +1,78 @@
+import { useEffect, useId, useState } from 'react';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { useAlbums, useManifest } from '../../api/drafts.jsx';
+import { photoSrc } from '../../api/photos.js';
+import { Sheet } from '../../ui/Sheet.jsx';
+import { Button } from '../../ui/Button.jsx';
+
+const t = texts.admin.site;
+
+/**
+ * The home image: a row showing it, and a sheet to pick an album and one of its photos, or
+ * no image. The choice is saved when it is made.
+ * @param {{hero: {album: string, name: string}|null|undefined, onChange: (hero: object|null) => void,
+ *   onOpen: Function, onClose: Function, side?: boolean}} props
+ */
+export function HeroField({ hero, onChange, onOpen, onClose, side = false }) {
+  const [open, setOpen] = useState(false);
+  const show = () => { setOpen(true); onOpen(); };
+  const hide = () => { setOpen(false); onClose(); };
+  const pick = next => { onChange(next); hide(); };
+  return (
+    <>
+      <button type="button" className="dash-site-row dash-hero-row" onClick={show} disabled={hero === undefined}>
+        <span className="dash-site-row__label">{t.heroLabel}</span>
+        {hero
+          ? <span className="dash-site-row__value dash-hero-row__value"><img src={photoSrc(hero.album, hero.name)} alt="" />{hero.album} / {hero.name}</span>
+          : <span className="dash-site-row__value dash-site-row__value--empty">{t.heroNoImage}</span>}
+      </button>
+      <HeroSheet open={open} hero={hero ?? null} onPick={pick} onClose={hide} side={side} />
+    </>
+  );
+}
+
+function HeroSheet({ open, hero, onPick, onClose, side }) {
+  const { albums } = useAlbums();
+  const [slug, setSlug] = useState(null);
+  const selectId = useId();
+  useEffect(() => {
+    if (open) setSlug(hero?.album ?? albums?.[0]?.slug ?? null);
+  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
+  const { photos } = useManifest(open ? slug : null);
+  const album = albums?.find(item => item.slug === slug);
+
+  return (
+    <Sheet open={open} onClose={onClose} title={t.heroLabel} className={`dash-field-sheet${side ? ' dash-field-sheet--side' : ''}`}>
+      {albums?.length ? (
+        <div className="dash-form">
+          <label htmlFor={selectId} className="dash-label">{t.heroAlbumLabel}</label>
+          <select id={selectId} className="dash-input" value={slug ?? ''} onChange={event => setSlug(event.target.value)}>
+            {albums.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}
+          </select>
+          {photos?.length === 0 && <p className="dash-hint">{t.heroEmptyAlbum}</p>}
+          {photos?.length > 0 && (
+            <ul className="dash-hero-grid">
+              {photos.map((photo, index) => {
+                const chosen = hero?.album === slug && hero?.name === photo.name;
+                return (
+                  <li key={photo.name}>
+                    <button type="button" className="dash-hero-grid__photo" aria-pressed={chosen}
+                      aria-label={formatText(t.heroPick, { n: index + 1, album: album?.title ?? slug })}
+                      onClick={() => onPick({ album: slug, name: photo.name })}>
+                      <img src={photoSrc(slug, photo.name)} alt="" loading="lazy" />
+                    </button>
+                  </li>
+                );
+              })}
+            </ul>
+          )}
+        </div>
+      ) : <p className="dash-hint">{t.heroNoAlbums}</p>}
+      <div className="dash-confirm__actions">
+        {hero && <Button onClick={() => onPick(null)}>{t.heroNoImage}</Button>}
+        <Button variant="primary" onClick={onClose}>{t.done}</Button>
+      </div>
+    </Sheet>
+  );
+}
diff --git a/src/dashboard/features/site/SiteScreen.jsx b/src/dashboard/features/site/SiteScreen.jsx
index 794992e..253ceba 100644
--- a/src/dashboard/features/site/SiteScreen.jsx
+++ b/src/dashboard/features/site/SiteScreen.jsx
@@ -7,6 +7,7 @@ import { useMediaQuery } from '../../ui/useMediaQuery.js';
 import { Button } from '../../ui/Button.jsx';
 import { FieldSheet } from './FieldSheet.jsx';
 import { LinksEditor } from './LinksEditor.jsx';
+import { HeroField } from './HeroField.jsx';
 import { PreviewFrame } from './PreviewFrame.jsx';
 import { usePreview } from './usePreview.js';
 import './site.css';
@@ -49,15 +50,19 @@ export function SiteScreen() {
   const changeLinks = update => {
     if (setSite(prev => ({ ...prev, links: update(prev.links) }), { now: true })) queue.flush().then(() => preview.reload());
   };
+  const changeHero = hero => {
+    if (setSite(prev => ({ ...prev, hero }), { now: true })) queue.flush().then(() => preview.reload());
+  };
   const linksOpen = () => {
     setPage('/');
     preview.focus('site.links');
   };
 
-  const group = (name, title) => (
+  const group = (name, title, first = null) => (
     <section className="dash-site-group" aria-labelledby={`dash-site-${name}`}>
       <h2 id={`dash-site-${name}`} className="dash-label">{title}</h2>
       <ul className="dash-site-rows">
+        {first && <li>{first}</li>}
         {FIELDS.filter(field => field.group === name).map(field => {
           const value = site ? field.read(site) : '';
           return (
@@ -83,7 +88,10 @@ export function SiteScreen() {
           <h2 id="dash-site-links" className="dash-label">{t.groupLinks}</h2>
           <LinksEditor links={site?.links} onChange={changeLinks} onOpen={linksOpen} onClose={() => preview.focus(null)} side={wide} />
         </section>
-        {group('home', t.groupHome)}
+        {group('home', t.groupHome, (
+          <HeroField hero={site?.hero} onChange={changeHero} side={wide}
+            onOpen={() => { setPage('/'); preview.focus(null); }} onClose={() => {}} />
+        ))}
         {group('contact', t.groupContact)}
       </div>
       {wide && (
diff --git a/src/dashboard/features/site/site.css b/src/dashboard/features/site/site.css
index bacdd0d..78c6903 100644
--- a/src/dashboard/features/site/site.css
+++ b/src/dashboard/features/site/site.css
@@ -42,3 +42,10 @@
 .dash-link-input { display: flex; align-items: center; gap: 0.5rem; }
 .dash-link-icon { flex: none; }
 
+.dash-hero-row__value { display: flex; align-items: center; gap: 0.6rem; }
+.dash-hero-row__value img { width: 3rem; height: 2.25rem; object-fit: cover; border-radius: 4px; flex: none; }
+.dash-hero-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr)); max-height: 50dvh; overflow: auto; }
+.dash-hero-grid__photo { display: block; width: 100%; aspect-ratio: 4 / 3; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: var(--admin-raised); cursor: pointer; }
+.dash-hero-grid__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
+.dash-hero-grid__photo[aria-pressed="true"] { outline: 3px solid var(--admin-accent); outline-offset: 2px; }
+
````

---
