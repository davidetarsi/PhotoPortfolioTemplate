# Ordinamento foto per data + salvataggio esplicito sottotitolo/cover — Design Spec

**Data:** 2026-07-12
**Contesto:** Parte del redesign della pagina album admin (mockup fornito dall'utente). Copre solo i due task identificati come non banali (#4 e #6 dell'elenco originale); gli altri item (top bar, emoji fissa, riga vincoli upload, timestamp, restyle badge, sfondo da config) sono semplici e non richiedono design dedicato — vanno implementati direttamente.

## Goal

Due funzionalità correlate nella vista album della dashboard:
1. Ordinare le foto per data di scatto (fallback: data di caricamento), con la stessa foto d'ordine che oggi produce il drag&drop manuale.
2. Sottotitolo album (campo nuovo) e cover diventano modifiche "pending" con Salva esplicito, invece di scrivere subito ad ogni interazione.

Upload, eliminazione e riordino foto **restano immediati** come oggi — non toccati da questo design.

## Decisioni chiave

- L'estrazione EXIF serve solo lato browser (pipeline `pipeline.js`/`encoder.js`/`upload-manager.js`) — l'utente non usa più il flusso CLI (`compress.js`/`upload.js`), quindi quei due script non vengono toccati.
- "Ordina per data" non è una modalità di visualizzazione separata: scrive l'ordine con la stessa `putManifest()` già usata dal drag&drop. Nessuno stato "sono in modalità sort" da tracciare — l'ultima azione (drag o sort) è semplicemente l'ordine attuale.
- Sottotitolo e cover condividono lo stesso oggetto (`albums.json`), quindi un solo Salva per entrambi, sul modello già esistente di `buildPendingSite`/"Salva sito" in `home.js`.

## Sezione 1 — Schema manifest

Ogni entry di `manifest.json` guadagna due campi **opzionali**:

```js
{ name: string, width: number, height: number, capturedAt?: number, uploadedAt?: number }
```

- `uploadedAt`: `Date.now()`, catturato sempre al momento dell'upload, nessuna dipendenza esterna.
- `capturedAt`: da EXIF `DateTimeOriginal` (epoch ms), presente solo se l'estrazione riesce.

Retrocompatibilità: le foto già in bucket non hanno né l'uno né l'altro campo — `validateManifestShape` (`src/shared/content-rules.js`) li valida come opzionali, `Number.isFinite` solo se presenti, nessun errore se assenti.

## Sezione 2 — Estrazione EXIF lato browser

**Punto critico (verificato nel codice, non assunto):** `createImageBitmap()` produce un `ImageBitmap` — pixel puri, senza alcun canale metadati. Se si prova a leggere EXIF dopo questo punto (dal bitmap o dal blob ri-codificato), si ottiene sempre `undefined`. `exifr.parse()` deve leggere il `File` **originale**, prima o indipendentemente da `decode()`.

Verificato: `processFile(file, { decode, encode })` in `src/admin/pipeline.js` riceve `file` come parametro e non lo consuma — resta accessibile per tutta la funzione indipendentemente da quando gira `decode(file)`. Stesso discorso in `runBatch()` (`src/admin/upload-manager.js`), dove il file grezzo è `job.file`.

**Implementazione:**
- Libreria: `exifr` (da confermare/installare in fase di piano — legge EXIF da File/Blob sia Node che browser, non richiede `sharp`).
- In `pipeline.js`, dentro `processFile`, prima o in parallelo a `decode(file)`:
  ```js
  const uploadedAt = Date.now();
  const capturedAt = await extractCapturedAt(file); // wrapper su exifr, cattura eccezioni → undefined
  ```
- `extractCapturedAt` non deve mai lanciare: se `exifr.parse()` fallisce o non trova `DateTimeOriginal` (foto da screenshot, WhatsApp, download — spesso senza EXIF), ritorna `undefined` e l'upload prosegue comunque. Nessun errore bloccante.
- `processFile` ritorna questi due campi insieme a `blob`/`width`/`height`; `runBatch` li include nell'entry scritta in manifest.

## Sezione 3 — Ordina per data

Controllo "Ordina per: Data" nella vista album (`src/admin/views/album.js`). Al click:

```js
const sortKey = p => p.capturedAt ?? p.uploadedAt ?? 0; // fallback assoluto, mai NaN nel comparator
const sorted = [...manifest].sort((a, b) => sortKey(a) - sortKey(b));
await api.putManifest(slug, sorted);
manifest = sorted;
renderPhotos();
```

