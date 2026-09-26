# Private Contact Buckets in the Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh PhotoPortfolioTemplate installation store contact messages in private R2 buckets while keeping photo buckets public.

**Architecture:** Keep `BUCKET` for photos and site data. Add `MESSAGES_BUCKET` for contact/admin message operations; Terraform creates one private message bucket per enabled environment and Wrangler binds it. Missing private storage fails closed. This plan changes the generic template only; Davide's already-live personal site is a separate downstream migration requiring a fresh inventory and its own plan.

**Tech Stack:** JavaScript ESM, Vitest, Cloudflare Workers/Wrangler, Cloudflare R2, Terraform Cloudflare provider v5.

**Spec:** [2026-09-25-private-contact-buckets-design.md](../specs/2026-09-25-private-contact-buckets-design.md)

## Global Constraints

- With `enable_staging = false`, create exactly two R2 buckets: `${project_name}` and `${project_name}-messages`.
- With `enable_staging = true`, create exactly four R2 buckets, additionally `${project_name}-staging` and `${project_name}-messages-staging`.
- No `cloudflare_r2_managed_domain` or `cloudflare_r2_custom_domain` may target a message bucket; never output a public message URL.
- Keep existing public photo URLs, `BUCKET` binding and `_messages/` key format unchanged.
- Missing or failing `MESSAGES_BUCKET` must never fall back to `BUCKET`, notify, or acknowledge a real message as stored.
- Do not use real contact-message payloads in tests or logs. Do not apply Terraform to Davide's live account in this plan.
- Keep the production photo custom-domain choice open; document that `r2.dev` is for development, without changing the current photo-domain resources.
- Work from the clean template worktree after checking Git status. Do not edit the dirty personal-site worktrees as part of this plan.

## Review Focus

1. Missing `MESSAGES_BUCKET` on a valid POST: `503 STORAGE_ERROR`, no write to `BUCKET`, no notification (Task 3 test).
2. R2 write/list/delete failure: clean 5xx JSON, not a success or leaked exception; photo/site-data APIs still work (Tasks 3–4 tests).
3. Production message output missing or staging outputs partially present: Wrangler generation throws a named error (Task 2 tests).
4. `project_name` too long, too short, or ending in `-`: Terraform rejects it before creating an invalid `${project_name}-messages-staging` bucket (Task 1 tests).
5. More than 1,000 private messages or a crafted message ID: admin listing is complete and deletion cannot touch `BUCKET` (Task 4 tests).

## File map

- `infra/r2.tf`: own only R2 bucket/domain resources; add private bucket resources here.
- `infra/outputs.tf` and `infra/variables.tf`: expose private bucket names and validate names for every derived bucket.
- `infra/tests/staging.tftest.hcl`: assert two/four buckets and public-domain isolation.
- `wrangler.example.json` and `src/utils/renderWrangler.js`: declare and fill `MESSAGES_BUCKET` in production and optional staging.
- `src/utils/renderWrangler.test.js`: pin complete, missing and partial output behavior.
- `src/worker/contact-routes.js` and its test: write valid messages only to private storage and fail closed.
- `src/worker/admin-routes.js` and its test: private list/read/delete, pagination, JWT gate and storage failures.
- `README.md`, `README.it.md`, `docs/runbook-cloudflare.md`, `docs/staging.md`, `docs/upgrading.md`, `docs/maintainers/azioni-manuali.md`, `infra/terraform.tfvars.example`: user-facing setup and upgrade paths. README remains the entry point.

---

### Task 1: Terraform creates private message buckets

**Files:**
- Modify: `infra/tests/staging.tftest.hcl`
- Modify: `infra/r2.tf`
- Modify: `infra/outputs.tf`
- Modify: `infra/variables.tf`

**Interfaces:**
- Consumes: existing `var.project_name`, `var.account_id`, `var.enable_staging`.
- Produces: Terraform outputs `bucket_messages_prod: string` and `bucket_messages_staging: string` (`""` when staging is disabled).

