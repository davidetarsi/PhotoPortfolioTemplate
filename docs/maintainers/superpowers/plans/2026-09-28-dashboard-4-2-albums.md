# Dashboard in React, piano 4.2: album — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The albums of the new dashboard: autosave into the draft with the publishing rules, the list of changes, the gallery (covers, new album, order), the open album (title, subtitle, photos, cover, order, delete) and uploads compressed in the browser to the waiting area.

**Architecture:** Screens read the draft with TanStack Query and change it through one save queue (no screen calls fetch to save). The queue and the publish bar enforce the spec's two-way rule: nothing is saved while publishing (changes wait in memory), and publishing starts only after what waits is saved and no upload runs. Photos are shown through the Worker's preview route (waiting photo first, then published). The reusable modules of the old dashboard (`src/admin/pipeline.js`, `encoder.js`, `upload-manager.js`, `naming.js`, `sortable.js`) are imported from where they are; plan 4.4 moves them to `src/dashboard/lib/` when it removes the old dashboard.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vitest 4 + Testing Library.

**Spec:** `docs/maintainers/superpowers/specs/2026-09-27-dashboard-react-design.md` — "Dashboard" (Schermate: Album, Album aperto), "Bozza e pubblicazione", "Scelte fatte scrivendo il piano 2" (empty manifest for a new album; no saves while publishing), "Da portare nei piani 4.2–4.4" (theme, changes list, autosave rules, local form state).

## Global Constraints

