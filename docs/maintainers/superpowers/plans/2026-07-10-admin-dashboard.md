# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pannello `/admin` no-code (album, foto, cover, hero, bio) su Cloudflare Workers + R2 binding, con sito pubblico che legge i contenuti a runtime — zero rebuild per le modifiche ai contenuti.

**Architecture:** Il Worker esistente cresce con rotte `/api/data/*` (letture pubbliche, `no-store`) e `/api/admin/*` (scritture protette da Cloudflare Access + verifica JWT in-Worker). La lista album e i contenuti passano da config build-time a JSON su R2 (`_data/albums.json`, `_site/site.json`). La dashboard è un entry point Vite in più (`admin.html`), vanilla JS, con compressione WebP client-side (nativa o WASM su Safari).

**Tech Stack:** Cloudflare Workers (R2 binding, WebCrypto), Vite multi-entry, vanilla JS, Vitest (+jsdom), `@jsquash/webp` (solo fallback Safari).

**Spec:** `docs/superpowers/specs/2026-07-10-admin-dashboard-design.md`

## Global Constraints

- **Solo WebP sul sito**: output upload SEMPRE `.webp`, qualità 0.85, lato lungo max 1900px, mai ingrandire. File già `.webp` e ≤1900px → upload as-is.
- **JSON runtime con `Cache-Control: no-store`** su `/api/data/*`. Le immagini restano su URL pubblico R2 (`siteConfig.r2PublicUrl`).
- **Slug**: `^[a-z0-9][a-z0-9-]*$`; riservati: `admin`, `api`, `assets`, `contatti`.
- **Nomi foto**: normalizzazione client = minuscole, spazi→trattini, solo `[a-z0-9._-]`, estensione `.webp`; il server accetta anche maiuscole nei nomi legacy: `^[A-Za-z0-9][A-Za-z0-9._-]*\.webp$`.
- **Deduplicazione nomi a due scope**: `nomi nel manifest ∪ nomi già assegnati nel batch`, suffissi `-2`, `-3`, … assegnati PRIMA di avviare gli upload.
- **Ordine = ordine dell'array** in `albums.json` (home) e `manifest.json` (album). Nessun campo `order`.
- **JWT Access verificato in-Worker** su ogni rotta `/api/admin/*` (header `Cf-Access-Jwt-Assertion`, RS256, iss/aud/exp): fail-closed (env mancanti → 401). **JWKS cache module-level**, TTL 1h, refresh su `kid` sconosciuto.
- **R2 paginazione**: `list()` max 1000 chiavi/pagina (cursor), `delete()` max 1000 chiavi/chiamata → loop `while (truncated)`.
- **Upload**: 3 in parallelo; manifest scritto UNA volta a fine batch; `beforeunload` attivo durante il batch; max 10MB per foto (server-side).
- **Fallback asimmetrico**: `site.json` KO → default silenziosi da `site.config.js`; `albums.json` KO → messaggio d'errore (testi da `texts.config.js`, che resta nel codice).
- **Vanilla JS**, niente framework. Test Vitest; i file worker/script usano `// @vitest-environment node`.
- I microcopy (`texts.config.js`) e i meta OG build-time NON cambiano.

### Schemi dati (riferimento per tutti i task)

```json
// R2: _site/site.json
{ "name": "Davide Tarsi", "bio": "…", "hero": { "album": "sport", "name": "foto.webp" } | null, "social": { "instagram": "" } }
// R2: _data/albums.json   (coverName può essere null: album senza foto)
{ "albums": [ { "slug": "sport", "title": "Sport", "description": "…", "coverName": "foto.webp" | null } ] }
// R2: <slug>/manifest.json — ordine = ordine di visualizzazione
[ { "name": "foto.webp", "width": 1520, "height": 1900 } ]
```

### Mappa file (nuovi/modificati)

```
src/shared/content-rules.js        ← regole+validatori condivisi worker/client/admin (Task 1)
src/worker/http.js                 ← jsonResponse helper (Task 2)
src/worker/data-routes.js          ← GET /api/data/* (Task 2)
src/worker/test-helpers.js         ← makeFakeBucket, makeFakeAssets, makeJwtTestKit (Task 2, 3)
src/worker/access-jwt.js           ← verifyAccessJwt + JWKS cache (Task 3)
src/worker/admin-routes.js         ← PUT/DELETE /api/admin/* (Task 4, 5)
src/worker.js                      ← routing esteso (Task 2, 4)
src/providers/data.js              ← fetchSite/fetchAlbums/fetchManifest (Task 6)
src/providers/r2.js                ← diventa mapper puro (Task 6); cache.js ELIMINATO
src/pages/home-logic.js            ← resolveSiteContent, albumsToCards (Task 7)
src/pages/index.js, contatti.js    ← bootstrap runtime (Task 7)
src/components/Hero.js             ← firma {name, heroUrl} (Task 7)
src/utils/validateConfig.js        ← diventa validateSiteConfig (Task 7)
src/pages/album-logic.js           ← resolveAlbumPage (Task 8)
src/pages/album.js                 ← 3 fetch paralleli (Task 8)
src/admin/naming.js                ← normalizeFilename, assignUniqueName (Task 9)
src/admin/upload-manager.js        ← runBatch + beforeunload guard (Task 9)
src/admin/pipeline.js              ← targetDimensions, shouldUploadAsIs, processFile (Task 10)
src/admin/encoder.js               ← feature-detect + encoder nativo/WASM (Task 10)
src/admin/api.js                   ← client REST admin (Task 11)
src/admin/router.js                ← parseAdminHash (Task 11)
src/admin/sortable.js              ← moveItem + attachSortable (Task 11)
src/admin/views/home.js            ← vista home admin (Task 11)
src/admin/views/album.js           ← vista dettaglio album (Task 12)
src/pages/admin.js, admin.html     ← entry point (Task 11)
src/styles/admin.css               ← stile dashboard (Task 11, 12)
scripts/migrate.js                 ← migrazione one-shot config→R2 (Task 13)
wrangler.json, vite.config.js      ← binding/vars, entry admin (Task 2, 11, 13)
```

---

### Task 1: Regole di contenuto condivise (`content-rules.js`)

**Files:**
- Create: `src/shared/content-rules.js`
- Test: `src/shared/content-rules.test.js`

**Interfaces:**
- Produces: `SLUG_RE`, `RESERVED_SLUGS` (array), `PHOTO_NAME_RE`, `MAX_PHOTO_BYTES` (10485760), `slugifyTitle(title) → string`, `validateSiteShape(data) → {ok:true}|{ok:false,error}`, `validateAlbumsShape(data)`, `validateManifestShape(data)` — usati da worker (Task 4-5), provider client (Task 6), admin (Task 9, 11).

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/shared/content-rules.test.js
import { describe, it, expect } from 'vitest';
import {
  SLUG_RE, RESERVED_SLUGS, PHOTO_NAME_RE, MAX_PHOTO_BYTES, slugifyTitle,
  validateSiteShape, validateAlbumsShape, validateManifestShape,
} from './content-rules.js';

describe('regex e costanti', () => {
  it('SLUG_RE accetta slug validi e rifiuta gli invalidi', () => {
    expect(SLUG_RE.test('sport')).toBe(true);
    expect(SLUG_RE.test('around-the-world')).toBe(true);
    expect(SLUG_RE.test('-inizio')).toBe(false);
    expect(SLUG_RE.test('Maiuscole')).toBe(false);
    expect(SLUG_RE.test('con spazi')).toBe(false);
    expect(SLUG_RE.test('')).toBe(false);
  });

  it('RESERVED_SLUGS contiene le rotte del sito', () => {
    for (const s of ['admin', 'api', 'assets', 'contatti']) expect(RESERVED_SLUGS).toContain(s);
  });

  it('PHOTO_NAME_RE accetta nomi legacy con maiuscole e rifiuta path traversal', () => {
    expect(PHOTO_NAME_RE.test('4x5-crop-IMG_8689-.webp')).toBe(true);
    expect(PHOTO_NAME_RE.test('foto.webp')).toBe(true);
    expect(PHOTO_NAME_RE.test('../evil.webp')).toBe(false);
    expect(PHOTO_NAME_RE.test('foto.jpg')).toBe(false);
    expect(PHOTO_NAME_RE.test('.hidden.webp')).toBe(false);
    expect(PHOTO_NAME_RE.test('a/b.webp')).toBe(false);
  });

  it('MAX_PHOTO_BYTES è 10MB', () => expect(MAX_PHOTO_BYTES).toBe(10 * 1024 * 1024));
});

describe('slugifyTitle', () => {
  it('normalizza titoli in slug validi', () => {
    expect(slugifyTitle('Around the World')).toBe('around-the-world');
    expect(slugifyTitle('  Città & Notte!  ')).toBe('citt-notte');
    expect(slugifyTitle('---')).toBe('');
  });
});

describe('validateSiteShape', () => {
  const ok = { name: 'Davide', bio: '', hero: null, social: {} };
  it('accetta shape valida (hero null e hero valorizzato)', () => {
    expect(validateSiteShape(ok).ok).toBe(true);
    expect(validateSiteShape({ ...ok, hero: { album: 'sport', name: 'a.webp' } }).ok).toBe(true);
  });
  it('rifiuta name vuoto, hero malformato, social non-oggetto', () => {
    expect(validateSiteShape({ ...ok, name: ' ' }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, hero: { album: 'BAD SLUG', name: 'a.webp' } }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, hero: { album: 'sport', name: 'a.jpg' } }).ok).toBe(false);
    expect(validateSiteShape({ ...ok, social: [] }).ok).toBe(false);
    expect(validateSiteShape(null).ok).toBe(false);
  });
});

describe('validateAlbumsShape', () => {
  const album = { slug: 'sport', title: 'Sport', description: '', coverName: null };
  it('accetta lista valida (anche vuota) e coverName string o null', () => {
    expect(validateAlbumsShape({ albums: [] }).ok).toBe(true);
    expect(validateAlbumsShape({ albums: [album] }).ok).toBe(true);
    expect(validateAlbumsShape({ albums: [{ ...album, coverName: 'a.webp' }] }).ok).toBe(true);
  });
  it('rifiuta slug riservati, duplicati, title vuoto, coverName invalido', () => {
    expect(validateAlbumsShape({ albums: [{ ...album, slug: 'admin' }] }).ok).toBe(false);
    expect(validateAlbumsShape({ albums: [album, album] }).ok).toBe(false);
    expect(validateAlbumsShape({ albums: [{ ...album, title: '' }] }).ok).toBe(false);
    expect(validateAlbumsShape({ albums: [{ ...album, coverName: 'a.jpg' }] }).ok).toBe(false);
    expect(validateAlbumsShape({}).ok).toBe(false);
    expect(validateAlbumsShape({ albums: 'no' }).ok).toBe(false);
  });
});