- [ ] **Step 1: Write failing Terraform assertions.** Extend the two runs in `infra/tests/staging.tftest.hcl` with these conditions, and add the invalid-name run:

```hcl
# In staging_disabled_by_default:
assert {
  condition = (
    cloudflare_r2_bucket.messages_prod.name == "test-portfolio-messages" &&
    length(cloudflare_r2_bucket.messages_staging) == 0 &&
    output.bucket_messages_prod == "test-portfolio-messages" &&
    output.bucket_messages_staging == ""
  )
  error_message = "Production needs one private message bucket; staging needs none."
}

# In staging_enabled_explicitly:
assert {
  condition = (
    length(cloudflare_r2_bucket.messages_staging) == 1 &&
    output.bucket_messages_staging == "test-portfolio-messages-staging" &&
    cloudflare_r2_managed_domain.prod.bucket_name == cloudflare_r2_bucket.prod.name &&
    cloudflare_r2_managed_domain.staging[0].bucket_name == cloudflare_r2_bucket.staging[0].name
  )
  error_message = "Staging needs its private message bucket; public domains stay on photos."
}

run "reject_overlong_project_name" {
  command = plan
  variables { project_name = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstu" }
  expect_failures = [var.project_name]
}
```

- [ ] **Step 2: Confirm red.** Run `terraform -chdir=infra init -backend=false` if the provider is not installed, then `terraform -chdir=infra test`. Expected: failure because `messages_prod`, `messages_staging` and the new outputs do not exist. Do not supply live `terraform.tfvars` or apply.

- [ ] **Step 3: Add minimal resources and outputs.** Add only R2 bucket resources (no domain resource) to `infra/r2.tf`, and name outputs in `infra/outputs.tf`:

```hcl
resource "cloudflare_r2_bucket" "messages_prod" {
  account_id = var.account_id
  name       = "${var.project_name}-messages"
}

resource "cloudflare_r2_bucket" "messages_staging" {
  count      = var.enable_staging ? 1 : 0
  account_id = var.account_id
  name       = "${var.project_name}-messages-staging"
}

output "bucket_messages_prod" {
  value = cloudflare_r2_bucket.messages_prod.name
}

output "bucket_messages_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.messages_staging[0].name : ""
}
```

In `infra/variables.tf`, replace the `project_name` validation condition with `length(var.project_name) >= 3 && length(var.project_name) <= 46 && can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.project_name))`. The 46-character ceiling leaves room for `-messages-staging` within R2's 63-character bucket-name limit. Update the validation error text accordingly.

- [ ] **Step 4: Verify green.** Run `terraform -chdir=infra fmt -check`, `terraform -chdir=infra validate`, and `terraform -chdir=infra test`. Expected: all pass; test output shows no live resource changes.

- [ ] **Step 5: Commit this independently testable Terraform change.** `git add infra/r2.tf infra/outputs.tf infra/variables.tf infra/tests/staging.tftest.hcl` then `git commit -m "feat: provision private contact buckets"`.

### Task 2: Generate both Worker bindings

**Files:**
- Modify: `wrangler.example.json`
- Modify: `src/utils/renderWrangler.js`
- Modify: `src/utils/renderWrangler.test.js`

**Interfaces:**
- Consumes: Task 1 outputs `bucket_messages_prod` and `bucket_messages_staging`.
- Produces: `renderWrangler(example, outputs): object` with `BUCKET` and `MESSAGES_BUCKET` in each enabled environment.

- [ ] **Step 1: Write failing Vitest cases.** Give the `EXAMPLE` fixture two bindings and add message outputs to both output fixtures. Extend the existing production/staging equality assertions, and add these cases:

