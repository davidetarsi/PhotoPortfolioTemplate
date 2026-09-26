# S2 — Private bucket for contact messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** Contact messages go to a private R2 bucket that has no public URL, instead of the public photo bucket.

**Architecture:** `BUCKET` keeps photos and site data. A new Worker binding `MESSAGES_BUCKET` points to `${project_name}-messages` (and `-messages-staging` when staging is on), created by Terraform without any managed or custom domain. The contact route and the admin message routes use only `MESSAGES_BUCKET`; without it they fail closed. The `_messages/` key format is unchanged.

**Tech Stack:** Terraform (Cloudflare provider 5.13.0, `terraform test` with mock provider), JavaScript ES modules, Vitest 4.

**Spec:** `docs/maintainers/superpowers/specs/2026-09-25-private-contact-buckets-design.md` (approved direction) and audit finding S2 in `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`. This plan replaces `docs/maintainers/superpowers/plans/2026-09-25-private-contact-buckets-template.md` for the template; the personal-site migration stays out of scope.

**Base:** branch `fix/audit-before-sharing` at `1c29595` (not yet merged into `main`). Implementation branch: `feat/s2-private-messages`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- `wrangler.json` is tracked and identical to `wrangler.example.json` (placeholders): Task 2 changes both identically; nothing else may touch `wrangler.json`. Never commit `custom/`, `dist/`, `.superpowers/`, `infra/.terraform/`, `infra/.terraform.lock.hcl`, `infra/terraform.tfstate*`. Do not run `npm install`.
- Messages never fall back to `BUCKET`. No message content, sender email or credentials in logs.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy, `terraform apply`.

---

### Task 1: Terraform creates the private message buckets

**Files:** Modify `infra/r2.tf`, `infra/outputs.tf`, `infra/tests/staging.tftest.hcl`.

- [ ] **Step 1: Tests.** In `infra/tests/staging.tftest.hcl`, inside `run "staging_disabled_by_default"`, add before its closing `}`:

```hcl
  assert {
    condition     = output.messages_bucket_prod == "test-portfolio-messages" && output.messages_bucket_staging == ""
    error_message = "Production must have a private message bucket; staging must have none by default."
  }

  assert {
    condition     = length(cloudflare_r2_bucket.messages_staging) == 0
    error_message = "The staging message bucket must not exist by default."
  }

  assert {
    condition     = cloudflare_r2_managed_domain.prod.bucket_name == "test-portfolio"
    error_message = "Only the photo bucket may be public: the managed domain must stay on it."
  }
```

and inside `run "staging_enabled_explicitly"`, before its closing `}`:

```hcl
  assert {
    condition     = output.messages_bucket_staging == "test-portfolio-messages-staging"
    error_message = "Enabled staging must have its own private message bucket."
  }
```

- [ ] **Step 2: Run to verify failure.**

```bash
cd infra && terraform init -backend=false -input=false > /srv/claude/workspaces/qa-audit/tf-init.log 2>&1; echo "init $?"; terraform test 2>&1 | tail -15; cd ..
```

Expected: `init 0`, then the test fails (unknown output/resource `messages_…`). If `init` fails (for example no network to download the provider), STOP and report the last lines of the log.

- [ ] **Step 3: Implement.** Append to `infra/r2.tf`:

```hcl

# Messaggi del form di contatto: bucket privato, senza dominio r2.dev né custom.
# Solo il Worker li legge, tramite il binding MESSAGES_BUCKET.
resource "cloudflare_r2_bucket" "messages_prod" {
  account_id = var.account_id
  name       = "${var.project_name}-messages"
}

resource "cloudflare_r2_bucket" "messages_staging" {
  count      = var.enable_staging ? 1 : 0
  account_id = var.account_id
  name       = "${var.project_name}-messages-staging"
}
```

In `infra/outputs.tf`, directly after the `output "bucket_staging"` block, add:

```hcl

# Bucket privati dei messaggi: solo il nome, per il binding del Worker. Nessun URL pubblico.
output "messages_bucket_prod" {
  value = cloudflare_r2_bucket.messages_prod.name
}

output "messages_bucket_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.messages_staging[0].name : ""
}
```

- [ ] **Step 4: Run to verify pass.** `cd infra && terraform test 2>&1 | tail -5; terraform fmt -check -recursive && echo fmt-ok; cd ..` → all runs pass, `fmt-ok`.

- [ ] **Step 5: Commit.**

