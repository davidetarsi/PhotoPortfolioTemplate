# C — The template no longer ships `wrangler.json` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** Template updates never touch a fork's `wrangler.json`: the template keeps only `wrangler.example.json`, and each fork commits its own `wrangler.json`. The "save and restore `wrangler.json`" procedure, the fast-forward trap and the recurring merge conflict disappear.

**Architecture:** `wrangler.json` is removed from the template's index (`git rm --cached`, the local file stays). The build reads `wrangler.json` when it exists and otherwise `wrangler.example.json`, whose placeholders make a production build fail with the existing message, and pass only with `ALLOW_PLACEHOLDER_CSP=1`. Forks created earlier get one *modify/delete* conflict on their next merge, resolved by keeping their file.

**Tech Stack:** JavaScript ES modules, Vite 8, Vitest 4, Markdown.

**Spec:** `docs/maintainers/roadmap-semplificazione.md`, phase C. Assumption recorded there: the template repository itself is not deployed (no live demo).

**Base:** branch `feat/simplify-a-no-migrate`. Implementation branch: `feat/simplify-c-untracked-wrangler`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>` / `git rm --cached`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- Never commit `custom/`, `dist/`, `.superpowers/`. Never delete the local `wrangler.json` file. Do not run `npm install`.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: The build falls back to `wrangler.example.json`; the template stops tracking `wrangler.json`

**Files:** Create `src/utils/wranglerConfigPath.js`, `src/utils/wranglerConfigPath.test.js`; modify `vite.config.js`; untrack `wrangler.json`.

- [ ] **Step 1: Test.** Create `src/utils/wranglerConfigPath.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { wranglerConfigPath } from './wranglerConfigPath.js';