```js
it('requires a private production bucket output', () => {
  const { bucket_messages_prod, ...missing } = OUTPUTS_PROD_ONLY;
  expect(() => renderWrangler(EXAMPLE, missing)).toThrow(/bucket_messages_prod/);
});

it('rejects staging without its private bucket output', () => {
  const { bucket_messages_staging, ...partial } = OUTPUTS_WITH_STAGING;
  expect(() => renderWrangler(EXAMPLE, partial)).toThrow(/bucket_messages_staging/);
});

it('binds photos and messages separately', () => {
  const r = renderWrangler(EXAMPLE, OUTPUTS_WITH_STAGING);
  expect(r.r2_buckets).toEqual([
    { binding: 'BUCKET', bucket_name: 'mario-portfolio' },
    { binding: 'MESSAGES_BUCKET', bucket_name: 'mario-portfolio-messages' },
  ]);
  expect(r.env.staging.r2_buckets[1]).toEqual({
    binding: 'MESSAGES_BUCKET', bucket_name: 'mario-portfolio-messages-staging',
  });
});
```

- [ ] **Step 2: Confirm red.** Run `npm test -- src/utils/renderWrangler.test.js`. Expected: new output/binding tests fail.

- [ ] **Step 3: Add the second example binding and render it.** In `wrangler.example.json`, set `r2_buckets` to `BUCKET` plus `{ "binding": "MESSAGES_BUCKET", "bucket_name": "il-tuo-bucket-messages" }`. Add `bucket_messages_prod` to `REQUIRED_PRODUCTION_KEYS` and `bucket_messages_staging` to `STAGING_KEYS`. After cloning, require both named example bindings and set their names. Build the staging array explicitly:

```js
const photoBinding = out.r2_buckets.find(b => b.binding === 'BUCKET');
const messageBinding = out.r2_buckets.find(b => b.binding === 'MESSAGES_BUCKET');
if (!photoBinding || !messageBinding) throw new Error('Example needs BUCKET and MESSAGES_BUCKET bindings');
photoBinding.bucket_name = outputs.bucket_prod;
messageBinding.bucket_name = outputs.bucket_messages_prod;

// Inside the enabled-staging branch:
r2_buckets: [
  { binding: 'BUCKET', bucket_name: outputs.bucket_staging },
  { binding: 'MESSAGES_BUCKET', bucket_name: outputs.bucket_messages_staging },
],
```

Remove the old `out.r2_buckets[0]` mutation and its use as the staging binding source. Update existing fixtures/equality tests for the four-key staging group. Preserve non-infrastructure fields and non-mutation behavior.

- [ ] **Step 4: Verify green.** Run `npm test -- src/utils/renderWrangler.test.js`, then `npm test`. Expected: all pass; no generated `wrangler.json` is written by the unit test.

- [ ] **Step 5: Commit.** `git add wrangler.example.json src/utils/renderWrangler.js src/utils/renderWrangler.test.js` then `git commit -m "feat: bind private contact storage"`.

### Task 3: Contact submissions write only to private storage

**Files:**
- Modify: `src/worker/contact-routes.js`
- Modify: `src/worker/contact-routes.test.js`

**Interfaces:**
- Consumes: `env.MESSAGES_BUCKET.put(key, value, options): Promise<void>` from Task 2.
- Produces: `handleContactRequest(request, env, deps): Promise<Response>`; success remains `200 {ok:true}`, missing/failing private storage becomes `503 {error:'STORAGE_ERROR'}`.

- [ ] **Step 1: Write failing tests.** Change the test helper to `({ BUCKET: makeFakeBucket(), MESSAGES_BUCKET: makeFakeBucket(), ...over })`, move the successful-message assertions to `MESSAGES_BUCKET`, and pin isolation/failure:

