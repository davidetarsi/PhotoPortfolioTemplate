# Punti di aggancio (`custom/`) — Design e roadmap

**Data**: 2026-09-25
**Stato**: F4, F1 e F2a incluse nel `main` locale; F2a integrata con merge `8f3b4d8785fa840c5c311a73390c398c5721dee0` il 2026-09-26. F2 completata sul branch `codex/f2-extension-lifecycle` il 2026-09-26 (verifica: `docs/maintainers/superpowers/reviews/2026-09-26-f2-verification.md`), in attesa di PR e merge. Cartella del fork: `custom/` (§6)
**Verificato su**: `main` locale @ `8f3b4d8785fa840c5c311a73390c398c5721dee0` (genitore precedente `e609df7`). Suite e build locali passate sul merge; nessuna verifica di remoto o deploy.
**Origine**: il sito personale (davidetarsi.com) vuole una landing completamente diversa — una carta
nautica a due livelli — senza modificare i file del template, così che ogni `git merge upstream/main`
resti pulito. Oggi il template permette di personalizzare solo `config/` e `theme/`: tutto il resto è
comportamento, e toccarlo significa conflitti a ogni aggiornamento.

## Obiettivo

Aggiungere una **terza zona di personalizzazione**, `custom/`, facoltativa e mai presente nel template.
Chi non la crea non vede nessuna differenza. Chi la crea può:

1. sostituire parti intere del sito (landing, nav, footer, griglia foto, lightbox) con componenti propri;
2. agganciarsi agli eventi di pagina per aggiungere animazioni o comportamenti;
3. aggiungere un foglio di stile proprio caricato dopo `theme/`;
4. aggiungere pagine nuove, anche generate da contenuti (per esempio una pagina per progetto);

— senza modificare un solo file che arriva dal template.

In più, il Worker inserisce titolo, descrizione e immagine **del singolo album** nell'HTML, così
che un link condiviso mostri l'anteprima giusta. È un limite che `CUSTOMIZING.md` oggi dichiara
accettato "by design": con il Worker già davanti alle pagine album non è più necessario accettarlo.

## Non obiettivi

- Nessun cambiamento per chi usa solo `config/` e `theme/`: stessi file, stesso comportamento, stessi test.
- Nessun sistema di plugin generico, nessun caricamento a runtime da URL esterne, nessuna UI.
- Il template **non** include librerie nuove in questo lavoro (PhotoSwipe, GSAP, ecc.): gli slot le
  rendono possibili, i piani successivi le valutano una per una.
- Nessuna garanzia di stabilità sugli interni di `src/`: la promessa vale solo per il contratto degli
  slot e per `src/api/index.js`.

---

## 1. Il punto di partenza, verificato

| Cosa | Stato al 2026-09-25 |
|---|---|
| Zone di personalizzazione | `config/` (seed) e `theme/` (token, tipografia, variante card). `CUSTOMIZING.md` vieta `src/` |
| Landing | markup fisso in `index.html` (`#hero`, `#albums-heading`, `#album-cards`), rendering in `src/pages/index.js` |
| Pagina album | `album.html` unica per tutti gli album; lo slug viene da `location.pathname` |
| Routing in produzione | Workers Static Assets serve prima i file statici; il Worker (`src/worker.js`) riceve solo ciò che non corrisponde a un file: API, `/contatti`, slug album → `album.html` |
| Routing in sviluppo | `devRouteFallback` con `RESERVED_PATHS` fisso (`/about`, `/admin`, `/contatti`) |
| Slug riservati | `RESERVED_SLUGS` in `src/shared/content-rules.js`, condiviso da sito, dashboard e Worker — **ma non allineato**: il Worker gestisce `/contatti` (redirect 301 verso `/about`) prima del ramo album, e `contatti` non è riservato; `devRouteFallback` ha una terza lista, `RESERVED_PATHS`, che invece lo include. Oggi dalla dashboard si può creare un album `contatti` irraggiungibile in produzione |
| Meta Open Graph | iniettati al build da `injectSiteMeta` con i valori **seed** di `site.config.js`; ogni album condivide l'anteprima generica |
| Lightbox | `createLightbox(photos)` → `{ open(i, triggerEl), close(), destroy() }`, nessun callback di chiusura |
| Test | Vitest 4 + jsdom; i test del Worker usano `// @vitest-environment node` e i fake di `src/worker/test-helpers.js` |

