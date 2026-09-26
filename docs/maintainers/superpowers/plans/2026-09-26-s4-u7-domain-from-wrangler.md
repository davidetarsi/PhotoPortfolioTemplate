# S4 + U7 — Domain attached by the deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** `npm run infra:sync` writes the production domain into `wrangler.json`, so the deploy attaches it to the Worker (U7: no manual "attach your domain" step) and, without staging, turns off the duplicate `workers.dev` address (S4).

**Architecture:** Terraform outputs `prod_hostname`; `renderWrangler` adds `routes: [{ pattern, custom_domain: true }]` when the hostname is not a `*.workers.dev` address, plus `workers_dev: false` and `preview_urls: false` only when staging is off (the staging version preview lives on `workers.dev` preview URLs). Old `outputs.json` files without `prod_hostname` keep today's behavior.

**Tech Stack:** Terraform (`terraform test`), JavaScript ES modules, Vitest 4.

**Spec:** audit findings S4 and U7 in `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`; user decision 2026-09-26 (order S2 → S5+S6 → S4+U7).

**Not verifiable here:** a real deploy. Task 3 adds a checklist the user runs on a Cloudflare account before merging: domain attached, `workers.dev` off, staging unaffected, Workers Builds allowed to create the custom domain.

**Base:** branch `feat/s5-s6-hardening`. Implementation branch: `feat/s4-u7-domain`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- Never commit `custom/`, `wrangler.json`, `dist/`, `.superpowers/`, `infra/.terraform/`, `infra/.terraform.lock.hcl`, `infra/terraform.tfstate*`. Do not run `npm install`. No `terraform apply`.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: Terraform outputs the production hostname

**Files:** Modify `infra/outputs.tf`, `infra/tests/staging.tftest.hcl`.

- [ ] **Step 1: Test.** In `infra/tests/staging.tftest.hcl`, inside `run "staging_disabled_by_default"`, add before its closing `}` (one empty line before):

```hcl
  assert {
    condition     = output.prod_hostname == "portfolio.example.com"
    error_message = "The production hostname must be an output, for the Worker route in wrangler.json."
  }
```

- [ ] **Step 2: Run to verify failure.** `cd infra && terraform init -backend=false -input=false > /srv/claude/workspaces/qa-audit/tf-init.log 2>&1; echo "init $?"; terraform test 2>&1 | tail -8; cd ..` → `init 0`, test fails (undeclared output).

- [ ] **Step 3: Implement.** In `infra/outputs.tf`, directly after the `output "project_name"` block, add:

```hcl

# Il dominio di produzione: infra:sync lo scrive in wrangler.json come custom domain
# del Worker, cosi il deploy lo collega da solo.
output "prod_hostname" {
  value = var.prod_hostname
}
```

- [ ] **Step 4: Run to verify pass.** `cd infra && terraform test 2>&1 | tail -4; terraform fmt -check -recursive && echo fmt-ok; cd ..` → all pass, `fmt-ok`. Then `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add infra/outputs.tf infra/tests/staging.tftest.hcl
git commit -F - <<'EOF'
feat(infra): output the production hostname

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: `renderWrangler` attaches the domain and turns off `workers.dev`

**Files:** Modify `src/utils/renderWrangler.js`, `src/utils/renderWrangler.test.js`.

- [ ] **Step 1: Tests.** At the end of `describe('renderWrangler', …)` in `src/utils/renderWrangler.test.js` (before its final `});`), add:

```js
  it('collega il dominio proprio al Worker e spegne workers.dev, senza staging', () => {
    const r = renderWrangler(EXAMPLE, { ...OUTPUTS_PROD_ONLY, prod_hostname: 'mario.com' });
    expect(r.routes).toEqual([{ pattern: 'mario.com', custom_domain: true }]);
    expect(r.workers_dev).toBe(false);
    expect(r.preview_urls).toBe(false);
  });

  it('con lo staging collega il dominio ma lascia workers.dev, dove vive l anteprima', () => {
    const r = renderWrangler(EXAMPLE, { ...OUTPUTS_WITH_STAGING, prod_hostname: 'mario.com' });
    expect(r.routes).toEqual([{ pattern: 'mario.com', custom_domain: true }]);
    expect(r).not.toHaveProperty('workers_dev');
    expect(r).not.toHaveProperty('preview_urls');
  });

  it('su un indirizzo workers.dev, o senza prod_hostname, non tocca routes né workers.dev', () => {
    for (const outputs of [{ ...OUTPUTS_PROD_ONLY, prod_hostname: 'mario.acct.workers.dev' }, OUTPUTS_PROD_ONLY]) {
      const r = renderWrangler(EXAMPLE, outputs);
      expect(r).not.toHaveProperty('routes');
      expect(r).not.toHaveProperty('workers_dev');
      expect(r).not.toHaveProperty('preview_urls');
    }
  });

  it('ricalcola routes e workers_dev a ogni sync, senza tenere valori vecchi', () => {
    const stale = { ...EXAMPLE, routes: [{ pattern: 'old.com', custom_domain: true }], workers_dev: false, preview_urls: false };
    const r = renderWrangler(stale, OUTPUTS_PROD_ONLY);
    expect(r).not.toHaveProperty('routes');
    expect(r).not.toHaveProperty('workers_dev');
    expect(r).not.toHaveProperty('preview_urls');
  });
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/utils/renderWrangler.test.js` → FAIL.

- [ ] **Step 3: Implement.** In `src/utils/renderWrangler.js`, directly before the final `  return out;` of `renderWrangler`, add:

```js

  // Your own domain: the deploy attaches it to the Worker (custom domain), and without
  // staging the duplicate workers.dev address and preview URLs are turned off. With
  // staging they stay: the staging version preview is served on a workers.dev preview URL.
  delete out.routes;
  delete out.workers_dev;
  delete out.preview_urls;
  const host = outputs.prod_hostname;
  if (host && !host.endsWith('.workers.dev')) {
    out.routes = [{ pattern: host, custom_domain: true }];
    if (!out.env?.staging) {
      out.workers_dev = false;
      out.preview_urls = false;
    }
  }
