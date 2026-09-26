# Audit fixes before sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** Fix the four priorities of the 2026-09-26 audit so the template can be shared: no HTML injection in the admin Messages view, Turnstile that fails closed without its secret, a README that takes a newcomer from fork to working site in order, and a repository without the maintainer's internal material in the way.

**Architecture:** Small targeted code changes (one admin view, one Worker route) with tests; documentation rewritten section by section; internal documents moved with `git mv` into `docs/maintainers/`.

**Tech Stack:** JavaScript ES modules, Vitest 4 (jsdom), Markdown.

**Spec:** `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md` (findings S1, S3, A2, A3, U1–U7). User decision 2026-09-26: fix priorities 1–4, execute like F3.

**Base:** branch `docs/audit-2026-09-26` (audit report + this plan) on `main` `e1e0fd4`. Implementation branch: `fix/audit-before-sharing`, created from it. Never commit on `main`.

## Execution

One Haiku 4.5 implementer per task, given only that task and the Global Constraints; the maintainer (Opus) reviews each task's diff before the next one. Task 5 moves this plan file: the controller extracts every task brief before dispatching Task 5.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>` or `git mv`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then the two trailer lines `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, written with `git commit -F - <<'EOF' … EOF`.
- Never commit `custom/`, `wrangler.json`, `dist/`, `.superpowers/`. Do not run `npm install` (do not touch `package-lock.json`).
- Work only inside `/srv/claude/workspaces/`. Scratch files under `/srv/claude/workspaces/qa-audit/`. No push, merge, deploy.
- Italian comments stay Italian, English stay English: match the file you edit.

---

### Task 1: Messages view shows public input as text, never HTML (S1, A3)

**Files:**
- Modify: `src/admin/views/messages.js`, `src/admin/views/messages.test.js`

- [ ] **Step 1: Write the failing tests.** In `src/admin/views/messages.test.js`, add these two tests inside `describe('renderMessages', …)`, after the test `'offre un mailto per rispondere'`:

```js
  it('mostra come testo, mai come HTML, ciò che arriva dal form pubblico', async () => {
    const evil = '<meta http-equiv="refresh" content="0;url=https://evil.example"><img src=x onerror="alert(1)">';
    deps.api.listMessages = async () => ({ ok: true, data: { messages: [
      { id: 'x', name: evil, email: 'a@b.c" onmouseover="alert(1)', subject: evil, message: evil, receivedAt: 1 },
    ] } });
    await renderMessages(root, deps, texts);
    expect(root.querySelector('meta, img, [onmouseover]')).toBeNull();
    expect(root.querySelector('.admin-message__name').textContent).toBe(evil);
    expect(root.querySelector('.admin-message__subject').textContent).toBe(evil);
    expect(root.querySelector('.admin-message__body').textContent).toBe(evil);
    expect(root.querySelector('.admin-message__reply').getAttribute('href')).toBe('mailto:a@b.c" onmouseover="alert(1)');
  });

  it('nasconde la scritta di elenco vuoto con hidden, senza stili inline bloccati dalla CSP', async () => {
    await renderMessages(root, deps, texts);
    expect(root.querySelector('.admin-messages-empty').hidden).toBe(true);
    expect(root.querySelector('[style]')).toBeNull();
  });
```

and in the existing test `'mostra il messaggio di elenco vuoto'` add as its last line:

```js
    expect(root.querySelector('.admin-messages-empty').hidden).toBe(false);
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/admin/views/messages.test.js`
Expected: FAIL — the two new tests (a `meta`/`img` element exists; `hidden` is false and a `[style]` element exists) and the edited empty-list test (`hidden` is false before the change only because the attribute is missing: it may pass; that is fine).

- [ ] **Step 3: Implement.** In `src/admin/views/messages.js`:

Replace the line

```js
      <p class="admin-messages-empty" style="display:none;">${texts.admin.messages.empty}</p>
```

with

```js
      <p class="admin-messages-empty" hidden>${texts.admin.messages.empty}</p>
```

Replace both occurrences of `emptyMsg.style.display = 'block';` with `emptyMsg.hidden = false;`.

