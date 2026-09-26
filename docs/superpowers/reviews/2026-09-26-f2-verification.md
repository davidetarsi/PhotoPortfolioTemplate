# F2 verification — 2026-09-26

Piano: `docs/superpowers/plans/2026-09-26-f2-extension-lifecycle.md`. Branch `codex/f2-extension-lifecycle`, base `b46a08d`. Nessun push, merge in `main`, deploy o `apply` è stato eseguito.

## Stato

Task 1–7 completati. Task 1–5: `b46a08d..1f0b42a`; Task 6: `2737379`; Task 7: report `df6c5be`, correzioni dei rilievi `bc334a7`, `e6b418f`, `d52a460`. Verifiche nel browser e review finale eseguite (sezioni sotto). Resta solo la parte che il piano riserva alla persona: push del branch, PR e merge.

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

Node v24.21.0. Snapshot usa-e-getta ottenuti con `git archive` del commit di Task 6 (`2737379`) nella scratchpad di sessione (sotto `/tmp`, poi cancellati; le fixture successive stanno in `/srv/claude/workspaces/f2-fixtures/`), con `wrangler.example.json` copiato come `wrangler.json` e `node_modules` collegato. `custom/` e `wrangler.json` del checkout non sono stati toccati.

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

## Rilievi del Task 7 e correzioni

