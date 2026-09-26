# r2PublicUrl a Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `r2PublicUrl` diventa una var runtime del Worker (isolata per ambiente, `env.staging` vs produzione) invece di una var Vite build-time condivisa da tutti i branch — così le foto caricate su staging puntano al bucket giusto.

**Architecture:** Nuova var `R2_PUBLIC_URL` in `wrangler.json`, nuova rotta `GET /api/data/config` nel Worker (puro passthrough della var, nessun accesso R2), nuova `fetchConfig()` lato client con fallback silenzioso a `siteConfig.r2PublicUrl` (la vecchia var Vite, mai rimossa) se il fetch fallisce o il valore non è ancora configurato.

**Tech Stack:** Cloudflare Workers, Vitest (+jsdom per i test client, `@vitest-environment node` per i test worker).

**Spec:** `docs/superpowers/specs/2026-07-12-runtime-r2-public-url-design.md`

## Global Constraints

- `GET /api/data/config` restituisce `{ r2PublicUrl: env.R2_PUBLIC_URL ?? null }`, **mai** accede a R2 (nessuna chiamata a `env.BUCKET.get`).
- Stessa policy delle altre `/api/data/*`: `Cache-Control: no-store` (già garantito da `jsonResponse`, nessun header custom da aggiungere).
- `validateConfigShape` tratta `r2PublicUrl` **null, stringa vuota, o non-stringa** come shape invalida (`MALFORMED`) — il fallback lato client deve attivarsi anche quando la var Worker è tecnicamente presente ma non ancora configurata (stringa vuota), non solo su errore di rete/404.
- `siteConfig.r2PublicUrl` (la var Vite `VITE_R2_PUBLIC_URL`) **non va rimossa** — resta il fallback per tutti e 4 i bootstrap.
- Nessuna funzione pura esistente (`resolveSiteContent`, `albumsToCards`, `photosFromManifest`) cambia firma — ricevono il valore già risolto (`{ ...siteConfig, r2PublicUrl }` o il valore diretto), zero test esistenti di quelle funzioni da riscrivere.
- I bootstrap (`index.js`, `contatti.js`, `album.js`, `admin.js`) **non hanno test dedicati** in questo progetto (stesso pattern di tutto il resto del piano admin-dashboard) — la verifica di Task 3 è `npm test` (nessuna regressione altrove) + `npm run build`, non nuovi file di test per queste pagine.

---

### Task 1: Worker — var `R2_PUBLIC_URL` + rotta `GET /api/data/config`

**Files:**
- Modify: `wrangler.json`
- Modify: `src/worker/data-routes.js`
- Test: `src/worker/data-routes.test.js`

**Interfaces:**
- Consumes: `jsonResponse` da `./http.js` (esistente, invariata).
- Produces: `handleDataRequest` gestisce anche `GET /api/data/config`. Nessuna nuova funzione esportata — la rotta è un branch dentro la funzione esistente. Usato da Task 2 (client fetch verso questo endpoint).

- [ ] **Step 1: Scrivi i test (falliranno)**

Aggiungi in `src/worker/data-routes.test.js`, dopo il blocco `describe('GET /api/data/*', ...)` esistente (prima di `describe('routing worker', ...)`):

```js
describe('GET /api/data/config', () => {
  it('restituisce r2PublicUrl da env, con no-store; non accede mai a R2', async () => {
    const env = makeEnv();
    env.R2_PUBLIC_URL = 'https://pub-xxxx.r2.dev';
    let bucketTouched = false;
    const originalGet = env.BUCKET.get.bind(env.BUCKET);
    env.BUCKET.get = async (...args) => { bucketTouched = true; return originalGet(...args); };

    const res = await get(env, '/api/data/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ r2PublicUrl: 'https://pub-xxxx.r2.dev' });
    expect(bucketTouched).toBe(false);
  });

  it('env.R2_PUBLIC_URL assente → r2PublicUrl null (200, non 404)', async () => {
    const env = makeEnv();
    const res = await get(env, '/api/data/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ r2PublicUrl: null });
  });

  it('405 su metodo non-GET', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://x.dev/api/data/config', { method: 'POST' }), env);
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/worker/data-routes.test.js`
Expected: FAIL — `/api/data/config` non gestita, cade nel path generico `keyFor()` → 404 invece di 200.

