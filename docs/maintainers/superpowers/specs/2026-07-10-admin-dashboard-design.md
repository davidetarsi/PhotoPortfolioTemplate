# Admin Dashboard — Design

**Data**: 2026-07-10
**Stato**: approvato (brainstorming con review esterna incorporata)

## Obiettivo

Gestione no-code del portfolio dopo il primo deploy: creare/eliminare/riordinare album, caricare/eliminare/riordinare foto, scegliere cover e hero, modificare nome/bio/social — tutto da un pannello web `/admin`, senza toccare codice, terminale o pannello Cloudflare. Le modifiche ai contenuti non richiedono mai rebuild o deploy.

## Requisiti (dalle domande di chiarimento)

1. **Upload di originali**: si trascinano JPEG/PNG/WebP qualsiasi; la compressione (resize max 1900px lato lungo + WebP q85) avviene nel browser. `compress.js` e `upload.js` diventano obsoleti.
2. **Dispositivi**: Mac e iPhone (anche Safari). L'upload deve funzionare da entrambi.
3. **Solo WebP sul sito**: il fallback JPEG non è accettabile. Su browser senza encoder WebP nativo (Safari) si usa un encoder WASM caricato lazy.
4. **Auth**: Cloudflare Access (Zero Trust, email OTP), non auth custom.
5. **Perimetro**: album + foto + cover + hero + nome/bio/social. I microcopy di sistema (errori, label form) restano in `texts.config.js` nel codice.
6. **Costo**: 0€/mese — free tier Workers + R2 + Access.

## Architettura (approccio scelto: tutto dentro Cloudflare)

La dashboard è una pagina in più dello stesso sito, servita dallo stesso Worker. Il Worker espone API che leggono/scrivono il bucket R2 tramite **binding nativo** (`env.BUCKET`) — nessuna credenziale S3 in nessun punto del sistema. La lista album e i contenuti del sito passano da build-time a runtime: file JSON su R2, fetchati dal sito come già avviene per i manifest.

Alternative valutate e scartate: CMS headless su VPS (seconda infrastruttura da mantenere, ~5-8€/mese, refactor più grosso — overkill per un portfolio mono-utente); tool locale con GUI (non raggiungibile da iPhone, resta legato al Mac).

## Modello dati su R2

```
bucket R2
├── _site/site.json        ← contenuti del sito
├── _data/albums.json      ← lista album
├── <slug>/manifest.json   ← foto dell'album (ordine = ordine di visualizzazione)
└── <slug>/*.webp          ← immagini (immutabili per nome)
```

### `_data/albums.json`

```json
{
  "albums": [
    { "slug": "sport", "title": "Sport", "description": "Foto sport", "coverName": "4x5-crop-IMG_8689-.webp" }
  ]
}
```

- **L'ordine dell'array è l'ordine in home** (riordino = riscrittura del file). Nessun campo `order`.
- **`coverName` è relativo all'album** (non URL assoluto): integrità referenziale, il client costruisce l'URL come per le foto.

### `_site/site.json`

```json
{
  "name": "Davide Tarsi",
  "bio": "Fotografo sportivo e di viaggio.",
  "hero": { "album": "sport", "name": "4x5-crop-7302.webp" },
  "social": { "instagram": "" }
}
```

- `hero` è una referenza `{album, name}`, stesso principio di `coverName`.
- Confine CMS: qui va il **contenuto editoriale**. I microcopy UI restano in `texts.config.js` (codice). Promuovere un testo a `site.json` in futuro è banale.

### `manifest.json` (invariato nello schema, promosso nel significato)

`[{ "name": "...", "width": N, "height": N }]` — **l'ordine dell'array diventa l'ordine di visualizzazione** (oggi è alfabetico per costruzione). Riordinare foto = riscrivere il manifest.

### Config legacy

- `site.config.js` **resta** come fallback di bootstrap (vedi Error handling) e per i meta OG build-time.
- `albums.config.js` **esce dal runtime** e viene eliminato.

## Worker

### Rotte dati pubbliche (nessuna auth)

```
GET /api/data/site                    → _site/site.json
GET /api/data/albums                  → _data/albums.json
GET /api/data/albums/:slug/manifest   → <slug>/manifest.json (404 se assente)
```

- **`Cache-Control: no-store`** su tutte e tre: file da pochi KB serviti alla edge; il sito mostra sempre lo stato attuale del bucket. Modifiche dall'admin visibili in secondi.
- Le **immagini** NON passano dal Worker: restano su URL pubblico R2, cachate a lungo (immutabili per nome).

### Rotte admin (protette)

