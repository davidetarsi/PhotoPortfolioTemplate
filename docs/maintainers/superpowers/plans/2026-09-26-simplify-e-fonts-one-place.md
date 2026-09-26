# E — Web fonts in one place Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** Changing fonts means editing one URL in `theme/fonts.js`: the build adds the Google Fonts links to every page — the four template pages, the dashboard and custom pages. An empty URL loads no external fonts.

**Architecture:** `theme/fonts.js` exports `googleFontsUrl`. A Vite plugin (`src/utils/fontsPlugin.js`) returns the three `<link>` tags from `transformIndexHtml`, so they appear in dev and build. The hard-coded links are removed from the HTML files and the example custom pages. The custom theme keeps being the last stylesheet (its post plugin moves it to the end).

**Tech Stack:** JavaScript ES modules, Vite 8 (`transformIndexHtml` tags), Vitest 4, Markdown.

**Spec:** `docs/maintainers/roadmap-semplificazione.md`, phase E.

**Base:** branch `feat/simplify-c-untracked-wrangler`. Implementation branch: `feat/simplify-e-fonts`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- `wrangler.json` is untracked in the template (`?? wrangler.json`): never add or commit it. Never commit `custom/`, `dist/`, `.superpowers/`. Do not run `npm install`.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: One font URL, injected by the build

**Files:** Create `theme/fonts.js`, `src/utils/fontsPlugin.js`, `src/utils/fontsPlugin.test.js`; modify `vite.config.js`, `index.html`, `album.html`, `about.html`, `admin.html`, `custom.example/pages/archive.html`, `custom.example/pages/project.html`.

- [ ] **Step 1: Test.** Create `src/utils/fontsPlugin.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createFontsPlugin, fontLinkTags } from './fontsPlugin.js';

const URL = 'https://fonts.googleapis.com/css2?family=Sora:wght@300&display=swap';

describe('fontLinkTags', () => {
  it('builds the two preconnects and the stylesheet for a Google Fonts URL', () => {
    expect(fontLinkTags(URL)).toEqual([
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'stylesheet', href: URL }, injectTo: 'head' },
    ]);
  });

  it('adds nothing when the URL is empty: no external fonts', () => {
    expect(fontLinkTags('')).toEqual([]);
    expect(fontLinkTags(undefined)).toEqual([]);
  });

  it('accepts only Google Fonts, which is what the CSP allows', () => {
    expect(() => fontLinkTags('https://example.com/fonts.css')).toThrow(/theme\/fonts\.js/);
  });
});

describe('createFontsPlugin', () => {
  it('adds the tags to every HTML page', () => {
    const plugin = createFontsPlugin(URL);
    expect(plugin.transformIndexHtml.handler('<html></html>')).toEqual(fontLinkTags(URL));
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/utils/fontsPlugin.test.js` → FAIL.

- [ ] **Step 3: Implement.** Create `theme/fonts.js`:

```js
// Web fonts, in one place: the build adds this stylesheet to every page — site, dashboard
// and custom pages. Keep the families in sync with --font-* in theme/tokens.css.
// An empty string loads no external fonts (the CSS falls back to the next font in the stack).
export const googleFontsUrl = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;1,9..144,400&family=Sora:wght@300;400;600&family=IBM+Plex+Mono:wght@400&display=swap';
```

Create `src/utils/fontsPlugin.js`:

```js
const GOOGLE_FONTS = 'https://fonts.googleapis.com/';

/**
 * The <link> tags for a Google Fonts stylesheet: two preconnects and the stylesheet.
 * Only Google Fonts is accepted because the Content Security Policy allows only it.
 *
 * @param {string|undefined} url - googleFontsUrl from theme/fonts.js; empty = no fonts.
 * @returns {Array<object>} Vite HTML tag descriptors.
 */
export function fontLinkTags(url) {
  if (!url) return [];
  if (!url.startsWith(GOOGLE_FONTS)) {
    throw new Error(`theme/fonts.js: googleFontsUrl must start with ${GOOGLE_FONTS} (the CSP allows only Google Fonts).`);
  }
  return [
    { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'stylesheet', href: url }, injectTo: 'head' },
  ];
}

/** Adds the web-font links to every HTML page, in dev and in the build. */
export function createFontsPlugin(url) {
  const tags = fontLinkTags(url);
  return {
    name: 'google-fonts',
    transformIndexHtml: { order: 'pre', handler: () => tags },
  };
}
```

In `vite.config.js`:
- after the line `import { wranglerConfigPath } from './src/utils/wranglerConfigPath.js'` add the two lines

```js
import { createFontsPlugin } from './src/utils/fontsPlugin.js'
import { googleFontsUrl } from './theme/fonts.js'
```

- in the `plugins: [` list, replace the line `    siteMetaPlugin(),` with the two lines

```js
    siteMetaPlugin(),
    createFontsPlugin(googleFontsUrl),
```

