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
- [⚡ Try it locally](#-try-it-locally)
- [⚙️ Setting up a new portfolio](#-setting-up-a-new-portfolio)
- [⚠️ Mistakes to avoid](#-mistakes-to-avoid)
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

- **Pages** — home with the albums, album page with grid and lightbox, an About page with a working contact form.
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
| 🌐 **A domain on Cloudflare** | needed for the `/admin` dashboard: Cloudflare Access can protect `/admin` alone only on your own domain. Without one you can still try the site locally |
| 🟢 **Node.js 22.12+** | `wrangler`, used during setup, requires Node 22 |
| 🧱 **Terraform 1.9+** | recommended; the [manual path](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) works without it |

Recurring cost: **zero**, except the domain.

The interface copy ships in Italian: change it in `config/texts.config.js`.

## 🚀 Getting started, and staying up to date

**Fork it** — don't use "Use this template". A fork keeps the git history, and that's the only way you'll be able to pull in future improvements with a merge. "Use this template" creates a repository with no common ancestor: convenient on day one, permanent forever.

After forking:

```bash
git clone git@github.com:YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
git remote add upstream git@github.com:davidetarsi/PhotoPortfolioTemplate.git
npm install
# then follow "Setting up a new portfolio" below, in order
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

## ⚡ Try it locally

```bash
node --version   # requires v22.12+
npm install
npm run dev      # → http://localhost:5173/
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build   # only checks that it builds: never deploy this output
```

The local preview shows the seed from `config/`, without photos: photos live in R2, which the next section sets up.

## ⚙️ Setting up a new portfolio

Follow the steps in order: each one needs the previous. The [Cloudflare runbook](docs/runbook-cloudflare.md) has the details behind every step.

### 1. Create the infrastructure

With Terraform (recommended): copy `infra/terraform.tfvars.example` to `infra/terraform.tfvars`, fill it using the [field-by-field reference](docs/runbook-cloudflare.md#32-variable-reference), then plan and apply as the [Terraform path](docs/runbook-cloudflare.md#3-terraform-path) explains, including the API token and its permissions. It creates two R2 buckets — a public one for photos and a private one for contact messages — the Access application that protects `/admin` and `/api/admin`, and the Turnstile widget of the contact form.

Then write the results into `wrangler.json`:

```bash
npm run infra:sync
```

Without Terraform, follow the [manual path](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) and fill `wrangler.json` by hand, starting from `wrangler.example.json`.

### 2. Commit `wrangler.json`

```bash
git add wrangler.json
git commit -m "chore: my Cloudflare configuration"
git push
```

Cloudflare's deploy reads this file from the repository. It holds identifiers, not secrets: secrets go to Cloudflare in step 5. The Content Security Policy is generated from it at every build.

### 3. Connect the repository to Cloudflare

Cloudflare dashboard → **Workers & Pages → Create → Import a repository** ([runbook §6](docs/runbook-cloudflare.md#6-git-integration--connect-repository)):

- Build command: `npm test && npm run build`
- Build output directory: `dist`
- Production branch: `main`

Every push to `main` deploys the site.

### 4. Attach your domain to the Worker

Workers & Pages → your Worker → **Settings → Domains & Routes → Add → Custom domain**, and enter the hostname you used as `prod_hostname`. Until you do, the site answers only on its `workers.dev` address, where the dashboard cannot sign you in.

### 5. Set the secrets

After `npx wrangler login`:

```bash
npx wrangler versions secret put TURNSTILE_SECRET     # the Turnstile widget's secret key
npx wrangler versions secret put CONTACT_NOTIFY_URL   # optional: a push notification for each new message
```

`versions secret put` prepares a new version without publishing it: promote it from the Worker's **Deployments** tab, or push a commit. The secret key is in the dashboard under **Turnstile → your widget**. If the sitekey is in `wrangler.json` and this secret is missing, the contact form refuses every message on purpose. Notifications and their limits: [runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection).

### 6. Load the initial content

Fill the seed files:

- **`config/site.config.js`** — name, bio, social links, hero
- **`config/albums.config.js`** — albums, with slug, title, description and cover file name
- **`config/texts.config.js`** *(optional)* — interface copy
- **`config/admin.config.js`** *(optional)* — dashboard styling
- **`theme/tokens.css`** and **`theme/typography.css`** — colors, fonts and the Google Fonts link

Then copy them to R2 once. `npm run migrate` reads four R2 variables from `.env` (copy `.env.example`; create an R2 API token with write access to your bucket):

```bash
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="your-bucket"
```

```bash
npm run migrate
```

> ⚠️ `migrate` is a one-time bootstrap. **Running it again after you've used the dashboard resets everything to the seed.** It notices, stops and asks for `--force`.

`VITE_R2_PUBLIC_URL` in `.env` is optional: only the local preview uses it. `npm run upload` uses the same credentials to upload a prepared folder outside the dashboard.

### 7. Sign in to `/admin`

Open `https://your-domain/admin`. Cloudflare Access asks for your email and sends a one-time code: only the addresses listed in `admin_emails` get in. Create an album and upload a few photos.

### 8. Check that everything works

- The home page lists your albums, and an album shows the photos you uploaded.
- On the About page, send yourself a message: it appears in the dashboard under **Messages**, and as a notification if you configured one.
- The same Worker also answers on `https://<worker>.<account>.workers.dev`: there, `/admin` must not let you in.

An optional staging environment exists, but it is not turnkey for a first install: see [`docs/staging.md`](docs/staging.md).

## ⚠️ Mistakes to avoid

| Don't | Do instead |
|---|---|
| Use "Use this template" | Fork it, so you can merge updates ([above](#-getting-started-and-staying-up-to-date)) |
| Use Node 20 | Node 22.12 or later |
| Leave the site without your domain | Attach it to the Worker (step 4): `/admin` works only there |
| Run `npm run migrate` again after using the dashboard | Edit content from `/admin`; `migrate` is only the first bootstrap |
| Merge an update without looking at `wrangler.json` | Follow [docs/upgrading.md](docs/upgrading.md): a fast-forward replaces your values with placeholders without any conflict |
| Deploy a build made with `ALLOW_PLACEHOLDER_CSP=1` | Use it only to check that the template builds |
| Put a notification URL or any secret in `wrangler.json` | `npx wrangler versions secret put …`: the file is public in your repository |
| Set the Turnstile sitekey without the secret, or the reverse | Set both, or neither ([runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection)) |
| Serve production photos from `r2.dev` | Add a custom photo domain ([runbook §8](docs/runbook-cloudflare.md#8-custom-domain-for-photos)): `r2.dev` is rate-limited |
| Set `keep_managed_domain = false` before the photo domain works | Verify the custom domain first, then turn `r2.dev` off |
| Update an installation that already has staging without `enable_staging = true` | Set it before the first `terraform plan`, or Terraform proposes destroying staging |


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

For replacing page components, lifecycle events and the optional custom theme, see the [extension guide](docs/slots.md). To add pages of your own — an archive, one page per project — see [pages](docs/pages.md). Copy [`custom.example/`](custom.example/) into `custom/` to try both locally.

## 🏗️ Project structure

```
config/          ← initial seed: identity, albums, copy, admin styling
theme/           ← appearance: CSS design tokens, typography, Google Fonts
src/pages/       ← JS entry point for each page
src/components/  ← reusable UI components
src/styles/      ← structural CSS (imports tokens only)
src/utils/       ← pure functions and build helpers
src/shared/      ← rules shared by site, dashboard and Worker (slugs, validation)
src/api/         ← the public API: the only thing custom/ may import
src/worker.js    ← Cloudflare Worker
src/core/        ← slot registry and page lifecycle: the parts a fork can replace
src/admin/       ← the /admin dashboard
custom.example/  ← example of custom/, where a fork replaces parts of the site
infra/           ← Terraform configuration (optional)
scripts/         ← tools: migrate, upload, compress
docs/            ← guides: runbook, staging, upgrading, slots, pages (maintainer notes in docs/maintainers/)
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
- **Social previews for home and about.** Album links already show their own title and cover. Home and about still use the values baked in at build time; serving them through the Worker would let them follow dashboard edits too, at the cost of a Worker call on every visit to the home page.
- **A light theme preset.** Now that every color lives in `theme/tokens.css`, shipping a second ready-made palette is mostly a matter of choosing good values.
- 🃏 **More card variants**, if the three that ship turn out not to cover what people want.

Got a different idea? Open an issue — the list above is shaped by what people ask for.

## ⚖️ License

[MIT](LICENSE) — use it, change it, redistribute it, commercially too. The only thing you have to keep is the copyright notice.

You are not required to open-source your own site, and you never will be. That's deliberate: a personal portfolio is yours.
