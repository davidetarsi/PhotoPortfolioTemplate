# Dashboard in React, piano 4.1: fondamenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin` becomes the new React dashboard's frame: sections (tab bar on a phone, top bar on a computer), the draft's state, the publish bar (count, publish in steps, resume, discard with confirmation), the site's colours taken from its theme, and the building blocks later plans use (API client and TanStack Query hooks, `Sheet`, `ConfirmDialog`, `Button`, `Icon`). The screens themselves are placeholders filled by plans 4.2–4.4.

**Architecture:** As decided in the spec's architecture session: `src/dashboard/` organised by feature (`api/`, `features/<screen>/`, `ui/`, `lib/`, `styles/`); TanStack Query for server data, `useState` for interface state; React Router in hash mode (`/admin#/album/notte`) with a shared frame; the browser's `<dialog>` under `Sheet` and `ConfirmDialog`. A Vite plugin reads `custom/theme.css` at build time and hands the dashboard its colours and fonts (mapped to `--admin-*`), applied with `setProperty` because the CSP forbids `<style>` elements. `admin.html` loads the new app; the old dashboard's code stays in the repository until plan 4.4 removes it (the branch is not published before then).

**Tech Stack:** React 19, React Router 8, TanStack Query 5, Vitest 4 + Testing Library (jsdom).

**Spec:** `docs/maintainers/superpowers/specs/2026-09-27-dashboard-react-design.md` — sections "Dashboard" (Tema, Telefono e computer), "React: vincoli fissati qui" (the architecture decisions and the plan-4 split: this is 4.1), "Bozza e pubblicazione".

## Global Constraints

- Branch `feat/dashboard-react`. Never commit on `main`, never push (the controller pushes).
- Commit messages: subject, blank line, the two trailer lines, with the heredoc shown in each task.
- Stage files by name only: never `git add -A` or `git add .`. The untracked `wrangler.json` stays untracked; `.superpowers/` is git-ignored.
- Work only inside `/srv/claude/workspaces/`. Do not read or print credentials.
- Code, comments and test names in English. Visible copy only in `config/texts.config.js` and `config/texts.it.js`, same keys in both.
- The edits were applied to a disposable copy, checked in real Chromium (the built `/admin` with the built CSP, on a computer and a phone viewport: no console errors, navigation by hash, confirmation sheet), then replayed task by task from a clean checkout. They live as **ready files** and **checked scripts** in `/srv/claude/workspaces/qa-browser/p41/`: copy and run them, never edit them; if a script stops with an `AssertionError`, report NEEDS_CONTEXT with its message.
- Baseline before Task 1: 89 test files, 715 passed, 1 skipped.

---

### Task 1: Dependencies, the dashboard theme plugin, the guard on `.jsx`

**Files:** `package.json`, `package-lock.json` (through npm); create `src/utils/adminTheme.js`, `src/utils/adminTheme.test.js`; modify `vite.config.js` (the plugin), `src/shared/html-guard.test.js` (also scans `.jsx`, and forbids `dangerouslySetInnerHTML`).

**Interfaces — Produces:** `adminThemeTokens(cssText) → Record<string,string>`, `ADMIN_TOKEN_MAP`, `createAdminThemePlugin({ root })`; the virtual module `virtual:admin-theme` (default export: the tokens object).

- [ ] **Step 1: Test**

```bash
mkdir -p src/utils && cp /srv/claude/workspaces/qa-browser/p41/files/src/utils/adminTheme.test.js src/utils/adminTheme.test.js
```

`src/utils/adminTheme.test.js`:

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { adminThemeTokens } from './adminTheme.js';

describe('adminThemeTokens', () => {
  it('maps the site tokens of :root to dashboard tokens', () => {
    const css = `
      /* the site's theme */
      :root {
        --color-bg: #f8f3e6;
        --color-text: #15304a;
        --color-accent: #b0245f;
        --font-heading: 'Fraunces', serif;
        --space-md: 1rem;
      }
      .card { --color-bg: red; }`;
    expect(adminThemeTokens(css)).toEqual({
      '--admin-bg': '#f8f3e6',
      '--admin-ink': '#15304a',
      '--admin-accent': '#b0245f',
      '--admin-on-accent': '#ffffff',
      '--admin-font-display': "'Fraunces', serif",
    });
  });

  it('takes --admin-* tokens as they are, and they win over the mapped ones', () => {
    const css = ':root { --color-accent: #e3b341; --admin-accent: #123456; --admin-on-accent: #eeeeee; }';
    expect(adminThemeTokens(css)).toEqual({ '--admin-accent': '#123456', '--admin-on-accent': '#eeeeee' });
  });

  it('chooses dark text on a light accent', () => {
    expect(adminThemeTokens(':root { --color-accent: #e3b341; }')['--admin-on-accent']).toBe('#141517');
    expect(adminThemeTokens(':root { --color-accent: #fc0; }')['--admin-on-accent']).toBe('#141517');
  });

  it('skips values that depend on other variables, and non-hex accents get no computed text colour', () => {
    expect(adminThemeTokens(':root { --color-bg: var(--paper); --color-accent: rgb(1 2 3); }'))
      .toEqual({ '--admin-accent': 'rgb(1 2 3)' });
  });

  it('no :root, no tokens', () => {
    expect(adminThemeTokens('.x { color: red; }')).toEqual({});
    expect(adminThemeTokens('')).toEqual({});
  });
});
```

Run: `npm test` → 1 file fails (the module does not exist yet).

- [ ] **Step 2: Dependencies**

```bash
npm install @tanstack/react-query@^5.104.0 react-router@^8.4.0
npm install -D @testing-library/react@^16.3.3 @testing-library/user-event@^14.6.7 @testing-library/dom@^10.4.2
```

(`"license": "MIT"` must stay in `package.json`; the next step puts `"engines"` back on one line.)

- [ ] **Step 3: Implement**

```bash
mkdir -p src/utils && cp /srv/claude/workspaces/qa-browser/p41/files/src/utils/adminTheme.js src/utils/adminTheme.js
```
```bash
python3 /srv/claude/workspaces/qa-browser/p41/t1.py
```

`src/utils/adminTheme.js`:

```js
/**
 * The dashboard takes its colours and fonts from the site's own theme (custom/theme.css),
 * so each installation gets a dashboard that matches its site. Only custom properties of
 * `:root` are read, never selectors: a broken theme cannot break the dashboard.
 * Without a custom theme the dashboard keeps its own look (src/dashboard/styles/tokens.css).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Site token → dashboard token. */
