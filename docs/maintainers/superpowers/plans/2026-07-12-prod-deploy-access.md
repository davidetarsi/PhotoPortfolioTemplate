# Prod Deploy + Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare l'ambiente di produzione (`portfolio.example`) allo stesso livello funzionale dello staging già live — R2 popolato, Cloudflare Access sulla dashboard admin — mantenendo il sito pubblico aperto a tutti (a differenza dello staging, dove Access protegge l'intero dominio).

**Architecture:** Stesso Worker (`src/worker.js`), deploy separato per ambiente via `wrangler.json` (`env.staging` per staging, top-level per prod), entrambi su Git integration nativa Cloudflare (branch `staging` → Worker `photo-portfolio-staging`, branch `main` → Worker `photo-portfolio`). A differenza dello staging (dominio `workers.dev`, Access non può fare path-scoping), `portfolio.example` è una zona Cloudflare reale: Access può quindi proteggere solo `/admin` + `/api/admin/*`, lasciando il resto pubblico.

**Tech Stack:** Cloudflare Workers (static assets binding), Wrangler config (`wrangler.json`), Cloudflare R2, Cloudflare Access (Zero Trust).

## Global Constraints

- `portfolio.example` è già una zona attiva nell'account Cloudflare dell'utente (confermato).
- Il deploy è automatico via Git integration nativa Cloudflare — **nessuna GitHub Actions da scrivere**. Il piano precedente (`docs/maintainers/superpowers/plans/docs:superpowers:plans:2026-07-10-staging-prod-deploy.md.rtf`) proponeva un workflow Actions: è superato, non seguirlo.
- Bucket R2 di produzione: `photo-portfolio` (già il default di `R2_BUCKET_NAME` in `.env`, non serve override per `npm run migrate` in prod, a differenza dello staging).
- R2 public URL di produzione: `https://pub-xxxxxxxx.r2.dev` (confermato sia da `.env` `VITE_R2_PUBLIC_URL` sia dall'header CSP live su `portfolio.example`).
- **Verificato via curl diretto**: `portfolio.example` oggi serve ancora il vecchio sito statico pre-migrazione Worker (`/api/data/site` → 404 con `content-length: 0`, nessun `content-type` — il Worker risponderebbe sempre con JSON via `jsonResponse()`).
  - **CORREZIONE (post-esecuzione, confermata dall'utente + verificata via git):** la causa NON era un vecchio progetto Cloudflare Pages da scollegare — l'utente non ne ha mai avuto uno. `portfolio.example` è **sempre stato collegato al Worker `photo-portfolio`**. Il vero motivo: `origin/main` era fermo a `1a476a9` ("add album"), un commit precedente a tutta la riscrittura Worker/R2/admin — `src/worker/data-routes.js` non esisteva ancora in quella versione, quindi `env.ASSETS.fetch()` gestiva ogni richiesta (incluse `/api/data/*`) come asset statico non trovato → 404 senza corpo/content-type. Il lavoro di questa sessione (e di sessioni precedenti) era rimasto sul branch `staging`, mai promosso su `main` fino a questo piano. **Nessun cutover di dominio è stato necessario**: bastava portare `main` allo stesso punto di `staging` (`git checkout main && git merge --ff-only origin/staging && git push origin main`) perché la Git integration nativa di Cloudflare rideployasse lo stesso Worker, già collegato al dominio, con il codice aggiornato.
- Prima di dichiarare il sito pronto, verificare sempre sull'URL `workers.dev` del Worker di produzione — mai fidarsi del dominio live finché non si sa con certezza cosa sta effettivamente servendo.
- Nessuna modifica a `src/`, `config/`, `public/` in questo piano — solo `wrangler.json` e configurazione dashboard Cloudflare.

---

### Task 1: `wrangler.json` — bucket R2 e public URL di produzione

**Files:**
- Modify: `wrangler.json:9-16`

**Interfaces:**
- Consumes: nessuno (valori già noti, vedi Global Constraints)
- Produces: `env.BUCKET` del Worker di produzione punta al bucket reale; `env.R2_PUBLIC_URL` disponibile per la rotta `GET /api/data/config` (`src/worker/data-routes.js:19-21`)

- [x] **Step 1: Applica la modifica**

In `wrangler.json`, sostituisci il blocco top-level `r2_buckets` e `vars`:

```json
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "photo-portfolio" }
  ],
  "vars": {
    "ACCESS_TEAM_DOMAIN": "",
    "ACCESS_AUD": "",
    "R2_PUBLIC_URL": "https://pub-xxxxxxxx.r2.dev"
  },
```

(`ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` restano vuoti per ora — li valorizza Task 4, dopo Task 3.)

- [x] **Step 2: Verifica sintassi JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('wrangler.json'))" && echo OK`
Expected: `OK`

- [x] **Step 3: Commit**

```bash
git add wrangler.json
git commit -m "chore(wrangler): configure production R2 bucket and public URL"
```

Non pushare ancora — Task 4 modifica lo stesso file, si pusha una volta sola alla fine di Task 4.

---

### Task 2: Seed dati R2 di produzione

**Files:**
- Nessuno (esegue `scripts/migrate.js`, già esistente)

**Interfaces:**
- Consumes: `config/site.config.js` (`siteConfig`), `config/albums.config.js` (`albums`), `.env` (`R2_BUCKET_NAME=photo-portfolio`, già corretto di default)
- Produces: oggetti R2 `_site/site.json` e `_data/albums.json` nel bucket `photo-portfolio`

- [x] **Step 1: Dry-run per controllare il contenuto**

Run: `npm run migrate -- --dry-run`
Expected: stampa `_site/site.json` e `_data/albums.json` con i dati di `config/`, poi `Dry-run: nessun upload.`

- [x] **Step 2: Upload reale**

Run: `npm run migrate`
Expected: due righe `✓ caricato _site/site.json` e `✓ caricato _data/albums.json`

Nota: questo scrive sul bucket R2 di produzione — conferma con l'utente prima di eseguire, stesso trattamento fatto per lo staging.

---

### Task 3 [UMANO]: Cloudflare Access per la dashboard di produzione

**Files:** nessuno — solo dashboard Cloudflare.

A differenza dello staging (`workers.dev`, Access su tutto il dominio), qui va usato il flusso generale perché `portfolio.example` è una zona reale — permette di limitare Access a soli `/admin` e `/api/admin/*`, lasciando il resto pubblico.

- [x] **Step 1:** Cloudflare dashboard → **Zero Trust → Access controls → Applications → Create new application**
- [x] **Step 2:** Seleziona **Self-hosted and private**
- [x] **Step 3:** Nome libero, es. `Portfolio Admin Prod`. **Add public hostname**: Domain `portfolio.example`, path `admin`
- [x] **Step 4:** Click di nuovo **Add public hostname**: stesso Domain `portfolio.example`, path `api/admin`
- [x] **Step 5:** Access policies → crea policy: nome `Solo io`, decision **Allow**, include → **Emails** → `admin@example.com`
- [x] **Step 6:** Identity providers → lascia **One-time PIN**
- [x] **Step 7:** Crea l'applicazione, poi apri la sua pagina e copia il valore **Audience (AUD) Tag**

Il team domain dovrebbe essere lo stesso già usato per staging (`your-team.cloudflareaccess.com`, stesso team Zero Trust) — verifica che coincida, cambia solo l'AUD (nuova applicazione).

- [x] **Step 8:** Riporta qui i due valori (team domain + AUD) prima di procedere a Task 4.

---

### Task 4: `wrangler.json` — Access di produzione

**Files:**
- Modify: `wrangler.json` (blocco top-level `vars`, righe modificate da Task 1)

**Interfaces:**
- Consumes: team domain + AUD copiati in Task 3, Step 7-8
- Produces: `env.ACCESS_TEAM_DOMAIN`/`env.ACCESS_AUD` letti da `verifyAccessJwt` (`src/worker/access-jwt.js:50-52`) per le rotte `/api/admin/*` di produzione

- [x] **Step 1: Applica la modifica**

Sostituisci `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` nel blocco top-level `vars` di `wrangler.json` con i valori copiati in Task 3 (stesso formato usato per `env.staging.vars` — team domain senza `https://`, AUD verbatim).

- [x] **Step 2: Verifica sintassi JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('wrangler.json'))" && echo OK`
Expected: `OK`