```
PUT    /api/admin/site                      → valida shape e salva site.json
PUT    /api/admin/albums                    → valida shape e salva albums.json
PUT    /api/admin/albums/:slug/manifest     → valida shape e salva manifest.json
PUT    /api/admin/albums/:slug/photos/:name → upload foto (body binario, content-type image/webp)
DELETE /api/admin/albums/:slug/photos/:name → elimina oggetto + rimuove la entry dal manifest
DELETE /api/admin/albums/:slug              → elimina tutti gli oggetti col prefix + rimuove da albums.json
```

Validazioni server-side su ogni handler: slug contro `^[a-z0-9][a-z0-9-]*$` e contro la lista di **slug riservati** (`admin`, `api`, `contatti`), JSON ben formato con campi richiesti, content-type atteso.

**Cancellazione album** — idempotente e paginata:

```
while: env.BUCKET.list({ prefix: slug + '/', cursor })   // max 1000 chiavi/pagina
       env.BUCKET.delete(chiavi della pagina)             // max 1000 chiavi/chiamata
       finché truncated === false
poi:   riscrittura di albums.json senza la voce
```

L'ordine conta: se il loop muore a metà, l'album è ancora visibile nel pannello e la cancellazione si può rilanciare senza lasciare orfani.

### Auth: Cloudflare Access + verifica JWT nel Worker (difesa in profondità)

- **Access** protegge `/admin*` e `/api/admin*` ai bordi della rete (policy: email OTP, setup una tantum dal pannello).
- Il Worker **verifica comunque** il JWT `Cf-Access-Jwt-Assertion` su ogni rotta admin (audience + firma contro i JWKS del team). Se la policy Access saltasse per errore umano, le API di scrittura restano chiuse.
- **JWKS cache**: chiavi pubbliche memorizzate in variabile module-level (persistono tra richieste nello stesso isolate), refresh a TTL 1h **oppure** al primo JWT con `kid` sconosciuto (caso rotazione chiavi). Senza cache, un batch di 30 upload = 30 fetch bloccanti verso l'endpoint certs.

### Config

`wrangler.json`: aggiunta `r2_buckets: [{ binding: "BUCKET", bucket_name: "<bucket>" }]`. Il binding viaggia col normale deploy.

## Dashboard `/admin`

- **Servizio**: `admin.html` nuovo entry point Vite dello stesso repo; rotta Worker `/admin` → `admin.html`. Nessuna schermata di login propria (Access fa da gate prima che la pagina si carichi).
- **Stack**: vanilla JS a componenti + token CSS esistenti, coerente col sito.

### Viste

1. **Home admin**
   - Pannello *Sito*: nome, bio, social, picker hero (scelta tra le foto già caricate in qualsiasi album).
   - Pannello *Album*: lista drag & drop per riordino (= ordine in home), "Nuovo album" (chiede il titolo; slug derivato automaticamente, validato, unico), cancellazione con conferma che richiede di digitare il nome dell'album.
2. **Dettaglio album**: griglia foto con drag & drop per riordino (= riscrive manifest), "imposta come cover", elimina foto, dropzone upload multiplo con barra di progresso per file.

### Pipeline di upload (sostituisce `compress.js`)

```
file scelti (JPEG/PNG/WebP; iOS converte HEIC→JPEG alla selezione)
  → se già .webp e lato lungo ≤ 1900px → upload as-is (niente doppia compressione;
    dimensioni lette dal decode per il manifest)
  → altrimenti:
      decode con createImageBitmap (imageOrientation: 'from-image' per l'EXIF)
      resize canvas: lato lungo max 1900px, mai ingrandire
      encode WebP q85:
        · nativo: canvas.toBlob('image/webp', 0.85)   [Chrome/Edge/Firefox/Android]
        · Safari non supporta l'encode WebP (verificato: caniuse, Safari ≤27 desktop
          e ≤26.5 iOS "Not supported") → feature-detect una volta all'avvio
          (encode canvas 1×1, controllo MIME del blob) → dynamic import encoder
          WASM @jsquash/webp (libwebp). Chrome/Android non scaricano mai il chunk.
  → output SEMPRE .webp
  → PUT foto (3 in parallelo, progresso per file)
  → a batch completato: UN solo PUT del manifest aggiornato
```

Decisioni dentro la pipeline:

- **Manifest scritto una volta a fine batch**: niente stati intermedi né corse. Foto caricate ma non a manifest = invisibili al sito, innocue, sovrascritte per nome da un re-upload (recovery idempotente).
- **Naming e deduplicazione a due scope**: nomi normalizzati (minuscole; spazi → trattini; solo `[a-z0-9._-]`, il resto rimosso; estensione `.webp`); l'unicità è verificata contro `nomi nel manifest ∪ nomi già assegnati nel batch corrente`, con suffissi `-2`, `-3`, … assegnati **prima** di avviare gli upload paralleli (due `IMG_001.JPG` da cartelle diverse nello stesso batch non devono sovrascriversi).
- **Protezione del batch**: `beforeunload` agganciato all'avvio del batch e rimosso a manifest salvato (dialogo "vuoi uscire?"). Nota: su iOS Safari `beforeunload` è inaffidabile — la protezione vera resta il re-upload idempotente.
- **EXIF**: la ricodifica canvas elimina tutti i metadati (GPS incluso), come faceva sharp.

