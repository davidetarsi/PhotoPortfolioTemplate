# Dashboard in React, piano 1: fondamenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React available in the template build (and to `custom/`), and the current dashboard free of copy written directly in the code.

**Architecture:** React and React DOM become dependencies; `@vitejs/plugin-react` joins the Vite plugins. A test mounts a React component through the existing slot contract (`mount(container, ctx)` → `{ destroy() }`), which is how a fork writes a slot in React. The three strings still hard-coded in the current dashboard move to `config/texts.config.js` and `config/texts.it.js`, and a new test keeps the two texts files with the same keys.

**Tech Stack:** Vite 8, Vitest 4 (jsdom), React 19, `@vitejs/plugin-react` 6.

**Spec:** `docs/maintainers/superpowers/specs/2026-09-27-dashboard-react-design.md` (section "I quattro piani", item 1).

## Global Constraints

- Branch `feat/dashboard-react`. Never commit on `main`, never push (the controller pushes).
- Commit messages: subject line, blank line, then the two trailer lines, written with a heredoc so the trailers are NOT in the subject:
  ```bash
  git commit -F - <<'EOF'
  <subject>

  Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
  EOF
  ```
- Code, comments and test names in English. Visible copy only in `config/texts.config.js` (English) and `config/texts.it.js` (Italian), same keys in both.
- Every change that the README describes updates both `README.md` and `README.it.md`.
- `wrangler.json` in the repository root is untracked and must stay untracked: never `git add` it, never `git add -A` or `git add .`.
- If `npm install` rewrites `"engines": { "node": ">=22.12" }` in `package.json` over three lines, put it back on one line before committing.
- Run the whole suite with `npm test`; expected at the end of this plan: 80 test files, 621 passed, 1 skipped.

---

### Task 1: Copy still written in the dashboard code

The current dashboard (it stays until plan 4) still has three strings written directly in the code: the upload drop zone text (in Italian), the hero label `HeroImage:` and the `Cover` button text. This task moves them to the texts files and adds a test that keeps English and Italian texts with the same keys.

**Files:**
- Create: `config/texts.parity.test.js`
- Modify: `config/texts.config.js`, `config/texts.it.js`
- Modify: `src/admin/views/album.js` (drop zone label; two `Cover` buttons)
- Modify: `src/admin/views/home.js` (hero label)
- Test: `src/admin/views/album.test.js`, `src/admin/views/home.test.js`

**Interfaces:**
- Produces: new text keys `texts.admin.site.heroLabel`, `texts.admin.album.dropzoneLabel`, `texts.admin.album.dropzoneBrowse` (the existing `texts.admin.album.cover` is now used by the cover buttons).

- [ ] **Step 1: Write the parity test**

Create `config/texts.parity.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { texts } from './texts.config.js';
import { texts as textsIt } from './texts.it.js';

// Every key path of a texts object, e.g. 'admin.album.cover'.
function keyPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object' ? keyPaths(value, path) : [path];
  });
}

describe('Italian preset', () => {
  it('has exactly the keys of the English texts', () => {
    expect(keyPaths(textsIt).sort()).toEqual(keyPaths(texts).sort());
  });
});
```

It passes today; it guards the keys added below.

- [ ] **Step 2: Write the two failing view tests**

In `src/admin/views/album.test.js`, insert this test immediately before the existing test `it('la dropzone mostra i vincoli di formato e dimensione', …` (inside the same `describe('renderAdminAlbum', …)`):

```js
  it('dropzone and cover buttons use the configured copy', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const label = container.querySelector('.admin-dropzone__label');
    expect(label.textContent).toContain(texts.admin.album.dropzoneLabel);
    expect(container.querySelector('.admin-dropzone__browse').textContent).toBe(texts.admin.album.dropzoneBrowse);
    const covers = [...container.querySelectorAll('.admin-photo__cover')];
    expect(covers.length).toBeGreaterThan(0);
    for (const button of covers) expect(button.textContent).toBe(texts.admin.album.cover);
  });

```

In `src/admin/views/home.test.js`, insert this test immediately before the existing test `it('include la top bar senza back-link', …` (inside `describe('renderAdminHome', …)`):

```js
  it('labels the hero picker with the configured copy', () => {
    renderAdminHome(container, makeCtx());
    expect(container.querySelector('.admin-hero > span').textContent).toBe(texts.admin.site.heroLabel);
  });

```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run config/texts.parity.test.js src/admin/views/album.test.js src/admin/views/home.test.js`
Expected: 2 failed (`dropzone and cover buttons use the configured copy`, `labels the hero picker with the configured copy`), the parity test passes.

- [ ] **Step 4: Add the keys to both texts files**

`config/texts.config.js`, in `admin.site`, before `heroUpdated`:

```js
      heroLabel: 'Home image',