```bash
git add infra/r2.tf infra/outputs.tf infra/tests/staging.tftest.hcl
git status --short
git commit -F - <<'EOF'
feat(infra): private R2 buckets for contact messages

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

(`git status --short` may show `infra/.terraform/` or the lock file as untracked only if they are not ignored; they are ignored by `infra/.gitignore`, so it must show nothing else besides what was staged.)

---

### Task 2: `wrangler.json` gets the `MESSAGES_BUCKET` binding

**Files:** Modify `src/utils/renderWrangler.js`, `src/utils/renderWrangler.test.js`, `wrangler.example.json`, `wrangler.json`.

- [ ] **Step 1: Tests.** In `src/utils/renderWrangler.test.js`:

Replace the three constants at the top of the file — everything from the line `const EXAMPLE = {` up to, but not including, the line `describe('renderWrangler', () => {` — with:

```js
const EXAMPLE = {
  name: 'il-tuo-portfolio',
  main: 'src/worker.js',
  r2_buckets: [
    { binding: 'BUCKET', bucket_name: 'il-tuo-bucket' },
    { binding: 'MESSAGES_BUCKET', bucket_name: 'il-tuo-bucket-messages' },
  ],
  vars: { ACCESS_TEAM_DOMAIN: 'x', ACCESS_AUD: 'y', R2_PUBLIC_URL: 'z' },
};

const OUTPUTS_WITH_STAGING = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
  bucket_staging: 'mario-portfolio-staging',
  messages_bucket_prod: 'mario-portfolio-messages',
  messages_bucket_staging: 'mario-portfolio-messages-staging',
  r2_public_url_prod: 'https://img.mario.com',
  r2_public_url_staging: 'https://pub-bbb.r2.dev',
  access_aud_prod: 'aud-prod',
  access_aud_staging: 'aud-staging',
  access_team_domain: 'mario.cloudflareaccess.com',
};

const OUTPUTS_PROD_ONLY = {
  project_name: 'mario-portfolio',
  bucket_prod: 'mario-portfolio',
  messages_bucket_prod: 'mario-portfolio-messages',
  r2_public_url_prod: 'https://img.mario.com',
  access_aud_prod: 'aud-prod',
  access_team_domain: 'mario.cloudflareaccess.com',
};

```

Replace

```js
      r2_buckets: [{ binding: 'BUCKET', bucket_name: 'mario-portfolio-staging' }],
```

with

```js
      r2_buckets: [
        { binding: 'BUCKET', bucket_name: 'mario-portfolio-staging' },
        { binding: 'MESSAGES_BUCKET', bucket_name: 'mario-portfolio-messages-staging' },
      ],
```

Replace `    })).toThrow(/bucket_staging, r2_public_url_staging, access_aud_staging/);` with `    })).toThrow(/bucket_staging, r2_public_url_staging, access_aud_staging, messages_bucket_staging/);`

Add these tests at the end of the `describe`:

```js
  it('lega i messaggi al bucket privato, separato da quello delle foto', () => {
    const r = renderWrangler(EXAMPLE, OUTPUTS_PROD_ONLY);
    expect(r.r2_buckets).toEqual([
      { binding: 'BUCKET', bucket_name: 'mario-portfolio' },
      { binding: 'MESSAGES_BUCKET', bucket_name: 'mario-portfolio-messages' },
    ]);
  });

  it('fallisce se manca il bucket dei messaggi negli output', () => {
    const { messages_bucket_prod: _, ...senza } = OUTPUTS_PROD_ONLY;
    expect(() => renderWrangler(EXAMPLE, senza)).toThrow(/messages_bucket_prod/);
  });

  it('fallisce se wrangler.example.json non dichiara i due binding', () => {
    const vecchio = { ...EXAMPLE, r2_buckets: [{ binding: 'BUCKET', bucket_name: 'x' }] };
    expect(() => renderWrangler(vecchio, OUTPUTS_PROD_ONLY)).toThrow(/MESSAGES_BUCKET/);
  });
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/utils/renderWrangler.test.js` → FAIL.

- [ ] **Step 3: Implement** in `src/utils/renderWrangler.js`:

In `REQUIRED_PRODUCTION_KEYS`, after `  'bucket_prod',` add `  'messages_bucket_prod',`. In `STAGING_KEYS`, after `  'access_aud_staging',` add `  'messages_bucket_staging',`.

Replace `  out.r2_buckets[0].bucket_name = outputs.bucket_prod;` with:

```js
  const photos = out.r2_buckets?.find(b => b.binding === 'BUCKET');
  const messages = out.r2_buckets?.find(b => b.binding === 'MESSAGES_BUCKET');
  if (!photos || !messages) {
    throw new Error('wrangler.example.json: r2_buckets must declare both BUCKET and MESSAGES_BUCKET.');
  }
  photos.bucket_name = outputs.bucket_prod;
  messages.bucket_name = outputs.messages_bucket_prod;