- [x] **Step 3: Commit e push**

```bash
git add wrangler.json
git commit -m "chore(wrangler): configure production Cloudflare Access"
git push
```

Questo push triggera il deploy nativo Cloudflare del Worker `photo-portfolio` (branch `main`).

---

### Task 5: Verifica pre-cutover sull'URL `workers.dev` di produzione

**Files:** nessuno — solo verifica.

Non testare ancora `portfolio.example` (punta ancora al vecchio sito). Il Worker `photo-portfolio` ha comunque il suo URL `workers.dev` di default, raggiungibile e già configurato con tutto quanto sopra — usalo per validare prima del cutover.

- [x] **Step 1: Trova l'URL `workers.dev` del Worker di produzione**

Cloudflare dashboard → Workers & Pages → `photo-portfolio` → Settings → Domains & Routes. Annota l'URL `workers.dev` mostrato (formato `photo-portfolio.<account-subdomain>.workers.dev`). Se disabilitato, abilitalo da lì.

- [x] **Step 2: Verifica dati pubblici**

```bash
curl -s -o /dev/null -w "site: %{http_code}\n" https://<URL_TROVATO>/api/data/site
curl -s -o /dev/null -w "albums: %{http_code}\n" https://<URL_TROVATO>/api/data/albums
```
Expected: entrambi `200` (conferma Task 1 + Task 2 corretti)