export const ADMIN_TOKEN_MAP = Object.freeze({
  '--color-bg': '--admin-bg',
  '--color-surface': '--admin-surface',
  '--color-text': '--admin-ink',
  '--color-muted': '--admin-muted',
  '--color-border': '--admin-line',
  '--color-accent': '--admin-accent',
  '--font-body': '--admin-font-body',
  '--font-heading': '--admin-font-display',
  '--font-mono': '--admin-font-mono',
});

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Relative luminance of a #rgb / #rrggbb colour (WCAG), or null for anything else. */
function luminance(color) {
  const match = HEX_RE.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1];
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The dashboard tokens found in a theme's CSS.
 * Reads `--name: value;` declarations inside `:root { … }` blocks: site tokens are mapped
 * with ADMIN_TOKEN_MAP, `--admin-*` tokens are taken as they are. Values that depend on
 * other variables (`var(…)`) are skipped: the dashboard does not load the site's theme.
 * When the accent is a hex colour, the text on it (`--admin-on-accent`) is chosen dark or
 * light for contrast, unless the theme sets it.
 * @param {string} cssText
 * @returns {Record<string, string>} Dashboard custom properties.
 */
export function adminThemeTokens(cssText) {
  const tokens = {};
  const withoutComments = String(cssText).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, body] of withoutComments.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [, name, rawValue] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) {
      const value = rawValue.trim();
      if (!value || value.includes('var(')) continue;
      if (name.startsWith('--admin-')) tokens[name] = value;
      else if (ADMIN_TOKEN_MAP[name] && !(ADMIN_TOKEN_MAP[name] in tokens)) tokens[ADMIN_TOKEN_MAP[name]] = value;
    }
  }
  if (tokens['--admin-accent'] && !tokens['--admin-on-accent']) {
    const l = luminance(tokens['--admin-accent']);
    if (l !== null) tokens['--admin-on-accent'] = l > 0.35 ? '#141517' : '#ffffff';
  }
  return tokens;
}

const VIRTUAL_ID = 'virtual:admin-theme';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/**
 * Vite plugin: `import tokens from 'virtual:admin-theme'` gives the dashboard tokens read
 * from custom/theme.css at build time (an empty object without a custom theme).
 * @param {{root?: string}} [options]
 */
export function createAdminThemePlugin({ root = process.cwd() } = {}) {
  const themeFile = resolve(root, 'custom/theme.css');
  return {
    name: 'admin-theme',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const tokens = existsSync(themeFile) ? adminThemeTokens(readFileSync(themeFile, 'utf8')) : {};
      return `export default ${JSON.stringify(tokens)};`;
    },
  };
}
```

`/srv/claude/workspaces/qa-browser/p41/t1.py` — full text:

```python
# Plan 4.1, Task 1: the dashboard theme plugin in the build, and the guard on .jsx. Checked edits.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

# npm install writes "engines" over three lines: back to one.
edit('package.json', [('"engines": {\n    "node": ">=22.12"\n  },', '"engines": { "node": ">=22.12" },')])
edit('vite.config.js', [
 ("import { createFontsPlugin } from './src/utils/fontsPlugin.js'\n", "import { createFontsPlugin } from './src/utils/fontsPlugin.js'\nimport { createAdminThemePlugin } from './src/utils/adminTheme.js'\n"),
 ("    createFontsPlugin(googleFontsUrl),\n", "    createFontsPlugin(googleFontsUrl),\n    createAdminThemePlugin({ root: __dirname }),\n"),
])
edit('src/shared/html-guard.test.js', [
 ("""    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];""",
  """    return /\\.jsx?$/.test(entry.name) && !/\\.test\\.jsx?$/.test(entry.name) ? [path] : [];"""),
 ("""    expect(offenders).toEqual([]);
  });
});""", """    expect(offenders).toEqual([]);
  });

  it('never use dangerouslySetInnerHTML in React code: JSX escapes text by itself', () => {
    const offenders = sources('src').filter(file => readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'));
    expect(offenders).toEqual([]);
  });
});"""),
])
print('t1 applied')
```

- [ ] **Step 4: Check** — `npm test` → 90 files, 721 passed, 1 skipped. `git diff package.json` shows only the five new dependencies.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/adminTheme.js src/utils/adminTheme.test.js vite.config.js src/shared/html-guard.test.js
git commit -F - <<'EOF'
feat(build): dashboard dependencies, colours from the site theme, guard on .jsx

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: API client, query hooks, `Button`, `Sheet`, `ConfirmDialog`, `Icon`

**Files:** create everything listed below under `src/dashboard/api/`, `src/dashboard/ui/`, and `src/dashboard/test-utils.jsx`.

**Interfaces — Produces:**
- `request(path, { method, json, fetchImpl })` and `ApiError` (`status`, `body`) — `src/dashboard/api/client.js`.
- `keys`, `useDraft()`, `useDraftStatus()`, `usePublish({ onStep })`, `useDiscard()`, `useIsPublishing()` — `src/dashboard/api/queries.js`. Every save hook of later plans must be disabled while `useIsPublishing()` is true (spec rule).
- `Button({ variant: 'primary'|'secondary'|'danger' })`, `Sheet({ open, onClose, title, children })`, `ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel, busy })`, `Icon({ name, size })`.
- Test helpers: `installDialogPolyfill()`, `makeQueryClient()`, `renderWithQuery(ui)`, `fakeWorker(answers)`; importing `test-utils.jsx` registers Testing Library's cleanup after each test.

- [ ] **Step 1: Tests**

```bash
mkdir -p src/dashboard/api && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/api/client.test.js src/dashboard/api/client.test.js
mkdir -p src/dashboard/ui && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/ui/Sheet.test.jsx src/dashboard/ui/Sheet.test.jsx
mkdir -p src/dashboard && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/test-utils.jsx src/dashboard/test-utils.jsx
```

`src/dashboard/api/client.test.js`:

```js
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './client.js';

const res = (body, status = 200) => new Response(JSON.stringify(body), { status });

