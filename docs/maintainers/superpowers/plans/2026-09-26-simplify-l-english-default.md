# L — English by default, Italian as a preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** The template ships with English interface copy and English seeds; the current Italian copy becomes a preset, `config/texts.it.js`, switched on with one line. No user-visible text stays hard-coded outside the texts files.

**Architecture:** `config/texts.config.js` holds English texts, `config/texts.it.js` the Italian ones, both with the same keys (new keys cover the strings that were hard-coded: dashboard labels, lightbox ARIA labels, upload phases). A checked conversion script replaces the hard-coded strings with `texts` references. Seeds (`site.config.js`, `albums.config.js`) become English and `language: 'en'`. Worker API error messages become English.

**Tech Stack:** JavaScript ES modules, Vitest 4, Markdown.

**Spec:** `docs/maintainers/roadmap-semplificazione.md`, phase L.

**Base:** branch `feat/simplify-d-setup`. Implementation branch: `feat/simplify-l-english`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- `wrangler.json` is untracked: never add it. Never commit `custom/`, `dist/`, `.superpowers/`. Do not run `npm install`.
- Placeholders in texts (`{slug}`, `{nome}`, `{titolo}`, `{fase}`, `{n}`, `{elenco}`, `{uploaded}`, `{failed}`) keep their names: the code fills them by name.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: Texts files and hard-coded strings

**Files:** Create `config/texts.it.js`; replace `config/texts.config.js`; modify `src/pages/admin.js`, `src/components/Lightbox.js`, `src/admin/preview.js`, `src/admin/views/album.js`, `src/admin/views/home.js`, `src/admin/views/top-bar.js`, `src/worker/admin-routes.js`, and the tests `src/admin/status.test.js`, `src/admin/views/home.test.js`, `src/admin/views/album.test.js`, `src/pages/album.test.js`, `src/admin/preview.test.js` (they compared hard-coded Italian copy).

- [ ] **Step 1: Texts files.** Write `config/texts.it.js` with the content of `texts-it.js` and `config/texts.config.js` with the content of `texts-en.js` (Appendices A and B, ready as files in the task workspace): copy them with `cp`, byte for byte.

- [ ] **Step 2: Run the conversion script** `convert-texts.py` (Appendix C, in the task workspace) from the repo root: `python3 .superpowers/sdd/2026-09-26-simplify-l-english-default/convert-texts.py`. Expected: one `converted <file>` line per code file above, then `done`. If it stops with an `AssertionError`, report the message; do not edit by hand.

- [ ] **Step 3: Verify.** `npm test` → PASS. `ALLOW_PLACEHOLDER_CSP=1 npx vite build > /srv/claude/workspaces/qa-audit/build-l.log 2>&1; echo $?` → `0`.

- [ ] **Step 4: Commit.**

```bash
git add config/texts.it.js config/texts.config.js src/pages/admin.js src/components/Lightbox.js src/admin/preview.js src/admin/views/album.js src/admin/views/home.js src/admin/views/top-bar.js src/worker/admin-routes.js src/admin/status.test.js src/admin/views/home.test.js src/admin/views/album.test.js src/pages/album.test.js src/admin/preview.test.js
git commit -F - <<'EOF'
feat(texts): English interface copy by default, Italian as a preset

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: English seeds

**Files:** Modify `config/site.config.js`, `config/albums.config.js`, `src/pages/index.test.js`, `src/pages/album.test.js`, `src/admin/status.test.js`, `src/admin/views/album.test.js`.

- [ ] **Step 1: Seeds.** In `config/site.config.js` replace

```js
/**
 * Initial seed for site identity: used only on first `npm run migrate`.
 * After that, name, bio, hero, and social are edited from the dashboard
 * and R2 becomes the source of truth.
 */
