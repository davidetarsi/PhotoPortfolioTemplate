# D — `npm run setup` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** Two commands replace the manual Terraform, outputs and secret steps: `npm run setup` (checks prerequisites, `terraform init` + `apply`, writes `wrangler.json`) and `npm run setup:secrets` (after the first deploy, pipes the Turnstile secret key from Terraform to the Worker without writing it anywhere).

**Architecture:** Two pure helpers in `src/utils/setup.js` (prerequisite check, sensitive-output filter) with tests; two thin scripts in `scripts/`; a sensitive Terraform output `turnstile_secret`. `infra:sync` also drops sensitive outputs, so no generated file ever contains the secret.

**Tech Stack:** Node 22 scripts (`child_process.spawnSync`), Terraform, Vitest 4, Markdown.

**Spec:** `docs/maintainers/roadmap-semplificazione.md`, phase D.

**Not verifiable here:** the scripts against a real Cloudflare account. The pure parts are tested; the maintainer runs `npm run setup` and `npm run setup:secrets` on a test account before merging (recorded in `pending-decisions.md`).

**Base:** branch `feat/simplify-t-safe-html`. Implementation branch: `feat/simplify-d-setup`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- `wrangler.json` is untracked (`?? wrangler.json`): never add or commit it. Never commit `custom/`, `dist/`, `.superpowers/`, `infra/.terraform/`, the lock file or state. Do not run `npm install`. Never run `npm run setup`, `npm run setup:secrets`, `terraform apply` or `plan`: there is no real account here.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: Sensitive Terraform output for the Turnstile secret

**Files:** Modify `infra/outputs.tf`, `infra/tests/staging.tftest.hcl`.

- [ ] **Step 1: Test.** In `infra/tests/staging.tftest.hcl`, inside `run "staging_disabled_by_default"`, add before its closing `}` (one empty line before):

```hcl
  assert {
    condition     = output.turnstile_secret == ""
    error_message = "With Turnstile disabled the secret output must be empty."
  }
```

- [ ] **Step 2: Run to verify failure.** `cd infra && terraform init -backend=false -input=false > /srv/claude/workspaces/qa-audit/tf-init.log 2>&1; echo "init $?"; terraform test 2>&1 | tail -6; cd ..` → `init 0`, test fails (undeclared output).

- [ ] **Step 3: Implement.** In `infra/outputs.tf`, replace the four comment lines directly above `output "turnstile_sitekey" {`:

```hcl
# Solo la sitekey: e' pubblica e finisce nell'HTML. Il secret NON e' un
# output — va messo a mano con `wrangler secret put TURNSTILE_SECRET`,
# perche' outputs.json viene letto da uno script e non deve contenere
# credenziali.
```

with

```hcl
# La sitekey e' pubblica e finisce nell'HTML.
```

and append at the end of the file:

```hcl

# Il secret e' sensibile: `npm run setup:secrets` lo passa al Worker con una pipe,
# senza scriverlo su file. `terraform output -json` lo stampa in chiaro, per questo
# `npm run setup` e `npm run infra:sync` scartano gli output sensibili prima di
# scrivere qualsiasi file. Lo stato di Terraform lo contiene comunque: resta locale.
output "turnstile_secret" {
  value     = var.enable_turnstile ? cloudflare_turnstile_widget.contact[0].secret : ""
  sensitive = true
}
```

- [ ] **Step 4: Run to verify pass.** `cd infra && terraform test 2>&1 | tail -4; terraform fmt -check -recursive && echo fmt-ok; cd ..` → all pass, `fmt-ok`. `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add infra/outputs.tf infra/tests/staging.tftest.hcl
git commit -F - <<'EOF'
feat(infra): sensitive output for the Turnstile secret key

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: Setup helpers, and `infra:sync` drops sensitive outputs

**Files:** Create `src/utils/setup.js`, `src/utils/setup.test.js`; modify `scripts/gen-wrangler.js`.

- [ ] **Step 1: Tests.** Create `src/utils/setup.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { publicOutputs, setupProblems } from './setup.js';

describe('setupProblems', () => {
  const ready = { env: { CLOUDFLARE_API_TOKEN: 't' }, exists: () => true, hasCommand: () => true };

  it('finds nothing when everything is in place', () => {
    expect(setupProblems(ready)).toEqual([]);
  });

  it('names each missing prerequisite with what to do', () => {
    const problems = setupProblems({ env: {}, exists: () => false, hasCommand: () => false });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/Terraform is not installed/);
    expect(problems[1]).toMatch(/CLOUDFLARE_API_TOKEN/);
    expect(problems[2]).toMatch(/cp infra\/terraform\.tfvars\.example infra\/terraform\.tfvars/);
  });
});

