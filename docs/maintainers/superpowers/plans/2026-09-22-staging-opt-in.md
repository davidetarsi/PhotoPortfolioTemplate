# Opt-in staging environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production the only default environment while preserving a complete, tested, explicitly enabled staging workflow for maintainers who need deployment-level verification.

**Architecture:** Gate the three staging Cloudflare resources behind one `enable_staging` Terraform variable, emit empty staging outputs when disabled, and make `renderWrangler` treat the three staging outputs as an all-or-none group. Remove staging from distributed Wrangler placeholders and the primary setup path; centralize the optional lifecycle, upgrade warning, and teardown procedure in `docs/staging.md`.

**Tech Stack:** Terraform 1.16.3, Cloudflare provider 5.13.0, Terraform native tests with a mock provider, JavaScript ES modules, Vitest 4, Wrangler configuration, Markdown documentation.

**Spec:** `docs/superpowers/specs/2026-09-22-staging-opt-in-design.md`

## Global Constraints

- `enable_staging` defaults to `false`.
- Disabled staging creates no R2 bucket, no `r2.dev` managed domain, and no Access application.
- `staging_hostname` defaults to `""` and is required operationally only when staging is enabled.
- `cloudflare_turnstile_widget.contact` and its `compact([var.prod_hostname, var.staging_hostname])` expression do not change.
- Existing installations with staging must add `enable_staging = true` before their first plan after this update.
- The three staging outputs are either all populated or all empty; partial values are a configuration error.
- The default `wrangler.json` and `wrangler.example.json` contain no `env.staging` block.
- Enabling staging does not copy production content; the staging bucket starts empty.
- The real Cloudflare smoke test explicitly sets `enable_staging = true` and continues to expect eight created resources.
- Existing Cloudflare dashboard instructions that have not been re-verified are moved verbatim and labeled as requiring live dashboard verification; they are not rewritten from memory.

## Derived Requirement

The spec says users who do not enable staging must never encounter it. Therefore the two distributed Wrangler placeholder files must also lose `env.staging`, even though the document table names only `renderWrangler` and the prose documentation. `renderWrangler` must construct the staging block when the complete staging output group is present, rather than assuming the example already contains that block.

## File Map

- `infra/variables.tf`: declares `enable_staging` and makes `staging_hostname` optional by default.
- `infra/r2.tf`: conditionally creates the staging bucket and managed domain.
- `infra/access.tf`: conditionally creates the staging Access application.
- `infra/outputs.tf`: emits populated or empty staging outputs safely across `count`.
- `infra/tests/staging.tftest.hcl`: proves zero/one staging resource instances and output shape with a mocked provider.
- `src/utils/renderWrangler.js`: validates the staging output group and adds/removes `env.staging`.
- `src/utils/renderWrangler.test.js`: covers enabled, disabled, partial, non-mutating, and Turnstile behavior.
- `wrangler.example.json`, `wrangler.json`: production-only distributed defaults.
- `infra/terraform.tfvars.example`: documents the safe default and the destructive-upgrade warning.
- `docs/staging.md`: single source for the optional staging lifecycle.
- `docs/runbook-cloudflare.md`: production-only primary path plus links to `docs/staging.md`.
- `docs/upgrading.md`: production-first update workflow and existing-staging migration warning.
- `README.md`, `README.it.md`: production-only setup with one optional-staging link.

---

### Task 1: Gate the staging infrastructure in Terraform

**Files:**
- Create: `infra/tests/staging.tftest.hcl`
- Modify: `infra/variables.tf:16-24,67-71`
- Modify: `infra/r2.tf:6-26`
- Modify: `infra/access.tf:32-48`
- Modify: `infra/outputs.tf:9-29`

**Interfaces:**
- Consumes: `enable_staging: bool` and `staging_hostname: string`.
- Produces when disabled: zero instances of the three staging resources and `""` for each staging output.
- Produces when enabled: one instance of each staging resource and the same three non-empty outputs used today.

- [ ] **Step 1: Write the failing native Terraform tests**

Create `infra/tests/staging.tftest.hcl`:

```hcl
mock_provider "cloudflare" {
  mock_resource "cloudflare_r2_managed_domain" {
    defaults = {
      domain = "pub-mock.r2.dev"
    }
  }

  mock_resource "cloudflare_zero_trust_access_application" {
    defaults = {
      aud = "mock-access-aud"
    }
  }

  mock_resource "cloudflare_turnstile_widget" {
    defaults = {
      sitekey = "mock-turnstile-sitekey"
    }
  }
}

variables {
  account_id         = "0123456789abcdef0123456789abcdef"
  project_name       = "test-portfolio"
  access_team_domain = "test.cloudflareaccess.com"
  prod_hostname      = "portfolio.example.com"
  admin_emails       = ["admin@example.com"]
  enable_turnstile   = false
}

run "staging_disabled_by_default" {
  command = plan

  assert {
    condition     = length(cloudflare_r2_bucket.staging) == 0
    error_message = "The staging R2 bucket must not exist by default."
  }

  assert {
    condition     = length(cloudflare_r2_managed_domain.staging) == 0
    error_message = "The staging managed domain must not exist by default."
  }

  assert {
    condition     = length(cloudflare_zero_trust_access_application.staging) == 0
    error_message = "The staging Access application must not exist by default."
  }

  assert {
    condition = (
      output.bucket_staging == "" &&
      output.r2_public_url_staging == "" &&
      output.access_aud_staging == ""
    )
    error_message = "All staging outputs must be empty when staging is disabled."
  }
}

run "staging_enabled_explicitly" {
  command = plan

  variables {
    enable_staging  = true
    staging_hostname = "portfolio-staging.example.workers.dev"
  }

  assert {
    condition = (
      length(cloudflare_r2_bucket.staging) == 1 &&
      length(cloudflare_r2_managed_domain.staging) == 1 &&
      length(cloudflare_zero_trust_access_application.staging) == 1
    )
    error_message = "Explicit staging must create exactly one instance of every staging resource."
  }

  assert {
    condition     = output.bucket_staging == "test-portfolio-staging"
    error_message = "The enabled staging bucket output must use the project suffix."
  }
}
```

- [ ] **Step 2: Run the Terraform test and verify the red state**

Run:

```bash
terraform -chdir=infra test -filter=tests/staging.tftest.hcl
```

Expected: FAIL because `enable_staging` does not exist and the staging resources are not counted collections.

- [ ] **Step 3: Add the flag and optional hostname**

In `infra/variables.tf`, add:

```hcl
variable "enable_staging" {
  type        = bool
  default     = false
  description = "Create the second environment (bucket, managed domain, Access application)."
}
```

Change `staging_hostname` to:

```hcl
variable "staging_hostname" {
  type        = string
  default     = ""
  description = "Staging hostname without a scheme. Required only when enable_staging is true."
}
```

- [ ] **Step 4: Add `count` to the three staging resources**

Use this expression on `cloudflare_r2_bucket.staging`, `cloudflare_r2_managed_domain.staging`, and `cloudflare_zero_trust_access_application.staging`:

```hcl
count = var.enable_staging ? 1 : 0
```

Update the staging managed-domain bucket reference:

```hcl
bucket_name = cloudflare_r2_bucket.staging[0].name
```

Do not add `count` to the shared Access policy: production always needs it.

- [ ] **Step 5: Make all three staging outputs conditional**

Replace the current output values with:

```hcl
output "bucket_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.staging[0].name : ""
}

output "r2_public_url_staging" {
  value = var.enable_staging ? "https://${cloudflare_r2_managed_domain.staging[0].domain}" : ""
}

output "access_aud_staging" {
  value = var.enable_staging ? cloudflare_zero_trust_access_application.staging[0].aud : ""
}
```

- [ ] **Step 6: Format and run the focused Terraform checks**

Run:

```bash
terraform -chdir=infra fmt -recursive
terraform -chdir=infra validate
terraform -chdir=infra test -filter=tests/staging.tftest.hcl
```

Expected: formatting produces no remaining diff on a second `fmt -check`; validation succeeds; both native test runs PASS.

- [ ] **Step 7: Prove Turnstile was not changed**

Run:

```bash
git diff --exit-code HEAD -- infra/turnstile.tf
```

Expected: exit 0 and no output.

- [ ] **Step 8: Commit the Terraform slice**

```bash
git add infra/variables.tf infra/r2.tf infra/access.tf infra/outputs.tf infra/tests/staging.tftest.hcl
git commit -m "feat(infra): make staging opt in"
```

---

### Task 2: Make Wrangler generation support zero or one staging environment

**Files:**
- Modify: `src/utils/renderWrangler.js:1-39`
- Modify: `src/utils/renderWrangler.test.js:1-69`
- Modify: `wrangler.example.json:1-29`
- Modify: `wrangler.json:1-29`
- Verify unchanged behavior: `src/utils/buildHeaders.test.js:1-74`

**Interfaces:**
- Consumes: always-required production output keys plus the optional group `bucket_staging`, `r2_public_url_staging`, `access_aud_staging`.
- Produces: no `env` key when all three staging outputs are empty; a complete `env.staging` when all three are non-empty; an exception naming the three-key invariant for partial input.
- Preserves: `turnstile_sitekey` remains optional and is copied into production and staging when present.

- [ ] **Step 1: Reshape the test fixtures and add failing cases**

Keep the existing production assertions, rename the current full fixture to `OUTPUTS_WITH_STAGING`, and derive:

```js
const OUTPUTS_PROD_ONLY = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
  r2_public_url_prod: 'https://img.mario.com',
  access_aud_prod: 'aud-prod',
  access_team_domain: 'mario.cloudflareaccess.com',
};
```

Also remove the `env` object from the in-test `EXAMPLE` fixture. The enabled test must prove that `renderWrangler` can construct `env.staging` from a production-only example, not merely edit a block that was already present.

Add these tests to `src/utils/renderWrangler.test.js`:

```js
it('removes env entirely when all staging outputs are absent', () => {
  const r = renderWrangler(EXAMPLE, OUTPUTS_PROD_ONLY);
  expect(r).not.toHaveProperty('env');
});

it('builds a complete staging block when all three staging outputs exist', () => {
  const r = renderWrangler(EXAMPLE, OUTPUTS_WITH_STAGING);
  expect(r.env.staging).toEqual({
    name: 'mario-portfolio-staging',
    r2_buckets: [{ binding: 'BUCKET', bucket_name: 'mario-portfolio-staging' }],
    vars: {
      ACCESS_TEAM_DOMAIN: 'mario.cloudflareaccess.com',
      ACCESS_AUD: 'aud-staging',
      R2_PUBLIC_URL: 'https://pub-bbb.r2.dev',
      TURNSTILE_SITEKEY: '',
    },
  });
});

it('rejects a partial staging output group', () => {
  expect(() => renderWrangler(EXAMPLE, {
    ...OUTPUTS_PROD_ONLY,
    bucket_staging: 'mario-portfolio-staging',
  })).toThrow(/bucket_staging, r2_public_url_staging, access_aud_staging/);
});
```

Change the Turnstile-off test so it checks production with `OUTPUTS_PROD_ONLY` and staging with `OUTPUTS_WITH_STAGING` separately.

- [ ] **Step 2: Run the renderer tests and verify the red state**

Run:

```bash
npx vitest run src/utils/renderWrangler.test.js
```

Expected: production-only input fails required-key validation; partial input is not reported as an all-or-none error.

- [ ] **Step 3: Split production and staging validation**

Replace `CHIAVI_RICHIESTE` with:

```js
const REQUIRED_PRODUCTION_KEYS = [
  'project_name',
  'bucket_prod',
  'r2_public_url_prod',
  'access_aud_prod',
  'access_team_domain',
];

const STAGING_KEYS = [
  'bucket_staging',
  'r2_public_url_staging',
  'access_aud_staging',
];
```

Validate production exactly as today. Then count non-empty staging keys:

```js
const stagingValues = STAGING_KEYS.filter(key => outputs[key]);
if (stagingValues.length > 0 && stagingValues.length < STAGING_KEYS.length) {
  throw new Error(`Staging outputs must be all present or all empty: ${STAGING_KEYS.join(', ')}`);
}
```

