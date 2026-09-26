# M4 — Pages Design Spec

**Date:** 2026-07-07  
**Milestone:** M4 (follows M3 Gallery Components)

---

## Goal

Complete the three pages scaffolded in M3: landing (hero + album cards), album (slug routing + inline 404), contatti (Web3Forms contact form + honeypot).

---

## Scope

Three independent tasks:

- **M4.1 Hero** — `Hero` component, `siteConfig.heroImageUrl`, wiring on landing
- **M4.2 Album routing** — `findAlbumBySlug` utility, slug via `URLSearchParams`, inline 404
- **M4.3 ContactForm** — `ContactForm` component, Web3Forms + honeypot, fetch-based submit

No new npm dependencies.

---

## Global Constraints (inherited from M3)

- No runtime npm dependencies.
- All `src/styles/*.css` use only `var(--token-name)`; zero hardcoded hex colors. Exception allowed: `rgba()` in gradients and overlays.
- `innerHTML` only for static structural skeleton; all runtime text (from config or user input) via `textContent` or `setAttribute`. This applies to `src` attributes too.
- CSS `text-transform` for visual uppercase; never `.toUpperCase()` in JS.
- Component functions live in `src/components/`; each imports its own CSS from `src/styles/`.
- Tests live in `src/components/__tests__/` or `src/utils/` alongside the source; test runner is `vitest run --passWithNoTests`.
- CSS imports inside component JS files are valid Vite; Vitest stubs them automatically.
- `prefers-reduced-motion`: any animation or transition must be disabled/zeroed inside `@media (prefers-reduced-motion: reduce)`.

---

## M4.1 — Hero Component

### Config change

Add `heroImageUrl` to `config/site.config.js` as an optional string field (default: empty string `''`). Also rename `formEndpoint` → `web3formsAccessKey` and read it from the environment (same pattern as `driveApiKey`):

```js
export const siteConfig = {
  name: 'Nome Fotografo',
  bio: 'Una breve descrizione del fotografo.',
  language: 'it',
  heroImageUrl: '',          // ← new: URL of hero background image (leave empty for text-only hero)
  social: { },
  provider: 'googleDrive',
  driveApiKey: import.meta.env.VITE_DRIVE_API_KEY,
  web3formsAccessKey: import.meta.env.VITE_WEB3FORMS_ACCESS_KEY ?? '',  // ← renamed + env-backed
};
```

Also add `VITE_WEB3FORMS_ACCESS_KEY=` to `.env.example` (the template committed to git), mirroring the Drive key pattern from M1.

### HTML change (index.html)

Add `<section id="hero"></section>` between `<header id="site-nav">` and `<main class="page-main">`:

```html
<header id="site-nav"></header>
<section id="hero"></section>      <!-- NEW -->
<main class="page-main">
  ...
</main>
```

The fixed nav (z-index: 100) floats over the hero. The hero itself has no `padding-top`. The `<main class="page-main">` keeps its existing `padding-top: var(--nav-height)` for the albums section below.

### Component: `renderHero(container, siteConfig, texts)`

**File:** `src/components/Hero.js`

Signature:
```js
export function renderHero(container, siteConfig, texts)
```

Behavior:
- Sets `container.innerHTML` to the structural skeleton (static HTML only).
- Sets `h1` text via `textContent = siteConfig.name`.
- Sets subtitle `p` text via `textContent = texts.landing.heroSubtitle`.
- If `siteConfig.heroImageUrl` is a non-empty string: queries the `<img>` in the skeleton and sets `src` via `setAttribute('src', siteConfig.heroImageUrl)`.
- If `siteConfig.heroImageUrl` is empty/falsy: the `<img>` element is absent from the skeleton (the hero is text-only on `var(--color-bg)`).

Skeleton (two variants):

**With image** (`heroImageUrl` truthy):
```html
<div class="hero__inner">
  <img class="hero__bg" alt="" fetchpriority="high" decoding="sync">
  <div class="hero__content">
    <h1 class="hero__title"></h1>
    <p class="hero__subtitle"></p>
  </div>
</div>
```

**Without image** (`heroImageUrl` falsy):
```html
<div class="hero__inner">
  <div class="hero__content">
    <h1 class="hero__title"></h1>
    <p class="hero__subtitle"></p>
  </div>
</div>
```

### CSS: `src/styles/hero.css`

```css
.hero__inner {
  position: relative;
  height: 92vh;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  background: var(--color-bg);
}

.hero__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.72);
}

.hero__content {
  position: relative;
  width: 100%;
  padding: 28px 22px 46px;
  background: linear-gradient(transparent, rgba(16, 17, 18, 0.88));
}

.hero__title {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: clamp(2.4rem, 9vw, 4.6rem);
  line-height: 1.02;
  text-transform: uppercase;
}

.hero__subtitle {
  margin-top: 12px;
  max-width: 420px;
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}
```