```

and in `admin.album`, before `dropzoneConstraints`:

```js
      dropzoneLabel: 'Drop photos here or',
      dropzoneBrowse: 'choose files to upload',
```

`config/texts.it.js`, in `admin.site`, before `heroUpdated`:

```js
      heroLabel: 'Immagine della home',
```

and in `admin.album`, before `dropzoneConstraints`:

```js
      dropzoneLabel: 'Trascina qui le foto o',
      dropzoneBrowse: 'scegli i file da caricare',
```

- [ ] **Step 5: Use the keys in the views**

`src/admin/views/album.js`, drop zone label — replace:

```js
          Trascina qui le foto o <span class="admin-dropzone__browse">scegli i file da caricare</span>
```

with:

```js
          ${texts.admin.album.dropzoneLabel} <span class="admin-dropzone__browse">${texts.admin.album.dropzoneBrowse}</span>
```

In the same file the text `title="${texts.admin.album.coverAsButton}">Cover</button>` appears twice (grid cell and list row). Replace both with:

```js
title="${texts.admin.album.coverAsButton}">${texts.admin.album.cover}</button>
```

`src/admin/views/home.js` — replace:

```js
        <span>HeroImage:</span>
```

with:

```js
        <span>${texts.admin.site.heroLabel}</span>
```

These templates use the `html` tagged template, which escapes interpolated values: do not change that.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run config/texts.parity.test.js src/admin/views/album.test.js src/admin/views/home.test.js`
Expected: all pass. Then `npm test`: 79 files, 620 passed, 1 skipped.

- [ ] **Step 7: Commit**