## 2. La forma della soluzione

### 2.1 Una cartella che il template non tocca mai

```
custom/                    ← solo nel repo del sito, mai nel template
  slots.js               ← quali parti sostituire
  setup.js               ← (facoltativo) agganci agli eventi
  theme.css              ← (facoltativo) stile caricato dopo theme/
  pages.config.js        ← (facoltativo) pagine aggiuntive
  pages/…                ← HTML e JS delle pagine aggiuntive
  components/…           ← componenti propri
custom.example/            ← nel template: esempio minimo da copiare
```

Il template scopre `custom/` con `import.meta.glob`, che restituisce un oggetto vuoto se il file non
esiste: **nessuna configurazione e nessun import che fallisce** quando la cartella manca.

### 2.2 Slot: parti sostituibili con un contratto unico

Le pagine non importano più direttamente Nav, Footer, Hero, PhotoGrid, Lightbox: li chiedono a un
registro. Se `custom/slots.js` fornisce un'alternativa, usa quella; altrimenti il componente di base.

Due forme di contratto, perché i componenti di oggi sono di due tipi:

| Tipo | Firma | Slot |
|---|---|---|
| `mount` | `mount(container, ctx) → { destroy?() } \| Promise<…>` | `landing`, `nav`, `footer`, `photoGrid` |
| `create` | `create(items, ctx) → { open(i, triggerEl), close(), destroy() }` | `lightbox` |

Il registro rifiuta con un errore esplicito uno slot sconosciuto o un'implementazione che non rispetta
il tipo, **in dev e in `npm test`** — che il deploy esegue prima della build — non in produzione davanti a
un visitatore. `vite build` da sola non esegue il registro: la garanzia passa dai test.

### 2.3 Eventi di pagina

Un emettitore minimo (`on`, `emit`) con quattro eventi: `page:ready`, `page:leave`, `photo:open`,
`photo:close`. `custom/setup.js` riceve `{ on, page }` una volta per pagina. È il posto per GSAP,
analytics, qualunque comportamento che non sostituisce un componente ma gli si affianca.

### 2.4 Una superficie pubblica stabile

`src/api/index.js` riesporta ciò che il codice in `custom/` può usare: lettura dati (`fetchSite`,
`fetchAlbums`, `fetchManifest`, `fetchConfig`), trasformazioni (`resolveSiteContent`, `resolveAlbums`,
`albumsToCards`, `photosFromManifest`), `slot`, `on`, `texts`, e gli helper delle pagine. **Il codice in
`custom/` importa solo da lì.** Un test fissa l'elenco degli export: rimuoverne uno rompe il test, cioè
diventa una decisione esplicita e non un incidente.

### 2.5 Pagine del sito

`custom/pages.config.js` dichiara pagine di due tipi:

- **singola** — `{ path: '/archivio', html: 'custom/pages/archivio.html' }` → `dist/archivio.html`;
- **collezione** — `{ path: '/codice/:slug', html: 'custom/pages/progetto.html', entries }` → un file
  statico per voce (`dist/codice/sea-sentinels.html`), con titolo, descrizione e immagine già
  scritti nell'HTML. `entries` è un array o una funzione (anche asincrona) che legge i contenuti dal repo.

Sono file statici: in produzione li serve Workers Static Assets **prima del Worker**, senza alcuna
modifica al Worker. In sviluppo li serve `devRouteFallback`, che diventa una factory che conosce
le pagine del sito. I primi segmenti dei percorsi diventano slug riservati nella dashboard, così non
si può creare un album che verrebbe nascosto da una pagina.