No animation/transition → no `prefers-reduced-motion` block needed.

### index.js change

Add import of `Hero.js` and call `renderHero` after `renderNav`:

```js
import { renderHero } from '../components/Hero.js';
// ...
renderHero(document.getElementById('hero'), siteConfig, texts);
```

### Tests: `src/components/__tests__/Hero.test.js`

3 tests:
1. **With image:** `renderHero` with `heroImageUrl = 'https://example.com/photo.jpg'` → `.hero__bg` img exists with `src === 'https://example.com/photo.jpg'`.
2. **Without image:** `renderHero` with `heroImageUrl = ''` → no `.hero__bg` element in the container.
3. **Text content:** h1 = `siteConfig.name`, p = `texts.landing.heroSubtitle`.

---

## M4.2 — Album Slug Routing + Inline 404

### Utility: `findAlbumBySlug(albums, slug)`

**File:** `src/utils/findAlbumBySlug.js`

```js
export function findAlbumBySlug(albums, slug) {
  if (!slug) return null;
  return albums.find(a => a.slug === slug) ?? null;
}
```

Returns the matching album object or `null`.

### Texts change

Add to `config/texts.config.js` under the `album` key:

```js
album: {
  notFound: 'Album non trovato.',
  notFoundLink: 'Torna alla gallery',
  loading: '...',   // unchanged
  empty: '...',     // unchanged
  error: { ... },   // unchanged
}
```

Note: `texts.album.error.notFound` (Drive API 404) is distinct from `texts.album.notFound` (slug not in config).

### album.js change

Replace `const album = albums[0];` with slug routing:

```js
const params = new URLSearchParams(window.location.search);
const slug = params.get('album');
const album = findAlbumBySlug(albums, slug);

if (!album) {
  // Inline 404: replace main content
  const gridEl = document.getElementById('photo-grid');
  const p = document.createElement('p');
  p.className = 'photo-grid__error';
  p.textContent = texts.album.notFound;
  const link = document.createElement('a');
  link.href = '/';
  link.textContent = texts.album.notFoundLink;
  gridEl.replaceChildren(p, link);
  // Stop here — do not call listPhotos
} else {
  // Normal flow (unchanged from M3)
  document.getElementById('album-title').textContent = album.title;
  renderSkeletons(gridEl, 12);
  listPhotos(album.driveFolderId, siteConfig.driveApiKey)
    .then(/* ... */)
    .catch(/* ... */);
}
```

The `renderNav`, `renderFooter` calls happen before the slug check (unconditional).

### Tests: `src/utils/findAlbumBySlug.test.js`

4 tests:
1. Returns the matching album when slug exists.
2. Returns `null` when slug does not exist.
3. Returns `null` when `slug` is `null`.
4. Returns `null` when `albums` is an empty array.

---

## M4.3 — Contact Form (Web3Forms)

### Component: `createContactForm(siteConfig, texts)`

**File:** `src/components/ContactForm.js`

Signature:
```js
export function createContactForm(siteConfig, texts)  // returns HTMLFormElement
```

The form POSTs to `https://api.web3forms.com/submit` via `fetch` (no page reload).

**Fields (all via `createElement` + `setAttribute`/`textContent` — no runtime text in innerHTML):**

| Field | Type | name attr | Notes |
|-------|------|-----------|-------|
| Name | `<input type="text">` | `name` | `required` |
| Email | `<input type="email">` | `email` | `required` |
| Message | `<textarea>` | `message` | `required` |
| Access key | `<input type="hidden">` | `access_key` | value = `siteConfig.web3formsAccessKey` |
| Honeypot | `<input type="checkbox">` | `botcheck` | hidden via CSS class `.contact-form__honeypot` |

**Static skeleton (via innerHTML):**
```html
<div class="contact-form__fields">
  <input class="contact-form__input" type="text" name="name" required>
  <input class="contact-form__input" type="email" name="email" required>
  <textarea class="contact-form__textarea" name="message" required></textarea>
  <input type="hidden" name="access_key">
  <input class="contact-form__honeypot" type="checkbox" name="botcheck">
  <button class="contact-form__submit" type="submit"></button>
</div>
<p class="contact-form__feedback" aria-live="polite"></p>
```

After innerHTML: set placeholders via `setAttribute('placeholder', ...)` and submit button text via `textContent`. Set `access_key` value via `setAttribute('value', siteConfig.web3formsAccessKey)`.

**Submit handler:**

