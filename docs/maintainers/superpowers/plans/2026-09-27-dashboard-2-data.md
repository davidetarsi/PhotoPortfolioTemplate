# Dashboard in React, piano 2: dati — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The data side of the new dashboard: the private bucket, links and editable page texts in `site.json` (used by the public site), and the Worker routes for the draft and for publishing it in steps.

**Architecture:** The messages bucket becomes the private bucket (`PRIVATE_BUCKET`, `<project>-private`), home of `_messages/`, `draft/` and `staging/`. `site.json` gains `links` (ordered `{ url, label? }`) and `texts` (overrides for the keys in `EDITABLE_TEXT_KEYS`); the site merges them at load time. The draft is a copy of the published JSON files in the private bucket, each file optional ("missing = unchanged"); new photos wait in `staging/`. `POST /api/admin/publish` runs one step at a time and recomputes what is left from the buckets, so it resumes after an interruption. The current (vanilla) dashboard keeps working on the published data until plan 4 replaces it.

**Tech Stack:** Cloudflare Workers + R2 bindings, Vitest 4 (node and jsdom), Terraform 1.9 (`terraform test` with mock provider).

**Spec:** `docs/maintainers/superpowers/specs/2026-09-27-dashboard-react-design.md` (sections "Bucket privato", "Dati", "Bozza e pubblicazione", item 2 of "I quattro piani"). Rulings taken while writing this plan are recorded in the spec's section "Scelte fatte scrivendo il piano 2".

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
- Stage files by name only: never `git add -A` or `git add .`. The untracked `wrangler.json` in the repository root stays untracked; `.superpowers/` is git-ignored.
- Work only inside `/srv/claude/workspaces/`. Do not read or print credentials.
- Code, comments and test names in English. Visible copy only in `config/texts.config.js` (English) and `config/texts.it.js` (Italian), same keys in both.
- Every change the README describes updates both `README.md` and `README.it.md`.
- The exact edits of this plan were first applied to a disposable copy and replayed task by task from a clean checkout. They live as **checked scripts** and **ready files** in `/srv/claude/workspaces/qa-browser/p2/`: a script stops with an `AssertionError` if a text it expects is missing. Run them from the repository root; never edit them. If one stops, report NEEDS_CONTEXT with its message instead of improvising.
- Expected full-suite counts after each task are given in the task; baseline before Task 1: 80 test files, 621 passed, 1 skipped.

---

### Task 1: The messages bucket becomes the private bucket

Binding `MESSAGES_BUCKET` → `PRIVATE_BUCKET`, Terraform resources `messages_prod`/`messages_staging` → `private_prod`/`private_staging`, outputs `messages_bucket_*` → `private_bucket_*`, bucket names `<project>-messages[-staging]` → `<project>-private[-staging]`, in code, tests and docs. Pure rename: no behaviour changes.

**Files:** `wrangler.example.json`, `src/worker/contact-routes.js` (+test), `src/worker/admin-routes.js` (+test), `src/utils/renderWrangler.js` (+test), `infra/r2.tf`, `infra/outputs.tf`, `infra/tests/staging.tftest.hcl`, `docs/upgrading.md`, `docs/runbook-cloudflare.md`, `docs/maintainers/prova-cloudflare.md`.

- [ ] **Step 1: Run the checked rename**

`/srv/claude/workspaces/qa-browser/p2/rename-private-bucket.py` — full text:

```python
# Renames the messages bucket to the private bucket (spec: "Bucket privato").
# Every replacement is checked: the script stops if an expected text is missing.
import re, sys

FILES = [
    'wrangler.example.json',
    'src/worker/contact-routes.js', 'src/worker/contact-routes.test.js',
    'src/worker/admin-routes.js', 'src/worker/admin-routes.test.js',
    'src/utils/renderWrangler.js', 'src/utils/renderWrangler.test.js',
    'infra/r2.tf', 'infra/outputs.tf', 'infra/tests/staging.tftest.hcl',
    'docs/upgrading.md', 'docs/runbook-cloudflare.md', 'docs/maintainers/prova-cloudflare.md',
]

# Order matters: longer names first.
TOKENS = [
    ('MESSAGES_BUCKET', 'PRIVATE_BUCKET'),
    ('messages_bucket_prod', 'private_bucket_prod'),
    ('messages_bucket_staging', 'private_bucket_staging'),
    ('messages_prod', 'private_prod'),
    ('messages_staging', 'private_staging'),
    ('-messages-staging', '-private-staging'),
    ('-messages', '-private'),
]

# Prose that must change meaning, not just name (file, old, new).
PROSE = [
    ('infra/r2.tf',
     '# Messaggi del form di contatto: bucket privato, senza dominio r2.dev né custom.\n',
     '# Bucket privato: messaggi del form, bozza della dashboard e foto in attesa di\n# pubblicazione. Senza dominio r2.dev né custom.\n'),
    ('infra/outputs.tf',
     '# Bucket privati dei messaggi: solo il nome, per il binding del Worker. Nessun URL pubblico.\n',
     '# Bucket privati (messaggi, bozza, foto in attesa): solo il nome, per il binding del Worker. Nessun URL pubblico.\n'),
    ('docs/runbook-cloudflare.md',
     'for contact messages. **Do not enable public access on it**',
     'for contact messages, the dashboard draft and photos waiting to be published. **Do not enable public access on it**'),
    ('docs/upgrading.md',
     'Contact messages now go to a private bucket,',
     'Contact messages (and, later, the dashboard draft) now go to a private bucket,'),
]

for path, old, new in PROSE:
    s = open(path).read()
    assert s.count(old) == 1, (path, old[:60], s.count(old))
    open(path, 'w').write(s.replace(old, new))

total = 0
def rename_line(line):
    # Links are left alone: a URL may contain "-messages" (e.g. a Slack docs page).
    if 'https://' in line:
        return line
    for old, new in TOKENS:
        line = line.replace(old, new)
    return line

for path in FILES:
    before = open(path).read()
    s = ''.join(rename_line(line) for line in before.splitlines(keepends=True))
    assert s != before, f'{path}: nothing to rename'
    open(path, 'w').write(s)
    total += 1
    print('renamed in', path)

# Nothing may be left behind in the renamed files.
for path in FILES:
    for line in open(path):
        if 'https://' in line:
            continue
        for old, _ in TOKENS:
            assert old not in line, (path, old, line.strip()[:80])
print('done', total, 'files')
```

Run: `python3 /srv/claude/workspaces/qa-browser/p2/rename-private-bucket.py`
Expected: 13 lines `renamed in …`, then `done 13 files`. Lines containing `https://` are skipped on purpose (a Slack docs URL contains `-messages`).

- [ ] **Step 2: Check**

Run: `npm test` → 80 files, 621 passed, 1 skipped.
Run: `cd infra && terraform init -backend=false >/dev/null && terraform test; cd ..` → `2 passed, 0 failed`. (`infra/.terraform*` files are git-ignored; do not commit them.)
Run: `git grep -n "MESSAGES_BUCKET\|messages_bucket\|messages_prod\|messages_staging" -- . ':!docs/maintainers/superpowers'` → no output.
Run: `node /srv/claude/workspaces/qa-audit/check-links.mjs` → `0 broken`.

- [ ] **Step 3: Commit**

```bash
git add wrangler.example.json src/worker/contact-routes.js src/worker/contact-routes.test.js src/worker/admin-routes.js src/worker/admin-routes.test.js src/utils/renderWrangler.js src/utils/renderWrangler.test.js infra/r2.tf infra/outputs.tf infra/tests/staging.tftest.hcl docs/upgrading.md docs/runbook-cloudflare.md docs/maintainers/prova-cloudflare.md
git commit -F - <<'EOF'
refactor(infra): the messages bucket becomes the private bucket

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: `site.json` formats — links and editable page texts

**Files:**
- Modify: `src/shared/content-rules.js` (constants `EDITABLE_TEXT_KEYS`, `MAX_TEXT_LENGTH`, `MAX_LINKS`, `MAX_LINK_LABEL`; `validateSiteShape`), `src/shared/content-rules.test.js`, `config/texts.config.js`, `config/texts.it.js` (new `links` group)
- Create: `src/shared/site-links.js`, `src/shared/site-links.test.js`, `src/shared/merge-texts.js`, `src/shared/merge-texts.test.js`

**Interfaces — Produces:**
- `EDITABLE_TEXT_KEYS` (frozen array of dotted keys), `MAX_TEXT_LENGTH = 500`, `MAX_LINKS = 12`, `MAX_LINK_LABEL = 40` from `src/shared/content-rules.js`.
- `validateSiteShape(site)`: `social` becomes optional (legacy); accepts optional `links` and `texts`.
- `linkKind(url) → string`, `linkLabel(link, texts) → string`, `normalizeLinks(site) → Array<{url, label?}>`, `LINK_KINDS` from `src/shared/site-links.js`.
- `mergeTexts(texts, overrides) → object` from `src/shared/merge-texts.js`.
- `texts.links.email`, `texts.links.website`.

- [ ] **Step 1: Write the tests**

Copy the two new test files:

```bash
cp /srv/claude/workspaces/qa-browser/p2/files/src/shared/site-links.test.js /srv/claude/workspaces/qa-browser/p2/files/src/shared/merge-texts.test.js src/shared/
python3 /srv/claude/workspaces/qa-browser/p2/t2-tests.py
```

`src/shared/site-links.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/shared/site-links.test.js`; full text:

```js
import { describe, expect, it } from 'vitest';
import { linkKind, linkLabel, normalizeLinks } from './site-links.js';

const texts = { links: { email: 'Email', website: 'Website' } };

describe('linkKind', () => {
  it('recognises networks by host, with or without www', () => {
    expect(linkKind('https://instagram.com/davidetarsi')).toBe('instagram');
    expect(linkKind('https://www.behance.net/x')).toBe('behance');
    expect(linkKind('https://twitter.com/x')).toBe('x');
    expect(linkKind('https://bsky.app/profile/x')).toBe('bluesky');
    expect(linkKind('https://youtu.be/abc')).toBe('youtube');
    expect(linkKind('https://github.com/davidetarsi')).toBe('github');
  });
  it('mailto: is email; any other address is a website', () => {
    expect(linkKind('mailto:me@example.com')).toBe('email');
    expect(linkKind('https://davidetarsi.com')).toBe('website');
    expect(linkKind('not a url')).toBe('website');
  });
});

describe('linkLabel', () => {
  it('uses the label when there is one, else the name of the kind', () => {
    expect(linkLabel({ url: 'https://github.com/x', label: ' Codice ' }, texts)).toBe('Codice');
    expect(linkLabel({ url: 'https://instagram.com/x' }, texts)).toBe('Instagram');
    expect(linkLabel({ url: 'mailto:a@b.c' }, texts)).toBe('Email');
    expect(linkLabel({ url: 'https://example.com' }, texts)).toBe('Website');
    expect(linkLabel({ url: 'https://example.com' }, {})).toBe('https://example.com');
  });
});