### 2.6 Meta per album nel Worker

Il ramo "slug album" del Worker legge `_data/albums.json` e `_site/site.json` da R2 e riscrive
l'`<head>` di `album.html`: titolo, descrizione, `og:*`, URL canonico, immagine di copertina. Se
`albums.json` esiste e lo slug non c'è, risponde **404** con la stessa pagina (che mostra già
"non trovato"). Se `albums.json` non esiste ancora (installazione nuova, fallback al seed) lascia
tutto com'è oggi.

## 3. Decisioni e alternative scartate

| Decisione | Alternativa scartata | Perché |
|---|---|---|
| `custom/` scoperta con `import.meta.glob` | voce `custom: true` in `config/` | i file di `config/` tornano al seed a ogni aggiornamento (`docs/upgrading.md`): la personalizzazione si perderebbe |
| Validazione degli slot al caricamento | TypeScript sulle firme | il template è JavaScript senza build step di tipi; un errore esplicito in dev basta |
| Pagine del sito statiche, generate al build | pagine servite dal Worker con una tabella di rotte | il Worker non può leggere `custom/` (wrangler non fa glob); i file statici non richiedono di toccarlo e sono il caso migliore per la SEO |
| Collisione slug album / pagina bloccata dalla dashboard | anche il Worker che rifiuta lo slug | il Worker non conosce `custom/`; la dashboard è l'unico punto in cui si creano album. Il caso residuo (album creato a mano in `albums.json`) è documentato: vince la pagina |
| Riscrittura dell'`<head>` con funzioni su stringhe | `HTMLRewriter` | `HTMLRewriter` non esiste nei test Node; l'`<head>` di `album.html` è nostro e stabile. Se in futuro serve, la funzione si sostituisce senza cambiare il ramo del Worker |
| Promessa di stabilità solo su `src/api` e slot | nessuna promessa | senza una superficie dichiarata ogni refactoring interno del template rischia di rompere i siti |
| Un'unica fonte di verità per i percorsi riservati, prima di F3 | una lista per ogni punto che instrada (dashboard, Worker, dev server, pagine del sito) | le tre liste di oggi già divergono (bug `contatti`, da correggere subito e a parte); F3 ne aggiungerebbe altre due |

## 4. Rischi

- **Deriva del contratto.** Mitigazione: test di contratto sugli slot e sull'elenco degli export di
  `src/api`; una riga in `docs/upgrading.md` per ogni cambiamento.
- **`custom/` finita per errore nel template.** Un test che gira ovunque non può distinguere il template da un
  fork, ma un job CI sì: eseguito solo quando `github.repository == 'davidetarsi/PhotoPortfolioTemplate'`,
  fallisce se `custom/` esiste. I fork hanno un altro nome di repo e non lo eseguono mai. In più la regola
  va in `CONTRIBUTING` e nella checklist di release.
- **Ordine di servizio degli asset.** Le pagine del sito contano sul comportamento predefinito di
  Workers Static Assets (file prima del Worker, `/archivio` → `archivio.html`). Va verificato su un
  deploy reale nella fase 3.
- **Home e About restano con i meta seed.** Sono serviti come file statici, il Worker non li vede.
  Estenderli richiede `run_worker_first` su quei percorsi: fuori da questo lavoro, annotato sotto.
- **Costo e cache di F4.** Le pagine album rispondono con `no-cache` (non `no-store`: deciso dopo la
  revisione finale). La pagina riscritta non ha validatori, quindi ogni visita la richiede comunque al
  Worker — stessa freschezza — ma resta nella cache avanti/indietro del browser: tornando a un album lungo
  la griglia non si ricarica. Ogni visita fa due letture R2 (`albums.json`, `site.json`) e nessuna cache
  CDN: irrilevante a scala hobby — il piano gratuito di R2 copre milioni di letture al mese — ma se il
  traffico crescesse la risposta è un `max-age` breve, non togliere la lettura live.