Then remove the hard-coded font links: in each of `index.html`, `album.html`, `about.html`, `admin.html`, `custom.example/pages/archive.html`, `custom.example/pages/project.html`, delete every line that contains `fonts.googleapis.com` or `fonts.gstatic.com`, with a script:

```bash
for f in index.html album.html about.html admin.html custom.example/pages/archive.html custom.example/pages/project.html; do
  grep -c 'fonts.googleapis.com\|fonts.gstatic.com' "$f"
  sed -i '/fonts\.googleapis\.com\|fonts\.gstatic\.com/d' "$f"
done
grep -l 'fonts.googleapis.com\|fonts.gstatic.com' index.html album.html about.html admin.html custom.example/pages/*.html; echo "leftover: $?"
```

Expected counts: `3` for each file; then `leftover: 1` (no file lists).

- [ ] **Step 4: Verify.** `npm test` → PASS. Build and check the injected links:

```bash
ALLOW_PLACEHOLDER_CSP=1 npx vite build > /srv/claude/workspaces/qa-audit/build-e.log 2>&1; echo "build $?"
for f in dist/index.html dist/album.html dist/about.html dist/admin.html; do printf "%s " "$f"; grep -c 'fonts.googleapis.com/css2\|rel="preconnect"' "$f"; done
```

Expected: `build 0`, and `3` for each file (one stylesheet and two preconnect links).

- [ ] **Step 5: Commit.**

```bash
git add theme/fonts.js src/utils/fontsPlugin.js src/utils/fontsPlugin.test.js vite.config.js index.html album.html about.html admin.html custom.example/pages/archive.html custom.example/pages/project.html
git commit -F - <<'EOF'
feat(theme): web fonts in one place, added to every page by the build

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: Docs say where fonts live

**Files:** Modify `CUSTOMIZING.md`, `docs/pages.md`, `README.md`, `README.it.md`, `docs/maintainers/pending-decisions.md`.

- [ ] **Step 1: CUSTOMIZING.md.** In the font section, replace everything from the line that starts `2. **In all four HTML files**` up to, but not including, the next line that starts with `3. **` (the typography step), with the content of `customizing-fonts-step.md` (Appendix A). Do it with a script.

- [ ] **Step 2: docs/pages.md.** Replace

```
Copy the Google Fonts `<link>` tags from the `<head>` of `index.html` into your pages, as the examples do: the template's typography expects those fonts.
```

with

```
The build adds the Google Fonts links from `theme/fonts.js` to your pages too: do not copy them into your HTML.
```

- [ ] **Step 3: READMEs.** In `README.md` replace

```
- **`theme/tokens.css`** and **`theme/typography.css`** — colors, fonts and the Google Fonts link
```

with

```
- **`theme/tokens.css`**, **`theme/typography.css`** and **`theme/fonts.js`** — colors, type and the one Google Fonts link every page uses
```

In `README.it.md` replace

```
- **`theme/tokens.css`** e **`theme/typography.css`** — colori, font e link a Google Fonts
```

with

```
- **`theme/tokens.css`**, **`theme/typography.css`** e **`theme/fonts.js`** — colori, tipografia e l'unico link a Google Fonts usato da tutte le pagine
```

- [ ] **Step 4: Decisions list.** In `docs/maintainers/pending-decisions.md`, in the row that starts `| E |`, replace the last cell text `sì/no` with the text: approvata 2026-09-26, branch `feat/simplify-e-fonts`

- [ ] **Step 5: Check and commit.** `grep -rn "all four HTML files\|Copy the Google Fonts" CUSTOMIZING.md docs/pages.md README.md README.it.md` → no output. `node /srv/claude/workspaces/qa-audit/check-links.mjs CUSTOMIZING.md docs/pages.md README.md README.it.md` → `0 broken`. `npm test` → PASS.

```bash
git add CUSTOMIZING.md docs/pages.md README.md README.it.md docs/maintainers/pending-decisions.md
git commit -F - <<'EOF'
docs: fonts are changed in theme/fonts.js only

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

## Appendix A — `customizing-fonts-step.md`

````markdown
2. **`theme/fonts.js`:** replace `googleFontsUrl` with the Google Fonts URL of the new families. The build adds it to every page — the site, the dashboard and your custom pages — so there is nothing to change in the HTML files.

```js
// Before
export const googleFontsUrl = 'https://fonts.googleapis.com/css2?family=Fraunces:…&family=Sora:…&family=IBM+Plex+Mono:wght@400&display=swap';

// After: include only the fonts you use, with the weights you use
export const googleFontsUrl = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400&family=Playfair+Display:wght@600&family=IBM+Plex+Mono:wght@400&display=swap';
```

   An empty string loads no external fonts: the CSS falls back to the next font in each `--font-*` stack. Only Google Fonts URLs are accepted, because the Content Security Policy allows only Google Fonts.

````