```bash
git add config/texts.parity.test.js config/texts.config.js config/texts.it.js src/admin/views/album.js src/admin/views/album.test.js src/admin/views/home.js src/admin/views/home.test.js
git commit -F - <<'EOF'
fix(admin): move the last hard-coded dashboard copy to the texts files

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: React in the build, and a slot written in React

**Files:**
- Modify: `package.json`, `package-lock.json` (through `npm install`)
- Modify: `vite.config.js`
- Create: `src/core/fixtures/react-landing.jsx`
- Create: `src/core/react-slot.test.jsx`
- Modify: `docs/slots.md` (new section), `custom.example/README.md` (test file names)
- Modify: `README.md`, `README.it.md` (architecture table row "Framework")

**Interfaces:**
- Consumes: `createSlotResolver(defaults, overrides, contracts)` from `src/core/slots.js` (existing).
- Produces: React 19 and `@vitejs/plugin-react` in the build; `.jsx` files compile everywhere Vite and Vitest run, including `custom/`.

- [ ] **Step 1: Install the packages**

```bash
npm install react@^19.3.0 react-dom@^19.3.0
npm install -D @vitejs/plugin-react@^6.1.1
```

Check `package.json`: `react` and `react-dom` under `dependencies`, `@vitejs/plugin-react` under `devDependencies`. Restore the one-line `"engines": { "node": ">=22.12" },` if npm split it (see Global Constraints).

- [ ] **Step 2: Add the plugin to Vite**

`vite.config.js` — after `import { defineConfig } from 'vite'` add:

```js
import react from '@vitejs/plugin-react'
```

and make `react()` the first entry of `plugins`:

```js
  plugins: [
    react(),
    devRouteFallbackPlugin(),
```

(The rest of the list stays as it is.)

- [ ] **Step 3: Write the React slot fixture**

Create `src/core/fixtures/react-landing.jsx`:

```jsx
// A landing written in React, as a fork would write it in custom/: it proves that JSX
// compiles in this build and that a React root fits the slot mount contract.
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

function Landing({ name, albums }) {
  return (
    <main className="page-main">
      <h1>{name}</h1>
      <ul>
        {albums.map(album => <li key={album.slug}>{album.title}</li>)}
      </ul>
    </main>
  );
}

export default {
  async mount(container, ctx) {
    const { site, albums } = await ctx.data;
    const root = createRoot(container);
    // flushSync: the page is "ready" only once the markup is in the DOM.
    flushSync(() => root.render(<Landing name={site.name} albums={albums ?? []} />));
    return { destroy() { root.unmount(); } };
  },
};
```

- [ ] **Step 4: Write the test**

Create `src/core/react-slot.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest';
import { createSlotResolver } from './slots.js';

const contracts = { landing: 'mount' };
const defaults = { landing: { mount: () => ({}) } };

describe('a slot written in React', () => {
  it('mounts through the slot contract and unmounts on destroy', async () => {
    const slot = createSlotResolver(defaults, { landing: () => import('./fixtures/react-landing.jsx') }, contracts);
    const landing = await slot('landing');
    const container = document.createElement('div');
    const data = Promise.resolve({
      site: { name: 'Davide <b>Tarsi</b>' },
      albums: [{ slug: 'notte', title: 'Notte in montagna' }, { slug: 'viaggio', title: 'Viaggio' }],
    });

    const handle = await landing.mount(container, { texts: {}, data });

    // JSX escapes text: the name is shown, never parsed as HTML.
    expect(container.querySelector('h1').textContent).toBe('Davide <b>Tarsi</b>');
    expect(container.querySelector('h1 b')).toBeNull();
    expect([...container.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Notte in montagna', 'Viaggio']);

    handle.destroy();
    expect(container.childNodes).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npx vitest run src/core/react-slot.test.jsx`
Expected: 1 passed, no warnings.

- [ ] **Step 6: Check a production build with a React landing in `custom/`**

`custom/` must not exist in the template: create it only for this check and delete it after.

```bash
mkdir custom
cp src/core/fixtures/react-landing.jsx custom/react-landing.jsx
printf "export default {\n  landing: () => import('./react-landing.jsx'),\n};\n" > custom/slots.js
ALLOW_PLACEHOLDER_CSP=1 npx vite build --outDir /srv/claude/workspaces/qa-browser/react-slot-check --emptyOutDir
grep -l "new Function\|eval(" /srv/claude/workspaces/qa-browser/react-slot-check/assets/*.js || echo "no eval"
rm -rf custom /srv/claude/workspaces/qa-browser/react-slot-check
```

Expected: the build succeeds with a `react-landing-*.js` chunk; the last line before `rm` prints `no eval` (the Content Security Policy forbids `eval`). `git status` shows no `custom/`.

- [ ] **Step 7: Document writing a slot in React**

In `docs/slots.md`, insert this section immediately before the line `## The public API: \`src/api/index.js\``:

````markdown
## Writing a slot in React

React is part of the template build: a slot in `custom/` can be a `.jsx` file. Create a root in `mount` and unmount it in `destroy`:

```jsx
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

function Landing({ name }) {
  return <main className="page-main"><h1>{name}</h1></main>;
}

export default {
  async mount(container, ctx) {
    const { site } = await ctx.data;
    const root = createRoot(container);
    flushSync(() => root.render(<Landing name={site.name} />));
    return { destroy() { root.unmount(); } };
  },
};
```

`flushSync` makes the markup land in the DOM before `mount` resolves, so `page:ready` means the landing is on screen. JSX escapes text by itself; keep `dangerouslySetInnerHTML` out of slots. React is optional: a slot in plain JavaScript keeps working exactly as before. `src/core/react-slot.test.jsx` is a working example of testing one.

````

In `custom.example/README.md`, replace the line:

```markdown
- `landing/example-landing.test.js` shows how to test your own component: `npm test` runs every `*.test.js` under `custom/`. Replace it with tests for your landing.
```

with:

```markdown
- `landing/example-landing.test.js` shows how to test your own component: `npm test` runs every `*.test.js` and `*.test.jsx` under `custom/`. Replace it with tests for your landing.
- Slots can be written in React (`.jsx`): see "Writing a slot in React" in `docs/slots.md`.
```

In `docs/slots.md`, in the section "In `npm test`: jsdom", replace:

```markdown
- The check does not call `mount`. Test your own component in files under `custom/` named `*.test.js`: `npm test` runs them too.
```

with:

```markdown
- The check does not call `mount`. Test your own component in files under `custom/` named `*.test.js` or `*.test.jsx`: `npm test` runs them too.
```

- [ ] **Step 8: Update the READMEs**

`README.md`, architecture table — replace:

```markdown
| **Framework** | vanilla JS/HTML/CSS — no runtime framework |
```

with:

```markdown
| **Framework** | vanilla JS/HTML/CSS on the public site; React available for your own components in `custom/` |
```

`README.it.md` — replace:

```markdown
| **Framework** | vanilla JS/HTML/CSS — nessun framework a runtime |
```

with:

```markdown
| **Framework** | vanilla JS/HTML/CSS nel sito pubblico; React disponibile per i tuoi componenti in `custom/` |
```

- [ ] **Step 9: Run everything**

Run: `npm test`
Expected: 80 test files, 621 passed, 1 skipped.

Run: `node /srv/claude/workspaces/qa-audit/check-links.mjs`
Expected: `0 broken`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.js src/core/fixtures/react-landing.jsx src/core/react-slot.test.jsx docs/slots.md custom.example/README.md README.md README.it.md
git commit -F - <<'EOF'
feat(build): React in the template build, usable for custom/ slots

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```