describe('publicOutputs', () => {
  it('unwraps terraform output -json and drops sensitive values', () => {
    expect(publicOutputs({
      project_name: { value: 'mario', type: 'string', sensitive: false },
      turnstile_secret: { value: 'shh', type: 'string', sensitive: true },
    })).toEqual({ project_name: 'mario' });
  });

  it('accepts plain values too', () => {
    expect(publicOutputs({ project_name: 'mario' })).toEqual({ project_name: 'mario' });
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/utils/setup.test.js` → FAIL.

- [ ] **Step 3: Implement.** Create `src/utils/setup.js`:

```js
/**
 * What `npm run setup` needs before it runs Terraform. Each problem says how to fix it.
 * @param {{ env: object, exists: (path: string) => boolean, hasCommand: (cmd: string) => boolean }} deps
 * @returns {string[]} Problems; empty when setup can run.
 */
export function setupProblems({ env, exists, hasCommand }) {
  const problems = [];
  if (!hasCommand('terraform')) {
    problems.push('Terraform is not installed: https://developer.hashicorp.com/terraform/install (1.9 or later).');
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    problems.push('CLOUDFLARE_API_TOKEN is not set: export it in this shell, never in a file (docs/runbook-cloudflare.md, section 2).');
  }
  if (!exists('infra/terraform.tfvars')) {
    problems.push('infra/terraform.tfvars is missing: cp infra/terraform.tfvars.example infra/terraform.tfvars, then fill it in.');
  }
  return problems;
}

/**
 * `terraform output -json` wraps each value in { value, type, sensitive }. Unwraps them and
 * drops sensitive outputs, so a secret never reaches a generated file.
 * @param {Record<string, unknown>} raw - Parsed `terraform output -json`.
 * @returns {Record<string, unknown>} Plain values of the non-sensitive outputs.
 */
export function publicOutputs(raw) {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, output]) => !output?.sensitive)
      .map(([name, output]) => [name, output?.value ?? output]),
  );
}
```

In `scripts/gen-wrangler.js`:
- after the line `import { renderWrangler } from '../src/utils/renderWrangler.js';` add `import { publicOutputs } from '../src/utils/setup.js';`
- replace

```js
// `terraform output -json` wraps each value in { value, type, sensitive }.
const grezzi = JSON.parse(readFileSync(OUTPUTS, 'utf8'));
const outputs = Object.fromEntries(
  Object.entries(grezzi).map(([k, v]) => [k, v?.value ?? v]),
);
```

with

```js
// Sensitive outputs (the Turnstile secret) are dropped: they never reach wrangler.json.
const outputs = publicOutputs(JSON.parse(readFileSync(OUTPUTS, 'utf8')));
```

- [ ] **Step 4: Run to verify pass.** `npm test -- src/utils/setup.test.js` → PASS; `npm test` → PASS. `node -e "import('./scripts/gen-wrangler.js').catch(e => { console.error(e.message); process.exit(1) })" 2>&1 | head -2` prints the missing `infra/outputs.json` message (no syntax error).

- [ ] **Step 5: Commit.**

```bash
git add src/utils/setup.js src/utils/setup.test.js scripts/gen-wrangler.js
git commit -F - <<'EOF'
feat(setup): prerequisite check and sensitive-output filter

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: The two scripts

**Files:** Create `scripts/setup.js`, `scripts/setup-secrets.js`; modify `package.json`.

- [ ] **Step 1: `scripts/setup.js`:**

```js
#!/usr/bin/env node
// npm run setup: from infra/terraform.tfvars to a ready wrangler.json in one command.
// Runs terraform init and apply (apply shows the plan and asks for confirmation), then
// writes wrangler.json from the outputs. Secrets never reach a file: see setup:secrets.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { renderWrangler } from '../src/utils/renderWrangler.js';
import { publicOutputs, setupProblems } from '../src/utils/setup.js';

const hasCommand = command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0;
const problems = setupProblems({ env: process.env, exists: existsSync, hasCommand });
if (problems.length > 0) {
  console.error(problems.map(problem => `- ${problem}`).join('\n'));
  process.exit(1);
}

for (const args of [['init', '-input=false'], ['apply']]) {
  const step = spawnSync('terraform', ['-chdir=infra', ...args], { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}

const raw = spawnSync('terraform', ['-chdir=infra', 'output', '-json'], { encoding: 'utf8' });
if (raw.status !== 0) {
  console.error(raw.stderr);
  process.exit(1);
}
const outputs = publicOutputs(JSON.parse(raw.stdout));
const example = JSON.parse(readFileSync('wrangler.example.json', 'utf8'));
writeFileSync('wrangler.json', `${JSON.stringify(renderWrangler(example, outputs), null, 2)}\n`);

console.log(`
wrangler.json is ready. Next:
  1. git add wrangler.json && git commit -m "chore: my Cloudflare configuration" && git push
  2. Connect the repository to Cloudflare (README, step 3) and wait for the first deploy.
  3. npm run setup:secrets`);
```