- [ ] **Step 4: Construct or remove `env.staging`**

After production fields are rendered, use:

```js
if (stagingValues.length === STAGING_KEYS.length) {
  out.env = out.env ?? {};
  out.env.staging = {
    name: `${outputs.project_name}-staging`,
    r2_buckets: [{
      binding: out.r2_buckets[0].binding,
      bucket_name: outputs.bucket_staging,
    }],
    vars: {
      ACCESS_TEAM_DOMAIN: outputs.access_team_domain,
      ACCESS_AUD: outputs.access_aud_staging,
      R2_PUBLIC_URL: outputs.r2_public_url_staging,
      TURNSTILE_SITEKEY: outputs.turnstile_sitekey ?? '',
    },
  };
} else if (out.env) {
  delete out.env.staging;
  if (Object.keys(out.env).length === 0) delete out.env;
}
```

- [ ] **Step 5: Remove staging from the distributed Wrangler defaults**

Delete the complete top-level `env` object from both `wrangler.example.json` and `wrangler.json`. Keep the production `TURNSTILE_SITEKEY` key with an empty value.

- [ ] **Step 6: Run renderer, CSP, and build checks**

Run:

```bash
npx vitest run src/utils/renderWrangler.test.js src/utils/buildHeaders.test.js
ALLOW_PLACEHOLDER_CSP=1 npm run build
```

Expected: renderer and CSP tests PASS; the build succeeds with a production-only `wrangler.json`.

- [ ] **Step 7: Commit the generation slice**

```bash
git add src/utils/renderWrangler.js src/utils/renderWrangler.test.js wrangler.example.json wrangler.json
git commit -m "feat(config): omit staging from default Wrangler output"
```

---

### Task 3: Create the single staging guide and simplify the Cloudflare runbook

**Files:**
- Create: `docs/staging.md`
- Modify: `docs/runbook-cloudflare.md:5-309,464-473`
- Modify: `infra/terraform.tfvars.example:13-31`

**Interfaces:**
- Produces: one complete optional-staging guide linked from the production runbook.
- Preserves: the unverified dashboard procedure by moving it verbatim with an explicit verification label.
- Prevents: accidental staging destruction during upgrades.

- [ ] **Step 1: Add the safe defaults and upgrade warning to `terraform.tfvars.example`**

Place this block before `staging_hostname`:

```hcl
# Staging is optional and disabled by default. If an existing installation
# already has staging resources, set this to true BEFORE the first plan after
# upgrading, or Terraform will propose destroying them.
enable_staging = false

# Required only when enable_staging is true. Leave empty for production-only
# installations; see ../docs/staging.md for the two-step first deployment.
staging_hostname = ""
```

Remove the old non-empty staging placeholder. In the smoke-test comment, say explicitly that maintainers set `enable_staging = true`.

- [ ] **Step 2: Create `docs/staging.md` with the eight required sections**

Use these exact headings, in this order:

```markdown
# Optional staging environment
## 1. What staging is, and what it is not
## 2. Do you need it?
## 3. The staging bucket starts empty
## 4. Enable staging with Terraform
## 5. Enable staging manually
## 6. Add staging to an existing production site
## 7. Upgrade through staging
## 8. Disable staging safely
```

The document must state:

- staging verifies build, deployment, Access login, admin routes, and the contact form;
- it does not mirror production content and does not provide draft/publish semantics;
- local Vite cannot exercise Worker APIs, and local `wrangler dev` cannot satisfy the Cloudflare Access header;
- the bucket begins empty and no production-to-staging copy command is supplied;
- Terraform users set `enable_staging = true` and follow the existing two-step hostname procedure;
- manual users follow the dashboard procedure moved verbatim from runbook sections 4–7;
- when staging is added later, its hostname must be added to the existing Turnstile widget or submissions fail with `CHALLENGE_FAILED`;
- `TURNSTILE_SECRET` is per environment and is set with:

```bash
npx wrangler secret put TURNSTILE_SECRET --env staging
```