**Perché il fallback `?? 0` è necessario (non "undefined è impredicibile nei browser" — quello è garantito dallo spec ECMAScript, foto `undefined` andrebbero comunque in fondo):** il rischio reale è che `capturedAt ?? uploadedAt` valga `undefined` per le foto legacy prive di entrambi i campi, e `undefined - numero = NaN`. Un comparator che ritorna `NaN` non ha garanzie di ordinamento ben definite. Il fallback `?? 0` (epoch 1970) garantisce che il comparator ritorni sempre un numero reale — le foto legacy, tutte con chiave `0`, si raggruppano in modo deterministico (sort stabile da ES2019: mantengono l'ordine relativo che avevano nel manifest) in fondo a un ordinamento crescente.

Nessuno stato "modalità sort" persistito: è solo un secondo modo — oltre al drag&drop — di produrre un nuovo ordine e scriverlo con la stessa `putManifest`. Un drag successivo sovrascrive normalmente, senza conflitti da risolvere.

## Sezione 4 — Sottotitolo + cover con Salva esplicito

Nuovo campo testo per `description` nella vista album, editabile. Cover e sottotitolo diventano **pending**: stato locale (`{ description, coverName }`), non scritto finché non si preme "Salva".

Riuso diretto del pattern già in `src/admin/views/home.js` (`buildPendingSite` + bottone "Salva sito"):
- `buildPendingAlbum({ description }, currentAlbum)` — funzione pura, stessa forma di `buildPendingSite`.
- Bottone "Salva" → `api.putAlbums(...)` con `description` e `coverName` pending, un'unica chiamata.
- Cliccare "Cover" su una foto aggiorna solo lo stato locale pending (bordino di selezione si sposta, come già implementato), **non** chiama più `api.putAlbums()` immediatamente.

**Non tocca:** upload foto, eliminazione foto, riordino/sort — restano tutte chiamate immediate come oggi, invariate. Il motivo per tenerle separate: appartengono a `manifest.json`, un oggetto diverso da `albums.json` (dove vivono `description`/`coverName`); unificarle nello stesso Salva richiederebbe gestire fallimenti parziali tra due scritture diverse senza un beneficio chiaro.

## Sezione 5 — Protezione modifiche non salvate

Due meccanismi complementari, non ridondanti (coprono casi diversi):

1. **Navigazione interna SPA** (click su "← Tutti gli album" o altro link interno): se ci sono modifiche pending, `deps.confirm('Ci sono modifiche non salvate. Uscire comunque?')` prima di navigare. Stesso pattern già usato per la conferma di eliminazione foto.

2. **Navigazione reale del browser** (refresh, chiusura tab, tasto Indietro nativo — nessuno di questi passa dal click handler sopra): riuso diretto di `attachBeforeUnloadGuard()`, già esistente in `src/admin/upload-manager.js:5-9` e testato in `upload-manager.test.js`, oggi usato per proteggere il batch di upload in corso. Si aggancia quando lo stato pending diventa "dirty" (sottotitolo o cover modificati), si stacca al salvataggio riuscito.

## Fuori scope (esplicitamente escluso)

- Toggle vista griglia/lista (#5 dell'elenco originale) — feature visiva indipendente, non richiede design dedicato.
- Modifiche a `scripts/compress.js`/`scripts/upload.js` (flusso CLI) — non più usato.
- Top bar per-pagina, emoji fissa, riga vincoli, timestamp nel badge, restyle colore badge, sfondo da config — semplici, implementazione diretta senza spec.
- Pulizia degli orfani R2 per upload mai "confermati" — non applicabile qui: upload restano immediati, non c'è stato pending per le foto stesse.

## Testing

- `content-rules.test.js`: `capturedAt`/`uploadedAt` opzionali in `validateManifestShape`, sia presenti che assenti.
- `pipeline.test.js`: `extractCapturedAt` — EXIF presente, assente, file corrotto (mai lancia, sempre `undefined` sul fallimento).
- `album.test.js`: sort-by-date con foto miste (con/senza date, fallback a 0), Salva pending per description/cover (nessuna chiamata API prima del click, una sola chiamata `putAlbums` al click), conferma su navigazione con modifiche pending.
- `upload-manager.js`: `attachBeforeUnloadGuard` già testato — riuso, non richiede nuovi test se l'aggancio/sgancio segue lo stesso contratto.
