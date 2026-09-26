# T — Safe HTML templates by construction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** Every HTML template in the browser code escapes the values it interpolates unless they are themselves safe templates, and a test fails if someone assigns an unescaped template literal to `innerHTML`. The class of bug found in audit S1 cannot come back silently.

**Architecture:** `html` tagged template in `src/shared/html.js`, next to `escapeHtml`. It returns a `SafeHtml` (a `String` subclass, so existing string operations and `innerHTML =` keep working); nested `SafeHtml` values and arrays of them are inserted as-is, everything else is escaped, `null`/`undefined`/`false` render as nothing. A conversion script (Task 2) switches every browser template assigned to `innerHTML`, and the HTML fragments nested in them, to `html`; a guard test (Task 3) scans `src/` for raw `innerHTML = \``.

**Tech Stack:** JavaScript ES modules, Vitest 4.

**Spec:** `docs/maintainers/roadmap-semplificazione.md`, phase T.

**Base:** branch `feat/simplify-e-fonts`. Implementation branch: `feat/simplify-t-safe-html`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- `wrangler.json` is untracked (`?? wrangler.json`): never add or commit it. Never commit `custom/`, `dist/`, `.superpowers/`. Do not run `npm install`.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: The `html` helper

**Files:** Modify `src/shared/html.js`, `src/shared/html.test.js`.

- [ ] **Step 1: Tests.** Append to `src/shared/html.test.js`:

```js

describe('html', () => {
  it('escapes interpolated values', () => {
    expect(String(html`<p title="${'"x"'}">${'<b>&</b>'}</p>`)).toBe('<p title="&quot;x&quot;">&lt;b&gt;&amp;&lt;/b&gt;</p>');
  });

  it('inserts nested html templates and arrays of them as they are', () => {
    const items = ['a', '<b>'].map(v => html`<li>${v}</li>`);
    expect(String(html`<ul>${items}</ul>`)).toBe('<ul><li>a</li><li>&lt;b&gt;</li></ul>');
    expect(String(html`<div>${html`<br>`}</div>`)).toBe('<div><br></div>');
  });

  it('renders null, undefined and false as nothing, numbers as text', () => {
    expect(String(html`${null}${undefined}${false}${0}`)).toBe('0');
  });

  it('behaves like a string and can be assigned to innerHTML', () => {
    const safe = html`<p>${'x'}</p>`;
    expect(safe).toBeInstanceOf(SafeHtml);
    expect(safe.includes('<p>')).toBe(true);
    const div = document.createElement('div');
    div.innerHTML = html`<img src=x onerror="${'alert(1)'}"><span>${'<i>'}</span>`;
    expect(div.querySelector('i')).toBeNull();
    expect(div.querySelector('span').textContent).toBe('<i>');
  });
});
```

and change its first import line `import { escapeHtml } from './html.js';` to `import { SafeHtml, escapeHtml, html } from './html.js';`.

- [ ] **Step 2: Run to verify failure.** `npm test -- src/shared/html.test.js` → FAIL (`html` is not exported).

- [ ] **Step 3: Implement.** Append to `src/shared/html.js`:

```js

/** A string known to be safe HTML: produced by the `html` tag, never by concatenation. */
export class SafeHtml extends String {}

function render(value) {
  if (value instanceof SafeHtml) return String(value);
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

/**
 * Tagged template for HTML: every interpolated value is escaped, except nested `html`
 * templates (and arrays of them), which are already safe. Use it for every template
 * assigned to innerHTML: a guard test fails on raw template literals there.
 *
 * @example el.innerHTML = html`<p class="note">${userText}</p>`;
 * @returns {SafeHtml} The HTML, usable wherever a string is.
 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += render(value) + strings[i + 1]; });
  return new SafeHtml(out);
}
```

- [ ] **Step 4: Run to verify pass.** `npm test -- src/shared/html.test.js` → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/shared/html.js src/shared/html.test.js
git commit -F - <<'EOF'
feat(shared): html tagged template that escapes by default

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: Convert the browser templates