- the upgrade flow merges and tests on `staging`, then fast-forwards `main` as currently documented in `docs/upgrading.md`;
- disabling staging requires an empty bucket, manual disabling of its `r2.dev` URL, and state removal before `enable_staging = false`:

```bash
terraform state rm 'cloudflare_r2_managed_domain.staging[0]'
terraform plan
terraform apply
```

Open the moved dashboard instructions with this warning:

> The following Cloudflare dashboard labels were copied from the previously working runbook. Verify them during the next live staging setup before removing this note; do not rewrite them from memory.

- [ ] **Step 3: Make the main runbook production-only**

In `docs/runbook-cloudflare.md`:

- remove `staging_hostname` from the primary variable table;
- move the whole current section 4 to `docs/staging.md` and replace it with one short link;
- remove staging bucket/domain/application instructions from the manual path;
- make the Turnstile manual path production-only and link to staging for the second hostname/secret;
- make Git integration describe `main` only and move its staging branch text verbatim;
- remove the three staging import commands from section 7 and place them in `docs/staging.md`, with counted addresses:

```bash
terraform import 'cloudflare_r2_bucket.staging[0]' {account_id}/{bucket-name}-staging
terraform import 'cloudflare_r2_managed_domain.staging[0]' {account_id}/{domain-id}
terraform import 'cloudflare_zero_trust_access_application.staging[0]' {account_id}/{app-id}
```

- update the smoke-test variables to require `enable_staging = true` and preserve the expected `8 to add, 0 to change, 0 to destroy` count;
- move the section 8 sentence about the staging `r2.dev` domain into `docs/staging.md`, so custom-domain guidance in the primary runbook discusses production only;
- make the final manual-flow summary production-only and add one link to `docs/staging.md`.

- [ ] **Step 4: Verify documentation links and terminology**

Run:

```bash
rg -n "staging" docs/runbook-cloudflare.md
rg -n "^## [1-8]\." docs/staging.md
git diff --check
```

Expected: every remaining runbook staging mention is either the smoke test or a link to `docs/staging.md`; the staging guide has exactly the eight ordered sections; whitespace check passes.

- [ ] **Step 5: Commit the infrastructure documentation slice**

```bash
git add infra/terraform.tfvars.example docs/staging.md docs/runbook-cloudflare.md
git commit -m "docs: move optional staging into one guide"
```

---

### Task 4: Make production-only setup and upgrades the default narrative

**Files:**
- Modify: `README.md:80-108,193-202`
- Modify: `README.it.md:82-110,195-204`
- Modify: `docs/upgrading.md:76-140`

**Interfaces:**
- Produces: a one-environment primary setup/update path.
- Links: optional users to `docs/staging.md` without conditional instructions scattered through the primary docs.
- Protects: existing staging installations with an explicit pre-plan migration warning.

- [ ] **Step 1: Simplify Git integration in both READMEs**

Remove the staging branch bullet and the claim that Cloudflare creates two Workers. State that `main` deploys production. Add one sentence:

> A second, isolated environment is available but disabled by default; enable it only if you need deployment-level checks, following [`docs/staging.md`](docs/staging.md).

Use the equivalent Italian sentence in `README.it.md`.

- [ ] **Step 2: Remove staging assumptions from the update introduction**

At the current README upgrade warning, keep the warning about `wrangler.json` fast-forwards but remove “including how to test an update on staging”. Link `docs/upgrading.md` as the normal production update procedure and mention staging only in the separate optional sentence.

- [ ] **Step 3: Add the mandatory existing-staging migration warning to `docs/upgrading.md`**

At the start of “When an update changes behaviour”, add this warning before any merge/apply instruction:

````markdown
### Existing staging users: preserve it before planning

Staging is now opt-in. If your current Terraform state already contains a staging
bucket, managed domain, or Access application, add this to `infra/terraform.tfvars`
before running the first `terraform plan` after the update:

```hcl
enable_staging = true
```

Without it, the default is `false` and Terraform proposes destroying those three
staging resources. Stop if the plan contains those destroys.
````

- [ ] **Step 4: Make the normal upgrade path production-only**

Replace the current “Test on staging before production” section with a production-only checklist:

```bash
npm test
npm run build
head -2 dist/_headers
```