```js
it('never writes a contact message to the public photo bucket', async () => {
  const env = makeEnv();
  const res = await post(env, VALIDO);
  expect(res.status).toBe(200);
  expect(env.BUCKET.store.size).toBe(0);
  expect(env.MESSAGES_BUCKET.store.size).toBe(1);
});

it('fails closed when the private binding is absent', async () => {
  const env = makeEnv({ MESSAGES_BUCKET: undefined });
  const deps = makeDeps();
  const res = await post(env, VALIDO, deps);
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
  expect(env.BUCKET.store.size).toBe(0);
  expect(deps.notify).not.toHaveBeenCalled();
});

it('does not acknowledge or notify when private R2 put fails', async () => {
  const env = makeEnv();
  env.MESSAGES_BUCKET.put = async () => { throw new Error('private R2 down'); };
  const deps = makeDeps();
  expect((await post(env, VALIDO, deps)).status).toBe(503);
  expect(deps.notify).not.toHaveBeenCalled();
  expect(env.BUCKET.store.size).toBe(0);
});
```

- [ ] **Step 2: Confirm red.** Run `npm test -- src/worker/contact-routes.test.js`. Expected: the new isolation/failure tests fail against `env.BUCKET.put`.

- [ ] **Step 3: Make the write fail closed.** Keep validation, honeypot and Turnstile order unchanged. Replace the one R2 write with:

```js
try {
  if (!env.MESSAGES_BUCKET) throw new Error('private bucket binding missing');
  await env.MESSAGES_BUCKET.put(messageKey(ts, rand()), JSON.stringify(messaggio), {
    httpMetadata: { contentType: 'application/json' },
  });
} catch {
  return jsonResponse({ error: 'STORAGE_ERROR' }, 503);
}
```

Update the function's environment JSDoc to `MESSAGES_BUCKET`; do not log the caught error or call `notify` on the failure path. Keep notification failures non-fatal after a successful private write.

- [ ] **Step 4: Verify green.** Run `npm test -- src/worker/contact-routes.test.js` and `npm test`. Expected: all pass, including invalid input/honeypot/Turnstile and notification regressions.

- [ ] **Step 5: Commit.** `git add src/worker/contact-routes.js src/worker/contact-routes.test.js` then `git commit -m "fix: keep contact messages in private R2"`.

### Task 4: Admin message operations use the private bucket

**Files:**
- Modify: `src/worker/admin-routes.js`
- Modify: `src/worker/admin-routes.test.js`

**Interfaces:**
- Consumes: `env.MESSAGES_BUCKET.list/get/delete` from Task 2; `verifyAccessJwt` remains the gate.
- Produces: existing `/api/admin/messages` and `/api/admin/messages/:id` response shapes; `503 {error:'STORAGE_ERROR'}` on absent/failing private storage.

- [ ] **Step 1: Write failing tests.** Replace the test helper with `const makeEnv = (photoInitial = {}, messageInitial = {}) => ({ ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(photoInitial), MESSAGES_BUCKET: makeFakeBucket(messageInitial) });`. Keep site/photo tests on the first argument; change a message fixture such as `makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 })` to `makeEnv({}, { '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 })`. Add tests for private isolation, missing binding, storage errors, >1,000 messages and a crafted ID:

```js
it('never lists or deletes from the public photo bucket', async () => {
  const key = '_messages/2026-01-01T00-00-00-000Z-aaa.json';
  const env = makeEnv();
  await env.BUCKET.put(key, JSON.stringify(M1));
  await env.MESSAGES_BUCKET.put(key, JSON.stringify(M2));
  const listed = await call(env, 'GET', '/api/admin/messages');
  expect((await listed.json()).messages[0].name).toBe('Lucia');
  await call(env, 'DELETE', '/api/admin/messages/2026-01-01T00-00-00-000Z-aaa');
  expect(env.BUCKET.store.has(key)).toBe(true);
  expect(env.MESSAGES_BUCKET.store.has(key)).toBe(false);
});

it('does not drop private messages after the first R2 page', async () => {
  const env = makeEnv();
  for (let i = 0; i < 1203; i++) {
    await env.MESSAGES_BUCKET.put(`_messages/2026-01-01T00-00-00-000Z-${String(i).padStart(4, '0')}.json`, JSON.stringify(M1));
  }
  const res = await call(env, 'GET', '/api/admin/messages');
  expect((await res.json()).messages).toHaveLength(1203);
});

it('fails closed if the private binding is missing', async () => {
  const env = makeEnv();
  delete env.MESSAGES_BUCKET;
  const listed = await call(env, 'GET', '/api/admin/messages');
  const deleted = await call(env, 'DELETE', '/api/admin/messages/2026-01-01T00-00-00-000Z-aaa');
  expect(listed.status).toBe(503);
  expect(deleted.status).toBe(503);
  expect(env.BUCKET.store.size).toBe(0);
});

it('keeps public data untouched for a crafted message ID', async () => {
  const env = makeEnv({ '_site/site.json': SITE });
  const res = await call(env, 'DELETE', '/api/admin/messages/..%2F_site%2Fsite.json');
  expect(res.status).toBe(400);
  expect(env.BUCKET.store.has('_site/site.json')).toBe(true);
});

it('returns a clean error when private listing fails', async () => {
  const env = makeEnv();
  env.MESSAGES_BUCKET.list = async () => { throw new Error('R2 down'); };
  const res = await call(env, 'GET', '/api/admin/messages');
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
});

it('returns a clean error when private deletion fails', async () => {
  const env = makeEnv();
  env.MESSAGES_BUCKET.delete = async () => { throw new Error('R2 down'); };
  const res = await call(env, 'DELETE', '/api/admin/messages/2026-01-01T00-00-00-000Z-aaa');
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
});
```

Retain the existing unauthenticated `401` test.

- [ ] **Step 2: Confirm red.** Run `npm test -- src/worker/admin-routes.test.js`. Expected: message isolation/pagination/failure cases fail.

- [ ] **Step 3: Route message operations to private storage.** Keep photo/site routes on `BUCKET`. In the two message branches only, require `env.MESSAGES_BUCKET`, surround R2 access with `try/catch`, return `jsonResponse({ error: 'STORAGE_ERROR' }, 503)` on failure. Use cursor pagination for the list:

```js
const messages = [];
let cursor;
do {
  const page = await env.MESSAGES_BUCKET.list({ prefix: MESSAGES_PREFIX, cursor, limit: 1000 });
  for (const { key } of page.objects) {
    const obj = await env.MESSAGES_BUCKET.get(key);
    if (obj) messages.push({ id: key.slice(MESSAGES_PREFIX.length, -'.json'.length), ...(await obj.json()) });
  }
  if (page.truncated && !page.cursor) throw new Error('R2 truncated page without cursor');
  cursor = page.truncated ? page.cursor : undefined;
} while (cursor);
messages.sort((a, b) => b.id.localeCompare(a.id));
```

Retain `MESSAGE_ID_RE` before `env.MESSAGES_BUCKET.delete`, and do not include any payload in error logs. The test fake already implements cursor-based listing.

- [ ] **Step 4: Verify green.** Run `npm test -- src/worker/admin-routes.test.js` and `npm test`. Expected: all pass, including photo CRUD and Access JWT tests.

- [ ] **Step 5: Commit.** `git add src/worker/admin-routes.js src/worker/admin-routes.test.js` then `git commit -m "fix: read admin messages from private R2"`.

### Task 5: Explain installation and upgrades from the README

**Files:**
- Modify: `README.md`
- Modify: `README.it.md`
- Modify: `docs/runbook-cloudflare.md`
- Modify: `docs/staging.md`
- Modify: `docs/upgrading.md`
- Modify: `docs/maintainers/azioni-manuali.md`
- Modify: `infra/terraform.tfvars.example`

**Interfaces:**
- Consumes: Tasks 1–4 bucket names, outputs, bindings and `503 STORAGE_ERROR` behavior.
- Produces: one coherent reader path from README to setup, manual setup, opt-in staging and existing-site upgrade; no code interface.

