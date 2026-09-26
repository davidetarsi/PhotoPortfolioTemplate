# A — The dashboard starts without `migrate` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every step contains the exact code or text: copy it, do not redesign it. If an edit target is not found exactly, or an expected output does not match, stop and report.

**Goal:** A new installation needs no `npm run migrate`, no R2 API token and no `.env`: the dashboard treats a missing `albums.json` as an empty list, and the first save creates the data in R2.

**Architecture:** One pure helper, `resolveAdminAlbums`, decides how the dashboard reads the album response (missing file = empty list; any other failure = error). `src/pages/admin.js` uses it. `migrate` stays as an optional tool. README EN and IT describe the new path.

**Tech Stack:** JavaScript ES modules, Vitest 4, Markdown.

**Spec:** `docs/maintainers/roadmap-semplificazione.md`, phase A (approved 2026-09-26).

**Verified before writing:** the dashboard already starts from `siteConfig` when `_site/site.json` is missing (`src/pages/admin.js`), and a missing album manifest already means an empty grid (`src/admin/views/album.js`); `PUT /api/admin/albums` and `PUT /api/admin/site` create their files. Only the `albums.json` 404 showed "impossibile caricare gli album".

**Base:** branch `feat/s4-u7-domain`. Implementation branch: `feat/simplify-a-no-migrate`, created from it.

## Global Constraints

- `npm test` green after every task. Commit only the files a task names, with explicit `git add <paths>`; never `git add -A` / `git add .`.
- Commit messages: subject, one empty line, then `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1`, via `git commit -F - <<'EOF' … EOF`.
- Never commit `custom/`, `wrangler.json`, `dist/`, `.superpowers/`. Do not run `npm install`.
- Work only inside `/srv/claude/workspaces/`. No push, merge, deploy.

---

### Task 1: Missing `albums.json` is an empty list in the dashboard

**Files:** Create `src/admin/bootstrap.js`, `src/admin/bootstrap.test.js`; modify `src/pages/admin.js`.

- [ ] **Step 1: Test.** Create `src/admin/bootstrap.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { resolveAdminAlbums } from './bootstrap.js';

describe('resolveAdminAlbums', () => {
  it('uses the stored albums when they exist', () => {
    const albums = [{ slug: 'sport', title: 'Sport', description: '', coverName: null }];
    expect(resolveAdminAlbums({ ok: true, data: albums })).toEqual({ ok: true, albums });
  });

  it('starts from an empty list on a new installation, where albums.json does not exist yet', () => {
    expect(resolveAdminAlbums({ ok: false, error: 'NOT_FOUND' })).toEqual({ ok: true, albums: [] });
  });

  it.each(['NETWORK', 'UNKNOWN', 'MALFORMED'])('reports %s as an error, never as an empty list', error => {
    expect(resolveAdminAlbums({ ok: false, error })).toEqual({ ok: false, albums: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npm test -- src/admin/bootstrap.test.js` → FAIL (cannot resolve `./bootstrap.js`).

- [ ] **Step 3: Implement.** Create `src/admin/bootstrap.js`:

```js
/**
 * How the dashboard reads the album list at start-up.
 * A new installation has no albums.json yet: that is an empty list, not an error, and
 * the first album saved from the dashboard creates the file. Any other failure (network,
 * server, malformed data) stays an error, so a broken list is never mistaken for an
 * empty one and overwritten.
 *
 * @param {{ok: boolean, data?: Array, error?: string}} res - Result of fetchAlbums().
 * @returns {{ok: boolean, albums: Array}} The albums to edit, and whether loading worked.
 */
export function resolveAdminAlbums(res) {
  if (res.ok) return { ok: true, albums: res.data };
  if (res.error === 'NOT_FOUND') return { ok: true, albums: [] };
  return { ok: false, albums: [] };
}
```

In `src/pages/admin.js`:
- after the line `import { showPreview } from '../admin/preview.js';` add the line `import { resolveAdminAlbums } from '../admin/bootstrap.js';`
- after the line `const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;` add the line `const adminAlbums = resolveAdminAlbums(albumsRes);`
- replace `  albums: albumsRes.ok ? albumsRes.data : [],` with `  albums: adminAlbums.albums,`
- replace `if (!albumsRes.ok) {` with `if (!adminAlbums.ok) {`

- [ ] **Step 4: Run to verify pass.** `npm test -- src/admin/bootstrap.test.js` → PASS; `npm test` → PASS; `ALLOW_PLACEHOLDER_CSP=1 npx vite build > /srv/claude/workspaces/qa-audit/build-a.log 2>&1; echo $?` → `0`.

- [ ] **Step 5: Commit.**

```bash
git add src/admin/bootstrap.js src/admin/bootstrap.test.js src/pages/admin.js
git commit -F - <<'EOF'
feat(admin): start from an empty album list when albums.json does not exist yet

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

### Task 2: README without `migrate` in the setup path

**Files:** Modify `README.md`, `README.it.md`, `docs/maintainers/pending-decisions.md`.

The two replacement blocks are files prepared by the controller in the task workspace: `readme-en-steps.md` and `readme-it-steps.md` (Appendix A and B below). Replace with a small script, not by retyping.

- [ ] **Step 1: README (EN).** Four edits in `README.md`.

1. Replace everything from the line `### 6. Load the initial content` up to, but not including, the line `### 8. Check that everything works` with the content of `readme-en-steps.md` (it ends with an empty line).
2. Directly after the line