- **Staging indicizzabile.** Oggi staging non ha né `X-Robots-Tag` né `noindex`. È un problema
  preesistente, che F4 non peggiora (il canonical di staging punta a staging stesso): va risolto a parte.
- **Il prefisso di una collezione non è una pagina.** Con F3, `/codice` senza una pagina singola dichiarata
  a quel percorso arriva al ramo album del Worker e, dopo F4, risponde 404 "album non trovato".
  `docs/site-pages.md` deve dirlo e suggerire di dichiarare una pagina singola al prefisso.

---

## 5. Roadmap

Quattro fasi, ognuna rilasciabile da sola e con il proprio piano. Stime con Claude Code, test e
documentazione compresi.

**Ordine: F4 → F1 → F2a → F2, poi F3 solo quando serve.**

| Ordine | Fase | Contenuto | Piano | Stima | Dipende da | Esecutore |
|---|---|---|---|---|---|---|
| 1 | **F4** | Meta per album nel Worker, 404 per album inesistenti | `plans/2026-09-25-f4-meta-album-worker.md` | 2–3 h | — | modello economico: il piano contiene tutto il codice |
| 2 | **F1** | Registro degli slot, slot `landing`, `custom.example/`, documentazione di base | `plans/2026-09-25-f1-slot-landing.md` | 3–4 h | — | modello economico |
| 3 | **F2a** | API pubblica minima per `custom/`: `src/api/index.js` con `albumsToCards` | `plans/2026-09-26-f2a-api-pubblica-minima.md` | 1 h | F1 | modello economico |
| 4 | **F2** | Slot `nav`, `footer`, `photoGrid`, `lightbox`; eventi; `custom/setup.js`; `custom/theme.css`; `src/api` | `plans/2026-09-25-f2-slot-album-ed-eventi.md` | 3–4 h | F1, F2a | modello economico |
| 5 | **F3** | Pagine del sito (singole e collezioni), dev server, slug riservati | `plans/2026-09-26-f3-custom-pages.md` (sostituisce `plans/2026-09-25-f3-pagine-del-sito.md`) | 6–8 h | F2, percorsi riservati unificati | modello standard, dopo aver dettagliato i task in prosa |

**Totale: 15–20 ore.**

**Perché questo ordine.** F4 è indipendente, piccola e utile a *tutti* i fork: un link a un album
condiviso che mostra la copertina giusta vale più di qualunque slot per chi fa foto, e il 404 vero
chiude i soft-404 che oggi i motori di ricerca indicizzano. F1 e F2 sono la base dell'estensibilità
e hanno piani con il codice completo.

**Perché F3 aspetta.** È la fase più rischiosa (plugin Vite che sposta gli HTML nel bundle, moduli
virtuali, collezioni espanse al build), quella con più task descritti solo in prosa, e la più legata
al sito personale: le collezioni nascono per le pagine progetto di davidetarsi.com, e a un fotografo
servono molto meno. Si fa quando il sito personale ha davvero pagine da pubblicare, dopo aver
unificato i percorsi riservati (§3) e riscritto i task in prosa sul codice di quel momento.

Dopo F4 ogni fork ha anteprime giuste per gli album. Dopo F1 il sito personale può sostituire la
landing. Dopo F2 può sostituire nav e footer (la rosa dei venti al posto della barra) e animare.
Dopo F3 ha archivio e pagine progetto con indirizzo proprio.

### Piani successivi, da scrivere quando servono

Non fanno parte di questo lavoro; ognuno sarà un piano a sé, costruito sopra gli slot.