- Branch `feat/dashboard-react`. Never commit on `main`, never push (the controller pushes).
- Commit messages: subject, blank line, the two trailer lines, with the heredoc shown in each task.
- Stage files by name only (each task's list): never `git add -A` or `git add .`. The untracked `wrangler.json` stays untracked; `.superpowers/` is git-ignored.
- Work only inside `/srv/claude/workspaces/`. Do not read or print credentials.
- Code, comments and test names in English. Visible copy only in `config/texts.config.js` and `config/texts.it.js`, same keys in both.
- The plan was built on a disposable copy, checked in real Chromium (gallery with covers, open album, a real PNG compressed to WebP by the browser and accepted, desktop and phone, no console errors), then replayed task by task from a clean checkout. Each task's files are **ready snapshots** in `/srv/claude/workspaces/qa-browser/p42/t<N>/` (lists: `TESTS` = tests and test helpers, copied first; `IMPL` = the rest). Copy them, never edit them. The diff of each task below is the authoritative description of the change.
- Baseline before Task 1: 95 test files, 747 passed, 1 skipped.

---

### Task 1: Theme follow-ups

From the plan 4.1 review: muted text at 70% of the ink (contrast about 5:1 on light paper), `:root` read also in selector lists and inside `@layer`, light or dark told also from `rgb()` colours or, when the background cannot be read, from the text.

**Files:** `src/dashboard/styles/tokens.css`, `src/utils/adminTheme.js`, `src/utils/adminTheme.test.js`

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t1/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t1/$f" "$f"; done
```

Run: `npm test` → 2 tests fail.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t1/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t1/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 95 files, 749 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "act("` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/styles/tokens.css src/utils/adminTheme.js src/utils/adminTheme.test.js
git commit -F - <<'EOF'
fix(dashboard): theme follow-ups — contrast, :root in lists and layers, rgb colours

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The change (diff):**

````diff
diff --git a/src/dashboard/styles/tokens.css b/src/dashboard/styles/tokens.css
index 428958a..30db301 100644
--- a/src/dashboard/styles/tokens.css
+++ b/src/dashboard/styles/tokens.css
@@ -8,7 +8,7 @@
   --admin-surface: color-mix(in srgb, var(--admin-bg) 95%, var(--admin-ink));
   --admin-raised: color-mix(in srgb, var(--admin-bg) 88%, var(--admin-ink));
   --admin-line: color-mix(in srgb, var(--admin-bg) 84%, var(--admin-ink));
-  --admin-muted: color-mix(in srgb, var(--admin-ink) 60%, var(--admin-bg));
+  --admin-muted: color-mix(in srgb, var(--admin-ink) 70%, var(--admin-bg));
   --admin-accent: #e3b341;
   --admin-on-accent: #141517;
   --admin-ok: #5fb38a;
diff --git a/src/utils/adminTheme.js b/src/utils/adminTheme.js
index ea64037..a8d749b 100644
--- a/src/utils/adminTheme.js
+++ b/src/utils/adminTheme.js
@@ -22,21 +22,37 @@ export const ADMIN_TOKEN_MAP = Object.freeze({
 });
 
 const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
+const RGB_RE = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i;
 
-/** Relative luminance of a #rgb / #rrggbb colour (WCAG), or null for anything else. */
+/** The 0–255 channels of a #rgb, #rrggbb or rgb()/rgba() colour, or null for anything else. */
+function channels(color) {
+  const value = color.trim();
+  const hex = HEX_RE.exec(value);
+  if (hex) {
+    const full = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
+    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
+  }
+  const rgb = RGB_RE.exec(value);
+  return rgb ? rgb.slice(1, 4).map(Number) : null;
+}
+
+/** Relative luminance of a colour (WCAG), or null when it cannot be read. */
 function luminance(color) {
-  const match = HEX_RE.exec(color.trim());
-  if (!match) return null;
-  const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
-  const [r, g, b] = [0, 2, 4].map(i => {
-    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
+  const rgb = channels(color);
+  if (!rgb) return null;
+  const [r, g, b] = rgb.map(v => {
+    const c = v / 255;
     return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
   });
   return 0.2126 * r + 0.7152 * g + 0.0722 * b;
 }
 
-/** Bodies of the top-level `:root { … }` rules (not those inside @media or other blocks). */
-function topLevelRootBodies(css) {
+/**
+ * Bodies of the rules that apply to `:root` everywhere: a selector list that names `:root`
+ * (`:root, html { … }`), also inside `@layer` blocks; never inside @media, @supports or a
+ * compound selector (`[data-theme] :root`), which apply only sometimes.
+ */
+function rootBodies(css) {
   const bodies = [];
   let depth = 0;
   let selectorStart = 0;
@@ -53,11 +69,13 @@ function topLevelRootBodies(css) {
     } else if (c === '}') {
       depth--;
       if (depth === 0) {
-        if (selector === ':root') bodies.push(css.slice(bodyStart, i));
+        const body = css.slice(bodyStart, i);
+        if (/^@layer\b/.test(selector)) bodies.push(...rootBodies(body));
+        else if (selector.split(',').some(part => part.trim() === ':root')) bodies.push(body);
         selectorStart = i + 1;
       }
     } else if (c === ';' && depth === 0) {
-      selectorStart = i + 1; // an @import or @charset before the rules
+      selectorStart = i + 1; // an @import, @charset or @layer list before the rules
     }
   }
   return bodies;
@@ -73,9 +91,9 @@ const LIGHT_STATUS = { '--admin-ok': '#2e7d4f', '--admin-danger': '#b3261e' };
  * taken as they are and win over mapped ones. Values that depend on other variables
  * (`var(…)`) are skipped: the dashboard does not load the site's theme.
  * The other surfaces (panels, lines, muted text) follow from background and text in
- * src/dashboard/styles/tokens.css. With a hex background the tokens also say whether the
- * theme is light or dark (`--admin-scheme`), with status colours readable on it; with a
- * hex accent, the text on it is chosen dark or light for contrast.
+ * src/dashboard/styles/tokens.css. When background or text can be read (hex or rgb()), the
+ * tokens also say whether the theme is light or dark (`--admin-scheme`), with status colours
+ * readable on it; with a readable accent, the text on it is chosen dark or light for contrast.
  * @param {string} cssText
  * @returns {Record<string, string>} Dashboard custom properties.
  */
@@ -83,7 +101,7 @@ export function adminThemeTokens(cssText) {
   const mapped = {};
   const explicit = {};
   const withoutComments = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
-  for (const body of topLevelRootBodies(withoutComments)) {
+  for (const body of rootBodies(withoutComments)) {
     for (const [, name, rawValue] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) {
       const value = rawValue.trim();
       if (!value || value.includes('var(')) continue;
@@ -92,9 +110,12 @@ export function adminThemeTokens(cssText) {
     }
   }
   const tokens = { ...mapped, ...explicit };
+  // Light or dark: from the background, or, when it cannot be read, from the text
+  // (dark text means a light theme).
   const bg = tokens['--admin-bg'] ? luminance(tokens['--admin-bg']) : null;
-  if (bg !== null) {
-    const light = bg > 0.35;
+  const ink = tokens['--admin-ink'] ? luminance(tokens['--admin-ink']) : null;
+  const light = bg !== null ? bg > 0.35 : ink !== null ? ink < 0.35 : null;
+  if (light !== null) {
     if (!tokens['--admin-scheme']) tokens['--admin-scheme'] = light ? 'light' : 'dark';
     if (light) for (const [name, value] of Object.entries(LIGHT_STATUS)) tokens[name] ??= value;
   }
diff --git a/src/utils/adminTheme.test.js b/src/utils/adminTheme.test.js
index 2ac787a..f6ee63f 100644
--- a/src/utils/adminTheme.test.js
+++ b/src/utils/adminTheme.test.js
@@ -56,9 +56,21 @@ describe('adminThemeTokens', () => {
     expect(adminThemeTokens(':root { --color-accent: #fc0; }')['--admin-on-accent']).toBe('#141517');
   });
 
-  it('skips values that depend on other variables, and non-hex accents get no computed text colour', () => {
-    expect(adminThemeTokens(':root { --color-bg: var(--paper); --color-accent: rgb(1 2 3); }'))
-      .toEqual({ '--admin-accent': 'rgb(1 2 3)' });
+  it('skips values that depend on other variables; colours it cannot read get no computed text colour', () => {
+    expect(adminThemeTokens(':root { --color-bg: var(--paper); --color-accent: hsl(0 0% 1%); }'))
+      .toEqual({ '--admin-accent': 'hsl(0 0% 1%)' });
+  });
+
+  it('reads :root in a selector list and inside @layer', () => {
+    expect(adminThemeTokens(':root, html { --color-accent: #111111; }')['--admin-accent']).toBe('#111111');
+    expect(adminThemeTokens('@layer base, theme; @layer theme { :root { --color-accent: #222222; } }')['--admin-accent']).toBe('#222222');
+  });
+
+  it('tells light from dark with rgb() colours, or from the text when the background cannot be read', () => {
+    expect(adminThemeTokens(':root { --color-bg: rgb(248 243 230); }')['--admin-scheme']).toBe('light');
+    expect(adminThemeTokens(':root { --color-bg: rgb(16, 17, 18); }')['--admin-scheme']).toBe('dark');
+    expect(adminThemeTokens(':root { --color-bg: oklch(97% 0.02 90); --color-text: #15304a; }')['--admin-scheme']).toBe('light');
+    expect(adminThemeTokens(':root { --color-accent: rgb(176 36 95); }')['--admin-on-accent']).toBe('#ffffff');
   });
 
   it('no :root, no tokens', () => {
````

---

### Task 2: Autosave with the publishing rules, and the list of changes

`src/dashboard/api/save-queue.js` keeps the latest value of each draft resource ('albums', 'manifest:<slug>', later 'site'), saves 800 ms after the last change in first-changed order, retries after an error, and can be paused, cleared, flushed. `drafts.jsx` connects it to React (`SaveQueueProvider`, `useSaveQueue`, `useSaveState`, `useAlbums`, `useManifest`): a change shows at once and is saved in the background; while something waits, a refetch on focus never overwrites it; leaving the page with unsaved changes asks first. Publish flushes the queue first, pauses it while publishing, resumes after (changes made meanwhile are saved then); Discard drops what waits. The top bar says Saving…, Not saved (with Retry), Draft saved, Everything published. Touching the count opens the list of changes. `upload()` in the client sends a WebP blob.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/dashboard/App.jsx`, `src/dashboard/App.test.jsx`, `src/dashboard/api/client.js`, `src/dashboard/api/drafts.jsx`, `src/dashboard/api/drafts.test.jsx`, `src/dashboard/api/queries.js`, `src/dashboard/api/save-context.js`, `src/dashboard/api/save-queue.js`, `src/dashboard/api/save-queue.test.js`, `src/dashboard/app.css`, `src/dashboard/features/publish/PublishBar.jsx`, `src/dashboard/features/publish/PublishBar.test.jsx`, `src/dashboard/features/publish/publish.css`, `src/dashboard/main.jsx`, `src/dashboard/test-utils.jsx`

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t2/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t2/$f" "$f"; done
```

Run: `npm test` → 6 files fail (new modules missing, providers changed).

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t2/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t2/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 97 files, 763 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "act("` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/dashboard/App.jsx src/dashboard/App.test.jsx src/dashboard/api/client.js src/dashboard/api/drafts.jsx src/dashboard/api/drafts.test.jsx src/dashboard/api/queries.js src/dashboard/api/save-context.js src/dashboard/api/save-queue.js src/dashboard/api/save-queue.test.js src/dashboard/app.css src/dashboard/features/publish/PublishBar.jsx src/dashboard/features/publish/PublishBar.test.jsx src/dashboard/features/publish/publish.css src/dashboard/main.jsx src/dashboard/test-utils.jsx
git commit -F - <<'EOF'
feat(dashboard): autosave that respects publishing, and the list of changes

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index a47e0e8..b0b2f98 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -88,6 +88,19 @@ export const texts = {
       problemHero: 'Home image {name} is not in the album {album}.',
       failed: 'Publishing stopped: {message}. Press Publish to resume.',
       noProgress: 'Publishing is not moving forward. Try again in a few minutes.',
+      saving: 'Saving…',
+      saveFailed: 'Not saved: {message}',
+      retry: 'Retry',
+      changesTitle: 'What publishing changes',
+      close: 'Close',
+      changeSite: 'Name, bio, links or page texts',
+      changeAlbumsReordered: 'Albums in a new order',
+      changeAlbumAdded: 'New album: {album}',
+      changeAlbumRemoved: 'Album deleted: {album}',
+      changeAlbumChanged: 'Album changed: {album}',
+      changePhotosAdded: '{album}: {n} new photos',
+      changePhotosRemoved: '{album}: {n} photos removed',
+      changePhotosReordered: '{album}: photos in a new order',
     },
     site: {
       sectionTitle: 'Site',
diff --git a/config/texts.it.js b/config/texts.it.js
index 910ba41..0e0f14a 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -86,6 +86,19 @@ export const texts = {
       problemHero: 'L\'immagine della home {name} non è nell\'album {album}.',
       failed: 'Pubblicazione interrotta: {message}. Premi Pubblica per riprendere.',
       noProgress: 'La pubblicazione non va avanti. Riprova tra qualche minuto.',
+      saving: 'Salvataggio…',
+      saveFailed: 'Non salvato: {message}',
+      retry: 'Riprova',
+      changesTitle: 'Cosa cambia pubblicando',
+      close: 'Chiudi',
+      changeSite: 'Nome, bio, link o testi delle pagine',
+      changeAlbumsReordered: 'Album in un nuovo ordine',
+      changeAlbumAdded: 'Nuovo album: {album}',
+      changeAlbumRemoved: 'Album eliminato: {album}',
+      changeAlbumChanged: 'Album modificato: {album}',
+      changePhotosAdded: '{album}: {n} foto nuove',
+      changePhotosRemoved: '{album}: {n} foto tolte',
+      changePhotosReordered: '{album}: foto in un nuovo ordine',
     },
     site: {
       sectionTitle: 'Sito',
diff --git a/src/dashboard/App.jsx b/src/dashboard/App.jsx
index be3c4d8..bfe30b0 100644
--- a/src/dashboard/App.jsx
+++ b/src/dashboard/App.jsx
@@ -1,6 +1,8 @@
 import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router';
 import { texts } from '../../config/texts.config.js';
+import { formatText } from '../utils/formatText.js';
 import { useDraft, useDraftStatus } from './api/queries.js';
+import { useSaveQueue, useSaveState } from './api/drafts.jsx';
 import { Icon } from './ui/Icon.jsx';
 import { PublishBar } from './features/publish/PublishBar.jsx';
 import { AlbumsScreen } from './features/albums/AlbumsScreen.jsx';
@@ -26,13 +28,29 @@ export const routes = [
   },
 ];
 
-/** Whether the draft is saved or everything is published: shown in the top bar. */
-function DraftState() {
+/**
+ * Saving, not saved (with Retry), draft saved, or everything published: shown in the top bar.
+ */
+export function DraftState() {
   const { data } = useDraftStatus();
+  const queue = useSaveQueue();
+  const save = useSaveState();
+  if (save.error) {
+    return (
+      <span className="dash-state dash-state--error" role="alert">
+        <span className="dash-state__dot" aria-hidden="true" />
+        {formatText(t.publish.saveFailed, { message: save.error.message })}
+        <button type="button" className="dash-state__retry" onClick={() => queue.flush()}>{t.publish.retry}</button>
+      </span>
+    );
+  }
+  if (save.pending > 0 || save.saving) {
+    return <span className="dash-state dash-state--draft" role="status"><span className="dash-state__dot" aria-hidden="true" />{t.publish.saving}</span>;
+  }
   if (!data) return null;
   const draft = data.hasDraft || data.publishing;
   return (
-    <span className={`dash-state${draft ? ' dash-state--draft' : ''}`}>
+    <span className={`dash-state${draft ? ' dash-state--draft' : ''}`} role="status">
       <span className="dash-state__dot" aria-hidden="true" />
       {draft ? t.publish.draftSaved : t.publish.allPublished}
     </span>
diff --git a/src/dashboard/App.test.jsx b/src/dashboard/App.test.jsx
index 29d8ad7..f511bd4 100644
--- a/src/dashboard/App.test.jsx
+++ b/src/dashboard/App.test.jsx
@@ -1,15 +1,15 @@
 import { beforeAll, describe, expect, it } from 'vitest';
-import { fireEvent, render, screen, waitFor } from '@testing-library/react';
-import { QueryClientProvider } from '@tanstack/react-query';
+import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
 import { createMemoryRouter, RouterProvider } from 'react-router';
 import { texts } from '../../config/texts.config.js';
-import { routes } from './App.jsx';
-import { fakeWorker, installDialogPolyfill, makeQueryClient } from './test-utils.jsx';
+import { DraftState, routes } from './App.jsx';
+import { useSaveQueue } from './api/drafts.jsx';
+import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers, renderWithQuery } from './test-utils.jsx';
 
 /** The whole dashboard at a hash path, e.g. '/album/notte', with the real routes in memory. */
 function renderDashboard(path = '/') {
   const router = createMemoryRouter(routes, { initialEntries: [path] });
-  return { router, ...render(<QueryClientProvider client={makeQueryClient()}><RouterProvider router={router} /></QueryClientProvider>) };
+  return { router, ...render(<Providers client={makeQueryClient()}><RouterProvider router={router} /></Providers>) };
 }
 
 beforeAll(installDialogPolyfill);
@@ -45,6 +45,23 @@ describe('dashboard frame', () => {
     await waitFor(() => expect(router.state.location.pathname).toBe('/'));
   });
 
+  it('the state says saving, then not saved with Retry when a save fails, then saved', async () => {
+    fakeWorker({
+      'GET /api/admin/draft/status': [STATUS, { hasDraft: true, publishing: false, changes: [] }],
+      'PUT /api/admin/draft/albums': [{ status: 500, body: { error: 'STORAGE_ERROR' } }, { ok: true }],
+    });
+    let queue;
+    function WithQueue() { queue = useSaveQueue(); return <DraftState />; }
+    renderWithQuery(<WithQueue />);
+    await screen.findByText(texts.admin.publish.allPublished);
+    act(() => { queue.set('albums', { albums: [] }); });
+    expect(screen.getByText(texts.admin.publish.saving)).toBeTruthy();
+    await act(() => queue.flush());
+    expect(screen.getByRole('alert').textContent).toContain('STORAGE_ERROR');
+    fireEvent.click(screen.getByRole('button', { name: texts.admin.publish.retry }));
+    expect(await screen.findByText(texts.admin.publish.draftSaved)).toBeTruthy();
+  });
+
   it('says so when the draft cannot be loaded', async () => {
     fakeWorker({ 'GET /api/admin/draft/status': STATUS });
     renderDashboard('/');
diff --git a/src/dashboard/api/client.js b/src/dashboard/api/client.js
index 957562b..f25e1e6 100644
--- a/src/dashboard/api/client.js
+++ b/src/dashboard/api/client.js
@@ -16,6 +16,25 @@ export class ApiError extends Error {
   }
 }
 
+/**
+ * Sends a photo (a WebP blob) with PUT, e.g. to /api/admin/staging/<slug>/<name>.
+ * @param {string} path
+ * @param {Blob} blob
+ * @param {{fetchImpl?: Function}} [options]
+ */
+export async function upload(path, blob, { fetchImpl = globalThis.fetch } = {}) {
+  let res;
+  try {
+    res = await fetchImpl(path, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: blob });
+  } catch {
+    throw new ApiError(0, { error: 'NETWORK' });
+  }
+  if (res.ok) return;
+  let body = {};
+  try { body = await res.json(); } catch { /* not JSON */ }
+  throw new ApiError(res.status, body);
+}
+
 /**
  * @param {string} path - Absolute path, e.g. '/api/admin/draft'.
  * @param {{method?: string, json?: any, fetchImpl?: Function}} [options]
diff --git a/src/dashboard/api/drafts.jsx b/src/dashboard/api/drafts.jsx
new file mode 100644
index 0000000..d3d9d4e
--- /dev/null
+++ b/src/dashboard/api/drafts.jsx
@@ -0,0 +1,93 @@
+/**
+ * The draft seen by the screens: albums and manifests read with TanStack Query and changed
+ * through the save queue. A change shows at once (the query's data is updated in place)
+ * and is saved in the background; while something is waiting, a refetch never overwrites it.
+ */
+import { useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
+import { useQuery, useQueryClient } from '@tanstack/react-query';
+import { request } from './client.js';
+import { keys } from './queries.js';
+import { createSaveQueue } from './save-queue.js';
+import { SaveQueueContext } from './save-context.js';
+
+export { SaveQueueContext };
+
+/** Where each queued resource is saved. */
+export function savePath(key) {
+  if (key === 'albums') return '/api/admin/draft/albums';
+  if (key === 'site') return '/api/admin/draft/site';
+  if (key.startsWith('manifest:')) return `/api/admin/draft/albums/${key.slice('manifest:'.length)}/manifest`;
+  throw new Error(`Unknown draft resource "${key}"`);
+}
+
+/** Provides the save queue to the dashboard; warns before leaving with unsaved changes. */
+export function SaveQueueProvider({ children, delay }) {
+  const client = useQueryClient();
+  const queue = useMemo(() => createSaveQueue({
+    delay,
+    save: (key, value) => request(savePath(key), { method: 'PUT', json: value }),
+    onSaved: () => client.invalidateQueries({ queryKey: keys.status }),
+  }), [client, delay]);
+
+  useEffect(() => {
+    const onBeforeUnload = event => {
+      if (!queue.busy()) return;
+      event.preventDefault();
+      event.returnValue = '';
+    };
+    window.addEventListener('beforeunload', onBeforeUnload);
+    return () => window.removeEventListener('beforeunload', onBeforeUnload);
+  }, [queue]);
+
+  return <SaveQueueContext.Provider value={queue}>{children}</SaveQueueContext.Provider>;
+}
+
+/** The save queue itself (set, flush, pause, resume). */
+export function useSaveQueue() {
+  const queue = useContext(SaveQueueContext);
+  if (!queue) throw new Error('useSaveQueue needs a <SaveQueueProvider>');
+  return queue;
+}
+
+/** The queue's state, re-rendering when it changes: { pending, saving, paused, error }. */
+export function useSaveState() {
+  const queue = useSaveQueue();
+  return useSyncExternalStore(queue.subscribe, queue.getState);
+}
+
+/** Refetch on focus only when nothing is waiting to be saved (else it would undo edits). */
+export function useRefetchGuard() {
+  const queue = useContext(SaveQueueContext);
+  return () => !queue?.busy();
+}
+
+/** The draft's albums and a setter that shows the change at once and saves it. */
+export function useAlbums() {
+  const client = useQueryClient();
+  const queue = useSaveQueue();
+  const guard = useRefetchGuard();
+  const draft = useQuery({ queryKey: keys.draft, queryFn: () => request('/api/admin/draft'), refetchOnWindowFocus: guard });
+  const setAlbums = (albums, options) => {
+    client.setQueryData(keys.draft, old => ({ ...old, albums }));
+    queue.set('albums', { albums }, options);
+  };
+  return { ...draft, albums: draft.data?.albums, setAlbums };
+}
+
+/** One album's photos in the draft, and a setter that shows the change at once and saves it. */
+export function useManifest(slug) {
+  const client = useQueryClient();
+  const queue = useSaveQueue();
+  const guard = useRefetchGuard();
+  const manifest = useQuery({
+    queryKey: keys.manifest(slug),
+    queryFn: () => request(`/api/admin/draft/albums/${slug}/manifest`),
+    enabled: Boolean(slug),
+    refetchOnWindowFocus: guard,
+  });
+  const setManifest = (entries, options) => {
+    client.setQueryData(keys.manifest(slug), entries);
+    queue.set(`manifest:${slug}`, entries, options);
+  };
+  return { ...manifest, photos: manifest.data, setManifest };
+}
diff --git a/src/dashboard/api/drafts.test.jsx b/src/dashboard/api/drafts.test.jsx
new file mode 100644
index 0000000..5d4c7fa
--- /dev/null
+++ b/src/dashboard/api/drafts.test.jsx
@@ -0,0 +1,49 @@
+import { describe, expect, it } from 'vitest';
+import { act, renderHook, waitFor } from '@testing-library/react';
+import { savePath, useAlbums, useManifest, useSaveQueue, useSaveState } from './drafts.jsx';
+import { fakeWorker, makeQueryClient, Providers } from '../test-utils.jsx';
+
+const DRAFT = { site: { name: 'D', bio: '', hero: null }, albums: [{ slug: 'notte', title: 'Notte', description: '', coverName: null }], hasDraft: false };
+const wrapper = client => ({ children }) => <Providers client={client}>{children}</Providers>;
+
+describe('savePath', () => {
+  it('maps each resource to its draft route', () => {
+    expect(savePath('albums')).toBe('/api/admin/draft/albums');
+    expect(savePath('site')).toBe('/api/admin/draft/site');
+    expect(savePath('manifest:notte')).toBe('/api/admin/draft/albums/notte/manifest');
+    expect(() => savePath('other')).toThrow();
+  });
+});
+
+describe('useAlbums', () => {
+  it('shows a change at once and saves it through the queue', async () => {
+    const fetchMock = fakeWorker({ 'GET /api/admin/draft': DRAFT, 'PUT /api/admin/draft/albums': { ok: true } });
+    const { result } = renderHook(() => ({ ...useAlbums(), queue: useSaveQueue(), save: useSaveState() }), { wrapper: wrapper(makeQueryClient()) });
+    await waitFor(() => expect(result.current.albums).toHaveLength(1));
+    const renamed = [{ ...DRAFT.albums[0], title: 'Notte in montagna' }];
+    act(() => { result.current.setAlbums(renamed); });
+    await waitFor(() => expect(result.current.albums[0].title).toBe('Notte in montagna'));
+    expect(result.current.save.pending).toBe(1);
+    await act(() => result.current.queue.flush());
+    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
+    expect(put[0]).toBe('/api/admin/draft/albums');
+    expect(JSON.parse(put[1].body)).toEqual({ albums: renamed });
+  });
+});
+
+describe('useManifest', () => {
+  it('reads the draft manifest and saves changes under its album', async () => {
+    const fetchMock = fakeWorker({
+      // An array of answers is a queue: a manifest (itself an array) goes inside one.
+      'GET /api/admin/draft/albums/notte/manifest': [[{ name: 'a.webp', width: 4, height: 3 }]],
+      'PUT /api/admin/draft/albums/notte/manifest': { ok: true },
+    });
+    const { result } = renderHook(() => ({ ...useManifest('notte'), queue: useSaveQueue() }), { wrapper: wrapper(makeQueryClient()) });
+    await waitFor(() => expect(result.current.photos).toHaveLength(1));
+    act(() => { result.current.setManifest([]); });
+    // The query tells its components on the next tick.
+    await waitFor(() => expect(result.current.photos).toEqual([]));
+    await act(() => result.current.queue.flush());
+    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft/albums/notte/manifest' && init?.method === 'PUT')).toBe(true);
+  });
+});
diff --git a/src/dashboard/api/queries.js b/src/dashboard/api/queries.js
index 045c10b..2cf2163 100644
--- a/src/dashboard/api/queries.js
+++ b/src/dashboard/api/queries.js
@@ -2,8 +2,10 @@
  * TanStack Query hooks for the draft and the publication. Screens read with these hooks
  * and never call fetch themselves.
  */
+import { useContext } from 'react';
 import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
 import { ApiError, request } from './client.js';
+import { SaveQueueContext } from './save-context.js';
 
 /** Steps in a row without fewer photos left: the publication is stuck, stop asking. */
 export const MAX_STEPS_WITHOUT_PROGRESS = 3;
@@ -19,7 +21,9 @@ const isDraftQuery = query => String(query.queryKey[0]).startsWith('draft');
 
 /** The draft's site and album list ({ site, albums, hasDraft }). */
 export function useDraft() {
-  return useQuery({ queryKey: keys.draft, queryFn: () => request('/api/admin/draft') });
+  // Never refetched over changes still waiting to be saved (see drafts.jsx).
+  const queue = useContext(SaveQueueContext);
+  return useQuery({ queryKey: keys.draft, queryFn: () => request('/api/admin/draft'), refetchOnWindowFocus: () => !queue?.busy() });
 }
 
 /** What publishing would change ({ hasDraft, publishing, changes }). */
diff --git a/src/dashboard/api/save-context.js b/src/dashboard/api/save-context.js
new file mode 100644
index 0000000..1e193ab
--- /dev/null
+++ b/src/dashboard/api/save-context.js
@@ -0,0 +1,4 @@
+import { createContext } from 'react';
+
+/** The dashboard's save queue (see save-queue.js), provided by <SaveQueueProvider>. */
+export const SaveQueueContext = createContext(null);
diff --git a/src/dashboard/api/save-queue.js b/src/dashboard/api/save-queue.js
new file mode 100644
index 0000000..1a0ba3a
--- /dev/null
+++ b/src/dashboard/api/save-queue.js
@@ -0,0 +1,113 @@
+/**
+ * The draft's autosave. Every change is queued under the resource it touches ('albums',
+ * 'manifest:<slug>', later 'site'); only the latest value of each resource is kept, and
+ * the queue saves them 800 ms after the last change, in the order they were first queued
+ * (an album is created before its manifest is written).
+ *
+ * Two rules tie it to publishing (spec, "Da portare nei piani 4.2–4.4"):
+ * - before publishing, `flush()` saves what is waiting, so the draft published is complete;
+ * - while publishing, the queue is `paused`: changes are kept in memory, not saved, and are
+ *   saved once `resume()` is called — never lost, never written during the publication.
+ *
+ * Plain JavaScript (no React): src/dashboard/api/drafts.jsx connects it to the screens.
+ */
+
+/** Wait after the last change before saving. */
+export const SAVE_DELAY_MS = 800;
+
+/**
+ * @param {{save: (key: string, value: any) => Promise<void>, delay?: number,
+ *   onSaved?: (key: string) => void}} options
+ */
+export function createSaveQueue({ save, delay = SAVE_DELAY_MS, onSaved }) {
+  const pending = new Map(); // key → latest value, in first-queued order
+  const listeners = new Set();
+  let saving = false;
+  let paused = false;
+  let error = null; // { key, message }
+  let timer = null;
+  let running = null; // the promise of the flush in progress
+  let state = { pending: 0, saving: false, paused: false, error: null };
+
+  const notify = () => {
+    state = { pending: pending.size, saving, paused, error };
+    for (const listener of listeners) listener();
+  };
+  const schedule = () => {
+    clearTimeout(timer);
+    timer = paused ? null : setTimeout(() => { flush(); }, delay);
+  };
+
+  async function run() {
+    saving = true;
+    notify();
+    try {
+      while (pending.size > 0 && !paused) {
+        const [key, value] = pending.entries().next().value;
+        pending.delete(key);
+        try {
+          await save(key, value);
+          error = null;
+          onSaved?.(key);
+        } catch (e) {
+          // Keep the change for the next try, unless a newer one arrived meanwhile.
+          if (!pending.has(key)) pending.set(key, value);
+          error = { key, message: e?.message ?? String(e) };
+          return;
+        }
+      }
+    } finally {
+      saving = false;
+      notify();
+    }
+  }
+
+  /** Saves everything waiting now. Resolves when done (or at the first error). */
+  function flush() {
+    clearTimeout(timer);
+    timer = null;
+    if (paused) return Promise.resolve();
+    if (!running) running = run().finally(() => { running = null; });
+    return running.then(() => (pending.size > 0 && !paused && !error ? flush() : undefined));
+  }
+
+  return {
+    /** Queues the latest value of a resource; saved after the delay, or now with { now: true }. */
+    set(key, value, { now = false } = {}) {
+      pending.set(key, value); // an existing key keeps its place in the order
+      notify();
+      if (now) flush(); else schedule();
+    },
+    flush,
+    /** Holds every save (a publication is running). Changes keep accumulating. */
+    pause() {
+      paused = true;
+      clearTimeout(timer);
+      timer = null;
+      notify();
+    },
+    /** Saves again, starting with what accumulated while paused. */
+    resume() {
+      paused = false;
+      notify();
+      if (pending.size > 0) schedule();
+    },
+    /** Drops what is waiting (the draft is being discarded). A save already running finishes. */
+    clear() {
+      clearTimeout(timer);
+      timer = null;
+      pending.clear();
+      error = null;
+      notify();
+    },
+    /** Resolves once no save is running. */
+    whenIdle: () => running ?? Promise.resolve(),
+    /** True while something is waiting or being saved: the screens must not overwrite it. */
+    busy: () => pending.size > 0 || saving,
+    getState: () => state,
+    subscribe(listener) {
+      listeners.add(listener);
+      return () => listeners.delete(listener);
+    },
+  };
+}
diff --git a/src/dashboard/api/save-queue.test.js b/src/dashboard/api/save-queue.test.js
new file mode 100644
index 0000000..8fe7b2a
--- /dev/null
+++ b/src/dashboard/api/save-queue.test.js
@@ -0,0 +1,92 @@
+// @vitest-environment node
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { createSaveQueue, SAVE_DELAY_MS } from './save-queue.js';
+
+beforeEach(() => vi.useFakeTimers());
+afterEach(() => vi.useRealTimers());
+
+function makeQueue(saveImpl = async () => {}) {
+  const saved = [];
+  const save = vi.fn(async (key, value) => { await saveImpl(key, value); saved.push([key, value]); });
+  return { queue: createSaveQueue({ save }), save, saved };
+}
+
+describe('createSaveQueue', () => {
+  it('saves after the delay, only the latest value of each resource', async () => {
+    const { queue, saved } = makeQueue();
+    queue.set('albums', 1);
+    queue.set('albums', 2);
+    expect(queue.getState().pending).toBe(1);
+    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
+    expect(saved).toEqual([]);
+    await vi.advanceTimersByTimeAsync(1);
+    expect(saved).toEqual([['albums', 2]]);
+    expect(queue.getState()).toEqual({ pending: 0, saving: false, paused: false, error: null });
+  });
+
+  it('keeps the order in which resources were first changed', async () => {
+    const { queue, saved } = makeQueue();
+    queue.set('albums', 'with new album');
+    queue.set('manifest:notte', []);
+    queue.set('albums', 'renamed');
+    await queue.flush();
+    expect(saved.map(([key]) => key)).toEqual(['albums', 'manifest:notte']);
+    expect(saved[0][1]).toBe('renamed');
+  });
+
+  it('flush saves at once; busy() says whether anything is waiting or being saved', async () => {
+    const { queue, saved } = makeQueue();
+    expect(queue.busy()).toBe(false);
+    queue.set('albums', 1);
+    expect(queue.busy()).toBe(true);
+    await queue.flush();
+    expect(saved).toEqual([['albums', 1]]);
+    expect(queue.busy()).toBe(false);
+  });
+
+  it('paused: changes wait in memory and are saved after resume, none lost', async () => {
+    const { queue, saved } = makeQueue();
+    queue.pause();
+    queue.set('albums', 'during the publication');
+    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
+    await queue.flush();
+    expect(saved).toEqual([]);
+    expect(queue.getState()).toMatchObject({ pending: 1, paused: true });
+    queue.resume();
+    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
+    expect(saved).toEqual([['albums', 'during the publication']]);
+  });
+
+  it('a failed save keeps the change and reports the error; the next flush retries', async () => {
+    let fail = true;
+    const { queue, saved } = makeQueue(async () => { if (fail) throw new Error('offline'); });
+    queue.set('albums', 1);
+    await queue.flush();
+    expect(queue.getState()).toMatchObject({ pending: 1, error: { key: 'albums', message: 'offline' } });
+    fail = false;
+    await queue.flush();
+    expect(saved).toEqual([['albums', 1]]);
+    expect(queue.getState().error).toBeNull();
+  });
+
+  it('a change made while a save runs is saved right after it', async () => {
+    let release;
+    const { queue, saved } = makeQueue(key => (key === 'albums' && !release ? new Promise(r => { release = r; }) : undefined));
+    queue.set('albums', 1);
+    const first = queue.flush();
+    queue.set('manifest:notte', []);
+    release();
+    await first;
+    expect(saved.map(([key]) => key)).toEqual(['albums', 'manifest:notte']);
+  });
+
+  it('tells subscribers when its state changes', async () => {
+    const { queue } = makeQueue();
+    const listener = vi.fn();
+    const stop = queue.subscribe(listener);
+    queue.set('albums', 1);
+    await queue.flush();
+    expect(listener).toHaveBeenCalled();
+    stop();
+  });
+});
diff --git a/src/dashboard/app.css b/src/dashboard/app.css
index 280ff84..9512b19 100644
--- a/src/dashboard/app.css
+++ b/src/dashboard/app.css
@@ -7,6 +7,9 @@
 .dash-state { display: inline-flex; align-items: center; gap: 0.4rem; font: 0.75rem/1 var(--admin-font-mono); color: var(--admin-muted); }
 .dash-state__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--admin-ok); }
 .dash-state--draft .dash-state__dot { background: var(--admin-accent); }
+.dash-state--error { color: var(--admin-danger); }
+.dash-state--error .dash-state__dot { background: var(--admin-danger); }
+.dash-state__retry { margin-left: 0.4rem; padding: 0; border: 0; background: none; color: var(--admin-accent); font: inherit; text-decoration: underline; cursor: pointer; }
 
 .dash-sections { display: flex; gap: 1.5rem; padding: 0 1.25rem; border-bottom: 1px solid var(--admin-line); }
 .dash-sections__link {
diff --git a/src/dashboard/features/publish/PublishBar.jsx b/src/dashboard/features/publish/PublishBar.jsx
index 087a368..6fbd3a6 100644
--- a/src/dashboard/features/publish/PublishBar.jsx
+++ b/src/dashboard/features/publish/PublishBar.jsx
@@ -2,6 +2,8 @@ import { useEffect, useRef, useState } from 'react';
 import { texts } from '../../../../config/texts.config.js';
 import { formatText } from '../../../utils/formatText.js';
 import { useDiscard, useDraftStatus, usePublish } from '../../api/queries.js';
+import { useSaveQueue, useSaveState } from '../../api/drafts.jsx';
+import { Sheet } from '../../ui/Sheet.jsx';
 import { Button } from '../../ui/Button.jsx';
 import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
 import './publish.css';
@@ -16,6 +18,21 @@ export function describeProblem({ slug, name, reason }) {
   return formatText(template ?? t.problemPhotoMissing, { album: slug, name });
 }
 
+/** One line per change the publication would make. */
+export function describeChange({ type, slug, count }) {
+  const template = {
+    site: t.changeSite,
+    'albums-reordered': t.changeAlbumsReordered,
+    'album-added': t.changeAlbumAdded,
+    'album-removed': t.changeAlbumRemoved,
+    'album-changed': t.changeAlbumChanged,
+    'photos-added': t.changePhotosAdded,
+    'photos-removed': t.changePhotosRemoved,
+    'photos-reordered': t.changePhotosReordered,
+  }[type] ?? type;
+  return formatText(template, { album: slug, n: count });
+}
+
 /**
  * "N changes · Preview · Publish": shown while the draft differs from the published site,
  * or while a publication has to be resumed. Publishes in steps and says what stops it.
@@ -26,6 +43,9 @@ export function PublishBar() {
   const [message, setMessage] = useState(null); // { text, tone: 'ok' | 'error' }
   const [problems, setProblems] = useState([]);
   const [confirming, setConfirming] = useState(false);
+  const [listing, setListing] = useState(false);
+  const queue = useSaveQueue();
+  const saveState = useSaveState();
 
   const publish = usePublish({ onStep: step => setPhotosLeft(step.done ? null : step.remaining) });
   const discard = useDiscard();
@@ -48,10 +68,20 @@ export function PublishBar() {
 
   if (!dirty && !message) return null;
 
-  const onPublish = () => {
+  const onPublish = async () => {
     setMessage(null);
     setProblems([]);
+    // What is still waiting is saved first: the draft published is the one on screen.
+    await queue.flush();
+    const saveError = queue.getState().error;
+    if (saveError) {
+      setMessage({ text: formatText(t.saveFailed, { message: saveError.message }), tone: 'error' });
+      return;
+    }
+    // No save runs during the publication; changes made meanwhile wait and are saved after.
+    queue.pause();
     publish.mutate(undefined, {
+      onSettled: () => queue.resume(),
       onSuccess: () => { setPhotosLeft(null); setMessage({ text: t.published, tone: 'ok' }); },
       onError: error => {
         setPhotosLeft(null);
@@ -62,10 +92,15 @@ export function PublishBar() {
     });
   };
 
-  const onDiscard = () => {
+  const onDiscard = async () => {
     setMessage(null);
     setProblems([]);
+    // Changes waiting to be saved belong to the draft being discarded.
+    queue.pause();
+    queue.clear();
+    await queue.whenIdle();
     discard.mutate(undefined, {
+      onSettled: () => queue.resume(),
       onSuccess: () => { setConfirming(false); setProblems([]); setMessage({ text: t.discarded, tone: 'ok' }); },
       onError: error => {
         setConfirming(false);
@@ -74,7 +109,7 @@ export function PublishBar() {
     });
   };
 
-  const busy = publish.isPending || discard.isPending;
+  const busy = publish.isPending || discard.isPending || saveState.saving;
   const count = changes.length === 1 ? t.changesOne : formatText(t.changesMany, { n: changes.length });
 
   return (
@@ -82,7 +117,9 @@ export function PublishBar() {
       <div className="dash-publish__row">
         <p className="dash-publish__count" role="status">
           {publish.isPending ? (photosLeft ? formatText(t.photosLeft, { n: photosLeft }) : t.publishing)
-            : dirty ? count : message?.text}
+            : dirty && changes.length > 0 ? (
+              <button type="button" className="dash-publish__changes" onClick={() => setListing(true)}>{count}</button>
+            ) : dirty ? count : message?.text}
         </p>
         {dirty && (
           <div className="dash-publish__actions">
@@ -104,6 +141,14 @@ export function PublishBar() {
           <ul>{problems.map(problem => <li key={`${problem.slug}/${problem.name}/${problem.reason}`}>{describeProblem(problem)}</li>)}</ul>
         </div>
       )}
+      <Sheet open={listing} onClose={() => setListing(false)} title={t.changesTitle}>
+        <ul className="dash-publish__list">
+          {changes.map(change => <li key={`${change.type}/${change.slug ?? ''}`}>{describeChange(change)}</li>)}
+        </ul>
+        <div className="dash-confirm__actions">
+          <Button onClick={() => setListing(false)}>{t.close}</Button>
+        </div>
+      </Sheet>
       <ConfirmDialog
         open={confirming}
         title={t.discardTitle}
diff --git a/src/dashboard/features/publish/PublishBar.test.jsx b/src/dashboard/features/publish/PublishBar.test.jsx
index 102b01f..4ffa994 100644
--- a/src/dashboard/features/publish/PublishBar.test.jsx
+++ b/src/dashboard/features/publish/PublishBar.test.jsx
@@ -1,9 +1,9 @@
 import { beforeAll, describe, expect, it } from 'vitest';
 import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
-import { QueryClientProvider } from '@tanstack/react-query';
 import { vi } from 'vitest';
 import { texts } from '../../../../config/texts.config.js';
-import { MESSAGE_MS, PublishBar, describeProblem } from './PublishBar.jsx';
+import { MESSAGE_MS, PublishBar, describeChange, describeProblem } from './PublishBar.jsx';
+import { useSaveQueue } from '../../api/drafts.jsx';
 import { fakeWorker, installDialogPolyfill, makeQueryClient, renderWithQuery } from '../../test-utils.jsx';
 
 const t = texts.admin.publish;
@@ -39,6 +39,60 @@ describe('PublishBar', () => {
     expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
   });
 
+  it('lists what publishing changes when the count is touched', async () => {
+    fakeWorker({ 'GET /api/admin/draft/status': STATUS_DRAFT });
+    renderWithQuery(<PublishBar />);
+    fireEvent.click(await screen.findByRole('button', { name: '2 changes' }));
+    const sheet = await screen.findByRole('dialog', { name: t.changesTitle });
+    expect([...sheet.querySelectorAll('li')].map(li => li.textContent)).toEqual([
+      describeChange({ type: 'site' }), describeChange({ type: 'album-added', slug: 'notte' }),
+    ]);
+    expect(describeChange({ type: 'photos-added', slug: 'notte', count: 3 })).toBe('notte: 3 new photos');
+  });
+
+  it('saves what is waiting before publishing, and holds saves while publishing', async () => {
+    let queue;
+    function WithQueue() { queue = useSaveQueue(); return <PublishBar />; }
+    const order = [];
+    fakeWorker({
+      'GET /api/admin/draft/status': STATUS_DRAFT,
+      'PUT /api/admin/draft/albums': () => { order.push('save'); return { ok: true }; },
+      'POST /api/admin/publish': () => {
+        order.push('publish');
+        // A change made during the publication: it must wait.
+        queue.set('albums', { albums: [] });
+        expect(queue.getState().paused).toBe(true);
+        return { done: true, copied: 0, remaining: 0 };
+      },
+    });
+    renderWithQuery(<WithQueue />);
+    await screen.findByRole('button', { name: t.publish });
+    act(() => { queue.set('albums', { albums: [] }); });
+    fireEvent.click(screen.getByRole('button', { name: t.publish }));
+    expect(await screen.findByText(t.published)).toBeTruthy();
+    expect(order.slice(0, 2)).toEqual(['save', 'publish']);
+    // Resumed: the change made during the publication is saved after it.
+    await waitFor(() => expect(order).toEqual(['save', 'publish', 'save']), { timeout: 3000 });
+  });
+
+  it('discarding drops the changes still waiting to be saved', async () => {
+    let queue;
+    function WithQueue() { queue = useSaveQueue(); return <PublishBar />; }
+    const fetchMock = fakeWorker({
+      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
+      'DELETE /api/admin/draft': { ok: true },
+      'PUT /api/admin/draft/albums': { ok: true },
+    });
+    renderWithQuery(<WithQueue />);
+    await screen.findByRole('button', { name: t.discard });
+    act(() => { queue.set('albums', { albums: [] }); });
+    fireEvent.click(screen.getByRole('button', { name: t.discard }));
+    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
+    expect(await screen.findByText(t.discarded)).toBeTruthy();
+    await act(() => queue.flush());
+    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
+  });
+
   it('lists what stops the publication', async () => {
     fakeWorker({
       'GET /api/admin/draft/status': STATUS_DRAFT,
@@ -111,8 +165,7 @@ describe('PublishBar', () => {
       'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
       'DELETE /api/admin/draft': { ok: true },
     });
-    const client = makeQueryClient();
-    render(<QueryClientProvider client={client}><PublishBar /></QueryClientProvider>);
+    const { client } = renderWithQuery(<PublishBar />);
     fireEvent.click(await screen.findByRole('button', { name: t.discard }));
     fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
     expect(await screen.findByText(t.discarded)).toBeTruthy();
diff --git a/src/dashboard/features/publish/publish.css b/src/dashboard/features/publish/publish.css
index a38fe36..d57177c 100644
--- a/src/dashboard/features/publish/publish.css
+++ b/src/dashboard/features/publish/publish.css
@@ -19,3 +19,9 @@
   .dash-publish__actions { width: 100%; }
   .dash-publish__actions > :last-child { flex: 1; }
 }
+
+.dash-publish__changes {
+  padding: 0; border: 0; background: none; font: inherit; color: inherit;
+  text-decoration: underline dotted; text-underline-offset: 3px; cursor: pointer;
+}
+.dash-publish__list { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.35rem; }
diff --git a/src/dashboard/main.jsx b/src/dashboard/main.jsx
index c248809..0f5f3af 100644
--- a/src/dashboard/main.jsx
+++ b/src/dashboard/main.jsx
@@ -3,6 +3,7 @@ import { createRoot } from 'react-dom/client';
 import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
 import themeTokens from 'virtual:admin-theme';
 import { App } from './App.jsx';
+import { SaveQueueProvider } from './api/drafts.jsx';
 import './styles/tokens.css';
 import './styles/base.css';
 
@@ -25,7 +26,9 @@ const queryClient = new QueryClient({
 createRoot(document.getElementById('admin-root')).render(
   <StrictMode>
     <QueryClientProvider client={queryClient}>
-      <App />
+      <SaveQueueProvider>
+        <App />
+      </SaveQueueProvider>
     </QueryClientProvider>
   </StrictMode>,
 );
diff --git a/src/dashboard/test-utils.jsx b/src/dashboard/test-utils.jsx
index 3c6d1f9..61c40a8 100644
--- a/src/dashboard/test-utils.jsx
+++ b/src/dashboard/test-utils.jsx
@@ -3,6 +3,7 @@
 import { cleanup, render } from '@testing-library/react';
 import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
 import { afterEach, vi } from 'vitest';
+import { SaveQueueProvider } from './api/drafts.jsx';
 
 // Vitest runs without globals, so Testing Library cannot clean up by itself: unmount
 // what each test rendered, and give back the real fetch that fakeWorker replaced.
@@ -23,10 +24,18 @@ export function makeQueryClient() {
   return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
 }
 
-/** Renders one component inside a query cache. */
-export function renderWithQuery(ui) {
-  const client = makeQueryClient();
-  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
+/** The providers of the dashboard (query cache and save queue) around a tree. */
+export function Providers({ client, children }) {
+  return (
+    <QueryClientProvider client={client}>
+      <SaveQueueProvider>{children}</SaveQueueProvider>
+    </QueryClientProvider>
+  );
+}
+
+/** Renders one component inside the dashboard's providers. */
+export function renderWithQuery(ui, client = makeQueryClient()) {
+  return { client, ...render(<Providers client={client}>{ui}</Providers>) };
 }
 
 const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
````

---

### Task 3: Album gallery

Covers (the photo chosen, else the first) through the Worker's preview photo route, number of photos, New album in a sheet (title checked: empty, taken, reserved or custom page), a new album gets an empty manifest in the draft at once (plan-2 rule) and opens; reorder mode with arrows (phones, keyboard) and drag (mouse); `attachSortable` accepts an AbortSignal so the hook can detach.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/admin/sortable.js`, `src/admin/sortable.test.js`, `src/dashboard/api/photos.js`, `src/dashboard/features/albums/AlbumCard.jsx`, `src/dashboard/features/albums/AlbumsScreen.jsx`, `src/dashboard/features/albums/AlbumsScreen.test.jsx`, `src/dashboard/features/albums/NewAlbumSheet.jsx`, `src/dashboard/features/albums/albums.css`, `src/dashboard/features/albums/new-album.js`, `src/dashboard/ui/useSortable.js`

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t3/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t3/$f" "$f"; done
```

Run: `npm test` → 6 tests fail.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t3/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t3/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 98 files, 769 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "act("` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/admin/sortable.js src/admin/sortable.test.js src/dashboard/api/photos.js src/dashboard/features/albums/AlbumCard.jsx src/dashboard/features/albums/AlbumsScreen.jsx src/dashboard/features/albums/AlbumsScreen.test.jsx src/dashboard/features/albums/NewAlbumSheet.jsx src/dashboard/features/albums/albums.css src/dashboard/features/albums/new-album.js src/dashboard/ui/useSortable.js
git commit -F - <<'EOF'
feat(dashboard): the album gallery — covers, new album, order

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index b0b2f98..0be8e87 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -129,6 +129,18 @@ export const texts = {
       deleteNameMismatch: 'The name does not match: deletion cancelled.',
       deleteConfirmPrompt: 'To delete, type the exact album name: "{titolo}"',
       loadError: 'Could not load the albums (network or malformed data).',
+      titleLabel: 'Title',
+      createConfirm: 'Create',
+      cancel: 'Cancel',
+      empty: 'No albums yet: create the first one.',
+      photoCountNone: 'No photos yet',
+      photoCountOne: '1 photo',
+      photoCountMany: '{n} photos',
+      reorder: 'Reorder',
+      reorderDone: 'Done',
+      moveEarlier: 'Move {album} earlier',
+      moveLater: 'Move {album} later',
+      reorderHint: 'Drag the albums, or use the arrows: the order is the one on the site.',
     },
     album: {
       save: 'Save',
diff --git a/config/texts.it.js b/config/texts.it.js
index 0e0f14a..62769ed 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -127,6 +127,18 @@ export const texts = {
       deleteNameMismatch: 'Nome non corrispondente: cancellazione annullata.',
       deleteConfirmPrompt: 'Per eliminare scrivi il nome esatto dell\'album: "{titolo}"',
       loadError: 'Impossibile caricare gli album (rete o dati malformati).',
+      titleLabel: 'Titolo',
+      createConfirm: 'Crea',
+      cancel: 'Annulla',
+      empty: 'Ancora nessun album: crea il primo.',
+      photoCountNone: 'Ancora nessuna foto',
+      photoCountOne: '1 foto',
+      photoCountMany: '{n} foto',
+      reorder: 'Riordina',
+      reorderDone: 'Fatto',
+      moveEarlier: 'Sposta {album} prima',
+      moveLater: 'Sposta {album} dopo',
+      reorderHint: 'Trascina gli album, o usa le frecce: l\'ordine è quello del sito.',
     },
     album: {
       save: 'Salva',
diff --git a/src/admin/sortable.js b/src/admin/sortable.js
index 7d179b4..b57ecf7 100644
--- a/src/admin/sortable.js
+++ b/src/admin/sortable.js
@@ -22,16 +22,17 @@ export function moveItem(arr, from, to) {
  * Children with draggable=true are sortable.
  * @param {HTMLElement} listEl - The container element (typically ul or div).
  * @param {Function} onMove - Callback(fromIndex, toIndex) when item is moved.
+ * @param {AbortSignal} [signal] - Aborting it removes the listeners.
  */
-export function attachSortable(listEl, onMove) {
+export function attachSortable(listEl, onMove, signal) {
   let fromIndex = null;
   const indexOf = el => [...listEl.children].indexOf(el.closest('[draggable]'));
-  listEl.addEventListener('dragstart', e => { fromIndex = indexOf(e.target); });
-  listEl.addEventListener('dragover', e => e.preventDefault());
+  listEl.addEventListener('dragstart', e => { fromIndex = indexOf(e.target); }, { signal });
+  listEl.addEventListener('dragover', e => e.preventDefault(), { signal });
   listEl.addEventListener('drop', e => {
     e.preventDefault();
     const to = indexOf(e.target);
     if (fromIndex !== null && to !== -1 && to !== fromIndex) onMove(fromIndex, to);
     fromIndex = null;
-  });
+  }, { signal });
 }
diff --git a/src/admin/sortable.test.js b/src/admin/sortable.test.js
index aad04ff..66dae48 100644
--- a/src/admin/sortable.test.js
+++ b/src/admin/sortable.test.js
@@ -1,5 +1,5 @@
-import { describe, it, expect } from 'vitest';
-import { moveItem } from './sortable.js';
+import { describe, it, expect, vi } from 'vitest';
+import { attachSortable, moveItem } from './sortable.js';
 
 describe('moveItem', () => {
   it('sposta un elemento senza mutare l\'originale', () => {
@@ -13,3 +13,21 @@ describe('moveItem', () => {
     expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
   });
 });
+
+describe('attachSortable', () => {
+  it('reports moves, and stops when its signal is aborted', () => {
+    const list = document.createElement('ul');
+    list.innerHTML = '<li draggable="true">a</li><li draggable="true">b</li>';
+    const onMove = vi.fn();
+    const controller = new AbortController();
+    attachSortable(list, onMove, controller.signal);
+    const [a, b] = list.children;
+    a.dispatchEvent(new Event('dragstart', { bubbles: true }));
+    b.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
+    expect(onMove).toHaveBeenCalledWith(0, 1);
+    controller.abort();
+    a.dispatchEvent(new Event('dragstart', { bubbles: true }));
+    b.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
+    expect(onMove).toHaveBeenCalledTimes(1);
+  });
+});
diff --git a/src/dashboard/api/photos.js b/src/dashboard/api/photos.js
new file mode 100644
index 0000000..8255186
--- /dev/null
+++ b/src/dashboard/api/photos.js
@@ -0,0 +1,9 @@
+/**
+ * Where the dashboard shows a photo: the Worker's preview route, behind Access, which serves
+ * the photo waiting to be published when there is one, else the published one.
+ * @param {string} slug
+ * @param {string} name
+ */
+export function photoSrc(slug, name) {
+  return `/api/admin/preview/photo/${slug}/${encodeURIComponent(name)}`;
+}
diff --git a/src/dashboard/features/albums/AlbumCard.jsx b/src/dashboard/features/albums/AlbumCard.jsx
new file mode 100644
index 0000000..054dd8e
--- /dev/null
+++ b/src/dashboard/features/albums/AlbumCard.jsx
@@ -0,0 +1,42 @@
+import { Link } from 'react-router';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { useManifest } from '../../api/drafts.jsx';
+import { photoSrc } from '../../api/photos.js';
+
+const t = texts.admin.albums;
+
+/** How many photos, in words. */
+export function photoCount(n) {
+  if (!n) return t.photoCountNone;
+  return n === 1 ? t.photoCountOne : formatText(t.photoCountMany, { n });
+}
+
+/**
+ * One album of the gallery: its cover (or first photo), title and number of photos. In
+ * reorder mode it also shows the arrows that move it.
+ * @param {{album: object, index: number, total: number, reordering: boolean, onMove: Function}} props
+ */
+export function AlbumCard({ album, index, total, reordering, onMove }) {
+  const { photos } = useManifest(album.slug);
+  const coverName = album.coverName ?? photos?.[0]?.name;
+  return (
+    <li className="dash-album-card" draggable={reordering ? 'true' : undefined}>
+      <Link to={`/album/${album.slug}`} className="dash-album-card__link" draggable="false">
+        <span className="dash-album-card__cover">
+          {coverName && <img src={photoSrc(album.slug, coverName)} alt="" loading="lazy" draggable="false" />}
+        </span>
+        <span className="dash-album-card__title">{album.title}</span>
+        <span className="dash-album-card__count">{photos ? photoCount(photos.length) : ' '}</span>
+      </Link>
+      {reordering && (
+        <span className="dash-album-card__move">
+          <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0}
+            aria-label={formatText(t.moveEarlier, { album: album.title })}>←</button>
+          <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === total - 1}
+            aria-label={formatText(t.moveLater, { album: album.title })}>→</button>
+        </span>
+      )}
+    </li>
+  );
+}
diff --git a/src/dashboard/features/albums/AlbumsScreen.jsx b/src/dashboard/features/albums/AlbumsScreen.jsx
index 44be1ae..1adc157 100644
--- a/src/dashboard/features/albums/AlbumsScreen.jsx
+++ b/src/dashboard/features/albums/AlbumsScreen.jsx
@@ -1,6 +1,62 @@
+import { useState } from 'react';
+import { useNavigate } from 'react-router';
+import { useQueryClient } from '@tanstack/react-query';
 import { texts } from '../../../../config/texts.config.js';
+import { moveItem } from '../../../admin/sortable.js';
+import { useAlbums, useSaveQueue } from '../../api/drafts.jsx';
+import { keys } from '../../api/queries.js';
+import { Button } from '../../ui/Button.jsx';
+import { useSortable } from '../../ui/useSortable.js';
+import { AlbumCard } from './AlbumCard.jsx';
+import { NewAlbumSheet } from './NewAlbumSheet.jsx';
+import './albums.css';
 
-/** The gallery of albums. Filled in plan 4.2. */
+const t = texts.admin.albums;
+
+/** The gallery of albums: covers, number of photos, new album, order on the site. */
 export function AlbumsScreen() {
-  return <h1 className="dash-screen-title">{texts.admin.albums.sectionTitle}</h1>;
+  const { albums, setAlbums, isPending } = useAlbums();
+  const queue = useSaveQueue();
+  const client = useQueryClient();
+  const navigate = useNavigate();
+  const [creating, setCreating] = useState(false);
+  const [reordering, setReordering] = useState(false);
+
+  const move = (from, to) => setAlbums(moveItem(albums, from, to));
+  const listRef = useSortable(move);
+
+  const create = album => {
+    setAlbums([...albums, album], { now: true });
+    // A new album starts with an empty manifest in the draft (spec, plan-2 rules): it
+    // never inherits the photos of a removed album with the same address.
+    client.setQueryData(keys.manifest(album.slug), []);
+    queue.set(`manifest:${album.slug}`, [], { now: true });
+    setCreating(false);
+    navigate(`/album/${album.slug}`);
+  };
+
+  return (
+    <section className="dash-albums" aria-labelledby="dash-albums-title">
+      <div className="dash-screen-head">
+        <h1 id="dash-albums-title" className="dash-screen-title">{t.sectionTitle}</h1>
+        <div className="dash-screen-head__actions">
+          {albums?.length > 1 && (
+            <Button onClick={() => setReordering(value => !value)} aria-pressed={reordering}>
+              {reordering ? t.reorderDone : t.reorder}
+            </Button>
+          )}
+          <Button variant="primary" onClick={() => setCreating(true)}>{t.create}</Button>
+        </div>
+      </div>
+      {reordering && <p className="dash-hint">{t.reorderHint}</p>}
+      {!isPending && albums?.length === 0 && <p className="dash-empty">{t.empty}</p>}
+      <ul ref={listRef} className={`dash-album-grid${reordering ? ' dash-album-grid--reordering' : ''}`}>
+        {(albums ?? []).map((album, index) => (
+          <AlbumCard key={album.slug} album={album} index={index} total={albums.length}
+            reordering={reordering} onMove={move} />
+        ))}
+      </ul>
+      <NewAlbumSheet open={creating} albums={albums ?? []} onCreate={create} onClose={() => setCreating(false)} />
+    </section>
+  );
 }
diff --git a/src/dashboard/features/albums/AlbumsScreen.test.jsx b/src/dashboard/features/albums/AlbumsScreen.test.jsx
new file mode 100644
index 0000000..10ec12a
--- /dev/null
+++ b/src/dashboard/features/albums/AlbumsScreen.test.jsx
@@ -0,0 +1,95 @@
+import { beforeAll, describe, expect, it } from 'vitest';
+import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { createMemoryRouter, RouterProvider } from 'react-router';
+import { texts } from '../../../../config/texts.config.js';
+import { routes } from '../../App.jsx';
+import { useSaveQueue } from '../../api/drafts.jsx';
+import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';
+
+const t = texts.admin.albums;
+beforeAll(installDialogPolyfill);
+
+const album = (slug, extra = {}) => ({ slug, title: slug[0].toUpperCase() + slug.slice(1), description: '', coverName: null, ...extra });
+const DRAFT = { site: { name: 'D', bio: '', hero: null }, albums: [album('notte', { coverName: 'c.webp' }), album('viaggio')], hasDraft: false };
+const STATUS = { hasDraft: false, publishing: false, changes: [] };
+const photo = name => ({ name, width: 4, height: 3 });
+
+let queue;
+function QueueSpy() { queue = useSaveQueue(); return null; }
+
+function renderAt(path = '/') {
+  const router = createMemoryRouter(routes, { initialEntries: [path] });
+  render(<Providers client={makeQueryClient()}><QueueSpy /><RouterProvider router={router} /></Providers>);
+  return router;
+}
+
+function worker(extra = {}) {
+  return fakeWorker({
+    'GET /api/admin/draft': DRAFT,
+    'GET /api/admin/draft/status': STATUS,
+    'GET /api/admin/draft/albums/notte/manifest': [[photo('a.webp'), photo('c.webp')]],
+    'GET /api/admin/draft/albums/viaggio/manifest': [[]],
+    'PUT /api/admin/draft/albums': { ok: true },
+    ...extra,
+  });
+}
+const puts = (fetchMock, path) => fetchMock.mock.calls
+  .filter(([p, init]) => p === path && init?.method === 'PUT').map(([, init]) => JSON.parse(init.body));
+
+describe('albums gallery', () => {
+  it('shows each album with its cover and number of photos, linking to it', async () => {
+    worker();
+    renderAt('/');
+    const notte = await screen.findByRole('link', { name: /Notte/ });
+    expect(notte.getAttribute('href')).toBe('/album/notte');
+    expect(notte.querySelector('img').getAttribute('src')).toBe('/api/admin/preview/photo/notte/c.webp');
+    expect(await within(notte).findByText('2 photos')).toBeTruthy();
+    const viaggio = screen.getByRole('link', { name: /Viaggio/ });
+    expect(await within(viaggio).findByText(t.photoCountNone)).toBeTruthy();
+    expect(viaggio.querySelector('img')).toBeNull();
+  });
+
+  it('creates an album with an empty manifest and opens it', async () => {
+    const fetchMock = worker({ 'PUT /api/admin/draft/albums/luci/manifest': { ok: true }, 'GET /api/admin/draft/albums/luci/manifest': [[]] });
+    const router = renderAt('/');
+    fireEvent.click(await screen.findByRole('button', { name: t.create }));
+    const sheet = await screen.findByRole('dialog', { name: t.create });
+    fireEvent.change(within(sheet).getByLabelText(t.titleLabel), { target: { value: 'Luci' } });
+    fireEvent.click(within(sheet).getByRole('button', { name: t.createConfirm }));
+    await waitFor(() => expect(router.state.location.pathname).toBe('/album/luci'));
+    await act(() => queue.flush());
+    expect(puts(fetchMock, '/api/admin/draft/albums').at(-1).albums.map(a => a.slug)).toEqual(['notte', 'viaggio', 'luci']);
+    expect(puts(fetchMock, '/api/admin/draft/albums/luci/manifest')).toEqual([[]]);
+  });
+
+  it('refuses a title that is taken or reserved, saying why', async () => {
+    worker();
+    renderAt('/');
+    fireEvent.click(await screen.findByRole('button', { name: t.create }));
+    const sheet = await screen.findByRole('dialog', { name: t.create });
+    const input = within(sheet).getByLabelText(t.titleLabel);
+    fireEvent.change(input, { target: { value: 'Notte' } });
+    fireEvent.click(within(sheet).getByRole('button', { name: t.createConfirm }));
+    expect(within(sheet).getByRole('alert').textContent).toBe('An album "notte" already exists.');
+    fireEvent.change(input, { target: { value: 'Admin' } });
+    fireEvent.click(within(sheet).getByRole('button', { name: t.createConfirm }));
+    expect(within(sheet).getByRole('alert').textContent).toBe('"admin" is a reserved name.');
+  });
+
+  it('reorders with the arrows and saves the new order', async () => {
+    const fetchMock = worker();
+    renderAt('/');
+    fireEvent.click(await screen.findByRole('button', { name: t.reorder }));
+    fireEvent.click(screen.getByRole('button', { name: 'Move Viaggio earlier' }));
+    await waitFor(() => expect([...document.querySelectorAll('.dash-album-card__title')].map(el => el.textContent)).toEqual(['Viaggio', 'Notte']));
+    expect(screen.getByRole('button', { name: 'Move Viaggio earlier' }).disabled).toBe(true);
+    await act(() => queue.flush());
+    expect(puts(fetchMock, '/api/admin/draft/albums').at(-1).albums.map(a => a.slug)).toEqual(['viaggio', 'notte']);
+  });
+
+  it('says there are no albums yet', async () => {
+    fakeWorker({ 'GET /api/admin/draft': { ...DRAFT, albums: [] }, 'GET /api/admin/draft/status': STATUS });
+    renderAt('/');
+    expect(await screen.findByText(t.empty)).toBeTruthy();
+  });
+});
diff --git a/src/dashboard/features/albums/NewAlbumSheet.jsx b/src/dashboard/features/albums/NewAlbumSheet.jsx
new file mode 100644
index 0000000..8932bc8
--- /dev/null
+++ b/src/dashboard/features/albums/NewAlbumSheet.jsx
@@ -0,0 +1,44 @@
+import { useId, useState } from 'react';
+import { texts } from '../../../../config/texts.config.js';
+import { Button } from '../../ui/Button.jsx';
+import { Sheet } from '../../ui/Sheet.jsx';
+import { newAlbum } from './new-album.js';
+
+const t = texts.admin.albums;
+
+/**
+ * Asks for the title of a new album. `onCreate(album)` receives it once the title is valid.
+ * @param {{open: boolean, albums: Array, onCreate: Function, onClose: Function}} props
+ */
+export function NewAlbumSheet({ open, albums, onCreate, onClose }) {
+  const [title, setTitle] = useState('');
+  const [error, setError] = useState(null);
+  const inputId = useId();
+  const errorId = useId();
+
+  const close = () => { setTitle(''); setError(null); onClose(); };
+  const submit = event => {
+    event.preventDefault();
+    const result = newAlbum(title, albums);
+    if (!result.ok) { setError(result.error); return; }
+    setTitle('');
+    setError(null);
+    onCreate(result.album);
+  };
+
+  return (
+    <Sheet open={open} onClose={close} title={t.create}>
+      <form className="dash-form" onSubmit={submit}>
+        <label htmlFor={inputId} className="dash-label">{t.titleLabel}</label>
+        <input id={inputId} className="dash-input" value={title} autoComplete="off"
+          placeholder={t.newTitlePlaceholder} onChange={event => { setTitle(event.target.value); setError(null); }}
+          aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} />
+        {error && <p id={errorId} className="dash-form__error" role="alert">{error}</p>}
+        <div className="dash-confirm__actions">
+          <Button onClick={close}>{t.cancel}</Button>
+          <Button type="submit" variant="primary">{t.createConfirm}</Button>
+        </div>
+      </form>
+    </Sheet>
+  );
+}
diff --git a/src/dashboard/features/albums/albums.css b/src/dashboard/features/albums/albums.css
new file mode 100644
index 0000000..187d386
--- /dev/null
+++ b/src/dashboard/features/albums/albums.css
@@ -0,0 +1,35 @@
+.dash-screen-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
+.dash-screen-head .dash-screen-title { margin: 0; }
+.dash-screen-head__actions { display: flex; gap: 0.5rem; }
+.dash-hint, .dash-empty { color: var(--admin-muted); margin: 0 0 1rem; }
+
+.dash-album-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); }
+.dash-album-card { position: relative; }
+.dash-album-grid--reordering .dash-album-card { cursor: grab; }
+.dash-album-card__link { display: grid; gap: 0.35rem; color: inherit; text-decoration: none; }
+.dash-album-card__cover {
+  display: block; aspect-ratio: 4 / 3; border-radius: 6px; overflow: hidden;
+  background: var(--admin-raised); box-shadow: 0 0 0 1px var(--admin-line);
+}
+.dash-album-card__cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
+.dash-album-card__link:hover .dash-album-card__cover { box-shadow: 0 0 0 2px var(--admin-accent); }
+.dash-album-card__title { font-weight: 500; font-size: 0.95rem; }
+.dash-album-card__count { font: 0.75rem/1 var(--admin-font-mono); color: var(--admin-muted); text-transform: uppercase; letter-spacing: 0.04em; }
+.dash-album-card__move { position: absolute; top: 0.5rem; right: 0.5rem; display: flex; gap: 0.25rem; }
+.dash-album-card__move button {
+  width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--admin-line);
+  background: var(--admin-surface); color: var(--admin-ink); cursor: pointer;
+}
+.dash-album-card__move button:disabled { opacity: 0.4; cursor: default; }
+
+.dash-form { display: grid; gap: 0.5rem; }
+.dash-input {
+  width: 100%; min-height: 44px; padding: 0 0.75rem; border-radius: var(--admin-radius);
+  border: 1px solid var(--admin-line); background: var(--admin-bg);
+}
+.dash-input:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 0; }
+.dash-form__error { margin: 0; color: var(--admin-danger); font-size: 0.85rem; }
+
+@media (max-width: 640px) {
+  .dash-album-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
+}
diff --git a/src/dashboard/features/albums/new-album.js b/src/dashboard/features/albums/new-album.js
new file mode 100644
index 0000000..4901f04
--- /dev/null
+++ b/src/dashboard/features/albums/new-album.js
@@ -0,0 +1,22 @@
+import { RESERVED_SLUGS, SLUG_RE, slugifyTitle } from '../../../shared/content-rules.js';
+import { formatText } from '../../../utils/formatText.js';
+import { texts } from '../../../../config/texts.config.js';
+// First path segments of the fork's custom pages, from custom/pages.config.js at build time.
+import { CUSTOM_PAGE_SLUGS } from 'virtual:custom-pages';
+
+const t = texts.admin.albums;
+
+/**
+ * Checks the title of a new album and gives its address (slug).
+ * @param {string} title
+ * @param {Array<{slug: string}>} albums - The draft's albums.
+ * @returns {{ok: true, album: object} | {ok: false, error: string}}
+ */
+export function newAlbum(title, albums) {
+  const trimmed = String(title).trim();
+  const slug = slugifyTitle(trimmed);
+  if (!trimmed || !SLUG_RE.test(slug)) return { ok: false, error: t.titleInvalid };
+  if (RESERVED_SLUGS.includes(slug) || CUSTOM_PAGE_SLUGS.includes(slug)) return { ok: false, error: formatText(t.titleReserved, { slug }) };
+  if (albums.some(album => album.slug === slug)) return { ok: false, error: formatText(t.exists, { slug }) };
+  return { ok: true, album: { slug, title: trimmed, description: '', coverName: null } };
+}
diff --git a/src/dashboard/ui/useSortable.js b/src/dashboard/ui/useSortable.js
new file mode 100644
index 0000000..fef241e
--- /dev/null
+++ b/src/dashboard/ui/useSortable.js
@@ -0,0 +1,23 @@
+import { useEffect, useRef } from 'react';
+import { attachSortable } from '../../admin/sortable.js';
+
+/**
+ * Drag and drop reordering of a container's children (the ones with draggable="true"):
+ * `onMove(from, to)` is called with their indexes. Works with a mouse; on a phone the
+ * screens also offer arrow buttons, since touch screens do not drag this way.
+ * @param {(from: number, to: number) => void} onMove
+ * @returns {import('react').RefObject<HTMLElement>} Attach it to the container.
+ */
+export function useSortable(onMove) {
+  const ref = useRef(null);
+  // The latest callback, without re-attaching the listeners on every render.
+  const move = useRef(onMove);
+  move.current = onMove;
+  useEffect(() => {
+    if (!ref.current) return undefined;
+    const controller = new AbortController();
+    attachSortable(ref.current, (from, to) => move.current(from, to), controller.signal);
+    return () => controller.abort();
+  }, []);
+  return ref;
+}
````

---

### Task 4: Open album

Title and subtitle edited in place (local state, never reset while typing; an empty title is not saved), photos in order with number and cover mark, choose the cover, delete a photo (confirmation; a waiting photo is removed from the waiting area at once), reorder mode, delete the album (confirmation, back to the gallery), "not in the draft" with the way back. Deleting and cover changes are disabled while publishing.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/dashboard/App.test.jsx`, `src/dashboard/features/album/AlbumDetails.jsx`, `src/dashboard/features/album/AlbumScreen.jsx`, `src/dashboard/features/album/AlbumScreen.test.jsx`, `src/dashboard/features/album/PhotoGrid.jsx`, `src/dashboard/features/album/album.css`

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t4/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t4/$f" "$f"; done
```

Run: `npm test` → 8 tests fail.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t4/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t4/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 99 files, 776 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "act("` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/dashboard/App.test.jsx src/dashboard/features/album/AlbumDetails.jsx src/dashboard/features/album/AlbumScreen.jsx src/dashboard/features/album/AlbumScreen.test.jsx src/dashboard/features/album/PhotoGrid.jsx src/dashboard/features/album/album.css
git commit -F - <<'EOF'
feat(dashboard): the open album — details, photos, cover, order, delete

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index 0be8e87..fcb6832 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -172,6 +172,19 @@ export const texts = {
       dropzoneConstraints: 'JPG, PNG, WebP up to 20MB',
       unsupportedFormat: 'The browser cannot upload these ({elenco}): convert HEIC and TIFF first, with `npm run compress`.',
       uploadPartial: 'Uploaded {uploaded}, failed {failed}: try again by dropping them once more.',
+      titleLabel: 'Title',
+      titleRequired: 'The title cannot be empty: the last one is kept.',
+      notFound: 'This album is not in the draft.',
+      empty: 'No photos yet: upload the first ones.',
+      photoLabel: 'Photo {n}',
+      coverBadge: 'Cover',
+      movePhotoEarlier: 'Move photo {n} earlier',
+      movePhotoLater: 'Move photo {n} later',
+      deletePhotoBody: 'It disappears from the site when you publish.',
+      deleteAlbum: 'Delete album',
+      deleteAlbumTitle: 'Delete "{album}"?',
+      deleteAlbumBody: 'The album and its photos disappear from the site when you publish.',
+      cancel: 'Cancel',
     },
     status: {
       lastAction: 'Last action',
diff --git a/config/texts.it.js b/config/texts.it.js
index 62769ed..1531a32 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -170,6 +170,19 @@ export const texts = {
       dropzoneConstraints: 'JPG, PNG, WebP fino a 20MB',
       unsupportedFormat: 'Non caricabili dal browser ({elenco}): HEIC e TIFF vanno convertiti prima, con `npm run compress`.',
       uploadPartial: 'Caricate {uploaded}, fallite {failed}: riprova trascinandole di nuovo.',
+      titleLabel: 'Titolo',
+      titleRequired: 'Il titolo non può essere vuoto: resta l\'ultimo.',
+      notFound: 'Questo album non è nella bozza.',
+      empty: 'Ancora nessuna foto: carica le prime.',
+      photoLabel: 'Foto {n}',
+      coverBadge: 'Copertina',
+      movePhotoEarlier: 'Sposta la foto {n} prima',
+      movePhotoLater: 'Sposta la foto {n} dopo',
+      deletePhotoBody: 'Sparisce dal sito quando pubblichi.',
+      deleteAlbum: 'Elimina l\'album',
+      deleteAlbumTitle: 'Eliminare «{album}»?',
+      deleteAlbumBody: 'L\'album e le sue foto spariscono dal sito quando pubblichi.',
+      cancel: 'Annulla',
     },
     status: {
       lastAction: 'Ultima azione eseguita',
diff --git a/src/dashboard/App.test.jsx b/src/dashboard/App.test.jsx
index f511bd4..417b407 100644
--- a/src/dashboard/App.test.jsx
+++ b/src/dashboard/App.test.jsx
@@ -36,7 +36,8 @@ describe('dashboard frame', () => {
     fireEvent.click(await screen.findByRole('link', { name: texts.admin.common.navSite }));
     expect(await screen.findByRole('heading', { name: texts.admin.site.sectionTitle })).toBeTruthy();
     await router.navigate('/album/notte');
-    expect(await screen.findByRole('heading', { name: 'notte' })).toBeTruthy();
+    // Not in this draft: the album screen says so.
+    expect(await screen.findByText(texts.admin.album.notFound)).toBeTruthy();
   });
 
   it('an unknown address goes back to the albums', async () => {
diff --git a/src/dashboard/features/album/AlbumDetails.jsx b/src/dashboard/features/album/AlbumDetails.jsx
new file mode 100644
index 0000000..8353e37
--- /dev/null
+++ b/src/dashboard/features/album/AlbumDetails.jsx
@@ -0,0 +1,45 @@
+import { useEffect, useId, useState } from 'react';
+import { texts } from '../../../../config/texts.config.js';
+
+const t = texts.admin.album;
+
+/**
+ * Title and subtitle of an album, edited in place. What is typed stays in this component's
+ * state and is handed to `onChange` as it changes; a refetch of the draft never resets a
+ * field being edited (spec, "Moduli").
+ * @param {{album: object, onChange: (fields: {title: string, description: string}) => void}} props
+ */
+export function AlbumDetails({ album, onChange }) {
+  const [title, setTitle] = useState(album.title);
+  const [description, setDescription] = useState(album.description);
+  const titleId = useId();
+  const descriptionId = useId();
+  const errorId = useId();
+
+  // Another album opened in the same component: start from its values.
+  useEffect(() => {
+    setTitle(album.title);
+    setDescription(album.description);
+  }, [album.slug]); // eslint-disable-line react-hooks/exhaustive-deps
+
+  const titleMissing = !title.trim();
+  const change = (nextTitle, nextDescription) => {
+    // An empty title cannot be saved (the site needs one): the last good one is kept.
+    if (!nextTitle.trim()) return;
+    onChange({ title: nextTitle.trim(), description: nextDescription });
+  };
+
+  return (
+    <div className="dash-album-details">
+      <label htmlFor={titleId} className="dash-label">{t.titleLabel}</label>
+      <input id={titleId} className="dash-input dash-album-details__title" value={title}
+        aria-invalid={titleMissing ? 'true' : undefined} aria-describedby={titleMissing ? errorId : undefined}
+        onChange={event => { setTitle(event.target.value); change(event.target.value, description); }} />
+      {titleMissing && <p id={errorId} className="dash-form__error" role="alert">{t.titleRequired}</p>}
+      <label htmlFor={descriptionId} className="dash-label">{t.subtitleLabel}</label>
+      <textarea id={descriptionId} className="dash-input dash-album-details__subtitle" rows={2} value={description}
+        placeholder={t.subtitlePlaceholder}
+        onChange={event => { setDescription(event.target.value); change(title, event.target.value); }} />
+    </div>
+  );
+}
diff --git a/src/dashboard/features/album/AlbumScreen.jsx b/src/dashboard/features/album/AlbumScreen.jsx
index e65fce3..8b5b02c 100644
--- a/src/dashboard/features/album/AlbumScreen.jsx
+++ b/src/dashboard/features/album/AlbumScreen.jsx
@@ -1,7 +1,100 @@
-import { useParams } from 'react-router';
+import { useState } from 'react';
+import { Link, useNavigate, useParams } from 'react-router';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { moveItem } from '../../../admin/sortable.js';
+import { request } from '../../api/client.js';
+import { useAlbums, useManifest } from '../../api/drafts.jsx';
+import { useIsPublishing } from '../../api/queries.js';
+import { Button } from '../../ui/Button.jsx';
+import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
+import { AlbumDetails } from './AlbumDetails.jsx';
+import { PhotoGrid } from './PhotoGrid.jsx';
+import '../albums/albums.css';
+import './album.css';
 
-/** An open album. Filled in plan 4.2. */
+const t = texts.admin.album;
+
+/**
+ * An open album: title and subtitle, its photos (cover, order, delete), delete the album.
+ * Every change goes to the draft; the site changes only when it is published.
+ */
 export function AlbumScreen() {
   const { slug } = useParams();
-  return <h1 className="dash-screen-title">{slug}</h1>;
+  const navigate = useNavigate();
+  const { albums, setAlbums, isPending: albumsPending } = useAlbums();
+  const { photos, setManifest, isError: manifestError } = useManifest(slug);
+  const publishing = useIsPublishing();
+  const [reordering, setReordering] = useState(false);
+  const [deletingPhoto, setDeletingPhoto] = useState(null);
+  const [deletingAlbum, setDeletingAlbum] = useState(false);
+
+  const album = albums?.find(item => item.slug === slug);
+  if (albumsPending) return null;
+  if (!album) {
+    return (
+      <section>
+        <Link to="/" className="dash-back">{texts.admin.common.allAlbums}</Link>
+        <p className="dash-empty" role="alert">{t.notFound}</p>
+      </section>
+    );
+  }
+
+  const updateAlbum = fields => setAlbums(albums.map(item => (item.slug === slug ? { ...item, ...fields } : item)));
+
+  const deletePhoto = name => {
+    setManifest(photos.filter(photo => photo.name !== name));
+    if (album.coverName === name) updateAlbum({ coverName: null });
+    // A photo still waiting to be published is removed from the waiting area now; a
+    // published one is removed from the site when the draft is published.
+    request(`/api/admin/staging/${slug}/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {});
+    setDeletingPhoto(null);
+  };
+
+  const deleteAlbum = () => {
+    setAlbums(albums.filter(item => item.slug !== slug), { now: true });
+    setDeletingAlbum(false);
+    navigate('/');
+  };
+
+  return (
+    <section className="dash-album" aria-labelledby="dash-album-title">
+      <Link to="/" className="dash-back">{texts.admin.common.allAlbums}</Link>
+      <h1 id="dash-album-title" className="visually-hidden">{album.title}</h1>
+      <AlbumDetails album={album} onChange={updateAlbum} />
+
+      <div className="dash-screen-head">
+        <p className="dash-label">{photos ? formatText(texts.admin.albums.photoCountMany, { n: photos.length }) : ''}</p>
+        <div className="dash-screen-head__actions">
+          {photos?.length > 1 && (
+            <Button onClick={() => setReordering(value => !value)} aria-pressed={reordering}>
+              {reordering ? texts.admin.albums.reorderDone : texts.admin.albums.reorder}
+            </Button>
+          )}
+        </div>
+      </div>
+
+      {manifestError && <p className="dash-form__error" role="alert">{t.manifestError}</p>}
+      {photos?.length === 0 && <p className="dash-empty">{t.empty}</p>}
+      {photos?.length > 0 && (
+        <PhotoGrid slug={slug} photos={photos} coverName={album.coverName} reordering={reordering} disabled={publishing}
+          onMove={(from, to) => setManifest(moveItem(photos, from, to))}
+          onCover={name => updateAlbum({ coverName: name })}
+          onDelete={name => setDeletingPhoto(name)} />
+      )}
+
+      <div className="dash-album__danger">
+        <Button variant="danger" onClick={() => setDeletingAlbum(true)} disabled={publishing}>{t.deleteAlbum}</Button>
+      </div>
+
+      <ConfirmDialog open={deletingPhoto !== null}
+        title={formatText(t.confirmDeletePhoto, { nome: deletingPhoto ?? '' })} body={t.deletePhotoBody}
+        confirmLabel={t.deletePhoto} cancelLabel={t.cancel}
+        onConfirm={() => deletePhoto(deletingPhoto)} onCancel={() => setDeletingPhoto(null)} />
+      <ConfirmDialog open={deletingAlbum}
+        title={formatText(t.deleteAlbumTitle, { album: album.title })} body={t.deleteAlbumBody}
+        confirmLabel={t.deleteAlbum} cancelLabel={t.cancel}
+        onConfirm={deleteAlbum} onCancel={() => setDeletingAlbum(false)} />
+    </section>
+  );
 }
diff --git a/src/dashboard/features/album/AlbumScreen.test.jsx b/src/dashboard/features/album/AlbumScreen.test.jsx
new file mode 100644
index 0000000..ae54d14
--- /dev/null
+++ b/src/dashboard/features/album/AlbumScreen.test.jsx
@@ -0,0 +1,111 @@
+import { beforeAll, describe, expect, it } from 'vitest';
+import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { createMemoryRouter, RouterProvider } from 'react-router';
+import { texts } from '../../../../config/texts.config.js';
+import { routes } from '../../App.jsx';
+import { useSaveQueue } from '../../api/drafts.jsx';
+import { fakeWorker, installDialogPolyfill, makeQueryClient, Providers } from '../../test-utils.jsx';
+
+const t = texts.admin.album;
+beforeAll(installDialogPolyfill);
+
+const NOTTE = { slug: 'notte', title: 'Notte', description: 'Cieli', coverName: 'b.webp' };
+const DRAFT = { site: { name: 'D', bio: '', hero: null }, albums: [NOTTE, { slug: 'viaggio', title: 'Viaggio', description: '', coverName: null }], hasDraft: false };
+const STATUS = { hasDraft: false, publishing: false, changes: [] };
+const photo = name => ({ name, width: 4, height: 3 });
+
+let queue;
+function QueueSpy() { queue = useSaveQueue(); return null; }
+function renderAt(path) {
+  const router = createMemoryRouter(routes, { initialEntries: [path] });
+  render(<Providers client={makeQueryClient()}><QueueSpy /><RouterProvider router={router} /></Providers>);
+  return router;
+}
+function worker(extra = {}) {
+  return fakeWorker({
+    'GET /api/admin/draft': DRAFT,
+    'GET /api/admin/draft/status': STATUS,
+    'GET /api/admin/draft/albums/notte/manifest': [[photo('a.webp'), photo('b.webp'), photo('c.webp')]],
+    'PUT /api/admin/draft/albums': { ok: true },
+    'PUT /api/admin/draft/albums/notte/manifest': { ok: true },
+    ...extra,
+  });
+}
+const lastPut = (fetchMock, path) => {
+  const call = fetchMock.mock.calls.filter(([p, init]) => p === path && init?.method === 'PUT').at(-1);
+  return call && JSON.parse(call[1].body);
+};
+const photoNames = () => [...document.querySelectorAll('.dash-photo img')].map(img => img.getAttribute('src').split('/').pop());
+
+describe('open album', () => {
+  it('shows title, subtitle and the photos in order, the cover marked', async () => {
+    worker();
+    renderAt('/album/notte');
+    expect((await screen.findByLabelText(t.titleLabel)).value).toBe('Notte');
+    expect(screen.getByLabelText(t.subtitleLabel).value).toBe('Cieli');
+    await waitFor(() => expect(photoNames()).toEqual(['a.webp', 'b.webp', 'c.webp']));
+    const cover = screen.getByRole('button', { name: `${t.coverAsButton} · Photo 2` });
+    expect(cover.getAttribute('aria-pressed')).toBe('true');
+  });
+
+  it('saves title and subtitle as they are typed, never an empty title', async () => {
+    const fetchMock = worker();
+    renderAt('/album/notte');
+    const title = await screen.findByLabelText(t.titleLabel);
+    fireEvent.change(title, { target: { value: '' } });
+    expect(screen.getByRole('alert').textContent).toBe(t.titleRequired);
+    fireEvent.change(title, { target: { value: 'Notte in montagna' } });
+    fireEvent.change(screen.getByLabelText(t.subtitleLabel), { target: { value: 'Cieli stellati' } });
+    await act(() => queue.flush());
+    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0]).toEqual({ ...NOTTE, title: 'Notte in montagna', description: 'Cieli stellati' });
+  });
+
+  it('chooses the cover', async () => {
+    const fetchMock = worker();
+    renderAt('/album/notte');
+    fireEvent.click(await screen.findByRole('button', { name: `${t.coverAsButton} · Photo 3` }));
+    await act(() => queue.flush());
+    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0].coverName).toBe('c.webp');
+  });
+
+  it('reorders the photos with the arrows', async () => {
+    const fetchMock = worker();
+    renderAt('/album/notte');
+    fireEvent.click(await screen.findByRole('button', { name: texts.admin.albums.reorder }));
+    fireEvent.click(screen.getByRole('button', { name: 'Move photo 3 earlier' }));
+    await waitFor(() => expect(photoNames()).toEqual(['a.webp', 'c.webp', 'b.webp']));
+    await act(() => queue.flush());
+    expect(lastPut(fetchMock, '/api/admin/draft/albums/notte/manifest').map(p => p.name)).toEqual(['a.webp', 'c.webp', 'b.webp']);
+  });
+
+  it('deletes a photo after a confirmation; deleting the cover clears it', async () => {
+    const fetchMock = worker({ 'DELETE /api/admin/staging/notte/b.webp': { ok: true } });
+    renderAt('/album/notte');
+    fireEvent.click(await screen.findByRole('button', { name: `${t.deletePhoto} · Photo 2` }));
+    const dialog = await screen.findByRole('alertdialog');
+    fireEvent.click(within(dialog).getByRole('button', { name: t.deletePhoto }));
+    await waitFor(() => expect(photoNames()).toEqual(['a.webp', 'c.webp']));
+    await act(() => queue.flush());
+    expect(lastPut(fetchMock, '/api/admin/draft/albums/notte/manifest').map(p => p.name)).toEqual(['a.webp', 'c.webp']);
+    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums[0].coverName).toBeNull();
+    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/staging/notte/b.webp' && init?.method === 'DELETE')).toBe(true);
+  });
+
+  it('deletes the album after a confirmation and goes back to the gallery', async () => {
+    const fetchMock = worker();
+    const router = renderAt('/album/notte');
+    fireEvent.click(await screen.findByRole('button', { name: t.deleteAlbum }));
+    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "Notte"?' });
+    fireEvent.click(within(dialog).getByRole('button', { name: t.deleteAlbum }));
+    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
+    await act(() => queue.flush());
+    expect(lastPut(fetchMock, '/api/admin/draft/albums').albums.map(a => a.slug)).toEqual(['viaggio']);
+  });
+
+  it('an album not in the draft says so, with the way back', async () => {
+    worker();
+    renderAt('/album/altro');
+    expect((await screen.findByRole('alert')).textContent).toBe(t.notFound);
+    expect(screen.getByRole('link', { name: texts.admin.common.allAlbums }).getAttribute('href')).toBe('/');
+  });
+});
diff --git a/src/dashboard/features/album/PhotoGrid.jsx b/src/dashboard/features/album/PhotoGrid.jsx
new file mode 100644
index 0000000..f600b19
--- /dev/null
+++ b/src/dashboard/features/album/PhotoGrid.jsx
@@ -0,0 +1,50 @@
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { photoSrc } from '../../api/photos.js';
+import { useSortable } from '../../ui/useSortable.js';
+
+const t = texts.admin.album;
+
+/**
+ * The photos of an album, in their order on the site. Each one can become the cover or be
+ * deleted; in reorder mode it can be dragged or moved with the arrows.
+ * @param {{slug: string, photos: Array, coverName: string|null, reordering: boolean, disabled: boolean,
+ *   onMove: Function, onCover: Function, onDelete: Function}} props
+ */
+export function PhotoGrid({ slug, photos, coverName, reordering, disabled, onMove, onCover, onDelete }) {
+  const listRef = useSortable(onMove);
+  return (
+    <ol ref={listRef} className={`dash-photo-grid${reordering ? ' dash-photo-grid--reordering' : ''}`}>
+      {photos.map((photo, index) => {
+        const n = index + 1;
+        const isCover = photo.name === coverName;
+        return (
+          <li key={photo.name} className="dash-photo" draggable={reordering ? 'true' : undefined}>
+            <figure className="dash-photo__figure">
+              <img src={photoSrc(slug, photo.name)} alt={formatText(t.photoLabel, { n })} loading="lazy" draggable="false" />
+              <figcaption className="dash-photo__number">{String(n).padStart(2, '0')}</figcaption>
+              {isCover && <span className="dash-photo__cover">{t.coverBadge}</span>}
+            </figure>
+            <div className="dash-photo__actions">
+              {reordering ? (
+                <>
+                  <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0}
+                    aria-label={formatText(t.movePhotoEarlier, { n })}>←</button>
+                  <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === photos.length - 1}
+                    aria-label={formatText(t.movePhotoLater, { n })}>→</button>
+                </>
+              ) : (
+                <>
+                  <button type="button" onClick={() => onCover(photo.name)} aria-pressed={isCover} disabled={disabled}
+                    aria-label={`${t.coverAsButton} · ${formatText(t.photoLabel, { n })}`}>★</button>
+                  <button type="button" className="dash-photo__delete" onClick={() => onDelete(photo.name)} disabled={disabled}
+                    aria-label={`${t.deletePhoto} · ${formatText(t.photoLabel, { n })}`}>✕</button>
+                </>
+              )}
+            </div>
+          </li>
+        );
+      })}
+    </ol>
+  );
+}
diff --git a/src/dashboard/features/album/album.css b/src/dashboard/features/album/album.css
new file mode 100644
index 0000000..00abc9d
--- /dev/null
+++ b/src/dashboard/features/album/album.css
@@ -0,0 +1,25 @@
+.dash-back { display: inline-block; margin-bottom: 1rem; color: var(--admin-muted); text-decoration: none; font: 0.8rem/1 var(--admin-font-mono); }
+.dash-back:hover { color: var(--admin-ink); }
+.dash-album-details { display: grid; gap: 0.4rem; max-width: 40rem; margin-bottom: 1.5rem; }
+.dash-album-details__title { font: 500 1.35rem/1.2 var(--admin-font-display); min-height: 52px; }
+.dash-album-details__subtitle { padding: 0.6rem 0.75rem; resize: vertical; min-height: 64px; }
+
+.dash-photo-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); }
+.dash-photo { display: grid; gap: 0.3rem; }
+.dash-photo-grid--reordering .dash-photo { cursor: grab; }
+.dash-photo__figure { position: relative; margin: 0; aspect-ratio: 4 / 5; border-radius: 3px; overflow: hidden; background: var(--admin-raised); box-shadow: 0 0 0 1px var(--admin-line); }
+.dash-photo__figure img { width: 100%; height: 100%; object-fit: cover; display: block; }
+.dash-photo__number { position: absolute; right: 0.4rem; bottom: 0.3rem; font: 0.7rem/1 var(--admin-font-mono); color: #fff; text-shadow: 0 1px 2px rgb(0 0 0 / 0.6); }
+.dash-photo__cover { position: absolute; left: 0.4rem; top: 0.4rem; padding: 0.2rem 0.45rem; border-radius: 999px; background: var(--admin-accent); color: var(--admin-on-accent); font: 500 0.65rem/1 var(--admin-font-mono); text-transform: uppercase; }
+.dash-photo__actions { display: flex; gap: 0.3rem; }
+.dash-photo__actions button {
+  flex: 1; min-height: 36px; border-radius: var(--admin-radius); border: 1px solid var(--admin-line);
+  background: transparent; color: var(--admin-ink); cursor: pointer;
+}
+.dash-photo__actions button[aria-pressed='true'] { background: var(--admin-accent); border-color: var(--admin-accent); color: var(--admin-on-accent); }
+.dash-photo__actions button:disabled { opacity: 0.45; cursor: default; }
+.dash-photo__delete { color: var(--admin-danger) !important; }
+.dash-album__danger { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--admin-line); }
+@media (max-width: 640px) {
+  .dash-photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
+}
````

