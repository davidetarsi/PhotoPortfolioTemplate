# Ordinamento foto per data + salva esplicito sottotitolo/cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nella vista album della dashboard admin: ordinare le foto per data di scatto/caricamento (stessa foto d'ordine del drag&drop), e rendere sottotitolo+cover modifiche "pending" con un Salva esplicito, avvisando se si esce con modifiche non salvate.

**Architecture:** Estrazione EXIF isolata in un modulo dedicato (`src/admin/exif.js`), iniettata come dipendenza in `pipeline.js`/`encoder.js` (stesso pattern DI già usato per `decode`/`encode`). Il sort scrive con la stessa `putManifest()` del drag&drop — nessuno stato "modalità sort" persistito. Sottotitolo+cover riusano il pattern `buildPendingSite`/"Salva sito" già in `home.js`, applicato a `album.js`.

**Tech Stack:** Vanilla JS, Vitest + jsdom, libreria `exifr` (nuova dipendenza).

**Spec di riferimento:** `docs/maintainers/superpowers/specs/2026-07-12-album-sort-and-save-design.md`

## Global Constraints

- Upload, eliminazione e riordino manuale (drag&drop) restano **immediati** — nessuna modifica al loro comportamento attuale.
- L'estrazione EXIF non deve mai bloccare l'upload: qualsiasi fallimento (file senza EXIF, parsing fallito) → `undefined`, mai un'eccezione propagata.
- Fallback sort `capturedAt ?? uploadedAt ?? 0` — mai `NaN` nel comparator (vedi spec Sezione 3 per il perché).
- **Limite noto, accettato per scope**: la protezione "modifiche non salvate" copre il click sul link "← Tutti gli album" e la chiusura/refresh reale del browser (`beforeunload`). **Non copre** il tasto Indietro/Avanti nativo del browser quando si muove tra hash-route della stessa pagina (`#/` ↔ `#/album/slug`) — un hashchange non è annullabile né passa da `beforeunload`. Intercettarlo richiederebbe revertire manualmente l'hash, complessità non richiesta ("una conferma semplice").
- Nessuna modifica a `scripts/compress.js`/`scripts/upload.js` (CLI non più usato) né al layout generale della vista album (top bar, emoji — fuori scope, vedi spec).

---

### Task 1: Schema manifest — campi opzionali `capturedAt`/`uploadedAt`

**Files:**
- Modify: `src/shared/content-rules.js`
- Test: `src/shared/content-rules.test.js`

**Interfaces:**
- Consumes: nessuno
- Produces: `validateManifestShape(data)` accetta entry con `capturedAt`/`uploadedAt` opzionali (numeri finiti se presenti). Usato da Task 6/7 lato admin-routes (nessuna modifica lì, la validazione è già chiamata da `admin-routes.js` via `validateManifestShape`).

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi al blocco `describe('validateManifestShape', ...)` in `src/shared/content-rules.test.js` (dopo il test esistente `'rifiuta dimensioni non finite/negative...'`):

```js
  it('accetta capturedAt/uploadedAt opzionali, se presenti devono essere numeri finiti', () => {
    expect(validateManifestShape([{ ...entry, capturedAt: 1700000000000 }]).ok).toBe(true);
    expect(validateManifestShape([{ ...entry, uploadedAt: 1700000000000 }]).ok).toBe(true);
    expect(validateManifestShape([{ ...entry, capturedAt: 1700000000000, uploadedAt: 1700000000001 }]).ok).toBe(true);
    expect(validateManifestShape([entry]).ok).toBe(true); // nessuno dei due: ok comunque (retrocompatibilità)
  });
  it('rifiuta capturedAt/uploadedAt non numerici quando presenti', () => {
    expect(validateManifestShape([{ ...entry, capturedAt: 'ieri' }]).ok).toBe(false);
    expect(validateManifestShape([{ ...entry, uploadedAt: NaN }]).ok).toBe(false);
  });
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run src/shared/content-rules.test.js`
Expected: i due nuovi test FALLISCONO (i campi non sono ancora validati, ma essendo opzionali e non controllati il primo blocco potrebbe già passare per caso — il secondo blocco deve fallire, perché oggi qualsiasi valore extra viene ignorato senza validazione).

- [ ] **Step 3: Implementa**

In `src/shared/content-rules.js`, dentro `validateManifestShape`, subito dopo il controllo di `height`:

```js
    if (!Number.isFinite(e.width) || e.width <= 0) return fail(`manifest: width invalida per "${e.name}"`);
    if (!Number.isFinite(e.height) || e.height <= 0) return fail(`manifest: height invalida per "${e.name}"`);
    if (e.capturedAt !== undefined && !Number.isFinite(e.capturedAt)) return fail(`manifest: capturedAt invalido per "${e.name}"`);
    if (e.uploadedAt !== undefined && !Number.isFinite(e.uploadedAt)) return fail(`manifest: uploadedAt invalido per "${e.name}"`);
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run src/shared/content-rules.test.js`
Expected: PASS, tutti i test del file.

- [ ] **Step 5: Commit**

```bash
git add src/shared/content-rules.js src/shared/content-rules.test.js
git commit -m "feat(schema): campi opzionali capturedAt/uploadedAt nel manifest foto"
```

---

### Task 2: Modulo isolato estrazione EXIF

**Files:**
- Create: `src/admin/exif.js`
- Test: `src/admin/exif.test.js`

**Interfaces:**
- Consumes: libreria `exifr` (nuova dipendenza)
- Produces: `extractCapturedAt(file: File) => Promise<number | undefined>` — mai lancia, `undefined` su qualsiasi fallimento. Usato da Task 3.

- [ ] **Step 1: Installa la dipendenza**

Run: `npm install exifr`
Expected: aggiunta a `package.json` dependencies, `package-lock.json` aggiornato.

- [ ] **Step 2: Scrivi il test che fallisce**

Crea `src/admin/exif.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractCapturedAt } from './exif.js';

vi.mock('exifr', () => ({ parse: vi.fn() }));
import { parse } from 'exifr';

describe('extractCapturedAt', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('ritorna epoch ms da DateTimeOriginal quando presente', async () => {
    const date = new Date('2025-06-14T18:42:00Z');
    parse.mockResolvedValue({ DateTimeOriginal: date });
    const result = await extractCapturedAt({});
    expect(result).toBe(date.getTime());
  });

  it('ritorna undefined se DateTimeOriginal manca', async () => {
    parse.mockResolvedValue({});
    expect(await extractCapturedAt({})).toBeUndefined();
  });

  it('ritorna undefined se parse() non trova EXIF (risolve undefined/null)', async () => {
    parse.mockResolvedValue(undefined);
    expect(await extractCapturedAt({})).toBeUndefined();
  });

  it('ritorna undefined se parse() lancia — mai un\'eccezione propagata', async () => {
    parse.mockRejectedValue(new Error('file corrotto'));
    await expect(extractCapturedAt({})).resolves.toBeUndefined();
  });

  it('ritorna undefined se DateTimeOriginal non è una Date valida', async () => {
    parse.mockResolvedValue({ DateTimeOriginal: 'non-una-data' });
    expect(await extractCapturedAt({})).toBeUndefined();
  });
});
```

- [ ] **Step 3: Verifica che il test fallisca**

Run: `npx vitest run src/admin/exif.test.js`
Expected: FAIL — `Cannot find module './exif.js'`

- [ ] **Step 4: Implementa**

Crea `src/admin/exif.js`:

```js
// Isola la dipendenza exifr: se manca l'EXIF o il parsing fallisce (foto da
// screenshot, WhatsApp, download — spesso senza EXIF), non deve mai bloccare
// l'upload — sempre undefined, mai un'eccezione che risale al chiamante.
import { parse } from 'exifr';

export async function extractCapturedAt(file) {
  try {
    const exif = await parse(file, ['DateTimeOriginal']);
    const date = exif?.DateTimeOriginal;
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 5: Verifica che i test passino**

Run: `npx vitest run src/admin/exif.test.js`
Expected: PASS, 5 test.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/admin/exif.js src/admin/exif.test.js
git commit -m "feat(admin): modulo isolato estrazione EXIF (capturedAt), mai bloccante"
```

---

### Task 3: `pipeline.js` — cattura `uploadedAt`/`capturedAt`

**Files:**
- Modify: `src/admin/pipeline.js`
- Test: `src/admin/pipeline.test.js`

**Interfaces:**
- Consumes: `extractCapturedAt` (Task 2), iniettato come terza dipendenza accanto a `decode`/`encode`
- Produces: `processFile(file, {decode, encode, extractCapturedAt})` ritorna anche `capturedAt`/`uploadedAt` nell'oggetto risultato. Usato da Task 4.