| Tema | Idea | Nota |
|---|---|---|
| Lightbox | PhotoSwipe come implementazione di base dello slot `lightbox`, dietro la stessa interfaccia | le dimensioni richieste sono già nel manifest; verificare la CSP |
| Miniature | seconda versione (~800 px) nella pipeline e `gridUrl` separato da `fullUrl` | oggi la griglia scarica le foto da 1900 px |
| EXIF | fotocamera, obiettivo, esposizione nel manifest; **GPS solo con consenso esplicito per album** | il GPS può rivelare luoghi privati: spento per default |
| Font | Fontsource in locale, token in `theme/`, rimozione di Google dalla CSP | riduce i "tre passaggi" di `CUSTOMIZING.md` a uno |
| Transizioni | View Transitions CSS tra home e album | progressivo: dove non supportate, navigazione normale |
| Test nel browser | Playwright + axe su home, album, about | completa i test jsdom |
| Meta di home e about | `run_worker_first` su `/` e `/about` e riuso di F4 | valutare il costo: ogni visita alla home passerebbe dal Worker |
| Canonical stabile | variabile `SITE_URL` opzionale, con ripiego su `url.origin` | emerso dalla revisione di F4: oggi su `workers.dev` e su staging ogni copia si dichiara canonica |
| Primo byte delle pagine album | avviare insieme `ASSETS.fetch` e le due letture R2 | emerso dalla revisione di F4: oggi le letture partono dopo l'asset |
| Header ereditati dall'asset | togliere `cf-cache-status` dalla risposta riscritta | emerso dalla revisione di F4: innocuo, ma fuorviante nel debug |
| CSP estendibile da `custom/` | un modo dichiarato per aggiungere origini (font, immagini, script) alla CSP generata | emerso dalla revisione di F1: oggi un fork non può usare font propri né immagini esterne senza toccare file del template |
| URL delle copertine | **risolto in F2a**: `albumsToCards` esportata da `src/api`, non un campo in `ctx` | un'API serve a tutti gli slot e alle pagine di F3; un campo in `ctx` solo alla landing |
| Setup dei test per `custom/` | un `custom/test-setup.js` facoltativo, aggiunto ai `setupFiles` di Vitest | emerso dalla revisione di F1: permetterebbe ai fork di simulare API del browser che jsdom non ha |

## 6. Decisioni prese dopo la revisione

### F2: contracts approved on 2026-09-26

These decisions supersede the earlier F2 implementation sketches. F2 remains framework-neutral: no React, router, new UI dependency, F3 page generator, deployment or personal-site change is part of this phase.

- **Page ownership and cleanup.** Pages retain every slot handle. `mount(container, ctx)` may return a handle or a promise of a handle; `destroy()` remains optional. A small page owner tracks handles and runs each cleanup at most once, isolating cleanup errors. If a pending mount resolves after the owner was destroyed, its handle is destroyed immediately. `custom/setup.js` may return a cleanup function. Setup runs once per page initialization; duplicate starts cannot register duplicate global listeners. This is not an SPA lifecycle framework.
- **Back/forward cache.** `pagehide` with `persisted === true` emits the leave event but preserves mounted DOM, listeners and state. `pageshow` restoration does not rerun setup or mount slots. Non-persisted departure disposes the page. `page:leave` detail includes `persisted`; a restored page emits `page:ready` with `restored: true` using the last ready detail. Initial readiness is emitted only after page mounting completes. Errors in event listeners or cleanup do not block other listeners/cleanup.
- **Independent chrome.** Nav and footer resolve and mount independently of each other and the landing/grid/lightbox. Page entries start those tasks independently as soon as resolved site data is available; they never await a custom content loader before starting chrome. A failed custom slot is reported explicitly, not silently replaced by a default. A rejected task cannot block a successful sibling or become an unhandled rejection.
- **Custom CSS.** Preserve `template styles -> theme/ -> custom/theme.css`, without cascade layers. The optional custom theme must be a final explicit stylesheet in each public production HTML, and absent from admin. Its imports and URL references must be handled by Vite, not copied as unprocessed CSS. First prove this mechanism in a temporary production-build fixture; also verify a lazy custom slot importing CSS. If Vite inserts later lazy CSS links, restore the custom-theme link to the last stylesheet position after slot loading. The guarantee concerns the template's styles and `theme/`; fork component styles still need sensible selector specificity. Verify actual computed overrides in a browser, not only source import order.
- **Public API.** Preserve `albumsToCards` and the planned data/event exports. Expose `slot` through an asynchronous facade that imports the registry only when called; data helpers and events must not eagerly import that registry. Export stability tests cover behavior as well as names. Custom modules declare loaders at module scope; resolving/mounting slots is a runtime action, not module initialization. Include a real custom fixture with a statically imported component that imports the public API.
- **Routes/language audit.** Built-in canonical routes and newly shipped example routes use lowercase English. User-created album slugs are not constrained to English. `/about` remains the page containing profile and contacts; `/contatti` is an existing legacy 301 alias and is retained in F2. Whether to remove it, add `/contacts`, or keep only About is deferred explicitly to F3. Report Italian example paths in the older F3 plan as pending migration, not as implemented routes. Do not silently alter routing or reserved slug rules in this phase.
- **Verification.** Run full test/build and browser checks without `custom/` and with a disposable copy of `custom.example/`. Use placeholder CSP only for template validation, never for a deploy. Include home, album success/error/empty cases, about/contact rendering, dashboard theme isolation, and no unhandled rejection when a custom loader fails.

