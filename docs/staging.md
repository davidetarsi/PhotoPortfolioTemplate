# Optional staging environment

Staging is a second, isolated Cloudflare deployment. It is disabled by default; follow
this guide only if you need deployment-level checks before promoting an update.

> **Existing staging users: preserve it before planning**
>
> Staging is now opt-in. If your current Terraform state already contains a staging
> bucket, managed domain, or Access application, add this to `infra/terraform.tfvars`
> before running the first `terraform plan` after the update:
>
> ```hcl
> enable_staging = true
> ```
>
> Without it, the default is `false` and Terraform proposes destroying those three
> staging resources. Stop if the plan contains those destroys.

## 1. What staging is, and what it is not

Staging lets you verify that a build deploys, Cloudflare Access login works, admin routes
are reachable, and the contact form submits. It separates the deployed code and Worker
from production.

It does not mirror production content and does not add draft/publish semantics. The two
environments have separate buckets and separate deployments.

## 2. Do you need it?

Local `npm run dev` runs Vite and cannot exercise the Worker APIs. Local `wrangler dev`
cannot provide the Cloudflare Access header that protects `/admin`; the Worker rejects
admin requests without it. A deployed staging Worker can check those integration points
before you update production. It is not a preview of production albums or photos.

## 3. The staging bucket starts empty

A new staging bucket starts empty. Production photos and albums are not copied to it, and
there is no production-to-staging copy command in this template. Expect an empty portfolio
until you add staging content yourself.

## 4. Enable staging with Terraform

In `infra/terraform.tfvars`, opt in and leave the hostname empty until the first deploy:

```hcl
enable_staging  = true
staging_hostname = ""
```

If this Terraform state already has staging resources, follow the warning in
[`docs/upgrading.md`](upgrading.md) before the first plan after updating the template.

> The following Cloudflare dashboard labels were copied from the previously working runbook. Verify them during the next live staging setup before removing this note; do not rewrite them from memory.

Cloudflare assigns a `workers.dev` hostname (e.g.,
`mario-portfolio-staging.xxxxx.workers.dev`) only after the Worker's first deploy. So on
first deploy you don't know this value yet — you can't write it in `terraform.tfvars` and
run `terraform apply` straight away.

Solution: apply **only the buckets** on first pass:

```bash
terraform apply -target=cloudflare_r2_bucket.prod -target=cloudflare_r2_bucket.staging
```

