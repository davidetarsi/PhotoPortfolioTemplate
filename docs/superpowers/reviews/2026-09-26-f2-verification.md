# F2 verification — 2026-09-26

Piano: `docs/superpowers/plans/2026-09-26-f2-extension-lifecycle.md`. Branch `codex/f2-extension-lifecycle`, base `b46a08d`. Nessun push, merge in `main`, deploy o `apply` è stato eseguito.

## Stato

Task 1–5 completati (commit `b46a08d..1f0b42a`). Task 6 chiuso con questo documento. Task 7 (matrice finale e verifiche nel browser) e la review indipendente del maintainer restano aperti: le sezioni qui sotto dicono cosa è stato verificato e cosa no.

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

- Sul WIP `3b061dc` più le correzioni di documentazione di Task 6, Node v24.21.0: `npm test` 67 file, 508 passati, 1 saltato.

## Aperto

- Task 7: matrice template pulito e copia di `custom.example/` in snapshot usa-e-getta, test completi e build con `ALLOW_PLACEHOLDER_CSP=1`, verifica reale del ciclo di import dell'API.
- Verifiche nel browser (maintainer): home default ed esempio, album con lightbox apri/chiudi, stati errore/vuoto, About, isolamento del tema da `/admin`, **priorità calcolata del tema dopo il caricamento del CSS lazy della griglia**, ripristino back/forward.
- Review indipendente del diff completo `b46a08d..HEAD`.