- [ ] **Step 3: Implementa**

In `src/worker/data-routes.js`, sostituisci l'intera funzione `handleDataRequest`:

```js
export async function handleDataRequest(request, env) {
  if (request.method !== 'GET') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const pathname = new URL(request.url).pathname;

  if (pathname === '/api/data/config') {
    return jsonResponse({ r2PublicUrl: env.R2_PUBLIC_URL ?? null });
  }

  const key = keyFor(pathname);
  if (!key) return jsonResponse({ error: 'NOT_FOUND' }, 404);
  const obj = await env.BUCKET.get(key);
  if (!obj) return jsonResponse({ error: 'NOT_FOUND' }, 404);
  return new Response(await obj.text(), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
```

In `wrangler.json`, aggiungi `R2_PUBLIC_URL` sia al blocco `vars` di produzione che a quello di `env.staging` (lasciati vuoti — valori reali forniti dall'utente quando pronti, stesso trattamento di `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`):

```json
{
  "name": "photo-portfolio",
  "compatibility_date": "2026-07-07",
  "main": "src/worker.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS"
  },
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "replace-with-real-production-bucket-name" }
  ],
  "vars": {
    "ACCESS_TEAM_DOMAIN": "",
    "ACCESS_AUD": "",
    "R2_PUBLIC_URL": ""
  },
  "env": {
    "staging": {
      "name": "photo-portfolio-staging",
      "r2_buckets": [
        { "binding": "BUCKET", "bucket_name": "photo-portfolio-staging" }
      ],
      "vars": {
        "ACCESS_TEAM_DOMAIN": "",
        "ACCESS_AUD": "",
        "R2_PUBLIC_URL": ""
      }
    }
  }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/worker/data-routes.test.js`
Expected: PASS (tutti i test, inclusi quelli preesistenti in `describe('GET /api/data/*', ...)`  e `describe('routing worker', ...)`  — verifica che il nuovo branch non abbia rotto il routing esistente).

Run: `python3 -c "import json; json.load(open('wrangler.json')); print('valid JSON')"`
Expected: `valid JSON`

- [ ] **Step 5: Commit**

```bash
git add wrangler.json src/worker/data-routes.js src/worker/data-routes.test.js
git commit -m "feat(worker): rotta GET /api/data/config — r2PublicUrl a runtime, isolato per ambiente"
```

---

### Task 2: Client — `fetchConfig()` + `validateConfigShape`

**Files:**
- Modify: `src/shared/content-rules.js`
- Modify: `src/providers/data.js`
- Test: `src/shared/content-rules.test.js`
- Test: `src/providers/data.test.js`

**Interfaces:**
- Consumes: `GET /api/data/config` (Task 1), pattern `fetchValidated` esistente in `data.js` (invariato).
- Produces: `validateConfigShape(data) → {ok:true}|{ok:false,error}` da `content-rules.js`; `fetchConfig() → Promise<{ok:true,data:{r2PublicUrl}}|{ok:false,error}>` da `data.js`. Usata da Task 3 (i 4 bootstrap).

- [ ] **Step 1: Scrivi i test (falliranno)**

Aggiungi in `src/shared/content-rules.test.js`, dopo il blocco `describe('validateManifestShape', ...)` esistente:

```js
describe('validateConfigShape', () => {
  it('accetta un r2PublicUrl stringa non vuota', () => {
    expect(validateConfigShape({ r2PublicUrl: 'https://pub-x.r2.dev' }).ok).toBe(true);
  });
  it('rifiuta null, stringa vuota/spazi, non-stringa, o oggetto non valido', () => {
    expect(validateConfigShape({ r2PublicUrl: null }).ok).toBe(false);
    expect(validateConfigShape({ r2PublicUrl: '' }).ok).toBe(false);
    expect(validateConfigShape({ r2PublicUrl: '   ' }).ok).toBe(false);
    expect(validateConfigShape({ r2PublicUrl: 42 }).ok).toBe(false);
    expect(validateConfigShape(null).ok).toBe(false);
    expect(validateConfigShape({}).ok).toBe(false);
  });
});
```

Aggiorna l'import in cima a `src/shared/content-rules.test.js` per includere `validateConfigShape`:

```js
import {
  SLUG_RE, RESERVED_SLUGS, PHOTO_NAME_RE, MAX_PHOTO_BYTES, slugifyTitle,
  validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape,
} from './content-rules.js';
```

Aggiungi in `src/providers/data.test.js`, dopo il blocco `describe('fetchManifest', ...)` esistente:

```js
describe('fetchConfig', () => {
  it('successo → {ok:true, data}; chiama /api/data/config', async () => {
    mockFetch(async () => jsonRes({ r2PublicUrl: 'https://pub-x.r2.dev' }));
    expect(await fetchConfig()).toEqual({ ok: true, data: { r2PublicUrl: 'https://pub-x.r2.dev' } });
    expect(global.fetch).toHaveBeenCalledWith('/api/data/config');
  });
  it('r2PublicUrl null o vuoto → MALFORMED (il chiamante userà il fallback di build)', async () => {
    mockFetch(async () => jsonRes({ r2PublicUrl: null }));
    expect((await fetchConfig()).error).toBe('MALFORMED');
    mockFetch(async () => jsonRes({ r2PublicUrl: '' }));
    expect((await fetchConfig()).error).toBe('MALFORMED');
  });
  it('rete giù → NETWORK', async () => {
    mockFetch(async () => { throw new TypeError('net'); });
    expect((await fetchConfig()).error).toBe('NETWORK');
  });
});
```

Aggiorna l'import in cima a `src/providers/data.test.js`:

```js
import { fetchSite, fetchAlbums, fetchManifest, fetchConfig } from './data.js';
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/shared/content-rules.test.js src/providers/data.test.js`
Expected: FAIL — `validateConfigShape`/`fetchConfig` non esportate.

- [ ] **Step 3: Implementa**

In `src/shared/content-rules.js`, aggiungi in coda al file (dopo `validateManifestShape`):

```js
export function validateConfigShape(data) {
  if (!isObj(data)) return fail('config: non è un oggetto');
  if (typeof data.r2PublicUrl !== 'string' || !data.r2PublicUrl.trim()) {
    return fail('config.r2PublicUrl deve essere una stringa non vuota');
  }
  return OK;
}
```

In `src/providers/data.js`, aggiorna l'import in cima:

```js
import { validateSiteShape, validateAlbumsShape, validateManifestShape, validateConfigShape } from '../shared/content-rules.js';
```

Aggiungi in coda al file (dopo `fetchManifest`):

```js
export function fetchConfig() {
  return fetchValidated('/api/data/config', validateConfigShape);
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/shared/content-rules.test.js src/providers/data.test.js`
Expected: PASS (tutti i test, inclusi quelli preesistenti).

- [ ] **Step 5: Commit**

```bash
git add src/shared/content-rules.js src/shared/content-rules.test.js src/providers/data.js src/providers/data.test.js
git commit -m "feat(providers): fetchConfig() + validateConfigShape — client per r2PublicUrl runtime"
```

---

### Task 3: Wiring nei 4 bootstrap (index.js, contatti.js, album.js, admin.js)

**Files:**
- Modify: `src/pages/index.js`
- Modify: `src/pages/contatti.js`
- Modify: `src/pages/album.js`
- Modify: `src/pages/admin.js`

**Interfaces:**
- Consumes: `fetchConfig` (Task 2, da `../providers/data.js`).
- Produces: nessuna nuova interfaccia pubblica — collega il valore risolto (`configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl`) a tutti i punti che oggi leggono `siteConfig.r2PublicUrl` direttamente.

- [ ] **Step 1: `src/pages/index.js`**

Cambia l'import:

```js
import { fetchSite, fetchAlbums, fetchConfig } from '../providers/data.js';
```

Sostituisci dal `Promise.all` in poi:

```js
const [siteRes, albumsRes, configRes] = await Promise.all([fetchSite(), fetchAlbums(), fetchConfig()]);
const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;

const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);
renderHero(document.getElementById('hero'), site, texts);
renderFooter(document.getElementById('site-footer'), texts, site.social);

cardsEl.innerHTML = '';
if (!albumsRes.ok) {
  const p = document.createElement('p');
  p.className = 'page-error';
  p.textContent = albumsRes.error === 'NETWORK' ? texts.album.error.network : texts.album.error.unknown;
  cardsEl.appendChild(p);
} else {
  albumsToCards(albumsRes.data, r2PublicUrl)
    .forEach(card => cardsEl.appendChild(createAlbumCard(card)));
}
```

- [ ] **Step 2: `src/pages/contatti.js`**

Cambia l'import:

```js
import { fetchSite, fetchConfig } from '../providers/data.js';
```

Sostituisci le ultime 3 righe del file:

```js
const [siteRes, configRes] = await Promise.all([fetchSite(), fetchConfig()]);
const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;
const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);
renderFooter(document.getElementById('site-footer'), texts, site.social);
```

- [ ] **Step 3: `src/pages/album.js`**

Cambia l'import:

```js
import { fetchSite, fetchAlbums, fetchManifest, fetchConfig } from '../providers/data.js';
```

Sostituisci il blocco `Promise.all` e le righe subito dopo:

```js
// Lo slug è già noto dall'URL: nessun waterfall, tutte le fetch in volo insieme.
const [siteRes, albumsRes, manifestRes, configRes] = await Promise.all([
  fetchSite(),
  fetchAlbums(),
  fetchManifest(slug),
  fetchConfig(),
]);
const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;

const site = resolveSiteContent(siteRes, { ...siteConfig, r2PublicUrl });
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);
renderFooter(document.getElementById('site-footer'), texts, site.social);
```

Più in basso nello stesso file, dentro il ramo `else` finale, cambia:

```js
    const photos = photosFromManifest(page.entries, slug, siteConfig.r2PublicUrl);
```

in:

```js
    const photos = photosFromManifest(page.entries, slug, r2PublicUrl);
```

- [ ] **Step 4: `src/pages/admin.js`**

Cambia l'import:

```js
import { fetchSite, fetchAlbums, fetchManifest, fetchConfig } from '../providers/data.js';
```

Sostituisci le righe dal `Promise.all` fino a dentro l'oggetto `ctx`:

```js
const [siteRes, albumsRes, configRes] = await Promise.all([fetchSite(), fetchAlbums(), fetchConfig()]);
const r2PublicUrl = configRes.ok ? configRes.data.r2PublicUrl : siteConfig.r2PublicUrl;

// Primo avvio: _site/site.json può non esistere ancora → base editabile dai default build.
const ctx = {
  site: siteRes.ok
    ? siteRes.data
    : { name: siteConfig.name, bio: siteConfig.bio ?? '', hero: null, social: {} },
  albums: albumsRes.ok ? albumsRes.data : [],
  r2PublicUrl,
  api: adminApi,
```

(Il resto dell'oggetto `ctx` — `navigate`, `deps: {...}` — resta invariato.)

- [ ] **Step 5: Verifica — suite completa e build**

Run: `npm test`
Expected: PASS, nessuna regressione (baseline al momento di eseguire questo task + i test aggiunti nei Task 1-2, zero rotture — questi 4 file non hanno test dedicati, quindi qui verifichi che tutto il RESTO della suite passi ancora, non che nuovi test passino).

Run: `rm -rf dist && npm run build`
Expected: build pulita, nessun errore, `dist/index.html`, `dist/contatti.html`, `dist/album.html`, `dist/admin.html` tutti generati.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.js src/pages/contatti.js src/pages/album.js src/pages/admin.js
git commit -m "feat(pages): usa r2PublicUrl runtime (fetchConfig) con fallback a siteConfig nei 4 bootstrap"
```

---

## Note per l'esecuzione

- Ordine tassativo: Task 1 → 2 → 3 (Task 3 consuma `fetchConfig` da Task 2, che consuma la rotta di Task 1).
- Tutti e tre i task sono eseguibili in sessione. Task 1 e 2 sono TDD puro; Task 3 non ha un ciclo TDD proprio (i bootstrap non hanno test dedicati in questo progetto — vedi Global Constraints), la sua verifica è suite completa + build.
- Dopo Task 3, se disponibile un ambiente con dev server, verifica manuale nel browser consigliata (Network tab: conferma che `/api/data/config` viene chiamata in parallelo alle altre `/api/data/*`, non in sequenza) — non obbligatoria per completare il piano.