- [ ] **Step 2: `scripts/setup-secrets.js`:**

```js
#!/usr/bin/env node
// npm run setup:secrets: after the first deploy, gives the Worker the Turnstile secret key
// straight from Terraform, through a pipe: it is never written to a file.
import { spawnSync } from 'node:child_process';

const secret = spawnSync('terraform', ['-chdir=infra', 'output', '-raw', 'turnstile_secret'], { encoding: 'utf8' });
if (secret.status !== 0) {
  console.error(secret.stderr || 'terraform output failed: run npm run setup first.');
  process.exit(1);
}
if (!secret.stdout.trim()) {
  console.log('Turnstile is off (enable_turnstile = false): there is no secret to set.');
  process.exit(0);
}

const put = spawnSync('npx', ['wrangler', 'versions', 'secret', 'put', 'TURNSTILE_SECRET'], {
  input: secret.stdout.trim(),
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (put.status !== 0) process.exit(put.status ?? 1);

console.log(`
TURNSTILE_SECRET is on a new Worker version: promote it from the Worker's Deployments tab, or push a commit.
Optional, a push notification for each new message:
  npx wrangler versions secret put CONTACT_NOTIFY_URL`);
```

- [ ] **Step 3: `package.json`.** Replace the line `    "infra:sync": "node scripts/gen-wrangler.js"` with the three lines:

```json
    "infra:sync": "node scripts/gen-wrangler.js",
    "setup": "node scripts/setup.js",
    "setup:secrets": "node scripts/setup-secrets.js"
```

Check: `node -e "require('./package.json')"` prints nothing; `node --check scripts/setup.js && node --check scripts/setup-secrets.js && echo syntax-ok` → `syntax-ok`. Then, only the prerequisite path (it must stop before Terraform): `env -u CLOUDFLARE_API_TOKEN node scripts/setup.js; echo "exit $?"` → lists the missing token (and, if absent here, the tfvars file) and `exit 1`. Do not run anything else.

- [ ] **Step 4: Commit.** `npm test` → PASS.

```bash
git add scripts/setup.js scripts/setup-secrets.js package.json
git commit -F - <<'EOF'
feat(setup): npm run setup and npm run setup:secrets

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 4: README and runbook use the two commands

**Files:** Modify `README.md`, `README.it.md`, `docs/runbook-cloudflare.md`, `docs/maintainers/pending-decisions.md`.

Block replacements use files prepared by the controller (Appendices A–D); do them with a script.

- [ ] **Step 1: README (EN).** Replace everything from the line `### 1. Create the infrastructure` up to, but not including, the line that starts with `### 2. Commit` with `readme-en-step1.md`. Replace everything from the line `### 5. Set the secrets` up to, but not including, the line that starts `### 6. ` with `readme-en-step5.md`.

- [ ] **Step 2: README (IT).** Same with `### 1. Crea l'infrastruttura` … prefix `### 2. Committa` → `readme-it-step1.md`, and `### 5. Imposta i segreti` … prefix `### 6. ` → `readme-it-step5.md`.

- [ ] **Step 3: Runbook.** In `docs/runbook-cloudflare.md`, directly after the paragraph that starts `` `infra:sync` writes account-specific values into `wrangler.json`. `` (one line), add one empty line and:

```markdown
`npm run setup` runs the same steps in one go — `terraform init`, `terraform apply` (it shows the plan and asks for confirmation), and writing `wrangler.json` — after checking that Terraform, `CLOUDFLARE_API_TOKEN` and `infra/terraform.tfvars` are in place. After the first deploy, `npm run setup:secrets` passes the Turnstile secret key from Terraform to the Worker through a pipe, without writing it to a file. Both commands, and `infra:sync`, drop sensitive outputs before writing anything.
```