Then do the first deploy (see [Git integration](#git-integration--connect-repository)
below). After deploy, read the assigned `workers.dev` domain from Cloudflare dashboard:

```bash
# Cloudflare dashboard → Workers & Pages → photo-portfolio-staging → Settings → Domains & Routes
# Copy the URL in format mario-portfolio-staging.xxxxx.workers.dev
```

Fill the value in `terraform.tfvars` and run the full apply:

```bash
terraform apply  # Now apply everything, including Access and r2.dev managed domains
```

Then follow the production Terraform path in the [Cloudflare runbook](runbook-cloudflare.md)
to export outputs, run `npm run infra:sync`, and build the site.

## 5. Enable staging manually

Start with the production resources in the runbook's [manual path](runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard),
then add the separate staging resources below.

### R2 Buckets

1. Cloudflare dashboard → **R2 → Create Bucket**
2. Name: `{project_name}-staging` (e.g. `mario-portfolio-staging`)
3. Replica region: no (optional, only for geographic redundancy)
4. Create

### R2 managed domains (r2.dev)

1. Dashboard → **R2 → select staging bucket → Settings → Public access → Edit**
2. Enable public access
3. Copy the shown domain (format `pub-xxxxxxxx.r2.dev`)

These domains expose photos — they're rate-limited and uncached, suitable only for
development. Before production, consider a custom domain (see the runbook's
[custom-domain section](runbook-cloudflare.md#8-custom-domain-for-photos)).

### Access application for staging

If using `workers.dev` for staging, Access can't do path-scoping on that domain — it
protects the entire subdomain. Create a separate application that protects all of
`mario-portfolio-staging.xxxxx.workers.dev`:

1. Cloudflare dashboard → **Zero Trust → Access → Applications → Create new application**
2. Select **Self-hosted and private**
3. Name: e.g. `mario-portfolio admin (staging)`
4. **Add public hostname:** enter the staging `workers.dev` hostname; Access protects the
   whole subdomain, so do not add a path.
5. Access policies → **Create new policy**:
   - Name: `Just me`
   - Decision: **Allow**
   - Include → **Emails** → your email (e.g. `mario@mario.com`)
6. Identity providers: leave **One-time PIN** (default, needs no setup)
7. Save and create application
8. Copy the **Audience (AUD) Tag** value from the application page

### Zero Trust team domain

The team domain is provided by Cloudflare with your first Zero Trust account — format
`{team}.cloudflareaccess.com` (e.g. `mario.cloudflareaccess.com`). You don't create it, it
already exists. The Worker uses it to validate JWTs issued by Access — see
`ACCESS_TEAM_DOMAIN` in `wrangler.json`.

Find it at: Cloudflare dashboard → **Zero Trust → Settings → Custom domain**. If you don't
see it, navigate to **Access → Applications** and find the team domain in the browser URL
(`https://{team}.cloudflareaccess.com/...`).

### Turnstile widget

On the Terraform path this widget is created for you. Here you create it by hand — or you
skip it, and the form still works: the runbook's [contact-form section](runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection)
explains what you give up.

1. Cloudflare dashboard → **Turnstile → Add widget**
2. Name: e.g. `mario-portfolio contact form`
3. **Hostnames:** add the production hostname *and* the staging one (e.g. `mario.com` and
   `mario-portfolio-staging.xxxxx.workers.dev`). One widget covers both. A hostname that
   isn't listed fails validation, so a staging form pointed at a prod-only widget answers
   `CHALLENGE_FAILED` every time.
4. Widget Mode: **Managed**
5. Create

The staging hostname isn't known before the first deploy (see [the two-step procedure](#4-enable-staging-with-terraform)).
Create the widget with production only, and add staging once Cloudflare has assigned it.

The widget page then shows two values, and they go to **two different places** — never
both into `wrangler.json`:

| Value | Where it goes | Why |
|---|---|---|
| **Site Key** | `wrangler.json`, as `vars.TURNSTILE_SITEKEY`, and again under `env.staging.vars` | it ends up in the HTML; it is not a secret |
| **Secret Key** | `wrangler secret put`, once per environment | the Worker validates tokens with it; it must never reach git |

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put TURNSTILE_SECRET --env staging
```

Secrets are per-environment, and a missing one fails **open**, not closed: `verifyTurnstile`
reads an absent secret as "Turnstile isn't in use here" and accepts every submission. So
setting it only for production doesn't break staging — it silently leaves it unguarded,
with the widget still drawn on the page if the staging sitekey is set. Nothing in the UI
tells you. Set it in both environments, or decide deliberately that staging goes without.

### Git integration — Connect repository

Cloudflare lets you deploy the Worker directly from Git — no GitHub Actions needed, it's
native.

1. Cloudflare dashboard → **Workers & Pages → Create application → Pages**
2. Connect your GitHub account (if not done yet)
3. Select the portfolio repository
4. Configure the build:
   - **Build command:** `npm test && npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (leave default)
5. Environment: add environment variables only if your fork requires them; the standard
   template reads its non-secret Cloudflare configuration from `wrangler.json`.
6. **Production branch:** `main` (for production Worker)
7. **Staging branch:** `staging` (for staging Worker)

Cloudflare creates two Workers automatically:
- `{project-name}` from `main` branch (reachable on
  `{project-name}.{account-subdomain}.workers.dev` and linked to custom domain if configured)
- `{project-name}-staging` from `staging` branch (reachable on
  `{project-name}-staging.{account-subdomain}.workers.dev`)

Every push triggers a new deploy automatically.

### Add the staging environment to `wrangler.json` manually

The distributed `wrangler.example.json` contains production only. For a manual setup, add
this top-level block to your local `wrangler.json` and replace each placeholder with the
values from the bucket, Access application, and Turnstile widget:

```json
{
  "env": {
    "staging": {
      "name": "mario-portfolio-staging",
      "r2_buckets": [
        { "binding": "BUCKET", "bucket_name": "mario-portfolio-staging" }
      ],
      "vars": {
        "ACCESS_TEAM_DOMAIN": "mario.cloudflareaccess.com",
        "ACCESS_AUD": "staging-access-aud",
        "R2_PUBLIC_URL": "https://pub-xxxxxxxx.r2.dev",
        "TURNSTILE_SITEKEY": "your-widget-sitekey"
      }
    }
  }
}
```

Merge the `env` object into the existing JSON root; do not replace the production values.
`TURNSTILE_SECRET` is a secret and does not belong in this file.

## 6. Add staging to an existing production site

Adding staging later is additive: production keeps its current bucket, hostname, and
configuration. With Terraform, set `enable_staging = true` and follow the
[two-step hostname procedure](#4-enable-staging-with-terraform). If Terraform manages
Turnstile, applying the staging hostname updates the widget. If the widget is manual, add
the staging hostname in its dashboard settings. Until that hostname is listed, every
staging form submission fails with `CHALLENGE_FAILED`. Set `TURNSTILE_SECRET` separately
for staging with:

```bash
npx wrangler secret put TURNSTILE_SECRET --env staging
```

For a manually managed installation, add the staging bucket, public `r2.dev` domain,
Access application, and Git branch described in [the manual procedure](#5-enable-staging-manually).
The staging bucket stays empty unless you add content to it.

If these manually created resources should later be managed by Terraform, first set
`enable_staging = true`, complete the hostname setup, and then import the three staging
resources using their counted Terraform addresses:

```bash
terraform import 'cloudflare_r2_bucket.staging[0]' {account_id}/{bucket-name}-staging
terraform import 'cloudflare_r2_managed_domain.staging[0]' {account_id}/{domain-id}
terraform import 'cloudflare_zero_trust_access_application.staging[0]' {account_id}/{app-id}
```

After applying the configuration, export outputs and run `npm run infra:sync` so
`wrangler.json` includes a complete `env.staging` block. The generator rejects partial
staging outputs.

## 7. Upgrade through staging

An update is not a code review, it is a deployment: the moment you push, Cloudflare builds
and your visitors get it. When you explicitly enable staging, it is a separate Worker with
its own bucket, so you can verify an update there without touching production.

```bash
git checkout staging
git merge upstream/main
#   ...restore wrangler.json and commit, as above...

npm test && npm run build && head -2 dist/_headers
```

Read that CSP line. It must contain **your** R2 URL. If it contains `pub-xxxxxxxx`, the
restore failed — stop, do not push.

```bash
git push origin staging
```

Now open your staging site and click through it: the home page, an album, `/admin`, and the
contact form. When you are satisfied:

```bash
git checkout main && git merge staging    # fast-forward: the same bytes you just tested
git push origin main
```

The second merge resolves nothing a second time. `staging` already contains everything, so
production gets exactly the bytes you verified — not a second hand-made resolution that
might differ from the first.

## 8. Disable staging safely

Do not disable staging until its bucket is empty; Terraform cannot delete a non-empty R2
bucket. First, confirm the staging bucket is empty and manually disable its `r2.dev` public
URL in Cloudflare. The managed-domain wrapper cannot be destroyed through Terraform, so
while `enable_staging` is still `true`, remove only that wrapper from state:

```bash
terraform state rm 'cloudflare_r2_managed_domain.staging[0]'
```

After the state removal succeeds, set `enable_staging = false` in
`infra/terraform.tfvars`, then run and review the plan:

```bash
terraform plan
```

The plan should remove only the empty staging bucket and staging Access application. If it
shows any other changes, stop and resolve them before continuing. Once the plan matches
that scope, apply:

```bash
terraform apply
```

Finally, regenerate Wrangler configuration from Terraform outputs with
`npm run infra:sync` and rebuild production.