```

Replace

```js
      r2_buckets: [{
        binding: out.r2_buckets[0].binding,
        bucket_name: outputs.bucket_staging,
      }],
```

with

```js
      r2_buckets: [
        { binding: 'BUCKET', bucket_name: outputs.bucket_staging },
        { binding: 'MESSAGES_BUCKET', bucket_name: outputs.messages_bucket_staging },
      ],
```

In both `wrangler.example.json` and `wrangler.json`, replace

```json
    { "binding": "BUCKET", "bucket_name": "il-tuo-bucket" }
```

with

```json
    { "binding": "BUCKET", "bucket_name": "il-tuo-bucket" },
    { "binding": "MESSAGES_BUCKET", "bucket_name": "il-tuo-bucket-messages" }
```

Check: `node -e "JSON.parse(require('fs').readFileSync('wrangler.json'));JSON.parse(require('fs').readFileSync('wrangler.example.json'))" && cmp wrangler.json wrangler.example.json && echo same`.

- [ ] **Step 4: Run to verify pass.** `npm test -- src/utils/renderWrangler.test.js` → PASS; `npm test` → PASS; `ALLOW_PLACEHOLDER_CSP=1 npx vite build > /srv/claude/workspaces/qa-audit/build-s2.log 2>&1; echo $?` → `0`.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/renderWrangler.js src/utils/renderWrangler.test.js wrangler.example.json wrangler.json
git commit -F - <<'EOF'
feat(config): MESSAGES_BUCKET binding for the private message bucket

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: Contact and admin message routes use only the private bucket

**Files:** Modify `src/worker/contact-routes.js`, `src/worker/contact-routes.test.js`, `src/worker/admin-routes.js`, `src/worker/admin-routes.test.js`.

- [ ] **Step 1: Contact tests.** In `src/worker/contact-routes.test.js`:

Replace `const makeEnv = (over = {}) => ({ BUCKET: makeFakeBucket(), ...over });` with:

```js
// BUCKET is the public photo bucket: present so tests can prove messages never land there.
const makeEnv = (over = {}) => ({ BUCKET: makeFakeBucket(), MESSAGES_BUCKET: makeFakeBucket(), ...over });
```

Then replace every `env.BUCKET.store` in the file with `env.MESSAGES_BUCKET.store`:

```bash
sed -i 's/env\.BUCKET\.store/env.MESSAGES_BUCKET.store/g' src/worker/contact-routes.test.js
```

and add these tests inside `describe('handleContactRequest', …)`, after the first test:

```js
  it('non scrive mai i messaggi nel bucket pubblico delle foto', async () => {
    const env = makeEnv();
    await post(env, VALIDO);
    expect(env.BUCKET.store.size).toBe(0);
    expect(env.MESSAGES_BUCKET.store.size).toBe(1);
  });

  it('senza bucket privato rifiuta con 500, senza ripiegare su quello pubblico', async () => {
    const env = makeEnv({ MESSAGES_BUCKET: undefined });
    const res = await post(env, VALIDO);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_UNAVAILABLE' });
    expect(env.BUCKET.store.size).toBe(0);
  });

  it('se la scrittura fallisce risponde 500 senza notificare', async () => {
    const env = makeEnv();
    env.MESSAGES_BUCKET.put = async () => { throw new Error('R2 down'); };
    const deps = makeDeps();
    const res = await post(env, VALIDO, deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_ERROR' });
    expect(deps.notify).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Admin tests.** In `src/worker/admin-routes.test.js`:

Replace `const makeEnv = (initial = {}) => ({ ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(initial) });` with:

```js
const makeEnv = (initial = {}, messages = {}) => ({
  ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(initial), MESSAGES_BUCKET: makeFakeBucket(messages),
});
```

Replace the whole `describe('messaggi', () => { … });` block (from the line `describe('messaggi', () => {` to its closing `});`, the last lines of the file's message section) with:

```js
describe('messaggi', () => {
  const M1 = { name: 'Mario', email: 'm@e.it', message: 'Primo', receivedAt: 1000 };
  const M2 = { name: 'Lucia', email: 'l@e.it', message: 'Secondo', receivedAt: 2000 };

  it('elenca i messaggi del bucket privato, dal piu recente', async () => {
    const env = makeEnv({}, {
      '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1,
      '_messages/2026-02-01T00-00-00-000Z-bbb.json': M2,
    });
    const res = await call(env, 'GET', '/api/admin/messages');
    expect(res.status).toBe(200);
    const { messages } = await res.json();
    expect(messages.map(m => m.name)).toEqual(['Lucia', 'Mario']);
    expect(messages[0].id).toBe('2026-02-01T00-00-00-000Z-bbb');
  });

  it('non legge i vecchi messaggi rimasti nel bucket pubblico', async () => {
    const env = makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const { messages } = await (await call(env, 'GET', '/api/admin/messages')).json();
    expect(messages).toEqual([]);
  });

  it('elenco vuoto quando non ce ne sono', async () => {
    const res = await call(makeEnv(), 'GET', '/api/admin/messages');
    expect((await res.json()).messages).toEqual([]);
  });

  it('non tira dentro oggetti che non sono messaggi', async () => {
    const env = makeEnv({}, { 'altro/x.json': SITE, '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const { messages } = await (await call(env, 'GET', '/api/admin/messages')).json();
    expect(messages).toHaveLength(1);
  });

  it('cancella un messaggio dal bucket privato', async () => {
    const env = makeEnv({}, { '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const res = await call(env, 'DELETE', '/api/admin/messages/2026-01-01T00-00-00-000Z-aaa');
    expect(res.status).toBe(200);
    expect(env.MESSAGES_BUCKET.store.size).toBe(0);
  });

  it('un id con una barra non puo uscire da _messages/', async () => {
    const env = makeEnv({}, { 'altro/x.json': SITE });
    const res = await call(env, 'DELETE', '/api/admin/messages/..%2Faltro%2Fx.json');
    expect(res.status).toBe(400);
    expect(env.MESSAGES_BUCKET.store.has('altro/x.json')).toBe(true);
  });

  it('senza bucket privato risponde 500, senza leggere quello pubblico', async () => {
    const env = { ...makeEnv({ '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 }), MESSAGES_BUCKET: undefined };
    const res = await call(env, 'GET', '/api/admin/messages');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'STORAGE_UNAVAILABLE' });
  });

  it('senza token di Access non si elencano i messaggi', async () => {
    const env = makeEnv({}, { '_messages/2026-01-01T00-00-00-000Z-aaa.json': M1 });
    const res = await handleAdminRequest(
      new Request('https://x.dev/api/admin/messages', { method: 'GET' }), env, deps);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run to verify failure.** `npm test -- src/worker/contact-routes.test.js src/worker/admin-routes.test.js` → FAIL (messages still written to and read from `BUCKET`).

- [ ] **Step 4: Implement the contact route.** In `src/worker/contact-routes.js`, replace

```js
  const ts = now();
  const messaggio = buildMessage(data, ts);
  await env.BUCKET.put(messageKey(ts, rand()), JSON.stringify(messaggio), {
    httpMetadata: { contentType: 'application/json' },
  });
```

with

```js
  // Messages are personal data: only the private bucket, never the public photo bucket.
  if (!env.MESSAGES_BUCKET) {
    console.error('contact: MESSAGES_BUCKET binding is missing; refusing submissions.');
    return jsonResponse({ error: 'STORAGE_UNAVAILABLE' }, 500);
  }
  const ts = now();
  const messaggio = buildMessage(data, ts);
  try {
    await env.MESSAGES_BUCKET.put(messageKey(ts, rand()), JSON.stringify(messaggio), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch {
    return jsonResponse({ error: 'STORAGE_ERROR' }, 500);
  }
```

- [ ] **Step 5: Implement the admin routes.** In `src/worker/admin-routes.js`, replace

```js
  if (pathname === '/api/admin/messages' && request.method === 'GET') {
    const { objects } = await env.BUCKET.list({ prefix: MESSAGES_PREFIX });
    const messages = [];
    for (const { key } of objects) {
      const obj = await env.BUCKET.get(key);
```

with

```js
  const isMessageRoute = pathname === '/api/admin/messages' || pathname.startsWith('/api/admin/messages/');
  // Messages live only in the private bucket: never read the public photo bucket for them.
  if (isMessageRoute && !env.MESSAGES_BUCKET) return jsonResponse({ error: 'STORAGE_UNAVAILABLE' }, 500);

  if (pathname === '/api/admin/messages' && request.method === 'GET') {
    const { objects } = await env.MESSAGES_BUCKET.list({ prefix: MESSAGES_PREFIX });
    const messages = [];
    for (const { key } of objects) {
      const obj = await env.MESSAGES_BUCKET.get(key);
```

and replace `    await env.BUCKET.delete(\`${MESSAGES_PREFIX}${id}.json\`);` with `    await env.MESSAGES_BUCKET.delete(\`${MESSAGES_PREFIX}${id}.json\`);`

Confirm no message code still uses `BUCKET`: `grep -n "MESSAGES_PREFIX\|_messages" src/worker/*.js | grep -v test` must show `MESSAGES_BUCKET` on every line that reads, writes or deletes.

- [ ] **Step 6: Run to verify pass.** `npm test -- src/worker/contact-routes.test.js src/worker/admin-routes.test.js` → PASS; `npm test` → PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/worker/contact-routes.js src/worker/contact-routes.test.js src/worker/admin-routes.js src/worker/admin-routes.test.js
git commit -F - <<'EOF'
feat(worker): store and read contact messages only in the private bucket

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 4: Documentation and upgrade note

**Files:** Modify `README.md`, `README.it.md`, `docs/runbook-cloudflare.md`, `docs/upgrading.md`, `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`.

- [ ] **Step 1: READMEs.** In `README.md` replace `It creates the R2 bucket, the Access application that protects` with `It creates two R2 buckets — a public one for photos and a private one for contact messages — the Access application that protects`. In `README.it.md` replace `Crea il bucket R2, l'applicazione Access che protegge` with `Crea due bucket R2 — uno pubblico per le foto e uno privato per i messaggi di contatto —, l'applicazione Access che protegge`.

- [ ] **Step 2: Runbook, manual path.** In `docs/runbook-cloudflare.md` replace

```
1. Cloudflare dashboard → **R2 → Create Bucket**
2. Name: `{project_name}` (e.g. `mario-portfolio`)
3. Replica region: no (optional, only for geographic redundancy)
4. Create
```

with

```
1. Cloudflare dashboard → **R2 → Create Bucket**
2. Name: `{project_name}` (e.g. `mario-portfolio`)
3. Replica region: no (optional, only for geographic redundancy)
4. Create
5. Create a second bucket named `{project_name}-messages` (e.g. `mario-portfolio-messages`) for contact messages. **Do not enable public access on it**: only the Worker reads it, through the `MESSAGES_BUCKET` binding.
```

and replace `1. Create the production R2 bucket and its r2.dev managed domain from the dashboard.` with `1. Create the production R2 bucket and its r2.dev managed domain from the dashboard, plus the private `{project_name}-messages` bucket without public access.` and replace `fill bucket name, public R2 URL,` with `fill both bucket names (photos and messages), public R2 URL,`.

- [ ] **Step 3: Upgrade note.** In `docs/upgrading.md`, directly before the line `## If it goes wrong`, add (one empty line before and after):

```markdown
### Private message bucket (2026-09-26)

Contact messages now go to a private bucket, `<project_name>-messages`, with no public URL. Before updating, read the messages you want to keep in the dashboard: after the update the dashboard reads only the new bucket, and the old ones stay in the photo bucket under `_messages/`, where you can delete them from the R2 dashboard. Then:

1. With Terraform: `terraform -chdir=infra plan` must show only the new bucket (two with staging), then apply, `terraform -chdir=infra output -json > infra/outputs.json` and `npm run infra:sync`. By hand: create the bucket without public access and add `{ "binding": "MESSAGES_BUCKET", "bucket_name": "<project_name>-messages" }` to `r2_buckets` in `wrangler.json`.
2. Commit `wrangler.json` and deploy. Without the binding, the contact form answers `500 STORAGE_UNAVAILABLE` on purpose instead of writing to the public bucket.
```

- [ ] **Step 4: Audit status.** In `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`, replace `Restano aperti: S2 (bucket privato per i messaggi; esiste già il piano `docs/maintainers/superpowers/plans/2026-09-25-private-contact-buckets-template.md`, da riprendere), S4` with `S2 corretto sul branch `feat/s2-private-messages` (piano `docs/maintainers/superpowers/plans/2026-09-26-s2-private-messages-bucket.md`). Restano aperti: S4`.

- [ ] **Step 5: Check and commit.** `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md README.it.md docs/runbook-cloudflare.md docs/upgrading.md` → `0 broken`; `npm test` → PASS.

```bash
git add README.md README.it.md docs/runbook-cloudflare.md docs/upgrading.md docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md
git commit -F - <<'EOF'
docs: private message bucket in setup, runbook and upgrade note

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```