describe('normalizeLinks', () => {
  it('keeps links when the site has them', () => {
    const links = [{ url: 'https://github.com/x' }];
    expect(normalizeLinks({ links, social: { instagram: 'https://instagram.com/y' } })).toBe(links);
  });
  it('converts the old social object, skipping empty addresses', () => {
    expect(normalizeLinks({ social: { instagram: ' https://instagram.com/y ', flickr: '' } }))
      .toEqual([{ url: 'https://instagram.com/y' }]);
  });
  it('no links and no social: an empty list', () => {
    expect(normalizeLinks({})).toEqual([]);
    expect(normalizeLinks(undefined)).toEqual([]);
  });
});
```

`src/shared/merge-texts.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/shared/merge-texts.test.js`; full text:

```js
import { describe, expect, it } from 'vitest';
import { mergeTexts } from './merge-texts.js';
import { texts } from '../../config/texts.config.js';
import { texts as textsIt } from '../../config/texts.it.js';
import { EDITABLE_TEXT_KEYS } from './content-rules.js';

describe('mergeTexts', () => {
  it('applies overrides for editable keys, nested ones included', () => {
    const merged = mergeTexts(texts, { 'about.heading': 'Scrivimi', 'about.form.successMessage': 'Grazie!' });
    expect(merged.about.heading).toBe('Scrivimi');
    expect(merged.about.form.successMessage).toBe('Grazie!');
    expect(merged.about.body).toBe(texts.about.body);
  });
  it('ignores keys that are not editable and empty overrides', () => {
    const merged = mergeTexts(texts, { 'nav.homeLabel': 'Casa', 'about.body': '  ' });
    expect(merged.nav.homeLabel).toBe(texts.nav.homeLabel);
    expect(merged.about.body).toBe(texts.about.body);
  });
  it('does not modify the texts it receives', () => {
    const before = texts.about.heading;
    mergeTexts(texts, { 'about.heading': 'Changed' });
    expect(texts.about.heading).toBe(before);
  });
  it('without overrides returns an equal copy', () => {
    expect(mergeTexts(texts)).toEqual(texts);
    expect(mergeTexts(texts, null)).toEqual(texts);
  });
  it('every editable key names a string in both texts files', () => {
    for (const source of [texts, textsIt]) {
      for (const key of EDITABLE_TEXT_KEYS) {
        expect(typeof key.split('.').reduce((node, part) => node?.[part], source), key).toBe('string');
      }
    }
  });
});
```

`/srv/claude/workspaces/qa-browser/p2/t2-tests.py` — full text:

```python
# Task 2 tests: new cases for validateSiteShape.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:60], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/shared/content-rules.test.js', [("""    expect(validateSiteShape({ ...ok, social: [] }).ok).toBe(false);
    expect(validateSiteShape(null).ok).toBe(false);
  });
});
""", """    expect(validateSiteShape({ ...ok, social: [] }).ok).toBe(false);
    expect(validateSiteShape(null).ok).toBe(false);
  });
  it('accepts links and page texts; social becomes optional', () => {
    const { social: _, ...noSocial } = ok;
    expect(validateSiteShape(noSocial).ok).toBe(true);
    expect(validateSiteShape({
      ...noSocial,
      links: [{ url: 'https://instagram.com/x' }, { url: 'mailto:a@b.c', label: 'Scrivimi' }],
      texts: { 'about.heading': 'Scrivimi', 'landing.albumsSectionHeading': 'Album' },
    }).ok).toBe(true);
  });
  it('rejects bad links', () => {
    expect(validateSiteShape({ ...ok, links: {} }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, links: [{ url: 'http://insecure.example' }] }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, links: [{ url: 'javascript:alert(1)' }] }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, links: [{ url: 'https://x.y', label: 'x'.repeat(41) }] }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, links: Array.from({ length: 13 }, () => ({ url: 'https://x.y' })) }).ok).toBe(false);
  });
  it('rejects texts that are not editable or too long', () => {
    expect(validateSiteShape({ ...ok, texts: { 'nav.homeLabel': 'Casa' } }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, texts: { 'about.body': 'x'.repeat(501) } }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, texts: { 'about.body': 3 } }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, texts: [] }).ok).toBe(false);
  });
});
""")])
print('t2 tests applied')
```

- [ ] **Step 2: See them fail**

Run: `npm test` → 3 test files failed (the two new ones cannot import their modules; `content-rules.test.js` fails on links and texts).

- [ ] **Step 3: Implement**

```bash
python3 /srv/claude/workspaces/qa-browser/p2/t2.py
cp /srv/claude/workspaces/qa-browser/p2/files/src/shared/site-links.js /srv/claude/workspaces/qa-browser/p2/files/src/shared/merge-texts.js src/shared/
```

`/srv/claude/workspaces/qa-browser/p2/t2.py` — full text:

```python
# Task 2: site.json formats (links, page texts). Checked edits: stops if a text is missing.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:60], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/shared/content-rules.js', [
 ("export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;\n",
  """export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Texts of config/texts.config.js that the dashboard may override, saved in site.json
 * under `texts` and merged by mergeTexts(). Adding a key here makes it editable.
 */
export const EDITABLE_TEXT_KEYS = Object.freeze([
  'landing.albumsSectionHeading',
  'about.heading',
  'about.body',
  'about.form.successMessage',
]);
export const MAX_TEXT_LENGTH = 500;
export const MAX_LINKS = 12;
export const MAX_LINK_LABEL = 40;
const LINK_URL_RE = /^(https:\\/\\/[^\\s]+|mailto:[^\\s]+)$/;
"""),
 (" * Validates the structure of site metadata (name, bio, hero image, social links).",
  " * Validates the structure of site metadata (name, bio, hero image, links, page texts)."),
 ("""  if (!isObj(data.social)) return fail('site.social must be an object');
  for (const v of Object.values(data.social)) {
    if (typeof v !== 'string') return fail('site.social: values must be strings');
  }
  return OK;
}
""", """  // Legacy shape, still written by the current dashboard until plan 4 replaces it.
  if (data.social !== undefined) {
    if (!isObj(data.social)) return fail('site.social must be an object');
    for (const v of Object.values(data.social)) {
      if (typeof v !== 'string') return fail('site.social: values must be strings');
    }
  }
  if (data.links !== undefined) {
    if (!Array.isArray(data.links)) return fail('site.links must be an array');
    if (data.links.length > MAX_LINKS) return fail(`site.links: at most ${MAX_LINKS} links`);
    for (const link of data.links) {
      if (!isObj(link)) return fail('site.links: each link must be an object');
      if (typeof link.url !== 'string' || !LINK_URL_RE.test(link.url)) {
        return fail(`site.links: "${link.url}" must start with https:// or mailto:`);
      }
      if (link.label !== undefined && (typeof link.label !== 'string' || link.label.length > MAX_LINK_LABEL)) {
        return fail(`site.links: label must be a string of at most ${MAX_LINK_LABEL} characters`);
      }
    }
  }
  if (data.texts !== undefined) {
    if (!isObj(data.texts)) return fail('site.texts must be an object');
    for (const [key, value] of Object.entries(data.texts)) {
      if (!EDITABLE_TEXT_KEYS.includes(key)) return fail(`site.texts: "${key}" cannot be edited from the dashboard`);
      if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
        return fail(`site.texts: "${key}" must be a string of at most ${MAX_TEXT_LENGTH} characters`);
      }
    }
  }
  return OK;
}
"""),
])
edit('config/texts.config.js', [("  nav: {\n", "  links: {\n    email: 'Email',\n    website: 'Website',\n  },\n  nav: {\n")])
edit('config/texts.it.js', [("  nav: {\n", "  links: {\n    email: 'Email',\n    website: 'Sito',\n  },\n  nav: {\n")])
print('t2 applied')
```

`src/shared/site-links.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/shared/site-links.js`; full text:

```js
/**
 * The site's links (social profiles, website, email): their kind, their label, and the
 * conversion from the old `social: { instagram: url }` shape. Shared by site and dashboard.
 */

/** Kinds recognised from the address, with the name shown when a link has no label. */
export const LINK_KINDS = Object.freeze({
  instagram: 'Instagram',
  behance: 'Behance',
  flickr: 'Flickr',
  '500px': '500px',
  vimeo: 'Vimeo',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  threads: 'Threads',
  bluesky: 'Bluesky',
  x: 'X',
  linkedin: 'LinkedIn',
  github: 'GitHub',
});

const HOST_KINDS = {
  'instagram.com': 'instagram',
  'behance.net': 'behance',
  'flickr.com': 'flickr',
  '500px.com': '500px',
  'vimeo.com': 'vimeo',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tiktok.com': 'tiktok',
  'facebook.com': 'facebook',
  'threads.net': 'threads',
  'threads.com': 'threads',
  'bsky.app': 'bluesky',
  'x.com': 'x',
  'twitter.com': 'x',
  'linkedin.com': 'linkedin',
  'github.com': 'github',
};

/**
 * The kind of a link, from its address.
 * @param {string} url - An https:// or mailto: address.
 * @returns {string} A key of LINK_KINDS, 'email' for mailto:, otherwise 'website'.
 */
export function linkKind(url) {
  if (String(url).toLowerCase().startsWith('mailto:')) return 'email';
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'website';
  }
  host = host.replace(/^(www\.|m\.)/, '');
  return HOST_KINDS[host] ?? 'website';
}

/**
 * The text shown for a link: its own label, else the name of its kind.
 * @param {{url: string, label?: string}} link
 * @param {object} texts - UI copy; `texts.links.email` and `texts.links.website` name the generic kinds.
 * @returns {string}
 */
export function linkLabel(link, texts) {
  if (link.label?.trim()) return link.label.trim();
  const kind = linkKind(link.url);
  // A texts file without `links` (an old fork's copy) falls back to the address itself.
  return LINK_KINDS[kind] ?? texts?.links?.[kind] ?? link.url;
}

/**
 * The site's links in the current shape. A site saved before links existed has
 * `social: { network: url }`: its non-empty addresses become links, in order.
 * @param {{links?: Array, social?: object}} site
 * @returns {Array<{url: string, label?: string}>}
 */
export function normalizeLinks(site) {
  if (Array.isArray(site?.links)) return site.links;
  return Object.values(site?.social ?? {})
    .filter(url => typeof url === 'string' && url.trim())
    .map(url => ({ url: url.trim() }));
}
```

`src/shared/merge-texts.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/shared/merge-texts.js`; full text:

```js
import { EDITABLE_TEXT_KEYS } from './content-rules.js';

/**
 * The interface copy with the dashboard's overrides applied.
 * Only keys in EDITABLE_TEXT_KEYS are taken; an empty or missing override keeps the
 * value of config/texts.config.js. The input objects are not modified.
 * @param {object} texts - Copy from config/texts.config.js.
 * @param {Record<string, string>} [overrides] - site.texts, keyed by dotted path.
 * @returns {object} A new texts object.
 */
export function mergeTexts(texts, overrides = {}) {
  const merged = structuredClone(texts);
  for (const key of EDITABLE_TEXT_KEYS) {
    const value = overrides?.[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const path = key.split('.');
    const last = path.pop();
    const parent = path.reduce((node, part) => node?.[part], merged);
    if (parent && typeof parent[last] === 'string') parent[last] = value;
  }
  return merged;
}
```

- [ ] **Step 4: Check**

Run: `npm test` → 82 files, 635 passed, 1 skipped.

- [ ] **Step 5: Commit**

```bash
git add src/shared/content-rules.js src/shared/content-rules.test.js config/texts.config.js config/texts.it.js src/shared/site-links.js src/shared/site-links.test.js src/shared/merge-texts.js src/shared/merge-texts.test.js
git commit -F - <<'EOF'
feat(shared): links and editable page texts in site.json

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: The site shows the links and the edited texts

The resolved site content carries `links` (old `social` converted) and `texts` instead of `social`; the footer lists the links; home, about and album pages use the texts merged with the dashboard's edits (the landing receives them in `data.texts`). The current dashboard opens a `site.json` without `social` and keeps `links`/`texts` when it saves. `linkKind` and `linkLabel` join the public API. Docs: `docs/slots.md`, `docs/upgrading.md` (changed `ctx` field), `CUSTOMIZING.md`, both READMEs.

**Files:**
- Modify: `src/components/Footer.js`, `src/core/default-slots.js`, `src/pages/home-logic.js`, `config/site.config.js`, `src/admin/preview.js`, `src/pages/index.js`, `src/pages/about.js`, `src/pages/album.js`, `src/components/Landing.js`, `src/admin/views/home.js`, `src/api/index.js`
- Tests: `src/components/Footer.test.js`, `src/core/default-slots.test.js`, `src/pages/home-logic.test.js`, `src/components/Landing.test.js`, `src/pages/about.test.js`, `src/admin/views/home.test.js`, `src/api/index.test.js`
- Docs: `docs/slots.md`, `docs/upgrading.md`, `CUSTOMIZING.md`, `README.md`, `README.it.md`

**Interfaces:**
- Consumes (Task 2): `normalizeLinks`, `linkLabel`, `mergeTexts`, `texts.links`.
- Produces: `resolveSiteContent()` returns `{ name, bio, links, texts, heroUrl }` (no `social`); `renderFooter(container, texts, links = [])`; the landing's `ctx.data` resolves to `{ site, albums, albumsError, r2PublicUrl, texts }`.

- [ ] **Step 1: Update and add the tests**

```bash
python3 /srv/claude/workspaces/qa-browser/p2/t3-tests.py
python3 /srv/claude/workspaces/qa-browser/p2/t3b-tests.py
```

`/srv/claude/workspaces/qa-browser/p2/t3-tests.py` — full text:

```python
def edit(p, pairs):
    s=open(p).read()
    for o,n in pairs:
        assert s.count(o)==1,(p,o[:60],s.count(o)); s=s.replace(o,n)
    open(p,'w').write(s)

edit('src/components/Footer.test.js', [
 ("""  it('senza social, nessun link viene renderizzato', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } });
    expect(container.querySelector('.site-footer__links')).toBeNull();
  });

  it('con social valorizzati, renderizza un link per ciascuno con href corretto', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } }, { instagram: 'https://instagram.com/x' });
    const links = container.querySelectorAll('.site-footer__link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://instagram.com/x');
    expect(links[0].textContent).toBe('Instagram');
  });

  it('ignora chiavi social con valore vuoto o non-stringa', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } }, { instagram: '', twitter: '   ' });
    expect(container.querySelector('.site-footer__links')).toBeNull();
  });
