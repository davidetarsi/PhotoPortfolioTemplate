# Updating your site from the template

You forked this template and made it your site. The template keeps moving — bug fixes, new
features, security changes. This is how you pull those in without losing your own
configuration.

## Your configuration stays yours

The template ships only `wrangler.example.json`. Your fork commits its own `wrangler.json`, and a merge from `upstream` never touches it. When an update adds a key to `wrangler.example.json` — the notes under "When an update changes behaviour" say so — run `npm run infra:sync` again, or copy the new key across by hand.

### Forks created before 26 September 2026

Older versions of the template tracked a placeholder `wrangler.json`. The first merge after this change deletes it on the template's side, so git stops once with a *modify/delete* conflict. Keep your file:

```bash
git merge upstream/main
git add wrangler.json
git commit
```

From then on it never conflicts again.

## The two remotes

Your fork is `origin`. The template is `upstream`, and you add it once:

```bash
git remote add upstream https://github.com/<owner>/<template-repo>.git
git fetch upstream
```

From then on, an update is `git fetch upstream` followed by `git merge upstream/main`.

## What each file does during an update

| File | What happens | Is that right? |
|---|---|---|
| `wrangler.json` | untouched: the template does not ship it | yes |
| `public/_headers` | deleted | yes: the CSP is generated at build time from `wrangler.json`. If you restore it, Vite copies it over the generated one and pins stale URLs in production |
| `config/*.config.js` | back to the neutral seed | yes: at runtime the truth lives in R2, not in these files |
| `custom/` | untouched — the template never ships it | yes. Slot changes are listed under "When an update changes behaviour" below |

After the merge, **do not run `npm run migrate`**. It would push the empty seed over your
real content.


## Verify the production update

Before pushing the updated `main` branch, run the production checks:

```bash
npm test
npm run build
head -2 dist/_headers
```

The CSP line must contain your real production R2 URL. If it contains `pub-xxxxxxxx`, stop:
your `wrangler.json` still uses a placeholder. Once the check passes, push the
production branch:

```bash
git push origin main
```

[Optional: test the deployment on staging](staging.md).

## When an update changes behaviour

### Existing staging users: preserve it before planning

Staging is now opt-in. If your current Terraform state already contains a staging
bucket, managed domain, or Access application, add this to `infra/terraform.tfvars`
before running the first `terraform plan` after the update:

```hcl
enable_staging = true
```

Without it, the default is `false` and Terraform proposes destroying those three
staging resources. Stop if the plan contains those destroys.

Some updates move more than code. Before merging, skim what is coming:

```bash
git log --oneline main..upstream/main
```

Two kinds of change deserve a second look, because tests pass either way:

- **A route was renamed.** Existing shared links keep working through redirects, but any
  hard-coded URL of your own — in a CV, a business card, an email signature — is yours to
  check.
- **An integration was replaced.** If a feature moved from a third-party service to the
  Worker, it may now need configuration that did not exist before. Secrets are the usual
  case.
  See the [runbook](runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection),
  which spells out which values must be set together and what breaks when only one is.

### Slots and `custom/`

An update that renames a slot, changes a contract method, changes a field of a slot's `ctx`, or removes, renames or changes what an export of `src/api/index.js` takes or returns is listed here. After merging, run `npm test` and `npm run build`. `npm test` catches a renamed slot or contract method in your `custom/slots.js`, but not a changed `ctx` field — check your components against `docs/slots.md`. A removed or renamed export of `src/api/index.js` fails `npm run build`; `npm test` catches it only where a test of yours calls it. No such change so far.

The current slot contracts, handle ownership, page events, custom CSS ordering and explicit override errors are documented in [the extension guide](slots.md). `custom.example/` is the runnable reference; copy it to `custom/` in a disposable checkout before trying it.

### F3 (2026-09-26): routes and reserved slugs

- `/contatti` no longer redirects to `/about`. Old links to `/contatti` now reach the album page and answer "album not found", unless you have an album with that slug.
- The dashboard refuses new albums named `album` or `index`, as it already did for `about`, `admin`, `api` and `assets`. Albums that already have one of these slugs are not touched: they stay in the list and in the dashboard, and on the public site the template page answers at that address.
- The Worker no longer refuses reserved slugs when albums are saved or photos are uploaded. The dashboard is where new names are checked.

### Before sharing (2026-09-26): Node and Turnstile

- Node.js 22.12 or later is required; `package.json` now declares it in `engines`.
- With `TURNSTILE_SITEKEY` set and no `TURNSTILE_SECRET`, the contact form now answers `503 TURNSTILE_NOT_CONFIGURED` instead of accepting unverified messages. Set the secret with `npx wrangler versions secret put TURNSTILE_SECRET`, or remove the sitekey.

### Private message bucket (2026-09-26)

Contact messages (and, later, the dashboard draft) now go to a private bucket, `<project_name>-private`, with no public URL. Before updating, read the messages you want to keep in the dashboard: after the update the dashboard reads only the new bucket, and the old ones stay in the photo bucket under `_messages/`, where you can delete them from the R2 dashboard. Then:

1. With Terraform: `terraform -chdir=infra plan` must show only the new bucket (two with staging), then apply, `terraform -chdir=infra output -json > infra/outputs.json` and `npm run infra:sync`. By hand: create the bucket without public access and add `{ "binding": "PRIVATE_BUCKET", "bucket_name": "<project_name>-private" }` to `r2_buckets` in `wrangler.json`.
2. Commit `wrangler.json` and deploy. Without the binding, the contact form answers `500 STORAGE_UNAVAILABLE` on purpose instead of writing to the public bucket.

### Domain attached by the deploy (2026-09-26)

After `terraform -chdir=infra apply` (no resource changes, one new output), `terraform -chdir=infra output -json > infra/outputs.json` and `npm run infra:sync`, `wrangler.json` gains `routes` with your domain as a custom domain and, without staging, `"workers_dev": false` and `"preview_urls": false`. If you already attached the domain by hand, the deploy keeps it. Your site then stops answering on its `workers.dev` address.

## If it goes wrong

Nothing here is destructive as long as you have not pushed. A fast-forward only moved a
label, so put it back:

```bash
git reset --hard origin/main    # before pushing: undoes the merge entirely
```

Your saved `~/wrangler.mysite.json` is still there. Start again.