```

- [ ] **Step 4: Run to verify pass.** `npm test -- src/utils/renderWrangler.test.js` → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/renderWrangler.js src/utils/renderWrangler.test.js
git commit -F - <<'EOF'
feat(config): attach the production domain and turn off workers.dev from wrangler.json

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: Documentation and real-account checklist

**Files:** Modify `README.md`, `README.it.md`, `docs/upgrading.md`, `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`.

- [ ] **Step 1: README (EN).** In `README.md`, replace the paragraph

```
Workers & Pages → your Worker → **Settings → Domains & Routes → Add → Custom domain**, and enter the hostname you used as `prod_hostname`. Until you do, the site answers only on its `workers.dev` address, where the dashboard cannot sign you in.
```

with

```
With Terraform and `npm run infra:sync`, there is nothing to do: `wrangler.json` already names your domain, and the first deploy attaches it to the Worker and turns off the duplicate `workers.dev` address (it stays on if you enabled staging). Check it under Workers & Pages → your Worker → **Settings → Domains & Routes**. By hand, add it there with **Add → Custom domain**, using the hostname you chose for Access. Until the domain is attached, the dashboard cannot sign you in.
```

and replace the line

```
- The same Worker also answers on `https://<worker>.<account>.workers.dev`: there, `/admin` must not let you in.
```

with

```
- `https://<worker>.<account>.workers.dev` no longer answers; if you attached the domain by hand or enabled staging it still does, and there `/admin` must not let you in.
```

- [ ] **Step 2: README (IT).** In `README.it.md`, replace

```
Workers & Pages → il tuo Worker → **Settings → Domains & Routes → Add → Custom domain**, e inserisci lo stesso hostname usato come `prod_hostname`. Finché non lo fai, il sito risponde solo sul suo indirizzo `workers.dev`, dove la dashboard non riesce a farti entrare.
```

with

```
Con Terraform e `npm run infra:sync` non c'è niente da fare: `wrangler.json` contiene già il tuo dominio, e il primo deploy lo collega al Worker e spegne l'indirizzo doppione `workers.dev` (resta acceso se hai attivato lo staging). Controllalo in Workers & Pages → il tuo Worker → **Settings → Domains & Routes**. A mano, aggiungilo lì con **Add → Custom domain**, usando l'hostname scelto per Access. Finché il dominio non è collegato, la dashboard non riesce a farti entrare.
```

and replace

```
- Lo stesso Worker risponde anche su `https://<worker>.<account>.workers.dev`: lì `/admin` non deve farti entrare.
```

with

```
- `https://<worker>.<account>.workers.dev` non risponde più; se hai collegato il dominio a mano o attivato lo staging risponde ancora, e lì `/admin` non deve farti entrare.
```

- [ ] **Step 3: Upgrade note.** In `docs/upgrading.md`, directly before the line `## If it goes wrong`, add (one empty line before and after):

```markdown
### Domain attached by the deploy (2026-09-26)

After `terraform -chdir=infra apply` (no resource changes, one new output), `terraform -chdir=infra output -json > infra/outputs.json` and `npm run infra:sync`, `wrangler.json` gains `routes` with your domain as a custom domain and, without staging, `"workers_dev": false` and `"preview_urls": false`. If you already attached the domain by hand, the deploy keeps it. Your site then stops answering on its `workers.dev` address.
```

- [ ] **Step 4: Audit status.** In `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md`, replace `Restano aperti: S4 (`workers_dev`/`preview_urls` a `false` con dominio proprio).` with `S4 e U7 corretti sul branch `feat/s4-u7-domain` (piano `docs/maintainers/superpowers/plans/2026-09-26-s4-u7-domain-from-wrangler.md`), da verificare su un account Cloudflare reale prima del merge: dominio collegato dal deploy, `workers.dev` spento, staging non toccato, Workers Builds autorizzato a creare il custom domain.`

- [ ] **Step 5: Check and commit.** `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md README.it.md docs/upgrading.md` → `0 broken`; `npm test` → PASS.

```bash
git add README.md README.it.md docs/upgrading.md docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md
git commit -F - <<'EOF'
docs: domain attached by the deploy, with real-account checks

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```