""", """  it('without links, renders no link list', () => {
    renderFooter(container, { footer: { copyright: '© 2026' } });
    expect(container.querySelector('.site-footer__links')).toBeNull();
    renderFooter(container, { footer: { copyright: '© 2026' } }, []);
    expect(container.querySelector('.site-footer__links')).toBeNull();
  });

  it('renders one link per entry, in order, labelled by kind or by its own label', () => {
    const texts = { footer: { copyright: '© 2026' }, links: { email: 'Email', website: 'Website' } };
    renderFooter(container, texts, [
      { url: 'https://instagram.com/x' },
      { url: 'https://github.com/x', label: 'Codice' },
      { url: 'mailto:a@b.c' },
    ]);
    const links = [...container.querySelectorAll('.site-footer__link')];
    expect(links.map(a => a.getAttribute('href'))).toEqual(['https://instagram.com/x', 'https://github.com/x', 'mailto:a@b.c']);
    expect(links.map(a => a.textContent)).toEqual(['Instagram', 'Codice', 'Email']);
  });
"""),
])
edit('src/core/default-slots.test.js', [
 ("const site = { name: 'Test Site', social: { instagram: 'https://example.com' } };",
  "const site = { name: 'Test Site', links: [{ url: 'https://example.com' }] };"),
])
edit('src/pages/home-logic.test.js', [
 ("const BUILD = { name: 'Build Name', bio: 'Build bio', heroImage: { album: 'sport', name: 'hero.webp' }, social: { x: 'y' }, r2PublicUrl: 'https://pub.r2.dev' };",
  "const BUILD = { name: 'Build Name', bio: 'Build bio', heroImage: { album: 'sport', name: 'hero.webp' }, links: [{ url: 'https://example.com' }], r2PublicUrl: 'https://pub.r2.dev' };"),
 ("""    const site = { name: 'Runtime', bio: 'B', hero: { album: 'sport', name: 'a.webp' }, social: {} };
    expect(resolveSiteContent({ ok: true, data: site }, BUILD)).toEqual({
      name: 'Runtime', bio: 'B', social: {}, heroUrl: 'https://pub.r2.dev/sport/a.webp',
    });
  });""", """    const site = {
      name: 'Runtime', bio: 'B', hero: { album: 'sport', name: 'a.webp' },
      links: [{ url: 'https://instagram.com/x' }], texts: { 'about.heading': 'Scrivimi' },
    };
    expect(resolveSiteContent({ ok: true, data: site }, BUILD)).toEqual({
      name: 'Runtime', bio: 'B', links: [{ url: 'https://instagram.com/x' }], texts: { 'about.heading': 'Scrivimi' },
      heroUrl: 'https://pub.r2.dev/sport/a.webp',
    });
  });
  it('a site.json saved before links existed: social becomes links, texts empty', () => {
    const site = { name: 'Runtime', bio: '', hero: null, social: { instagram: 'https://instagram.com/x' } };
    const resolved = resolveSiteContent({ ok: true, data: site }, BUILD);
    expect(resolved.links).toEqual([{ url: 'https://instagram.com/x' }]);
    expect(resolved.texts).toEqual({});
  });"""),
 ("""      name: 'Build Name', bio: 'Build bio', social: { x: 'y' }, heroUrl: 'https://pub.r2.dev/sport/hero.webp',""",
  """      name: 'Build Name', bio: 'Build bio', links: [{ url: 'https://example.com' }], texts: {},
      heroUrl: 'https://pub.r2.dev/sport/hero.webp',"""),
])
edit('src/components/Landing.test.js', [
 ("""  it('renders one card per album', async () => {""",
  """  it('replaces the section heading with the edited text when the data brings one', async () => {
    const { landing } = await import('./Landing.js');
    const pageTexts = { ...texts, landing: { albumsSectionHeading: 'Portfolio' } };
    await landing.mount(container, {
      texts, data: Promise.resolve({ site, albums: [], albumsError: null, r2PublicUrl: 'https://pub-test.r2.dev', texts: pageTexts }),
    });
    expect(container.querySelector('#albums-heading').textContent).toBe('Portfolio');
  });

  it('renders one card per album', async () => {"""),
])
edit('src/pages/about.test.js', [
 ("""  it('skips contact form setup when the page is disposed before site data resolves', async () => {""",
  """  it('shows the heading and text edited from the dashboard', async () => {
    mocks.fetchSite.mockResolvedValue({ ok: true, data: {
      name: 'Runtime', bio: '', hero: null, texts: { 'about.heading': 'Scrivimi', 'about.body': 'Per lavori su commissione.' },
    } });
    await import('./about.js');

    expect(document.querySelector('#about-heading').textContent).toBe('Scrivimi');
    expect(document.querySelector('#about-body').textContent).toBe('Per lavori su commissione.');
    expect(mocks.mountChrome).toHaveBeenCalledWith(expect.objectContaining({
      texts: expect.objectContaining({ about: expect.objectContaining({ heading: 'Scrivimi' }) }),
    }));
  });

  it('skips contact form setup when the page is disposed before site data resolves', async () => {"""),
])
print('t3 tests applied')
```

`/srv/claude/workspaces/qa-browser/p2/t3b-tests.py` — full text:

```python
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:60], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/admin/views/home.test.js', [
 ("""  it('social preserva le altre chiavi oltre instagram', () => {""",
  """  it('keeps links and page texts, which this form does not edit', () => {
    const site = { ...currentSite, links: [{ url: 'https://github.com/x' }], texts: { 'about.heading': 'Scrivimi' } };
    const result = buildPendingSite({ name: 'X', bio: '', instagram: '' }, site);
    expect(result.links).toEqual([{ url: 'https://github.com/x' }]);
    expect(result.texts).toEqual({ 'about.heading': 'Scrivimi' });
  });

  it('social preserva le altre chiavi oltre instagram', () => {"""),
 ("""  it('labels the hero picker with the configured copy', () => {""",
  """  it('opens a site saved with links and no social', () => {
    renderAdminHome(container, makeCtx({ site: { name: 'Davide', bio: '', hero: null, links: [{ url: 'https://github.com/x' }] } }));
    expect(container.querySelector('[name="site-instagram"]').value).toBe('');
  });

  it('labels the hero picker with the configured copy', () => {"""),
])
edit('src/api/index.test.js', [
 ("      'albumsToCards', 'fetchAlbums', 'fetchConfig', 'fetchManifest', 'fetchSite', 'on',\n      'photosFromManifest',",
  "      'albumsToCards', 'fetchAlbums', 'fetchConfig', 'fetchManifest', 'fetchSite', 'linkKind', 'linkLabel', 'on',\n      'photosFromManifest',"),
])
print('t3b tests applied')
```

- [ ] **Step 2: See them fail**

Run: `npm test` → 10 tests failed in 7 files.

- [ ] **Step 3: Implement, then the docs**

```bash
python3 /srv/claude/workspaces/qa-browser/p2/t3.py
python3 /srv/claude/workspaces/qa-browser/p2/t3b.py
python3 /srv/claude/workspaces/qa-browser/p2/t3-docs.py
```

`/srv/claude/workspaces/qa-browser/p2/t3.py` — full text:

```python
def edit(p, pairs):
    s=open(p).read()
    for o,n in pairs:
        assert s.count(o)==1,(p,o[:60],s.count(o)); s=s.replace(o,n)
    open(p,'w').write(s)

# Footer: a list of links, labelled by linkLabel.
edit('src/components/Footer.js', [
 ("import { html } from '../shared/html.js';\n",
  "import { html } from '../shared/html.js';\nimport { linkLabel } from '../shared/site-links.js';\n"),
 (""" * Renders the site footer with copyright and social links.
 * @param {HTMLElement} container - Element to render into.
 * @param {object} texts - UI text strings (copyright from texts.footer.copyright).
 * @param {object} social - Social media links as {platform: url}.
 */
export function renderFooter(container, texts, social = {}) {
  const links = Object.entries(social).filter(([, url]) => typeof url === 'string' && url.trim());
""",
 """ * Renders the site footer with copyright and the site's links.
 * @param {HTMLElement} container - Element to render into.
 * @param {object} texts - UI text strings (texts.footer.copyright, texts.links).
 * @param {Array<{url: string, label?: string}>} links - The site's links, in order.
 */
export function renderFooter(container, texts, links = []) {
"""),
 ("""    for (const [key, url] of links) {
      const a = document.createElement('a');
      a.className = 'site-footer__link';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = key.charAt(0).toUpperCase() + key.slice(1);
""",
 """    for (const link of links) {
      const a = document.createElement('a');
      a.className = 'site-footer__link';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = linkLabel(link, texts);
"""),
])
edit('src/core/default-slots.js', [("renderFooter(container, texts, site.social)", "renderFooter(container, texts, site.links)")])

# Resolved site content: links and page texts instead of social.
edit('src/pages/home-logic.js', [
 ("import { resolveHeroUrl } from '../utils/resolveHeroUrl.js';\n",
  "import { resolveHeroUrl } from '../utils/resolveHeroUrl.js';\nimport { normalizeLinks } from '../shared/site-links.js';\n"),
 (" * @returns {object} Site content with name, bio, social, and heroUrl.\n",
  " * @returns {object} Site content with name, bio, links, texts (page text overrides) and heroUrl.\n"),
 ("""      bio: s.bio,
      social: s.social,
""", """      bio: s.bio,
      links: normalizeLinks(s),
      texts: s.texts ?? {},
"""),
 ("""    bio: buildConfig.bio,
    social: buildConfig.social ?? {},
""", """    bio: buildConfig.bio,
    links: normalizeLinks(buildConfig),
    texts: {},
"""),
])

# Seed: links instead of social.
edit('config/site.config.js', [
 ("name, bio, hero and social are edited from the", "name, bio, hero and links are edited from the"),
 ("""  social: {
    // instagram: 'https://instagram.com/...',
  },
""", """  links: [
    // { url: 'https://instagram.com/...' },
    // { url: 'mailto:me@example.com', label: 'Write to me' },
  ],
"""),
])

# Old dashboard preview: it still edits social, convert for the footer.
edit('src/admin/preview.js', [
 ("import { html } from '../shared/html.js';\n",
  "import { html } from '../shared/html.js';\nimport { normalizeLinks } from '../shared/site-links.js';\n"),
])
s = open('src/admin/preview.js').read()
assert s.count("renderFooter(content.querySelector('.admin-preview__footer'), textsArg, social);") == 2
s = s.replace("renderFooter(content.querySelector('.admin-preview__footer'), textsArg, social);",
              "renderFooter(content.querySelector('.admin-preview__footer'), textsArg, normalizeLinks({ social }));")
open('src/admin/preview.js', 'w').write(s)

# Pages: merged texts.
edit('src/pages/index.js', [
 ("import { texts } from '../../config/texts.config.js';\n",
  "import { texts } from '../../config/texts.config.js';\nimport { mergeTexts } from '../shared/merge-texts.js';\n"),
 ("  return { site, albums, albumsError: albums === null ? albumsRes.error : null, r2PublicUrl };\n",
  "  return { site, albums, albumsError: albums === null ? albumsRes.error : null, r2PublicUrl, texts: mergeTexts(texts, site.texts) };\n"),
 ("""const chromeMount = owner.track(data.then(({ site }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts, owner });
}));""", """const chromeMount = owner.track(data.then(({ site, texts: pageTexts }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts: pageTexts, owner });
}));"""),
])
edit('src/pages/about.js', [
 ("import { texts } from '../../config/texts.config.js';\n",
  "import { texts } from '../../config/texts.config.js';\nimport { mergeTexts } from '../shared/merge-texts.js';\n"),
 ("""  return {
    site: resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl }),
    configRes,
  };
});
const chromeMount = owner.track(sitePromise.then(({ site }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts, owner });
}));""", """  const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
  return { site, configRes, pageTexts: mergeTexts(texts, site.texts) };
});
const chromeMount = owner.track(sitePromise.then(({ site, pageTexts }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts: pageTexts, owner });
}));"""),
 ("""const { site, configRes } = await sitePromise;
if (!owner.destroyed) {
""", """const { site, configRes, pageTexts } = await sitePromise;
if (!owner.destroyed) {
  // Texts edited from the dashboard replace the defaults shown while loading.
  document.getElementById('about-heading').textContent = pageTexts.about.heading;
  document.getElementById('about-body').textContent = pageTexts.about.body;
"""),
 ("    .appendChild(createContactForm({ ...siteConfig, turnstileSitekey }, texts));\n",
  "    .appendChild(createContactForm({ ...siteConfig, turnstileSitekey }, pageTexts));\n"),
])
edit('src/pages/album.js', [
 ("import { texts } from '../../config/texts.config.js';\n",
  "import { texts } from '../../config/texts.config.js';\nimport { mergeTexts } from '../shared/merge-texts.js';\n"),
 ("""const chromeMount = owner.track(sitePromise.then(({ site }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts, owner });
}));""", """const chromeMount = owner.track(sitePromise.then(({ site }) => {
  if (owner.destroyed) return;
  return mountChrome({ site, texts: mergeTexts(texts, site.texts), owner });
}));"""),
])

# Default landing: the section heading may be edited from the dashboard.
edit('src/components/Landing.js', [
 ("   * @param {{texts: object, data: Promise<object>}} ctx - UI texts and the home data promise.\n",
  "   * @param {{texts: object, data: Promise<object>}} ctx - UI texts (for the skeleton) and the home data promise, whose `texts` include the dashboard's edits.\n"),
 ("""    const { site, albums, albumsError, r2PublicUrl } = await data;
    renderHero(container.querySelector('#hero'), site, texts);
""", """    const { site, albums, albumsError, r2PublicUrl, texts: pageTexts = texts } = await data;
    container.querySelector('#albums-heading').textContent = pageTexts.landing.albumsSectionHeading;
    renderHero(container.querySelector('#hero'), site, pageTexts);
"""),
 ("      p.textContent = albumsError === 'NETWORK' ? texts.album.error.network : texts.album.error.unknown;\n",
  "      p.textContent = albumsError === 'NETWORK' ? pageTexts.album.error.network : pageTexts.album.error.unknown;\n"),
])
print('t3 applied')
```

`/srv/claude/workspaces/qa-browser/p2/t3b.py` — full text:

```python
# Task 3, current dashboard: open a site.json that has links and no social, and keep
# links and page texts when saving. Plus the public API export list.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:60], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/admin/views/home.js', [
 ("""  return {
    name: name.trim(),
    bio,
    hero: currentSite.hero,
    social: { ...currentSite.social, instagram: instagram.trim() },
  };""", """  return {
    // Keeps fields this form does not edit (links, page texts) instead of dropping them.
    ...currentSite,
    name: name.trim(),
    bio,
    hero: currentSite.hero,
    social: { ...currentSite.social, instagram: instagram.trim() },
  };"""),
 ("  q('[name=\"site-instagram\"]').value = site.social.instagram ?? '';",
  "  q('[name=\"site-instagram\"]').value = site.social?.instagram ?? '';"),
])
print('t3b applied')
```

`/srv/claude/workspaces/qa-browser/p2/t3-docs.py` — full text:

```python
def edit(p, pairs):
    s=open(p).read()
    for o,n in pairs:
        assert s.count(o)==1,(p,o[:60],s.count(o)); s=s.replace(o,n)
    open(p,'w').write(s)

edit('docs/slots.md', [
 ("- `ctx.texts` — the UI texts from `config/texts.config.js`.\n",
  "- `ctx.texts` — the UI texts from `config/texts.config.js`, for the skeleton drawn before the data arrives.\n"),
 ("- `ctx.data` — a **promise** of `{ site, albums, albumsError, r2PublicUrl }`. It never rejects: a failed load arrives as `albums === null` with `albumsError` set.\n  - `site` — `{ name, bio, heroUrl, social }`, read from R2 with the build values as fallback. `heroUrl` is a full URL or `null`; `social` maps network names to URLs.\n",
  "- `ctx.data` — a **promise** of `{ site, albums, albumsError, r2PublicUrl, texts }`. It never rejects: a failed load arrives as `albums === null` with `albumsError` set.\n  - `site` — `{ name, bio, heroUrl, links, texts }`, read from R2 with the build values as fallback. `heroUrl` is a full URL or `null`. `links` is an ordered array of `{ url, label? }` (`https://` or `mailto:` addresses); `linkLabel(link, texts)` from the public API gives the text to show. `site.texts` holds the page texts edited from the dashboard, by dotted key.\n  - `texts` — the UI texts with the dashboard's edits applied: use these once the data has arrived.\n"),
 ("Both receive `{ site, texts }`. `site` is the resolved site content above; `texts` is the UI copy from `config/texts.config.js`. Each returns an optional `{ destroy() }` handle.",
  "Both receive `{ site, texts }`. `site` is the resolved site content above; `texts` is the UI copy from `config/texts.config.js` with the dashboard's edits applied. Each returns an optional `{ destroy() }` handle."),
])
edit('src/api/index.js', [
 ("export { photosFromManifest } from '../providers/r2.js';\n",
  "export { photosFromManifest } from '../providers/r2.js';\nexport { linkKind, linkLabel } from '../shared/site-links.js';\n"),
])
edit('CUSTOMIZING.md', [
 ("| `social` | Social links | `{ instagram: 'https://instagram.com/...' }` |",
  "| `links` | Links shown in the footer: social profiles, website, email | `[{ url: 'https://instagram.com/...' }, { url: 'mailto:me@example.com', label: 'Write to me' }]` |"),
])
edit('README.md', [("- **`config/site.config.js`** — name, bio, social links, hero", "- **`config/site.config.js`** — name, bio, links (social profiles, website, email), hero")])
edit('README.it.md', [("- **`config/site.config.js`** — nome, bio, social, hero", "- **`config/site.config.js`** — nome, bio, link (profili social, sito, email), hero")])
edit('docs/upgrading.md', [
 (" A removed or renamed export of `src/api/index.js` fails `npm run build`; `npm test` catches it only where a test of yours calls it. No such change so far.",
  " A removed or renamed export of `src/api/index.js` fails `npm run build`; `npm test` catches it only where a test of yours calls it."),
 ("### F3 (2026-09-26): routes and reserved slugs\n",
  """### Links and editable page texts (2026-09-27)

- **Changed `ctx` field:** `site.social` (an object of network → URL) is now `site.links`, an ordered array of `{ url, label? }`. A component of yours that reads `site.social` must read `site.links`; `linkLabel(link, texts)` in the public API gives the text to show.
- `config/site.config.js`: the seed field `social` becomes `links`. An old `social` object, in the seed or in the `site.json` already on R2, is still read and turned into links.
- The landing's `ctx.data` now also carries `texts`, the UI copy with the texts edited from the dashboard applied; nav and footer receive those texts too.

### F3 (2026-09-26): routes and reserved slugs
"""),
])
print('t3 docs applied')
```

- [ ] **Step 4: Check**

Run: `npm test` → 82 files, 639 passed, 1 skipped.
Run: `node /srv/claude/workspaces/qa-audit/check-links.mjs` → `0 broken`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Footer.js src/components/Footer.test.js src/core/default-slots.js src/core/default-slots.test.js src/pages/home-logic.js src/pages/home-logic.test.js config/site.config.js src/admin/preview.js src/pages/index.js src/pages/about.js src/pages/about.test.js src/pages/album.js src/components/Landing.js src/components/Landing.test.js src/admin/views/home.js src/admin/views/home.test.js src/api/index.js src/api/index.test.js docs/slots.md docs/upgrading.md CUSTOMIZING.md README.md README.it.md
git commit -F - <<'EOF'
feat(site): links in the footer and page texts edited from the dashboard

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 4: Draft storage and what would change

**Files:**
- Create: `src/worker/draft-store.js` (keys of published site, draft and waiting photos; `readJson`, `writeJson`, `listKeys`, `deletePrefix`, `hasDraft`, `loadStates`), `src/worker/draft-diff.js` (`diffDraft`), `src/worker/draft-diff.test.js`
- Modify: `src/worker/test-helpers.js` (the fake bucket's `get()` also returns `body` and `httpMetadata`, like the real binding)

**Interfaces — Produces:**
- `PUBLISHED`, `DRAFT` (with `DRAFT.cleanup = 'draft/cleanup.json'`), `STAGING` key builders.
- `loadStates(env) → { published, effective, draft }`; `published`/`effective` are `{ site, albums, manifests: Map }`; `draft` is `{ site: bool, albums: bool, manifests: Set }`.
- `diffDraft(published, effective) → Array<{ type, slug?, count? }>` with types `site`, `albums-reordered`, `album-added`, `album-changed`, `album-removed`, `photos-added`, `photos-removed`, `photos-reordered`.

- [ ] **Step 1: Write the test**

```bash
cp /srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-diff.test.js src/worker/
```

`src/worker/draft-diff.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-diff.test.js`; full text:

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { diffDraft } from './draft-diff.js';

const site = { name: 'Davide', bio: '', hero: null, links: [] };
const album = (slug, extra = {}) => ({ slug, title: slug, description: '', coverName: null, ...extra });
const photo = name => ({ name, width: 4, height: 3 });
const state = (albums, manifests = {}, s = site) => ({ site: s, albums, manifests: new Map(Object.entries(manifests)) });

describe('diffDraft', () => {
  it('no changes when the draft equals the published site', () => {
    const pub = state([album('notte')], { notte: [photo('a.webp')] });
    expect(diffDraft(pub, state([album('notte')], { notte: [photo('a.webp')] }))).toEqual([]);
  });

  it('reports site, added, changed and removed albums', () => {
    const pub = state([album('notte'), album('sport')], { notte: [], sport: [] });
    const eff = state([album('notte', { title: 'Notte in montagna' }), album('viaggio')], { notte: [], viaggio: [] },
      { ...site, bio: 'Nuova bio' });
    expect(diffDraft(pub, eff)).toEqual([
      { type: 'site' },
      { type: 'album-changed', slug: 'notte' },
      { type: 'album-added', slug: 'viaggio' },
      { type: 'album-removed', slug: 'sport' },
    ]);
  });

  it('counts photos added and removed, and notices a new order', () => {
    const pub = state([album('notte')], { notte: [photo('a.webp'), photo('b.webp'), photo('c.webp')] });
    const eff = state([album('notte')], { notte: [photo('c.webp'), photo('a.webp'), photo('d.webp'), photo('e.webp')] });
    expect(diffDraft(pub, eff)).toEqual([
      { type: 'photos-added', slug: 'notte', count: 2 },
      { type: 'photos-removed', slug: 'notte', count: 1 },
      { type: 'photos-reordered', slug: 'notte' },
    ]);
  });

  it('notices albums put in a new order, ignoring added and removed ones', () => {
    const pub = state([album('a'), album('b'), album('c')], { a: [], b: [], c: [] });
    expect(diffDraft(pub, state([album('b'), album('a'), album('c')], { a: [], b: [], c: [] })))
      .toEqual([{ type: 'albums-reordered' }]);
    expect(diffDraft(pub, state([album('a'), album('c')], { a: [], c: [] })))
      .toEqual([{ type: 'album-removed', slug: 'b' }]);
  });

  it('a first installation: nothing published yet', () => {
    const pub = { site: null, albums: [], manifests: new Map() };
    const eff = state([album('notte')], { notte: [photo('a.webp')] });
    expect(diffDraft(pub, eff)).toEqual([
      { type: 'site' },
      { type: 'album-added', slug: 'notte' },
      { type: 'photos-added', slug: 'notte', count: 1 },
    ]);
  });
});
```

Run: `npm test` → 1 file failed (`draft-diff.js` does not exist yet).

- [ ] **Step 2: Implement**

```bash
cp /srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-store.js /srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-diff.js src/worker/
python3 /srv/claude/workspaces/qa-browser/p2/t4.py
```

`src/worker/draft-store.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-store.js`; full text:

```js
/**
 * Where the published site and the dashboard's draft live, and how to read them.
 * Published content is in the public bucket (BUCKET); the draft and the photos waiting
 * to be published are in the private bucket (PRIVATE_BUCKET), never reachable from r2.dev.
 */

export const PUBLISHED = Object.freeze({
  site: '_site/site.json',
  albums: '_data/albums.json',
  manifest: slug => `${slug}/manifest.json`,
  photo: (slug, name) => `${slug}/${name}`,
});

export const DRAFT = Object.freeze({
  prefix: 'draft/',
  site: 'draft/site.json',
  albums: 'draft/albums.json',
  manifest: slug => `draft/albums/${slug}/manifest.json`,
  // Written by a publication before it overwrites anything: what it still has to delete.
  cleanup: 'draft/cleanup.json',
});

export const STAGING = Object.freeze({
  prefix: 'staging/',
  photo: (slug, name) => `staging/${slug}/${name}`,
});

/**
 * Reads a JSON object. A missing key is null; unreadable JSON is an error, so a broken
 * file is never mistaken for an absent one.
 * @param {object} bucket - R2 binding.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function readJson(bucket, key) {
  const obj = await bucket.get(key);
  return obj ? obj.json() : null;
}

/**
 * Writes a JSON object.
 * @param {object} bucket - R2 binding.
 * @param {string} key
 * @param {any} data
 */
export function writeJson(bucket, key, data) {
  return bucket.put(key, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
}

/**
 * Every key under a prefix, following R2's pagination.
 * @param {object} bucket - R2 binding.
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
export async function listKeys(bucket, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    keys.push(...page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/**
 * Deletes every key under a prefix, 1000 at a time (R2's limit per delete call).
 * @param {object} bucket - R2 binding.
 * @param {string} prefix
 * @returns {Promise<number>} How many keys were deleted.
 */
export async function deletePrefix(bucket, prefix) {
  const keys = await listKeys(bucket, prefix);
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
  return keys.length;
}

/** True when the draft or the waiting photos hold anything. */
export async function hasDraft(env) {
  const [draft, staging] = await Promise.all([
    env.PRIVATE_BUCKET.list({ prefix: DRAFT.prefix, limit: 1 }),
    env.PRIVATE_BUCKET.list({ prefix: STAGING.prefix, limit: 1 }),
  ]);
  return draft.objects.length > 0 || staging.objects.length > 0;
}

/**
 * The published site and the site as it will be after publishing (the "effective" draft):
 * each draft file that does not exist means "unchanged", so it falls back to the published one.
 * @param {object} env - Worker env with BUCKET and PRIVATE_BUCKET.
 * @returns {Promise<{published: object, effective: object, draft: object}>}
 *   Each of published and effective is `{ site, albums, manifests }`: site is an object or null,
 *   albums an array, manifests a Map slug → array. `draft` says which draft files exist.
 */
export async function loadStates(env) {
  const [pubSite, pubAlbums, draftSite, draftAlbums] = await Promise.all([
    readJson(env.BUCKET, PUBLISHED.site),
    readJson(env.BUCKET, PUBLISHED.albums),
    readJson(env.PRIVATE_BUCKET, DRAFT.site),
    readJson(env.PRIVATE_BUCKET, DRAFT.albums),
  ]);
  const publishedAlbums = pubAlbums?.albums ?? [];
  const effectiveAlbums = (draftAlbums ?? pubAlbums)?.albums ?? [];
  const slugs = [...new Set([...publishedAlbums, ...effectiveAlbums].map(a => a.slug))];

  const published = { site: pubSite, albums: publishedAlbums, manifests: new Map() };
  const effective = { site: draftSite ?? pubSite, albums: effectiveAlbums, manifests: new Map() };
  const draftManifests = new Set();
  await Promise.all(slugs.map(async slug => {
    const [pub, drf] = await Promise.all([
      readJson(env.BUCKET, PUBLISHED.manifest(slug)),
      readJson(env.PRIVATE_BUCKET, DRAFT.manifest(slug)),
    ]);
    published.manifests.set(slug, pub ?? []);
    effective.manifests.set(slug, drf ?? pub ?? []);
    if (drf) draftManifests.add(slug);
  }));
  return {
    published,
    effective,
    draft: { site: draftSite !== null, albums: draftAlbums !== null, manifests: draftManifests },
  };
}
```

`src/worker/draft-diff.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-diff.js`; full text:

```js
/**
 * What publishing the draft would change on the site, as a list the dashboard can count
 * and show. Pure: works on the states loaded by loadStates() in draft-store.js.
 */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const names = manifest => manifest.map(entry => entry.name);

/**
 * @param {{site: object|null, albums: Array, manifests: Map<string, Array>}} published
 * @param {{site: object|null, albums: Array, manifests: Map<string, Array>}} effective
 * @returns {Array<{type: string, slug?: string, count?: number}>} Changes, site first, then
 *   albums in the draft's order, then removed albums.
 */
export function diffDraft(published, effective) {
  const changes = [];
  if (!same(published.site, effective.site)) changes.push({ type: 'site' });

  const before = new Map(published.albums.map(album => [album.slug, album]));
  const after = new Map(effective.albums.map(album => [album.slug, album]));

  const keptBefore = published.albums.map(a => a.slug).filter(slug => after.has(slug));
  const keptAfter = effective.albums.map(a => a.slug).filter(slug => before.has(slug));
  if (!same(keptBefore, keptAfter)) changes.push({ type: 'albums-reordered' });

  for (const album of effective.albums) {
    const { slug } = album;
    if (!before.has(slug)) {
      changes.push({ type: 'album-added', slug });
    } else if (!same(before.get(slug), album)) {
      changes.push({ type: 'album-changed', slug });
    }
    const oldNames = names(published.manifests.get(slug) ?? []);
    const newNames = names(effective.manifests.get(slug) ?? []);
    const added = newNames.filter(name => !oldNames.includes(name)).length;
    const removed = oldNames.filter(name => !newNames.includes(name)).length;
    if (added) changes.push({ type: 'photos-added', slug, count: added });
    if (removed) changes.push({ type: 'photos-removed', slug, count: removed });
    const keptOld = oldNames.filter(name => newNames.includes(name));
    const keptNew = newNames.filter(name => oldNames.includes(name));
    if (!same(keptOld, keptNew)) changes.push({ type: 'photos-reordered', slug });
  }

  for (const album of published.albums) {
    if (!after.has(album.slug)) changes.push({ type: 'album-removed', slug: album.slug });
  }
  return changes;
}
```

`/srv/claude/workspaces/qa-browser/p2/t4.py` — full text:

```python
# Task 4: the fake R2 bucket returns a body stream, as the real binding does.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:60], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/worker/test-helpers.js', [(
 "      return { text: async () => rec.text, json: async () => JSON.parse(rec.text) };\n",
 """      return {
        text: async () => rec.text,
        json: async () => JSON.parse(rec.text),
        body: new Response(rec.text).body,
        httpMetadata: { contentType: rec.contentType },
      };
""")])
print('t4 applied')
```

- [ ] **Step 3: Check**

Run: `npm test` → 83 files, 644 passed, 1 skipped.

- [ ] **Step 4: Commit**

```bash
git add src/worker/draft-store.js src/worker/draft-diff.js src/worker/draft-diff.test.js src/worker/test-helpers.js
git commit -F - <<'EOF'
feat(worker): draft storage and the list of changes it would publish

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 5: Publishing in steps

**Files:**
- Create: `src/worker/publish.js` (`publishStep`, `PHOTOS_PER_STEP = 25`), `src/worker/publish.test.js`

**Interfaces:**
- Consumes (Task 4): everything exported by `draft-store.js`.
- Produces: `publishStep(env, { photosPerStep }) → { done, copied, remaining } | { problems: Array<{ slug, name, reason }> }` with reasons `PHOTO_MISSING`, `COVER_NOT_IN_ALBUM`, `HERO_NOT_IN_ALBUM`.

- [ ] **Step 1: Write the test**

```bash
cp /srv/claude/workspaces/qa-browser/p2/files/src/worker/publish.test.js src/worker/
```

`src/worker/publish.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/worker/publish.test.js`; full text:

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { publishStep } from './publish.js';
import { makeFakeBucket } from './test-helpers.js';

const site = { name: 'Davide', bio: '', hero: null, links: [] };
const album = (slug, extra = {}) => ({ slug, title: slug, description: '', coverName: null, ...extra });
const photo = name => ({ name, width: 4, height: 3 });

// Published: album "notte" with a.webp and b.webp; album "sport" with s.webp.
const publishedFiles = () => ({
  '_site/site.json': site,
  '_data/albums.json': { albums: [album('notte'), album('sport')] },
  'notte/manifest.json': [photo('a.webp'), photo('b.webp')],
  'notte/a.webp': 'A', 'notte/b.webp': 'B',
  'sport/manifest.json': [photo('s.webp')],
  'sport/s.webp': 'S',
});
const makeEnv = (privateFiles = {}) => ({
  BUCKET: makeFakeBucket(publishedFiles()),
  PRIVATE_BUCKET: makeFakeBucket(privateFiles),
});
const text = (bucket, key) => bucket.store.get(key)?.text;
const json = (bucket, key) => JSON.parse(text(bucket, key));

describe('publishStep', () => {
  it('without a draft there is nothing to do', async () => {
    const env = makeEnv();
    expect(await publishStep(env)).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(json(env.BUCKET, '_data/albums.json').albums).toHaveLength(2);
  });

  it('publishes a full draft: new photos, manifests, albums, site; then removes the draft', async () => {
    const env = makeEnv({
      'draft/site.json': { ...site, bio: 'Nuova bio', hero: { album: 'notte', name: 'c.webp' } },
      'draft/albums.json': { albums: [album('notte', { coverName: 'c.webp' })] }, // sport removed
      'draft/albums/notte/manifest.json': [photo('c.webp'), photo('a.webp')], // b removed, c new
      'staging/notte/c.webp': 'C',
    });

    expect(await publishStep(env)).toEqual({ done: true, copied: 1, remaining: 0 });

    expect(text(env.BUCKET, 'notte/c.webp')).toBe('C');
    expect(env.BUCKET.store.get('notte/c.webp').contentType).toBe('image/webp');
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['c.webp', 'a.webp']);
    expect(json(env.BUCKET, '_data/albums.json')).toEqual({ albums: [album('notte', { coverName: 'c.webp' })] });
    expect(json(env.BUCKET, '_site/site.json').bio).toBe('Nuova bio');
    // Cleanup: b.webp taken out, the whole "sport" album removed; a.webp stays.
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(false);
    expect(env.BUCKET.store.has('notte/a.webp')).toBe(true);
    expect([...env.BUCKET.store.keys()].some(key => key.startsWith('sport/'))).toBe(false);
    // Closed: nothing left in the private bucket.
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('never deletes files that were not in a manifest', async () => {
    const env = makeEnv({ 'draft/albums/notte/manifest.json': [photo('a.webp')] });
    env.BUCKET.store.set('notte/legacy.jpg', { text: 'L' });
    await publishStep(env);
    expect(env.BUCKET.store.has('notte/legacy.jpg')).toBe(true);
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(false);
  });

  it('copies at most photosPerStep photos per call and writes nothing else until all are in place', async () => {
    const names = ['c', 'd', 'e'].map(n => `${n}.webp`);
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), ...names.map(photo)],
      ...Object.fromEntries(names.map(n => [`staging/notte/${n}`, n])),
    });

    expect(await publishStep(env, { photosPerStep: 2 })).toEqual({ done: false, copied: 2, remaining: 1 });
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp', 'b.webp']);
    expect(env.PRIVATE_BUCKET.store.has('draft/albums/notte/manifest.json')).toBe(true);

    expect(await publishStep(env, { photosPerStep: 2 })).toEqual({ done: true, copied: 1, remaining: 0 });
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp', ...names]);
  });

  it('refuses a draft that would publish missing photos, and writes nothing', async () => {
    const env = makeEnv({
      'draft/site.json': { ...site, hero: { album: 'notte', name: 'zzz.webp' } },
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('ghost.webp')],
    });
    const before = JSON.stringify([...env.BUCKET.store]);

    expect(await publishStep(env)).toEqual({ problems: [
      { slug: 'notte', name: 'ghost.webp', reason: 'PHOTO_MISSING' },
      { slug: 'notte', name: 'zzz.webp', reason: 'HERO_NOT_IN_ALBUM' },
    ] });
    expect(JSON.stringify([...env.BUCKET.store])).toBe(before);
  });

  it('refuses a cover that is not in its album', async () => {
    const env = makeEnv({ 'draft/albums.json': { albums: [album('notte', { coverName: 's.webp' }), album('sport')] } });
    expect(await publishStep(env)).toEqual({ problems: [{ slug: 'notte', name: 's.webp', reason: 'COVER_NOT_IN_ALBUM' }] });
  });

  it('resumes after stopping between the writes and the deletions', async () => {
    const env = makeEnv({ 'draft/albums/notte/manifest.json': [photo('a.webp')] });
    const realDelete = env.BUCKET.delete;
    env.BUCKET.delete = async () => { throw new Error('interrupted'); };
    await expect(publishStep(env)).rejects.toThrow('interrupted');
    // The manifest is already published, but the note of what to delete survived.
    expect(json(env.BUCKET, 'notte/manifest.json').map(p => p.name)).toEqual(['a.webp']);
    expect(json(env.PRIVATE_BUCKET, 'draft/cleanup.json').keys).toEqual(['notte/b.webp']);

    env.BUCKET.delete = realDelete;
    expect(await publishStep(env)).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(false);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('does not delete a photo that an earlier note names but the draft wants again', async () => {
    const env = makeEnv({
      'draft/albums/notte/manifest.json': [photo('a.webp'), photo('b.webp')],
      'draft/cleanup.json': { prefixes: ['notte/'], keys: ['notte/b.webp'] },
    });
    await publishStep(env);
    expect(env.BUCKET.store.has('notte/b.webp')).toBe(true);
    expect(env.BUCKET.store.has('notte/a.webp')).toBe(true);
  });

  it('a first installation: publishes an album and a site that did not exist', async () => {
    const env = { BUCKET: makeFakeBucket(), PRIVATE_BUCKET: makeFakeBucket({
      'draft/site.json': site,
      'draft/albums.json': { albums: [album('notte')] },
      'draft/albums/notte/manifest.json': [photo('a.webp')],
      'staging/notte/a.webp': 'A',
    }) };
    expect(await publishStep(env)).toEqual({ done: true, copied: 1, remaining: 0 });
    expect(json(env.BUCKET, '_site/site.json')).toEqual(site);
    expect(json(env.BUCKET, '_data/albums.json').albums).toHaveLength(1);
    expect(text(env.BUCKET, 'notte/a.webp')).toBe('A');
  });
});
```

Run: `npm test` → 1 file failed.

- [ ] **Step 2: Implement**

```bash
cp /srv/claude/workspaces/qa-browser/p2/files/src/worker/publish.js src/worker/
```

`src/worker/publish.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/worker/publish.js`; full text:

```js
/**
 * One step of "Publish": brings the draft onto the public site.
 * Each call recomputes what is left from the buckets themselves, so an interrupted
 * publication resumes with the next call and repeating a step does no harm. Order:
 * check → copy new photos → note what to delete → manifests → albums.json → site.json
 * → delete → close.
 */
import { PUBLISHED, DRAFT, STAGING, listKeys, deletePrefix, readJson, writeJson, loadStates, hasDraft } from './draft-store.js';

/** Photos copied per call: keeps each request well inside the Worker's limits. */
export const PHOTOS_PER_STEP = 25;

/**
 * Problems that would publish a broken site: photos listed in a manifest that exist
 * nowhere, covers that are not in their album, a hero photo that is not in its album.
 * @returns {Array<{slug: string, name: string, reason: string}>}
 */
function findProblems(effective, isAvailable) {
  const problems = [];
  const inAlbum = (slug, name) => (effective.manifests.get(slug) ?? []).some(entry => entry.name === name);
  for (const album of effective.albums) {
    for (const entry of effective.manifests.get(album.slug) ?? []) {
      if (!isAvailable(album.slug, entry.name)) problems.push({ slug: album.slug, name: entry.name, reason: 'PHOTO_MISSING' });
    }
    if (album.coverName && !inAlbum(album.slug, album.coverName)) {
      problems.push({ slug: album.slug, name: album.coverName, reason: 'COVER_NOT_IN_ALBUM' });
    }
  }
  const hero = effective.site?.hero;
  if (hero && !(effective.albums.some(album => album.slug === hero.album) && inAlbum(hero.album, hero.name))) {
    problems.push({ slug: hero.album, name: hero.name, reason: 'HERO_NOT_IN_ALBUM' });
  }
  return problems;
}

/**
 * What the site will no longer use: every file of a removed album, and the photos taken
 * out of a kept album. Computed from the published manifests, so files that were never
 * in a manifest are never touched.
 * @returns {{prefixes: string[], keys: string[]}}
 */
function findDeletions(published, effective) {
  const kept = new Set(effective.albums.map(album => album.slug));
  const prefixes = published.albums.filter(album => !kept.has(album.slug)).map(album => `${album.slug}/`);
  const keys = [];
  for (const album of effective.albums) {
    const wanted = new Set((effective.manifests.get(album.slug) ?? []).map(entry => entry.name));
    for (const entry of published.manifests.get(album.slug) ?? []) {
      if (!wanted.has(entry.name)) keys.push(PUBLISHED.photo(album.slug, entry.name));
    }
  }
  return { prefixes, keys };
}

/**
 * Runs one step of the publication.
 * @param {object} env - Worker env with BUCKET and PRIVATE_BUCKET.
 * @param {{photosPerStep?: number}} [options]
 * @returns {Promise<{done: boolean, copied: number, remaining: number} | {problems: Array}>}
 *   `problems` when the draft cannot be published as it is; nothing has been written then.
 */
export async function publishStep(env, { photosPerStep = PHOTOS_PER_STEP } = {}) {
  if (!(await hasDraft(env))) return { done: true, copied: 0, remaining: 0 };

  const { published, effective, draft } = await loadStates(env);
  const staged = new Set(await listKeys(env.PRIVATE_BUCKET, STAGING.prefix));
  const publicKeys = new Set();
  for (const album of effective.albums) {
    for (const key of await listKeys(env.BUCKET, `${album.slug}/`)) publicKeys.add(key);
  }
  const isPublic = (slug, name) => publicKeys.has(PUBLISHED.photo(slug, name));
  const isStaged = (slug, name) => staged.has(STAGING.photo(slug, name));

  const problems = findProblems(effective, (slug, name) => isPublic(slug, name) || isStaged(slug, name));
  if (problems.length > 0) return { problems };

  // 1. New photos: from the private bucket to the public one, a batch per call.
  const toCopy = [];
  for (const album of effective.albums) {
    for (const entry of effective.manifests.get(album.slug) ?? []) {
      if (!isPublic(album.slug, entry.name)) toCopy.push({ slug: album.slug, name: entry.name });
    }
  }
  const batch = toCopy.slice(0, photosPerStep);
  for (const { slug, name } of batch) {
    const obj = await env.PRIVATE_BUCKET.get(STAGING.photo(slug, name));
    await env.BUCKET.put(PUBLISHED.photo(slug, name), obj.body, { httpMetadata: { contentType: 'image/webp' } });
  }
  if (toCopy.length > batch.length) {
    return { done: false, copied: batch.length, remaining: toCopy.length - batch.length };
  }

  // 2. Note what to delete BEFORE overwriting the manifests that tell us: if this call
  //    stops half-way, the next one still knows (the note survives until the close).
  const earlier = (await readJson(env.PRIVATE_BUCKET, DRAFT.cleanup)) ?? { prefixes: [], keys: [] };
  const found = findDeletions(published, effective);
  // An earlier note may name something the draft wants again: never delete that.
  const kept = new Set(effective.albums.map(album => `${album.slug}/`));
  const wanted = new Set(effective.albums.flatMap(album =>
    (effective.manifests.get(album.slug) ?? []).map(entry => PUBLISHED.photo(album.slug, entry.name))));
  const deletions = {
    prefixes: [...new Set([...earlier.prefixes, ...found.prefixes])].filter(prefix => !kept.has(prefix)),
    keys: [...new Set([...earlier.keys, ...found.keys])].filter(key => !wanted.has(key)),
  };
  await writeJson(env.PRIVATE_BUCKET, DRAFT.cleanup, deletions);

  // 3. Manifests, then the album list, then the site: the list never names an album
  //    whose photos are not in place yet.
  for (const slug of draft.manifests) {
    if (effective.albums.some(album => album.slug === slug)) {
      await writeJson(env.BUCKET, PUBLISHED.manifest(slug), effective.manifests.get(slug));
    }
  }
  if (draft.albums) await writeJson(env.BUCKET, PUBLISHED.albums, { albums: effective.albums });
  if (draft.site) await writeJson(env.BUCKET, PUBLISHED.site, effective.site);

  // 4. Delete what the site no longer uses.
  for (const prefix of deletions.prefixes) await deletePrefix(env.BUCKET, prefix);
  for (let i = 0; i < deletions.keys.length; i += 1000) await env.BUCKET.delete(deletions.keys.slice(i, i + 1000));

  // 5. Close: the draft is now the site.
  await deletePrefix(env.PRIVATE_BUCKET, DRAFT.prefix);
  await deletePrefix(env.PRIVATE_BUCKET, STAGING.prefix);
  return { done: true, copied: batch.length, remaining: 0 };
}
```

- [ ] **Step 3: Check**

Run: `npm test` → 84 files, 653 passed, 1 skipped.

- [ ] **Step 4: Commit**

```bash
git add src/worker/publish.js src/worker/publish.test.js
git commit -F - <<'EOF'
feat(worker): publish the draft in resumable steps

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 6: The draft routes

**Files:**
- Create: `src/worker/draft-routes.js` (`handleDraftRequest`), `src/worker/draft-routes.test.js`
- Modify: `src/worker/admin-routes.js` (hands the draft paths to `handleDraftRequest` right after the Access check)

**Interfaces:**
- Consumes (Tasks 4–5): `draft-store.js`, `diffDraft`, `publishStep`.
- Produces, all behind Access: `GET`/`DELETE /api/admin/draft`, `PUT /api/admin/draft/site`, `PUT /api/admin/draft/albums`, `GET /api/admin/draft/status`, `GET`/`PUT /api/admin/draft/albums/<slug>/manifest`, `PUT`/`GET`/`DELETE /api/admin/staging/<slug>/<name>`, `POST /api/admin/publish` (200 `{ done, copied, remaining }`, 409 `{ error: 'PUBLISH_CHECK_FAILED', problems }`). Without `PRIVATE_BUCKET`: 500 `STORAGE_UNAVAILABLE`.

- [ ] **Step 1: Write the test**

```bash
cp /srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-routes.test.js src/worker/
```

`src/worker/draft-routes.test.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-routes.test.js`; full text:

```js
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { handleAdminRequest } from './admin-routes.js';
import { _resetJwksCache } from './access-jwt.js';
import { makeFakeBucket, makeFakeAssets, makeJwtTestKit } from './test-helpers.js';

const ENV_VARS = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };
const NOW = 1_800_000_000_000;
const SITE = { name: 'Davide', bio: '', hero: null, links: [] };
const ALBUM = { slug: 'notte', title: 'Notte', description: '', coverName: null };

let kit, deps, token;
beforeEach(async () => {
  _resetJwksCache();
  kit = await makeJwtTestKit();
  deps = { fetchJwks: kit.fetchJwks, now: () => NOW };
  token = await kit.signToken({
    aud: ['aud-123'], iss: 'https://team.cloudflareaccess.com',
    exp: Math.floor(NOW / 1000) + 3600, iat: Math.floor(NOW / 1000),
  });
});

const makeEnv = (published = {}, privateFiles = {}) => ({
  ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(published), PRIVATE_BUCKET: makeFakeBucket(privateFiles),
});
const call = (env, method, path, body, headers = { 'Content-Type': 'application/json' }) =>
  handleAdminRequest(new Request(`https://x.dev${path}`, {
    method,
    headers: { 'Cf-Access-Jwt-Assertion': token, ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
  }), env, deps);

describe('draft routes', () => {
  it('are closed without an Access token', async () => {
    const res = await handleAdminRequest(new Request('https://x.dev/api/admin/draft'), makeEnv(), deps);
    expect(res.status).toBe(401);
  });

  it('answer 500 STORAGE_UNAVAILABLE without the private bucket', async () => {
    const env = { ...makeEnv(), PRIVATE_BUCKET: undefined };
    const res = await call(env, 'GET', '/api/admin/draft');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_UNAVAILABLE' });
  });

  it('GET /draft: the published site when there is no draft, then the draft', async () => {
    const env = makeEnv({ '_site/site.json': SITE, '_data/albums.json': { albums: [ALBUM] } });
    expect(await (await call(env, 'GET', '/api/admin/draft')).json())
      .toEqual({ site: SITE, albums: [ALBUM], hasDraft: false });

    const edited = { ...SITE, bio: 'Bozza' };
    expect((await call(env, 'PUT', '/api/admin/draft/site', edited)).status).toBe(200);
    expect(await (await call(env, 'GET', '/api/admin/draft')).json())
      .toEqual({ site: edited, albums: [ALBUM], hasDraft: true });
    // Saving the draft never touches the published site.
    expect(JSON.parse(env.BUCKET.store.get('_site/site.json').text)).toEqual(SITE);
  });

  it('GET /draft on a new installation: no site, no albums', async () => {
    expect(await (await call(makeEnv(), 'GET', '/api/admin/draft')).json())
      .toEqual({ site: null, albums: [], hasDraft: false });
  });

  it('validates what it saves', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/draft/site', { name: '' })).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/draft/albums', { albums: 'no' })).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/draft/albums/notte/manifest', [{ name: 'x.jpg' }])).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/draft/site', '{not json')).status).toBe(400);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
  });

  it('manifest: draft first, then published, then empty', async () => {
    const env = makeEnv({ 'notte/manifest.json': [{ name: 'a.webp', width: 1, height: 1 }] });
    expect(await (await call(env, 'GET', '/api/admin/draft/albums/notte/manifest')).json()).toHaveLength(1);
    expect(await (await call(env, 'GET', '/api/admin/draft/albums/nuovo/manifest')).json()).toEqual([]);
    await call(env, 'PUT', '/api/admin/draft/albums/notte/manifest', []);
    expect(await (await call(env, 'GET', '/api/admin/draft/albums/notte/manifest')).json()).toEqual([]);
    expect((await call(env, 'GET', '/api/admin/draft/albums/BAD/manifest')).status).toBe(404);
  });

  it('staging: upload, read back, delete; only WebP up to 10 MB', async () => {
    const env = makeEnv();
    const webp = { 'Content-Type': 'image/webp' };
    expect((await call(env, 'PUT', '/api/admin/staging/notte/c.webp', new Uint8Array([1, 2]), webp)).status).toBe(200);
    expect(env.PRIVATE_BUCKET.store.has('staging/notte/c.webp')).toBe(true);
    expect(env.BUCKET.store.size).toBe(0);

    const read = await call(env, 'GET', '/api/admin/staging/notte/c.webp');
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('image/webp');

    expect((await call(env, 'PUT', '/api/admin/staging/notte/c.webp', 'x', { 'Content-Type': 'image/png' })).status).toBe(415);
    expect((await call(env, 'PUT', '/api/admin/staging/notte/..%2Fx.webp', new Uint8Array([1]), webp)).status).toBe(400);
    expect((await call(env, 'DELETE', '/api/admin/staging/notte/c.webp')).status).toBe(200);
    expect((await call(env, 'GET', '/api/admin/staging/notte/c.webp')).status).toBe(404);
  });

  it('status lists the changes; DELETE /draft discards draft and waiting photos', async () => {
    const env = makeEnv({ '_site/site.json': SITE, '_data/albums.json': { albums: [ALBUM] } }, {
      'draft/site.json': { ...SITE, bio: 'Bozza' },
      'staging/notte/c.webp': 'C',
    });
    expect(await (await call(env, 'GET', '/api/admin/draft/status')).json())
      .toEqual({ hasDraft: true, changes: [{ type: 'site' }] });

    expect((await call(env, 'DELETE', '/api/admin/draft')).status).toBe(200);
    expect(env.PRIVATE_BUCKET.store.size).toBe(0);
    expect(await (await call(env, 'GET', '/api/admin/draft/status')).json()).toEqual({ hasDraft: false, changes: [] });
  });

  it('publish: POST only; 409 with the problems when the draft cannot be published', async () => {
    const env = makeEnv({ '_data/albums.json': { albums: [ALBUM] } }, {
      'draft/albums/notte/manifest.json': [{ name: 'ghost.webp', width: 1, height: 1 }],
    });
    expect((await call(env, 'GET', '/api/admin/publish')).status).toBe(405);
    const res = await call(env, 'POST', '/api/admin/publish');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'PUBLISH_CHECK_FAILED', problems: [{ slug: 'notte', name: 'ghost.webp', reason: 'PHOTO_MISSING' }],
    });
  });

  it('publish: a step that completes', async () => {
    const env = makeEnv({}, { 'draft/site.json': SITE });
    expect(await (await call(env, 'POST', '/api/admin/publish')).json()).toEqual({ done: true, copied: 0, remaining: 0 });
    expect(JSON.parse(env.BUCKET.store.get('_site/site.json').text)).toEqual(SITE);
  });
});
```

Run: `npm test` → 9 tests failed in 1 file.

- [ ] **Step 2: Implement**

```bash
cp /srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-routes.js src/worker/
python3 /srv/claude/workspaces/qa-browser/p2/t6.py
```

`src/worker/draft-routes.js` — copy it from `/srv/claude/workspaces/qa-browser/p2/files/src/worker/draft-routes.js`; full text:

```js
/**
 * Dashboard routes for the draft: read and save it, photos waiting to be published,
 * what would change, discard, publish. Called by admin-routes.js after the Access check,
 * so every route here is already authenticated.
 */
import { jsonResponse } from './http.js';
import {
  SLUG_RE, PHOTO_NAME_RE, MAX_PHOTO_BYTES,
  validateSiteShape, validateAlbumsShape, validateManifestShape,
} from '../shared/content-rules.js';
import { PUBLISHED, DRAFT, STAGING, readJson, writeJson, deletePrefix, hasDraft, loadStates } from './draft-store.js';
import { diffDraft } from './draft-diff.js';
import { publishStep } from './publish.js';

const MANIFEST_RE = /^\/api\/admin\/draft\/albums\/([^/]+)\/manifest$/;
const STAGING_RE = /^\/api\/admin\/staging\/([^/]+)\/([^/]+)$/;

async function saveValidated(request, key, validate, env) {
  let data;
  try { data = await request.json(); } catch { return jsonResponse({ error: 'Malformed JSON' }, 400); }
  const check = validate(data);
  if (!check.ok) return jsonResponse({ error: check.error }, 400);
  try {
    await writeJson(env.PRIVATE_BUCKET, key, data);
  } catch {
    return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
  }
  return jsonResponse({ ok: true });
}

async function handleStaging(request, env, slug, name) {
  const key = STAGING.photo(slug, name);
  if (request.method === 'PUT') {
    if (request.headers.get('Content-Type') !== 'image/webp') return jsonResponse({ error: 'Expected image/webp' }, 415);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_PHOTO_BYTES) return jsonResponse({ error: 'File over 10MB' }, 413);
    if (bytes.byteLength === 0) return jsonResponse({ error: 'Empty body' }, 400);
    await env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
    return jsonResponse({ ok: true });
  }
  if (request.method === 'GET') {
    const obj = await env.PRIVATE_BUCKET.get(key);
    if (!obj) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    return new Response(obj.body, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' } });
  }
  if (request.method === 'DELETE') {
    await env.PRIVATE_BUCKET.delete(key);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
}

/**
 * Handles a draft route, or returns null when the path is not one.
 * @param {Request} request - Already authenticated.
 * @param {object} env - Worker env with BUCKET and PRIVATE_BUCKET.
 * @param {string} pathname
 * @returns {Promise<Response|null>}
 */
export async function handleDraftRequest(request, env, pathname) {
  const isDraftRoute = pathname === '/api/admin/draft' || pathname.startsWith('/api/admin/draft/')
    || pathname.startsWith('/api/admin/staging/') || pathname === '/api/admin/publish';
  if (!isDraftRoute) return null;
  // The draft lives only in the private bucket: never fall back to the public one.
  if (!env.PRIVATE_BUCKET) return jsonResponse({ error: 'STORAGE_UNAVAILABLE' }, 500);
  const { method } = request;

  if (pathname === '/api/admin/draft') {
    if (method === 'GET') {
      const [draftSite, draftAlbums, pubSite, pubAlbums, pending] = await Promise.all([
        readJson(env.PRIVATE_BUCKET, DRAFT.site),
        readJson(env.PRIVATE_BUCKET, DRAFT.albums),
        readJson(env.BUCKET, PUBLISHED.site),
        readJson(env.BUCKET, PUBLISHED.albums),
        hasDraft(env),
      ]);
      return jsonResponse({
        site: draftSite ?? pubSite,
        albums: (draftAlbums ?? pubAlbums)?.albums ?? [],
        hasDraft: pending,
      });
    }
    if (method === 'DELETE') {
      await deletePrefix(env.PRIVATE_BUCKET, DRAFT.prefix);
      await deletePrefix(env.PRIVATE_BUCKET, STAGING.prefix);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  if (pathname === '/api/admin/draft/site') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return saveValidated(request, DRAFT.site, validateSiteShape, env);
  }

  if (pathname === '/api/admin/draft/albums') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return saveValidated(request, DRAFT.albums, validateAlbumsShape, env);
  }

  if (pathname === '/api/admin/draft/status') {
    if (method !== 'GET') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const { published, effective } = await loadStates(env);
    return jsonResponse({ hasDraft: await hasDraft(env), changes: diffDraft(published, effective) });
  }

  const manifest = pathname.match(MANIFEST_RE);
  if (manifest) {
    const slug = manifest[1];
    if (!SLUG_RE.test(slug)) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    if (method === 'GET') {
      const entries = (await readJson(env.PRIVATE_BUCKET, DRAFT.manifest(slug)))
        ?? (await readJson(env.BUCKET, PUBLISHED.manifest(slug))) ?? [];
      return jsonResponse(entries);
    }
    if (method === 'PUT') return saveValidated(request, DRAFT.manifest(slug), validateManifestShape, env);
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const staging = pathname.match(STAGING_RE);
  if (staging) {
    const slug = staging[1];
    const name = decodeURIComponent(staging[2]);
    if (!SLUG_RE.test(slug) || !PHOTO_NAME_RE.test(name)) return jsonResponse({ error: 'Invalid name or slug' }, 400);
    return handleStaging(request, env, slug, name);
  }

  if (pathname === '/api/admin/publish') {
    if (method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const result = await publishStep(env);
      if (result.problems) return jsonResponse({ error: 'PUBLISH_CHECK_FAILED', problems: result.problems }, 409);
      return jsonResponse(result);
    } catch {
      return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
    }
  }

  return jsonResponse({ error: 'NOT_FOUND' }, 404);
}
```

`/srv/claude/workspaces/qa-browser/p2/t6.py` — full text:

```python
# Task 6: admin routes hand draft routes to draft-routes.js, after the Access check.
def edit(p, pairs):
    s = open(p).read()
    for o, n in pairs:
        assert s.count(o) == 1, (p, o[:60], s.count(o))
        s = s.replace(o, n)
    open(p, 'w').write(s)

edit('src/worker/admin-routes.js', [
 ("import { verifyAccessJwt } from './access-jwt.js';\n",
  "import { verifyAccessJwt } from './access-jwt.js';\nimport { handleDraftRequest } from './draft-routes.js';\n"),
 ("""  const { pathname } = new URL(request.url);
  const { method } = request;
""", """  const { pathname } = new URL(request.url);
  const { method } = request;

  const draft = await handleDraftRequest(request, env, pathname);
  if (draft) return draft;
"""),
])
print('t6 applied')
```

- [ ] **Step 3: Check**

Run: `npm test` → 85 files, 663 passed, 1 skipped.
Run: `ALLOW_PLACEHOLDER_CSP=1 npx vite build && npx wrangler deploy --dry-run --outdir /srv/claude/workspaces/qa-browser/p2/wdist` → the build succeeds and wrangler prints `Total Upload:` and `--dry-run: exiting now.` Then `rm -rf dist /srv/claude/workspaces/qa-browser/p2/wdist`.

- [ ] **Step 4: Commit**

```bash
git add src/worker/draft-routes.js src/worker/draft-routes.test.js src/worker/admin-routes.js
git commit -F - <<'EOF'
feat(worker): dashboard routes for the draft, waiting photos and publishing

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```