---

### Task 5: Uploads

Upload button and drop area: files the browser cannot read are named; the others are compressed in the browser (today's pipeline, WebP, at most 1900 px, loaded only when needed), sent to the waiting area, and added to the draft manifest; per-file progress and failures with the Worker's reason. The upload is a mutation keyed 'draft-save': Publish and Discard wait for it, and uploads wait for a running publication. The fake Worker of the tests now awaits answers given as functions.

**Files:** `config/texts.config.js`, `config/texts.it.js`, `src/dashboard/features/album/AlbumScreen.jsx`, `src/dashboard/features/album/UploadPanel.jsx`, `src/dashboard/features/album/UploadPanel.test.jsx`, `src/dashboard/features/album/album.css`, `src/dashboard/features/publish/PublishBar.jsx`, `src/dashboard/test-utils.jsx`

- [ ] **Step 1: Tests first**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t5/TESTS); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t5/$f" "$f"; done
```

Run: `npm test` → 1 file fails.

- [ ] **Step 2: Implement**

```bash
for f in $(cat /srv/claude/workspaces/qa-browser/p42/t5/IMPL); do mkdir -p "$(dirname "$f")" && cp "/srv/claude/workspaces/qa-browser/p42/t5/$f" "$f"; done
```

- [ ] **Step 3: Check** — `npm test` → 100 files, 780 passed, 1 skipped; `npx vitest run src/dashboard 2>&1 | grep -c "act("` → 0. `git status --short` lists exactly the files above (plus the untracked `wrangler.json`).

- [ ] **Step 4: Commit**

```bash
git add config/texts.config.js config/texts.it.js src/dashboard/features/album/AlbumScreen.jsx src/dashboard/features/album/UploadPanel.jsx src/dashboard/features/album/UploadPanel.test.jsx src/dashboard/features/album/album.css src/dashboard/features/publish/PublishBar.jsx src/dashboard/test-utils.jsx
git commit -F - <<'EOF'
feat(dashboard): uploads to the waiting area, respecting publishing

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

