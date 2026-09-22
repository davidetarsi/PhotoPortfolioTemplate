<div align="center">

# 📷 Photo Portfolio

**A photography portfolio that updates itself: you upload photos from a dashboard, and they're live.**

No database. No server to maintain. Nothing to pay every month.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20%2B-brightgreen.svg)](https://nodejs.org)
[![Runs on](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-f38020.svg)](https://workers.cloudflare.com/)
[![Monthly cost](https://img.shields.io/badge/monthly%20cost-%E2%82%AC0-success.svg)](#-what-you-need)

**🇬🇧 English** · [🇮🇹 Italiano](README.it.md)

🔗 **Live demo:** *(coming soon)*

</div>

<!-- TODO: replace with a real screenshot of the home page, e.g. docs/screenshot-home.png
     A photography portfolio is judged by looking at it: this image is worth
     more than all the text that follows.
![The site](docs/screenshot-home.png)
-->

---

## 🗂️ Table of Contents

- [🤔 Why it exists](#-why-it-exists)
- [✨ What it does](#-what-it-does)
- [📸 Screenshots](#-screenshots)
- [🧰 What you need](#-what-you-need)
- [🚀 Getting started, and staying up to date](#-getting-started-and-staying-up-to-date)
- [⚡ Quick start](#-quick-start)
- [⚙️ Setting up a new portfolio](#-setting-up-a-new-portfolio)
- [🖼️ Using the site once it's live](#-using-the-site-once-its-live)
- [🎨 Customizing](#-customizing)
- [🏗️ Project structure](#-project-structure)
- [🧱 Architecture](#-architecture)
- [🤝 Contributing](#-contributing)
- [⭐ If this was useful](#-if-this-was-useful)
- [🔮 Future development](#-future-development)
- [⚖️ License](#-license)

---

## 🤔 Why it exists

Portfolios for photographers usually end up in one of two places: a monthly subscription to a platform that decides how your work should look, or a static site that forces you to rebuild and redeploy every time you add a photo.

This template sits in between. The site is static and very fast, but the photos live in a **Cloudflare R2** bucket and are uploaded from a **login-protected dashboard**: you add them, reorder them, pick the cover, and the site changes right away — without touching the code, without a deploy.

It's meant for **photographers who can code**, or for anyone setting up a site for a friend who takes pictures: the initial setup asks you to know git and the Cloudflare console, nothing after that does.

## ✨ What it does

- **Pages** — home with the albums, album page with grid and lightbox, contact page with a working form.
- **`/admin` dashboard** — upload photos (compressed in the browser before they're sent), reorder by dragging or by date, pick the cover, create and delete albums, edit name, bio and social links.
- **Protected access** through Cloudflare Access — you sign in with a code sent by email, and no password lives in the code.
- **Three ready-made looks** for the album cards, switched with a single line.
- **Everything customizable from the config files** — colors, fonts, spacing and copy, the dashboard's copy included.
- **Infrastructure described in Terraform**, or created by hand following the runbook.
- **Security headers generated automatically**, matched to your own domain without you writing them.

## 📸 Screenshots

*(coming soon — home page, album view, and the upload dashboard)*

## 🧰 What you need

| | |
|---|---|
| ☁️ **Cloudflare account** | the free plan is enough |
| 🟢 **Node.js 20+** | |
| 🌐 **A domain** | optional — otherwise it runs on a free `workers.dev` subdomain |

Recurring cost: **zero**, except the domain if you choose to have one.

## 🚀 Getting started, and staying up to date

**Fork it** — don't use "Use this template". A fork keeps the git history, and that's the only way you'll be able to pull in future improvements with a merge. "Use this template" creates a repository with no common ancestor: convenient on day one, permanent forever.

After forking:

```bash
git clone git@github.com:YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
git remote add upstream git@github.com:davidetarsi/PhotoPortfolioTemplate.git
npm install
# then open wrangler.json, replace the placeholders with your own values, and commit it:
# Cloudflare's deploy reads that file from the repository, so it has to be in there.
```

To pull in updates, whenever you want:

```bash
git fetch upstream
git merge upstream/main
```

Conflicts, if any, will land on `config/`, `theme/` and `wrangler.json` — that is, on what you customized. Keep your changes inside those files and updates will stay painless.

`wrangler.json` in particular will conflict almost every time, because the template ships it with placeholders and you've put your own values in it: resolve by keeping your version, with `git checkout --ours wrangler.json`.

> ⚠️ **Unless it doesn't conflict at all.** If you haven't committed anything of your own yet, git fast-forwards instead of merging: nothing conflicts, nothing warns, and your `wrangler.json` is replaced by the placeholders in silence. One command tells you which case you're in, and [**docs/upgrading.md**](docs/upgrading.md) is the production update procedure.

> 💡 Prefer a private repository, unlinked from the fork? Then `git clone` this repo, point `origin` at your own, and add `upstream` as above: for updates the result is identical.

## ⚡ Quick start

```bash
node --version   # requires v20+
npm install
npm run dev      # → http://localhost:5173/
ALLOW_PLACEHOLDER_CSP=1 npm run build
npm test
```

For the first deploy to Cloudflare, fill `wrangler.json` with your real values (not the placeholders).

## ⚙️ Setting up a new portfolio

### 1. Cloudflare infrastructure

This README is the setup entry point; the [Cloudflare infrastructure runbook](docs/runbook-cloudflare.md) is the detailed procedure linked from it. Start with the runbook's [field-by-field Terraform reference](docs/runbook-cloudflare.md#32-variable-reference) before editing [`infra/terraform.tfvars.example`](infra/terraform.tfvars.example).

Create the R2 buckets, Access applications and Turnstile widget through one of two equivalent paths:

- **Automatically, with Terraform** (recommended): follow the runbook's [Terraform path](docs/runbook-cloudflare.md#3-terraform-path). It covers tokens, every `terraform.tfvars` field, plan review, existing-resource imports and cleanup.
- **By hand, from the dashboard**: follow the [manual path](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard).

Maintaining the template itself? Use the runbook's [isolated Terraform smoke test](docs/runbook-cloudflare.md#35-isolated-smoke-test-for-template-maintainers), which never targets a live hostname. The complete create, convergence, build and cleanup lifecycle was verified against the real Cloudflare API on 22 September 2026.

Either way, the CSP is generated automatically from `wrangler.json` during the build.

### 2. Configuring `wrangler.json`

Fill in the placeholders:

```json
{
  "name": "your-portfolio",
  "main": "src/worker.js",
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "your-bucket" }
  ],
  "vars": {
    "ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
    "ACCESS_AUD": "aud-of-your-Access-app",
    "R2_PUBLIC_URL": "https://pub-xxxxxxxx.r2.dev"
  }
}
```

By hand, or with `npm run infra:sync` if you use Terraform.

### 3. Optional local CLI credentials

The browser preview does not need `.env`. Only `npm run migrate` and `npm run upload` require the four R2 variables below. `VITE_R2_PUBLIC_URL` is optional and is used only by the browser fallback; build-time meta preview reads `R2_PUBLIC_URL` from `wrangler.json`. It is not an S3 credential. No Turnstile sitekey belongs in `.env`.

```bash
VITE_R2_PUBLIC_URL="https://pub-xxxxxxxx.r2.dev"  # optional: copy from wrangler.json vars.R2_PUBLIC_URL
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="your-bucket"
```

These credentials must not go into git — `.env` is ignored, while the Cloudflare variables belong in `wrangler.json`, which is versioned.

### 4. Dashboard bootstrap

Fill in the configuration files that make up the site's seed:

- **`config/site.config.js`** — name, bio, social links, hero
- **`config/albums.config.js`** — albums, with slug, title, description and cover file name
- **`config/texts.config.js`** *(optional)* — UI copy
- **`config/admin.config.js`** *(optional)* — dashboard styling
- **`theme/tokens.css`** — colors and font variables
- **`theme/typography.css`** — type scale and Google Fonts links

The seed is already visible in the local preview. When you are ready to bootstrap the dashboard, run:

```bash
npm run migrate
```

This copies `site.config.js` and `albums.config.js` to R2 so `/admin` has runtime data to edit.

> Before migration, the home page can render album cards from the build seed. Opening one shows an empty album because photo manifests and image files exist only in R2.

> ⚠️ `migrate` is a one-time bootstrap command: it turns the seed into the JSON files on R2. **Running it again after you've used the dashboard resets everything to the seed, wiping out the work you did there.** The command notices, stops and explains what you'd lose, and asks for `--force` if you insist.

### 5. Git integration

Connect the repository to Cloudflare Workers & Pages (see [runbook](docs/runbook-cloudflare.md) section 6):

- Build command: `npm test && npm run build`
- Build output directory: `dist`
- Production branch: `main`

Cloudflare creates one production Worker from `main` that deploys on every push.

A second, isolated environment is available but disabled by default; enable it only if you need deployment-level checks, following [`docs/staging.md`](docs/staging.md).

## 🖼️ Using the site once it's live

The `/admin` dashboard is where you shape the site while it's running:

- **Site section** — edit name, bio, hero, social links
- **Albums section** — add albums, edit their title and description
- **Album view** — upload photos, reorder them, delete them

The files in `config/` are only the initial seed — after `migrate`, R2 is the source of truth. Changes made from the dashboard are live immediately, with no deploy.

## 🎨 Customizing

Read [`CUSTOMIZING.md`](CUSTOMIZING.md) to find out:

- Where to go for each kind of change
- The distinction between content (R2 + dashboard) and appearance/copy (files)
- What not to touch, to avoid conflicts on future merges from the template

## 🏗️ Project structure

```
config/          ← initial seed: identity, albums, copy, admin styling
theme/           ← appearance: CSS design tokens, typography, Google Fonts
src/pages/       ← JS entry point for each page
src/components/  ← reusable UI components
src/styles/      ← structural CSS (imports tokens only)
src/utils/       ← pure functions and helpers
src/worker.js    ← Cloudflare Worker
infra/           ← Terraform configuration (optional)
scripts/         ← tools: migrate, upload, compress
docs/            ← documentation: runbook, specs
public/          ← static assets (favicon). `_headers` doesn't live here: it's generated into dist/
```

## 🧱 Architecture

| Layer | Technology |
|---|---|
| **Hosting** | Cloudflare Workers (static assets + API for `/admin`) |
| **Photo storage** | Cloudflare R2 (public bucket via r2.dev or a custom domain) |
| **Admin authentication** | Cloudflare Access (Zero Trust) with JWT |
| **Bundler** | Vite 8.x, multi-page — entry points in `vite.config.js` |
| **Security headers** | generated from `wrangler.json` at build time |
| **OpenGraph meta tags** | injected at build time from `site.config.js` |
| **Framework** | vanilla JS/HTML/CSS — no runtime framework |
| **Photo compression** | `npm run compress -- --input <path>` — for HEIC, TIFF and bulk uploads (Sharp, WebP 1900px q85) |
| **Direct photo upload** | `npm run upload -- --album <slug> --input <optimized-directory>` — uploads a prepared directory and its `manifest.json` directly to R2; requires the optional `.env` credentials and is not the normal dashboard workflow. |

## 🤝 Contributing

Issues and pull requests are welcome. If you've built something with this template, opening an issue just to say so is genuinely useful: it tells me which parts people actually use.

If you fix something in `src/`, consider contributing it back upstream — that way the next person who forks it gets the fix for free, and you won't have to re-apply it on every merge.

**How to contribute:** See [`CONTRIBUTING.md`](CONTRIBUTING.md) for conventions on code comments, commit messages, and the contribution workflow.

## ⭐ If this was useful

This template is free, and it stays free. There is nothing to pay for and nothing to unlock.

What genuinely helps, and costs you nothing:

- **Star the repository** — it is the only signal I get that someone found it worth keeping.
- **Open an issue when something breaks.** Especially during setup: if you got stuck somewhere, so will the next person, and I would rather fix the instructions than let it happen twice.
- **Tell me what you built with it.** An issue, a link, two lines. Knowing which parts people actually use is what decides what gets improved next.

If you fixed something in your own fork, consider opening a pull request — the next person gets it for free, and you stop re-applying it on every update.

## 🔮 Future development

Where this is likely to go next. These are intentions, not promises:

- **Preview before publishing.** Today, uploading, reordering and deleting photos take effect immediately. The plan is to let those changes sit as a draft you can look at before they go live — the way editing name and bio already works.
- **Per-album social previews.** Right now every shared link shows the same site-wide preview image, because static hosting can't generate one per album. Solvable, but it needs the Worker to render the meta tags.
- **A light theme preset.** Now that every color lives in `theme/tokens.css`, shipping a second ready-made palette is mostly a matter of choosing good values.
- 🃏 **More card variants**, if the three that ship turn out not to cover what people want.

Got a different idea? Open an issue — the list above is shaped by what people ask for.

## ⚖️ License

[MIT](LICENSE) — use it, change it, redistribute it, commercially too. The only thing you have to keep is the copyright notice.

You are not required to open-source your own site, and you never will be. That's deliberate: a personal portfolio is yours.
