# Cloudflare infrastructure runbook

The [README](../README.md) is the canonical entry point for setup. This runbook contains the detailed Cloudflare procedures behind it: Terraform, existing-resource imports, an isolated smoke test, the permanent dashboard-only production path, custom image domains and contact-form secrets.

Choose one starting path:

- **New infrastructure:** follow [Terraform path](#3-terraform-path), or [create it manually](#5-manual-path--creating-resources-from-cloudflare-dashboard).
- **Resources already exist:** do not create duplicates; follow [Importing existing resources](#7-import-existing-infrastructure).
- **Template maintainers validating Terraform:** use the [isolated smoke test](#35-isolated-smoke-test-for-template-maintainers).

## 1. Prerequisites

You need:

- **Active Cloudflare account** with dashboard access and permissions to create R2 buckets, public domains, and Access applications (Zero Trust).
- **Production domain** (optional on first deploy, required before going live). In our example we use a custom domain like `portfolio.example`, already an active Cloudflare zone. If you don't have one, for initial testing you can use the `workers.dev` domain provided by Cloudflare (read-only, with rate limiting).
- **Zone ID** of the custom domain, if you use it for photos. Find it in Cloudflare dashboard → select the domain → copy Zone ID from the right sidebar.

## 2. Cloudflare API Token

Terraform operations require an API token with specific permissions. If you're not using Terraform, you don't need this token: skip to [Manual path](#5-manual-path--creating-resources-from-cloudflare-dashboard). If you use it later, the token must have:

- **Workers R2 Storage: Edit** — allows creating and modifying R2 buckets.
- **Access: Apps and Policies: Edit** — allows creating Access applications and policies.
- **Turnstile: Edit** — required by the contact-form widget, enabled by default through `enable_turnstile = true`.
- **Zone: DNS: Edit** (only if using a custom domain for photos) — allows configuring DNS records on the domain.

Create the token in Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create Custom Token** and assign these permissions. Restrict it to the account used by the portfolio and use a short lifetime when possible. See Cloudflare's [API token guide](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

**Critical:** never write the token in a versioned file (never in `.env`, `wrangler.json`, or `terraform.tfvars`). Read it without echoing it or storing it in shell history:

```zsh
read -s CLOUDFLARE_API_TOKEN
echo
export CLOUDFLARE_API_TOKEN
```

The environment variable exists only in the terminal session where you exported it. Run every Terraform command from that same terminal. Opening another tab or window, or starting a new shell, requires exporting the token again.

Before `terraform apply`, verify that the variable is present without printing its value:

```zsh
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Cloudflare API token: loaded"
else
  echo "Cloudflare API token: missing"
fi
```

If Cloudflare returns error `9106` with `Missing X-Auth-Key, X-Auth-Email or Authorization headers`, the provider received no token. Export `CLOUDFLARE_API_TOKEN` again in the same terminal and retry. This error is different from a token that is present but lacks a required permission.

If you accidentally write it in a file, immediately revoke the token on Cloudflare and create a new one.

## 3. Terraform path

### 3.1 Local files and secrets

From the repository root:

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`, `.terraform/`, the state and `outputs.json` are ignored by Git. They contain account-specific configuration and must stay local. The Cloudflare token does **not** belong in any of them; it exists only in `CLOUDFLARE_API_TOKEN` in the current shell.

### 3.2 Variable reference

| Variable | What to enter | Where to find it |
|---|---|---|
| `account_id` | The Cloudflare account that owns the resources | Account Home → `Cmd/Ctrl+K` → **Copy account ID**, or Workers & Pages → Account Details. [Official guide](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/) |
| `project_name` | Base resource name. The production bucket uses it exactly | Choose a new lowercase, hyphenated name, or use the exact existing bucket prefix when importing |
| `access_team_domain` | Existing Zero Trust domain, without `https://` | Zero Trust → Settings → Team name and domain. Format: `team.cloudflareaccess.com`. [Official guide](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/#what-is-a-team-domainteam-name) |
| `prod_hostname` | Production hostname without scheme or trailing slash | Real public hostname for a deployment; unused subdomain for an isolated smoke test |
| `admin_emails` | One or more addresses allowed into `/admin` | Decide who administers the portfolio; every listed address becomes an Access include rule |
| `custom_photo_domain` | Optional production hostname for R2 images | Choose a subdomain such as `img.example.com`; leave empty during initial setup |
| `photo_domain_zone_id` | Zone ID for `custom_photo_domain` | Domain Overview → API section → Zone ID. [Official guide](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/#copy-your-zone-id) |
| `keep_managed_domain` | Keep `true` until the custom image domain is verified | Set `false` only after completing [section 8](#8-custom-domain-for-photos) |
| `enable_turnstile` | Create spam protection for the contact form | Keep `true` unless accepting honeypot-only protection |

For a real deployment, hostnames and existing bucket names must describe the real environment. For a smoke test, use a unique `project_name` and two unused subdomains so no live hostname or bucket can overlap.

### 3.3 Plan before apply

Initialize and validate locally:

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan
```

Read the plan in full. Stop if it proposes changing or destroying resources you did not intentionally put under Terraform. New infrastructure normally shows only `create`; existing infrastructure must be [imported first](#7-import-existing-infrastructure).

Only after reviewing the plan:

```bash
terraform apply
terraform plan  # expected after a successful apply: No changes
terraform output -json > outputs.json
cd ..
npm run infra:sync
ALLOW_PLACEHOLDER_CSP=1 npm run build
```

`infra:sync` writes account-specific values into the repository's tracked `wrangler.json`. In a real fork, review and commit that file. In the public template's smoke test, never commit the generated values; restore the placeholder version after verification.

### 3.4 Existing infrastructure is an import, not a new apply

If buckets, Access applications or public domains already exist, `terraform.tfvars` must describe those exact resources. Do not apply a plan that proposes duplicates. Complete the imports in [section 7](#7-import-existing-infrastructure), then require `terraform plan` to converge before applying.

### 3.5 Isolated smoke test for template maintainers

This path validates the Terraform code against the real Cloudflare API without touching a live portfolio.

> **Live validation status:** the full lifecycle below was verified on 22 September 2026 with Terraform 1.16.3 and Cloudflare provider 5.13.0. It created all eight expected resources, converged to `No changes`, generated `wrangler.json`, passed the production build, destroyed the six directly removable resources, and left no smoke resources in the Cloudflare dashboard. The two `r2.dev` managed-domain wrappers required the documented manual disable and state-removal steps.

1. Use a unique name such as `photo-portfolio-template-smoke-YYYYMMDD`.
2. Set `enable_staging = true` and use two unused subdomains from a zone you control for `prod_hostname` and `staging_hostname`. Do not create DNS records and do not use the live hostname.
3. Leave `custom_photo_domain` and `photo_domain_zone_id` empty; keep `keep_managed_domain` and `enable_turnstile` true.
4. Run `terraform fmt -check`, `terraform validate`, then inspect `terraform plan`.

The expected first plan contains exactly:

- two R2 buckets;
- two R2 managed `r2.dev` domains;
- one reusable Access policy;
- two Access applications;
- one Turnstile widget;
- `8 to add, 0 to change, 0 to destroy`.

After `terraform apply`, immediately run a second `terraform plan`; it must report `No changes`. Then generate `outputs.json`, run `npm run infra:sync`, inspect `wrangler.json`, and verify the build.

#### Smoke cleanup and the `r2.dev` limitation

Provider v5 warns that `cloudflare_r2_managed_domain` cannot be destroyed through Terraform. Before `terraform destroy`:

1. Cloudflare dashboard → R2 → each smoke bucket → Settings → Public access: disable its `r2.dev` development URL.
2. Remove only the two non-destroyable wrappers from local state:

   ```bash
   terraform state rm cloudflare_r2_managed_domain.prod 'cloudflare_r2_managed_domain.staging[0]'
   ```

3. Run `terraform destroy` and verify that its plan contains only resources whose names use the smoke prefix.
4. Confirm in R2, Zero Trust → Access → Applications, Access policies, and Turnstile that no resource with the smoke prefix remains.
5. Restore the public template's placeholder `wrangler.json`; never commit smoke account values.
6. Delete the generated `infra/outputs.json`. Remove or replace the smoke-test values in `infra/terraform.tfvars`; leaving them there makes the next `terraform plan` propose recreating the disposable infrastructure.
7. Remove the API token from the current shell with `unset CLOUDFLARE_API_TOKEN` when the Terraform session is finished.

The buckets must remain empty. Terraform refuses to delete a non-empty R2 bucket.

## 4. Optional second environment

See [the staging guide](staging.md) for the optional environment and its two-step hostname setup.

## 5. Manual path — Creating resources from Cloudflare dashboard

### R2 Buckets

1. Cloudflare dashboard → **R2 → Create Bucket**
2. Name: `{project_name}` (e.g. `mario-portfolio`)
3. Replica region: no (optional, only for geographic redundancy)
4. Create

### R2 managed domains (r2.dev)

1. Dashboard → **R2 → select prod bucket → Settings → Public access → Edit**
2. Enable public access
3. Copy the shown domain (format `pub-xxxxxxxx.r2.dev`)

These domains expose photos — they're rate-limited and uncached, suitable only for development. Before production, consider a custom domain (see section 8).

### Access application for `/admin` (custom domain only)

If using a real domain (not `workers.dev`), Cloudflare Access can scope to specific paths. Configure like this:

1. Cloudflare dashboard → **Zero Trust → Access → Applications → Create new application**
2. Select **Self-hosted and private**
3. Name: e.g. `mario-portfolio admin (prod)`
4. **Add public hostname:**
   - Domain: your domain (e.g. `mario.com`)
   - Path: `admin`
   - Repeat to add `/api/admin`
5. Access policies → **Create new policy**:
   - Name: `Just me`
   - Decision: **Allow**
   - Include → **Emails** → your email (e.g. `mario@mario.com`)
6. Identity providers: leave **One-time PIN** (default, needs no setup)
7. Save and create application
8. Copy the **Audience (AUD) Tag** value from the application page

For the optional second environment on `workers.dev`, Access protects the entire subdomain; see the [staging guide](staging.md).

### Zero Trust team domain

The team domain is provided by Cloudflare with your first Zero Trust account — format `{team}.cloudflareaccess.com` (e.g. `mario.cloudflareaccess.com`). You don't create it, it already exists. The Worker uses it to validate JWTs issued by Access — see `ACCESS_TEAM_DOMAIN` in `wrangler.json`.

Find it at: Cloudflare dashboard → **Zero Trust → Settings → Custom domain**. If you don't see it, navigate to **Access → Applications** and find the team domain in the browser URL (`https://{team}.cloudflareaccess.com/...`).

### Turnstile widget

On the Terraform path this widget is created for you. Here you create it by hand — or you skip it, and the form still works: section 9 explains what you give up.

1. Cloudflare dashboard → **Turnstile → Add widget**
2. Name: e.g. `mario-portfolio contact form`
3. **Hostnames:** add the production hostname (e.g. `mario.com`). A hostname that isn't listed fails validation.
4. Widget Mode: **Managed**
5. Create

To add a second hostname later, follow the [staging guide](staging.md).

The widget page then shows two values, and they go to **two different places** — never both into `wrangler.json`:

| Value | Where it goes | Why |
|---|---|---|
| **Site Key** | `wrangler.json`, as `vars.TURNSTILE_SITEKEY` | it ends up in the HTML; it is not a secret |
| **Secret Key** | `npx wrangler versions secret put TURNSTILE_SECRET` on the Worker version being prepared | the Worker validates tokens with it; it must never reach git |

```bash
npx wrangler versions secret put TURNSTILE_SECRET
```

`versions secret put` creates a Worker version without promoting it. Use it while
preparing Turnstile so the secret cannot become active before the public sitekey is
served. The ordinary `secret put` command deploys immediately and is only appropriate
when an immediate production rollout is intentional.

`versions secret put` attaches the value to a new Worker version without promoting it, so
it is not active in production until that version is promoted. Before serving traffic,
verify that every version intended for staging or production contains the
`TURNSTILE_SECRET` binding. A missing binding fails **open**, not closed:
`verifyTurnstile` reads an absent secret as "Turnstile isn't in use here" and accepts
every submission. With the sitekey present but no secret on the target version, the
widget is drawn on the page but nothing validates behind it. Nothing in the UI tells
you. The [staging guide](staging.md) explains the same Worker's version-preview secret
model.

## 6. Git integration — Connect repository

Connect the repository to Cloudflare's Git integration and set `main` as the production
branch. Use `npm test && npm run build` as the build command and `dist` as the output
directory. The production Worker deploys on pushes to `main`. For a second deployment,
see the [staging guide](staging.md).

## 7. Import existing infrastructure

If you've already created buckets, public domains, or Access applications manually for an existing deployment, import them into Terraform rather than recreating them. Use `terraform import`:

```bash
# Import production bucket
terraform import cloudflare_r2_bucket.prod {account_id}/{bucket-name}

# Import production managed domain (find ID on R2 dashboard, "Public access domain ID" field)
terraform import cloudflare_r2_managed_domain.prod {account_id}/{domain-id}

# Import production Access application (copy ID from dashboard Access → Applications → Settings)
terraform import cloudflare_zero_trust_access_application.prod {account_id}/{app-id}

# Import Access policy (copy ID from application page → Access policies)
terraform import cloudflare_zero_trust_access_policy.solo_admin {account_id}/{policy-id}

# Import the Turnstile widget, if you created it by hand (section 5).
# It is identified by its sitekey, and the address needs quoting: the
# resource has a count, so it lives at index 0.
terraform import 'cloudflare_turnstile_widget.contact[0]' {account_id}/{sitekey}
```

For the optional second environment, use the counted import addresses in the
[staging guide](staging.md).

Import the widget rather than letting Terraform create one: without the import, the next `apply` adds a *second* widget with a different sitekey, and the form keeps validating against the old one until you sync `wrangler.json`.

After imports, verify that `terraform plan` proposes no further changes. If it proposes fields you haven't specified in `.tf`, add them to configuration files to make them converge.

If you prefer staying on the manual path without Terraform, you don't need to import — resources are already live and the Worker reads from `wrangler.json`, which you populate manually.

## 8. Custom domain for photos

For production, Cloudflare **strongly recommends** a custom domain for photos instead of `r2.dev`. Why: `r2.dev` is rate-limited (Cloudflare says so), no cache, no WAF. A custom domain (e.g. `img.mario.com`) on a real Cloudflare zone gives you:

- Cloudflare edge cache (images served faster)
- WAF (attack protection)
- Access controls and rate limiting via Firewall Rules

If using Terraform, enable the custom domain by setting `custom_photo_domain` and `photo_domain_zone_id` in `terraform.tfvars`:

```hcl
custom_photo_domain  = "img.mario.com"
photo_domain_zone_id = "your-zone-id"
```

If proceeding manually:

1. Create a CNAME record in your domain DNS (`mario.com`):
   - Host: `img`
   - Target: `mario-portfolio.s.cloudflarestorage.com` (replace `mario-portfolio` with your bucket name)
   - (Cloudflare shows the exact target when you create the custom domain in step 2)
2. Cloudflare dashboard → **R2 → select prod bucket → Settings → Public access → Add custom domain**
3. Type `img.mario.com`
4. Copy the CNAME target shown and complete it in mario.com DNS

### Order procedure: enable custom then disable r2.dev

Once DNS propagates (a few minutes), follow these steps **in exact order**: the order matters, because disabling r2.dev before verifying custom would leave the site without photos.

1. **Verify the custom domain is available** on the Cloudflare zone containing it. On R2 dashboard → select prod bucket → Settings → Public access → you should see the custom domain next to `r2.dev`.

2. **Enable custom domain in Terraform** (if using Terraform) — set `custom_photo_domain` and `photo_domain_zone_id` in `terraform.tfvars`:
   ```hcl
   custom_photo_domain  = "img.mario.com"
   photo_domain_zone_id = "your-zone-id"
   # Still true — verify custom before disabling r2.dev
   keep_managed_domain = true
   ```

   **If using the manual path,** skip this step — the custom already exists from the previous section.

3. **Apply changes** and sync config:
   ```bash
   cd infra
   terraform apply
   cd ..
   terraform -chdir=infra output -json > infra/outputs.json
   npm run infra:sync
   ```
   
   This updates `wrangler.json` and build starts including the custom domain in CSP in `dist/_headers`.

4. **Wait for DNS and verify the custom domain serves photos**, with a terminal test:
   ```bash
   curl -sI https://img.mario.com/sport/photo.webp
   # Expected: HTTP/2 200 (not 404, not 403)
   ```
   
   If you see `404 Not Found`, DNS hasn't propagated yet or Cloudflare doesn't know where the bucket is. Wait and retry.

5. **Deploy and verify social meta tags** (og:image, og:title):
   ```bash
   # Local build to verify og:image uses custom domain
   npm run build
   # If site has hero configured, og:image meta contains custom domain.
   # If hero is empty (template seed), og:image meta doesn't exist (expected).
   grep -o 'og:image[^>]*' dist/index.html
   ```
   
   Share the site URL in chat or use an [Open Graph validator](https://www.opengraphcheck.com/) to verify crawlers see title and image. This step verifies that works.

6. **Only after verifying custom works,** disable the `r2.dev` domain in Terraform:
   ```hcl
   keep_managed_domain = false
   ```
   
   Apply:
   ```bash
   cd infra
   terraform apply
   cd ..
   ```
   
   From now the `r2.dev` domain on the production bucket is no longer reachable. **Warning:** any `r2.dev` URL already shared (on social, email, forums) will stop working.

7. **If you have r2.dev links circulating,** consider postponing step 6 until it's safe to let them die (e.g. after 1-3 months). You can keep it on as long as you want — `keep_managed_domain` allows it.

---

## 9. Contact form: notifications and spam protection

The contact form writes straight to your R2 bucket through the Worker — no third-party service, no extra account. Messages are read in the `/admin` dashboard, next to the albums.

Two things are optional, and both are configured with **secrets, not `vars`**.

> ⚠️ **`wrangler.json` is committed to the repository.** A notification URL can contain a token — a Telegram bot URL certainly does. Putting one in `wrangler.json` publishes it on GitHub. Use `npx wrangler versions secret put` while preparing, which stores the value with Cloudflare and never writes it to a file; the ordinary `npx wrangler secret put` deploys immediately.

### Notification when a message arrives

Without this, messages still arrive and are still readable in the dashboard — you just have to go and look. With it, the Worker attempts a push. A successful form response confirms that R2 stored the message, **not** that the notification arrived.

```bash
npx wrangler versions secret put CONTACT_NOTIFY_URL
```

Run the secret command on the top-level Worker without `--env staging`: secrets do not
belong to a separate Worker created from the Wrangler environment name.

The current Worker sends plain text as the body of a `POST` to that URL. Only an endpoint that accepts that exact payload format is compatible with `CONTACT_NOTIFY_URL`; accepting a `POST` alone is not enough. HTTP 4xx/5xx responses and network errors are recorded in Worker logs as `notification failed: HTTP <status>` or `notification failed: request error`, without the URL or message content. The contact form still reports success because the message has already been saved in R2.

**ntfy.sh — compatible payload, but not a reliable default from Cloudflare Workers**

Pick a topic name, install the [ntfy app](https://ntfy.sh/), subscribe to the topic. Your URL is `https://ntfy.sh/your-topic-name`. The hosted service [rate-limits publishers](https://docs.ntfy.sh/publish/#limitations). A [reported Cloudflare Workers case](https://github.com/binwiederhier/ntfy/issues/1726) describes HTTP 429 at low personal volume, potentially due to shared outbound IPs; that mechanism has not been confirmed for this template. A successful `curl` from your laptop does **not** prove that the Worker can publish. Do not assume a different topic will fix a 429.

> Public ntfy topics are readable by **anyone who guesses the name**. Use something long and random — `portfolio-msg-7f3a9c2b1e`, not `portfolio`. The notification deliberately contains only the sender's name and a link, never the message itself, precisely because this channel may not be private.

**Telegram, Discord and Slack are not configured by this URL alone**

The current plain-text POST is not a ready-to-use integration with these services. Telegram's [`sendMessage`](https://core.telegram.org/bots/api#sendmessage) requires `chat_id` and a non-empty `text` parameter; a raw POST body is not that parameter. [Discord webhooks](https://docs.discord.com/developers/resources/webhook#execute-webhook) require a supported content field; [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) require a JSON payload. Implement and test a provider-specific adapter before using one of these services. Do not paste a bot token or webhook URL into `wrangler.json`.

**Required end-to-end check before relying on notifications**

After setting the secret and uploading a staging version, submit a neutral canary through the **staging form**. Confirm separately that it appears in `/admin` and that the notification arrives in the subscribed app. If it does not, inspect the staging Worker's logs for `notification failed:`. HTTP 429 means the provider rejected the request as rate-limited; `request error` means the request failed before a usable HTTP response. Neither result is repaired by another successful local `curl`. Repeat the canary on production only after staging passes. Keep checking `/admin` while notifications are unverified.

### Turnstile, the spam protection

`/api/contact` is the only route on the site that writes without authentication. The honeypot catches naive bots; Turnstile catches the rest.

Terraform creates it (`enable_turnstile = true`, the default); on the manual path you create it yourself, following the Turnstile subsection of section 5. Either way it produces two values that go to **two different places**:

| Value | Where | Why |
|---|---|---|
| **sitekey** | `wrangler.json`, as `vars.TURNSTILE_SITEKEY` — written by `npm run infra:sync` | it ends up in the HTML; it is not a secret |
| **secret** | `npx wrangler versions secret put TURNSTILE_SECRET` on the Worker version being prepared | the Worker validates tokens with it; it must never reach git |

Take the secret from the Cloudflare dashboard, under Turnstile, on your widget's page.
Production and the staging version URL belong to the same Worker. Configure the secret
bindings on that Worker without `--env staging`, then upload the staging version with:

```bash
npx wrangler versions upload --env staging --name {worker-name} --preview-alias staging
```

`--env staging` selects the `env.staging` bindings, while `--name {worker-name}` forces
the top-level Worker even when `env.staging.name` contains `{project-name}-staging`.
`--preview-alias staging` publishes the version-preview URL alias. Do not omit `--name`
or target `{project-name}-staging`, which would configure a different Worker instead of
the reviewed version preview.

A deliberately separate Wrangler Worker must manage its own secrets; that setup is
outside the verified workflow.

> ⚠️ **Set both, or neither.** A half-configuration breaks in one of two opposite ways.
> With the sitekey but no secret, Turnstile fails **open**: the widget is drawn and
> nothing validates behind it. With the secret but no sitekey, it fails **closed**: the
> client never draws the widget, so it never sends a token, and the Worker rejects every
> submission with `CHALLENGE_FAILED` — the form dies for everyone. Leaving out both is a
> legitimate configuration; the form works and the honeypot still catches naive bots.

Visitors see nothing: the widget is configured `interaction-only`, so it only appears when Cloudflare suspects something. There is no way to restyle it — it lives in an iframe — which is why it is configured to stay out of sight instead.

**If you turn Turnstile off**, the form keeps working and the honeypot keeps catching the simplest bots. But there is no rate limiting: someone determined could fill your bucket with junk messages. Know that you are accepting it.

---

## Manual path flow summary

1. Create the production R2 bucket and its r2.dev managed domain from the dashboard.
2. Create the production Access application (`/admin` + `/api/admin/*`) with Allow policy for your email.
3. Copy team domain + AUD from the dashboard.
4. (Optional) Create the Turnstile widget and set `TURNSTILE_SECRET` for production.
5. Populate `wrangler.json` manually (copy `wrangler.example.json`, fill bucket name, public R2 URL, team domain, AUD, Turnstile sitekey).
6. Connect the repository to Cloudflare and set `main` as the production branch.
7. Push to trigger the first production deploy.
8. If using Terraform later, import existing production resources with `terraform import`.
9. (Optional) Enable a custom domain for photos before going live.

The optional second environment is documented in the [staging guide](staging.md).

Both with Terraform and manually, CSP in `dist/_headers` is generated from `wrangler.json` during build — it's not hardcoded, so it stays correct whichever path you choose.