- [ ] **Step 1: Enumerate outdated statements before editing.** Run `rg -n 'one R2|single R2|two R2 buckets|writes? (straight )?to your R2 bucket|messaggi.*bucket|"r2_buckets"|bucket_staging|enable_staging' README.md README.it.md docs infra/terraform.tfvars.example` and inspect each match. Keep the plan's file map as the edit boundary.

- [ ] **Step 2: Update the English README and runbook first.** In the setup section, say exactly: “Production uses one public photo bucket and one private contact-message bucket. Enabling staging adds one of each.” Link directly to `docs/runbook-cloudflare.md`, `docs/staging.md` and `docs/upgrading.md`. Change the example `r2_buckets` array to include `MESSAGES_BUCKET`. In the runbook's Terraform/manual/smoke/contacts sections, name both production buckets, explain that message buckets have no public domains, and update four-bucket smoke expectations when staging is on. The manual path creates a private message bucket without enabling Public Development URL. Link the existing-site migration warning to the new `docs/upgrading.md#contact-message-storage-migration` section.

- [ ] **Step 3: Align the other reader paths.** Mirror the short README setup explanation in `README.it.md`; update its Wrangler example. In `docs/staging.md`, explain the additional private staging bucket, its binding, and that disabling staging must account for *both* staging buckets. Add `## Contact-message storage migration` to `docs/upgrading.md`: require private bucket creation, form maintenance, complete copy/verification, binding/deploy, staging/production canaries and only then old-object deletion; explicitly say the template has no one-command legacy migration yet and refer to the approved design spec for safety gates. Warn existing users not to deploy until they have a migration method and not to apply Terraform to unimported live resources. In `docs/maintainers/azioni-manuali.md`, replace old claims that contact messages live in the photo bucket with a link to the runbook; preserve its historical status/other open decisions. In `infra/terraform.tfvars.example`, annotate the two-versus-four-bucket effect of `enable_staging`.

- [ ] **Step 4: Verify documentation and regressions.** Run `rg -n 'r2_buckets|MESSAGES_BUCKET|bucket_messages|private|public|enable_staging' README.md README.it.md docs/runbook-cloudflare.md docs/staging.md docs/upgrading.md docs/maintainers/azioni-manuali.md infra/terraform.tfvars.example` and check every setup example has both bindings and no public message URL. Run `git diff --check`, `npm test`, `ALLOW_PLACEHOLDER_CSP=1 npm run build` (this worktree's ignored `wrangler.json` has a placeholder photo URL), `terraform -chdir=infra fmt -check`, `terraform -chdir=infra validate`, and `terraform -chdir=infra test`. Expected: all pass; review generated artifacts to ensure no secret/message content is included. Do not run `terraform apply` or deploy.

- [ ] **Step 5: Commit documentation only.** `git add README.md README.it.md docs/runbook-cloudflare.md docs/staging.md docs/upgrading.md docs/maintainers/azioni-manuali.md infra/terraform.tfvars.example` then `git commit -m "docs: explain private contact buckets and upgrade gate"`.

## Completion gate and downstream handoff

Inspect `git diff fd75898..HEAD` and `git status --short --branch`; no unrelated changes should be present. The template is done only when Tasks 1–5, full test/build/Terraform checks and documentation review pass. Do not push, sync to PhotoPortfolio, create live buckets, deploy or remove legacy `_messages/` objects as an implicit next step.

Then create a **separate personal-site migration plan** from a fresh read-only inventory of both live photo buckets and current Git/worktree state. The personal checkout currently has uncommitted diagnostics changes; preserve them. That plan must sequence private-bucket creation, an explicit maintenance response on `/api/contact`, idempotent copy plus per-key verification, staging canary, production canary, final inventory and deletion of only verified legacy message objects. The user must review that plan before live mutations.