### F3: decisions approved on 2026-09-26

These decisions supersede the names and examples of §2.5 and the older F3 plan.

- **Reserved slugs block only new names.** One exported list of template routes (`TEMPLATE_ROUTES`) feeds the Worker, the dev server, the dashboard and the page validator; `RESERVED_SLUGS` (`about`, `admin`, `album`, `api`, `assets`, `index`) derives from it. It is checked when the dashboard creates an album and when `custom/pages.config.js` declares a page, not when `albums.json` is read or saved, nor in the photo, manifest and delete routes. An existing album with a reserved slug keeps working in the dashboard; on the public site the template route wins. Reason: `validateAlbumsShape` also validates reads, so a longer reserved list would have rejected a fork's whole album list.
- **English names with the `custom` prefix.** `custom/pages.config.js`, `custom/pages/`, `virtual:custom-pages`, `docs/pages.md`; examples `/archive` and `/projects/:slug`.
- **`/contatti` is removed.** The 301 to `/about` goes; `/contatti` becomes an ordinary album path. No `/contacts`.
- **Execution.** Plan `plans/2026-09-26-f3-custom-pages.md`: one Haiku 4.5 implementer per task, maintainer review between tasks.


- **Il nome della cartella: `custom/`** (deciso il 2026-09-26). Il nome iniziale, `site/`, conviveva con
  `site.config.js`, `siteConfig`, `_site/site.json` su R2 e con i moduli `site-slots.js` e `site-theme.js`
  che F1–F2 introducono. `custom/` è libero nel codice e si legge come "il tuo codice". Il template
  contiene `custom.example/`; i moduli interni diventano `src/core/custom-slots.js` e
  `src/core/custom-theme.js`. Da qui in poi cambiarlo sarebbe una modifica incompatibile, da annunciare
  in `docs/upgrading.md`.
- **Componenti di default statici su ogni pagina** (deciso il 2026-09-26). Il registro di F2 importa tutti i
  default su ogni pagina. Costo misurato sulla build di produzione: +1,5 KB gzip sulla home, +1,8 sulla pagina
  album, +3,9 sulla about (da 5,8 a 9,7). Nessun foglio di stile dei componenti ha selettori fuori da una
  classe, quindi caricarli tutti non cambia l'aspetto di nessuna pagina. Le alternative — un registro per
  pagina, o default caricati al momento — aggiungevano complessità o un giro di rete a tutti i siti per
  risparmiare pochi KB.
- **`src/api` anticipata e minima** (deciso il 2026-09-26). Esce prima del resto di F2, in F2a, con la sola
  `albumsToCards`: è ciò che serve alla landing del sito personale per mostrare le copertine. Le altre funzioni
  arrivano con F2, aggiungendole: aggiungere non rompe i fork, togliere o rinominare sì.