Require the CSP to contain the real production R2 URL before pushing `main`. Move the current staging merge/fast-forward procedure to `docs/staging.md` and replace it here with one link labeled “Optional: test the deployment on staging”.

- [ ] **Step 5: Verify cross-document navigation**

Run a local Markdown-target check over the changed files:

```bash
node -e "const fs=require('fs'),path=require('path');for(const f of ['README.md','README.it.md','docs/upgrading.md','docs/runbook-cloudflare.md','docs/staging.md']){const s=fs.readFileSync(f,'utf8');for(const m of s.matchAll(/\\[[^\\]]*\\]\\(([^)]+)\\)/g)){const u=m[1].split('#')[0];if(!u||/^(https?:|mailto:)/.test(u))continue;const p=path.resolve(path.dirname(f),decodeURIComponent(u));if(!fs.existsSync(p))throw new Error(f+' -> '+u)}}"
```

Expected: exit 0.

- [ ] **Step 6: Commit the setup and upgrade narrative**

```bash
git add README.md README.it.md docs/upgrading.md
git commit -m "docs: make production the default environment"
```

---

### Task 5: Run the full verification matrix and preserve the live smoke-test contract

**Files:**
- Verify: all files changed in Tasks 1–4
- Modify only if evidence requires it: `docs/staging.md`, `docs/runbook-cloudflare.md`

**Interfaces:**
- Confirms: disabled staging is the tested default.
- Confirms: enabled staging still produces a complete Wrangler environment.
- Preserves: the live smoke test's eight-resource contract without automatically creating Cloudflare resources during ordinary CI.

- [ ] **Step 1: Run all local Terraform checks**

```bash
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
terraform -chdir=infra test
```

Expected: all commands exit 0; native tests cover both flag values.

- [ ] **Step 2: Run all JavaScript tests**

```bash
npm test
```

Expected: all test files and tests PASS with zero failures.

- [ ] **Step 3: Verify the production-only placeholder build**

```bash
test "$(jq -r 'has("env")' wrangler.json)" = "false"
ALLOW_PLACEHOLDER_CSP=1 npm run build
```

Expected: `wrangler.json` has no `env`, and the build succeeds.

- [ ] **Step 4: Verify both renderer modes directly**

```bash
npx vitest run src/utils/renderWrangler.test.js src/utils/buildHeaders.test.js
```

Expected: production-only, complete staging, partial-staging rejection, and CSP-without-staging cases all PASS.

- [ ] **Step 5: Run the final static checks**

```bash
rg -n "enable_staging" infra docs README.md README.it.md
git diff --check
git status --short
```

Expected: the flag appears in Terraform, the example, the staging guide, the upgrade warning, and the smoke-test instructions; whitespace is clean; only intentional files are modified.

- [ ] **Step 6: Preserve the external smoke-test gate**

Do not run a real `terraform apply` automatically. When the maintainer explicitly authorizes the next live smoke test, use isolated names and set:

```hcl
enable_staging  = true
staging_hostname = "tf-smoke-staging-YYYYMMDD.example.com"
```

The reviewed plan must still report:

```text
Plan: 8 to add, 0 to change, 0 to destroy.
```

Then follow the existing runbook's apply, `No changes`, `infra:sync`, build, manual `r2.dev` disable, state removal, destroy, and dashboard-clean verification sequence.

---

## Final Review Gate

- [ ] Every §2 decision in the spec maps to one completed task.
- [ ] `enable_staging` defaults to false and `staging_hostname` no longer prompts production-only users.
- [ ] The three staging resources and outputs are consistently counted/indexed.
- [ ] Turnstile Terraform is byte-for-byte unchanged.
- [ ] `renderWrangler` accepts exactly zero or three staging values and rejects one or two.
- [ ] Distributed Wrangler files contain production only.
- [ ] Existing staging users see the destruction warning before any plan/apply instructions.
- [ ] `docs/staging.md` owns all eight lifecycle sections and states that content is not copied.
- [ ] README, runbook, and upgrade guide describe production as the normal path.
- [ ] Terraform tests, JavaScript tests, production-only build, link checks, and `git diff --check` pass.