Replace the block that starts with `    const subject = msg.subject ?` and ends with the closing `` `; `` of `row.innerHTML = `…`` (the whole row template) with:

```js
    // Fixed markup only: every value below comes from the public contact form,
    // so it is set as text, never parsed as HTML.
    row.innerHTML = `
      <div class="admin-message__header">
        <div class="admin-message__name"></div>
        <div class="admin-message__date"></div>
      </div>
      <div class="admin-message__body"></div>
      <div class="admin-message__actions">
        <a class="admin-message__reply" title="${texts.admin.messages.reply}">${texts.admin.messages.reply}</a>
        <button class="admin-message__delete" type="button">${texts.admin.messages.delete}</button>
      </div>
    `;
    row.querySelector('.admin-message__name').textContent = msg.name;
    row.querySelector('.admin-message__date').textContent = dateStr;
    row.querySelector('.admin-message__body').textContent = msg.message;
    row.querySelector('.admin-message__reply').setAttribute('href', `mailto:${msg.email}`);
    if (msg.subject) {
      const subject = document.createElement('div');
      subject.className = 'admin-message__subject';
      subject.textContent = msg.subject;
      row.querySelector('.admin-message__header').after(subject);
    }
```

- [ ] **Step 4: Run to verify pass.**

Run: `npm test -- src/admin/views/messages.test.js` → PASS (all tests, old and new). Then `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/admin/views/messages.js src/admin/views/messages.test.js
git commit -F - <<'EOF'
fix(admin): show contact messages as text, never as HTML

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: Turnstile sitekey without secret refuses instead of accepting (S3)

**Files:**
- Modify: `src/worker/contact-routes.js`, `src/worker/contact-routes.test.js`
- Modify: `docs/runbook-cloudflare.md`, `docs/staging.md`, `docs/upgrading.md`

- [ ] **Step 1: Write the failing test.** In `src/worker/contact-routes.test.js`, add inside `describe('handleContactRequest', …)`, after the first test:

```js
  it('rifiuta con 503 se c è la sitekey di Turnstile ma manca il secret, senza salvare', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = makeEnv({ TURNSTILE_SITEKEY: '0x4AAAAAAA' });
    const res = await post(env, VALIDO);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'TURNSTILE_NOT_CONFIGURED' });
    expect(env.BUCKET.store.size).toBe(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('con sitekey e secret il form verifica e salva', async () => {
    const env = makeEnv({ TURNSTILE_SITEKEY: '0x4AAAAAAA', TURNSTILE_SECRET: 's' });
    const res = await post(env, VALIDO);
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.size).toBe(1);
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `npm test -- src/worker/contact-routes.test.js`
Expected: FAIL — the first new test gets 200.

- [ ] **Step 3: Implement.** In `src/worker/contact-routes.js`, directly after the line `if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);` add:

```js

  // A sitekey without its secret would draw the widget and verify nothing. Refuse instead,
  // so a forgotten `wrangler versions secret put TURNSTILE_SECRET` shows up at once.
  if (env.TURNSTILE_SITEKEY && !env.TURNSTILE_SECRET) {
    console.error('contact: TURNSTILE_SITEKEY is set but TURNSTILE_SECRET is missing; refusing submissions.');
    return jsonResponse({ error: 'TURNSTILE_NOT_CONFIGURED' }, 503);
  }