**Punto critico dalla spec (Sezione 2):** `extractCapturedAt` legge il parametro `file` grezzo — mai `bitmap` (nessun canale metadati) né il `blob` ri-codificato.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/admin/pipeline.test.js`, aggiorna i due test esistenti in `describe('processFile', ...)` e aggiungine uno nuovo:

```js
describe('processFile', () => {
  it('webp piccolo → as-is: nessun encode, blob = file originale, include capturedAt/uploadedAt', async () => {
    const decode = vi.fn(async () => ({ bitmap: 'BMP', width: 1000, height: 800 }));
    const encode = vi.fn();
    const extractCapturedAt = vi.fn(async () => 1700000000000);
    const file = { type: 'image/webp' };
    const res = await processFile(file, { decode, encode, extractCapturedAt });
    expect(res.blob).toBe(file);
    expect(res.width).toBe(1000);
    expect(res.height).toBe(800);
    expect(res.capturedAt).toBe(1700000000000);
    expect(Number.isFinite(res.uploadedAt)).toBe(true);
    expect(encode).not.toHaveBeenCalled();
    expect(extractCapturedAt).toHaveBeenCalledWith(file); // legge il File originale, non bitmap/blob
  });

  it('jpeg grande → resize + encode con qualità 0.85, include capturedAt/uploadedAt', async () => {
    const decode = vi.fn(async () => ({ bitmap: 'BMP', width: 3800, height: 1900 }));
    const encode = vi.fn(async () => 'WEBP_BLOB');
    const extractCapturedAt = vi.fn(async () => undefined); // niente EXIF, es. screenshot
    const file = { type: 'image/jpeg' };
    const res = await processFile(file, { decode, encode, extractCapturedAt });
    expect(encode).toHaveBeenCalledWith('BMP', 1900, 950, WEBP_QUALITY);
    expect(res.blob).toBe('WEBP_BLOB');
    expect(res.width).toBe(1900);
    expect(res.height).toBe(950);
    expect(res.capturedAt).toBeUndefined();
    expect(Number.isFinite(res.uploadedAt)).toBe(true);
  });

  it('MAX_DIMENSION è 1900 (stesso limite di compress.js)', () => {
    expect(MAX_DIMENSION).toBe(1900);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run src/admin/pipeline.test.js`
Expected: FAIL sui due test aggiornati (`res.capturedAt`/`res.uploadedAt` sono `undefined`/mancanti, `extractCapturedAt` non è mai chiamato).

- [ ] **Step 3: Implementa**

In `src/admin/pipeline.js`, sostituisci `processFile`:

```js
export async function processFile(file, { decode, encode, extractCapturedAt }) {
  const uploadedAt = Date.now();
  const capturedAt = await extractCapturedAt(file);
  const { bitmap, width, height } = await decode(file);
  if (shouldUploadAsIs(file.type, width, height)) {
    return { blob: file, width, height, capturedAt, uploadedAt };
  }
  const target = targetDimensions(width, height);
  const blob = await encode(bitmap, target.width, target.height, WEBP_QUALITY);
  return { blob, width: target.width, height: target.height, capturedAt, uploadedAt };
}
```

- [ ] **Step 4: Verifica che i test passino**

Run: `npx vitest run src/admin/pipeline.test.js`
Expected: PASS, tutti i test del file.

- [ ] **Step 5: Commit**

```bash
git add src/admin/pipeline.js src/admin/pipeline.test.js
git commit -m "feat(admin): pipeline cattura capturedAt (da File originale) e uploadedAt"
```

---

### Task 4: Wiring in `encoder.js` e `upload-manager.js`

**Files:**
- Modify: `src/admin/encoder.js` (nessun test — browser-only per convenzione già in uso nel file)
- Modify: `src/admin/upload-manager.js`
- Test: `src/admin/upload-manager.test.js`

**Interfaces:**
- Consumes: `extractCapturedAt` da `src/admin/exif.js` (Task 2)
- Produces: `makeProcessDeps()` include `extractCapturedAt` nell'oggetto deps; le entry scritte in manifest da `runBatch()` includono `capturedAt`/`uploadedAt`. Usato da Task 5/6 (la vista album legge questi campi dal manifest).

- [ ] **Step 1: Scrivi il test che fallisce**

In `src/admin/upload-manager.test.js`, aggiorna `okProcess` e aggiungi un'asserzione nel primo test:

```js
const okProcess = async () => ({ blob: 'BLOB', width: 10, height: 20, capturedAt: 1700000000000, uploadedAt: 1700000000001 });
```

Poi, nel test `'assegna nomi dedotti PRIMA degli upload...'`, aggiungi dopo l'asserzione esistente su `res.manifest`:

```js
    expect(res.uploaded[0].entry.capturedAt).toBe(1700000000000);
    expect(res.uploaded[0].entry.uploadedAt).toBe(1700000000001);
```

- [ ] **Step 2: Verifica che il test fallisca**

Run: `npx vitest run src/admin/upload-manager.test.js`
Expected: FAIL — `res.uploaded[0].entry.capturedAt` è `undefined`.

- [ ] **Step 3: Implementa — `upload-manager.js`**

In `src/admin/upload-manager.js`, dentro `workerLoop()`:

```js
        try {
          onProgress(job.name, 'processing');
          const { blob, width, height, capturedAt, uploadedAt } = await processFile(job.file);
          onProgress(job.name, 'uploading');
          await uploadPhoto(job.name, blob);
          uploaded.push({ job, entry: { name: job.name, width, height, capturedAt, uploadedAt } });
          onProgress(job.name, 'done');
        } catch (error) {
```

(Nota: `capturedAt`/`uploadedAt` `undefined` vengono omessi da `JSON.stringify` automaticamente — nessun campo extra scritto quando assente, coerente con lo schema opzionale del Task 1.)

- [ ] **Step 4: Verifica che il test passi**

Run: `npx vitest run src/admin/upload-manager.test.js`
Expected: PASS, tutti i test del file.

- [ ] **Step 5: Implementa — `encoder.js` (nessun test automatico, browser-only)**

In `src/admin/encoder.js`, aggiungi l'import e includi `extractCapturedAt` in entrambi i return di `makeProcessDeps()`:

```js
import { extractCapturedAt } from './exif.js';
```

```js
export async function makeProcessDeps() {
  const decode = async file => {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  };

  if (await nativeWebpSupported()) {
    return {
      decode,
      encode: async (bitmap, w, h, q) => canvasToBlob(drawTo(bitmap, w, h), 'image/webp', q),
      extractCapturedAt,
    };
  }

  const { encode: wasmEncode } = await import('@jsquash/webp');
  return {
    decode,
    encode: async (bitmap, w, h, q) => {
      const imageData = drawTo(bitmap, w, h).getContext('2d').getImageData(0, 0, w, h);
      const buffer = await wasmEncode(imageData, { quality: Math.round(q * 100) });
      return new Blob([buffer], { type: 'image/webp' });
    },
    extractCapturedAt,
  };
}
```

- [ ] **Step 6: Verifica manuale (nessun test jsdom per questo file)**

Run: `npm run dev`, apri `/admin`, carica una foto reale con EXIF (es. da fotocamera/smartphone) in un album di test, controlla nella risposta di rete di `PUT /api/admin/albums/<slug>/manifest` che l'entry includa `capturedAt`. Carica anche uno screenshot (senza EXIF) e verifica che l'upload non fallisca e l'entry non abbia `capturedAt` (solo `uploadedAt`).

- [ ] **Step 7: Commit**

```bash
git add src/admin/encoder.js src/admin/upload-manager.js src/admin/upload-manager.test.js
git commit -m "feat(admin): collega extractCapturedAt alla pipeline reale di upload"
```

---

### Task 5: Ordina per data

**Files:**
- Modify: `src/admin/views/album.js`
- Modify: `src/styles/admin.css`
- Test: `src/admin/views/album.test.js`

**Interfaces:**
- Consumes: campi `capturedAt`/`uploadedAt` sulle entry del manifest (Task 1-4, ma il test di questo task usa fixture proprie — nessuna dipendenza diretta dai task precedenti per essere eseguito)
- Produces: bottone "Ordina per data" che chiama `api.putManifest` con l'ordine ricalcolato — nessuna nuova interfaccia consumata da altri task.

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi a `src/admin/views/album.test.js` (dopo il test `'riordino → putManifest con ordine nuovo'`):

```js
  it('"Ordina per data" riordina per capturedAt/uploadedAt, foto legacy senza data vanno per prime (fallback 0)', async () => {
    const ctx = makeCtx();
    ctx.deps.fetchManifest = vi.fn(async () => ({
      ok: true,
      data: [
        { name: 'recente.webp', width: 1, height: 1, capturedAt: 1700000002000 },
        { name: 'legacy.webp', width: 1, height: 1 }, // né capturedAt né uploadedAt
        { name: 'vecchia.webp', width: 1, height: 1, uploadedAt: 1700000001000 },
      ],
    }));
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-sort-date').click();
    await vi.waitFor(() => expect(ctx.api.putManifest).toHaveBeenCalled());
    expect(ctx.api.putManifest.mock.calls[0][1].map(e => e.name)).toEqual(['legacy.webp', 'vecchia.webp', 'recente.webp']);
  });

  it('"Ordina per data" con due foto legacy (entrambe fallback 0) mantiene l\'ordine relativo — sort stabile', async () => {
    const ctx = makeCtx();
    ctx.deps.fetchManifest = vi.fn(async () => ({
      ok: true,
      data: [
        { name: 'b.webp', width: 1, height: 1 },
        { name: 'a.webp', width: 1, height: 1 },
      ],
    }));
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('.admin-sort-date').click();
    await vi.waitFor(() => expect(ctx.api.putManifest).toHaveBeenCalled());
    expect(ctx.api.putManifest.mock.calls[0][1].map(e => e.name)).toEqual(['b.webp', 'a.webp']); // invariato
  });
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run src/admin/views/album.test.js`
Expected: FAIL — `container.querySelector('.admin-sort-date')` è `null`.

- [ ] **Step 3: Implementa — template**

In `src/admin/views/album.js`, nel template HTML, aggiungi la toolbar prima di `.admin-photo-grid`:

```js
  container.innerHTML = `
    <p><a class="admin-back" href="#/">← Tutti gli album</a></p>
    <section class="admin-panel">
      <h2></h2>
      <div class="admin-album-toolbar">
        <button class="admin-sort-date" type="button">Ordina per data</button>
      </div>
      <div class="admin-photo-grid"></div>
      <div class="admin-dropzone">
        <label class="admin-dropzone__label">
          Trascina qui le foto o <span class="admin-dropzone__browse">scegli i file da caricare</span>
          <input class="admin-dropzone__input" type="file" multiple accept="image/jpeg,image/png,image/webp">
        </label>
      </div>
      <ul class="admin-progress"></ul>
      <p class="admin-status" role="status">
        <span class="admin-status__badge"></span>
        <span class="admin-status__text"></span>
      </p>
    </section>
  `;
```

- [ ] **Step 4: Implementa — handler**

Subito dopo il blocco `deps.attachSortable(...)` esistente, aggiungi:

```js
  q('.admin-sort-date').addEventListener('click', () => run(async () => {
    const sortKey = p => p.capturedAt ?? p.uploadedAt ?? 0;
    const sorted = [...manifest].sort((a, b) => sortKey(a) - sortKey(b));
    await api.putManifest(slug, sorted);
    manifest = sorted;
    renderPhotos();
    say('Foto ordinate per data.');
  }));
```

- [ ] **Step 5: CSS toolbar**

In `src/styles/admin.css`, dopo la regola `.admin-photo-grid`:

```css
.admin-album-toolbar { display: flex; justify-content: flex-end; margin-bottom: var(--space-sm); }
```

- [ ] **Step 6: Verifica che i test passino**

Run: `npx vitest run src/admin/views/album.test.js`
Expected: PASS, tutti i test del file.

- [ ] **Step 7: Commit**

```bash
git add src/admin/views/album.js src/styles/admin.css src/admin/views/album.test.js
git commit -m "feat(admin): bottone Ordina per data — riusa putManifest del drag&drop"
```

---

### Task 6: Sottotitolo + cover pending con Salva esplicito

**Files:**
- Modify: `src/admin/views/album.js`
- Modify: `src/styles/admin.css`
- Test: `src/admin/views/album.test.js`

**Interfaces:**
- Consumes: nessuna nuova dipendenza esterna
- Produces: `buildPendingAlbum({description, coverName}, currentAlbum)` — funzione pura esportata, stessa forma di `buildPendingSite` in `home.js`. Stato `pending`/`dirty` interni a `renderAdminAlbum`, consumati da Task 7.

**Cambio di comportamento rispetto a oggi:** il click su "Cover" non chiama più `api.putAlbums()` — aggiorna solo lo stato locale `pending.coverName` (il bordino si sposta comunque, leggendo da `pending` invece che da `ctx.albums`). La chiamata `api.putAlbums()` esistente nel test `'"Cover" → putAlbums con coverName aggiornato'` va aggiornata di conseguenza.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/admin/views/album.test.js`, sostituisci il test esistente `'"Cover" → putAlbums con coverName aggiornato'` (il comportamento cambia: non più immediato) e aggiungi i nuovi:

```js
  it('click su "Cover" aggiorna solo lo stato locale (bordino), NON chiama putAlbums finché non premi Salva', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    expect(ctx.api.putAlbums).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.admin-photo__cover')[1].classList.contains('admin-photo__cover--selected')).toBe(true);
  });

  it('bottone Salva scrive description+coverName pending in un\'unica putAlbums', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelector('[name="album-description"]').value = 'Nuova descrizione';
    container.querySelector('[name="album-description"]').dispatchEvent(new Event('input'));
    container.querySelectorAll('.admin-photo__cover')[1].click();
    container.querySelector('.admin-save-album').click();
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalledTimes(1));
    const saved = ctx.api.putAlbums.mock.calls[0][0].find(a => a.slug === 'sport');
    expect(saved.description).toBe('Nuova descrizione');
    expect(saved.coverName).toBe('b.webp');
  });

  it('campo descrizione è precompilato con la description corrente dell\'album', async () => {
    const ctx = makeCtx({ albums: [{ slug: 'sport', title: 'Sport', description: 'Bio esistente', coverName: null }] });
    renderAdminAlbum(container, ctx);
    await flush();
    expect(container.querySelector('[name="album-description"]').value).toBe('Bio esistente');
  });
```

Aggiorna anche `makeCtx` in cima al file (se `coverName` di default non è già `null`, verifica sia coerente — nessuna modifica se già così).

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run src/admin/views/album.test.js`
Expected: FAIL — `[name="album-description"]` e `.admin-save-album` non esistono ancora; il vecchio test sul click Cover fallisce perché oggi chiama `putAlbums` subito.

- [ ] **Step 3: Implementa — template**

In `src/admin/views/album.js`, aggiorna il template (aggiungi il campo descrizione dopo `<h2>`, il bottone Salva prima di `.admin-status`):

```js
  container.innerHTML = `
    <p><a class="admin-back" href="#/">← Tutti gli album</a></p>
    <section class="admin-panel">
      <h2></h2>
      <label>Sottotitolo <input name="album-description" type="text"></label>
      <div class="admin-album-toolbar">
        <button class="admin-sort-date" type="button">Ordina per data</button>
      </div>
      <div class="admin-photo-grid"></div>
      <div class="admin-dropzone">
        <label class="admin-dropzone__label">
          Trascina qui le foto o <span class="admin-dropzone__browse">scegli i file da caricare</span>
          <input class="admin-dropzone__input" type="file" multiple accept="image/jpeg,image/png,image/webp">
        </label>
      </div>
      <ul class="admin-progress"></ul>
      <button class="admin-save-album">Salva</button>
      <p class="admin-status" role="status">
        <span class="admin-status__badge"></span>
        <span class="admin-status__text"></span>
      </p>
    </section>
  `;
```

- [ ] **Step 4: Implementa — `buildPendingAlbum` + stato pending**

Aggiungi l'export in cima al file (dopo gli import, prima di `renderAdminAlbum`):

```js
export function buildPendingAlbum({ description, coverName }, currentAlbum) {
  return { ...currentAlbum, description, coverName };
}
```

Dentro `renderAdminAlbum`, dopo la riga `const { say, run } = createStatus(q('.admin-status'));`:

```js
  const fallbackAlbum = { slug, title: slug, description: '', coverName: null };
  const pending = { description: album?.description ?? '', coverName: album?.coverName ?? null };
  q('[name="album-description"]').value = pending.description;
  q('[name="album-description"]').addEventListener('input', () => {
    pending.description = q('[name="album-description"]').value;
  });
```

- [ ] **Step 5: Implementa — aggiorna `renderPhotos()` e il click su Cover**

Rimuovi del tutto la riga `const currentCoverName = ctx.albums.find(a => a.slug === slug)?.coverName ?? null;` (non serve più, la cover pending sostituisce questa derivazione) e aggiorna la riga `isCover` per leggere da `pending` invece che dalla variabile rimossa:

```js
  function renderPhotos() {
    const grid = q('.admin-photo-grid');
    grid.innerHTML = '';
    manifest.forEach(entry => {
      const isCover = entry.name === pending.coverName;
```

Sostituisci l'handler click su `.admin-photo__cover`:

```js
      cell.querySelector('.admin-photo__cover').addEventListener('click', () => {
        pending.coverName = entry.name;
        renderPhotos();
        say(`Cover selezionata: ${entry.name} (premi Salva per confermare).`);
      });
```

- [ ] **Step 6: Implementa — bottone Salva**

Dopo il blocco `q('.admin-sort-date').addEventListener(...)` (Task 5):

```js
  q('.admin-save-album').addEventListener('click', () => run(async () => {
    const updatedAlbum = buildPendingAlbum(pending, album ?? fallbackAlbum);
    const updatedAlbums = ctx.albums.map(a => (a.slug === slug ? updatedAlbum : a));
    await api.putAlbums(updatedAlbums);
    ctx.albums = updatedAlbums;
    say('Album salvato.');
  }));
```

- [ ] **Step 7: CSS bottone Salva**

Nessuna nuova regola necessaria — `.admin-save-album` eredita lo stile da `.admin-panel button` già esistente (stesso accent teal delle altre azioni).

- [ ] **Step 8: Verifica che i test passino**

Run: `npx vitest run src/admin/views/album.test.js`
Expected: PASS, tutti i test del file.

- [ ] **Step 9: Commit**

```bash
git add src/admin/views/album.js src/styles/admin.css src/admin/views/album.test.js
git commit -m "feat(admin): sottotitolo album + cover pending, Salva esplicito unico"
```

---

### Task 7: Protezione modifiche non salvate

**Files:**
- Modify: `src/admin/views/album.js`
- Modify: `src/pages/admin.js`
- Test: `src/admin/views/album.test.js`

**Interfaces:**
- Consumes: `attachBeforeUnloadGuard` da `src/admin/upload-manager.js` (già esistente, Task 4 non lo modifica), iniettato via `ctx.deps.attachBeforeUnloadGuard`
- Produces: nessuna nuova interfaccia — comportamento finale della vista album.

- [ ] **Step 1: Scrivi i test che falliscono**

In `src/admin/views/album.test.js`, aggiungi a `makeCtx()`'s `deps` (accanto a `confirm: vi.fn(() => true)`):

```js
    attachBeforeUnloadGuard: vi.fn(() => vi.fn()), // ritorna una funzione detach fittizia
```

Poi aggiungi i nuovi test:

```js
  it('modifica pending (cover) + click "Tutti gli album" senza conferma → non naviga, chiede conferma', async () => {
    const ctx = makeCtx();
    ctx.deps.confirm = vi.fn(() => false); // utente annulla
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click(); // sporca lo stato
    const backLink = container.querySelector('.admin-back');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    backLink.dispatchEvent(evt);
    expect(ctx.deps.confirm).toHaveBeenCalledWith('Ci sono modifiche non salvate. Uscire comunque?');
    expect(evt.defaultPrevented).toBe(true);
  });

  it('modifica pending + click "Tutti gli album" con conferma → naviga (non preventDefault)', async () => {
    const ctx = makeCtx();
    ctx.deps.confirm = vi.fn(() => true);
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    const backLink = container.querySelector('.admin-back');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    backLink.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('nessuna modifica pending → click "Tutti gli album" naviga senza chiedere conferma', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    const backLink = container.querySelector('.admin-back');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    backLink.dispatchEvent(evt);
    expect(ctx.deps.confirm).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('modifica pending → aggancia la guardia beforeunload; Salva la stacca', async () => {
    const ctx = makeCtx();
    const detach = vi.fn();
    ctx.deps.attachBeforeUnloadGuard = vi.fn(() => detach);
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    expect(ctx.deps.attachBeforeUnloadGuard).toHaveBeenCalledTimes(1);
    container.querySelector('.admin-save-album').click();
    await vi.waitFor(() => expect(ctx.api.putAlbums).toHaveBeenCalled());
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('modifiche pending multiple non riattaccano la guardia più volte', async () => {
    const ctx = makeCtx();
    renderAdminAlbum(container, ctx);
    await flush();
    container.querySelectorAll('.admin-photo__cover')[0].click();
    container.querySelectorAll('.admin-photo__cover')[1].click();
    expect(ctx.deps.attachBeforeUnloadGuard).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `npx vitest run src/admin/views/album.test.js`
Expected: FAIL — nessuna guardia agganciata, nessuna conferma richiesta sul click del link back (oggi naviga sempre senza controlli).

- [ ] **Step 3: Implementa — `src/pages/admin.js`**

Aggiungi l'import e la voce in `ctx.deps`:

```js
import { attachBeforeUnloadGuard } from '../admin/upload-manager.js';
```

Nel blocco `deps: { ... }`, aggiungi accanto a `runBatch,`:

```js
    attachBeforeUnloadGuard,
```

- [ ] **Step 4: Implementa — stato dirty in `album.js`**

Dopo la definizione di `pending` (Task 6, Step 4), aggiungi:

```js
  let detachGuard = null;
  function markDirty() {
    if (!detachGuard) detachGuard = deps.attachBeforeUnloadGuard();
  }
  function clearDirty() {
    if (detachGuard) { detachGuard(); detachGuard = null; }
  }
```

- [ ] **Step 5: Implementa — chiama `markDirty()` sui due punti che sporcano lo stato**

Nell'handler `input` della descrizione (Task 6, Step 4):

```js
  q('[name="album-description"]').addEventListener('input', () => {
    pending.description = q('[name="album-description"]').value;
    markDirty();
  });
```

Nell'handler click su Cover (Task 6, Step 5):

```js
      cell.querySelector('.admin-photo__cover').addEventListener('click', () => {
        pending.coverName = entry.name;
        markDirty();
        renderPhotos();
        say(`Cover selezionata: ${entry.name} (premi Salva per confermare).`);
      });
```

- [ ] **Step 6: Implementa — Salva chiama `clearDirty()`**

Nell'handler del bottone Salva (Task 6, Step 6), dopo `ctx.albums = updatedAlbums;`:

```js
  q('.admin-save-album').addEventListener('click', () => run(async () => {
    const updatedAlbum = buildPendingAlbum(pending, album ?? fallbackAlbum);
    const updatedAlbums = ctx.albums.map(a => (a.slug === slug ? updatedAlbum : a));
    await api.putAlbums(updatedAlbums);
    ctx.albums = updatedAlbums;
    clearDirty();
    say('Album salvato.');
  }));
```

- [ ] **Step 7: Implementa — conferma sul click del link back**

Dopo il blocco Step 6 (bottone Salva), aggiungi:

```js
  container.querySelector('.admin-back').addEventListener('click', e => {
    if (!detachGuard) return; // niente pending, naviga libero
    if (!deps.confirm('Ci sono modifiche non salvate. Uscire comunque?')) {
      e.preventDefault();
    } else {
      clearDirty();
    }
  });
```

(Nota: uso `detachGuard` — già presente/non-null solo quando c'è una modifica pending — come proxy diretto di "dirty", invece di una variabile booleana separata da tenere sincronizzata.)

- [ ] **Step 8: Verifica che i test passino**

Run: `npx vitest run src/admin/views/album.test.js`
Expected: PASS, tutti i test del file.

- [ ] **Step 9: Esegui l'intera suite**

Run: `npm test`
Expected: tutti i test del progetto passano, nessuna regressione nei file toccati nei task precedenti.

- [ ] **Step 10: Commit**

```bash
git add src/admin/views/album.js src/pages/admin.js src/admin/views/album.test.js
git commit -m "feat(admin): avviso modifiche non salvate — conferma su link back + beforeunload"
```

---

## Verifica finale end-to-end (manuale, su staging)

Dopo aver pushato tutti i task su `staging` e atteso il deploy:

1. Apri un album con foto esistenti (senza `capturedAt`/`uploadedAt`) → "Ordina per data" non deve rompersi, foto legacy restano in un ordine stabile.
2. Carica 2-3 foto nuove reali (con EXIF, da smartphone) → verifica che l'ordine "per data" le posizioni correttamente rispetto alle esistenti.
3. Cambia sottotitolo e cover, **non** premere Salva, clicca "← Tutti gli album" → deve chiedere conferma.
4. Ripeti, ma premi Salva prima di uscire → nessuna conferma, sottotitolo/cover persistiti dopo reload.
5. Cambia cover, prova a fare refresh della pagina (Cmd+R) senza salvare → il browser deve mostrare il proprio prompt nativo "Leave site?".