describe('validateManifestShape', () => {
  const entry = { name: 'a.webp', width: 100, height: 200 };
  it('accetta array valido (anche vuoto)', () => {
    expect(validateManifestShape([]).ok).toBe(true);
    expect(validateManifestShape([entry]).ok).toBe(true);
  });
  it('rifiuta dimensioni non finite/negative, nomi invalidi o duplicati, non-array', () => {
    expect(validateManifestShape([{ ...entry, width: 0 }]).ok).toBe(false);
    expect(validateManifestShape([{ ...entry, height: NaN }]).ok).toBe(false);
    expect(validateManifestShape([{ ...entry, name: 'a.jpg' }]).ok).toBe(false);
    expect(validateManifestShape([entry, entry]).ok).toBe(false);
    expect(validateManifestShape({}).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/shared/content-rules.test.js`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa**

```js
// src/shared/content-rules.js
// Regole condivise tra Worker (validazione scritture), sito pubblico (validazione
// letture) e dashboard admin (naming/slug). Unica fonte di verità.

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const RESERVED_SLUGS = ['admin', 'api', 'assets', 'contatti'];
// I nomi legacy caricati con upload.js contengono maiuscole: il server le accetta.
export const PHOTO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.webp$/;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function slugifyTitle(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const fail = error => ({ ok: false, error });
const OK = { ok: true };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPhotoName = v => typeof v === 'string' && PHOTO_NAME_RE.test(v);

export function validateSiteShape(data) {
  if (!isObj(data)) return fail('site: non è un oggetto');
  if (typeof data.name !== 'string' || !data.name.trim()) return fail('site.name obbligatorio');
  if (typeof data.bio !== 'string') return fail('site.bio deve essere una stringa');
  if (data.hero !== null) {
    if (!isObj(data.hero)) return fail('site.hero deve essere null o oggetto');
    if (typeof data.hero.album !== 'string' || !SLUG_RE.test(data.hero.album)) return fail('site.hero.album invalido');
    if (!isPhotoName(data.hero.name)) return fail('site.hero.name invalido');
  }
  if (!isObj(data.social)) return fail('site.social deve essere un oggetto');
  for (const v of Object.values(data.social)) {
    if (typeof v !== 'string') return fail('site.social: valori stringa');
  }
  return OK;
}

export function validateAlbumsShape(data) {
  if (!isObj(data) || !Array.isArray(data.albums)) return fail('albums: shape invalida');
  const seen = new Set();
  for (const a of data.albums) {
    if (!isObj(a)) return fail('albums: entry non oggetto');
    if (typeof a.slug !== 'string' || !SLUG_RE.test(a.slug)) return fail(`slug invalido: "${a?.slug}"`);
    if (RESERVED_SLUGS.includes(a.slug)) return fail(`slug riservato: "${a.slug}"`);
    if (seen.has(a.slug)) return fail(`slug duplicato: "${a.slug}"`);
    seen.add(a.slug);
    if (typeof a.title !== 'string' || !a.title.trim()) return fail(`title obbligatorio per "${a.slug}"`);
    if (typeof a.description !== 'string') return fail(`description stringa per "${a.slug}"`);
    if (a.coverName !== null && !isPhotoName(a.coverName)) return fail(`coverName invalido per "${a.slug}"`);
  }
  return OK;
}

export function validateManifestShape(data) {
  if (!Array.isArray(data)) return fail('manifest: non è un array');
  const seen = new Set();
  for (const e of data) {
    if (!isObj(e)) return fail('manifest: entry non oggetto');
    if (!isPhotoName(e.name)) return fail(`manifest: name invalido "${e?.name}"`);
    if (seen.has(e.name)) return fail(`manifest: name duplicato "${e.name}"`);
    seen.add(e.name);
    if (!Number.isFinite(e.width) || e.width <= 0) return fail(`manifest: width invalida per "${e.name}"`);
    if (!Number.isFinite(e.height) || e.height <= 0) return fail(`manifest: height invalida per "${e.name}"`);
  }
  return OK;
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/shared/content-rules.test.js`
Expected: PASS (tutti).

- [ ] **Step 5: Commit**

```bash
git add src/shared/content-rules.js src/shared/content-rules.test.js
git commit -m "feat(shared): content rules — slug/nomi/shape validators condivisi"
```

---

### Task 2: Worker — fake R2 + rotte dati pubbliche + routing `/admin`

**Files:**
- Create: `src/worker/http.js`, `src/worker/data-routes.js`, `src/worker/test-helpers.js`
- Modify: `src/worker.js`
- Test: `src/worker/data-routes.test.js`

**Interfaces:**
- Consumes: nulla (Task 1 non serve qui: le letture non validano shape).
- Produces: `jsonResponse(data, status=200)`; `handleDataRequest(request, env) → Response`; `makeFakeBucket(initial?) → {get,put,delete,list,store}` con `list` paginato (limit 1000, cursor) e `put` che registra `{text, contentType}`; `makeFakeAssets() → {fetch, calls}`. Il worker instrada `/api/data/*`, `/api/admin/*` (stub 404 per ora), `/admin` → `admin.html`, PRIMA della regex album.

- [ ] **Step 1: Scrivi test helper (non è un test: è infrastruttura per i test)**

```js
// src/worker/test-helpers.js
// Fake dei binding Cloudflare per i test (ambiente node).

export function makeFakeBucket(initial = {}) {
  const store = new Map(); // key → { text, contentType }
  for (const [k, v] of Object.entries(initial)) {
    store.set(k, { text: typeof v === 'string' ? v : JSON.stringify(v), contentType: 'application/json' });
  }
  const toText = async value => {
    if (typeof value === 'string') return value;
    if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
    if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value);
    // ReadableStream (request.body) → consuma
    return await new Response(value).text();
  };
  return {
    store,
    async get(key) {
      const rec = store.get(key);
      if (!rec) return null;
      return { text: async () => rec.text, json: async () => JSON.parse(rec.text) };
    },
    async put(key, value, opts = {}) {
      store.set(key, { text: await toText(value), contentType: opts.httpMetadata?.contentType });
    },
    async delete(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      const all = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit);
      const truncated = start + limit < all.length;
      return { objects: page.map(key => ({ key })), truncated, ...(truncated ? { cursor: String(start + limit) } : {}) };
    },
  };
}

export function makeFakeAssets() {
  const calls = [];
  return {
    calls,
    async fetch(urlOrRequest) {
      const u = new URL(typeof urlOrRequest === 'string' ? urlOrRequest : urlOrRequest.url);
      calls.push(u.pathname);
      return new Response(`ASSET:${u.pathname}`, { status: 200 });
    },
  };
}
```

- [ ] **Step 2: Scrivi i test (falliranno)**

```js
// src/worker/data-routes.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import worker from '../worker.js';
import { makeFakeBucket, makeFakeAssets } from './test-helpers.js';

const SITE = { name: 'Davide', bio: '', hero: null, social: {} };
const ALBUMS = { albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: null }] };
const MANIFEST = [{ name: 'a.webp', width: 10, height: 20 }];

function makeEnv() {
  return {
    ASSETS: makeFakeAssets(),
    BUCKET: makeFakeBucket({ '_site/site.json': SITE, '_data/albums.json': ALBUMS, 'sport/manifest.json': MANIFEST }),
  };
}
const get = (env, path) => worker.fetch(new Request(`https://x.dev${path}`), env);

describe('GET /api/data/*', () => {
  it('serve site.json con no-store', async () => {
    const res = await get(makeEnv(), '/api/data/site');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual(SITE);
  });

  it('serve albums.json e manifest per slug', async () => {
    const env = makeEnv();
    expect(await (await get(env, '/api/data/albums')).json()).toEqual(ALBUMS);
    expect(await (await get(env, '/api/data/albums/sport/manifest')).json()).toEqual(MANIFEST);
  });

  it('404 su chiave assente e su path sconosciuto; 405 su metodo non-GET', async () => {
    const env = makeEnv();
    expect((await get(env, '/api/data/albums/mancante/manifest')).status).toBe(404);
    expect((await get(env, '/api/data/boh')).status).toBe(404);
    const res = await worker.fetch(new Request('https://x.dev/api/data/site', { method: 'POST' }), env);
    expect(res.status).toBe(405);
  });

  it('slug con caratteri invalidi nella rotta manifest → 404', async () => {
    expect((await get(makeEnv(), '/api/data/albums/../manifest')).status).toBe(404);
  });
});

describe('routing worker', () => {
  it('/admin serve admin.html (prima della regex album)', async () => {
    const env = makeEnv();
    const res = await get(env, '/admin');
    expect(await res.text()).toBe('ASSET:/admin.html');
  });

  it('slug album continua a servire album.html; statiche invariate', async () => {
    const env = makeEnv();
    expect(await (await get(env, '/sport')).text()).toBe('ASSET:/album.html');
    expect(await (await get(env, '/contatti')).text()).toBe('ASSET:/contatti.html');
    expect(await (await get(env, '/')).text()).toBe('ASSET:/');
  });
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npx vitest run src/worker/data-routes.test.js`
Expected: FAIL — `handleDataRequest` inesistente / routing assente.

- [ ] **Step 4: Implementa**

```js
// src/worker/http.js
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
```

```js
// src/worker/data-routes.js
// Letture pubbliche dei JSON di contenuto. Sempre no-store: il sito vede
// immediatamente le modifiche fatte dall'admin.
import { jsonResponse } from './http.js';

const MANIFEST_RE = /^\/api\/data\/albums\/([a-z0-9][a-z0-9-]*)\/manifest$/;

function keyFor(pathname) {
  if (pathname === '/api/data/site') return '_site/site.json';
  if (pathname === '/api/data/albums') return '_data/albums.json';
  const m = pathname.match(MANIFEST_RE);
  if (m) return `${m[1]}/manifest.json`;
  return null;
}

export async function handleDataRequest(request, env) {
  if (request.method !== 'GET') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const key = keyFor(new URL(request.url).pathname);
  if (!key) return jsonResponse({ error: 'NOT_FOUND' }, 404);
  const obj = await env.BUCKET.get(key);
  if (!obj) return jsonResponse({ error: 'NOT_FOUND' }, 404);
  return new Response(await obj.text(), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
```

```js
// src/worker.js — file completo aggiornato
import { handleDataRequest } from './worker/data-routes.js'

const STATIC_PAGES = {
  '/contatti': '/contatti.html',
  '/admin': '/admin.html',
}

const ALBUM_SLUG_RE = /^\/[a-z0-9][a-z0-9-]*$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const pathname = url.pathname.replace(/\/$/, '') || '/'

    // API prima di tutto: non devono mai cadere nella regex degli album.
    if (pathname.startsWith('/api/data/')) {
      return handleDataRequest(request, env)
    }

    if (STATIC_PAGES[pathname]) {
      return env.ASSETS.fetch(new URL(STATIC_PAGES[pathname], url))
    }

    if (ALBUM_SLUG_RE.test(pathname)) {
      return env.ASSETS.fetch(new URL('/album.html', url))
    }

    return env.ASSETS.fetch(request)
  },
}
```

- [ ] **Step 5: Verifica che passino**

Run: `npx vitest run src/worker/data-routes.test.js`
Expected: PASS.

- [ ] **Step 6: Suite completa (regressioni)**

Run: `npm test`
Expected: PASS (i test worker preesistenti non esistono; verifica che nulla si rompa).

- [ ] **Step 7: Commit**

```bash
git add src/worker/http.js src/worker/data-routes.js src/worker/test-helpers.js src/worker/data-routes.test.js src/worker.js
git commit -m "feat(worker): rotte /api/data/* no-store + routing /admin"
```

---

### Task 3: Worker — verifica JWT Cloudflare Access con JWKS cache

**Files:**
- Create: `src/worker/access-jwt.js`
- Modify: `src/worker/test-helpers.js` (aggiungi `makeJwtTestKit`)
- Test: `src/worker/access-jwt.test.js`

**Interfaces:**
- Consumes: env vars `ACCESS_TEAM_DOMAIN` (es. `team.cloudflareaccess.com`), `ACCESS_AUD`.
- Produces: `verifyAccessJwt(request, env, deps={}) → Promise<{ok:true, payload}|{ok:false}>` con `deps.fetchJwks?: async(teamDomain)→{keys:[jwk]}` e `deps.now?: ()=>ms`; `_resetJwksCache()` (solo test). Header letto: `Cf-Access-Jwt-Assertion`. Usato da Task 4.

- [ ] **Step 1: Aggiungi il kit JWT a test-helpers.js**

```js
// APPEND a src/worker/test-helpers.js
const te = new TextEncoder();
const bytesToB64url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Genera una coppia RSA reale e firma JWT validi per i test. */
export async function makeJwtTestKit({ kid = 'test-key-1' } = {}) {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid, alg: 'RS256', use: 'sig' };
  async function signToken(payload, { kidOverride = kid } = {}) {
    const h = bytesToB64url(te.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: kidOverride })));
    const p = bytesToB64url(te.encode(JSON.stringify(payload)));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, te.encode(`${h}.${p}`));
    return `${h}.${p}.${bytesToB64url(sig)}`;
  }
  return { jwk, signToken, fetchJwks: async () => ({ keys: [jwk] }) };
}
```

- [ ] **Step 2: Scrivi i test (falliranno)**

```js
// src/worker/access-jwt.test.js
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAccessJwt, _resetJwksCache } from './access-jwt.js';
import { makeJwtTestKit } from './test-helpers.js';

const ENV = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };
const NOW = 1_800_000_000_000; // ms
const basePayload = () => ({
  aud: ['aud-123'],
  iss: 'https://team.cloudflareaccess.com',
  exp: Math.floor(NOW / 1000) + 3600,
  iat: Math.floor(NOW / 1000),
  email: 'io@example.com',
});
const reqWith = token =>
  new Request('https://x.dev/api/admin/site', { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });

describe('verifyAccessJwt', () => {
  let kit;
  beforeEach(async () => {
    _resetJwksCache();
    kit = await makeJwtTestKit();
  });
  const deps = () => ({ fetchJwks: kit.fetchJwks, now: () => NOW });

  it('accetta un token valido', async () => {
    const token = await kit.signToken(basePayload());
    const res = await verifyAccessJwt(reqWith(token), ENV, deps());
    expect(res.ok).toBe(true);
    expect(res.payload.email).toBe('io@example.com');
  });

  it('rifiuta: token assente, scaduto, aud sbagliata, iss sbagliato', async () => {
    expect((await verifyAccessJwt(reqWith(null), ENV, deps())).ok).toBe(false);
    const scaduto = await kit.signToken({ ...basePayload(), exp: Math.floor(NOW / 1000) - 10 });
    expect((await verifyAccessJwt(reqWith(scaduto), ENV, deps())).ok).toBe(false);
    const badAud = await kit.signToken({ ...basePayload(), aud: ['altro'] });
    expect((await verifyAccessJwt(reqWith(badAud), ENV, deps())).ok).toBe(false);
    const badIss = await kit.signToken({ ...basePayload(), iss: 'https://evil.example' });
    expect((await verifyAccessJwt(reqWith(badIss), ENV, deps())).ok).toBe(false);
  });

  it('rifiuta firma non valida (token firmato da chiave diversa)', async () => {
    const altro = await makeJwtTestKit({ kid: 'test-key-1' }); // stesso kid, chiave diversa
    const token = await altro.signToken(basePayload());
    expect((await verifyAccessJwt(reqWith(token), ENV, deps())).ok).toBe(false);
  });

  it('fail-closed se env non configurato', async () => {
    const token = await kit.signToken(basePayload());
    expect((await verifyAccessJwt(reqWith(token), {}, deps())).ok).toBe(false);
  });

  it('usa la cache JWKS (una sola fetch per due verifiche)', async () => {
    let calls = 0;
    const counting = async () => { calls++; return kit.fetchJwks(); };
    const d = { fetchJwks: counting, now: () => NOW };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d);
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d);
    expect(calls).toBe(1);
  });

  it('kid sconosciuto → refresh JWKS; TTL scaduto → refresh', async () => {
    let calls = 0;
    const rotating = await makeJwtTestKit({ kid: 'nuova-chiave' });
    const d = {
      now: () => NOW,
      fetchJwks: async () => { calls++; return calls === 1 ? kit.fetchJwks() : rotating.fetchJwks(); },
    };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d); // popola cache (kit)
    const res = await verifyAccessJwt(reqWith(await rotating.signToken(basePayload())), ENV, d);
    expect(res.ok).toBe(true);
    expect(calls).toBe(2); // refresh su kid sconosciuto

    _resetJwksCache();
    let calls2 = 0;
    const d2 = { fetchJwks: async () => { calls2++; return kit.fetchJwks(); }, now: () => NOW };
    await verifyAccessJwt(reqWith(await kit.signToken(basePayload())), ENV, d2);
    const d3 = { ...d2, now: () => NOW + 3_600_001 }; // oltre TTL 1h
    const late = { ...basePayload(), exp: Math.floor((NOW + 3_600_001) / 1000) + 3600, iat: Math.floor((NOW + 3_600_001) / 1000) };
    await verifyAccessJwt(reqWith(await kit.signToken(late)), ENV, d3);
    expect(calls2).toBe(2); // refresh su TTL
  });
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npx vitest run src/worker/access-jwt.test.js`
Expected: FAIL — modulo inesistente.

- [ ] **Step 4: Implementa**

```js
// src/worker/access-jwt.js
// Difesa in profondità: anche se la policy Access saltasse, le rotte admin
// restano chiuse. Verifica RS256 del JWT emesso da Cloudflare Access.

const JWKS_TTL_MS = 3_600_000; // 1h

// Cache module-level: sopravvive tra richieste nello stesso isolate.
let jwksCache = null; // { teamDomain, fetchedAt, keys: Map<kid, CryptoKey> }

export function _resetJwksCache() { jwksCache = null; }

const b64urlToBytes = s => {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
  const bin = atob(norm + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const decodeSegment = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function defaultFetchJwks(teamDomain) {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return res.json();
}

async function importJwks(jwks) {
  const keys = new Map();
  for (const jwk of jwks.keys ?? []) {
    if (jwk.kty !== 'RSA') continue;
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    keys.set(jwk.kid, key);
  }
  return keys;
}

async function getKey(kid, teamDomain, fetchJwks, now) {
  const stale = !jwksCache || jwksCache.teamDomain !== teamDomain || now - jwksCache.fetchedAt > JWKS_TTL_MS;
  if (stale || !jwksCache.keys.has(kid)) {
    const keys = await importJwks(await fetchJwks(teamDomain));
    jwksCache = { teamDomain, fetchedAt: now, keys };
  }
  return jwksCache.keys.get(kid) ?? null;
}

export async function verifyAccessJwt(request, env, deps = {}) {
  const fetchJwks = deps.fetchJwks ?? defaultFetchJwks;
  const now = (deps.now ?? Date.now)();
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) return { ok: false }; // fail-closed

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false };

  try {
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    if (header.alg !== 'RS256') return { ok: false };

    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
    if (!audOk) return { ok: false };
    if (payload.iss !== `https://${teamDomain}`) return { ok: false };
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return { ok: false };
    if (typeof payload.nbf === 'number' && payload.nbf * 1000 > now) return { ok: false };

    const key = await getKey(header.kid, teamDomain, fetchJwks, now);
    if (!key) return { ok: false };
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? { ok: true, payload } : { ok: false };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 5: Verifica che passino**

Run: `npx vitest run src/worker/access-jwt.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/access-jwt.js src/worker/access-jwt.test.js src/worker/test-helpers.js
git commit -m "feat(worker): verifica JWT Access con JWKS cache module-level (TTL 1h + refresh su kid)"
```

---

### Task 4: Worker — rotte admin: scritture JSON (site/albums/manifest)

**Files:**
- Create: `src/worker/admin-routes.js`
- Modify: `src/worker.js` (aggiungi dispatch `/api/admin/`)
- Test: `src/worker/admin-routes.test.js`

**Interfaces:**
- Consumes: `verifyAccessJwt(request, env, deps)` (Task 3); validatori e costanti da `src/shared/content-rules.js` (Task 1); `jsonResponse` (Task 2); fake da `test-helpers.js`.
- Produces: `handleAdminRequest(request, env, deps={}) → Response`. Rotte di questo task: `PUT /api/admin/site`, `PUT /api/admin/albums`, `PUT /api/admin/albums/:slug/manifest`. `deps` è inoltrato a `verifyAccessJwt` (test). Task 5 estende lo stesso file.

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/worker/admin-routes.test.js
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker.js';
import { handleAdminRequest } from './admin-routes.js';
import { _resetJwksCache } from './access-jwt.js';
import { makeFakeBucket, makeFakeAssets, makeJwtTestKit } from './test-helpers.js';

const ENV_VARS = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };
const NOW = 1_800_000_000_000;
const SITE = { name: 'Davide', bio: '', hero: null, social: {} };
const ALBUMS = { albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: null }] };

let kit, deps, token;
beforeEach(async () => {
  _resetJwksCache();
  kit = await makeJwtTestKit();
  deps = { fetchJwks: kit.fetchJwks, now: () => NOW };
  token = await kit.signToken({
    aud: ['aud-123'], iss: 'https://team.cloudflareaccess.com',
    exp: Math.floor(NOW / 1000) + 3600, iat: Math.floor(NOW / 1000),
  });
});

const makeEnv = (initial = {}) => ({ ...ENV_VARS, ASSETS: makeFakeAssets(), BUCKET: makeFakeBucket(initial) });
const call = (env, method, path, body, headers = {}) =>
  handleAdminRequest(new Request(`https://x.dev${path}`, {
    method,
    headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }), env, deps);