**Files:** Modify `src/components/AlbumCard.js`, `src/components/ContactForm.js`, `src/components/Footer.js`, `src/components/Hero.js`, `src/components/Landing.js`, `src/components/Lightbox.js`, `src/components/Nav.js`, `src/admin/preview.js`, `src/admin/views/album.js`, `src/admin/views/home.js`, `src/admin/views/messages.js`, `src/admin/views/top-bar.js`, `src/pages/admin.js`.

- [ ] **Step 1: Run the conversion script.** It is the file `convert-to-html.py` in the task workspace (Appendix A). From the repo root:

```bash
python3 .superpowers/sdd/2026-09-26-simplify-t-safe-html/convert-to-html.py
```

Expected output: one `converted <file>` line per file listed above, then `done`. If it stops with an `AssertionError`, do not edit by hand: report the message.

- [ ] **Step 2: Verify.** `npm test` → PASS. `ALLOW_PLACEHOLDER_CSP=1 npx vite build > /srv/claude/workspaces/qa-audit/build-t.log 2>&1; echo $?` → `0`. `grep -rn "innerHTML = \`" src --include=*.js | grep -v "\.test\.js"` → no output.

- [ ] **Step 3: Commit.**

```bash
git add src/components/AlbumCard.js src/components/ContactForm.js src/components/Footer.js src/components/Hero.js src/components/Landing.js src/components/Lightbox.js src/components/Nav.js src/admin/preview.js src/admin/views/album.js src/admin/views/home.js src/admin/views/messages.js src/admin/views/top-bar.js src/pages/admin.js
git commit -F - <<'EOF'
refactor: build every browser HTML template with the escaping html tag

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: Guard test and contributor note

**Files:** Create `src/shared/html-guard.test.js`; modify `CONTRIBUTING.md`, `docs/maintainers/pending-decisions.md`.

- [ ] **Step 1: Guard test.** Create `src/shared/html-guard.test.js`:

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];
  });
}

describe('HTML templates', () => {
  it('never assign a raw template literal to innerHTML: use the html tag', () => {
    const offenders = sources('src').flatMap(file =>
      readFileSync(file, 'utf8').split('\n')
        .map((line, i) => (/innerHTML\s*=\s*`/.test(line) ? `${file}:${i + 1}` : null))
        .filter(Boolean));
    expect(offenders).toEqual([]);
  });
});
```

Run `npm test -- src/shared/html-guard.test.js` → PASS (Task 2 already converted every template). To prove it bites, temporarily add this line at the end of `src/components/Footer.js`:

```js
document.body.innerHTML = `<p>${'x'}</p>`;
```

run the test → FAIL naming that line, then remove the line again and re-run → PASS. `git diff src/components/Footer.js` must be empty afterwards.

- [ ] **Step 2: CONTRIBUTING.md.** Add at the end of the file (one empty line before):

```markdown
## HTML in the browser code

Build HTML with the `html` tag from `src/shared/html.js`: ``el.innerHTML = html`<p>${text}</p>` ``. It escapes every interpolated value, except nested `html` templates. For single values, `textContent` and `setAttribute` are just as good. A test (`src/shared/html-guard.test.js`) fails if a raw template literal is assigned to `innerHTML`.
```

- [ ] **Step 3: Decisions list.** In `docs/maintainers/pending-decisions.md`, in the row that starts `| T |`, replace the last cell text `sì/no` with the text: approvata 2026-09-26, branch `feat/simplify-t-safe-html`

- [ ] **Step 4: Check and commit.** `npm test` → PASS. `node /srv/claude/workspaces/qa-audit/check-links.mjs CONTRIBUTING.md` → `0 broken`.

```bash
git add src/shared/html-guard.test.js CONTRIBUTING.md docs/maintainers/pending-decisions.md
git commit -F - <<'EOF'
test: fail on raw template literals assigned to innerHTML

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

## Appendix A — `convert-to-html.py`