describe('wranglerConfigPath', () => {
  it('uses the site own wrangler.json when it exists', () => {
    expect(wranglerConfigPath(path => path === 'wrangler.json')).toBe('wrangler.json');
  });

  it('falls back to wrangler.example.json in the template, which ships no wrangler.json', () => {
    expect(wranglerConfigPath(() => false)).toBe('wrangler.example.json');
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/utils/wranglerConfigPath.test.js` → FAIL.

- [ ] **Step 3: Implement.** Create `src/utils/wranglerConfigPath.js`:

```js
/**
 * Which Wrangler configuration the build reads.
 * A site commits its own wrangler.json; the template ships only wrangler.example.json,
 * whose placeholders stop a production build (buildHeaders) unless
 * ALLOW_PLACEHOLDER_CSP=1 says it is only a check that the template builds.
 *
 * @param {(path: string) => boolean} exists - Tells whether a file exists.
 * @returns {'wrangler.json' | 'wrangler.example.json'} The file to read.
 */
export function wranglerConfigPath(exists) {
  return exists('wrangler.json') ? 'wrangler.json' : 'wrangler.example.json';
}
```

In `vite.config.js`:

- after the line `import { isExpectedBuildWarning } from './src/utils/buildWarnings.js'` add `import { wranglerConfigPath } from './src/utils/wranglerConfigPath.js'`
- replace

```js
const wranglerConfig = existsSync('wrangler.json')
  ? JSON.parse(readFileSync('wrangler.json', 'utf8'))
  : null
```

with

```js
// Il template non contiene wrangler.json: senza, si legge wrangler.example.json, i cui
// segnaposto fermano la build di produzione e passano solo con ALLOW_PLACEHOLDER_CSP=1.
const wranglerConfig = JSON.parse(readFileSync(wranglerConfigPath(existsSync), 'utf8'))
```

- replace

```js
    if (!existsSync('wrangler.json')) {
      this.error('wrangler.json non trovato. Crealo con `cp wrangler.example.json wrangler.json` e compilalo, oppure genera tutto con `npm run infra:sync`.')
    }
```

with nothing (delete these three lines), and replace `      source: buildHeaders(JSON.parse(readFileSync('wrangler.json', 'utf8')), {` with `      source: buildHeaders(wranglerConfig, {`

Then untrack the file, keeping it on disk:

```bash
git rm --cached wrangler.json
ls wrangler.json
```

(`ls` must still list it.)

- [ ] **Step 4: Verify.** `npm test` → PASS. Then check both build modes, with a temporary rename that you undo at once:

```bash
mv wrangler.json /srv/claude/workspaces/qa-audit/wrangler.json.keep
ALLOW_PLACEHOLDER_CSP=1 npx vite build > /srv/claude/workspaces/qa-audit/build-c1.log 2>&1; echo "template check build: $?"
npx vite build > /srv/claude/workspaces/qa-audit/build-c2.log 2>&1; echo "production build without wrangler.json: $?"; grep -o "wrangler.json still contains a placeholder" /srv/claude/workspaces/qa-audit/build-c2.log | head -1
mv /srv/claude/workspaces/qa-audit/wrangler.json.keep wrangler.json
```

Expected: `template check build: 0`; `production build without wrangler.json: 1` followed by `wrangler.json still contains a placeholder`. `ls wrangler.json` succeeds at the end.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/wranglerConfigPath.js src/utils/wranglerConfigPath.test.js vite.config.js
git status --short
git commit -F - <<'EOF'
feat(config): the template ships only wrangler.example.json

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

`git status --short` before the commit must show `D  wrangler.json` (staged deletion), the three staged files, and `?? wrangler.json` (the local file, now untracked).

---

### Task 2: README, guides and upgrade procedure

**Files:** Modify `README.md`, `README.it.md`, `CUSTOMIZING.md`, `docs/upgrading.md`, `docs/runbook-cloudflare.md`, `docs/staging.md`, `docs/maintainers/pending-decisions.md`.

Block replacements use files prepared by the controller in the task workspace (Appendices A–C): replace with a script, not by retyping. Every other edit is an exact old → new pair.

- [ ] **Step 1: README (EN).** Replace everything from the line that starts `Conflicts, if any, will land on` up to, but not including, the line that starts `> 💡 Prefer a private repository` with the content of `readme-en-updates.md`. Then delete the whole line that starts `| Merge an update without looking at`.

- [ ] **Step 2: README (IT).** Replace everything from the line that starts `I conflitti, se ci sono, cadranno su` up to, but not including, the line that starts `> 💡 Preferisci un repo privato` with the content of `readme-it-updates.md`. Then delete the whole line that starts `| Fare il merge di un aggiornamento senza guardare`.

- [ ] **Step 3: CUSTOMIZING.md.** Replace the paragraph that starts `The template ships it with placeholders; you fill in your values` with:

```
The template ships only `wrangler.example.json`. Your site has its own `wrangler.json` — written by `npm run infra:sync`, or copied from the example and filled in by hand — and you **commit it**. Not an oversight: Cloudflare's deploy reads Worker configuration from the repository, so a `wrangler.json` that stays on your computer means a failed deploy.
```

and replace the paragraph that starts `Two practical consequences: it will conflict on every` with:

```
Template updates never touch it, because the template does not ship one. `npm run infra:sync` rewrites it from Terraform outputs, so any manual change needs to be redone or moved to `.tf`.
```

- [ ] **Step 4: docs/upgrading.md.** Replace everything from the line that starts `If you are handing this file to an agent` up to, but not including, the line `## Verify the production update` with the content of `upgrading-core.md`. Then, in the section `## Verify the production update`, replace

```
the restored `wrangler.json` is still using a placeholder.
```

with

```
your `wrangler.json` still uses a placeholder.
```

and delete the whole section that starts with the line `## Updates after the first one` up to, but not including, the line `## When an update changes behaviour`.

- [ ] **Step 5: runbook and staging.** In `docs/runbook-cloudflare.md`, replace

```
`infra:sync` writes account-specific values into the repository's tracked `wrangler.json`. In a real fork, review and commit that file. In the public template's smoke test, never commit the generated values; restore the placeholder version after verification.
```

with

```
`infra:sync` writes account-specific values into `wrangler.json`. In a real fork, review and commit that file. The public template does not track `wrangler.json`: in its smoke test, delete the generated file after verification.
```

and replace

```
5. Restore the public template's placeholder `wrangler.json`; never commit smoke account values.
```

with

```
5. Delete the generated `wrangler.json`; the public template does not track it, so smoke account values can never be committed.
```


In `docs/staging.md`, replace

```
#   ...restore wrangler.json and commit, as above...
```

with

```
#   your wrangler.json is untouched: template updates do not ship one
```

and replace

```
Read that CSP line. It must contain **your** R2 URL. If it contains `pub-xxxxxxxx`, the
restore failed — stop, do not push.
```

with

```
Read that CSP line. It must contain **your** R2 URL. If it contains `pub-xxxxxxxx`, your
`wrangler.json` is missing or still has placeholders — stop, do not push.
```

- [ ] **Step 6: Decisions list.** In `docs/maintainers/pending-decisions.md`, in the table row that starts `| C |`, replace the text `sì/no; serve sapere se il template stesso viene deployato dal repo` with the text: approvata 2026-09-26, branch `feat/simplify-c-untracked-wrangler` (assunzione: il template non viene pubblicato dal suo repository)

- [ ] **Step 7: Check.** `grep -n "checkout --ours\|fast-forward\|restore" README.md README.it.md docs/upgrading.md` must show no line about saving, restoring or keeping `wrangler.json` (the `public/_headers` row, which says "If you restore it", is expected). `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md README.it.md CUSTOMIZING.md docs/upgrading.md docs/runbook-cloudflare.md docs/staging.md` → `0 broken`. `npm test` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add README.md README.it.md CUSTOMIZING.md docs/upgrading.md docs/runbook-cloudflare.md docs/staging.md docs/maintainers/pending-decisions.md
git commit -F - <<'EOF'
docs: wrangler.json belongs to the site, template updates never touch it

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

## Appendix A — `readme-en-updates.md`

````markdown
Conflicts, if any, will land on `config/` and `theme/` — that is, on what you customized. Keep your changes inside those files and updates will stay painless. Your `wrangler.json` is never touched: the template ships only `wrangler.example.json`.

> ⚠️ **Forked before 26 September 2026?** Older versions of the template shipped a placeholder `wrangler.json`. Your next merge stops once with a *modify/delete* conflict on it: keep yours with `git add wrangler.json` and commit. [docs/upgrading.md](docs/upgrading.md) is the production update procedure.

````

## Appendix B — `readme-it-updates.md`

````markdown
I conflitti, se ci sono, cadranno su `config/` e `theme/` — cioè su ciò che hai personalizzato tu. Tieni le tue modifiche dentro quei file e gli aggiornamenti resteranno indolori. Il tuo `wrangler.json` non viene mai toccato: il template contiene solo `wrangler.example.json`.

> ⚠️ **Hai fatto il fork prima del 26 settembre 2026?** Le versioni precedenti del template contenevano un `wrangler.json` coi segnaposto. Il prossimo merge si ferma una volta con un conflitto *modify/delete* su quel file: tieni il tuo con `git add wrangler.json` e fai il commit. [docs/upgrading.md](docs/upgrading.md) è la procedura normale per aggiornare la produzione.

````

## Appendix C — `upgrading-core.md`

````markdown
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

````