describe('request', () => {
  it('sends JSON and returns the answer', async () => {
    const fetchImpl = vi.fn(async () => res({ ok: true }));
    expect(await request('/api/admin/draft/site', { method: 'PUT', json: { name: 'D' }, fetchImpl })).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/admin/draft/site', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"name":"D"}',
    });
  });

  it('an error answer becomes an ApiError with status and body', async () => {
    const fetchImpl = async () => res({ error: 'PUBLISH_IN_PROGRESS' }, 409);
    const error = await request('/api/admin/draft', { method: 'DELETE', fetchImpl }).catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.body).toEqual({ error: 'PUBLISH_IN_PROGRESS' });
    expect(error.message).toBe('PUBLISH_IN_PROGRESS');
  });

  it('a network failure is an ApiError with status 0', async () => {
    const error = await request('/x', { fetchImpl: async () => { throw new TypeError('down'); } }).catch(e => e);
    expect(error.status).toBe(0);
    expect(error.body.error).toBe('NETWORK');
  });

  it('an answer that is not JSON still reports its status', async () => {
    const error = await request('/x', { fetchImpl: async () => new Response('<html>', { status: 502 }) }).catch(e => e);
    expect(error.status).toBe(502);
    expect(error.message).toBe('HTTP 502');
  });
});
```

`src/dashboard/ui/Sheet.test.jsx`:

```jsx
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from './Sheet.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { installDialogPolyfill } from '../test-utils.jsx';

beforeAll(installDialogPolyfill);