| Rilievo | Esito |
|---|---|
| Il tema veniva reinserito a ogni `slot()` anche se già ultimo (3 volte sulla home, 4 sull'album) | Corretto in `bc334a7`: `keepCustomThemeLast()` sposta il link solo se dopo c'è un altro `<link rel="stylesheet">` o `<style>`, e lo mette subito dopo l'ultimo. Test RED/GREEN in `src/core/custom-theme.test.js` (nessuna mutazione se già ultimo; spostamento dopo uno `<style>` iniettato in sviluppo). |
| Chunk JS vuoto `assets/theme-*.js` in `dist/` | Corretto in `e6b418f`: il plugin rimuove l'entry JS vuota del tema in `generateBundle` con `order: 'post'`, dopo che la generazione HTML di Vite l'ha usata per collegare il CSS (rimuoverla prima rompe il link: provato). La fixture minima di `customTheme.test.js` non riproduce il chunk, quindi il test RED chiama l'hook su un bundle simulato; l'effetto reale è verificato sulla build dell'esempio. |
| Avviso `INEFFECTIVE_DYNAMIC_IMPORT` a ogni build con `custom/` | Corretto in `d52a460`: `onwarn` in `vite.config.js` nasconde solo quel codice e solo per `src/core/custom-slots.js`, tramite `src/utils/buildWarnings.js` (testato); ogni altro avviso resta. Build dell'esempio: zero avvisi. |
| `custom.example/theme.css` senza `@import`/`url()` | Nessuna modifica: il caso è coperto dal test di integrazione in `src/utils/customTheme.test.js` (tema con `@import` e `url('./texture.svg')`) e dalla sonda di build sopra. La nota precedente di questo report non teneva conto di quel test. |

## Verifiche nel browser

Chromium 153 (Playwright 1.63, build completa in modalità headless nuova: la `headless_shell` e il default di Playwright `--disable-back-forward-cache` impediscono il back/forward cache). Harness fuori dal repo, in `/srv/claude/workspaces/f2-fixtures/`: `browser/server.mjs` serve `dist/` con le stesse regole di routing del Worker e API dati sintetiche (album con foto, vuoto, 500, lento, inesistente), `browser/check.mjs` esegue i controlli. Snapshot con `git archive` del commit `d52a460`: `site-default` senza `custom/`, `site-example` con `custom/` identica a `custom.example/`, `site-failing` con un loader `footer` che fallisce. Build senza avvisi in tutti e tre. Nessun dato reale, nessun invio del form contatti, CSP non applicata dal server locale.

| Snapshot | Esito |
|---|---|
| template senza `custom/` | 26/26 |
| `custom.example/` | 32/32 |
| loader `footer` che fallisce | 3/3 pagine |

Coperto:

- Home: landing di default con le card; con l'esempio, landing importata staticamente che importa l'API pubblica, senza errori d'import/ciclo; `setup.js` logga `page:ready` una volta; sfondo della nav calcolato `rgb(243, 240, 233)` dal tema.
- Priorità del tema sul CSS lazy: dopo il caricamento della griglia lazy l'ordine è `… page, example-photo-grid, THEME`, e il bordo calcolato di `.example-photo-grid__item` è `rgb(35, 53, 74)` (tema), non l'accento `#b64f36` della regola lazy di pari specificità.
- Album: 2 foto; lightbox aperto al click, chiuso con Escape (focus restituito all'elemento) e con il pulsante; stati vuoto, non trovato (con link alla home), errore sconosciuto (500) ed errore di rete (richiesta interrotta) con i testi di `texts.config.js`; 12 skeleton visibili mentre il manifest è in attesa, poi la griglia.
- About: titolo, form contatti, nav e footer; tema ultimo con l'esempio.
- `/admin`: nessun link `data-custom-theme` e nessun CSS `theme-*`.
- Back/forward cache: `/travel` → `/about` → indietro ripristina la pagina (`pageshow` con `persisted: true`), senza griglia né lightbox duplicati. Sequenza degli eventi misurata nella pagina, con un `setup.js` strumentato solo nella fixture: `setup` eseguito una volta; eventi `ready(restored=false)`, `leave(persisted=true)`, `ready(restored=true)`. Il conteggio tramite console non è affidabile qui: al ripristino Chrome ripete i messaggi di console precedenti della pagina.
- Loader custom che fallisce (spec §6, Verification): su home, album e About l'errore esplicito `custom/slots.js: slot "footer" failed to load: …` è in console, nessuna promise rifiutata non gestita, la nav si monta, il footer resta vuoto (nessun fallback silenzioso), `page:ready` arriva.

Non coperto: il server di sviluppo di Vite (il tema è verificato solo nella build di produzione, come da piano "production-first"); la CSP reale, che il server locale non applica.

## Review finale

Diff `b46a08d..d52a460` rivisto per intero rispetto ai cinque punti del piano. Nessun problema bloccante.

1. `pagehide` con mount in corso: `track()` distrugge una sola volta un handle che arriva dopo la distruzione (`page.test.js`); con `persisted: true` nulla viene distrutto e `onPageShow` riemette `page:ready` solo se la pagina era già pronta, quindi un ripristino prima della readiness non produce un doppio `ready`. Quest'ultima combinazione è verificata leggendo il codice, non da un test dedicato.
2. Loader o cleanup che lanciano: pipeline nav/footer separate (`chrome.test.js`), cleanup isolati (`page.test.js`), griglia custom fallita senza bloccare chrome e readiness (`album.test.js`), confermato nel browser.
3. Tema con import/asset e CSS lazy: build e browser, sopra.
4. Ciclo d'import dell'API: facciata lazy `slot`, confermata nel browser con la landing statica dell'esempio.
5. Stati dell'album: skeleton prima del fetch, readiness e eventi foto (`album.test.js`), confermati nel browser.

Note minori, non bloccanti:

- Il nav di default riceve ora l'intero `site` invece di `{ name }`; `renderNav` legge solo `name`.
- Con il lightbox aperto, una chiusura non persistente della pagina chiama `destroy()`, che emette `photo:close` dopo `page:leave`. È il comportamento documentato in `docs/slots.md`.
- Un loader `landing` che fallisce lascia la home senza landing ma emette comunque `page:ready`: coerente con "errori espliciti, nessun fallback automatico".

## Aperto

Per F2 nulla, salvo la decisione della persona su push del branch, PR e merge. Rinviati esplicitamente a F3 (vedi "Audit delle route"): incoerenza delle liste di slug riservati, destino dell'alias `/contatti`, conversione in inglese degli esempi F3.