```
| ☁️ **Cloudflare account** | the free plan is enough |
```

add the line

```
| 🐙 **A GitHub or GitLab account** | to fork the template and let Cloudflare deploy every push |
```
3. Replace the line

```
| Run `npm run migrate` again after using the dashboard | Edit content from `/admin`; `migrate` is only the first bootstrap |
```

with

```
| Run `npm run migrate` after using the dashboard | You don't need it: the dashboard creates the data. If you use it, only before the first save from `/admin` |
```
4. Replace the text

```
The files in `config/` are only the initial seed — after `migrate`, R2 is the source of truth.
```

with

```
The files in `config/` are only the initial seed — after the first save from `/admin`, R2 is the source of truth.
```

- [ ] **Step 2: README (IT).** Four edits in `README.it.md`.

1. Replace everything from the line `### 6. Carica il contenuto iniziale` up to, but not including, the line `### 8. Controlla che tutto funzioni` with the content of `readme-it-steps.md`.
2. Directly after the line

```
| ☁️ **Account Cloudflare** | il piano gratuito basta |
```

add the line

```
| 🐙 **Un account GitHub o GitLab** | per fare il fork del template e far pubblicare a Cloudflare ogni push |
```
3. Replace the line

```
| Rilanciare `npm run migrate` dopo aver usato la dashboard | Modifica i contenuti da `/admin`; `migrate` serve solo la prima volta |
```

with

```
| Lanciare `npm run migrate` dopo aver usato la dashboard | Non serve: i dati li crea la dashboard. Se lo usi, solo prima del primo salvataggio da `/admin` |
```
4. Replace the text

```
I file in `config/` sono solo il seed iniziale — dopo `migrate`, la verità è R2.
```

with

```
I file in `config/` sono solo il seed iniziale — dopo il primo salvataggio da `/admin`, la verità è R2.
```

- [ ] **Step 3: Decisions list.** In `docs/maintainers/pending-decisions.md`, replace the line `- Aggiungere "Account GitHub o GitLab" alla tabella dei requisiti del README (oggi è sottinteso).` with `- ~~Aggiungere "Account GitHub o GitLab" ai requisiti del README~~ — fatto nella fase A.`, and in the table row that starts `| A |`, replace the last cell `sì/no` with the text: approvata 2026-09-26, branch `feat/simplify-a-no-migrate`

- [ ] **Step 4: Check.** `grep -n "migrate" README.md README.it.md` shows only the optional-tool note, the "mistakes" row and the project-structure line. `node /srv/claude/workspaces/qa-audit/check-links.mjs README.md README.it.md` → `0 broken`. `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add README.md README.it.md docs/maintainers/pending-decisions.md
git commit -F - <<'EOF'
docs(readme): no migrate in the setup path, GitHub or GitLab account in the requirements

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S3myCHDB2cLDQkqXU2gqJ1
EOF
```

---

## Appendix A — `readme-en-steps.md`

````markdown
### 6. Personalize the seed (optional)

The site and the dashboard start from these files, so edit them first if you like, then commit and push:

- **`config/site.config.js`** — name, bio, social links, hero
- **`config/albums.config.js`** — example albums, shown on the home page until you create your first album in the dashboard
- **`config/texts.config.js`** *(optional)* — interface copy
- **`config/admin.config.js`** *(optional)* — dashboard styling
- **`theme/tokens.css`** and **`theme/typography.css`** — colors, fonts and the Google Fonts link

### 7. Sign in to `/admin`

Open `https://your-domain/admin`. Cloudflare Access asks for your email and sends a one-time code: only the addresses listed in `admin_emails` get in. The first time, the dashboard starts from the seed: create an album and save the site section, and the data is written to R2 — there is nothing to import beforehand. Then upload a few photos.

> 💡 `npm run migrate` still exists for one case: copying many albums from `config/albums.config.js` to R2 in one go. It needs R2 API credentials in `.env` (see `.env.example`), and **running it after you've used the dashboard resets everything to the seed**. `npm run upload` uses the same credentials to upload a prepared folder outside the dashboard.

````

## Appendix B — `readme-it-steps.md`

````markdown
### 6. Personalizza il seed (facoltativo)

Il sito e la dashboard partono da questi file: se vuoi, modificali prima, poi fai commit e push:

- **`config/site.config.js`** — nome, bio, social, hero
- **`config/albums.config.js`** — album di esempio, mostrati in home finché non crei il primo album dalla dashboard
- **`config/texts.config.js`** *(facoltativo)* — testi dell'interfaccia
- **`config/admin.config.js`** *(facoltativo)* — stile della dashboard
- **`theme/tokens.css`** e **`theme/typography.css`** — colori, font e link a Google Fonts

### 7. Entra in `/admin`

Apri `https://il-tuo-dominio/admin`. Cloudflare Access chiede la tua email e ti manda un codice monouso: entrano solo gli indirizzi elencati in `admin_emails`. La prima volta la dashboard parte dal seed: crea un album e salva la sezione del sito, e i dati vengono scritti in R2 — non c'è niente da importare prima. Poi carica qualche foto.

> 💡 `npm run migrate` esiste ancora per un caso: copiare in R2 in un colpo molti album da `config/albums.config.js`. Richiede le credenziali API di R2 in `.env` (vedi `.env.example`), e **lanciarlo dopo aver usato la dashboard riporta tutto al seed**. `npm run upload` usa le stesse credenziali per caricare una cartella già pronta senza passare dalla dashboard.

````