- [ ] **Step 4: Decisions list.** In `docs/maintainers/pending-decisions.md`, in the row that starts `| D |`, replace the last cell text `sì/no` with the text: approvata 2026-09-26, branch `feat/simplify-d-setup`, da provare su un account reale. And under `## Da verificare su un account Cloudflare reale` add the line:

```markdown
- **D** (branch `feat/simplify-d-setup`): `npm run setup` su un account di prova crea l'infrastruttura e scrive `wrangler.json`; dopo il primo deploy `npm run setup:secrets` imposta `TURNSTILE_SECRET` (verificare che `wrangler versions secret put` legga il valore dalla pipe).
```

- [ ] **Step 5: Check and commit.** `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md README.it.md docs/runbook-cloudflare.md` → `0 broken`; `npm test` → PASS.

```bash
git add README.md README.it.md docs/runbook-cloudflare.md docs/maintainers/pending-decisions.md
git commit -F - <<'EOF'
docs(readme): npm run setup and setup:secrets replace the manual steps

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

## Appendix A — `readme-en-step1.md`

````markdown
### 1. Create the infrastructure

With Terraform (recommended): copy `infra/terraform.tfvars.example` to `infra/terraform.tfvars` and fill it using the [field-by-field reference](docs/runbook-cloudflare.md#32-variable-reference). Export an API token with the permissions listed in the [Terraform path](docs/runbook-cloudflare.md#3-terraform-path) — in the shell, never in a file — then:

```bash
npm run setup
```

It checks the prerequisites, runs `terraform init` and `terraform apply` — read the plan before you answer `yes` — and writes `wrangler.json`. Terraform creates two R2 buckets — a public one for photos and a private one for contact messages — the Access application that protects `/admin` and `/api/admin`, and the Turnstile widget of the contact form.

Without Terraform, follow the [manual path](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) and fill `wrangler.json` by hand, starting from `wrangler.example.json`.

````

## Appendix B — `readme-en-step5.md`

````markdown
### 5. Set the secrets

After the first deploy, and after `npx wrangler login`:

```bash
npm run setup:secrets                                  # the Turnstile secret key, from Terraform to the Worker
npx wrangler versions secret put CONTACT_NOTIFY_URL    # optional: a push notification for each new message
```

`setup:secrets` passes the key through a pipe: it is never written to a file. Secrets go on a new Worker version without publishing it: promote it from the Worker's **Deployments** tab, or push a commit. Without Terraform, set the key by hand with `npx wrangler versions secret put TURNSTILE_SECRET` (dashboard → **Turnstile → your widget**). If the sitekey is in `wrangler.json` and this secret is missing, the contact form refuses every message on purpose. Notifications and their limits: [runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection).

````

## Appendix C — `readme-it-step1.md`

````markdown
### 1. Crea l'infrastruttura

Con Terraform (consigliato): copia `infra/terraform.tfvars.example` in `infra/terraform.tfvars` e compilalo seguendo il [riferimento campo per campo](docs/runbook-cloudflare.md#32-variable-reference). Esporta un token API con i permessi elencati nel [percorso Terraform](docs/runbook-cloudflare.md#3-terraform-path) — nella shell, mai in un file — poi:

```bash
npm run setup
```

Controlla i prerequisiti, esegue `terraform init` e `terraform apply` — leggi il piano prima di rispondere `yes` — e scrive `wrangler.json`. Terraform crea due bucket R2 — uno pubblico per le foto e uno privato per i messaggi di contatto —, l'applicazione Access che protegge `/admin` e `/api/admin`, e il widget Turnstile del form di contatto.

Senza Terraform, segui il [percorso manuale](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) e compila `wrangler.json` a mano, partendo da `wrangler.example.json`.

````

## Appendix D — `readme-it-step5.md`

````markdown
### 5. Imposta i segreti

Dopo il primo deploy, e dopo `npx wrangler login`:

```bash
npm run setup:secrets                                  # la chiave segreta di Turnstile, da Terraform al Worker
npx wrangler versions secret put CONTACT_NOTIFY_URL    # facoltativo: una notifica push per ogni nuovo messaggio
```

`setup:secrets` passa la chiave con una pipe: non viene mai scritta su un file. I segreti vanno su una nuova versione del Worker senza pubblicarla: promuovila dalla scheda **Deployments** del Worker, oppure fai un push. Senza Terraform, imposta la chiave a mano con `npx wrangler versions secret put TURNSTILE_SECRET` (dashboard → **Turnstile → il tuo widget**). Se la sitekey è in `wrangler.json` e questo segreto manca, il form di contatto rifiuta ogni messaggio, apposta. Notifiche e loro limiti: [runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection).

````