describe('auth gate', () => {
  it('401 senza token; 401 con token invalido', async () => {
    const env = makeEnv();
    const noTok = await handleAdminRequest(new Request('https://x.dev/api/admin/site', { method: 'PUT', body: '{}' }), env, deps);
    expect(noTok.status).toBe(401);
    const bad = await handleAdminRequest(new Request('https://x.dev/api/admin/site', {
      method: 'PUT', body: '{}', headers: { 'Cf-Access-Jwt-Assertion': 'x.y.z' },
    }), env, deps);
    expect(bad.status).toBe(401);
  });

  it('il worker instrada /api/admin/* verso il gate (401 senza token)', async () => {
    const res = await worker.fetch(new Request('https://x.dev/api/admin/site', { method: 'PUT', body: '{}' }), makeEnv());
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/admin/site', () => {
  it('salva site.json valido', async () => {
    const env = makeEnv();
    const res = await call(env, 'PUT', '/api/admin/site', SITE);
    expect(res.status).toBe(200);
    expect(JSON.parse(env.BUCKET.store.get('_site/site.json').text)).toEqual(SITE);
  });
  it('400 su shape invalida e su JSON malformato', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/site', { name: '' })).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/site', '{non-json')).status).toBe(400);
    expect(env.BUCKET.store.has('_site/site.json')).toBe(false);
  });
});

describe('PUT /api/admin/albums', () => {
  it('salva albums.json valido; 400 su slug riservato', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/albums', ALBUMS)).status).toBe(200);
    expect(JSON.parse(env.BUCKET.store.get('_data/albums.json').text)).toEqual(ALBUMS);
    const bad = { albums: [{ slug: 'admin', title: 'X', description: '', coverName: null }] };
    expect((await call(env, 'PUT', '/api/admin/albums', bad)).status).toBe(400);
  });
});

describe('PUT /api/admin/albums/:slug/manifest', () => {
  it('salva manifest valido; 400 su entry invalida; 404 su slug malformato', async () => {
    const env = makeEnv();
    const manifest = [{ name: 'a.webp', width: 10, height: 20 }];
    expect((await call(env, 'PUT', '/api/admin/albums/sport/manifest', manifest)).status).toBe(200);
    expect(JSON.parse(env.BUCKET.store.get('sport/manifest.json').text)).toEqual(manifest);
    expect((await call(env, 'PUT', '/api/admin/albums/sport/manifest', [{ name: 'a.jpg', width: 1, height: 1 }])).status).toBe(400);
    expect((await call(env, 'PUT', '/api/admin/albums/NO SLUG/manifest', manifest)).status).toBe(404);
  });
});

