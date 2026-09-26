# F2 verification — 2026-09-26

Piano: `docs/superpowers/plans/2026-09-26-f2-extension-lifecycle.md`. Branch `codex/f2-extension-lifecycle`, base `b46a08d`. Nessun push, merge in `main`, deploy o `apply` è stato eseguito.

## Stato

Task 1–5 completati (commit `b46a08d..1f0b42a`). Task 6 completato (`2737379`). Task 7: la parte dell'implementer (matrice template/esempio, build, esecuzione del bundle) è fatta; le verifiche nel browser e la review indipendente del maintainer restano aperte. Le sezioni qui sotto dicono cosa è stato verificato e cosa no.

## Task 6 — esempi e documentazione

- `custom.example/setup.js` si iscrive a `page:ready` e restituisce la funzione di disiscrizione come cleanup.
- `custom.example/theme.css` è un override visibile (variabili colore, sfondo di nav e footer) e contiene una regola `.example-photo-grid__item` con la stessa specificità di quella del CSS lazy: vince solo se il tema resta l'ultimo foglio di stile.
- `custom.example/slots.js` dichiara un edge statico (`landing`, che importa `/src/api/index.js`: esercita il ciclo di import) e un edge lazy (`photoGrid`, con il proprio CSS).
- `docs/slots.md` documenta i cinque contratti, la proprietà degli handle, readiness e ripristino da back/forward cache, gli errori espliciti senza fallback, l'ordine del CSS, la facciata lazy `slot` e il divieto di risolvere slot al top level. `README.md` e `docs/upgrading.md` rimandano alla guida.
- Correzioni in ripresa, dopo la review del WIP `3b061dc`:
  - in `docs/slots.md` due paragrafi consecutivi ripetevano "Keep `custom/slots.js` to loaders"; sono uniti in uno, che spiega anche che gli import statici di quel file sono valutati su ogni pagina (coerente con il pattern "import it at the top" documentato subito sotto e usato dall'esempio);
  - il contratto `lightbox` citava solo `open` e `destroy`; ora elenca anche `close()` e dice quando va chiamato `onClose` (una volta per chiusura di un'istanza aperta, anche via `destroy()`, mai su un'istanza già chiusa), come fa `src/components/Lightbox.js`.
- Slug di seed ed esempi in inglese, come autorizzato: `nome-album` → `album-name` (`config/albums.config.js`), `viaggi` → `travel` (test della landing di esempio). I `viaggi` rimasti in `src/api/index.test.js`, `src/admin/**` e `src/worker/page-meta.test.js` simulano album utente e restano: gli slug degli utenti non hanno vincoli di lingua.

## Audit delle route

Rotte canoniche (inglese, minuscolo):

| Percorso | Dove è dichiarato |
|---|---|
| `/` | `index.html` |
| `/about` | `STATIC_PAGES` in `src/worker.js`, link in `src/components/Nav.js` |
| `/admin` | `STATIC_PAGES` in `src/worker.js` |
| `/api/data/*`, `/api/admin/*`, `/api/contact` | `src/worker.js` |
| `/<slug album>` | `ALBUM_SLUG_RE` in `src/worker.js` e `src/utils/devRouteFallback.js` |

Alias legacy: `/contatti` (con o senza barra finale) → 301 verso `/about`, in `src/worker.js`, coperto da `src/worker.test.js`. Mantenuto in F2. Nessun `/contacts` è stato aggiunto e nessun percorso è stato migrato; la decisione su rimuovere l'alias, aggiungere `/contacts` o tenere solo About resta a F3 (spec §6).

Percorsi negli esempi: `custom.example/` usa solo `/sport` e `/travel` come slug di album di prova. Nessuna nuova rotta di pagina è introdotta da F2.

Esempi F3 in italiano, **non implementati**: `docs/superpowers/plans/2026-09-25-f3-pagine-del-sito.md` e la spec §2.5 usano `/archivio`, `/codice/:slug`, `custom/pages/archivio.html`, `custom/pages/progetto.html`, `custom/content/progetti.json`. Sono in attesa di conversione in inglese quando F3 verrà ripreso.

Slug riservati, **incoerenza non risolta, rinviata a F3**: le tre liste divergono.

| Lista | Contenuto |
|---|---|
| `RESERVED_SLUGS` (`src/shared/content-rules.js`: dashboard, Worker admin) | `admin`, `api`, `assets`, `about` |
| `RESERVED_PATHS` (`src/utils/devRouteFallback.js`) | `/about`, `/admin`, `/contatti` |
| Worker (`src/worker.js`, ordine dei rami) | API, `/contatti`, `/about`, `/admin` prima del ramo album |

Conseguenza: dalla dashboard si può ancora creare un album `contatti`, irraggiungibile in produzione (il Worker risponde 301 prima del ramo album). Già segnalata nella spec §1 e §3; F2 non modifica regole di routing o slug riservati.

## Verifiche eseguite

Node v24.21.0. Snapshot usa-e-getta ottenuti con `git archive` del commit di Task 6 (`2737379`) nella scratchpad di sessione, con `wrangler.example.json` copiato come `wrangler.json` e `node_modules` collegato. `custom/` e `wrangler.json` del checkout non sono stati toccati.

| Snapshot | `npm test` | `ALLOW_PLACEHOLDER_CSP=1 vite build` |
|---|---|---|
| checkout, `3b061dc` + docs Task 6 | 67 file, 508 passati, 1 saltato | — |
| template pulito (senza `custom/`) | 67 file, 508 passati, 1 saltato | riuscita |
| copia di `custom.example/` in `custom/` | 69 file, 511 passati, 1 saltato | riuscita |

HTML di build:

- Senza `custom/`: nessun link `data-custom-theme` e nessun asset `theme-*` emesso.
- Con l'esempio: `<link rel="stylesheet" … href="/assets/theme-….css" data-custom-theme>` è l'ultimo foglio di stile su `index.html`, `album.html` e `about.html`, e assente da `admin.html`. Ogni `href="/assets/…"` degli HTML punta a un file esistente.
- Tema con `@import` e `url()` relativo (snapshot sonda separata): l'import è incorporato nel CSS del tema, l'immagine è emessa come `/assets/big-….svg` e l'URL riscritto.

Esecuzione del bundle di build (Node + jsdom, fetch simulati con dati sintetici, evento `load` dei `<link>` simulato perché jsdom non carica fogli di stile):

- Home con l'esempio: la landing importata staticamente, che importa `/src/api/index.js`, si monta ("Probe Site" + album "Travel"); nessun errore d'import o di ciclo, nessun `console.error`, nessuna promise rifiutata non gestita; `setup.js` logga `[site] home ready for Probe Site`.
- Album `/travel` con l'esempio: griglia lazy montata (1 elemento), nav montata, `page:ready` emesso, nessun errore. Ordine dei fogli di stile: il CSS lazy della griglia viene inserito dopo il tema, poi il tema torna in fondo (`… page, example-photo-grid, theme`).
- About con l'esempio e album con il template pulito: montati, nessun errore.

Questo non sostituisce il browser: jsdom non calcola la cascata dai fogli di stile esterni, quindi la priorità *calcolata* del tema non è dimostrata qui.

## Rilievi per il maintainer

- **Il tema viene reinserito a ogni `slot()`, anche quando è già l'ultimo.** `keepCustomThemeLast()` gira nel `finally` di ogni risoluzione di slot e fa `appendChild` senza controllare la posizione: sul bundle, 3 reinserimenti del `<link>` sulla home, 4 sull'album (uno solo necessario, dopo il CSS lazy), 2 su About. Rimuovere e reinserire un foglio di stile può, secondo il browser, ricaricarlo dalla cache e ricalcolare gli stili: da verificare nel browser se produce un lampo senza tema. Correzione possibile, non applicata: spostare il link solo se dopo di esso c'è un altro foglio di stile.
- **Avviso di build con `custom/`:** `[INEFFECTIVE_DYNAMIC_IMPORT] src/core/custom-slots.js is dynamically imported by src/api/index.js but also statically imported by …`. Atteso: la facciata lazy serve a non valutare il registro importando l'API, e l'esecuzione sopra non mostra problemi di ciclo. Ma un fork lo vedrà a ogni build; valutare se documentarlo o silenziarlo.
- **Chunk JS vuoto per il tema:** l'input `theme` emette anche `assets/theme-….js` (`/* empty css */`), non referenziato da nessun HTML. Innocuo, ma finisce in `dist/`.
- **L'esempio `theme.css` non contiene `@import` né `url()`:** quella parte del punto 3 della review è coperta solo dalla sonda sopra e dai test di `src/utils/customTheme.test.js`.

## Aperto

- Verifiche nel browser (maintainer): home default ed esempio, album con lightbox apri/chiudi, stati errore/vuoto, About, isolamento del tema da `/admin`, **priorità calcolata del tema dopo il caricamento del CSS lazy della griglia**, eventuale lampo da reinserimento del tema, ripristino back/forward. In questa sessione non c'era un browser headless.
- Review indipendente del diff completo `b46a08d..HEAD`.