- [x] **Step 3: Verifica difesa in profondità admin**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PUT https://<URL_TROVATO>/api/admin/site
```
Expected: `401` (il Worker rifiuta senza header `Cf-Access-Jwt-Assertion` — su questo URL Access non intercetta la richiesta perché l'applicazione Task 3 è scoped a `portfolio.example`, non a `workers.dev`; qui si verifica solo che il codice del Worker fallisca chiuso, non il flusso di login completo — quello si testa in Task 7, dopo il cutover)

---

### Task 6: Portare `main` allo stesso punto di `staging`

> **Rinominato in corso d'opera.** Il piano originale ipotizzava un cutover di dominio (scollegare `portfolio.example` da un vecchio progetto Cloudflare Pages e ricollegarlo al Worker). Ipotesi sbagliata: l'utente non ha mai avuto un progetto Pages, `portfolio.example` è sempre stato sul Worker `photo-portfolio`. Il vero blocco era che `origin/main` non veniva aggiornato da prima di questa sessione — vedi Global Constraints. Il fix reale è stato un fast-forward di branch, non un'azione da dashboard.

**Files:** nessuno.

- [x] **Step 1:** `git checkout main`
- [x] **Step 2:** `git merge --ff-only origin/staging` (pulito, `origin/main` non aveva nulla che `staging` non avesse già — verificato con `git log origin/staging..origin/main` vuoto prima del merge)
- [x] **Step 3:** `git push origin main` — 47 commit, triggera il deploy automatico via Git integration nativa Cloudflare sullo stesso Worker `photo-portfolio` già collegato a `portfolio.example`
- [x] **Step 4:** `git checkout staging` per tornare al branch di lavoro

---

### Task 7: Verifica end-to-end su `portfolio.example`

**Files:** nessuno — solo verifica.

- [x] **Step 1: Dati pubblici**

```bash
curl -s https://portfolio.example/api/data/site
curl -s https://portfolio.example/api/data/albums
```
Expected: JSON reale (non più `content-length: 0`) — `{"name":"Davide Tarsi",...}` e `{"albums":[...]}`

- [x] **Step 2: Sito pubblico resta aperto**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://portfolio.example/
```
Expected: `200`, nessun redirect a login (a differenza dello staging, qui la home non è protetta)

- [x] **Step 3: Dashboard protetta**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://portfolio.example/admin
```
Expected: redirect verso login Access (`302`) — non più `200` diretto

- [ ] **Step 4 [UMANO]: Login reale**

Apri `https://portfolio.example/admin` nel browser → dovresti vedere il prompt Access One-Time PIN → dopo il login, dashboard visibile.