export const siteConfig = {
  name: 'Nome Fotografo',
  bio: 'Una breve descrizione del fotografo.',
  language: 'it',
```

with

```js
/**
 * Initial seed for site identity: the site and the dashboard start from it until the
 * first save from /admin. After that, name, bio, hero and social are edited from the
 * dashboard and R2 is the source of truth. `language` sets <html lang> and the date
 * format of the dashboard ('it' together with config/texts.it.js for Italian).
 */
export const siteConfig = {
  name: 'Photographer Name',
  bio: 'A short description of the photographer.',
  language: 'en',
```

In `config/albums.config.js` replace

```js
// Initial albums seed: used by the public fallback while R2 has no albums.json
// and on first `npm run migrate`. After that, the source of truth is the
// manifest on R2, managed by the dashboard.
// Re-running `migrate` after using the dashboard will overwrite its work.
```

with

```js
// Initial albums seed: shown by the public site while R2 has no albums.json, and
// copied to R2 by the optional `npm run migrate`. After the first album saved from
// the dashboard, R2 is the source of truth.
```

and replace `    title: 'Titolo Album',` with `    title: 'Album Title',` and `    description: 'Descrizione breve dell\'album.',` with `    description: 'A short description of the album.',`.

- [ ] **Step 2: Tests that read the seed.** In `src/pages/index.test.js` replace `.toBe('Titolo Album');` with `.toBe('Album Title');`. In `src/pages/album.test.js` replace the line `    expect(document.getElementById('album-title').textContent).toBe('Titolo Album');` with `    expect(document.getElementById('album-title').textContent).toBe('Album Title');` (only this line; the mocked data on another line stays).

With `language: 'en'` the dashboard formats dates the English way. Update the two date tests with this script (it checks the counts):

```bash
python3 - <<'PY'
p = 'src/admin/status.test.js'; s = open(p).read()
old = r"toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/)"
new = r"toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}( [AP]M)?$/)"
assert s.count(old) == 3, s.count(old); open(p, 'w').write(s.replace(old, new))
p = 'src/admin/views/album.test.js'; s = open(p).read()
old = ".textContent).toBe('14/06/2025');"
assert s.count(old) == 1, s.count(old); open(p, 'w').write(s.replace(old, ".textContent).toBe('06/14/2025');"))
print('dates updated')
PY
```

- [ ] **Step 3: Verify and commit.** `npm test` → PASS.

```bash
git add config/site.config.js config/albums.config.js src/pages/index.test.js src/pages/album.test.js src/admin/status.test.js src/admin/views/album.test.js
git commit -F - <<'EOF'
feat(config): English seeds and language

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: Documentation

**Files:** Modify `README.md`, `README.it.md`, `CUSTOMIZING.md`, `docs/maintainers/pending-decisions.md`.

- [ ] **Step 1: READMEs.** In `README.md` replace

```
The interface copy ships in Italian: change it in `config/texts.config.js`.
```

with

```
The interface copy ships in English, in `config/texts.config.js`. For Italian, replace that file's content with `export { texts } from './texts.it.js';` and set `language: 'it'` in `config/site.config.js`.
```

In `README.it.md` replace

```
I testi dell'interfaccia sono in italiano: si cambiano in `config/texts.config.js`.
```

with

```
I testi dell'interfaccia sono in inglese, in `config/texts.config.js`. Per l'italiano, sostituisci il contenuto di quel file con `export { texts } from './texts.it.js';` e imposta `language: 'it'` in `config/site.config.js`.
```

- [ ] **Step 2: CUSTOMIZING.md.** Replace

```
Edit loading messages, errors, forms, nav, footer. All album page text (loading, error, not found) lives here — not in HTML.
```

with

```
Edit loading messages, errors, forms, nav, footer and the dashboard. Every visible text lives here — not in HTML or in the code. It ships in English; `config/texts.it.js` has the same keys in Italian: to use it, replace the content of `texts.config.js` with `export { texts } from './texts.it.js';` and set `language: 'it'` in `config/site.config.js`. Placeholders such as `{slug}` or `{nome}` keep their names in every language.
```

- [ ] **Step 3: Decisions list.** In `docs/maintainers/pending-decisions.md`, in the row that starts `| L |`, replace the last cell text `opzionale` with the text: approvata 2026-09-26, branch `feat/simplify-l-english`

- [ ] **Step 4: Check and commit.** `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md README.it.md CUSTOMIZING.md` → `0 broken`; `npm test` → PASS.

```bash
git add README.md README.it.md CUSTOMIZING.md docs/maintainers/pending-decisions.md
git commit -F - <<'EOF'
docs: interface copy in English, Italian preset

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

## Appendix A — `texts-it.js`

```js
// Italian preset. To use it, replace the content of config/texts.config.js with:
//   export { texts } from './texts.it.js';
// and set language: 'it' in config/site.config.js.
export const texts = {
  landing: {
    heroSubtitle: 'Portfolio fotografico.',
    albumsSectionHeading: 'Album',
  },
  album: {
    notFound: 'Album non trovato.',
    notFoundLink: 'Torna alla gallery',
    loading: 'Caricamento foto…',
    empty: 'Nessuna foto trovata in questo album.',
    error: {
      notFound: 'Album non trovato.',
      network: 'Errore di rete. Controlla la connessione.',
      unknown: 'Errore durante il caricamento. Riprova più tardi.',
      noImage: 'Le immagini non sono disponibili senza un URL pubblico R2.',
    },
  },
  lightbox: {
    label: 'Foto a schermo intero',
    close: 'Chiudi',
    previous: 'Precedente',
    next: 'Successiva',
  },
  about: {
    heading: 'Contatti',
    body: 'Scrivimi per informazioni su lavori e collaborazioni.',
    form: {
      namePlaceholder: 'Nome',
      emailPlaceholder: 'Email',
      subjectPlaceholder: 'Soggetto',
      messagePlaceholder: 'Messaggio',
      submitLabel: 'Invia',
      successMessage: 'Messaggio inviato. Ti risponderò presto.',
      errorMessage: "Errore durante l'invio. Riprova più tardi.",
    },
  },
  footer: {
    copyright: `© ${new Date().getFullYear()}`,
  },
  nav: {
    homeLabel: 'Portfolio',
    aboutLabel: 'Contatti',
  },
  admin: {
    common: {
      loading: 'Caricamento…',
      allAlbums: '← Tutti gli album',
      navAlbums: 'Album',
      navMessages: 'Messaggi',
    },
    site: {
      sectionTitle: 'Sito',
      nameLabel: 'Nome',
      bioLabel: 'Bio',
      instagramLabel: 'Instagram',
      save: 'Salva sito',
      saved: 'Sito salvato.',
      preview: 'Anteprima',
      previewClose: 'Chiudi',
      heroUpdated: 'Hero aggiornata.',
      heroReadError: 'Impossibile leggere le foto di questo album.',
      heroChooseAlbum: 'Scegli album…',
      heroNone: 'nessuna',
    },
    albums: {
      sectionTitle: 'Album',
      create: 'Nuovo album',
      newTitlePlaceholder: 'Titolo nuovo album',
      exists: 'Esiste gia un album "{slug}".',
      titleInvalid: 'Titolo non valido.',
      titleReserved: '"{slug}" è un nome riservato.',
      delete: 'Elimina',
      deleteTitle: 'Elimina album',
      deleteNameMismatch: 'Nome non corrispondente: cancellazione annullata.',
      deleteConfirmPrompt: 'Per eliminare scrivi il nome esatto dell\'album: "{titolo}"',
      loadError: 'Impossibile caricare gli album (rete o dati malformati).',
    },
    album: {
      save: 'Salva',
      saved: 'Album salvato.',
      cover: 'Cover',
      coverAsButton: 'Usa come cover',
      coverSelected: 'Cover selezionata: {nome} (premi Salva per confermare).',
      subtitleLabel: 'Sottotitolo',
      subtitlePlaceholder: 'Aggiungi un sottotitolo…',
      gridView: 'Vista griglia',
      listView: 'Vista lista',
      sortBy: 'Ordina per:',
      date: 'Data',
      sortedByDate: 'Foto ordinate per data.',
      confirmDeletePhoto: 'Eliminare {nome}?',
      deletePhoto: 'Elimina',
      manifestError: 'Impossibile caricare il manifest.',
      unsavedChanges: 'Ci sono modifiche non salvate. Uscire comunque?',
      uploadProgress: '{nome} — {fase}',
      uploadPhases: {
        processing: 'compressione',
        uploading: 'caricamento',
        done: 'fatto',
        failed: 'non riuscito',
      },
      uploadSuccess: 'Caricate {n} foto.',
      dropzoneConstraints: 'JPG, PNG, WebP fino a 20MB',
      unsupportedFormat: 'Non caricabili dal browser ({elenco}): HEIC e TIFF vanno convertiti prima, con `npm run compress`.',
      uploadPartial: 'Caricate {uploaded}, fallite {failed}: riprova trascinandole di nuovo.',
    },
    status: {
      lastAction: 'Ultima azione eseguita',
      error: 'Errore',
    },
    messages: {
      sectionTitle: 'Messaggi',
      empty: 'Nessun messaggio ricevuto.',
      loadError: 'Impossibile caricare i messaggi.',
      confirmDelete: 'Eliminare il messaggio di {nome}?',
      deleted: 'Messaggio eliminato.',
      reply: 'Rispondi',
      delete: 'Elimina',
    },
  },
};
```

## Appendix B — `texts-en.js`

```js
// Interface copy, in English. An Italian version with the same keys is in
// config/texts.it.js: to use it, replace this file's content with
//   export { texts } from './texts.it.js';
// and set language: 'it' in config/site.config.js.
// Placeholders such as {slug} or {nome} are filled by name: keep them as they are.
export const texts = {
  landing: {
    heroSubtitle: 'Photography portfolio.',
    albumsSectionHeading: 'Albums',
  },
  album: {
    notFound: 'Album not found.',
    notFoundLink: 'Back to the gallery',
    loading: 'Loading photos…',
    empty: 'No photos in this album yet.',
    error: {
      notFound: 'Album not found.',
      network: 'Network error. Check your connection.',
      unknown: 'Something went wrong while loading. Please try again later.',
      noImage: 'Images are unavailable without a public R2 URL.',
    },
  },
  lightbox: {
    label: 'Full-screen photo',
    close: 'Close',
    previous: 'Previous',
    next: 'Next',
  },
  about: {
    heading: 'Contact',
    body: 'Write to me about commissions and collaborations.',
    form: {
      namePlaceholder: 'Name',
      emailPlaceholder: 'Email',
      subjectPlaceholder: 'Subject',
      messagePlaceholder: 'Message',
      submitLabel: 'Send',
      successMessage: 'Message sent. I will get back to you soon.',
      errorMessage: 'Something went wrong while sending. Please try again later.',
    },
  },
  footer: {
    copyright: `© ${new Date().getFullYear()}`,
  },
  nav: {
    homeLabel: 'Portfolio',
    aboutLabel: 'About',
  },
  admin: {
    common: {
      loading: 'Loading…',
      allAlbums: '← All albums',
      navAlbums: 'Albums',
      navMessages: 'Messages',
    },
    site: {
      sectionTitle: 'Site',
      nameLabel: 'Name',
      bioLabel: 'Bio',
      instagramLabel: 'Instagram',
      save: 'Save site',
      saved: 'Site saved.',
      preview: 'Preview',
      previewClose: 'Close',
      heroUpdated: 'Hero updated.',
      heroReadError: 'Could not read the photos of this album.',
      heroChooseAlbum: 'Choose an album…',
      heroNone: 'none',
    },
    albums: {
      sectionTitle: 'Albums',
      create: 'New album',
      newTitlePlaceholder: 'New album title',
      exists: 'An album "{slug}" already exists.',
      titleInvalid: 'Invalid title.',
      titleReserved: '"{slug}" is a reserved name.',
      delete: 'Delete',
      deleteTitle: 'Delete album',
      deleteNameMismatch: 'The name does not match: deletion cancelled.',
      deleteConfirmPrompt: 'To delete, type the exact album name: "{titolo}"',
      loadError: 'Could not load the albums (network or malformed data).',
    },
    album: {
      save: 'Save',
      saved: 'Album saved.',
      cover: 'Cover',
      coverAsButton: 'Use as cover',
      coverSelected: 'Cover selected: {nome} (press Save to confirm).',
      subtitleLabel: 'Subtitle',
      subtitlePlaceholder: 'Add a subtitle…',
      gridView: 'Grid view',
      listView: 'List view',
      sortBy: 'Sort by:',
      date: 'Date',
      sortedByDate: 'Photos sorted by date.',
      confirmDeletePhoto: 'Delete {nome}?',
      deletePhoto: 'Delete',
      manifestError: 'Could not load the photo list.',
      unsavedChanges: 'There are unsaved changes. Leave anyway?',
      uploadProgress: '{nome} — {fase}',
      uploadPhases: {
        processing: 'compressing',
        uploading: 'uploading',
        done: 'done',
        failed: 'failed',
      },
      uploadSuccess: 'Uploaded {n} photos.',
      dropzoneConstraints: 'JPG, PNG, WebP up to 20MB',
      unsupportedFormat: 'The browser cannot upload these ({elenco}): convert HEIC and TIFF first, with `npm run compress`.',
      uploadPartial: 'Uploaded {uploaded}, failed {failed}: try again by dropping them once more.',
    },
    status: {
      lastAction: 'Last action',
      error: 'Error',
    },
    messages: {
      sectionTitle: 'Messages',
      empty: 'No messages yet.',
      loadError: 'Could not load the messages.',
      confirmDelete: 'Delete the message from {nome}?',
      deleted: 'Message deleted.',
      reply: 'Reply',
      delete: 'Delete',
    },
  },
};
```

## Appendix C — `convert-texts.py`

```python
# Replaces the hard-coded interface strings with texts references. Every replacement is
# checked: the script stops with an AssertionError if the expected text is not there.
EDITS = {
    'src/pages/admin.js': [
        ("root.innerHTML = '<p class=\"admin-status\">Caricamento…</p>';",
         "root.innerHTML = html`<p class=\"admin-status\">${texts.admin.common.loading}</p>`;"),
    ],
    'src/components/Lightbox.js': [
        ("el.setAttribute('aria-label', 'Foto a schermo intero');",
         "el.setAttribute('aria-label', texts.lightbox.label);"),
        ('<button class="lightbox__close" aria-label="Chiudi">×</button>',
         '<button class="lightbox__close" aria-label="${texts.lightbox.close}">×</button>'),
        ('<button class="lightbox__prev" aria-label="Precedente">‹</button>',
         '<button class="lightbox__prev" aria-label="${texts.lightbox.previous}">‹</button>'),
        ('<button class="lightbox__next" aria-label="Successiva">›</button>',
         '<button class="lightbox__next" aria-label="${texts.lightbox.next}">›</button>'),
    ],
    'src/admin/preview.js': [
        ('<p><button type="button" class="admin-back admin-preview__back">← Tutti gli album</button></p>',
         '<p><button type="button" class="admin-back admin-preview__back">${textsArg.admin.common.allAlbums}</button></p>'),
    ],
    'src/admin/views/album.js': [
        ('aria-label="Sottotitolo" placeholder="Aggiungi un sottotitolo…"',
         'aria-label="${texts.admin.album.subtitleLabel}" placeholder="${texts.admin.album.subtitlePlaceholder}"'),
        ('title="Vista griglia">', 'title="${texts.admin.album.gridView}">'),
        ('title="Vista lista">', 'title="${texts.admin.album.listView}">'),
        ('<span class="admin-sort-date__label">Ordina per:</span>',
         '<span class="admin-sort-date__label">${texts.admin.album.sortBy}</span>'),
        ('formatText(texts.admin.album.uploadProgress, { nome: name, fase: phase })',
         'formatText(texts.admin.album.uploadProgress, { nome: name, fase: texts.admin.album.uploadPhases[phase] ?? phase })'),
    ],
    'src/admin/views/home.js': [
        ('<input name="new-album-title" type="text" placeholder="Titolo nuovo album">',
         '<input name="new-album-title" type="text" placeholder="${texts.admin.albums.newTitlePlaceholder}">'),
        ('<button class="admin-delete-album" title="Elimina album">Elimina</button>',
         '<button class="admin-delete-album" title="${texts.admin.albums.deleteTitle}">${texts.admin.albums.delete}</button>'),
    ],
    'src/admin/views/top-bar.js': [
        ('<a href="#/" class="admin-topbar__nav-link">Album</a>',
         '<a href="#/" class="admin-topbar__nav-link">${texts.admin.common.navAlbums}</a>'),
        ('<a href="#/messages" class="admin-topbar__nav-link">Messaggi</a>',
         '<a href="#/messages" class="admin-topbar__nav-link">${texts.admin.common.navMessages}</a>'),
        ('html`<a class="admin-back" href="#/">← Tutti gli album</a>`',
         'html`<a class="admin-back" href="#/">${texts.admin.common.allAlbums}</a>`'),
    ],
    # Tests that compared hard-coded Italian copy now read it from texts, so they hold in any language.
    'src/admin/status.test.js': [
        (".textContent).toBe('Errore');", ".textContent).toBe(texts.admin.status.error);"),
    ],
    'src/admin/views/home.test.js': [
        (".textContent).toBe('Errore');", ".textContent).toBe(texts.admin.status.error);"),
    ],
    'src/admin/views/album.test.js': [
        (".textContent).toBe('Ordina per:');", ".textContent).toBe(texts.admin.album.sortBy);"),
        (".textContent).toBe('JPG, PNG, WebP fino a 20MB');", ".textContent).toBe(texts.admin.album.dropzoneConstraints);"),
        (".getAttribute('aria-label')).toBe('Sottotitolo');", ".getAttribute('aria-label')).toBe(texts.admin.album.subtitleLabel);"),
        ("expect(container.textContent).not.toContain('Sottotitolo ');", "expect(container.textContent).not.toContain(`${texts.admin.album.subtitleLabel} `);"),
    ],
    'src/pages/album.test.js': [
        (".toBe('Le immagini non sono disponibili senza un URL pubblico R2.');", ".toBe('Images are unavailable without a public R2 URL.');"),
    ],
    'src/admin/preview.test.js': [
        ("  admin: { site: { preview: 'Anteprima', previewClose: 'Chiudi' } },", "  admin: { site: { preview: 'Anteprima', previewClose: 'Chiudi' }, common: { allAlbums: '← Tutti gli album' } },"),
    ],
    'src/worker/admin-routes.js': [
        ("jsonResponse({ error: 'JSON malformato' }, 400)", "jsonResponse({ error: 'Malformed JSON' }, 400)"),
        ("jsonResponse({ error: 'Nome o slug invalido' }, 400)", "jsonResponse({ error: 'Invalid name or slug' }, 400)"),
        ("jsonResponse({ error: 'Atteso image/webp' }, 415)", "jsonResponse({ error: 'Expected image/webp' }, 415)"),
        ("jsonResponse({ error: 'File oltre 10MB' }, 413)", "jsonResponse({ error: 'File over 10MB' }, 413)"),
        ("jsonResponse({ error: 'Body vuoto' }, 400)", "jsonResponse({ error: 'Empty body' }, 400)"),
    ],
}

# Files that need the texts import added (path relative to the file).
IMPORT_TEXTS = {
    'src/components/Lightbox.js': '../../config/texts.config.js',
    'src/admin/views/top-bar.js': '../../../config/texts.config.js',
}

import re
for path, edits in EDITS.items():
    src = open(path).read()
    for old, new in edits:
        assert src.count(old) == 1, (path, old[:70], src.count(old))
        src = src.replace(old, new)
    if path in IMPORT_TEXTS:
        line = f"import {{ texts }} from '{IMPORT_TEXTS[path]}';\n"
        assert 'import { texts }' not in src, (path, 'already imports texts')
        imports = list(re.finditer(r'^import .*;\n', src, re.M))
        at = imports[-1].end() if imports else 0
        src = src[:at] + line + src[at:]
    open(path, 'w').write(src)
    print('converted', path)
print('done')
```