```

- [ ] **Step 4: Run to verify pass.**

Run: `npm test -- src/worker/contact-routes.test.js` → PASS; then `npm test` → PASS.

- [ ] **Step 5: Documentation.** Three exact replacements.

In `docs/runbook-cloudflare.md`, replace

```
`TURNSTILE_SECRET` binding. A missing binding fails **open**, not closed:
`verifyTurnstile` reads an absent secret as "Turnstile isn't in use here" and accepts
every submission. With the sitekey present but no secret on the target version, the
widget is drawn on the page but nothing validates behind it. Nothing in the UI tells
you. The [staging guide](staging.md) explains the same Worker's version-preview secret
model.
```

with

```
`TURNSTILE_SECRET` binding. With the sitekey present but no secret on the target
version, the Worker refuses every contact submission with `503 TURNSTILE_NOT_CONFIGURED`
and logs why, so the form shows its error message until the secret is set. The
[staging guide](staging.md) explains the same Worker's version-preview secret model.
```

In `docs/runbook-cloudflare.md`, replace

```
> ⚠️ **Set both, or neither.** A half-configuration breaks in one of two opposite ways.
> With the sitekey but no secret, Turnstile fails **open**: the widget is drawn and
> nothing validates behind it. With the secret but no sitekey, it fails **closed**: the
> client never draws the widget, so it never sends a token, and the Worker rejects every
> submission with `CHALLENGE_FAILED` — the form dies for everyone. Leaving out both is a
> legitimate configuration; the form works and the honeypot still catches naive bots.
```

with

```
> ⚠️ **Set both, or neither.** A half-configuration stops the form, in one of two ways.
> With the sitekey but no secret, the Worker refuses every submission with
> `TURNSTILE_NOT_CONFIGURED`: otherwise it would draw the widget and verify nothing.
> With the secret but no sitekey, the client never draws the widget, never sends a
> token, and the Worker rejects every submission with `CHALLENGE_FAILED`. Either way the
> form fails for everyone until both are set. Leaving out both is a legitimate
> configuration; the form works and the honeypot still catches naive bots.
```

In `docs/staging.md`, replace

```
`TURNSTILE_SECRET` binding. A missing binding fails **open**, not closed:
`verifyTurnstile` reads an absent secret as "Turnstile isn't in use here" and accepts
every submission. With the sitekey present but no secret on the target version, the
widget is still drawn on the page but nothing validates behind it. Nothing in the UI
tells you. Configure the secret binding on each target version before serving it, or
decide deliberately that staging goes without.
```

with

```
`TURNSTILE_SECRET` binding. With the sitekey present but no secret on the target
version, the Worker refuses every contact submission with `503 TURNSTILE_NOT_CONFIGURED`.
Configure the secret binding on each target version before serving it, or leave both
the sitekey and the secret out of staging.
```

In `docs/upgrading.md`, directly before the line `## If it goes wrong`, add (with one empty line before and after):

```markdown
### Before sharing (2026-09-26): Node and Turnstile

- Node.js 22.12 or later is required; `package.json` now declares it in `engines`.
- With `TURNSTILE_SITEKEY` set and no `TURNSTILE_SECRET`, the contact form now answers `503 TURNSTILE_NOT_CONFIGURED` instead of accepting unverified messages. Set the secret with `npx wrangler versions secret put TURNSTILE_SECRET`, or remove the sitekey.
```

- [ ] **Step 6: Commit.**