describe('Sheet', () => {
  it('opens and closes with its `open` prop', () => {
    const { rerender } = render(<Sheet open={false} onClose={() => {}} title="Titolo">body</Sheet>);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.open).toBe(false);
    rerender(<Sheet open onClose={() => {}} title="Titolo">body</Sheet>);
    expect(dialog.open).toBe(true);
    expect(screen.getByRole('heading', { name: 'Titolo' })).toBeTruthy();
    rerender(<Sheet open={false} onClose={() => {}} title="Titolo">body</Sheet>);
    expect(dialog.open).toBe(false);
  });

  it('Esc and a click on the backdrop ask the parent to close; a click inside does not', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="T"><button type="button">inside</button></Sheet>);
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole('button', { name: 'inside' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ConfirmDialog', () => {
  it('confirm and cancel call their handlers; busy disables both', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const props = { open: true, title: 'Sicuro?', body: 'Testo', confirmLabel: 'Elimina', cancelLabel: 'Indietro', onConfirm, onCancel };
    const { rerender } = render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<ConfirmDialog {...props} busy />);
    expect(screen.getByRole('button', { name: 'Elimina' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Indietro' }).disabled).toBe(true);
  });
});
```

`src/dashboard/test-utils.jsx`:

```jsx
// Helpers for the dashboard's tests: a fresh query cache per test and a fake Worker
// answering the admin routes.
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, vi } from 'vitest';

// Vitest runs without globals, so Testing Library cannot clean up by itself: unmount
// what each test rendered, in every file that uses these helpers.
afterEach(() => cleanup());

/** jsdom has no <dialog> methods: open and close by attribute, as the browser shows it. */
export function installDialogPolyfill() {
  const proto = globalThis.HTMLDialogElement?.prototype;
  if (!proto || proto.showModal) return;
  proto.showModal = function showModal() { this.setAttribute('open', ''); };
  proto.close = function close() { this.removeAttribute('open'); };
}

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** Renders one component inside a query cache. */
export function renderWithQuery(ui) {
  const client = makeQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * A fake Worker: `routes` maps 'METHOD /path' to a body, a function of the request, or an
 * array of answers used in turn. Unknown routes answer 404. Returns the fetch mock.
 */
export function fakeWorker(answers) {
  const queues = new Map(Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
  const fetchMock = vi.fn(async (path, init = {}) => {
    const key = `${init.method ?? 'GET'} ${path}`;
    let answer = queues.get(key);
    if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
    if (answer === undefined) return json({ error: 'NOT_FOUND' }, 404);
    if (typeof answer === 'function') answer = answer(init);
    if (answer instanceof Response) return answer;
    return answer?.status && answer.body !== undefined ? json(answer.body, answer.status) : json(answer);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
```

Run: `npm test` → 2 files fail.

- [ ] **Step 2: Implement**

```bash
mkdir -p src/dashboard/api && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/api/client.js src/dashboard/api/client.js
mkdir -p src/dashboard/api && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/api/queries.js src/dashboard/api/queries.js
mkdir -p src/dashboard/ui && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/ui/Button.jsx src/dashboard/ui/Button.jsx
mkdir -p src/dashboard/ui && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/ui/Sheet.jsx src/dashboard/ui/Sheet.jsx
mkdir -p src/dashboard/ui && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/ui/ConfirmDialog.jsx src/dashboard/ui/ConfirmDialog.jsx
mkdir -p src/dashboard/ui && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/ui/Icon.jsx src/dashboard/ui/Icon.jsx
mkdir -p src/dashboard/ui && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/ui/ui.css src/dashboard/ui/ui.css
```

`src/dashboard/api/client.js`:

```js
/**
 * Calls to the Worker's admin routes (behind Cloudflare Access). Every error becomes an
 * ApiError carrying the status and the Worker's JSON body, so screens can explain it.
 */

export class ApiError extends Error {
  /**
   * @param {number} status - HTTP status, 0 when the network failed.
   * @param {object} body - The Worker's JSON answer, e.g. { error: 'PUBLISH_IN_PROGRESS' }.
   */
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body ?? {};
  }
}

/**
 * @param {string} path - Absolute path, e.g. '/api/admin/draft'.
 * @param {{method?: string, json?: any, fetchImpl?: Function}} [options]
 * @returns {Promise<any>} The parsed JSON answer.
 */
export async function request(path, { method = 'GET', json, fetchImpl = globalThis.fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(path, {
      method,
      headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, { error: 'NETWORK' });
  }
  let body = {};
  try { body = await res.json(); } catch { /* an empty or non-JSON answer */ }
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}
```

`src/dashboard/api/queries.js`:

```js
/**
 * TanStack Query hooks for the draft and the publication. Screens read with these hooks
 * and never call fetch themselves.
 */
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './client.js';

export const keys = Object.freeze({
  draft: ['draft'],
  status: ['draft-status'],
});

/** The draft's site and album list ({ site, albums, hasDraft }). */
export function useDraft() {
  return useQuery({ queryKey: keys.draft, queryFn: () => request('/api/admin/draft') });
}

/** What publishing would change ({ hasDraft, publishing, changes }). */
export function useDraftStatus() {
  return useQuery({ queryKey: keys.status, queryFn: () => request('/api/admin/draft/status') });
}

/** Everything that depends on the draft is read again. */
function useRefreshDraft() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

/**
 * Publishes in steps: calls POST /api/admin/publish until it says done, reporting the
 * photos left after each step. A 409 with problems rejects with them in error.body.
 * @param {{onStep?: (step: {copied: number, remaining: number}) => void}} [options]
 */
export function usePublish({ onStep } = {}) {
  const refresh = useRefreshDraft();
  return useMutation({
    mutationKey: ['publish'],
    mutationFn: async () => {
      for (;;) {
        const step = await request('/api/admin/publish', { method: 'POST' });
        onStep?.(step);
        if (step.done) return step;
      }
    },
    onSettled: refresh,
  });
}

/** Deletes the draft and the waiting photos. Refused (409) once a publication started. */
export function useDiscard() {
  const refresh = useRefreshDraft();
  return useMutation({
    mutationKey: ['discard'],
    mutationFn: () => request('/api/admin/draft', { method: 'DELETE' }),
    onSettled: refresh,
  });
}

/**
 * True while a publication runs. Saving the draft and uploading photos must wait:
 * the publication's close removes the draft files it started from (spec, plan-2 rules).
 */
export function useIsPublishing() {
  return useIsMutating({ mutationKey: ['publish'] }) > 0;
}
```

`src/dashboard/ui/Button.jsx`:

```jsx
import './ui.css';

/**
 * A button of the dashboard. `variant`: 'primary' (the screen's main action, in the accent
 * colour), 'secondary' (default) or 'danger' (destructive, never filled).
 * @param {{variant?: 'primary'|'secondary'|'danger', type?: string}} props
 */
export function Button({ variant = 'secondary', type = 'button', className = '', ...props }) {
  return <button type={type} className={`dash-button dash-button--${variant} ${className}`.trim()} {...props} />;
}
```

`src/dashboard/ui/Sheet.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import './ui.css';

/**
 * A modal panel on the browser's own <dialog>: it keeps the focus inside, closes with Esc
 * and gives the focus back when it closes. On a phone it rises from the bottom; on a wider
 * screen it is centred. Open and closed are driven by `open`; Esc or the backdrop call
 * `onClose`, and the parent decides.
 * @param {{open: boolean, onClose: Function, title: string, children: any, className?: string}} props
 */
export function Sheet({ open, onClose, title, children, className = '' }) {
  const ref = useRef(null);

  // A <dialog> is opened with a method, not an attribute: this is where React talks to the DOM.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dash-sheet ${className}`.trim()}
      aria-label={title}
      // Esc: the browser fires "cancel"; the parent closes by changing `open`.
      onCancel={event => { event.preventDefault(); onClose(); }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={event => { if (event.target === ref.current) onClose(); }}
    >
      <div className="dash-sheet__body">
        <h2 className="dash-sheet__title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
```

`src/dashboard/ui/ConfirmDialog.jsx`:

```jsx
import { Button } from './Button.jsx';
import { Sheet } from './Sheet.jsx';

/**
 * Asks before a destructive action, in the page (the browser's confirm() is not used).
 * @param {{open: boolean, title: string, body: string, confirmLabel: string, cancelLabel: string,
 *   onConfirm: Function, onCancel: Function, busy?: boolean}} props
 */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel, busy = false }) {
  return (
    <Sheet open={open} onClose={onCancel} title={title} className="dash-confirm">
      <p className="dash-confirm__body">{body}</p>
      <div className="dash-confirm__actions">
        <Button onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
      </div>
    </Sheet>
  );
}
```

`src/dashboard/ui/Icon.jsx`:

```jsx
/** Small line icons, drawn inline (no external files, compatible with the CSP). */
const PATHS = {
  albums: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  site: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  messages: 'M3 6h18v12H3zM3 6l9 7 9-7',
};

/**
 * @param {{name: keyof PATHS, size?: number}} props
 */
export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
```

`src/dashboard/ui/ui.css`:

```css
.dash-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  min-height: 40px; padding: 0 0.95rem;
  border-radius: var(--admin-radius); border: 1px solid var(--admin-line);
  background: transparent; color: var(--admin-ink);
  font-weight: 500; font-size: 0.9rem; cursor: pointer; text-decoration: none;
}
.dash-button:hover { background: var(--admin-raised); }
.dash-button:disabled { opacity: 0.55; cursor: default; }
.dash-button--primary { background: var(--admin-accent); border-color: var(--admin-accent); color: var(--admin-on-accent); }
.dash-button--primary:hover { background: var(--admin-accent); filter: brightness(1.08); }
.dash-button--danger { color: var(--admin-danger); border-color: color-mix(in srgb, var(--admin-danger) 45%, transparent); }

.dash-sheet {
  padding: 0; border: 1px solid var(--admin-line); border-radius: 16px;
  background: var(--admin-surface); color: var(--admin-ink);
  width: min(32rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem);
}
.dash-sheet::backdrop { background: rgb(0 0 0 / 0.55); }
.dash-sheet__body { padding: 1.25rem; display: grid; gap: 1rem; }
.dash-sheet__title { margin: 0; font: 500 1.05rem/1.3 var(--admin-font-display); }
@media (max-width: 640px) {
  /* On a phone the panel rises from the bottom, full width. */
  .dash-sheet {
    width: 100%; max-width: none; margin: auto 0 0; border-radius: 16px 16px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
.dash-confirm__body { margin: 0; color: var(--admin-muted); }
.dash-confirm__actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
```

- [ ] **Step 3: Check** — `npm test` → 92 files, 728 passed, 1 skipped; no React `act(...)` warnings in the output.

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/api/client.test.js src/dashboard/ui/Sheet.test.jsx src/dashboard/test-utils.jsx src/dashboard/api/client.js src/dashboard/api/queries.js src/dashboard/ui/Button.jsx src/dashboard/ui/Sheet.jsx src/dashboard/ui/ConfirmDialog.jsx src/dashboard/ui/Icon.jsx src/dashboard/ui/ui.css
git commit -F - <<'EOF'
feat(dashboard): API client, query hooks and the first interface blocks

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: The frame, the publish bar, `/admin` on the new app

**Files:** create the files listed below; modify `config/texts.config.js`, `config/texts.it.js` (keys `admin.common.navSite`, `navLabel`, `loadError` and the group `admin.publish`), `admin.html` (loads `src/dashboard/main.jsx`).

**Interfaces:**
- Consumes (Task 2): the hooks, `Button`, `ConfirmDialog`, `Icon`, the test helpers.
- Produces: `routes` and `App` (`src/dashboard/App.jsx`); `PublishBar` and `describeProblem(problem)`; placeholder screens `AlbumsScreen`, `AlbumScreen`, `SiteScreen`, `MessagesScreen` that plans 4.2–4.4 replace.

- [ ] **Step 1: Tests**

```bash
mkdir -p src/dashboard && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/App.test.jsx src/dashboard/App.test.jsx
mkdir -p src/dashboard/features/publish && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/features/publish/PublishBar.test.jsx src/dashboard/features/publish/PublishBar.test.jsx
```

`src/dashboard/App.test.jsx`:

```jsx
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { texts } from '../../config/texts.config.js';
import { routes } from './App.jsx';
import { fakeWorker, installDialogPolyfill, makeQueryClient } from './test-utils.jsx';

/** The whole dashboard at a hash path, e.g. '/album/notte', with the real routes in memory. */
function renderDashboard(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<QueryClientProvider client={makeQueryClient()}><RouterProvider router={router} /></QueryClientProvider>) };
}

beforeAll(installDialogPolyfill);
afterEach(() => vi.unstubAllGlobals());

const DRAFT = { site: { name: 'Davide Tarsi', bio: '', hero: null }, albums: [], hasDraft: false };
const STATUS = { hasDraft: false, publishing: false, changes: [] };

describe('dashboard frame', () => {
  it('shows the site name, the state, and the three sections', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    renderDashboard('/');
    expect(await screen.findByText('Davide Tarsi')).toBeTruthy();
    expect(await screen.findByText(texts.admin.publish.allPublished)).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: texts.admin.common.navLabel });
    expect([...nav.querySelectorAll('a')].map(a => a.textContent)).toEqual([
      texts.admin.common.navAlbums, texts.admin.common.navSite, texts.admin.common.navMessages,
    ]);
    expect(screen.getByRole('link', { name: texts.admin.common.navAlbums }).className).toContain('active');
  });

  it('moves between sections and opens an album by address', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    const { router } = renderDashboard('/');
    fireEvent.click(await screen.findByRole('link', { name: texts.admin.common.navSite }));
    expect(await screen.findByRole('heading', { name: texts.admin.site.sectionTitle })).toBeTruthy();
    await router.navigate('/album/notte');
    expect(await screen.findByRole('heading', { name: 'notte' })).toBeTruthy();
  });

  it('an unknown address goes back to the albums', async () => {
    fakeWorker({ 'GET /api/admin/draft': DRAFT, 'GET /api/admin/draft/status': STATUS });
    const { router } = renderDashboard('/nowhere');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('says so when the draft cannot be loaded', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS });
    renderDashboard('/');
    expect((await screen.findByRole('alert')).textContent).toBe(texts.admin.common.loadError);
  });
});
```

`src/dashboard/features/publish/PublishBar.test.jsx`:

```jsx
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { texts } from '../../../../config/texts.config.js';
import { PublishBar, describeProblem } from './PublishBar.jsx';
import { fakeWorker, installDialogPolyfill, renderWithQuery } from '../../test-utils.jsx';