**The change (diff):**

````diff
diff --git a/config/texts.config.js b/config/texts.config.js
index fcb6832..df1c5b8 100644
--- a/config/texts.config.js
+++ b/config/texts.config.js
@@ -184,6 +184,11 @@ export const texts = {
       deleteAlbum: 'Delete album',
       deleteAlbumTitle: 'Delete "{album}"?',
       deleteAlbumBody: 'The album and its photos disappear from the site when you publish.',
+      upload: 'Upload photos',
+      uploadFailedItem: '{nome}: {motivo}',
+      uploadWaits: 'Uploads wait until publishing is finished.',
+      dropHere: 'Drop the photos to upload them',
+      dropHint: 'You can also drop the photos here',
       cancel: 'Cancel',
     },
     status: {
diff --git a/config/texts.it.js b/config/texts.it.js
index 1531a32..125c963 100644
--- a/config/texts.it.js
+++ b/config/texts.it.js
@@ -182,6 +182,11 @@ export const texts = {
       deleteAlbum: 'Elimina l\'album',
       deleteAlbumTitle: 'Eliminare «{album}»?',
       deleteAlbumBody: 'L\'album e le sue foto spariscono dal sito quando pubblichi.',
+      upload: 'Carica foto',
+      uploadFailedItem: '{nome}: {motivo}',
+      uploadWaits: 'I caricamenti aspettano la fine della pubblicazione.',
+      dropHere: 'Rilascia le foto per caricarle',
+      dropHint: 'Puoi anche trascinare qui le foto',
       cancel: 'Annulla',
     },
     status: {
diff --git a/src/dashboard/features/album/AlbumScreen.jsx b/src/dashboard/features/album/AlbumScreen.jsx
index 8b5b02c..c06370e 100644
--- a/src/dashboard/features/album/AlbumScreen.jsx
+++ b/src/dashboard/features/album/AlbumScreen.jsx
@@ -10,6 +10,8 @@ import { Button } from '../../ui/Button.jsx';
 import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
 import { AlbumDetails } from './AlbumDetails.jsx';
 import { PhotoGrid } from './PhotoGrid.jsx';
+import { UploadPanel } from './UploadPanel.jsx';
+import { photoCount } from '../albums/AlbumCard.jsx';
 import '../albums/albums.css';
 import './album.css';
 
@@ -64,7 +66,7 @@ export function AlbumScreen() {
       <AlbumDetails album={album} onChange={updateAlbum} />
 
       <div className="dash-screen-head">
-        <p className="dash-label">{photos ? formatText(texts.admin.albums.photoCountMany, { n: photos.length }) : ''}</p>
+        <p className="dash-label">{photos ? photoCount(photos.length) : ''}</p>
         <div className="dash-screen-head__actions">
           {photos?.length > 1 && (
             <Button onClick={() => setReordering(value => !value)} aria-pressed={reordering}>
@@ -74,6 +76,7 @@ export function AlbumScreen() {
         </div>
       </div>
 
+      {photos && <UploadPanel slug={slug} photos={photos} setManifest={setManifest} />}
       {manifestError && <p className="dash-form__error" role="alert">{t.manifestError}</p>}
       {photos?.length === 0 && <p className="dash-empty">{t.empty}</p>}
       {photos?.length > 0 && (
diff --git a/src/dashboard/features/album/UploadPanel.jsx b/src/dashboard/features/album/UploadPanel.jsx
new file mode 100644
index 0000000..e700677
--- /dev/null
+++ b/src/dashboard/features/album/UploadPanel.jsx
@@ -0,0 +1,102 @@
+import { useId, useState } from 'react';
+import { useMutation } from '@tanstack/react-query';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { partitionBySupport, processFile } from '../../../admin/pipeline.js';
+import { runBatch } from '../../../admin/upload-manager.js';
+import { upload } from '../../api/client.js';
+import { useIsPublishing } from '../../api/queries.js';
+
+const t = texts.admin.album;
+
+/** The browser's compression (WebP, at most 1900 px), loaded only when a photo is uploaded. */
+export async function makeProcessFile() {
+  const { makeProcessDeps } = await import('../../../admin/encoder.js');
+  const deps = await makeProcessDeps();
+  return file => processFile(file, deps);
+}
+
+/**
+ * Uploads photos to an album: compressed in the browser, sent to the waiting area, added
+ * to the draft's manifest. The mutation key starts with 'draft-save', so Publish waits for
+ * it; and it waits for a running publication (spec, publishing rules).
+ * @param {{slug: string, photos: Array, setManifest: Function, makeProcessFileImpl?: Function}} props
+ */
+export function UploadPanel({ slug, photos, setManifest, makeProcessFileImpl = makeProcessFile }) {
+  const publishing = useIsPublishing();
+  const inputId = useId();
+  const [rows, setRows] = useState([]); // [{ name, phase }]
+  const [summary, setSummary] = useState(null); // { text, tone, failures }
+  const [dragging, setDragging] = useState(false);
+
+  const uploadBatch = useMutation({
+    mutationKey: ['draft-save', 'upload', slug],
+    mutationFn: async files => {
+      const processOne = await makeProcessFileImpl();
+      return runBatch({
+        files,
+        existingManifest: photos ?? [],
+        processFile: processOne,
+        uploadPhoto: (name, blob) => upload(`/api/admin/staging/${slug}/${encodeURIComponent(name)}`, blob),
+        putManifest: async entries => { setManifest(entries, { now: true }); },
+        onProgress: (name, phase) => setRows(current => {
+          const others = current.filter(row => row.name !== name);
+          return [...others, { name, phase }];
+        }),
+      });
+    },
+  });
+
+  const start = fileList => {
+    const { supported, unsupported } = partitionBySupport([...fileList]);
+    setRows([]);
+    setSummary(unsupported.length
+      ? { text: formatText(t.unsupportedFormat, { elenco: unsupported.map(file => file.name).join(', ') }), tone: 'error', failures: [] }
+      : null);
+    if (supported.length === 0) return;
+    uploadBatch.mutate(supported, {
+      onSuccess: ({ uploaded, failed }) => {
+        const failures = failed.map(item => formatText(t.uploadFailedItem, { nome: item.name, motivo: item.error?.message ?? String(item.error) }));
+        setSummary(failed.length === 0
+          ? { text: formatText(t.uploadSuccess, { n: uploaded.length }), tone: 'ok', failures }
+          : { text: formatText(t.uploadPartial, { uploaded: uploaded.length, failed: failed.length }), tone: 'error', failures });
+      },
+    });
+  };
+
+  const disabled = publishing || uploadBatch.isPending;
+  return (
+    <div
+      className={`dash-upload${dragging ? ' dash-upload--dragging' : ''}`}
+      onDragOver={event => { if (!disabled && event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setDragging(true); } }}
+      onDragLeave={() => setDragging(false)}
+      onDrop={event => {
+        setDragging(false);
+        if (disabled || !event.dataTransfer?.files?.length) return;
+        event.preventDefault();
+        start(event.dataTransfer.files);
+      }}
+    >
+      <label htmlFor={inputId} className={`dash-button dash-button--primary dash-upload__button${disabled ? ' is-disabled' : ''}`}>{t.upload}</label>
+      <input id={inputId} type="file" multiple accept="image/jpeg,image/png,image/webp" className="visually-hidden" disabled={disabled}
+        onChange={event => { start(event.target.files); event.target.value = ''; }} />
+      <p className="dash-upload__hint">{dragging ? t.dropHere : `${t.dropHint} · ${t.dropzoneConstraints}`}</p>
+      {publishing && <p className="dash-upload__hint" role="status">{t.uploadWaits}</p>}
+      {rows.length > 0 && (
+        <ul className="dash-upload__rows" aria-live="polite">
+          {rows.map(row => (
+            <li key={row.name} className={`dash-upload__row dash-upload__row--${row.phase}`}>
+              {formatText(t.uploadProgress, { nome: row.name, fase: t.uploadPhases[row.phase] ?? row.phase })}
+            </li>
+          ))}
+        </ul>
+      )}
+      {summary && (
+        <div className={`dash-upload__summary dash-upload__summary--${summary.tone}`} role={summary.tone === 'error' ? 'alert' : 'status'}>
+          <p>{summary.text}</p>
+          {summary.failures.length > 0 && <ul>{summary.failures.map(line => <li key={line}>{line}</li>)}</ul>}
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/src/dashboard/features/album/UploadPanel.test.jsx b/src/dashboard/features/album/UploadPanel.test.jsx
new file mode 100644
index 0000000..0413745
--- /dev/null
+++ b/src/dashboard/features/album/UploadPanel.test.jsx
@@ -0,0 +1,68 @@
+import { describe, expect, it, vi } from 'vitest';
+import { act, fireEvent, screen, waitFor } from '@testing-library/react';
+import { texts } from '../../../../config/texts.config.js';
+import { formatText } from '../../../utils/formatText.js';
+import { useSaveQueue } from '../../api/drafts.jsx';
+import { PublishBar } from '../publish/PublishBar.jsx';
+import { fakeWorker, renderWithQuery } from '../../test-utils.jsx';
+import { UploadPanel } from './UploadPanel.jsx';
+
+const t = texts.admin.album;
+const file = (name, type = 'image/jpeg') => new File(['x'], name, { type });
+// The browser's compression, replaced: every file becomes a small WebP.
+const makeProcessFileImpl = async () => async () => ({ blob: new Blob(['w'], { type: 'image/webp' }), width: 4, height: 3, uploadedAt: 1 });
+
+let queue;
+function Panel(props) {
+  queue = useSaveQueue();
+  return <UploadPanel slug="notte" photos={[{ name: 'a.webp', width: 4, height: 3 }]} makeProcessFileImpl={makeProcessFileImpl} {...props} />;
+}
+const choose = files => fireEvent.change(document.querySelector('input[type=file]'), { target: { files } });
+
+describe('UploadPanel', () => {
+  it('compresses, sends each photo to the waiting area, then adds them to the draft', async () => {
+    const setManifest = vi.fn();
+    const fetchMock = fakeWorker({
+      'PUT /api/admin/staging/notte/bosco.webp': { ok: true },
+      'PUT /api/admin/staging/notte/a-2.webp': { ok: true },
+    });
+    renderWithQuery(<Panel setManifest={setManifest} />);
+    choose([file('Bosco.JPG'), file('a.png', 'image/png')]);
+    expect(await screen.findByText(formatText(t.uploadSuccess, { n: 2 }))).toBeTruthy();
+    const staged = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([path]) => path).sort();
+    expect(staged).toEqual(['/api/admin/staging/notte/a-2.webp', '/api/admin/staging/notte/bosco.webp']);
+    const [entries, options] = setManifest.mock.calls.at(-1);
+    expect(entries.map(entry => entry.name)).toEqual(['a.webp', 'bosco.webp', 'a-2.webp']);
+    expect(options).toEqual({ now: true });
+  });
+
+  it('says which files the browser cannot upload', async () => {
+    fakeWorker({});
+    renderWithQuery(<Panel setManifest={vi.fn()} />);
+    choose([file('IMG_1.HEIC', '')]);
+    expect((await screen.findByRole('alert')).textContent).toContain('IMG_1.HEIC');
+  });
+
+  it('lists the photos that failed, with the reason', async () => {
+    fakeWorker({ 'PUT /api/admin/staging/notte/bosco.webp': { status: 413, body: { error: 'File over 10MB' } } });
+    renderWithQuery(<Panel setManifest={vi.fn()} />);
+    choose([file('bosco.jpg')]);
+    const alert = await screen.findByRole('alert');
+    expect(alert.textContent).toContain(formatText(t.uploadPartial, { uploaded: 0, failed: 1 }));
+    expect(alert.textContent).toContain(formatText(t.uploadFailedItem, { nome: 'bosco.webp', motivo: 'File over 10MB' }));
+  });
+
+  it('Publish waits while photos are being uploaded', async () => {
+    let finish;
+    fakeWorker({
+      'GET /api/admin/draft/status': { hasDraft: true, publishing: false, changes: [{ type: 'site' }] },
+      'PUT /api/admin/staging/notte/bosco.webp': () => new Promise(resolve => { finish = resolve; }),
+    });
+    renderWithQuery(<><Panel setManifest={vi.fn()} /><PublishBar /></>);
+    const publish = await screen.findByRole('button', { name: texts.admin.publish.publish });
+    choose([file('bosco.jpg')]);
+    await waitFor(() => expect(publish.disabled).toBe(true));
+    await act(async () => { finish(new Response('{"ok":true}', { status: 200 })); });
+    await waitFor(() => expect(publish.disabled).toBe(false));
+  });
+});
diff --git a/src/dashboard/features/album/album.css b/src/dashboard/features/album/album.css
index 00abc9d..e2dd6b2 100644
--- a/src/dashboard/features/album/album.css
+++ b/src/dashboard/features/album/album.css
@@ -23,3 +23,19 @@
 @media (max-width: 640px) {
   .dash-photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
 }
+
+.dash-upload {
+  display: grid; gap: 0.5rem; justify-items: start; margin: 0 0 1.25rem; padding: 1rem;
+  border: 1.5px dashed var(--admin-line); border-radius: var(--admin-radius);
+}
+.dash-upload--dragging { border-color: var(--admin-accent); background: color-mix(in srgb, var(--admin-accent) 8%, transparent); }
+.dash-upload__button { cursor: pointer; }
+.dash-upload__button.is-disabled { opacity: 0.55; pointer-events: none; }
+.dash-upload__hint { margin: 0; color: var(--admin-muted); font-size: 0.85rem; }
+.dash-upload__rows { margin: 0; padding: 0; list-style: none; font: 0.75rem/1.5 var(--admin-font-mono); color: var(--admin-muted); }
+.dash-upload__row--done { color: var(--admin-ok); }
+.dash-upload__row--failed { color: var(--admin-danger); }
+.dash-upload__summary p { margin: 0; }
+.dash-upload__summary ul { margin: 0.25rem 0 0; padding-left: 1.2rem; font-size: 0.85rem; }
+.dash-upload__summary--ok { color: var(--admin-ok); }
+.dash-upload__summary--error { color: var(--admin-danger); }
diff --git a/src/dashboard/features/publish/PublishBar.jsx b/src/dashboard/features/publish/PublishBar.jsx
index 6fbd3a6..c2b22d0 100644
--- a/src/dashboard/features/publish/PublishBar.jsx
+++ b/src/dashboard/features/publish/PublishBar.jsx
@@ -1,4 +1,5 @@
 import { useEffect, useRef, useState } from 'react';
+import { useIsMutating } from '@tanstack/react-query';
 import { texts } from '../../../../config/texts.config.js';
 import { formatText } from '../../../utils/formatText.js';
 import { useDiscard, useDraftStatus, usePublish } from '../../api/queries.js';
@@ -46,6 +47,9 @@ export function PublishBar() {
   const [listing, setListing] = useState(false);
   const queue = useSaveQueue();
   const saveState = useSaveState();
+  // An upload in progress writes to the draft outside the save queue: publishing or
+  // discarding waits for it (its mutation key starts with 'draft-save').
+  const uploading = useIsMutating({ mutationKey: ['draft-save'] }) > 0;
 
   const publish = usePublish({ onStep: step => setPhotosLeft(step.done ? null : step.remaining) });
   const discard = useDiscard();
@@ -109,7 +113,7 @@ export function PublishBar() {
     });
   };
 
-  const busy = publish.isPending || discard.isPending || saveState.saving;
+  const busy = publish.isPending || discard.isPending || saveState.saving || uploading;
   const count = changes.length === 1 ? t.changesOne : formatText(t.changesMany, { n: changes.length });
 
   return (
diff --git a/src/dashboard/test-utils.jsx b/src/dashboard/test-utils.jsx
index 61c40a8..769ab65 100644
--- a/src/dashboard/test-utils.jsx
+++ b/src/dashboard/test-utils.jsx
@@ -51,7 +51,8 @@ export function fakeWorker(answers) {
     let answer = queues.get(key);
     if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
     if (answer === undefined) return json({ error: 'NOT_FOUND' }, 404);
-    if (typeof answer === 'function') answer = answer(init);
+    // A function answers the request; it may return a promise (an answer that arrives later).
+    if (typeof answer === 'function') answer = await answer(init);
     if (answer instanceof Response) return answer;
     return answer?.status && answer.body !== undefined ? json(answer.body, answer.status) : json(answer);
   });
````

---