## Refactor del sito pubblico

- **Nuovo `src/providers/data.js`**: `fetchSite()`, `fetchAlbums()`, `fetchManifest(slug)` verso `/api/data/*`, con **validazione difensiva della shape** (campi richiesti, array dove attesi) — il gemello runtime di `validateConfig`. Niente throw non gestiti: risultati tipizzati successo/errore.
- **`index.js` (home)**: `Promise.all([fetchSite(), fetchAlbums()])` al bootstrap; skeleton sulle card durante il fetch.
- **`album.js`**: lo slug è noto dall'URL → **tre fetch in parallelo** (`site`, `albums`, `manifest(slug)` ottimistico). Se il manifest torna 404 si consulta l'esito di `albums.json` per distinguere "album non trovato" da errore di rete. Nessun waterfall sequenziale.
- **`r2.js`**: il manifest arriva dal Worker; le immagini restano su URL pubblico R2. **`cache.js` eliminato** (con i suoi test): nato per risparmiare quota API Google Drive, con `no-store` alla edge è solo una fonte di staleness.
- **Meta OG** (`{{SITE_NAME}}` ecc.): restano iniettati al build. Cambiare la bio dall'admin aggiorna il sito visibile, non i meta per i crawler. Trade-off dichiarato e accettato; eliminabile in futuro con HTMLRewriter nel Worker.

## Error handling (fallback asimmetrico)

| Scenario | Comportamento |
|---|---|
| `site.json` irraggiungibile o malformato | **Degradazione silenziosa** ai default di `site.config.js` (build). Il visitatore non vede errori. |
| `albums.json` irraggiungibile o malformato | Messaggio d'errore col pattern esistente (`photo-grid__error` + `texts`): gli album *sono* il contenuto, non c'è fallback sensato. |
| Manifest 404 | "Album non trovato" se lo slug non è in `albums.json`; altrimenti errore generico. |
| API admin: payload invalido | 400 con messaggio; la dashboard lo mostra senza perdere lo stato della vista. |
| API admin: JWT assente/invalido | 401. |
| Upload fallito su singola foto | Retry manuale dalla UI; il batch prosegue con le altre; il manifest include solo le riuscite. |

## Caching

| Risorsa | Politica |
|---|---|
| `site.json`, `albums.json`, `manifest.json` (via Worker) | `Cache-Control: no-store` — sempre freschi |
| Immagini (URL pubblico R2) | Cache lunga edge+browser — immutabili per nome |
| sessionStorage (`cache.js`) | Eliminato |

## Testing (Vitest, pattern esistenti)

- **Worker**: handler testati con binding R2 finto (Map in-memory) — routing, validazioni, `no-store`, paginazione della delete (>1000 oggetti simulati), verifica JWT con JWKS mock (validi, scaduti, kid sconosciuto → refresh).
- **Dashboard**: logica pura estratta in moduli senza DOM — normalizzazione/dedup nomi (incluso scope batch), costruzione manifest, decisione as-is vs ricompressione. La parte canvas/encode si verifica a mano nel browser (jsdom non ha encoder).
- **Sito**: `data.js` con fetch mockato — successo, JSON malformato, rete giù → fallback asimmetrico corretto; `album.js` con manifest 404 nei due casi (slug inesistente vs errore).

## Migrazione (una tantum)

1. Generazione di `_data/albums.json` e `_site/site.json` dai config attuali, upload su R2 (script usa-e-getta o upload manuale via wrangler).
2. Deploy del Worker esteso + sito refactorato (push → build automatica).
3. Configurazione Cloudflare Access dal pannello (policy su `/admin*` e `/api/admin*`, ~10 minuti, guidata).
4. Verifica end-to-end (creazione album di test da `/admin`, upload da Mac e iPhone, riordino, cover, hero, bio).
5. `albums.config.js` eliminato; `compress.js`/`upload.js` e credenziali `.env` deprecati (tenuti un giro come paracadute, poi rimossi).

## Fuori scope (decisioni esplicite)

- Conversione immagini server-side nel Worker: impossibile sul free tier (10ms CPU/richiesta vs decode+resize+encode di foto 10+ MP).
- HTMLRewriter per meta OG runtime e/o inlining dei JSON nell'HTML (azzerare il waterfall): complessità non giustificata oggi; punti di innesto documentati.
- Multi-utente/ruoli: Access con policy a 1 email; allargare = aggiungere email alla policy.
- Custom domain per il bucket immagini: migliorerebbe il controllo cache sulle immagini, non necessario ora.