describe('rotte sconosciute', () => {
  it('404 su path ignoto; 405 su metodo sbagliato', async () => {
    const env = makeEnv();
    expect((await call(env, 'PUT', '/api/admin/boh', {})).status).toBe(404);
    expect((await call(env, 'GET', '/api/admin/site')).status).toBe(405);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/worker/admin-routes.test.js`
Expected: FAIL — `admin-routes.js` inesistente.

- [ ] **Step 3: Implementa**

```js
// src/worker/admin-routes.js
// Scritture protette. Il JWT è verificato QUI (non nel router del worker):
// ogni handler admin è chiuso by-construction anche se il routing cambiasse.
import { jsonResponse } from './http.js';
import { verifyAccessJwt } from './access-jwt.js';
import {
  SLUG_RE, validateSiteShape, validateAlbumsShape, validateManifestShape,
} from '../shared/content-rules.js';

const MANIFEST_RE = /^\/api\/admin\/albums\/([a-z0-9][a-z0-9-]*)\/manifest$/;

async function readJson(request) {
  try { return { ok: true, data: await request.json() }; }
  catch { return { ok: false }; }
}

async function putValidatedJson(request, env, key, validate) {
  const body = await readJson(request);
  if (!body.ok) return jsonResponse({ error: 'JSON malformato' }, 400);
  const check = validate(body.data);
  if (!check.ok) return jsonResponse({ error: check.error }, 400);
  await env.BUCKET.put(key, JSON.stringify(body.data), { httpMetadata: { contentType: 'application/json' } });
  return jsonResponse({ ok: true });
}

export async function handleAdminRequest(request, env, deps = {}) {
  const auth = await verifyAccessJwt(request, env, deps);
  if (!auth.ok) return jsonResponse({ error: 'UNAUTHORIZED' }, 401);

  const { pathname } = new URL(request.url);
  const { method } = request;

  if (pathname === '/api/admin/site') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return putValidatedJson(request, env, '_site/site.json', validateSiteShape);
  }

  if (pathname === '/api/admin/albums') {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    return putValidatedJson(request, env, '_data/albums.json', validateAlbumsShape);
  }

  const manifest = pathname.match(MANIFEST_RE);
  if (manifest) {
    if (method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const slug = manifest[1];
    if (!SLUG_RE.test(slug)) return jsonResponse({ error: 'NOT_FOUND' }, 404);
    return putValidatedJson(request, env, `${slug}/manifest.json`, validateManifestShape);
  }

  return jsonResponse({ error: 'NOT_FOUND' }, 404);
}
```

In `src/worker.js`, aggiungi l'import e il dispatch subito dopo il blocco `/api/data/`:

```js
import { handleAdminRequest } from './worker/admin-routes.js'
// … dentro fetch(), dopo il blocco /api/data/:
    if (pathname.startsWith('/api/admin/')) {
      return handleAdminRequest(request, env)
    }
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/worker/admin-routes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/admin-routes.js src/worker/admin-routes.test.js src/worker.js
git commit -m "feat(worker): rotte admin PUT site/albums/manifest con validazione e JWT gate"
```

---

### Task 5: Worker — upload/cancellazione foto e cancellazione album paginata

**Files:**
- Modify: `src/worker/admin-routes.js`
- Test: `src/worker/admin-routes.test.js` (append)

**Interfaces:**
- Consumes: `PHOTO_NAME_RE`, `MAX_PHOTO_BYTES` da content-rules (Task 1); fake bucket con `list` paginato (Task 2).
- Produces: `PUT /api/admin/albums/:slug/photos/:name` (body binario `image/webp`), `DELETE /api/admin/albums/:slug/photos/:name` (oggetto + entry manifest), `DELETE /api/admin/albums/:slug` (loop paginato + rimozione da albums.json). Contratti usati dal client API (Task 11).

- [ ] **Step 1: Append test (falliranno)**

```js
// APPEND a src/worker/admin-routes.test.js
describe('PUT /api/admin/albums/:slug/photos/:name', () => {
  const put = (env, path, body, ct = 'image/webp') =>
    handleAdminRequest(new Request(`https://x.dev${path}`, {
      method: 'PUT', body, headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': ct },
    }), env, deps);

  it('salva il body come oggetto webp', async () => {
    const env = makeEnv();
    const res = await put(env, '/api/admin/albums/sport/photos/nuova.webp', new Uint8Array([1, 2, 3]));
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.has('sport/nuova.webp')).toBe(true);
    expect(env.BUCKET.store.get('sport/nuova.webp').contentType).toBe('image/webp');
  });

  it('accetta nomi legacy con maiuscole', async () => {
    const env = makeEnv();
    expect((await put(env, '/api/admin/albums/sport/photos/4x5-IMG_8689-.webp', new Uint8Array([1]))).status).toBe(200);
  });

  it('rifiuta content-type sbagliato (415), nome invalido (400), body oltre 10MB (413)', async () => {
    const env = makeEnv();
    expect((await put(env, '/api/admin/albums/sport/photos/a.webp', new Uint8Array([1]), 'image/jpeg')).status).toBe(415);
    expect((await put(env, '/api/admin/albums/sport/photos/a.jpg', new Uint8Array([1]))).status).toBe(400);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    expect((await put(env, '/api/admin/albums/sport/photos/a.webp', big)).status).toBe(413);
  });
});

describe('DELETE /api/admin/albums/:slug/photos/:name', () => {
  it('elimina oggetto e entry dal manifest; idempotente se manifest assente', async () => {
    const env = makeEnv({
      'sport/a.webp': 'BIN', 'sport/b.webp': 'BIN',
      'sport/manifest.json': [{ name: 'a.webp', width: 1, height: 1 }, { name: 'b.webp', width: 1, height: 1 }],
    });
    const res = await call(env, 'DELETE', '/api/admin/albums/sport/photos/a.webp');
    expect(res.status).toBe(200);
    expect(env.BUCKET.store.has('sport/a.webp')).toBe(false);
    expect(JSON.parse(env.BUCKET.store.get('sport/manifest.json').text)).toEqual([{ name: 'b.webp', width: 1, height: 1 }]);
    // senza manifest: nessun errore
    const env2 = makeEnv({ 'sport/c.webp': 'BIN' });
    expect((await call(env2, 'DELETE', '/api/admin/albums/sport/photos/c.webp')).status).toBe(200);
  });
});

describe('DELETE /api/admin/albums/:slug', () => {
  it('cancella >1000 oggetti con paginazione e rimuove la voce da albums.json', async () => {
    const initial = { '_data/albums.json': ALBUMS };
    for (let i = 0; i < 1203; i++) initial[`sport/foto-${String(i).padStart(4, '0')}.webp`] = 'BIN';
    initial['sport/manifest.json'] = [];
    initial['around/x.webp'] = 'BIN'; // altro album: non deve essere toccato
    const env = makeEnv(initial);
    const res = await call(env, 'DELETE', '/api/admin/albums/sport');
    expect(res.status).toBe(200);
    expect([...env.BUCKET.store.keys()].filter(k => k.startsWith('sport/'))).toEqual([]);
    expect(env.BUCKET.store.has('around/x.webp')).toBe(true);
    expect(JSON.parse(env.BUCKET.store.get('_data/albums.json').text)).toEqual({ albums: [] });
  });

  it('idempotente: cancellare un album inesistente risponde 200', async () => {
    expect((await call(makeEnv(), 'DELETE', '/api/admin/albums/fantasma')).status).toBe(200);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/worker/admin-routes.test.js`
Expected: FAIL sulle nuove describe (le rotte non esistono).

- [ ] **Step 3: Implementa — append/estendi `admin-routes.js`**

Aggiungi gli import mancanti in testa:

```js
import {
  SLUG_RE, PHOTO_NAME_RE, MAX_PHOTO_BYTES,
  validateSiteShape, validateAlbumsShape, validateManifestShape,
} from '../shared/content-rules.js';
```

Aggiungi la costante e gli handler PRIMA del `return jsonResponse({ error: 'NOT_FOUND' }, 404);` finale di `handleAdminRequest`:

```js
const PHOTO_RE = /^\/api\/admin\/albums\/([a-z0-9][a-z0-9-]*)\/photos\/([^/]+)$/;

// … dentro handleAdminRequest, dopo il blocco manifest:

  const photo = pathname.match(PHOTO_RE);
  if (photo) {
    const [, slug, rawName] = photo;
    const name = decodeURIComponent(rawName);
    if (!SLUG_RE.test(slug) || !PHOTO_NAME_RE.test(name)) return jsonResponse({ error: 'Nome o slug invalido' }, 400);
    const key = `${slug}/${name}`;

    if (method === 'PUT') {
      if (request.headers.get('Content-Type') !== 'image/webp') return jsonResponse({ error: 'Atteso image/webp' }, 415);
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_PHOTO_BYTES) return jsonResponse({ error: 'File oltre 10MB' }, 413);
      if (bytes.byteLength === 0) return jsonResponse({ error: 'Body vuoto' }, 400);
      await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE') {
      await env.BUCKET.delete(key);
      const manifestObj = await env.BUCKET.get(`${slug}/manifest.json`);
      if (manifestObj) {
        const entries = await manifestObj.json();
        if (Array.isArray(entries)) {
          const filtered = entries.filter(e => e?.name !== name);
          await env.BUCKET.put(`${slug}/manifest.json`, JSON.stringify(filtered), {
            httpMetadata: { contentType: 'application/json' },
          });
        }
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const albumDelete = pathname.match(/^\/api\/admin\/albums\/([a-z0-9][a-z0-9-]*)$/);
  if (albumDelete) {
    if (method !== 'DELETE') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const slug = albumDelete[1];

    // Loop paginato: list() max 1000 chiavi/pagina, delete() max 1000 chiavi/chiamata.
    // Prima gli oggetti, POI albums.json: se il loop muore a metà, l'album resta
    // visibile nel pannello e la cancellazione è ri-lanciabile (idempotente).
    let cursor;
    do {
      const page = await env.BUCKET.list({ prefix: `${slug}/`, cursor, limit: 1000 });
      if (page.objects.length > 0) await env.BUCKET.delete(page.objects.map(o => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    const albumsObj = await env.BUCKET.get('_data/albums.json');
    if (albumsObj) {
      const data = await albumsObj.json();
      if (data && Array.isArray(data.albums)) {
        const filtered = { albums: data.albums.filter(a => a?.slug !== slug) };
        await env.BUCKET.put('_data/albums.json', JSON.stringify(filtered), {
          httpMetadata: { contentType: 'application/json' },
        });
      }
    }
    return jsonResponse({ ok: true });
  }
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/worker/admin-routes.test.js`
Expected: PASS (tutte le describe, incluse quelle del Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/worker/admin-routes.js src/worker/admin-routes.test.js
git commit -m "feat(worker): upload/delete foto e delete album con paginazione R2"
```

---

### Task 6: Provider dati del sito pubblico + r2.js come mapper puro

**Files:**
- Create: `src/providers/data.js`
- Modify: `src/providers/r2.js` (riscrittura completa)
- Delete: `src/providers/cache.js`, `src/providers/cache.test.js`
- Test: `src/providers/data.test.js`, `src/providers/r2.test.js` (riscrittura completa)

**Interfaces:**
- Consumes: validatori shape da content-rules (Task 1); endpoint `/api/data/*` (Task 2).
- Produces: `fetchSite() → Promise<{ok:true,data}|{ok:false,error:'NETWORK'|'NOT_FOUND'|'MALFORMED'|'UNKNOWN'}>`; `fetchAlbums()` (data = array `albums` già estratto); `fetchManifest(slug)` (data = array entries); `photoUrl(r2PublicUrl, slug, name) → string`; `photosFromManifest(entries, slug, r2PublicUrl) → [{name,width,height,gridUrl,fullUrl}]`. Usati da Task 7, 8, 11, 12.

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/providers/data.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSite, fetchAlbums, fetchManifest } from './data.js';

const SITE = { name: 'Davide', bio: '', hero: null, social: {} };
const ALBUMS = { albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: null }] };

const mockFetch = impl => vi.stubGlobal('fetch', vi.fn(impl));
const jsonRes = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('fetchSite', () => {
  it('successo → {ok:true, data}; chiama /api/data/site', async () => {
    const f = mockFetch(async () => jsonRes(SITE));
    expect(await fetchSite()).toEqual({ ok: true, data: SITE });
    expect(f).toHaveBeenCalledWith('/api/data/site');
  });
  it('rete giù → NETWORK; 404 → NOT_FOUND; 500 → UNKNOWN', async () => {
    mockFetch(async () => { throw new TypeError('net'); });
    expect((await fetchSite()).error).toBe('NETWORK');
    mockFetch(async () => jsonRes({ error: 'x' }, 404));
    expect((await fetchSite()).error).toBe('NOT_FOUND');
    mockFetch(async () => jsonRes({ error: 'x' }, 500));
    expect((await fetchSite()).error).toBe('UNKNOWN');
  });
  it('shape invalida o JSON rotto → MALFORMED', async () => {
    mockFetch(async () => jsonRes({ name: '' }));
    expect((await fetchSite()).error).toBe('MALFORMED');
    mockFetch(async () => new Response('{rotto', { status: 200 }));
    expect((await fetchSite()).error).toBe('MALFORMED');
  });
});

describe('fetchAlbums', () => {
  it('estrae direttamente l\'array albums', async () => {
    mockFetch(async () => jsonRes(ALBUMS));
    expect(await fetchAlbums()).toEqual({ ok: true, data: ALBUMS.albums });
  });
  it('shape invalida → MALFORMED', async () => {
    mockFetch(async () => jsonRes({ albums: 'no' }));
    expect((await fetchAlbums()).error).toBe('MALFORMED');
  });
});

describe('fetchManifest', () => {
  it('successo e URL con slug', async () => {
    const entries = [{ name: 'a.webp', width: 1, height: 2 }];
    const f = mockFetch(async () => jsonRes(entries));
    expect(await fetchManifest('sport')).toEqual({ ok: true, data: entries });
    expect(f).toHaveBeenCalledWith('/api/data/albums/sport/manifest');
  });
  it('404 → NOT_FOUND (album nuovo senza manifest)', async () => {
    mockFetch(async () => jsonRes({ error: 'x' }, 404));
    expect((await fetchManifest('nuovo')).error).toBe('NOT_FOUND');
  });
});
```

```js
// src/providers/r2.test.js — SOSTITUISCE l'intero file esistente
import { describe, it, expect } from 'vitest';
import { photoUrl, photosFromManifest } from './r2.js';

describe('photoUrl', () => {
  it('costruisce l\'URL e tollera lo slash finale nella base', () => {
    expect(photoUrl('https://pub.r2.dev', 'sport', 'a.webp')).toBe('https://pub.r2.dev/sport/a.webp');
    expect(photoUrl('https://pub.r2.dev/', 'sport', 'a.webp')).toBe('https://pub.r2.dev/sport/a.webp');
  });
});

describe('photosFromManifest', () => {
  it('mappa entries in photos con gridUrl/fullUrl', () => {
    const photos = photosFromManifest([{ name: 'a.webp', width: 10, height: 20 }], 'sport', 'https://pub.r2.dev');
    expect(photos).toEqual([{
      name: 'a.webp', width: 10, height: 20,
      gridUrl: 'https://pub.r2.dev/sport/a.webp', fullUrl: 'https://pub.r2.dev/sport/a.webp',
    }]);
  });
  it('array vuoto → array vuoto', () => {
    expect(photosFromManifest([], 'sport', 'https://pub.r2.dev')).toEqual([]);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/providers/data.test.js src/providers/r2.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementa**

```js
// src/providers/data.js
// Letture runtime dei contenuti. Ogni funzione restituisce un result object,
// mai throw: i chiamanti decidono il fallback (asimmetrico) per ciascun caso.
import { validateSiteShape, validateAlbumsShape, validateManifestShape } from '../shared/content-rules.js';

async function fetchValidated(url, validate) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, error: 'NETWORK' };
  }
  if (res.status === 404) return { ok: false, error: 'NOT_FOUND' };
  if (!res.ok) return { ok: false, error: 'UNKNOWN' };
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }
  if (!validate(data).ok) return { ok: false, error: 'MALFORMED' };
  return { ok: true, data };
}

export function fetchSite() {
  return fetchValidated('/api/data/site', validateSiteShape);
}

export async function fetchAlbums() {
  const res = await fetchValidated('/api/data/albums', validateAlbumsShape);
  return res.ok ? { ok: true, data: res.data.albums } : res;
}

export function fetchManifest(slug) {
  return fetchValidated(`/api/data/albums/${slug}/manifest`, validateManifestShape);
}
```

```js
// src/providers/r2.js — SOSTITUISCE l'intero file esistente
// Mapper puro manifest → photos. Il fetch vive in data.js; le immagini
// restano su URL pubblico R2 (cache lunga, immutabili per nome).

export function photoUrl(r2PublicUrl, slug, name) {
  return `${r2PublicUrl.replace(/\/$/, '')}/${slug}/${name}`;
}

export function photosFromManifest(entries, slug, r2PublicUrl) {
  return entries.map(({ name, width, height }) => ({
    name,
    width,
    height,
    gridUrl: photoUrl(r2PublicUrl, slug, name),
    fullUrl: photoUrl(r2PublicUrl, slug, name),
  }));
}
```

- [ ] **Step 4: Elimina la cache sessionStorage**

```bash
git rm src/providers/cache.js src/providers/cache.test.js
```

- [ ] **Step 5: Verifica**

Run: `npx vitest run src/providers/`
Expected: PASS. (`album.js` importa ancora `listPhotos` che non esiste più: il sito si aggiorna nel Task 8 — i TEST devono comunque passare perché nessun test importa `album.js`. Verifica con `npm test`: se `Lightbox.test.js` o altri importano `listPhotos`, falliranno — in tal caso il Task 8 è il fix; NON reintrodurre `listPhotos`.)

- [ ] **Step 6: Commit**

```bash
git add src/providers/data.js src/providers/data.test.js src/providers/r2.js src/providers/r2.test.js
git commit -m "feat(providers): data.js runtime con shape validation; r2.js mapper puro; rimossa cache sessionStorage"
```

---

### Task 7: Home e Contatti a dati runtime (+ Hero, validateSiteConfig)

**Files:**
- Create: `src/pages/home-logic.js`
- Modify: `src/pages/index.js`, `src/pages/contatti.js`, `src/components/Hero.js`, `src/utils/validateConfig.js`, `src/styles/album-card.css` (append)
- Test: `src/pages/home-logic.test.js`, `src/components/Hero.test.js` (riscrittura), `src/utils/validateConfig.test.js` (riscrittura)

**Interfaces:**
- Consumes: `fetchSite`, `fetchAlbums` (Task 6); `photoUrl` (Task 6); `createAlbumCard({slug,title,description,coverUrl})` (esistente, INVARIATO).
- Produces: `resolveSiteContent(siteRes, buildConfig) → {name,bio,social,heroUrl}` (fallback asimmetrico); `albumsToCards(albums, r2PublicUrl) → [{slug,title,description,coverUrl|null}]`; `renderHero(container, {name, heroUrl}, texts)` (NUOVA firma); `validateSiteConfig(siteConfig)` (senza albums). Riusati da Task 8 (nav) e 11 (admin bootstrap).

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/pages/home-logic.test.js
import { describe, it, expect } from 'vitest';
import { resolveSiteContent, albumsToCards } from './home-logic.js';

const BUILD = { name: 'Build Name', bio: 'Build bio', heroImageUrl: 'https://pub.r2.dev/sport/hero.webp', social: { x: 'y' }, r2PublicUrl: 'https://pub.r2.dev' };

describe('resolveSiteContent', () => {
  it('site.json ok → usa i dati runtime e costruisce heroUrl dalla referenza', () => {
    const site = { name: 'Runtime', bio: 'B', hero: { album: 'sport', name: 'a.webp' }, social: {} };
    expect(resolveSiteContent({ ok: true, data: site }, BUILD)).toEqual({
      name: 'Runtime', bio: 'B', social: {}, heroUrl: 'https://pub.r2.dev/sport/a.webp',
    });
  });
  it('hero null nel runtime → heroUrl null (scelta esplicita, non fallback)', () => {
    const site = { name: 'R', bio: '', hero: null, social: {} };
    expect(resolveSiteContent({ ok: true, data: site }, BUILD).heroUrl).toBeNull();
  });
  it('site.json KO → fallback silenzioso ai valori di build', () => {
    expect(resolveSiteContent({ ok: false, error: 'NETWORK' }, BUILD)).toEqual({
      name: 'Build Name', bio: 'Build bio', social: { x: 'y' }, heroUrl: 'https://pub.r2.dev/sport/hero.webp',
    });
  });
});

describe('albumsToCards', () => {
  it('mappa coverName → coverUrl; null → null', () => {
    const albums = [
      { slug: 'sport', title: 'Sport', description: 'd', coverName: 'c.webp' },
      { slug: 'x', title: 'X', description: '', coverName: null },
    ];
    expect(albumsToCards(albums, 'https://pub.r2.dev')).toEqual([
      { slug: 'sport', title: 'Sport', description: 'd', coverUrl: 'https://pub.r2.dev/sport/c.webp' },
      { slug: 'x', title: 'X', description: '', coverUrl: null },
    ]);
  });
});
```

```js
// src/components/Hero.test.js — SOSTITUISCE l'intero file esistente
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHero } from './Hero.js';

const texts = { landing: { heroSubtitle: 'Sottotitolo.' } };

describe('renderHero', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); });

  it('renderizza titolo, sottotitolo e immagine quando heroUrl è presente', () => {
    renderHero(container, { name: 'Davide', heroUrl: 'https://x/img.webp' }, texts);
    expect(container.querySelector('.hero__title').textContent).toBe('Davide');
    expect(container.querySelector('.hero__subtitle').textContent).toBe('Sottotitolo.');
    expect(container.querySelector('.hero__bg').getAttribute('src')).toBe('https://x/img.webp');
  });

  it('senza heroUrl non renderizza il tag img', () => {
    renderHero(container, { name: 'Davide', heroUrl: null }, texts);
    expect(container.querySelector('.hero__bg')).toBeNull();
    expect(container.querySelector('.hero__title').textContent).toBe('Davide');
  });
});
```

```js
// src/utils/validateConfig.test.js — SOSTITUISCE l'intero file esistente
import { describe, it, expect } from 'vitest';
import { validateSiteConfig } from './validateConfig.js';

const ok = { name: 'Davide', provider: 'r2', r2PublicUrl: 'https://pub.r2.dev' };

describe('validateSiteConfig', () => {
  it('accetta config valida', () => {
    expect(() => validateSiteConfig(ok)).not.toThrow();
  });
  it('rifiuta name vuoto, provider ignoto, r2PublicUrl mancante', () => {
    expect(() => validateSiteConfig({ ...ok, name: ' ' })).toThrow(/name/);
    expect(() => validateSiteConfig({ ...ok, provider: 'drive' })).toThrow(/provider/);
    expect(() => validateSiteConfig({ ...ok, r2PublicUrl: '' })).toThrow(/r2PublicUrl/);
    expect(() => validateSiteConfig(null)).toThrow(/siteConfig/);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/pages/home-logic.test.js src/components/Hero.test.js src/utils/validateConfig.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementa**

```js
// src/pages/home-logic.js
// Logica pura del bootstrap home: testabile senza DOM né rete.
import { photoUrl } from '../providers/r2.js';

export function resolveSiteContent(siteRes, buildConfig) {
  if (siteRes.ok) {
    const s = siteRes.data;
    return {
      name: s.name,
      bio: s.bio,
      social: s.social,
      heroUrl: s.hero ? photoUrl(buildConfig.r2PublicUrl, s.hero.album, s.hero.name) : null,
    };
  }
  // Fallback asimmetrico: il sito degrada in silenzio ai valori di build.
  return {
    name: buildConfig.name,
    bio: buildConfig.bio,
    social: buildConfig.social ?? {},
    heroUrl: buildConfig.heroImageUrl ?? null,
  };
}

export function albumsToCards(albums, r2PublicUrl) {
  return albums.map(a => ({
    slug: a.slug,
    title: a.title,
    description: a.description,
    coverUrl: a.coverName ? photoUrl(r2PublicUrl, a.slug, a.coverName) : null,
  }));
}
```

```js
// src/components/Hero.js — SOSTITUISCE l'intero file esistente
import '../styles/hero.css';

export function renderHero(container, { name, heroUrl }, texts) {
  const imgHtml = heroUrl ? `<img class="hero__bg" alt="" fetchpriority="high" decoding="sync">` : '';
  container.innerHTML = `
    <div class="hero__inner">
      ${imgHtml}
      <div class="hero__content">
        <h1 class="hero__title"></h1>
        <p class="hero__subtitle"></p>
      </div>
    </div>
  `;
  if (heroUrl) {
    container.querySelector('.hero__bg').setAttribute('src', heroUrl);
  }
  container.querySelector('.hero__title').textContent = name;
  container.querySelector('.hero__subtitle').textContent = texts.landing.heroSubtitle;
}
```

```js
// src/utils/validateConfig.js — SOSTITUISCE l'intero file esistente
// Valida SOLO la config di build (fallback): gli album vivono a runtime su R2
// e sono validati da content-rules.js (client) e dal Worker (scritture).
const KNOWN_PROVIDERS = ['r2'];

export function validateSiteConfig(siteConfig) {
  if (!siteConfig || typeof siteConfig !== 'object') {
    throw new Error('[validateSiteConfig] siteConfig non valido');
  }
  if (!siteConfig.name?.trim()) {
    throw new Error('[validateSiteConfig] siteConfig.name è obbligatorio');
  }
  if (!KNOWN_PROVIDERS.includes(siteConfig.provider)) {
    throw new Error(
      `[validateSiteConfig] siteConfig.provider "${siteConfig.provider}" non riconosciuto. Valori validi: ${KNOWN_PROVIDERS.join(', ')}`
    );
  }
  if (siteConfig.provider === 'r2' && !siteConfig.r2PublicUrl?.trim()) {
    throw new Error(
      '[validateSiteConfig] siteConfig.r2PublicUrl è obbligatorio quando provider è "r2". Controlla VITE_R2_PUBLIC_URL nel file .env.'
    );
  }
}
```

```js
// src/pages/index.js — SOSTITUISCE l'intero file esistente
import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums } from '../providers/data.js';
import { resolveSiteContent, albumsToCards } from './home-logic.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { renderHero } from '../components/Hero.js';
import { createAlbumCard } from '../components/AlbumCard.js';

validateSiteConfig(siteConfig);

renderFooter(document.getElementById('site-footer'), texts);
document.getElementById('albums-heading').textContent = texts.landing.albumsSectionHeading;

// Skeleton sulle card mentre i dati arrivano.
const cardsEl = document.getElementById('album-cards');
cardsEl.innerHTML = '<div class="album-card__skeleton"></div><div class="album-card__skeleton"></div>';

const [siteRes, albumsRes] = await Promise.all([fetchSite(), fetchAlbums()]);

const site = resolveSiteContent(siteRes, siteConfig);
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);
renderHero(document.getElementById('hero'), site, texts);

cardsEl.innerHTML = '';
if (!albumsRes.ok) {
  const p = document.createElement('p');
  p.className = 'page-error';
  p.textContent = albumsRes.error === 'NETWORK' ? texts.album.error.network : texts.album.error.unknown;
  cardsEl.appendChild(p);
} else {
  albumsToCards(albumsRes.data, siteConfig.r2PublicUrl)
    .forEach(card => cardsEl.appendChild(createAlbumCard(card)));
}
```

```js
// src/pages/contatti.js — SOSTITUISCE l'intero file esistente
import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite } from '../providers/data.js';
import { resolveSiteContent } from './home-logic.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { createContactForm } from '../components/ContactForm.js';

validateSiteConfig(siteConfig);

renderFooter(document.getElementById('site-footer'), texts);
document.getElementById('contatti-heading').textContent = texts.contatti.heading;
document.getElementById('contatti-body').textContent = texts.contatti.body;
document.getElementById('contatti-form').appendChild(createContactForm(siteConfig, texts));

const site = resolveSiteContent(await fetchSite(), siteConfig);
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);
```

Append in coda a `src/styles/album-card.css`:

```css
/* Skeleton mostrato durante il fetch runtime di albums.json */
.album-card__skeleton {
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  background: linear-gradient(100deg, var(--color-surface) 40%, #2e3235 50%, var(--color-surface) 60%);
  background-size: 200% 100%;
  animation: album-card-shimmer 1.4s infinite;
}
@keyframes album-card-shimmer {
  to { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .album-card__skeleton { animation: none; }
}
.page-error {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  padding: var(--space-xl) 0;
}
```

Nota: `index.js` e `contatti.js` usano top-level `await` — Vite lo supporta nei module scripts (target esnext di default per i moduli nativi). Se `npm run build` segnalasse un errore di target, aggiungi in `vite.config.js` dentro `build`: `target: 'es2022',`.

- [ ] **Step 4: Verifica**

Run: `npx vitest run src/pages/home-logic.test.js src/components/Hero.test.js src/utils/validateConfig.test.js && npm run build`
Expected: test PASS; build OK (album.js è ancora rotto fino al Task 8 — se `npm run build` fallisce SOLO per l'import `listPhotos` in `album.js`, procedi al Task 8 e ri-verifica la build lì).

- [ ] **Step 5: Commit**

```bash
git add src/pages/home-logic.js src/pages/home-logic.test.js src/pages/index.js src/pages/contatti.js src/components/Hero.js src/components/Hero.test.js src/utils/validateConfig.js src/utils/validateConfig.test.js src/styles/album-card.css
git commit -m "feat(site): home e contatti a dati runtime con fallback asimmetrico"
```

---

### Task 8: Pagina album — tre fetch paralleli

**Files:**
- Create: `src/pages/album-logic.js`
- Modify: `src/pages/album.js` (riscrittura completa)
- Test: `src/pages/album-logic.test.js`

**Interfaces:**
- Consumes: `fetchSite/fetchAlbums/fetchManifest` (Task 6), `photosFromManifest` (Task 6), `resolveSiteContent` (Task 7), `findAlbumBySlug` (esistente), `renderSkeletons/renderGrid` e `createLightbox` (esistenti).
- Produces: `resolveAlbumPage(slug, albumsRes, manifestRes) → {kind:'photos',album,entries} | {kind:'empty',album} | {kind:'not_found'} | {kind:'error',code:'network'|'unknown'}` dove `album = {slug,title,…}|null` (title fallback = slug).

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/pages/album-logic.test.js
import { describe, it, expect } from 'vitest';
import { resolveAlbumPage } from './album-logic.js';

const sport = { slug: 'sport', title: 'Sport', description: '', coverName: null };
const albumsOk = { ok: true, data: [sport] };
const entries = [{ name: 'a.webp', width: 1, height: 2 }];

describe('resolveAlbumPage', () => {
  it('caso valido → photos con album risolto', () => {
    expect(resolveAlbumPage('sport', albumsOk, { ok: true, data: entries }))
      .toEqual({ kind: 'photos', album: sport, entries });
  });
  it('manifest vuoto o assente ma album esistente → empty (album appena creato)', () => {
    expect(resolveAlbumPage('sport', albumsOk, { ok: true, data: [] }).kind).toBe('empty');
    expect(resolveAlbumPage('sport', albumsOk, { ok: false, error: 'NOT_FOUND' }).kind).toBe('empty');
  });
  it('slug non in albums.json → not_found (anche se il manifest esistesse)', () => {
    expect(resolveAlbumPage('fantasma', albumsOk, { ok: true, data: entries }).kind).toBe('not_found');
    expect(resolveAlbumPage('fantasma', albumsOk, { ok: false, error: 'NOT_FOUND' }).kind).toBe('not_found');
  });
  it('albums KO + manifest NOT_FOUND → not_found; albums KO + manifest ok → photos con title=slug', () => {
    const albumsKo = { ok: false, error: 'NETWORK' };
    expect(resolveAlbumPage('sport', albumsKo, { ok: false, error: 'NOT_FOUND' }).kind).toBe('not_found');
    const r = resolveAlbumPage('sport', albumsKo, { ok: true, data: entries });
    expect(r.kind).toBe('photos');
    expect(r.album.title).toBe('sport');
  });
  it('manifest NETWORK → error network; manifest MALFORMED/UNKNOWN → error unknown', () => {
    expect(resolveAlbumPage('sport', albumsOk, { ok: false, error: 'NETWORK' }))
      .toEqual({ kind: 'error', code: 'network' });
    expect(resolveAlbumPage('sport', albumsOk, { ok: false, error: 'MALFORMED' }))
      .toEqual({ kind: 'error', code: 'unknown' });
    expect(resolveAlbumPage('sport', albumsOk, { ok: false, error: 'UNKNOWN' }))
      .toEqual({ kind: 'error', code: 'unknown' });
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/pages/album-logic.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementa**

```js
// src/pages/album-logic.js
// Decisione pura della pagina album a partire dai tre fetch paralleli.
import { findAlbumBySlug } from '../utils/findAlbumBySlug.js';

export function resolveAlbumPage(slug, albumsRes, manifestRes) {
  const album = albumsRes.ok ? findAlbumBySlug(albumsRes.data, slug) : null;

  // albums.json è autorevole: se risponde e lo slug non c'è, l'album non esiste.
  if (albumsRes.ok && !album) return { kind: 'not_found' };

  if (manifestRes.ok) {
    const entries = manifestRes.data;
    const resolved = album ?? { slug, title: slug, description: '', coverName: null };
    return entries.length === 0
      ? { kind: 'empty', album: resolved }
      : { kind: 'photos', album: resolved, entries };
  }

  if (manifestRes.error === 'NOT_FOUND') {
    // Album esistente senza manifest = appena creato, nessuna foto.
    return album ? { kind: 'empty', album } : { kind: 'not_found' };
  }
  return { kind: 'error', code: manifestRes.error === 'NETWORK' ? 'network' : 'unknown' };
}
```

```js
// src/pages/album.js — SOSTITUISCE l'intero file esistente
import '../styles/main.css';
import { siteConfig } from '../../config/site.config.js';
import { texts } from '../../config/texts.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums, fetchManifest } from '../providers/data.js';
import { photosFromManifest } from '../providers/r2.js';
import { resolveSiteContent } from './home-logic.js';
import { resolveAlbumPage } from './album-logic.js';
import { renderNav } from '../components/Nav.js';
import { renderFooter } from '../components/Footer.js';
import { renderSkeletons, renderGrid } from '../components/PhotoGrid.js';
import { createLightbox } from '../components/Lightbox.js';

validateSiteConfig(siteConfig);

const gridEl = document.getElementById('photo-grid');
renderFooter(document.getElementById('site-footer'), texts);
renderSkeletons(gridEl, 12);

const slug = window.location.pathname.replace(/^\/|\/$/g, '');

// Lo slug è già noto dall'URL: nessun waterfall, tre fetch in volo insieme.
const [siteRes, albumsRes, manifestRes] = await Promise.all([
  fetchSite(),
  fetchAlbums(),
  fetchManifest(slug),
]);

const site = resolveSiteContent(siteRes, siteConfig);
renderNav(document.getElementById('site-nav'), { name: site.name }, texts);

const page = resolveAlbumPage(slug, albumsRes, manifestRes);

function showMessage(text, withHomeLink = false) {
  const p = document.createElement('p');
  p.className = 'photo-grid__error';
  p.textContent = text;
  gridEl.replaceChildren(p);
  if (withHomeLink) {
    const link = document.createElement('a');
    link.href = '/';
    link.textContent = texts.album.notFoundLink;
    gridEl.appendChild(link);
  }
}

if (page.kind === 'not_found') {
  document.getElementById('album-title').textContent = '';
  showMessage(texts.album.notFound, true);
} else if (page.kind === 'error') {
  showMessage(page.code === 'network' ? texts.album.error.network : texts.album.error.unknown);
} else {
  document.title = `${page.album.title} — ${site.name}`;
  document.getElementById('album-title').textContent = page.album.title;
  if (page.kind === 'empty') {
    showMessage(texts.album.empty);
  } else {
    const photos = photosFromManifest(page.entries, slug, siteConfig.r2PublicUrl);
    const lb = createLightbox(photos);
    renderGrid(gridEl, photos, (i, triggerEl) => lb.open(i, triggerEl));
  }
}
```

- [ ] **Step 4: Verifica (test + build ora integra)**

Run: `npx vitest run src/pages/album-logic.test.js && npm test && npm run build`
Expected: tutti PASS, build OK (nessun riferimento residuo a `listPhotos`/`albums.config` nelle pagine).

- [ ] **Step 5: Commit**

```bash
git add src/pages/album-logic.js src/pages/album-logic.test.js src/pages/album.js
git commit -m "feat(album): tre fetch paralleli con decisione pura not_found/empty/error"
```

---

### Task 9: Admin — naming/dedup e upload manager

**Files:**
- Create: `src/admin/naming.js`, `src/admin/upload-manager.js`
- Test: `src/admin/naming.test.js`, `src/admin/upload-manager.test.js`

**Interfaces:**
- Consumes: niente di runtime (logica pura con dipendenze iniettate).
- Produces: `normalizeFilename(original) → string` (sempre `.webp`); `assignUniqueName(base, takenSet) → string`; `runBatch({files, existingManifest, processFile, uploadPhoto, putManifest, onProgress?, attachGuard?, concurrency?}) → Promise<{uploaded, failed, manifest}>`; `attachBeforeUnloadGuard(win?) → detach()`. Usati dalla vista album (Task 12). Contratto `processFile(file) → Promise<{blob,width,height}>` implementato dal Task 10.

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/admin/naming.test.js
import { describe, it, expect } from 'vitest';
import { normalizeFilename, assignUniqueName } from './naming.js';

describe('normalizeFilename', () => {
  it('minuscole, spazi→trattini, charset sicuro, estensione .webp', () => {
    expect(normalizeFilename('IMG_001.JPG')).toBe('img_001.webp');
    expect(normalizeFilename('Foto Vacanze (1).png')).toBe('foto-vacanze-1.webp');
    expect(normalizeFilename('già.webp')).toBe('gi.webp');
    expect(normalizeFilename('...')).toBe('foto.webp');
  });
});

describe('assignUniqueName', () => {
  it('nome libero → invariato; occupato → suffissi -2, -3', () => {
    expect(assignUniqueName('a.webp', new Set())).toBe('a.webp');
    expect(assignUniqueName('a.webp', new Set(['a.webp']))).toBe('a-2.webp');
    expect(assignUniqueName('a.webp', new Set(['a.webp', 'a-2.webp']))).toBe('a-3.webp');
  });
});
```

```js
// src/admin/upload-manager.test.js
import { describe, it, expect, vi } from 'vitest';
import { runBatch, attachBeforeUnloadGuard } from './upload-manager.js';

const file = name => ({ name }); // basta .name per il manager
const okProcess = async () => ({ blob: 'BLOB', width: 10, height: 20 });

function makeDeps() {
  const calls = { uploads: [], manifests: [] };
  return {
    calls,
    processFile: okProcess,
    uploadPhoto: vi.fn(async name => { calls.uploads.push(name); }),
    putManifest: vi.fn(async entries => { calls.manifests.push(entries); }),
  };
}

describe('runBatch', () => {
  it('assegna nomi dedotti PRIMA degli upload (dedup su manifest + batch)', async () => {
    const d = makeDeps();
    const existing = [{ name: 'img_001.webp', width: 1, height: 1 }];
    const res = await runBatch({
      files: [file('IMG_001.JPG'), file('img 001.png')], // il primo collide col manifest → suffisso -2; il secondo normalizza in img-001.webp (nessuna collisione)
      existingManifest: existing, ...d,
    });
    expect(res.uploaded.map(u => u.name)).toEqual(['img_001-2.webp', 'img-001.webp']);
    expect(res.manifest).toEqual([...existing, ...res.uploaded]);
    expect(d.calls.manifests).toHaveLength(1); // UNA sola scrittura manifest
  });

  it('due file identici nello stesso batch non si sovrascrivono', async () => {
    const d = makeDeps();
    const res = await runBatch({ files: [file('a.jpg'), file('A.jpg')], existingManifest: [], ...d });
    expect(res.uploaded.map(u => u.name)).toEqual(['a.webp', 'a-2.webp']);
  });

  it('un fallimento non blocca il batch: manifest include solo le riuscite', async () => {
    const d = makeDeps();
    d.uploadPhoto = vi.fn(async name => { if (name === 'b.webp') throw new Error('boom'); });
    const res = await runBatch({ files: [file('a.jpg'), file('b.jpg'), file('c.jpg')], existingManifest: [], ...d });
    expect(res.uploaded.map(u => u.name)).toEqual(['a.webp', 'c.webp']);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].name).toBe('b.webp');
    expect(d.calls.manifests[0].map(e => e.name)).toEqual(['a.webp', 'c.webp']);
  });

  it('rispetta la concorrenza massima (3)', async () => {
    let active = 0, maxActive = 0;
    const d = makeDeps();
    d.processFile = async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return { blob: 'B', width: 1, height: 1 };
    };
    await runBatch({ files: Array.from({ length: 9 }, (_, i) => file(`f${i}.jpg`)), existingManifest: [], ...d });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('attacca la guardia all\'avvio e la stacca a manifest salvato (anche su errore)', async () => {
    const d = makeDeps();
    let attached = 0, detached = 0;
    const attachGuard = () => { attached++; return () => { detached++; }; };
    await runBatch({ files: [file('a.jpg')], existingManifest: [], attachGuard, ...d });
    expect(attached).toBe(1);
    expect(detached).toBe(1);
    // putManifest esplode → la guardia si stacca comunque
    d.putManifest = vi.fn(async () => { throw new Error('boom'); });
    await expect(runBatch({ files: [file('a.jpg')], existingManifest: [], attachGuard, ...d })).rejects.toThrow('boom');
    expect(detached).toBe(2);
  });

  it('onProgress riceve le fasi per ogni file', async () => {
    const d = makeDeps();
    const events = [];
    await runBatch({
      files: [file('a.jpg')], existingManifest: [], ...d,
      onProgress: (name, phase) => events.push(`${name}:${phase}`),
    });
    expect(events).toEqual(['a.webp:processing', 'a.webp:uploading', 'a.webp:done']);
  });
});

describe('attachBeforeUnloadGuard', () => {
  it('aggiunge e rimuove il listener beforeunload', () => {
    const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const detach = attachBeforeUnloadGuard(win);
    expect(win.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    detach();
    const handler = win.addEventListener.mock.calls[0][1];
    expect(win.removeEventListener).toHaveBeenCalledWith('beforeunload', handler);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/admin/`
Expected: FAIL — moduli inesistenti.

- [ ] **Step 3: Implementa**

```js
// src/admin/naming.js
// Normalizzazione nomi upload. I nomi legacy su R2 (con maiuscole) restano
// validi lato server; i NUOVI upload sono sempre normalizzati così.

export function normalizeFilename(original) {
  const stem = String(original).replace(/\.[^.]*$/, '');
  const clean = stem
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  return `${clean || 'foto'}.webp`;
}

export function assignUniqueName(base, taken) {
  if (!taken.has(base)) return base;
  const stem = base.slice(0, -'.webp'.length);
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}.webp`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

```js
// src/admin/upload-manager.js
// Orchestrazione del batch: nomi assegnati upfront, pool a concorrenza fissa,
// manifest scritto UNA volta a fine batch, guardia beforeunload nel mezzo.
import { normalizeFilename, assignUniqueName } from './naming.js';

export function attachBeforeUnloadGuard(win = window) {
  const handler = e => { e.preventDefault(); e.returnValue = ''; };
  win.addEventListener('beforeunload', handler);
  return () => win.removeEventListener('beforeunload', handler);
}

export async function runBatch({
  files,
  existingManifest,
  processFile,
  uploadPhoto,     // async (name, blob) => void
  putManifest,     // async (entries) => void
  onProgress = () => {},
  attachGuard = attachBeforeUnloadGuard,
  concurrency = 3,
}) {
  // 1. Nomi decisi PRIMA di qualsiasi upload: dedup su manifest ∪ batch.
  const taken = new Set(existingManifest.map(e => e.name));
  const jobs = files.map(f => {
    const name = assignUniqueName(normalizeFilename(f.name), taken);
    taken.add(name);
    return { file: f, name };
  });

  const uploaded = [];
  const failed = [];
  const detach = attachGuard();
  try {
    // 2. Pool a concorrenza fissa.
    let next = 0;
    async function workerLoop() {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          onProgress(job.name, 'processing');
          const { blob, width, height } = await processFile(job.file);
          onProgress(job.name, 'uploading');
          await uploadPhoto(job.name, blob);
          uploaded.push({ job, entry: { name: job.name, width, height } });
          onProgress(job.name, 'done');
        } catch (error) {
          failed.push({ name: job.name, file: job.file, error });
          onProgress(job.name, 'failed');
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, workerLoop));

    // 3. Manifest: ordine di selezione dei file, solo riuscite, UNA scrittura.
    const jobIndex = new Map(jobs.map((j, i) => [j, i]));
    uploaded.sort((a, b) => jobIndex.get(a.job) - jobIndex.get(b.job));
    const entries = uploaded.map(u => u.entry);
    const manifest = [...existingManifest, ...entries];
    await putManifest(manifest);
    return { uploaded: entries, failed, manifest };
  } finally {
    detach();
  }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run src/admin/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/naming.js src/admin/naming.test.js src/admin/upload-manager.js src/admin/upload-manager.test.js
git commit -m "feat(admin): naming/dedup a due scope e upload manager con pool e guardia"
```

---

### Task 10: Admin — pipeline di compressione ed encoder WebP (nativo/WASM)

**Files:**
- Create: `src/admin/pipeline.js`, `src/admin/encoder.js`
- Modify: `package.json` (dipendenza `@jsquash/webp`)
- Test: `src/admin/pipeline.test.js` (encoder.js è browser-only: verificato a mano nel Task 14)

**Interfaces:**
- Consumes: contratto `processFile` atteso da `runBatch` (Task 9).
- Produces: `MAX_DIMENSION` (1900), `WEBP_QUALITY` (0.85), `targetDimensions(w,h,max?) → {width,height}`, `shouldUploadAsIs(fileType,w,h) → boolean`, `processFile(file, {decode, encode}) → Promise<{blob,width,height}>`; da encoder.js: `makeProcessDeps() → Promise<{decode, encode}>` (browser). La vista album (Task 12) usa `file => processFile(file, deps)`.

- [ ] **Step 1: Installa la dipendenza (solo fallback Safari, caricata lazy)**

```bash
npm install @jsquash/webp
```

- [ ] **Step 2: Scrivi i test (falliranno)**

```js
// src/admin/pipeline.test.js
import { describe, it, expect, vi } from 'vitest';
import { targetDimensions, shouldUploadAsIs, processFile, MAX_DIMENSION, WEBP_QUALITY } from './pipeline.js';

describe('targetDimensions', () => {
  it('riduce il lato lungo a 1900 mantenendo l\'aspect ratio', () => {
    expect(targetDimensions(3800, 1900)).toEqual({ width: 1900, height: 950 });
    expect(targetDimensions(1900, 3800)).toEqual({ width: 950, height: 1900 });
  });
  it('non ingrandisce mai', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('arrotonda a interi', () => {
    const { width, height } = targetDimensions(3001, 2000);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(width).toBe(1900);
  });
});

describe('shouldUploadAsIs', () => {
  it('true solo per webp già entro i limiti', () => {
    expect(shouldUploadAsIs('image/webp', 1900, 1000)).toBe(true);
    expect(shouldUploadAsIs('image/webp', 1901, 1000)).toBe(false);
    expect(shouldUploadAsIs('image/jpeg', 800, 600)).toBe(false);
  });
});

describe('processFile', () => {
  it('webp piccolo → as-is: nessun encode, blob = file originale', async () => {
    const decode = vi.fn(async () => ({ bitmap: 'BMP', width: 1000, height: 800 }));
    const encode = vi.fn();
    const file = { type: 'image/webp' };
    const res = await processFile(file, { decode, encode });
    expect(res).toEqual({ blob: file, width: 1000, height: 800 });
    expect(encode).not.toHaveBeenCalled();
  });
  it('jpeg grande → resize + encode con qualità 0.85', async () => {
    const decode = vi.fn(async () => ({ bitmap: 'BMP', width: 3800, height: 1900 }));
    const encode = vi.fn(async () => 'WEBP_BLOB');
    const res = await processFile({ type: 'image/jpeg' }, { decode, encode });
    expect(encode).toHaveBeenCalledWith('BMP', 1900, 950, WEBP_QUALITY);
    expect(res).toEqual({ blob: 'WEBP_BLOB', width: 1900, height: 950 });
  });
  it('MAX_DIMENSION è 1900 (stesso limite di compress.js)', () => {
    expect(MAX_DIMENSION).toBe(1900);
  });
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npx vitest run src/admin/pipeline.test.js`
Expected: FAIL.

- [ ] **Step 4: Implementa**

```js
// src/admin/pipeline.js
// Sostituto client-side di compress.js: stesse regole (1900px, q85, mai
// ingrandire, as-is per webp già ottimizzati). Decode/encode iniettati:
// la logica è testabile senza canvas.

export const MAX_DIMENSION = 1900;
export const WEBP_QUALITY = 0.85;

export function targetDimensions(width, height, max = MAX_DIMENSION) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function shouldUploadAsIs(fileType, width, height) {
  return fileType === 'image/webp' && width <= MAX_DIMENSION && height <= MAX_DIMENSION;
}

export async function processFile(file, { decode, encode }) {
  const { bitmap, width, height } = await decode(file);
  if (shouldUploadAsIs(file.type, width, height)) {
    return { blob: file, width, height };
  }
  const target = targetDimensions(width, height);
  const blob = await encode(bitmap, target.width, target.height, WEBP_QUALITY);
  return { blob, width: target.width, height: target.height };
}
```

```js
// src/admin/encoder.js
// Browser-only (canvas + createImageBitmap): niente test jsdom, verifica
// manuale nel rollout. Safari non sa encodare WebP → fallback WASM lazy:
// Chrome/Android non scaricano mai il chunk @jsquash/webp.

function drawTo(bitmap, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob ha restituito null'))), type, quality);
  });
}

async function nativeWebpSupported() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  try {
    const blob = await canvasToBlob(canvas, 'image/webp', 0.8);
    return blob.type === 'image/webp'; // Safari risponde con PNG
  } catch {
    return false;
  }
}

export async function makeProcessDeps() {
  const decode = async file => {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  };

  if (await nativeWebpSupported()) {
    return {
      decode,
      encode: async (bitmap, w, h, q) => canvasToBlob(drawTo(bitmap, w, h), 'image/webp', q),
    };
  }

  // Fallback Safari: libwebp compilato in WASM, import dinamico (chunk lazy).
  const { encode: wasmEncode } = await import('@jsquash/webp');
  return {
    decode,
    encode: async (bitmap, w, h, q) => {
      const imageData = drawTo(bitmap, w, h).getContext('2d').getImageData(0, 0, w, h);
      const buffer = await wasmEncode(imageData, { quality: Math.round(q * 100) });
      return new Blob([buffer], { type: 'image/webp' });
    },
  };
}
```

- [ ] **Step 5: Verifica che passino**

Run: `npx vitest run src/admin/pipeline.test.js && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/admin/pipeline.js src/admin/pipeline.test.js src/admin/encoder.js package.json package-lock.json
git commit -m "feat(admin): pipeline compressione client-side con encoder nativo/WASM"
```

---

### Task 11: Admin — shell: entry point, router, API client, sortable, vista home

**Files:**
- Create: `admin.html`, `src/pages/admin.js`, `src/admin/router.js`, `src/admin/api.js`, `src/admin/sortable.js`, `src/admin/views/home.js`, `src/admin/views/album.js` (stub, completato nel Task 12), `src/styles/admin.css`
- Modify: `vite.config.js` (input `admin`)
- Test: `src/admin/router.test.js`, `src/admin/api.test.js`, `src/admin/sortable.test.js`, `src/admin/views/home.test.js`

**Interfaces:**
- Consumes: `fetchSite/fetchAlbums/fetchManifest` (Task 6), `photoUrl` (Task 6), `slugifyTitle/SLUG_RE/RESERVED_SLUGS` (Task 1), `siteConfig` build (fallback).
- Produces: `parseAdminHash(hash) → {view:'home'}|{view:'album',slug}`; `adminApi = {putSite, putAlbums, putManifest, uploadPhoto, deletePhoto, deleteAlbum}` (tutte async, throw su !ok con `Error(status)`); `moveItem(arr, from, to) → arr nuovo`; `attachSortable(listEl, onMove)`; `renderAdminHome(container, ctx)` con `ctx = {site, albums, r2PublicUrl, api, navigate, deps}` e `deps = {attachSortable, fetchManifest, prompt}`. La vista album (Task 12) riceve lo stesso shape di ctx.

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/admin/router.test.js
import { describe, it, expect } from 'vitest';
import { parseAdminHash } from './router.js';

describe('parseAdminHash', () => {
  it('vuoto o #/ → home; #/album/slug → album; garbage → home', () => {
    expect(parseAdminHash('')).toEqual({ view: 'home' });
    expect(parseAdminHash('#/')).toEqual({ view: 'home' });
    expect(parseAdminHash('#/album/sport')).toEqual({ view: 'album', slug: 'sport' });
    expect(parseAdminHash('#/album/NO SLUG')).toEqual({ view: 'home' });
    expect(parseAdminHash('#/boh')).toEqual({ view: 'home' });
  });
});
```

```js
// src/admin/api.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminApi } from './api.js';

afterEach(() => vi.unstubAllGlobals());
const okRes = () => new Response('{"ok":true}', { status: 200 });

describe('adminApi', () => {
  it('putManifest fa PUT JSON sull\'endpoint giusto', async () => {
    const f = vi.stubGlobal('fetch', vi.fn(async () => okRes()));
    await adminApi.putManifest('sport', []);
    expect(f).toHaveBeenCalledWith('/api/admin/albums/sport/manifest', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '[]',
    });
  });
  it('uploadPhoto fa PUT binario con content-type image/webp e nome URL-encoded', async () => {
    const f = vi.stubGlobal('fetch', vi.fn(async () => okRes()));
    const blob = new Blob(['x'], { type: 'image/webp' });
    await adminApi.uploadPhoto('sport', 'foto.webp', blob);
    expect(f).toHaveBeenCalledWith('/api/admin/albums/sport/photos/foto.webp', {
      method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: blob,
    });
  });
  it('deleteAlbum e deletePhoto usano DELETE; errore HTTP → throw con status', async () => {
    const f = vi.stubGlobal('fetch', vi.fn(async () => okRes()));
    await adminApi.deleteAlbum('sport');
    expect(f).toHaveBeenLastCalledWith('/api/admin/albums/sport', { method: 'DELETE' });
    await adminApi.deletePhoto('sport', 'a.webp');
    expect(f).toHaveBeenLastCalledWith('/api/admin/albums/sport/photos/a.webp', { method: 'DELETE' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"x"}', { status: 401 })));
    await expect(adminApi.putSite({})).rejects.toThrow('401');
  });
});
```

```js
// src/admin/sortable.test.js
import { describe, it, expect } from 'vitest';
import { moveItem } from './sortable.js';

describe('moveItem', () => {
  it('sposta un elemento senza mutare l\'originale', () => {
    const arr = ['a', 'b', 'c', 'd'];
    expect(moveItem(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(arr, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(arr).toEqual(['a', 'b', 'c', 'd']);
  });
  it('indici uguali o fuori range → copia invariata', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});
```

```js
// src/admin/views/home.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderAdminHome } from './home.js';

const SITE = { name: 'Davide', bio: 'Bio', hero: null, social: { instagram: '' } };
const ALBUMS = [
  { slug: 'sport', title: 'Sport', description: '', coverName: null },
  { slug: 'viaggi', title: 'Viaggi', description: '', coverName: null },
];

function makeCtx(over = {}) {
  return {
    site: structuredClone(SITE),
    albums: structuredClone(ALBUMS),
    r2PublicUrl: 'https://pub.r2.dev',
    api: {
      putSite: vi.fn(async () => {}), putAlbums: vi.fn(async () => {}),
      deleteAlbum: vi.fn(async () => {}),
    },
    navigate: vi.fn(),
    deps: {
      attachSortable: vi.fn(), // cattura onMove
      fetchManifest: vi.fn(async () => ({ ok: true, data: [] })),
      prompt: vi.fn(() => null),
    },
    ...over,
  };
}

describe('renderAdminHome', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.replaceChildren(container); });

  it('renderizza form sito e lista album', () => {
    renderAdminHome(container, makeCtx());
    expect(container.querySelector('[name="site-name"]').value).toBe('Davide');
    expect(container.querySelectorAll('.admin-album-row')).toHaveLength(2);
  });

  it('salva il sito con i valori del form', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="site-name"]').value = 'Nuovo Nome';
    container.querySelector('.admin-save-site').click();
    await vi.waitFor(() => expect(ctx.api.putSite).toHaveBeenCalled());
    expect(ctx.api.putSite.mock.calls[0][0].name).toBe('Nuovo Nome');
    expect(ctx.api.putSite.mock.calls[0][0].hero).toBeNull(); // hero preservato
  });

  it('crea un album: slugify, putAlbums e navigate', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="new-album-title"]').value = 'Street Photo';
    container.querySelector('.admin-create-album').click();
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalled());
    const sent = ctx.api.putAlbums.mock.calls[0][0];
    expect(sent[2]).toEqual({ slug: 'street-photo', title: 'Street Photo', description: '', coverName: null });
    expect(ctx.navigate).toHaveBeenCalledWith('#/album/street-photo');
  });

  it('rifiuta slug riservato o duplicato senza chiamare l\'API', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    container.querySelector('[name="new-album-title"]').value = 'Admin';
    container.querySelector('.admin-create-album').click();
    await Promise.resolve();
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
    expect(container.querySelector('.admin-status').textContent).not.toBe('');
    container.querySelector('[name="new-album-title"]').value = 'Sport';
    container.querySelector('.admin-create-album').click();
    await Promise.resolve();
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
  });

  it('riordino via sortable → putAlbums con l\'ordine nuovo', async () => {
    const ctx = makeCtx();
    renderAdminHome(container, ctx);
    const onMove = ctx.deps.attachSortable.mock.calls[0][1];
    onMove(0, 1);
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalled());
    expect(ctx.api.putAlbums.mock.calls[0][0].map(a => a.slug)).toEqual(['viaggi', 'sport']);
  });

  it('cancellazione: richiede il nome esatto via prompt', async () => {
    const ctx = makeCtx();
    ctx.deps.prompt = vi.fn(() => 'Sport'); // nome giusto
    renderAdminHome(container, ctx);
    container.querySelectorAll('.admin-delete-album')[0].click();
    await vi.waitFor(() => expect(ctx.api.deleteAlbum).toHaveBeenCalledWith('sport'));
    // nome sbagliato → nessuna chiamata
    const ctx2 = makeCtx();
    ctx2.deps.prompt = vi.fn(() => 'sbagliato');
    renderAdminHome(container, ctx2);
    container.querySelectorAll('.admin-delete-album')[0].click();
    await Promise.resolve();
    expect(ctx2.api.deleteAlbum).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/admin/router.test.js src/admin/api.test.js src/admin/sortable.test.js src/admin/views/home.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementa i moduli**

```js
// src/admin/router.js
import { SLUG_RE } from '../shared/content-rules.js';

export function parseAdminHash(hash) {
  const m = String(hash).match(/^#\/album\/([^/]+)$/);
  if (m && SLUG_RE.test(m[1])) return { view: 'album', slug: m[1] };
  return { view: 'home' };
}
```

```js
// src/admin/api.js
// Client REST verso /api/admin/*. Il JWT viaggia da solo: Cloudflare Access
// inietta il cookie/header sulla stessa origin, nessuna gestione client.

async function send(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res;
}
const putJson = (path, data) =>
  send(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const adminApi = {
  putSite: site => putJson('/api/admin/site', site),
  putAlbums: albums => putJson('/api/admin/albums', { albums }),
  putManifest: (slug, entries) => putJson(`/api/admin/albums/${slug}/manifest`, entries),
  uploadPhoto: (slug, name, blob) =>
    send(`/api/admin/albums/${slug}/photos/${encodeURIComponent(name)}`, {
      method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: blob,
    }),
  deletePhoto: (slug, name) =>
    send(`/api/admin/albums/${slug}/photos/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  deleteAlbum: slug => send(`/api/admin/albums/${slug}`, { method: 'DELETE' }),
};
```

```js
// src/admin/sortable.js
// Drag & drop minimale per liste verticali. La logica di riordino è pura
// (moveItem); il DOM emette solo (from, to).

export function moveItem(arr, from, to) {
  const copy = [...arr];
  if (from === to || from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function attachSortable(listEl, onMove) {
  let fromIndex = null;
  const indexOf = el => [...listEl.children].indexOf(el.closest('[draggable]'));
  listEl.addEventListener('dragstart', e => { fromIndex = indexOf(e.target); });
  listEl.addEventListener('dragover', e => e.preventDefault());
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    const to = indexOf(e.target);
    if (fromIndex !== null && to !== -1 && to !== fromIndex) onMove(fromIndex, to);
    fromIndex = null;
  });
}
```

```js
// src/admin/views/home.js
import { photoUrl } from '../../providers/r2.js';
import { slugifyTitle, SLUG_RE, RESERVED_SLUGS } from '../../shared/content-rules.js';
import { moveItem } from '../sortable.js';

export function renderAdminHome(container, ctx) {
  const { site, albums, r2PublicUrl, api, navigate, deps } = ctx;
  const heroSrc = site.hero ? photoUrl(r2PublicUrl, site.hero.album, site.hero.name) : null;

  container.innerHTML = `
    <section class="admin-panel">
      <h2>Sito</h2>
      <label>Nome <input name="site-name" type="text"></label>
      <label>Bio <textarea name="site-bio" rows="2"></textarea></label>
      <label>Instagram <input name="site-instagram" type="url" placeholder="https://instagram.com/…"></label>
      <div class="admin-hero">
        <span>Hero:</span>
        ${heroSrc ? `<img class="admin-hero__thumb" alt="">` : '<em>nessuna</em>'}
        <select name="hero-album"><option value="">Scegli album…</option></select>
        <div class="admin-hero__picker"></div>
      </div>
      <button class="admin-save-site">Salva sito</button>
      <p class="admin-status" role="status"></p>
    </section>
    <section class="admin-panel">
      <h2>Album</h2>
      <div class="admin-album-list"></div>
      <div class="admin-new-album">
        <input name="new-album-title" type="text" placeholder="Titolo nuovo album">
        <button class="admin-create-album">Nuovo album</button>
      </div>
    </section>
  `;

  const q = sel => container.querySelector(sel);
  const status = q('.admin-status');
  const say = msg => { status.textContent = msg; };
  const run = fn => fn().catch(err => say(`Errore: ${err.message}`));

  // --- form sito ---
  q('[name="site-name"]').value = site.name;
  q('[name="site-bio"]').value = site.bio;
  q('[name="site-instagram"]').value = site.social.instagram ?? '';
  if (heroSrc) q('.admin-hero__thumb').setAttribute('src', heroSrc);

  q('.admin-save-site').addEventListener('click', () => run(async () => {
    const updated = {
      name: q('[name="site-name"]').value.trim(),
      bio: q('[name="site-bio"]').value,
      hero: site.hero,
      social: { ...site.social, instagram: q('[name="site-instagram"]').value.trim() },
    };
    await api.putSite(updated);
    ctx.site = updated;
    say('Sito salvato.');
  }));

  // --- hero picker: scegli album → thumbs → click imposta hero ---
  const heroSelect = q('[name="hero-album"]');
  for (const a of albums) {
    const opt = document.createElement('option');
    opt.value = a.slug;
    opt.textContent = a.title;
    heroSelect.appendChild(opt);
  }
  heroSelect.addEventListener('change', () => run(async () => {
    const picker = q('.admin-hero__picker');
    picker.innerHTML = '';
    if (!heroSelect.value) return;
    const res = await deps.fetchManifest(heroSelect.value);
    if (!res.ok) { say('Impossibile leggere le foto di questo album.'); return; }
    for (const entry of res.data) {
      const img = document.createElement('img');
      img.className = 'admin-hero__choice';
      img.src = photoUrl(r2PublicUrl, heroSelect.value, entry.name);
      img.addEventListener('click', () => run(async () => {
        const updated = { ...ctx.site, hero: { album: heroSelect.value, name: entry.name } };
        await api.putSite(updated);
        ctx.site = updated;
        renderAdminHome(container, ctx); // re-render con la nuova hero
      }));
      picker.appendChild(img);
    }
  }));

  // --- lista album: riordino drag&drop, apri, cancella ---
  const list = q('.admin-album-list');
  for (const a of albums) {
    const row = document.createElement('div');
    row.className = 'admin-album-row';
    row.draggable = true;
    row.innerHTML = `
      <span class="admin-album-row__handle">⋮⋮</span>
      <a class="admin-album-row__title" href="#/album/${a.slug}"></a>
      <button class="admin-delete-album" title="Elimina album">Elimina</button>
    `;
    row.querySelector('.admin-album-row__title').textContent = a.title;
    row.querySelector('.admin-delete-album').addEventListener('click', () => run(async () => {
      const typed = deps.prompt(`Per eliminare scrivi il nome esatto dell'album: "${a.title}"`);
      if (typed !== a.title) { say('Nome non corrispondente: cancellazione annullata.'); return; }
      await api.deleteAlbum(a.slug);
      ctx.albums = ctx.albums.filter(x => x.slug !== a.slug);
      renderAdminHome(container, ctx);
    }));
    list.appendChild(row);
  }
  deps.attachSortable(list, (from, to) => run(async () => {
    const reordered = moveItem(ctx.albums, from, to);
    await api.putAlbums(reordered);
    ctx.albums = reordered;
    renderAdminHome(container, ctx);
  }));

  // --- nuovo album ---
  q('.admin-create-album').addEventListener('click', () => run(async () => {
    const title = q('[name="new-album-title"]').value.trim();
    const slug = slugifyTitle(title);
    if (!title || !SLUG_RE.test(slug)) { say('Titolo non valido.'); return; }
    if (RESERVED_SLUGS.includes(slug)) { say(`"${slug}" è un nome riservato.`); return; }
    if (ctx.albums.some(a => a.slug === slug)) { say(`Esiste già un album "${slug}".`); return; }
    const next = [...ctx.albums, { slug, title, description: '', coverName: null }];
    await api.putAlbums(next);
    ctx.albums = next;
    navigate(`#/album/${slug}`);
  }));
}
```

```js
// src/admin/views/album.js — STUB (completato nel Task 12)
export function renderAdminAlbum(container) {
  container.innerHTML = '<p class="admin-status">Vista album in arrivo…</p>';
}
```

```js
// src/pages/admin.js
import '../styles/admin.css';
import { siteConfig } from '../../config/site.config.js';
import { validateSiteConfig } from '../utils/validateConfig.js';
import { fetchSite, fetchAlbums, fetchManifest } from '../providers/data.js';
import { adminApi } from '../admin/api.js';
import { parseAdminHash } from '../admin/router.js';
import { attachSortable } from '../admin/sortable.js';
import { renderAdminHome } from '../admin/views/home.js';
import { renderAdminAlbum } from '../admin/views/album.js';
import { runBatch } from '../admin/upload-manager.js';
import { processFile } from '../admin/pipeline.js';
import { makeProcessDeps } from '../admin/encoder.js';

validateSiteConfig(siteConfig);
const root = document.getElementById('admin-root');
root.innerHTML = '<p class="admin-status">Caricamento…</p>';

const [siteRes, albumsRes] = await Promise.all([fetchSite(), fetchAlbums()]);

// Primo avvio: _site/site.json può non esistere ancora → base editabile dai default build.
const ctx = {
  site: siteRes.ok
    ? siteRes.data
    : { name: siteConfig.name, bio: siteConfig.bio ?? '', hero: null, social: {} },
  albums: albumsRes.ok ? albumsRes.data : [],
  r2PublicUrl: siteConfig.r2PublicUrl,
  api: adminApi,
  navigate: hash => { window.location.hash = hash; },
  deps: {
    attachSortable,
    fetchManifest,
    prompt: window.prompt.bind(window),
    runBatch,
    makeProcessFile: async () => {
      const deps = await makeProcessDeps();
      return file => processFile(file, deps);
    },
  },
};

function renderRoute() {
  const route = parseAdminHash(window.location.hash);
  if (route.view === 'album') renderAdminAlbum(root, { ...ctx, slug: route.slug });
  else renderAdminHome(root, ctx);
}
window.addEventListener('hashchange', renderRoute);
if (!albumsRes.ok) {
  root.innerHTML = '<p class="admin-status">Impossibile caricare gli album (rete o dati mancanti). Ricarica la pagina.</p>';
} else {
  renderRoute();
}
```

```html
<!-- admin.html (root del repo, accanto a index.html) -->
<!doctype html>
<html lang="{{SITE_LANG}}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin — {{SITE_NAME}}</title>
    <meta name="robots" content="noindex" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600&family=IBM+Plex+Mono:wght@400&display=swap">
  </head>
  <body>
    <main id="admin-root" class="admin-root"></main>
    <script type="module" src="/src/pages/admin.js"></script>
  </body>
</html>
```

In `vite.config.js`, dentro `rollupOptions.input`, aggiungi:

```js
        admin: resolve(__dirname, 'admin.html'),
```

```css
/* src/styles/admin.css */
@import '../../theme/tokens.css';
@import '../../theme/typography.css';

*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); }

.admin-root { max-width: 900px; margin: 0 auto; padding: var(--space-lg); }
.admin-panel { background: var(--color-surface); border-radius: var(--radius-md); padding: var(--space-lg); margin-bottom: var(--space-lg); }
.admin-panel h2 { margin: 0 0 var(--space-md); font-weight: 400; }
.admin-panel label { display: block; margin-bottom: var(--space-md); font-size: 0.9rem; }
.admin-panel input, .admin-panel textarea, .admin-panel select {
  width: 100%; margin-top: var(--space-xs); padding: var(--space-sm);
  background: var(--color-bg); color: var(--color-text);
  border: 1px solid #2e3235; border-radius: var(--radius-sm); font: inherit;
}
.admin-panel button {
  padding: var(--space-sm) var(--space-md); border: 0; border-radius: var(--radius-sm);
  background: var(--color-accent); color: var(--color-bg); font: inherit; cursor: pointer;
}
.admin-status { font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-muted); min-height: 1.2em; }

.admin-hero { display: flex; flex-wrap: wrap; gap: var(--space-sm); align-items: center; margin-bottom: var(--space-md); }
.admin-hero__thumb { width: 72px; height: 48px; object-fit: cover; border-radius: var(--radius-sm); }
.admin-hero__picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: var(--space-xs); width: 100%; }
.admin-hero__choice { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm); cursor: pointer; }
.admin-hero__choice:hover { outline: 2px solid var(--color-accent); }

.admin-album-row {
  display: flex; align-items: center; gap: var(--space-md);
  padding: var(--space-sm); border-radius: var(--radius-sm); background: var(--color-bg);
  margin-bottom: var(--space-xs); cursor: grab;
}
.admin-album-row__handle { color: var(--color-muted); }
.admin-album-row__title { color: var(--color-text); text-decoration: none; flex: 1; }
.admin-delete-album { background: transparent; color: var(--color-muted); border: 1px solid #2e3235; }
.admin-new-album { display: flex; gap: var(--space-sm); margin-top: var(--space-md); }
.admin-new-album input { flex: 1; margin-top: 0; }
```

- [ ] **Step 4: Verifica**

Run: `npx vitest run src/admin/ && npm run build`
Expected: test PASS; build genera `dist/admin.html`.

- [ ] **Step 5: Commit**

```bash
git add admin.html src/pages/admin.js src/admin/router.js src/admin/router.test.js src/admin/api.js src/admin/api.test.js src/admin/sortable.js src/admin/sortable.test.js src/admin/views/home.js src/admin/views/home.test.js src/admin/views/album.js src/styles/admin.css vite.config.js
git commit -m "feat(admin): shell dashboard — router hash, API client, sortable, vista home"
```

---

### Task 12: Admin — vista dettaglio album (upload, riordino, cover, delete)

**Files:**
- Modify: `src/admin/views/album.js` (sostituisce lo stub), `src/styles/admin.css` (append)
- Test: `src/admin/views/album.test.js`

**Interfaces:**
- Consumes: `runBatch` (Task 9) e `makeProcessFile` (Task 11 ctx.deps, wrappa Task 10); `adminApi` (Task 11); `photoUrl` (Task 6); `moveItem` (Task 11); `fetchManifest` (Task 6, via deps).
- Produces: `renderAdminAlbum(container, ctx)` con `ctx = {slug, site, albums, r2PublicUrl, api, navigate, deps}`.

- [ ] **Step 1: Scrivi i test (falliranno)**

```js
// src/admin/views/album.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderAdminAlbum } from './album.js';

const MANIFEST = [
  { name: 'a.webp', width: 1, height: 1 },
  { name: 'b.webp', width: 1, height: 1 },
];

function makeCtx(over = {}) {
  return {
    slug: 'sport',
    albums: [{ slug: 'sport', title: 'Sport', description: '', coverName: null }],
    site: { name: 'D', bio: '', hero: null, social: {} },
    r2PublicUrl: 'https://pub.r2.dev',
    api: {
      putManifest: vi.fn(async () => {}), putAlbums: vi.fn(async () => {}),
      deletePhoto: vi.fn(async () => {}), uploadPhoto: vi.fn(async () => {}),
    },
    navigate: vi.fn(),
    deps: {
      attachSortable: vi.fn(),
      fetchManifest: vi.fn(async () => ({ ok: true, data: structuredClone(MANIFEST) })),
      prompt: vi.fn(() => null),
      confirm: vi.fn(() => true),
      runBatch: vi.fn(async () => ({ uploaded: [], failed: [], manifest: MANIFEST })),
      makeProcessFile: vi.fn(async () => async () => ({ blob: 'B', width: 1, height: 1 })),
    },
    ...over,
  };
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('renderAdminAlbum', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.replaceChildren(container); });

  it('carica il manifest e renderizza le foto con URL pubblici', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const imgs = container.querySelectorAll('.admin-photo__img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toBe('https://pub.r2.dev/sport/a.webp');
  });

  it('manifest 404 (album nuovo) → griglia vuota, nessun errore', async () => {
    const ctx = makeCtx();
    ctx.deps.fetchManifest = vi.fn(async () => ({ ok: false, error: 'NOT_FOUND' }));
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelectorAll('.admin-photo')).toHaveLength(0);
    expect(container.querySelector('.admin-dropzone')).not.toBeNull();
  });

  it('riordino → putManifest con ordine nuovo', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const onMove = ctx.deps.attachSortable.mock.calls[0][1];
    onMove(0, 1);
    await vi.waitFor(() => expect(ctx.api.putManifest).toHaveBeenCalled());
    expect(ctx.api.putManifest.mock.calls[0][1].map(e => e.name)).toEqual(['b.webp', 'a.webp']);
  });

  it('"Cover" → putAlbums con coverName aggiornato', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalled());
    expect(ctx.api.putAlbums.mock.calls[0][0][0].coverName).toBe('b.webp');
  });

  it('elimina foto (confirm) → deletePhoto e rimozione dalla griglia', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__delete')[0].click();
    await vi.waitFor(() => expect(ctx.api.deletePhoto).toHaveBeenCalledWith('sport', 'a.webp'));
    expect(container.querySelectorAll('.admin-photo')).toHaveLength(1);
  });

  it('selezione file → runBatch cablato su api e manifest corrente', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const input = container.querySelector('.admin-dropzone input[type="file"]');
    Object.defineProperty(input, 'files', { value: [{ name: 'x.jpg', type: 'image/jpeg' }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(ctx.deps.runBatch).toHaveBeenCalled());
    const args = ctx.deps.runBatch.mock.calls[0][0];
    expect(args.existingManifest.map(e => e.name)).toEqual(['a.webp', 'b.webp']);
    await args.uploadPhoto('n.webp', 'BLOB');
    expect(ctx.api.uploadPhoto).toHaveBeenCalledWith('sport', 'n.webp', 'BLOB');
    await args.putManifest([]);
    expect(ctx.api.putManifest).toHaveBeenCalledWith('sport', []);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run src/admin/views/album.test.js`
Expected: FAIL (lo stub non fa nulla di tutto ciò).

- [ ] **Step 3: Implementa — sostituisci integralmente lo stub**

```js
// src/admin/views/album.js
import { photoUrl } from '../../providers/r2.js';
import { moveItem } from '../sortable.js';

export function renderAdminAlbum(container, ctx) {
  const { slug, r2PublicUrl, api, deps } = ctx;
  const album = ctx.albums.find(a => a.slug === slug);
  container.innerHTML = `
    <p><a class="admin-back" href="#/">← Tutti gli album</a></p>
    <section class="admin-panel">
      <h2></h2>
      <div class="admin-photo-grid"></div>
      <div class="admin-dropzone">
        <p>Trascina qui le foto o</p>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp">
      </div>
      <ul class="admin-progress"></ul>
      <p class="admin-status" role="status"></p>
    </section>
  `;
  container.querySelector('h2').textContent = album?.title ?? slug;

  const q = sel => container.querySelector(sel);
  const status = q('.admin-status');
  const say = msg => { status.textContent = msg; };
  const run = fn => fn().catch(err => say(`Errore: ${err.message}`));

  let manifest = [];

  function renderPhotos() {
    const grid = q('.admin-photo-grid');
    grid.innerHTML = '';
    manifest.forEach(entry => {
      const cell = document.createElement('figure');
      cell.className = 'admin-photo';
      cell.draggable = true;
      cell.innerHTML = `
        <img class="admin-photo__img" alt="" loading="lazy">
        <div class="admin-photo__actions">
          <button class="admin-photo__cover" title="Usa come cover">Cover</button>
          <button class="admin-photo__delete" title="Elimina">✕</button>
        </div>
      `;
      cell.querySelector('.admin-photo__img').setAttribute('src', photoUrl(r2PublicUrl, slug, entry.name));
      cell.querySelector('.admin-photo__cover').addEventListener('click', () => run(async () => {
        const updated = ctx.albums.map(a => (a.slug === slug ? { ...a, coverName: entry.name } : a));
        await api.putAlbums(updated);
        ctx.albums = updated;
        say(`Cover: ${entry.name}`);
      }));
      cell.querySelector('.admin-photo__delete').addEventListener('click', () => run(async () => {
        if (!deps.confirm(`Eliminare ${entry.name}?`)) return;
        await api.deletePhoto(slug, entry.name);
        manifest = manifest.filter(e => e.name !== entry.name);
        renderPhotos();
      }));
      grid.appendChild(cell);
    });
    deps.attachSortable(grid, (from, to) => run(async () => {
      const reordered = moveItem(manifest, from, to);
      await api.putManifest(slug, reordered);
      manifest = reordered;
      renderPhotos();
    }));
  }

  async function startUpload(files) {
    if (files.length === 0) return;
    const progress = q('.admin-progress');
    progress.innerHTML = '';
    const rows = new Map();
    const processFile = await deps.makeProcessFile();
    await run(async () => {
      const result = await deps.runBatch({
        files: [...files],
        existingManifest: manifest,
        processFile,
        uploadPhoto: (name, blob) => api.uploadPhoto(slug, name, blob),
        putManifest: entries => api.putManifest(slug, entries),
        onProgress: (name, phase) => {
          if (!rows.has(name)) {
            const li = document.createElement('li');
            rows.set(name, li);
            progress.appendChild(li);
          }
          rows.get(name).textContent = `${name} — ${phase}`;
        },
      });
      manifest = result.manifest;
      renderPhotos();
      say(result.failed.length === 0
        ? `Caricate ${result.uploaded.length} foto.`
        : `Caricate ${result.uploaded.length}, fallite ${result.failed.length}: riprova trascinandole di nuovo.`);
    });
  }

  const dropzone = q('.admin-dropzone');
  const fileInput = dropzone.querySelector('input[type="file"]');
  fileInput.addEventListener('change', () => startUpload(fileInput.files));
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('admin-dropzone--over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('admin-dropzone--over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('admin-dropzone--over');
    startUpload(e.dataTransfer?.files ?? []);
  });

  // Bootstrap: manifest 404 = album appena creato, griglia vuota.
  run(async () => {
    const res = await deps.fetchManifest(slug);
    if (res.ok) manifest = res.data;
    else if (res.error !== 'NOT_FOUND') { say('Impossibile caricare il manifest.'); return; }
    renderPhotos();
  });
}
```

Append in coda a `src/styles/admin.css`:

```css
.admin-back { color: var(--color-muted); text-decoration: none; font-family: var(--font-mono); font-size: 0.8rem; }
.admin-photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--space-sm); margin-bottom: var(--space-md); }
.admin-photo { position: relative; margin: 0; cursor: grab; }
.admin-photo__img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm); display: block; }
.admin-photo__actions { position: absolute; inset: auto 0 0 0; display: flex; justify-content: space-between; padding: var(--space-xs); }
.admin-photo__actions button { font-size: 0.7rem; padding: 2px 6px; }
.admin-photo__delete { background: rgba(0,0,0,0.6); color: var(--color-text); }
.admin-dropzone { border: 2px dashed #2e3235; border-radius: var(--radius-md); padding: var(--space-lg); text-align: center; }
.admin-dropzone--over { border-color: var(--color-accent); }
.admin-progress { list-style: none; padding: 0; font-family: var(--font-mono); font-size: 0.75rem; color: var(--color-muted); }
```

- [ ] **Step 4: Verifica**

Run: `npx vitest run src/admin/ && npm test && npm run build`
Expected: PASS, build OK.

- [ ] **Step 5: Commit**

```bash
git add src/admin/views/album.js src/admin/views/album.test.js src/styles/admin.css
git commit -m "feat(admin): vista album — upload batch, riordino, cover, delete"
```

---

### Task 13: Migrazione config→R2, binding wrangler, cleanup albums.config

**Files:**
- Create: `scripts/migrate.js`
- Modify: `wrangler.json`, `package.json` (script `migrate`)
- Delete: `config/albums.config.js`
- Test: `scripts/migrate.test.js`

**Interfaces:**
- Consumes: `config/site.config.js`, `config/albums.config.js` (ultima lettura prima dell'eliminazione dal runtime — lo script li trasforma).
- Produces: `albumsToRuntime(albums) → {albums:[…coverName…]}`, `siteToRuntime(siteConfig) → {name,bio,hero,social}`, `parseHeroRef(url) → {album,name}|null` (esportate per i test); su R2: `_site/site.json`, `_data/albums.json`.

- [ ] **Step 1: Scrivi i test delle trasformazioni (falliranno)**

```js
// scripts/migrate.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseHeroRef, albumsToRuntime, siteToRuntime } from './migrate.js';

describe('parseHeroRef', () => {
  it('estrae album e nome dagli URL R2', () => {
    expect(parseHeroRef('https://pub-x.r2.dev/sport/4x5-crop-7302.webp'))
      .toEqual({ album: 'sport', name: '4x5-crop-7302.webp' });
  });
  it('URL senza due segmenti o vuoto → null', () => {
    expect(parseHeroRef('https://pub-x.r2.dev/solo.webp')).toBeNull();
    expect(parseHeroRef('')).toBeNull();
    expect(parseHeroRef(undefined)).toBeNull();
  });
});

describe('albumsToRuntime', () => {
  it('converte coverUrl assoluto in coverName relativo', () => {
    const legacy = [{ slug: 'sport', title: 'Sport', description: 'd', coverUrl: 'https://pub-x.r2.dev/sport/c.webp' }];
    expect(albumsToRuntime(legacy)).toEqual({
      albums: [{ slug: 'sport', title: 'Sport', description: 'd', coverName: 'c.webp' }],
    });
  });
  it('coverUrl assente → coverName null; description assente → stringa vuota', () => {
    expect(albumsToRuntime([{ slug: 'x', title: 'X' }]))
      .toEqual({ albums: [{ slug: 'x', title: 'X', description: '', coverName: null }] });
  });
});

describe('siteToRuntime', () => {
  it('costruisce site.json con hero referenziale e social puliti', () => {
    const cfg = {
      name: 'Davide', bio: 'Bio',
      heroImageUrl: 'https://pub-x.r2.dev/sport/hero.webp',
      social: { instagram: 'https://instagram.com/x', vuoto: undefined },
    };
    expect(siteToRuntime(cfg)).toEqual({
      name: 'Davide', bio: 'Bio',
      hero: { album: 'sport', name: 'hero.webp' },
      social: { instagram: 'https://instagram.com/x' },
    });
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run scripts/migrate.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementa lo script**

Prima verifica i nomi delle env var usate da `scripts/upload.js` (lo script di migrazione deve usare gli stessi):

Run: `grep -o 'R2_[A-Z_]*' scripts/upload.js | sort -u`
Expected: `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_SECRET_ACCESS_KEY` (se i nomi reali differiscono, usa QUELLI nello script sotto e nel comando del Task 14).

```js
// scripts/migrate.js
// One-shot: trasforma le config build-time nei JSON runtime e li carica su R2.
// Uso: npm run migrate            → carica _site/site.json e _data/albums.json
//      npm run migrate -- --dry-run → stampa i JSON senza caricare nulla
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';
import { siteConfig } from '../config/site.config.js';
import { albums } from '../config/albums.config.js';

export function parseHeroRef(url) {
  if (!url) return null;
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return { album: segments[segments.length - 2], name: segments[segments.length - 1] };
  } catch {
    return null;
  }
}

export function albumsToRuntime(legacyAlbums) {
  return {
    albums: legacyAlbums.map(a => ({
      slug: a.slug,
      title: a.title,
      description: a.description ?? '',
      coverName: a.coverUrl ? a.coverUrl.split('/').filter(Boolean).at(-1) : null,
    })),
  };
}

export function siteToRuntime(cfg) {
  const social = {};
  for (const [k, v] of Object.entries(cfg.social ?? {})) {
    if (typeof v === 'string') social[k] = v;
  }
  return {
    name: cfg.name,
    bio: cfg.bio ?? '',
    hero: parseHeroRef(cfg.heroImageUrl),
    social,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const siteJson = JSON.stringify(siteToRuntime(siteConfig), null, 2);
  const albumsJson = JSON.stringify(albumsToRuntime(albums), null, 2);

  process.stdout.write(`_site/site.json:\n${siteJson}\n\n_data/albums.json:\n${albumsJson}\n\n`);
  if (dryRun) {
    process.stdout.write('Dry-run: nessun upload.\n');
    return;
  }

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    process.stderr.write('Env R2 mancanti (servono R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET nel .env).\n');
    process.exit(1);
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  for (const [key, body] of [['_site/site.json', siteJson], ['_data/albums.json', albumsJson]]) {
    await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'application/json' }));
    process.stdout.write(`✓ caricato ${key}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

In `package.json`, dentro `scripts`, aggiungi:

```json
    "migrate": "node --env-file=.env scripts/migrate.js",
```

- [ ] **Step 4: Binding R2 e vars nel wrangler.json**

Recupera il nome del bucket: `grep R2_BUCKET .env` → usa quel valore al posto di `NOME_BUCKET_DAL_TUO_ENV` qui sotto. `wrangler.json` completo:

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
    { "binding": "BUCKET", "bucket_name": "NOME_BUCKET_DAL_TUO_ENV" }
  ],
  "vars": {
    "ACCESS_TEAM_DOMAIN": "",
    "ACCESS_AUD": ""
  }
}
```

Le due vars restano vuote fino al Task 14 (fail-closed: le rotte admin rispondono 401 finché Access non è configurato — è voluto).

- [ ] **Step 5: Dry-run di controllo**

```bash
node --env-file=.env scripts/migrate.js --dry-run   # controlla visivamente i JSON generati
```

**NOTA — la cancellazione di `albums.config.js` NON avviene in questo task**: `scripts/migrate.js` lo importa, e la migrazione reale gira solo nel Task 14 (Step 2). La cancellazione è il Task 14 Step 8, DOPO la migrazione riuscita.

- [ ] **Step 6: Verifica e commit**

Run: `npx vitest run scripts/migrate.test.js && npm test && npm run build`
Expected: PASS.

```bash
git add scripts/migrate.js scripts/migrate.test.js package.json wrangler.json
git commit -m "feat(migrate): script one-shot config→R2 + binding BUCKET e vars Access"
```

---

### Task 14: Rollout, Access, migrazione e verifica end-to-end (manuale)

Nessun TDD: checklist operativa. I passi marcati **[UMANO]** richiedono il pannello Cloudflare o dispositivi fisici.

- [ ] **Step 1: Deploy del codice**

**[UMANO — prerequisito]**: `wrangler.json` ha `bucket_name: "<INSERISCI_QUI_IL_NOME_DEL_TUO_BUCKET_R2>"` — un placeholder deliberato (nessun `.env` con credenziali reali era disponibile durante l'esecuzione automatica del piano). Prima di pushare, sostituiscilo col nome reale del bucket R2 (lo stesso valore che hai in `.env` come `R2_BUCKET_NAME`, usato da `scripts/upload.js`). Se lo lasci com'è, il deploy fallisce con un errore di binding R2 non trovato.

```bash
git push   # Workers Builds builda e deploya
```
Attendi il deploy, poi: `curl -s https://portfolio.example/api/data/albums` → atteso `{"error":"NOT_FOUND"}` (404: i JSON non esistono ancora).

- [ ] **Step 2: Migrazione dati**

```bash
npm run migrate -- --dry-run   # controlla i JSON generati
npm run migrate                # upload reale
curl -s https://portfolio.example/api/data/albums   # atteso: {"albums":[…]} con sport e around-the-world
curl -s https://portfolio.example/api/data/site     # atteso: {"name":"Davide Tarsi",…}
```
Verifica che home e pagine album del sito pubblico funzionino (ora leggono i dati runtime).

- [ ] **Step 3 [UMANO]: Cloudflare Access (una tantum, ~10 minuti)**

1. Pannello Cloudflare → Zero Trust (crea il team se è il primo accesso: scegli un nome team, es. `your-github-user` → il team domain sarà `your-team.cloudflareaccess.com`).
2. Access → Applications → **Add an application** → *Self-hosted*.
3. Nome: `Portfolio Admin`. Public hostname: `portfolio.example`, path `admin`. **Add public hostname**: `portfolio.example`, path `api/admin`.
4. Policy: nome `Solo io`, action *Allow*, include → *Emails* → la tua email.
5. Identity providers: lascia *One-time PIN* (login via codice email).
6. Salva. Dalla pagina dell'applicazione copia l'**AUD tag** (Application Audience).

- [ ] **Step 4: Configura le vars e rideploya**

In `wrangler.json` valorizza:
- `ACCESS_TEAM_DOMAIN`: `<team>.cloudflareaccess.com` (SENZA `https://`)
- `ACCESS_AUD`: l'AUD tag copiato

```bash
git add wrangler.json
git commit -m "chore: configura Access team domain e AUD"
git push
```

- [ ] **Step 5: Verifica difesa in profondità**

```bash
curl -s -o /dev/null -w '%{http_code}' -X PUT https://portfolio.example/api/admin/site
```
Expected: `302` (redirect al login Access) oppure `401` (JWT gate del Worker). MAI `200`.

- [ ] **Step 6 [UMANO]: E2E da Mac**

1. Apri `https://portfolio.example/admin` → login One-time PIN → dashboard visibile.
2. Crea album di test "Prova Piano" → si apre la vista album vuota.
3. Trascina 3-4 JPEG grandi → progress per file → griglia popolata.
4. Apri `https://portfolio.example/prova-piano` in un'altra scheda → le foto ci sono, in ordine.
5. Riordina una foto (drag) → ricarica la scheda pubblica → ordine aggiornato.
6. Elimina una foto dall'album (conferma) → scompare dalla griglia admin → ricarica la scheda pubblica → non c'è più.
7. Imposta una cover → home → la card mostra la cover.
8. Cambia bio dal pannello → home aggiornata al reload (bio sostituisce il sottotitolo statico sotto il nome nell'hero; se la lasci vuota torna il testo di default).
8b. Aggiungi un link Instagram dal pannello → home aggiornata al reload (compare nel footer).
9. Imposta hero da "Prova Piano" → home aggiornata.

- [ ] **Step 7 [UMANO]: E2E da iPhone (percorso WASM)**

1. Safari iOS → `/admin` → login → apri "Prova Piano".
2. Carica 2 foto dal rullino (HEIC: iOS le converte in JPEG alla selezione).
3. Verifica su `/prova-piano` che le nuove foto si vedano e che i nomi finiscano in `.webp` (requisito: MAI jpg sul sito).

- [ ] **Step 8: Pulizia finale**

1. Ripristina hero/bio/cover come li vuoi, elimina l'album "Prova Piano" dal pannello (conferma col nome).
2. Esegui la cancellazione rimandata dal Task 13 Step 5:
```bash
git rm config/albums.config.js
grep -rn "albums.config" src/ vite.config.js || echo "OK"
npm test && npm run build
git commit -m "chore: rimuovi albums.config.js — gli album vivono su R2"
git push
```
(`scripts/migrate.js` resta nel repo come riferimento storico ma non è più eseguibile: importava il file eliminato. `compress.js`/`upload.js` restano come paracadute — rimozione in un momento successivo, fuori da questo piano.)

---

## Note per l'esecuzione

- Ordine tassativo: 1 → 14 (ogni task consuma interfacce dei precedenti).
- I task 1-13 sono TDD puro ed eseguibili in sessione; il 14 alterna comandi e passi umani: il controller si ferma e chiede all'umano i passi [UMANO].
- Tra il Task 6 e il Task 8 il sito NON builda (import `listPhotos` rimosso ma `album.js` non ancora aggiornato): è atteso, non "aggiustarlo" reintroducendo codice legacy.