```python
# Converts the browser HTML templates to the escaping `html` tag. Every replacement is
# checked: the script stops with an AssertionError if the expected text is not there.
import re

IMPORTS = {
    'src/components/AlbumCard.js': '../shared/html.js',
    'src/components/ContactForm.js': '../shared/html.js',
    'src/components/Footer.js': '../shared/html.js',
    'src/components/Hero.js': '../shared/html.js',
    'src/components/Landing.js': '../shared/html.js',
    'src/components/Lightbox.js': '../shared/html.js',
    'src/components/Nav.js': '../shared/html.js',
    'src/admin/preview.js': '../shared/html.js',
    'src/admin/views/album.js': '../../shared/html.js',
    'src/admin/views/home.js': '../../shared/html.js',
    'src/admin/views/messages.js': '../../shared/html.js',
    'src/admin/views/top-bar.js': '../../shared/html.js',
    'src/pages/admin.js': '../shared/html.js',
}

# Exact fragment replacements, per file: (old, new, expected count).
FRAGMENTS = {
    'src/components/AlbumCard.js': [
        ("coverUrl ? `<img class=\"album-card__img\" alt=\"\" loading=\"lazy\">` : ''",
         "coverUrl ? html`<img class=\"album-card__img\" alt=\"\" loading=\"lazy\">` : ''", 1),
        ("description ? `<p class=\"album-card__desc\"></p>` : ''",
         "description ? html`<p class=\"album-card__desc\"></p>` : ''", 1),
    ],
    'src/components/Hero.js': [
        ("heroUrl ? `<img class=\"hero__bg\" alt=\"\" fetchpriority=\"high\" decoding=\"sync\">` : ''",
         "heroUrl ? html`<img class=\"hero__bg\" alt=\"\" fetchpriority=\"high\" decoding=\"sync\">` : ''", 1),
    ],
    'src/components/Footer.js': [
        ("links.length ? '<nav class=\"site-footer__links\"></nav>' : ''",
         "links.length ? html`<nav class=\"site-footer__links\"></nav>` : ''", 1),
    ],
    'src/components/ContactForm.js': [
        ("hasTurnstile ? '<div class=\"contact-form__turnstile\" data-sitekey=\"' + siteConfig.turnstileSitekey + '\" data-theme=\"auto\"></div>' : ''",
         "hasTurnstile ? html`<div class=\"contact-form__turnstile\" data-sitekey=\"${siteConfig.turnstileSitekey}\" data-theme=\"auto\"></div>` : ''", 1),
    ],
    'src/admin/views/home.js': [
        ("${heroSrc ? `<img class=\"admin-hero__thumb\" alt=\"\">` : `<em>${texts.admin.site.heroNone}</em>`}",
         "${heroSrc ? html`<img class=\"admin-hero__thumb\" alt=\"\">` : html`<em>${texts.admin.site.heroNone}</em>`}", 1),
    ],
    'src/admin/views/top-bar.js': [
        ("const navButtons = !showBackLink ? `", "const navButtons = !showBackLink ? html`", 1),
        ("  return `\n", "  return html`\n", 1),
        ("${showBackLink ? '<a class=\"admin-back\" href=\"#/\">← Tutti gli album</a>' : ''}",
         "${showBackLink ? html`<a class=\"admin-back\" href=\"#/\">← Tutti gli album</a>` : ''}", 1),
        (" * @returns {string} HTML string for the top bar header.",
         " * @returns {import('../../shared/html.js').SafeHtml} HTML for the top bar header.", 1),
    ],
}

for path, rel in IMPORTS.items():
    src = open(path).read()
    for old, new, count in FRAGMENTS.get(path, []):
        assert src.count(old) == count, (path, old[:60], src.count(old))
        src = src.replace(old, new)
    raw = len(re.findall(r'innerHTML\s*=\s*`', src))
    src = re.sub(r'innerHTML(\s*)=(\s*)`', r'innerHTML\1=\2html`', src)
    if path != 'src/admin/views/top-bar.js':
        assert raw > 0 or path in ('src/components/AlbumCard.js',), (path, 'no innerHTML template found')
    line = f"import {{ html }} from '{rel}';\n"
    assert line not in src, (path, 'already imports html')
    imports = list(re.finditer(r'^import .*;\n', src, re.M))
    at = imports[-1].end() if imports else 0
    src = src[:at] + line + src[at:]
    open(path, 'w').write(src)
    print('converted', path)
print('done')
```