```js
form.addEventListener('submit', async e => {
  e.preventDefault();
  submitBtn.disabled = true;
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: new FormData(form),
    });
    const data = await res.json();
    if (data.success) {
      feedbackEl.textContent = texts.contatti.form.successMessage;
      form.reset();
    } else {
      feedbackEl.textContent = texts.contatti.form.errorMessage;
    }
  } catch (err) {
    console.error('[ContactForm] submit error:', err);
    feedbackEl.textContent = texts.contatti.form.errorMessage;
  } finally {
    submitBtn.disabled = false;
  }
});
```

**If `siteConfig.web3formsAccessKey` is empty (env var not set):** the form renders correctly (usable as boilerplate); on submit, Web3Forms will return an error which shows `errorMessage`.

### CSS: `src/styles/contact-form.css`

```css
.contact-form__honeypot {
  display: none;
}

.contact-form__fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
}

.contact-form__input,
.contact-form__textarea {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-muted);
  border-radius: 4px;
  padding: 10px 14px;
  font-family: var(--font-body);
  font-size: 0.95rem;
}

.contact-form__textarea {
  min-height: 140px;
  resize: vertical;
}

.contact-form__submit {
  align-self: flex-start;
  background: var(--color-accent);
  color: var(--color-bg);
  border: none;
  border-radius: 4px;
  padding: 10px 28px;
  font-family: var(--font-body);
  font-size: 0.95rem;
  cursor: pointer;
}

.contact-form__submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.contact-form__feedback {
  margin-top: 12px;
  font-size: 0.9rem;
  color: var(--color-muted);
  min-height: 1.4em;
}
```

No animation/transition → no `prefers-reduced-motion` block needed.

### Texts change

Add `form` nested object to `texts.contatti`:

```js
contatti: {
  heading: 'Contatti',         // unchanged
  body: 'Scrivimi per informazioni su lavori e collaborazioni.',  // unchanged
  form: {
    namePlaceholder: 'Nome',
    emailPlaceholder: 'Email',
    messagePlaceholder: 'Messaggio',
    submitLabel: 'Invia',
    successMessage: 'Messaggio inviato. Ti risponderò presto.',
    errorMessage: "Errore durante l'invio. Riprova più tardi.",
  },
},
```

### contatti.js change

Import `ContactForm` and render it after the existing heading/body:

```js
import { createContactForm } from '../components/ContactForm.js';
// ...
document.getElementById('contatti-form').appendChild(createContactForm(siteConfig, texts));
```

`contatti.html` needs a `<div id="contatti-form"></div>` added after `<p id="contatti-body">`.

### Tests: `src/components/__tests__/ContactForm.test.js`

7 tests (use `vi.stubGlobal('fetch', ...)` to mock):
1. Form element has `action`-less structure; all named fields present (`name`, `email`, `message`, `access_key`, `botcheck`).
2. Honeypot field is type `checkbox` with `name="botcheck"`.
3. `access_key` hidden input has `value === siteConfig.web3formsAccessKey`.
4. Submit calls `fetch('https://api.web3forms.com/submit', ...)` with a `FormData` body.
5. On `data.success === true` response: feedback element shows `texts.contatti.form.successMessage`.
6. On `data.success === true` response: `form.reset()` is called (fields are cleared).
7. On `data.success === false` response: feedback element shows `texts.contatti.form.errorMessage`.

---

## Files Created / Modified Summary

| File | Action |
|------|--------|
| `config/site.config.js` | Add `heroImageUrl: ''`; rename `formEndpoint` → `web3formsAccessKey` (env-backed) |
| `.env.example` | Add `VITE_WEB3FORMS_ACCESS_KEY=` |
| `config/texts.config.js` | Add `texts.album.notFound`, `texts.album.notFoundLink`; add `texts.contatti.form.*` |
| `src/components/Hero.js` | Create |
| `src/styles/hero.css` | Create |
| `src/components/__tests__/Hero.test.js` | Create (3 tests) |
| `src/components/ContactForm.js` | Create |
| `src/styles/contact-form.css` | Create |
| `src/components/__tests__/ContactForm.test.js` | Create (6 tests) |
| `src/utils/findAlbumBySlug.js` | Create |
| `src/utils/findAlbumBySlug.test.js` | Create (4 tests) |
| `src/pages/index.js` | Add `renderHero` call |
| `src/pages/album.js` | Add slug routing + inline 404 |
| `src/pages/contatti.js` | Add `createContactForm` call |
| `index.html` | Add `<section id="hero">` |
| `contatti.html` | Add `<div id="contatti-form">` |

New test count: 14 (3 Hero + 4 findAlbumBySlug + 7 ContactForm). Total after M4: 74.
