# Updating your site from the template

You forked this template and made it your site. The template keeps moving — bug fixes, new
features, security changes. This is how you pull those in without losing your own
configuration.

If you are handing this file to an agent rather than following it yourself, the one thing
it must not skip is the check in the next section. Everything else is recoverable; that
one is the difference between a silent config wipe and a normal merge.

## The two remotes

Your fork is `origin`. The template is `upstream`, and you add it once:

```bash
git remote add upstream https://github.com/<owner>/<template-repo>.git
git fetch upstream
```

From then on, an update is a merge of `upstream/main` into your branch.

## Your first update is the dangerous one

Everything below hinges on one question: **have you committed anything of your own since
forking?** Run this before merging:

```bash
git log --oneline origin/main ^upstream/main
```

**If it prints nothing**, you have no commits the template lacks. Your branch is not
divergent, it is simply *behind*, and `git merge` will do a **fast-forward**: git moves
the label forward and your files become the template's files.

That sounds harmless and mostly is — it is how you get the new work. But a fast-forward
has no merge, therefore no conflict, therefore **no warning**. And one of the files it
replaces is `wrangler.json`, which holds your bucket names, your R2 public URL and your
Access AUD. They are silently overwritten with the template's placeholders. Push that and
your deployment goes live pointing at `pub-xxxxxxxx.r2.dev`.

**If it prints commits**, you are past this stage. Skip to
[Updates after the first one](#updates-after-the-first-one).

## The first update, step by step

Put your configuration aside before the merge and restore it after:

```bash
cp wrangler.json ~/wrangler.mysite.json    # outside the repo, so the merge cannot touch it
git merge upstream/main                    # fast-forward: overwrites without asking
cp ~/wrangler.mysite.json wrangler.json    # put your values back
git add wrangler.json
git commit -m "chore: restore this site's real configuration"
```

**That last commit is the point of the exercise.** It gives your fork a commit the template
does not have. From then on your branch is genuinely divergent, merges are real merges, and
`wrangler.json` conflicts loudly like it should.

> Before you commit, compare your restored `wrangler.json` against the template's
> `wrangler.example.json`. An update may have **added** a variable — if your file is missing
> one the new code expects, restoring it verbatim reintroduces the gap. Copy any new key
> across and fill it in.

## What each file does during an update

| File | What happens | Is that right? |
|---|---|---|
| `wrangler.json` | replaced by the template's placeholders | **no** — restore it, as above |
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
the restored `wrangler.json` is still using a placeholder. Once the check passes, push the
production branch:

```bash
git push origin main
```

[Optional: test the deployment on staging](staging.md).

## Updates after the first one

Once your fork has commits of its own, `git merge upstream/main` behaves the way you expect.
`wrangler.json` will come up as a genuine conflict, and the answer is almost always to keep
your side:

```bash
git checkout --ours wrangler.json && git add wrangler.json
```

Then re-read the note above about newly added variables: keeping your side wholesale is
right for values, wrong for keys the new code expects to exist.

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

An update that renames a slot, changes a contract method or changes a field of a slot's `ctx` is listed here. After merging, run `npm test`: it catches a renamed slot or contract method in your `custom/slots.js`, but not a changed `ctx` field — check your components against `docs/slots.md`. No such change so far.

## If it goes wrong

Nothing here is destructive as long as you have not pushed. A fast-forward only moved a
label, so put it back:

```bash
git reset --hard origin/main    # before pushing: undoes the merge entirely
```

Your saved `~/wrangler.mysite.json` is still there. Start again.