```bash
git add src/worker/contact-routes.js src/worker/contact-routes.test.js docs/runbook-cloudflare.md docs/staging.md docs/upgrading.md
git commit -F - <<'EOF'
fix(contact): refuse submissions when the Turnstile secret is missing

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 3: English README as one ordered path, Node requirement (U1–U7)

**Files:**
- Modify: `package.json`, `README.md`

- [ ] **Step 1: `engines`.** In `package.json`, directly after the line `  "type": "module",` add the line `  "engines": { "node": ">=22.12" },`. Check it is valid JSON: `node -e "require('./package.json')"` prints nothing. Do not run `npm install`.

- [ ] **Step 2: "What it does".** In `README.md` replace `- **Pages** — home with the albums, album page with grid and lightbox, contact page with a working form.` with `- **Pages** — home with the albums, album page with grid and lightbox, an About page with a working contact form.`

- [ ] **Step 3: Table of contents.** In `README.md` replace the two lines

```
- [⚡ Quick start](#-quick-start)
- [⚙️ Setting up a new portfolio](#-setting-up-a-new-portfolio)
```

with

```
- [⚡ Try it locally](#-try-it-locally)
- [⚙️ Setting up a new portfolio](#-setting-up-a-new-portfolio)
- [⚠️ Mistakes to avoid](#-mistakes-to-avoid)
```

- [ ] **Step 4: Replace the setup block.** In `README.md`, replace everything from the line `## 🧰 What you need` up to, but not including, the line `## 🖼️ Using the site once it's live` with exactly the content of the file `.superpowers/sdd/2026-09-26-audit-fixes-before-sharing/readme-en-block.md` that the controller gives you. (It is reproduced in Appendix A of this plan.) Keep one empty line before `## 🖼️ Using the site once it's live`.

- [ ] **Step 5: Customizing.** In `README.md`, replace the line `For replacing page components, lifecycle events and the optional custom theme, see the [extension guide](docs/slots.md) and copy [`custom.example/`](custom.example/) into `custom/` to try it locally.` with:

```
For replacing page components, lifecycle events and the optional custom theme, see the [extension guide](docs/slots.md). To add pages of your own — an archive, one page per project — see [pages](docs/pages.md). Copy [`custom.example/`](custom.example/) into `custom/` to try both locally.
```

- [ ] **Step 6: Project structure.** In `README.md`, inside the project structure code block, replace the line `src/utils/       ← pure functions and helpers` with these three lines:

```
src/utils/       ← pure functions and build helpers
src/shared/      ← rules shared by site, dashboard and Worker (slugs, validation)
src/api/         ← the public API: the only thing custom/ may import
```

replace `src/core/        ← slot registry: the parts a fork can replace` with:

```
src/core/        ← slot registry and page lifecycle: the parts a fork can replace
src/admin/       ← the /admin dashboard
```

and replace `docs/            ← documentation: runbook, specs` with `docs/            ← guides: runbook, staging, upgrading, slots, pages (maintainer notes in docs/maintainers/)`.

- [ ] **Step 7: Check links.** Run `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md` (the controller provides this script). Expected: `0 broken`.

- [ ] **Step 8: Commit.**

```bash
git add package.json README.md
git commit -F - <<'EOF'
docs(readme): one ordered setup path, Node 22.12, mistakes to avoid

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 4: Italian README, same structure

**Files:**
- Modify: `README.it.md`

- [ ] **Step 1: "Cosa fa".** Replace `- **Pagine** — home con gli album, pagina album con griglia e lightbox, contatti con form funzionante.` with `- **Pagine** — home con gli album, pagina album con griglia e lightbox, pagina About con un form di contatto funzionante.`

- [ ] **Step 2: Indice.** Replace

```
- [⚡ Avvio rapido](#-avvio-rapido)
- [⚙️ Allestire un nuovo portfolio](#-allestire-un-nuovo-portfolio)
```

with

```
- [⚡ Provarlo in locale](#-provarlo-in-locale)
- [⚙️ Allestire un nuovo portfolio](#-allestire-un-nuovo-portfolio)
- [⚠️ Errori da evitare](#-errori-da-evitare)
```

- [ ] **Step 3: Replace the setup block.** Replace everything from the line `## 🧰 Cosa serve` up to, but not including, the line `## 🖼️ Come si usa il sito una volta online` with exactly the content of `.superpowers/sdd/2026-09-26-audit-fixes-before-sharing/readme-it-block.md` (Appendix B of this plan). Keep one empty line before `## 🖼️ Come si usa il sito una volta online`.

- [ ] **Step 4: Personalizzazione.** After the three bullet lines of section `## 🎨 Personalizzazione` (the last one is `- Cosa non toccare, per evitare conflitti ai futuri merge dal template`), add one empty line and:

```
Per sostituire componenti delle pagine, eventi del ciclo di vita e tema personalizzato, vedi la [guida alle estensioni](docs/slots.md) *(in inglese)*. Per aggiungere pagine tue — un archivio, una pagina per progetto — vedi [pagine](docs/pages.md) *(in inglese)*. Copia [`custom.example/`](custom.example/) in `custom/` per provare entrambe in locale.
```

- [ ] **Step 5: Struttura del progetto.** In the code block, replace `src/utils/       ← funzioni pure e utilità` with:

```
src/utils/       ← funzioni pure e utilità di build
src/shared/      ← regole condivise da sito, dashboard e Worker (slug, validazione)
src/api/         ← l'API pubblica: l'unica cosa che custom/ può importare
```

replace `src/core/        ← registro degli slot: le parti che un fork può sostituire` with:

```
src/core/        ← registro degli slot e ciclo di vita delle pagine: le parti che un fork può sostituire
src/admin/       ← la dashboard /admin
```

and replace `docs/            ← documentazione: runbook, specifiche` with `docs/            ← guide: runbook, staging, aggiornamenti, slot, pagine (note del maintainer in docs/maintainers/)`.

- [ ] **Step 6: Check links.** `node /srv/claude/workspaces/qa-audit/check-links.mjs README.it.md` → `0 broken`.

- [ ] **Step 7: Commit.**

```bash
git add README.it.md
git commit -F - <<'EOF'
docs(readme.it): stesso percorso ordinato, Node 22.12, errori da evitare

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 5: Move the maintainer's internal material out of the way (A2)

**Files:** moves only, plus `docs/maintainers/README.md`.

- [ ] **Step 1: Move with history.**

```bash
mkdir -p docs/maintainers/history
git mv docs/superpowers docs/maintainers/superpowers
git mv docs/maintainers/platform-direction.md docs/maintainers/platform-direction.md
git mv docs/maintainers/platform-roadmap.md docs/maintainers/platform-roadmap.md
git mv docs/maintainers/azioni-manuali.md docs/maintainers/azioni-manuali.md
git mv piano-implementazione.md docs/maintainers/history/piano-implementazione.md
git mv roadmap-sito-portfolio.md docs/maintainers/history/roadmap-sito-portfolio.md
```

- [ ] **Step 2: Update the paths inside the moved documents.** Mechanical replacement, only inside `docs/maintainers/`:

```bash
grep -rl --include='*.md' -e 'docs/maintainers/superpowers/' -e 'docs/maintainers/platform-direction.md' -e 'docs/maintainers/platform-roadmap.md' -e 'docs/maintainers/azioni-manuali.md' docs/maintainers \
  | xargs -r sed -i \
    -e 's#docs/maintainers/superpowers/#docs/maintainers/superpowers/#g' \
    -e 's#docs/platform-direction\.md#docs/maintainers/platform-direction.md#g' \
    -e 's#docs/platform-roadmap\.md#docs/maintainers/platform-roadmap.md#g' \
    -e 's#docs/azioni-manuali\.md#docs/maintainers/azioni-manuali.md#g'
```

Then confirm nothing outside `docs/maintainers/` still points to the old places:

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=docs -e 'docs/superpowers' -e 'platform-direction.md' -e 'platform-roadmap.md' -e 'azioni-manuali.md' -e 'piano-implementazione.md' -e 'roadmap-sito-portfolio.md' .
grep -rn -e 'docs/superpowers' -e 'azioni-manuali' docs/*.md
```

Expected: no output from either command. If there is output, report it; do not edit files outside `docs/maintainers/`.

- [ ] **Step 3: Create `docs/maintainers/README.md`:**

```markdown
# Maintainer material

Notes from the template's own development: plans, specs and reviews (`superpowers/`), the architecture direction and roadmap, the log of manual actions, and early planning (`history/`).

None of it is needed to install, customize or update a portfolio: start from the [README](../../README.md). Paths inside these documents refer to where files lived when they were written; `history/` describes earlier designs (for example photos read from Google Drive) that the template no longer uses.

New plans and reviews go in `docs/maintainers/superpowers/`.
```

- [ ] **Step 4: Verify.** `npm test` → PASS. `ALLOW_PLACEHOLDER_CSP=1 npx vite build > /srv/claude/workspaces/qa-audit/build.log 2>&1; echo $?` → `0`. `ls` in the repo root shows no `piano-implementazione.md` and no `roadmap-sito-portfolio.md`; `ls docs` shows `maintainers pages.md runbook-cloudflare.md slots.md staging.md upgrading.md`.

- [ ] **Step 5: Commit.**

```bash
git add -A docs/maintainers docs/superpowers docs/maintainers/platform-direction.md docs/maintainers/platform-roadmap.md docs/maintainers/azioni-manuali.md piano-implementazione.md roadmap-sito-portfolio.md
git status --short
git commit -F - <<'EOF'
docs: move maintainer notes to docs/maintainers

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

(`git add -A` is allowed here only with the explicit paths shown, to record the moves and deletions; check `git status --short` before committing: it must list only renames under those paths and the new `docs/maintainers/README.md`.)

---

### Task 6: Verification and audit status

- [ ] **Step 1:** `npm test`, `ALLOW_PLACEHOLDER_CSP=1 npx vite build` (record counts, exit code, warnings), `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md README.it.md docs/upgrading.md docs/runbook-cloudflare.md docs/staging.md` → `0 broken`, `git diff --check main...HEAD`.
- [ ] **Step 2:** Append to `docs/maintainers/superpowers/reviews/2026-09-26-audit-template.md` the section given by the controller (Appendix C), filled with the commit hashes and the numbers of Step 1, then commit it (`docs: record audit fixes`).

---

## Appendix A — English README block (Task 3, Step 4)

````markdown
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

With Terraform (recommended): copy `infra/terraform.tfvars.example` to `infra/terraform.tfvars`, fill it using the [field-by-field reference](docs/runbook-cloudflare.md#32-variable-reference), then plan and apply as the [Terraform path](docs/runbook-cloudflare.md#3-terraform-path) explains, including the API token and its permissions. It creates the R2 bucket, the Access application that protects `/admin` and `/api/admin`, and the Turnstile widget of the contact form.

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

````

## Appendix B — Italian README block (Task 4, Step 3)

````markdown
## 🧰 Cosa serve

| | |
|---|---|
| ☁️ **Account Cloudflare** | il piano gratuito basta |
| 🌐 **Un dominio su Cloudflare** | serve per la dashboard `/admin`: Cloudflare Access sa proteggere solo `/admin` unicamente sul tuo dominio. Senza, puoi comunque provare il sito in locale |
| 🟢 **Node.js 22.12+** | `wrangler`, usato durante l'installazione, richiede Node 22 |
| 🧱 **Terraform 1.9+** | consigliato; il [percorso manuale](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) funziona anche senza |

Costo ricorrente: **zero**, salvo il dominio.

I testi dell'interfaccia sono in italiano: si cambiano in `config/texts.config.js`.

## 🚀 Come partire, e come restare aggiornati

**Fai un fork**, non usare "Use this template". Il fork conserva la storia git, e solo così potrai ricevere le migliorie future con un merge. "Use this template" crea un repo senza antenati comuni: comodo il primo giorno, definitivo per sempre.

Dopo il fork:

```bash
git clone git@github.com:TUO-UTENTE/TUO-REPO.git
cd TUO-REPO
git remote add upstream git@github.com:davidetarsi/PhotoPortfolioTemplate.git
npm install
# poi segui "Allestire un nuovo portfolio" qui sotto, nell'ordine
```

Per ricevere gli aggiornamenti, quando vuoi:

```bash
git fetch upstream
git merge upstream/main
```

I conflitti, se ci sono, cadranno su `config/`, `theme/` e `wrangler.json` — cioè su ciò che hai personalizzato tu. Tieni le tue modifiche dentro quei file e gli aggiornamenti resteranno indolori.

`wrangler.json` in particolare andrà in conflitto quasi sempre, perché il template lo distribuisce coi segnaposto e tu ci hai messo i tuoi valori: risolvi tenendo la tua versione, con `git checkout --ours wrangler.json`.

> ⚠️ **A meno che non vada in conflitto per niente.** Se non hai ancora committato nulla di tuo, git fa un fast-forward invece di un merge: niente conflitti, nessun avviso, e il tuo `wrangler.json` viene sostituito dai segnaposto in silenzio. Un comando ti dice in quale dei due casi sei, e [**docs/upgrading.md**](docs/upgrading.md) è la procedura normale per aggiornare la produzione.

> 💡 Preferisci un repo privato e slegato dal fork? Allora `git clone` di questo repo, poi ripunta `origin` sul tuo e aggiungi `upstream` come sopra: il risultato per gli aggiornamenti è identico.

## ⚡ Provarlo in locale

```bash
node --version   # richiede v22.12+
npm install
npm run dev      # → http://localhost:5173/
npm test
ALLOW_PLACEHOLDER_CSP=1 npm run build   # verifica solo che compili: non pubblicare mai questo output
```

L'anteprima locale mostra il seed di `config/`, senza foto: le foto stanno in R2, che si configura nella sezione successiva.

## ⚙️ Allestire un nuovo portfolio

Segui i passi nell'ordine: ognuno ha bisogno del precedente. Il [runbook Cloudflare](docs/runbook-cloudflare.md) *(in inglese)* ha i dettagli di ogni passo.

### 1. Crea l'infrastruttura

Con Terraform (consigliato): copia `infra/terraform.tfvars.example` in `infra/terraform.tfvars`, compilalo seguendo il [riferimento campo per campo](docs/runbook-cloudflare.md#32-variable-reference), poi esegui plan e apply come spiega il [percorso Terraform](docs/runbook-cloudflare.md#3-terraform-path), compresi il token API e i suoi permessi. Crea il bucket R2, l'applicazione Access che protegge `/admin` e `/api/admin`, e il widget Turnstile del form di contatto.

Poi scrivi i risultati in `wrangler.json`:

```bash
npm run infra:sync
```

Senza Terraform, segui il [percorso manuale](docs/runbook-cloudflare.md#5-manual-path--creating-resources-from-cloudflare-dashboard) e compila `wrangler.json` a mano, partendo da `wrangler.example.json`.

### 2. Committa `wrangler.json`

```bash
git add wrangler.json
git commit -m "chore: la mia configurazione Cloudflare"
git push
```

Il deploy di Cloudflare legge questo file dal repository. Contiene identificativi, non segreti: i segreti vanno a Cloudflare al passo 5. La Content Security Policy viene generata da qui a ogni build.

### 3. Collega il repository a Cloudflare

Dashboard Cloudflare → **Workers & Pages → Create → Import a repository** ([runbook §6](docs/runbook-cloudflare.md#6-git-integration--connect-repository)):

- Build command: `npm test && npm run build`
- Build output directory: `dist`
- Production branch: `main`

Ogni push su `main` pubblica il sito.

### 4. Collega il tuo dominio al Worker

Workers & Pages → il tuo Worker → **Settings → Domains & Routes → Add → Custom domain**, e inserisci lo stesso hostname usato come `prod_hostname`. Finché non lo fai, il sito risponde solo sul suo indirizzo `workers.dev`, dove la dashboard non riesce a farti entrare.

### 5. Imposta i segreti

Dopo `npx wrangler login`:

```bash
npx wrangler versions secret put TURNSTILE_SECRET     # la chiave segreta del widget Turnstile
npx wrangler versions secret put CONTACT_NOTIFY_URL   # facoltativo: una notifica push per ogni nuovo messaggio
```

`versions secret put` prepara una nuova versione senza pubblicarla: promuovila dalla scheda **Deployments** del Worker, oppure fai un push. La chiave segreta è nella dashboard in **Turnstile → il tuo widget**. Se la sitekey è in `wrangler.json` e questo segreto manca, il form di contatto rifiuta ogni messaggio, apposta. Notifiche e loro limiti: [runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection).

### 6. Carica il contenuto iniziale

Compila i file del seed:

- **`config/site.config.js`** — nome, bio, social, hero
- **`config/albums.config.js`** — album, con slug, titolo, descrizione e nome del file di copertina
- **`config/texts.config.js`** *(facoltativo)* — testi dell'interfaccia
- **`config/admin.config.js`** *(facoltativo)* — stile della dashboard
- **`theme/tokens.css`** e **`theme/typography.css`** — colori, font e link a Google Fonts

Poi copiali in R2, una volta sola. `npm run migrate` legge quattro variabili R2 da `.env` (copia `.env.example`; crea un token API R2 con permesso di scrittura sul tuo bucket):

```bash
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="il-tuo-bucket"
```

```bash
npm run migrate
```

> ⚠️ `migrate` serve una volta sola, all'inizio. **Rilanciarlo dopo aver usato la dashboard riporta tutto al seed.** Se ne accorge, si ferma e chiede `--force`.

`VITE_R2_PUBLIC_URL` in `.env` è facoltativo: lo usa solo l'anteprima locale. `npm run upload` usa le stesse credenziali per caricare una cartella già pronta senza passare dalla dashboard.

### 7. Entra in `/admin`

Apri `https://il-tuo-dominio/admin`. Cloudflare Access chiede la tua email e ti manda un codice monouso: entrano solo gli indirizzi elencati in `admin_emails`. Crea un album e carica qualche foto.

### 8. Controlla che tutto funzioni

- La home elenca i tuoi album, e un album mostra le foto che hai caricato.
- Dalla pagina About mandati un messaggio: compare nella dashboard in **Messaggi**, e come notifica se l'hai configurata.
- Lo stesso Worker risponde anche su `https://<worker>.<account>.workers.dev`: lì `/admin` non deve farti entrare.

Esiste un ambiente di staging facoltativo, ma non è pronto all'uso per una prima installazione: vedi [`docs/staging.md`](docs/staging.md) *(in inglese)*.

## ⚠️ Errori da evitare

| Non fare | Fai invece |
|---|---|
| Usare "Use this template" | Fai un fork, così potrai ricevere gli aggiornamenti ([sopra](#-come-partire-e-come-restare-aggiornati)) |
| Usare Node 20 | Node 22.12 o successivo |
| Lasciare il sito senza il tuo dominio | Collegalo al Worker (passo 4): `/admin` funziona solo lì |
| Rilanciare `npm run migrate` dopo aver usato la dashboard | Modifica i contenuti da `/admin`; `migrate` serve solo la prima volta |
| Fare il merge di un aggiornamento senza guardare `wrangler.json` | Segui [docs/upgrading.md](docs/upgrading.md): un fast-forward sostituisce i tuoi valori coi segnaposto senza alcun conflitto |
| Pubblicare una build fatta con `ALLOW_PLACEHOLDER_CSP=1` | Usala solo per verificare che il template compili |
| Mettere un URL di notifica o qualunque segreto in `wrangler.json` | `npx wrangler versions secret put …`: il file è pubblico nel tuo repository |
| Impostare la sitekey di Turnstile senza il secret, o il contrario | Impostali entrambi, o nessuno ([runbook §9](docs/runbook-cloudflare.md#9-contact-form-notifications-and-spam-protection)) |
| Servire le foto di produzione da `r2.dev` | Aggiungi un dominio per le foto ([runbook §8](docs/runbook-cloudflare.md#8-custom-domain-for-photos)): `r2.dev` ha limiti di traffico |
| Mettere `keep_managed_domain = false` prima che il dominio foto funzioni | Verifica prima il dominio, poi spegni `r2.dev` |
| Aggiornare un'installazione che ha già lo staging senza `enable_staging = true` | Impostalo prima del primo `terraform plan`, altrimenti Terraform propone di distruggere lo staging |

````

## Appendix C — audit status section (Task 6, Step 2)

````markdown
## Stato delle correzioni (priorità 1–4)

Branch `fix/audit-before-sharing`.

| Rilievo | Commit | Esito |
|---|---|---|
| S1 — messaggi mostrati come testo, mai come HTML; A3 — `hidden` al posto di `style` inline | `<hash Task 1>` | corretto, con test che include `<meta http-equiv="refresh">` |
| S3 — Turnstile con sitekey senza secret rifiuta (503) | `<hash Task 2>` | corretto; runbook, staging e upgrading aggiornati |
| U1–U6 — README inglese come percorso ordinato, Node 22.12 (`engines`), "Mistakes to avoid" | `<hash Task 3>` | corretto |
| U1–U6 — README italiano allineato | `<hash Task 4>` | corretto |
| A2 — materiale interno spostato in `docs/maintainers/` | `<hash Task 5>` | corretto |

Rilievo aggiunto durante le correzioni:

- **U7 — Media: nessuna guida spiegava come collegare il dominio del sito al Worker.** Terraform crea Access su `prod_hostname`, ma non collega quel dominio al Worker; il README ora lo fa al passo 4 (Workers & Pages → Settings → Domains & Routes). Possibile miglioramento futuro: generare `routes` con `custom_domain: true` in `wrangler.json` da `infra:sync`.

Restano aperti: S2 (bucket privato per i messaggi; esiste già il piano `docs/maintainers/superpowers/plans/2026-09-25-private-contact-buckets-template.md`, da riprendere), S4 (`workers_dev`/`preview_urls` a `false` con dominio proprio), S5, S6.

Verifica finale: `npm test` <file> file, <test> test passati; build <esito>, <avvisi> avvisi; link dei documenti: <esito>.
````
