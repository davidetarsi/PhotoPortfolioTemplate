# Customization Guide

This template handles three distinct customization areas: **content**, **appearance**, and **infrastructure**. Here's where to change each thing.

---

## The distinction that explains everything

### Content — Lives on R2, changed from the dashboard

Photographer name, bio, hero image, albums, photos: all of this at **runtime** lives on R2 and is modified from the **admin dashboard** `/admin`. The files in `config/site.config.js` and `config/albums.config.js` are just the **initial seed**, used once by `npm run migrate` to populate R2 on first run.

**Important:** running `npm run migrate` again after using the dashboard will reset the name, bio, hero, and albums to seed values, **erasing all dashboard changes**. The command now refuses to do this without `--force`, and it's crucial to understand why.

### Appearance and UI text — Live in files

Colors, fonts, spacing, UI text (forms, error messages): these change in `theme/` files and `config/texts.config.js`. They apply to both the site and dashboard, which imports the same tokens. Every file change requires a rebuild and deploy.

### Infrastructure — Cloudflare configuration

Buckets, domains, Access applications: this configuration lives in `infra/variables.tf` (if using Terraform) and `wrangler.json`. It has nothing to do with content or appearance — once configured, you rarely touch it.

---

## I want to change X, I touch Y

| I want to change | Where | Notes |
|---|---|---|
| **Name, bio, social links** | Dashboard `/admin` "Site" section — or `config/site.config.js` before `npm run migrate` | Dashboard is the normal place after initial setup. `config/` is just the seed. |
| **Home hero photo** | Dashboard "Site" section, hero selector | Always without rerunning migrate |
| **Add an album** | Dashboard `/admin`, or `config/albums.config.js` + `npm run migrate` | Like name: dashboard after first setup, `config/` only for the seed. |
| **Reorder albums** | Dashboard (drag and drop), or `config/albums.config.js` + `npm run migrate` | |
| **Add/delete photos in an album** | Dashboard `/admin`, album view | Always via dashboard |
| **Site colors** | `theme/tokens.css`, `--color-*` variables | Requires `npm test && npm run build` and deploy |
| **Fonts** | `theme/tokens.css` (`--font-body`, `--font-heading`) + `theme/typography.css` + Google Fonts `<link>` in HTML | Three files, three steps — skipping one causes silent fallback. See Font section below. |
| **Spacing, border radius** | `theme/tokens.css`, `--space-*` and `--radius-*` variables | Requires rebuild and deploy |
| **UI text** (forms, error messages, nav) | `config/texts.config.js` | Requires rebuild and deploy. Text with variable values use placeholders `{name}`: translate without writing JavaScript |
| **Admin dashboard text** | `config/texts.config.js`, `admin` section | Same mechanism: dashboard is translatable just like the site |
| **Date language** | `config/site.config.js`, `language` field | Used to format dates in the dashboard |
| **Album card appearance** | `theme/card.css`: activate one of three `@import` | `cinematic` (default), `editorial`, `minimal`. See section below |
| **Home page landing** (hero and album cards) | `custom/`: copy `custom.example/` and replace the `landing` slot | Your own component, no template file edited. See [Replacing a whole part](#replacing-a-whole-part-custom) and `docs/slots.md` |
| **Admin dashboard background** | `config/admin.config.js`, `backgroundImageUrl` field | URL of a photo already uploaded to R2 |
| **Who can access `/admin`** | `infra/variables.tf`, `admin_emails` field (Terraform) or dashboard Access for `/admin` and `/api/admin` paths (manual) | Requires Terraform apply or manual Access modification. See [runbook](docs/runbook-cloudflare.md). |
| **Photo domain** | `infra/variables.tf`, `custom_photo_domain` (Terraform), or dashboard R2 (manual) | See [runbook section 8](docs/runbook-cloudflare.md#8-custom-domain-for-photos). Do once before production. |
| **Where contact messages go** | Nothing to configure — the Worker stores them on R2 and you read them in `/admin` | No third-party service, no extra account |
| **Notification when a message arrives** | `npx wrangler secret put CONTACT_NOTIFY_URL` | Any service that accepts a POST. Three recipes in [runbook section 9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection) |
| **Spam protection** | `TURNSTILE_SITEKEY` in `wrangler.json` + `npx wrangler secret put TURNSTILE_SECRET` | An empty sitekey turns it off. See [runbook section 9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection) |
| **Security headers / CSP** | — Do not touch — | Generated from `wrangler.json` during build. See CSP plugin in `vite.config.js`. |

---

## The three card variants

Album cards have three ready-made styles, derived from mockups in `mockups/`:

- **`cinematic`** (default, from `mockup-1-cinematic.html`) — 4:5 card, full-frame image, title and description over a gradient at bottom, subtle zoom on hover, rounded corners.
- **`editorial`** (from `mockup-3-editoriale.html`) — magazine-style layout: image and text side by side, uppercase title, divider line between albums, no rounding. Below 600px switches to single column.
- **`minimal`** (from `mockup-4-minimal.html`) — no frame, no background: image keeps its natural aspect ratio and text sits below, centered, with plenty of space.

Choose in `theme/card.css` by keeping one `@import` line active and commenting the others. Dev server reloads automatically.

The three differ **only in CSS**, on the same HTML: `AlbumCard.js` has no conditionals. They are three independent files in `src/styles/card-variants/` — if one doesn't suit you, modify or delete it without touching anything else.

## Font: three steps to get it right

Changing fonts requires **three coordinated changes** — skipping one causes silent font fallback:

1. **`theme/tokens.css`:** update `--font-body` and/or `--font-heading` with the new font name

```css
/* Before */
--font-body: 'Sora', sans-serif;
--font-heading: 'Fraunces', serif;

/* After: for example, Poppins for body, Playfair Display for heading */
--font-body: 'Poppins', sans-serif;
--font-heading: 'Playfair Display', serif;
```

2. **In all four HTML files** (`index.html`, `album.html`, `about.html`, `admin.html`): replace the Google Fonts `<link>` tag.
   Forgetting `admin.html` is the easiest mistake: the site changes fonts and the dashboard lags behind.

```html
<!-- Before -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@300&family=Fraunces:wght@400&family=IBM+Plex+Mono:wght@400&display=swap">

<!-- After: include only the fonts you use, with the weights you use -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400&family=Playfair+Display:wght@600&family=IBM+Plex+Mono:wght@400&display=swap">
```

3. **`theme/typography.css`:** if the new font has different weights, update the `font-weight` values in CSS rules

```css
/* If the new font has non-standard weights */
body {
  font-family: var(--font-body);
  font-weight: 400;  /* Change here if needed */
}

h1, h2, h3 {
  font-family: var(--font-heading);
  font-weight: 600;  /* Change here if font doesn't default to 400 */
}
```

---

## What not to touch when customizing

### Behavior (`src/`)

Files in `src/` are the application's behavior: modifying them creates conflicts on future template merges. Keep customizations in `config/`, `theme/` and `custom/`, the designated extension points: to replace a whole part of the site, use `custom/` (see below) instead of editing `src/`.

Exception: if you fix a bug or add a feature to the template itself, do it in `src/`, but contribute it back to the repository you forked from — so the next fork of your copy has it already.


### Contact messages contain other people's data

Names, email addresses and whatever someone chose to write, sitting in your bucket. Two consequences worth knowing rather than discovering:

- The dashboard lets you **delete** a message. That is not a convenience — it is the reason you are allowed to keep the others.
- The notification you receive contains **only the sender's name and a link**, never the message. That is deliberate: a notification channel may be readable by others, and what leaves your bucket does not come back.

### `wrangler.json`

The template ships it with placeholders; you fill in your values **and commit it**. Not an oversight: Cloudflare's deploy reads Worker configuration from the repository, so a `wrangler.json` that stays on your computer means a failed deploy.

The values it contains aren't secrets — bucket names, team domain, AUD, and public bucket URL are all already visible externally. Real credentials live in `.env`, which isn't versioned.

Two practical consequences: it will conflict on every `git merge upstream/main` (resolve with `git checkout --ours wrangler.json`), and `npm run infra:sync` rewrites it from Terraform outputs, so any manual changes need to be redone or moved to `.tf`.

---

## Replacing a whole part: `custom/`

When `config/` and `theme/` are not enough — a different landing, for example — create `custom/` from the example and declare there the parts you replace:

```bash
cp -r custom.example custom
```

The template never contains `custom/`, so `git merge upstream/main` never conflicts there. Commit it in your fork. The parts you can replace, their contracts, the public API your code may import and the errors you can meet are in [`docs/slots.md`](docs/slots.md).

To add pages of your own — a single page or a collection with one page per entry — see [`docs/pages.md`](docs/pages.md).

---

## After every file change

Whenever you modify `config/` or `theme/`:

```bash
npm test && npm run build
git add config/ theme/
git commit -m "customization: describe what you changed"
git push
```

Deploy starts automatically via Cloudflare Git integration. Changes are live in minutes, no manual work.

Changes made from the dashboard (`/admin`) are already live and need no deploy — they're just data on R2.

---

## Static assets

### Favicon

Edit the file in `public/favicon.svg` and redeploy.

### Photo compression

There are two ways to get photos onto the site. The dashboard is the normal one; the script exists for the cases the browser cannot handle.

### From the dashboard — the normal way

Drag JPEG, PNG or WebP files into an album. They are resized to 1900px and converted to WebP **in your browser** before being sent, so nothing large travels over the network and you need no tools installed.

### From the terminal — for HEIC, TIFF, or a lot of photos at once

The browser cannot decode **HEIC**, which is what an iPhone produces by default, nor TIFF. Those have to be converted first. The same path is also the practical one when you are uploading hundreds of photos in one go.

```bash
npm run compress -- --input "/path/to/folder"
```

Expected structure:

```
/path/to/folder/
  source/           ← your photos (JPEG, PNG, HEIC, TIFF, WebP)
  optimized/        ← generated by the script → upload these via the dashboard
```

The folder must be named `source/` exactly — the script looks for that name.

It generates WebP at 1900px on the long side, quality 85 — the same settings the browser uses, so the two paths produce equivalent files. `optimized/` is cleared and regenerated on every run.

`--manifest-only` re-reads dimensions from `.webp` files already in `optimized/` without recompressing them, which is how you regenerate a manifest for an album you have already uploaded.

> If you drop a HEIC file into the dashboard it will tell you so and point you here, rather than failing at upload.

---

## Social previews (Open Graph)

Title, description, and preview image (WhatsApp, Instagram DM, LinkedIn, iMessage…) come from two places:

- **Album pages** (`/<album>`): the Worker writes the album's own title, description, cover and canonical URL into the page, read live from R2. A change made in the dashboard is used by the next share — social networks may still show their cached copy for a while. An album without a cover uses the site's hero photo, and an album without a description uses the site bio, both taken from the site profile in R2 (the one the dashboard edits). An address that is not an album answers 404.
- **Home and about**: injected **at build time** from `site.config.js`, with the image URL built from the photo domain declared in `wrangler.json`. These pages are static files served before the Worker runs, so they keep the build-time values.

Limits to know:

- Until R2 holds the album list — before `npm run migrate`, or before the first album is saved from the dashboard — album pages keep the build-time preview, and an address that is not an album answers 200 instead of 404.
- If the site profile in R2 is missing or invalid, album pages use the album title alone, with no fallback to the bio or the hero photo.
- If `heroImage` in `site.config.js` is empty, home and about have no preview image. An album with no cover has no preview image if the site profile has no hero photo.

---

## Quick reference `config/`

### `site.config.js` (home seed)

| Field | Description | Example |
|---|---|---|
| `name` | Photographer name | `'Mario Rossi Photography'` |
| `bio` | Hero text and meta description | `'Wedding photographer in Milan.'` |
| `heroImage` | Hero photo — referential (album + filename, not URL) | `{ album: 'weddings', name: 'hero.webp' }` |
| `social` | Social links | `{ instagram: 'https://instagram.com/...' }` |

### `albums.config.js` (albums seed)

| Field | Description | Example |
|---|---|---|
| `slug` | URL identifier | `'weddings-2024'` |
| `title` | Card and page title | `'Weddings 2024'` |
| `description` | Text below title | `'Emotional reportage.'` |
| `coverName` | Cover filename — the file name inside the album, not a URL | `'cover.webp'` |

### `texts.config.js` (UI text)

Edit loading messages, errors, forms, nav, footer. All album page text (loading, error, not found) lives here — not in HTML.

### `admin.config.js` (dashboard style)

| Field | Description |
|---|---|
| `backgroundImageUrl` | URL of a photo already on R2, used as dashboard background. Empty = no background |

---

## Infrastructure — One-time setup

If you use **Terraform**: modify `infra/variables.tf` and run `terraform apply`. See [runbook section 3](docs/runbook-cloudflare.md#3-terraform-path).

If you use the **manual path**: follow [runbook section 5](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) to create R2 buckets, managed domains, and Access applications from the Cloudflare dashboard.

Either way, CSP is generated automatically from `wrangler.json` during build.