const t = texts.admin.publish;
beforeAll(installDialogPolyfill);
afterEach(() => vi.unstubAllGlobals());

const STATUS_DRAFT = { hasDraft: true, publishing: false, changes: [{ type: 'site' }, { type: 'album-added', slug: 'notte' }] };
const STATUS_CLEAN = { hasDraft: false, publishing: false, changes: [] };

describe('PublishBar', () => {
  it('is hidden when everything is published', async () => {
    const fetchMock = fakeWorker({ 'GET /api/admin/draft/status': STATUS_CLEAN });
    const { container } = renderWithQuery(<PublishBar />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector('.dash-publish')).toBeNull();
  });

  it('counts the changes and links to the preview of the whole site', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': STATUS_DRAFT });
    renderWithQuery(<PublishBar />);
    expect(await screen.findByText('2 changes')).toBeTruthy();
    const preview = screen.getByRole('link', { name: t.preview });
    expect(preview.getAttribute('href')).toBe('/?preview=1');
  });

  it('publishes in steps until done, showing the photos left', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
      'POST /api/admin/publish': [{ done: false, copied: 25, remaining: 5 }, { done: true, copied: 5, remaining: 0 }],
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.publish }));
    expect(await screen.findByText(t.published)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  });

  it('lists what stops the publication', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': STATUS_DRAFT,
      'POST /api/admin/publish': { status: 409, body: { error: 'PUBLISH_CHECK_FAILED', problems: [{ slug: 'notte', name: 'a.webp', reason: 'PHOTO_MISSING' }] } },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.publish }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(describeProblem({ slug: 'notte', name: 'a.webp', reason: 'PHOTO_MISSING' }))).toBeTruthy();
  });

  it('offers to resume a publication that stopped half-way', async () => {
    fakeWorker({ 'GET /api/admin/draft/status': { ...STATUS_DRAFT, publishing: true } });
    renderWithQuery(<PublishBar />);
    expect(await screen.findByRole('button', { name: t.resume })).toBeTruthy();
  });

  it('discards after a confirmation in the page', async () => {
    const fetchMock = fakeWorker({
      'GET /api/admin/draft/status': [STATUS_DRAFT, STATUS_CLEAN],
      'DELETE /api/admin/draft': { ok: true },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect(await screen.findByText(t.discarded)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/admin/draft' && init?.method === 'DELETE')).toBe(true);
  });

  it('says to finish with Publish when discarding is refused', async () => {
    fakeWorker({
      'GET /api/admin/draft/status': { ...STATUS_DRAFT, publishing: true },
      'DELETE /api/admin/draft': { status: 409, body: { error: 'PUBLISH_IN_PROGRESS' } },
    });
    renderWithQuery(<PublishBar />);
    fireEvent.click(await screen.findByRole('button', { name: t.discard }));
    fireEvent.click(await screen.findByRole('button', { name: t.discardConfirm }));
    expect(await screen.findByText(t.inProgress)).toBeTruthy();
  });
});
```

Run: `npm test` → 2 files fail.

- [ ] **Step 2: Implement**

```bash
python3 /srv/claude/workspaces/qa-browser/p41/t3-texts.py
python3 /srv/claude/workspaces/qa-browser/p41/t3.py
```
```bash
mkdir -p src/dashboard/features/publish && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/features/publish/PublishBar.jsx src/dashboard/features/publish/PublishBar.jsx
mkdir -p src/dashboard/features/publish && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/features/publish/publish.css src/dashboard/features/publish/publish.css
mkdir -p src/dashboard/features/albums && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/features/albums/AlbumsScreen.jsx src/dashboard/features/albums/AlbumsScreen.jsx
mkdir -p src/dashboard/features/album && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/features/album/AlbumScreen.jsx src/dashboard/features/album/AlbumScreen.jsx
mkdir -p src/dashboard/features/site && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/features/site/SiteScreen.jsx src/dashboard/features/site/SiteScreen.jsx
mkdir -p src/dashboard/features/messages && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/features/messages/MessagesScreen.jsx src/dashboard/features/messages/MessagesScreen.jsx
mkdir -p src/dashboard && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/App.jsx src/dashboard/App.jsx
mkdir -p src/dashboard && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/app.css src/dashboard/app.css
mkdir -p src/dashboard && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/main.jsx src/dashboard/main.jsx
mkdir -p src/dashboard/styles && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/styles/tokens.css src/dashboard/styles/tokens.css
mkdir -p src/dashboard/styles && cp /srv/claude/workspaces/qa-browser/p41/files/src/dashboard/styles/base.css src/dashboard/styles/base.css
```

`/srv/claude/workspaces/qa-browser/p41/t3-texts.py` — full text:

```python
# Plan 4.1: dashboard copy (English and Italian, same keys). Checked edits.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('config/texts.config.js', [
 ("      navAlbums: 'Albums',\n      navMessages: 'Messages',\n    },\n",
  """      navAlbums: 'Albums',
      navMessages: 'Messages',
      navSite: 'Site',
      navLabel: 'Dashboard sections',
      loadError: 'Could not load the dashboard. Check your connection and reload the page.',
    },
    publish: {
      changesOne: '1 change',
      changesMany: '{n} changes',
      preview: 'Preview',
      publish: 'Publish',
      resume: 'Resume publishing',
      publishing: 'Publishing…',
      photosLeft: 'Publishing… {n} photos left',
      published: 'Published.',
      allPublished: 'Everything is published',
      draftSaved: 'Draft saved',
      discard: 'Discard changes',
      discardTitle: 'Discard all changes?',
      discardBody: 'The draft and the photos waiting to be published are deleted. The site stays as it is.',
      discardConfirm: 'Discard',
      discarded: 'Changes discarded.',
      cancel: 'Cancel',
      inProgress: 'A publication has started: finish it with Publish.',
      problemsTitle: 'Not published yet: fix these first.',
      problemPhotoMissing: '{album}: the photo {name} is missing.',
      problemCover: '{album}: the cover {name} is not in the album.',
      problemHero: 'Home image {name} is not in the album {album}.',
      failed: 'Publishing stopped: {message}. Press Publish to resume.',
    },
"""),
])
edit('config/texts.it.js', [
 ("      navAlbums: 'Album',\n      navMessages: 'Messaggi',\n    },\n",
  """      navAlbums: 'Album',
      navMessages: 'Messaggi',
      navSite: 'Sito',
      navLabel: 'Sezioni della dashboard',
      loadError: 'Impossibile caricare la dashboard. Controlla la connessione e ricarica la pagina.',
    },
    publish: {
      changesOne: '1 modifica',
      changesMany: '{n} modifiche',
      preview: 'Anteprima',
      publish: 'Pubblica',
      resume: 'Riprendi la pubblicazione',
      publishing: 'Pubblicazione…',
      photosLeft: 'Pubblicazione… mancano {n} foto',
      published: 'Pubblicato.',
      allPublished: 'Tutto pubblicato',
      draftSaved: 'Bozza salvata',
      discard: 'Annulla le modifiche',
      discardTitle: 'Annullare tutte le modifiche?',
      discardBody: 'La bozza e le foto in attesa di pubblicazione vengono cancellate. Il sito resta com\\'è.',
      discardConfirm: 'Annulla le modifiche',
      discarded: 'Modifiche annullate.',
      cancel: 'Indietro',
      inProgress: 'Una pubblicazione è iniziata: completala con Pubblica.',
      problemsTitle: 'Non ancora pubblicato: prima sistema questi punti.',
      problemPhotoMissing: '{album}: manca la foto {name}.',
      problemCover: '{album}: la copertina {name} non è nell\\'album.',
      problemHero: 'L\\'immagine della home {name} non è nell\\'album {album}.',
      failed: 'Pubblicazione interrotta: {message}. Premi Pubblica per riprendere.',
    },
"""),
])
print('texts applied')
```

`/srv/claude/workspaces/qa-browser/p41/t3.py` — full text:

```python
# Plan 4.1, Task 3: /admin loads the new dashboard. Checked edit.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:70], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('admin.html', [('    <main id="admin-root" class="admin-root"></main>\n    <script type="module" src="/src/pages/admin.js"></script>',
 '    <div id="admin-root"></div>\n    <script type="module" src="/src/dashboard/main.jsx"></script>')])
print('t3 applied')
```

`src/dashboard/features/publish/PublishBar.jsx`:

```jsx
import { useState } from 'react';
import { texts } from '../../../../config/texts.config.js';
import { formatText } from '../../../utils/formatText.js';
import { useDiscard, useDraftStatus, usePublish } from '../../api/queries.js';
import { Button } from '../../ui/Button.jsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.jsx';
import './publish.css';

const t = texts.admin.publish;

/** One line per problem that stops a publication. */
export function describeProblem({ slug, name, reason }) {
  const template = { PHOTO_MISSING: t.problemPhotoMissing, COVER_NOT_IN_ALBUM: t.problemCover, HERO_NOT_IN_ALBUM: t.problemHero }[reason];
  return formatText(template ?? t.problemPhotoMissing, { album: slug, name });
}

/**
 * "N changes · Preview · Publish": shown while the draft differs from the published site,
 * or while a publication has to be resumed. Publishes in steps and says what stops it.
 */
export function PublishBar() {
  const status = useDraftStatus();
  const [photosLeft, setPhotosLeft] = useState(null);
  const [message, setMessage] = useState(null); // { text, tone: 'ok' | 'error' }
  const [problems, setProblems] = useState([]);
  const [confirming, setConfirming] = useState(false);

  const publish = usePublish({ onStep: step => setPhotosLeft(step.done ? null : step.remaining) });
  const discard = useDiscard();

  const { hasDraft = false, publishing = false, changes = [] } = status.data ?? {};
  if (!hasDraft && !publishing && !message) return null;

  const onPublish = () => {
    setMessage(null);
    setProblems([]);
    publish.mutate(undefined, {
      onSuccess: () => { setPhotosLeft(null); setMessage({ text: t.published, tone: 'ok' }); },
      onError: error => {
        setPhotosLeft(null);
        if (error.body?.error === 'PUBLISH_CHECK_FAILED') setProblems(error.body.problems ?? []);
        else setMessage({ text: formatText(t.failed, { message: error.message }), tone: 'error' });
      },
    });
  };

  const onDiscard = () => {
    discard.mutate(undefined, {
      onSuccess: () => { setConfirming(false); setProblems([]); setMessage({ text: t.discarded, tone: 'ok' }); },
      onError: error => {
        setConfirming(false);
        setMessage({ text: error.body?.error === 'PUBLISH_IN_PROGRESS' ? t.inProgress : formatText(t.failed, { message: error.message }), tone: 'error' });
      },
    });
  };

  const busy = publish.isPending || discard.isPending;
  const count = changes.length === 1 ? t.changesOne : formatText(t.changesMany, { n: changes.length });

  return (
    <section className="dash-publish" aria-label={t.publish}>
      <div className="dash-publish__row">
        <p className="dash-publish__count" role="status">
          {publish.isPending ? (photosLeft ? formatText(t.photosLeft, { n: photosLeft }) : t.publishing)
            : hasDraft || publishing ? count : message?.text}
        </p>
        {(hasDraft || publishing) && (
          <div className="dash-publish__actions">
            <Button onClick={() => setConfirming(true)} disabled={busy} className="dash-publish__discard">{t.discard}</Button>
            <a className="dash-button dash-button--secondary" href="/?preview=1" target="_blank" rel="noopener">{t.preview}</a>
            <Button variant="primary" onClick={onPublish} disabled={busy}>{publishing ? t.resume : t.publish}</Button>
          </div>
        )}
      </div>
      {message && (hasDraft || publishing) && (
        <p className={`dash-publish__message dash-publish__message--${message.tone}`}>{message.text}</p>
      )}
      {problems.length > 0 && (
        <div className="dash-publish__problems" role="alert">
          <p>{t.problemsTitle}</p>
          <ul>{problems.map(problem => <li key={`${problem.slug}/${problem.name}/${problem.reason}`}>{describeProblem(problem)}</li>)}</ul>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={t.discardTitle}
        body={t.discardBody}
        confirmLabel={t.discardConfirm}
        cancelLabel={t.cancel}
        busy={discard.isPending}
        onConfirm={onDiscard}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
```

`src/dashboard/features/publish/publish.css`:

```css
.dash-publish {
  position: sticky; bottom: 0; z-index: 5;
  background: var(--admin-surface); border-top: 1px solid var(--admin-line);
  padding: 0.6rem 1.25rem;
}
.dash-publish__row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.dash-publish__count { margin: 0; font: 500 0.8rem/1.3 var(--admin-font-mono); color: var(--admin-ink); }
.dash-publish__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.dash-publish__discard { border-color: transparent; color: var(--admin-muted); }
.dash-publish__message { margin: 0.4rem 0 0; font-size: 0.85rem; }
.dash-publish__message--ok { color: var(--admin-ok); }
.dash-publish__message--error { color: var(--admin-danger); }
.dash-publish__problems { margin-top: 0.5rem; font-size: 0.85rem; color: var(--admin-danger); }
.dash-publish__problems p { margin: 0; }
.dash-publish__problems ul { margin: 0.25rem 0 0; padding-left: 1.2rem; }
@media (max-width: 640px) {
  /* Above the tab bar on a phone. */
  .dash-publish { bottom: var(--admin-tabs-height); }
  .dash-publish__actions { width: 100%; }
  .dash-publish__actions > :last-child { flex: 1; }
}
```

`src/dashboard/features/albums/AlbumsScreen.jsx`:

```jsx
import { texts } from '../../../../config/texts.config.js';

/** The gallery of albums. Filled in plan 4.2. */
export function AlbumsScreen() {
  return <h1 className="dash-screen-title">{texts.admin.albums.sectionTitle}</h1>;
}
```

`src/dashboard/features/album/AlbumScreen.jsx`:

```jsx
import { useParams } from 'react-router';

/** An open album. Filled in plan 4.2. */
export function AlbumScreen() {
  const { slug } = useParams();
  return <h1 className="dash-screen-title">{slug}</h1>;
}
```

`src/dashboard/features/site/SiteScreen.jsx`:

```jsx
import { texts } from '../../../../config/texts.config.js';

/** Identity, texts and links of the site. Filled in plan 4.3. */
export function SiteScreen() {
  return <h1 className="dash-screen-title">{texts.admin.site.sectionTitle}</h1>;
}
```

`src/dashboard/features/messages/MessagesScreen.jsx`:

```jsx
import { texts } from '../../../../config/texts.config.js';

/** Messages from the contact form. Filled in plan 4.4. */
export function MessagesScreen() {
  return <h1 className="dash-screen-title">{texts.admin.messages.sectionTitle}</h1>;
}
```

`src/dashboard/App.jsx`:

```jsx
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router';
import { texts } from '../../config/texts.config.js';
import { useDraft, useDraftStatus } from './api/queries.js';
import { Icon } from './ui/Icon.jsx';
import { PublishBar } from './features/publish/PublishBar.jsx';
import { AlbumsScreen } from './features/albums/AlbumsScreen.jsx';
import { AlbumScreen } from './features/album/AlbumScreen.jsx';
import { SiteScreen } from './features/site/SiteScreen.jsx';
import { MessagesScreen } from './features/messages/MessagesScreen.jsx';
import './app.css';

const t = texts.admin;

/** The routes, inside the frame shared by every screen. Exported for tests (memory router). */
export const routes = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <AlbumsScreen /> },
      { path: 'album/:slug', element: <AlbumScreen /> },
      { path: 'site', element: <SiteScreen /> },
      { path: 'messages', element: <MessagesScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

/** Whether the draft is saved or everything is published: shown in the top bar. */
function DraftState() {
  const { data } = useDraftStatus();
  if (!data) return null;
  const draft = data.hasDraft || data.publishing;
  return (
    <span className={`dash-state${draft ? ' dash-state--draft' : ''}`}>
      <span className="dash-state__dot" aria-hidden="true" />
      {draft ? t.publish.draftSaved : t.publish.allPublished}
    </span>
  );
}

/**
 * The frame of every screen: the site's name, the sections (top bar on a computer, tab bar
 * at the bottom on a phone), the screen itself, the publish bar.
 */
export function Shell() {
  const draft = useDraft();
  const siteName = draft.data?.site?.name;
  const sections = [
    { to: '/', end: true, icon: 'albums', label: t.common.navAlbums },
    { to: '/site', icon: 'site', label: t.common.navSite },
    { to: '/messages', icon: 'messages', label: t.common.navMessages },
  ];
  return (
    <div className="dash">
      <header className="dash-top">
        <span className="dash-brand">{siteName ?? ''}</span>
        <DraftState />
      </header>
      <nav className="dash-sections" aria-label={t.common.navLabel}>
        {sections.map(section => (
          <NavLink key={section.to} to={section.to} end={section.end} className="dash-sections__link">
            <Icon name={section.icon} />
            <span>{section.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="dash-main">
        {draft.isError ? <p className="dash-error" role="alert">{t.common.loadError}</p> : <Outlet />}
      </main>
      <PublishBar />
    </div>
  );
}

const router = createHashRouter(routes);

/** The dashboard: the routes of the hash (/admin#/album/notte). */
export function App() {
  return <RouterProvider router={router} />;
}
```

`src/dashboard/app.css`:

```css
.dash { min-height: 100dvh; display: grid; grid-template-rows: auto auto 1fr auto; }
.dash-top {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.9rem 1.25rem; border-bottom: 1px solid var(--admin-line);
}
.dash-brand { font: 500 0.85rem/1 var(--admin-font-mono); letter-spacing: 0.02em; }
.dash-state { display: inline-flex; align-items: center; gap: 0.4rem; font: 0.75rem/1 var(--admin-font-mono); color: var(--admin-muted); }
.dash-state__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--admin-ok); }
.dash-state--draft .dash-state__dot { background: var(--admin-accent); }

.dash-sections { display: flex; gap: 1.5rem; padding: 0 1.25rem; border-bottom: 1px solid var(--admin-line); }
.dash-sections__link {
  display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.8rem 0;
  color: var(--admin-muted); text-decoration: none; font-size: 0.9rem;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.dash-sections__link.active { color: var(--admin-ink); border-bottom-color: var(--admin-accent); }
.dash-main { padding: 1.5rem 1.25rem; width: 100%; }
.dash-error { color: var(--admin-danger); }
.dash-screen-title { margin: 0 0 1rem; font: 500 1.5rem/1.2 var(--admin-font-display); }

@media (max-width: 640px) {
  /* A phone app: the sections become a tab bar at the bottom. */
  .dash { grid-template-rows: auto 1fr auto; padding-bottom: var(--admin-tabs-height); }
  .dash-sections {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
    height: var(--admin-tabs-height); padding: 0 0 env(safe-area-inset-bottom, 0px);
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
    background: var(--admin-surface); border-top: 1px solid var(--admin-line); border-bottom: 0;
  }
  .dash-sections__link {
    flex-direction: column; justify-content: center; gap: 0.2rem; padding: 0; margin: 0;
    font: 0.7rem/1.2 var(--admin-font-mono); border-bottom: 0;
  }
  .dash-sections__link.active { color: var(--admin-accent); }
  .dash-main { padding: 1.1rem 1rem; }
}
```

`src/dashboard/main.jsx`:

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import themeTokens from 'virtual:admin-theme';
import { App } from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';

// The site's own colours and fonts, read from custom/theme.css at build time. Set as
// properties (not a <style> element, which the Content Security Policy forbids).
for (const [name, value] of Object.entries(themeTokens)) {
  document.documentElement.style.setProperty(name, value);
}

const queryClient = new QueryClient({
  defaultOptions: {
    // The draft changes only through this dashboard: no refetch on every focus.
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

createRoot(document.getElementById('admin-root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

`src/dashboard/styles/tokens.css`:

```css
/* The dashboard's own look ("B — camera oscura"). A site with custom/theme.css overrides
   these at start-up with its colours and fonts (src/utils/adminTheme.js). */
:root {
  --admin-bg: #141517;
  --admin-surface: #1b1c1f;
  --admin-raised: #26282c;
  --admin-ink: #ececea;
  --admin-muted: #8d9096;
  --admin-line: #2d2f33;
  --admin-accent: #e3b341;
  --admin-on-accent: #141517;
  --admin-ok: #5fb38a;
  --admin-danger: #e5645f;
  --admin-font-body: 'Sora', system-ui, sans-serif;
  --admin-font-display: 'Sora', system-ui, sans-serif;
  --admin-font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --admin-radius: 8px;
  --admin-gap: 1rem;
  --admin-tabs-height: 64px;
  color-scheme: dark;
}
```

`src/dashboard/styles/base.css`:

```css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--admin-bg);
  color: var(--admin-ink);
  font: 15px/1.5 var(--admin-font-body);
}
button, input, textarea, select { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--admin-accent); outline-offset: 2px; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.dash-label {
  font: 500 11px/1 var(--admin-font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--admin-muted);
}
```

- [ ] **Step 3: Check** — `npm test` → 94 files, 739 passed, 1 skipped; no `act(...)` warnings. `ALLOW_PLACEHOLDER_CSP=1 npx vite build --outDir /srv/claude/workspaces/qa-browser/p41-dist --emptyOutDir` succeeds and `dist` has no `admin` chunk importing `src/pages/admin.js`.

- [ ] **Step 4: Browser check** (real Chromium, built CSP):

```bash
cd /srv/claude/workspaces/qa-browser
node server-preview.mjs p41-dist 4430 > sp41.log 2>&1 &
sleep 1
PLAYWRIGHT_BROWSERS_PATH=$PWD/ms-playwright node dash-check.mjs http://127.0.0.1:4430
```
Expected two lines: `desk hash after nav: #/site | errors: none` and `phone hash after nav: #/site | errors: none`. Then stop the server by its PID (`ps -eo pid,args | grep "server-preview.mjs p41-dist"`, then `kill <pid>`; never `pkill -f`). Go back to the repository root.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/App.test.jsx src/dashboard/features/publish/PublishBar.test.jsx src/dashboard/features/publish/PublishBar.jsx src/dashboard/features/publish/publish.css src/dashboard/features/albums/AlbumsScreen.jsx src/dashboard/features/album/AlbumScreen.jsx src/dashboard/features/site/SiteScreen.jsx src/dashboard/features/messages/MessagesScreen.jsx src/dashboard/App.jsx src/dashboard/app.css src/dashboard/main.jsx src/dashboard/styles/tokens.css src/dashboard/styles/base.css config/texts.config.js config/texts.it.js admin.html
git commit -F - <<'EOF'
feat(dashboard): the React frame and publish bar on /admin

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```
