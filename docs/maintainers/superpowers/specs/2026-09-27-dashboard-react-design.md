# Nuova dashboard in React — design

Data: 2026-09-27. Stato: approvata nella discussione, da rileggere prima dei piani.

La dashboard attuale funziona ma è "quadrata": riquadri tutti uguali, pulsanti tutti dello stesso peso, sito e album sulla stessa pagina con due salvataggi separati. Questa specifica la ridisegna come un'applicazione da telefono, in React, con bozza e pubblicazione, anteprima del sito vero e colori presi dal tema del sito. Il sito pubblico resta in JavaScript puro.

Mockup discussi (privati, su claude.ai):

- stile: https://claude.ai/artifact/HgaUvJTgQspuyW9WWuG7Le
- disposizione: https://claude.ai/artifact/DadpyfRKKEzqdiGmozwGDF
- sezione Sito sul telefono: https://claude.ai/artifact/TNjQcCZJLi7GuBmpLPJYMR

## Decisioni prese

| Tema | Decisione |
|---|---|
| Tecnologia | React **solo nella dashboard**. Il sito pubblico resta JavaScript puro; React è disponibile anche per gli slot di `custom/` (JSX), senza obbligare nessuno. |
| Stile | Base **B — Camera oscura**: scura, numeri ed etichette in monospace, un solo accento caldo. |
| Tema | La dashboard prende colori e font dal tema del sito quando il fork ne ha uno suo; altrimenti resta B. |
| Disposizione | **Galleria di album**, impostata come un'app: barra di schede in basso sul telefono (Album · Sito · Messaggi), navigazione in alto sul computer, azione principale come pulsante grande nel colore d'accento. |
| Salvataggio | **Automatico, in una bozza privata.** Niente pulsanti "Save". |
| Pubblicazione | Pulsante **Pubblica**: porta la bozza sul sito. La bozza comprende **tutto**: sito, elenco degli album, foto, ordine, copertine, eliminazioni. |
| Testi modificabili | Nome, bio, social, immagine della home e i **testi delle pagine** che un fotografo cambia davvero (vedi "Testi"). Etichette tecniche ed errori restano in `config/texts.config.js`. |
| Social | **Lista di link** con icona ricavata dall'indirizzo. |
| Anteprima | Il **sito vero in un iframe**, alimentato dalla bozza. Sul telefono: **foglio** che mostra il pezzo di pagina del campo che stai scrivendo (variante B). Sempre disponibile: **anteprima del sito intero**. Sul computer: anteprima affiancata al modulo. |
| Approccio bozza | **A — copia di bozza nel bucket privato** (non un elenco di operazioni, non versioni con puntatore). |
| Fork esistenti | Nessuno: i cambi di formato non richiedono compatibilità, salvo la lettura del vecchio `social` (serve al sito personale del manutentore). |

## Architettura

```
 Dashboard (React, /admin, dietro Access)
   │  salva automaticamente ─────────────►  bucket PRIVATO  draft/…  staging/…
   │  "Pubblica" ───────► Worker: copia bozza → bucket PUBBLICO, poi pulizia
   │  anteprima: iframe /…?preview=1 ─► sito vero, legge la bozza via /api/admin/draft/…
   ▼
 Sito pubblico (JS puro) ─ legge /api/data/… ─► bucket PUBBLICO (come oggi)
```

Il sito pubblico non cambia modo di leggere i dati: vede solo ciò che è pubblicato.

### Bucket privato

Il bucket dei messaggi diventa il **bucket privato** del sito: nome `<project>-private`, binding `PRIVATE_BUCKET` (oggi `<project>-messages` e `MESSAGES_BUCKET`). Il rinomino è accettabile perché non esistono installazioni da migrare; Terraform, `renderWrangler`, `wrangler.example.json`, README e runbook si aggiornano insieme. Prefissi:

| Prefisso | Contenuto |
|---|---|
| `_messages/` | messaggi del form (come oggi) |
| `draft/` | la bozza: `site.json`, `albums.json`, `albums/<slug>/manifest.json` |
| `staging/` | foto caricate e non ancora pubblicate: `staging/<slug>/<name>.webp` |

La bozza non può stare nel bucket pubblico: tutto ciò che vi si trova è leggibile dall'indirizzo `r2.dev`.

## Dati

### Formati

`site.json` cambia così (validato da `validateSiteShape`):

```json
{
  "name": "Davide Tarsi",
  "bio": "…",
  "hero": { "album": "notte", "name": "via-lattea.webp" },
  "links": [
    { "url": "https://instagram.com/davidetarsi" },
    { "url": "https://github.com/davidetarsi", "label": "Codice" }
  ],
  "texts": {
    "landing.albumsSectionHeading": "Portfolio",
    "about.heading": "Scrivimi"
  }
}
```

- `links`: lista ordinata, al massimo 12 voci. `url` obbligatorio, `https:` o `mailto:`; `label` facoltativa, al massimo 40 caratteri. Sostituisce `social`. In lettura, un `site.json` con il vecchio `social: {instagram: url}` e senza `links` viene convertito in `links` (solo lettura; il primo salvataggio scrive il formato nuovo).
- `texts`: sovrascritture dei testi delle pagine, solo per le chiavi dell'elenco `EDITABLE_TEXT_KEYS` in `src/shared/content-rules.js`; stringhe, al massimo 500 caratteri. Una chiave assente usa il valore di `config/texts.config.js`.
- `albums.json` e `manifest.json` non cambiano formato.

### Testi

`EDITABLE_TEXT_KEYS` (prima versione):

| Chiave | Dove compare |
|---|---|
| `landing.albumsSectionHeading` | titolo della sezione album della home |
| `about.heading` | titolo della pagina contatti |
| `about.body` | testo della pagina contatti |
| `about.form.successMessage` | messaggio dopo l'invio del form |

Il sito unisce i testi al caricamento: `mergeTexts(texts, site.texts)` restituisce i testi di `config/` con le sovrascritture ammesse. Le pagine montano i componenti con i testi uniti; gli slot custom ricevono in `ctx.texts` i testi già uniti. Aggiungere una chiave all'elenco è una modifica di una riga più il campo nella dashboard.

### Icone dei social

`linkKind(url)` ricava il tipo dall'host: instagram, behance, flickr, 500px, vimeo, youtube, tiktok, facebook, threads, bluesky, x (anche twitter.com), linkedin, github, `mailto:` (email); ogni altro indirizzo è "sito". Le icone sono SVG inline nel template (nessuna risorsa esterna, compatibili con la CSP). L'etichetta mostrata è `label` se presente, altrimenti il nome del tipo. Stesso modulo per dashboard e sito (footer e pagina contatti).

## Bozza e pubblicazione

### Ciclo di vita

- **Nessuna bozza** (`draft/` vuoto) = il sito è tutto pubblicato. La dashboard parte dai dati pubblicati.
- **Prima modifica**: la dashboard scrive la bozza completa (sito ed elenco album) e da lì salva solo ciò che cambia. Salvataggio con attesa di 800 ms dall'ultima modifica, e subito quando si esce dal campo o si cambia vista.
- **Foto nuove**: caricate in `staging/<slug>/<name>.webp` e aggiunte al manifest della bozza. Il nome si assegna contro il manifest della bozza **e** quello pubblicato, così non collide mai con una foto esistente.
- **Eliminazioni** (foto o album): tolte dalla bozza; i file pubblicati vengono cancellati solo alla pubblicazione, così il sito pubblicato non mostra mai foto mancanti.
- Una foto ancora in `staging/` (mai pubblicata) che viene eliminata si cancella subito: nessuno la vede.
- **Annulla modifiche**: cancella `draft/` e `staging/` dopo una conferma nella pagina (non `confirm()`). Una volta che la pubblicazione ha iniziato a sovrascrivere il sito, cioè esiste `draft/cleanup.json`, l'annullamento è rifiutato con `409 PUBLISH_IN_PROGRESS`: si completa con "Pubblica".

### Pubblicazione

`POST /api/admin/publish` lavora **a passi**: ogni chiamata copia al massimo 25 foto e risponde `{ done, remaining }`; l'ultima scrive manifest, elenco e sito, pulisce e chiude; la dashboard richiama finché `done` e mostra l'avanzamento. Così nessuna singola richiesta supera i limiti del Worker.

Ordine, ripetibile senza danni se si interrompe:

1. **Controllo**: le forme sono valide; ogni foto nei manifest della bozza esiste in `staging/` o già pubblicata; l'immagine della home e le copertine puntano a foto presenti. Se qualcosa manca, la pubblicazione non parte e l'errore dice quale album e quale foto.
2. **Foto nuove**: copia (in streaming) `staging/<slug>/<name>` → bucket pubblico `<slug>/<name>`.
3. **Manifest** degli album della bozza.
4. **`albums.json`**, poi **`site.json`**.
5. **Pulizia**: file pubblicati non più referenziati (foto tolte, album eliminati con il loro manifest).
6. **Chiusura**: cancella `draft/` e `staging/`.

Fino al passo 6 la bozza resta: una pubblicazione interrotta si riprende con un nuovo "Pubblica". Il sito pubblico può vedere per qualche secondo un album con le foto nuove e il vecchio elenco: accettabile, perché il passo 4 arriva dopo le foto e i manifest.

Concorrenza: un solo amministratore; con due schede aperte vince l'ultimo salvataggio. La dashboard ricarica la bozza quando torna in primo piano.

### Stato delle modifiche

`GET /api/admin/draft/status` confronta bozza e pubblicato e restituisce l'elenco delle differenze (`site`, `album-added`, `album-removed`, `album-changed`, `albums-reordered`, `photos-added`, `photos-removed`, `photos-reordered`, con slug e numero). Il confronto non dipende dall'ordine dei campi. La dashboard ne mostra il conteggio ("3 modifiche") e, al tocco, l'elenco. Il campo `publishing` dice se una pubblicazione è iniziata e non è finita: la dashboard propone di riprenderla, e accanto mostra gli eventuali problemi che la bloccano (dopo un `409` sull'annullamento, l'unica uscita è completare la pubblicazione).

### Route del Worker

Tutte dietro Access e la verifica del JWT, come le route admin di oggi.

| Route | Uso |
|---|---|
| `GET /api/admin/draft` | sito ed elenco album della bozza; se la bozza non esiste, quelli pubblicati |
| `PUT /api/admin/draft/site`, `PUT /api/admin/draft/albums` | salvano la bozza (validata) |
| `GET`/`PUT /api/admin/draft/albums/<slug>/manifest` | manifest della bozza (se assente in bozza, `GET` restituisce il pubblicato) |
| `PUT`/`GET /api/admin/staging/<slug>/<name>` | carica o legge una foto in attesa (WebP, al massimo 10 MB, come oggi) |
| `DELETE /api/admin/draft` | annulla le modifiche |
| `GET /api/admin/draft/status` | differenze tra bozza e pubblicato |
| `POST /api/admin/publish` | un passo di pubblicazione |

Le route di scrittura diretta di oggi (`/api/admin/site`, `/albums`, manifest, foto) restano finché esiste la dashboard attuale e si tolgono con lei, alla fine del piano 4. `/api/admin/messages` resta, sul bucket privato.

## Anteprima

### Modalità anteprima del sito

- Ogni pagina del sito accetta `?preview=1`. In questa modalità il livello dati (`src/providers/data.js`) legge da `/api/admin/draft/…` invece che da `/api/data/…`, e le foto si risolvono in `/api/admin/preview/photo/<slug>/<name>`: il Worker restituisce la foto in attesa se c'è, altrimenti quella pubblicata. La dashboard stessa (`/admin`) non entra mai in modalità anteprima, qualunque sia il suo indirizzo: legge i dati pubblicati e la bozza con le sue route, mai attraverso la modalità anteprima.
- Quelle route sono dietro Access: aprire `?preview=1` senza essere entrati nella dashboard non mostra nulla di privato (la pagina dice che l'anteprima non è disponibile).
- Nella modalità anteprima i link interni del sito conservano `?preview=1`, così si naviga nell'anteprima del sito intero.
- **Aggiornamento mentre scrivi**: la dashboard manda all'iframe `postMessage({ type: 'preview:field', field, value })` a ogni tasto; il sito aggiorna subito il testo dell'elemento con `data-field` uguale. Dopo il salvataggio della bozza manda `{ type: 'preview:reload' }` e il sito rilegge i dati. Il sito accetta messaggi solo se `event.origin === location.origin` e `event.source === window.parent`.
- **Segni dei campi**: i componenti del template marcano i testi modificabili con `data-field` (`site.name`, `site.bio`, `site.links`, `texts.landing.albumsSectionHeading`, …). L'API pubblica per `custom/` esporta le stesse chiavi, così uno slot custom può marcarli; se non lo fa, l'anteprima mostra la pagina senza evidenziare nulla.
- **Evidenziazione e scorrimento**: messaggio `{ type: 'preview:focus', field }`: il sito scorre fino all'elemento e lo evidenzia (contorno nel colore d'accento; niente animazione con `prefers-reduced-motion`).

### Sicurezza

- CSP: `frame-ancestors 'none'` diventa `frame-ancestors 'self'`; `X-Frame-Options: DENY` diventa `SAMEORIGIN`. Solo lo stesso dominio può inserire il sito in un iframe.
- La bozza non è mai servita da `/api/data/…` né dal bucket pubblico.
- Nessun `eval`, nessun HTML dai messaggi: `preview:field` imposta `textContent`.

## Dashboard

### Schermate

- **Album** (scheda iniziale): galleria di copertine con titolo e numero di foto, riordinabile trascinando; "Nuovo album" come azione principale.
- **Album aperto**: titolo e sottotitolo modificabili sul posto, griglia di foto con la copertina segnata, riordino, eliminazione (rimandata alla pubblicazione), "Carica foto" come azione principale; avanzamento dei caricamenti su ogni foto; errori spiegati (il motivo arriva dalla risposta del Worker).
- **Sito**: gruppi "Chi sei" (nome, bio), "Link" (lista con icone, aggiungi, riordina, togli), "Home" (immagine principale, sottotitolo), "Pagina contatti" (titolo, testo, messaggio dopo l'invio). Ogni campo è una riga che si tocca per modificarla.
- **Messaggi**: elenco, lettura, rispondi (link `mailto:`), elimina. Non passa dalla bozza.

### Telefono e computer

- Telefono: barra di schede in basso; il campo si modifica in un **foglio** che sale dal basso, con sopra l'anteprima del pezzo di pagina e un tasto "pagina intera".
- Computer: navigazione in alto; nella vista Sito l'anteprima sta affiancata al modulo.
- Quando ci sono modifiche non pubblicate compare la **barra di pubblicazione** (telefono: sopra le schede; computer: in alto a destra): "N modifiche · Anteprima · **Pubblica**". Indicatore di stato: "bozza salvata", "salvataggio…", "errore di salvataggio — riprova", "tutto pubblicato".

### Tema

- La dashboard ha i suoi token `--admin-*` con i valori della direzione B.
- Se il fork ha `custom/theme.css`, la build ne estrae **solo** le proprietà personalizzate `--color-*` e `--font-*` di `:root` e le mappa sui token della dashboard (accento, superfici, testo, bordi, font). Nessun selettore del tema custom entra nella dashboard, che resta isolata da CSS rotti.
- Un fork può anche impostare direttamente `--admin-*` in `custom/theme.css`, con la stessa estrazione.
- I font arrivano dal plugin dei font esistente (`theme/fonts.js`), già caricato su tutte le pagine.
- `adminConfig.backgroundImageUrl` si rimuove: nella nuova dashboard non ha un posto.

### React: vincoli fissati qui

- React e React DOM con `@vitejs/plugin-react` in `vite.config.js`; JSX anche in `custom/`.
- JavaScript con JSX e JSDoc, come il resto del codice. Nessuna libreria CSS-in-JS: CSS con i token, compatibile con la CSP.
- La logica che non dipende dall'interfaccia resta com'è e viene riusata: `api.js` (esteso con le route della bozza), `pipeline.js`, `encoder.js`, `upload-manager.js`, `exif.js`, `naming.js`.
- Test con Vitest e Testing Library.

Si decidono **all'inizio del piano 4**, con una breve sessione dedicata perché servono anche per imparare React: struttura delle cartelle, gestione dello stato (Context e reducer, oppure una libreria per i dati del server come TanStack Query), navigazione tra schede (hash come oggi o una libreria di routing), componenti accessibili per foglio e dialoghi (a mano o libreria "headless").

## Errori

- Salvataggio della bozza fallito: l'indicatore diventa "errore di salvataggio — riprova"; la modifica resta in memoria e si ritenta al prossimo cambiamento o con il tasto.
- Caricamento fallito: la foto resta nella griglia con il motivo e "riprova"; il motivo viene dalla risposta del Worker e finisce anche in console.
- Pubblicazione fallita: si ferma al passo che non riesce, dice cosa (album, foto) e si riprende con "Pubblica".
- Bozza non valida (per esempio scritta a mano): il Worker rifiuta il salvataggio con il messaggio del validatore.

## Test

- Worker: route della bozza, validazione, pubblicazione a passi (compresa la ripresa dopo un'interruzione a ogni passo), differenze, annullamento, stato con bozza assente.
- Condivisi: `validateSiteShape` con `links` e `texts`, conversione del vecchio `social`, `linkKind`, `mergeTexts`, `EDITABLE_TEXT_KEYS`.
- Sito: modalità anteprima (sorgente dei dati, foto in staging, link con `?preview=1`, messaggi accettati solo dal genitore dello stesso dominio, `textContent`), `data-field` sui componenti, CSP con `frame-ancestors 'self'`.
- Dashboard: componenti con Testing Library; controlli nel browser (Chromium) su telefono e computer: carica, riordina, modifica un testo con l'anteprima nel foglio, pubblica, annulla.
- Test di guardia esistente su `innerHTML`: vale anche per il nuovo codice fuori da React.

## I quattro piani

Ogni piano lascia il template funzionante, con i test verdi, e aggiorna README.md e README.it.md per ciò che cambia.

1. **Fondamenta.**
   - React nella build (anche per `custom/`).
   - Testi ancora scritti nel codice della dashboard attuale: la zona di caricamento (in italiano), l'etichetta "HeroImage:" e il pulsante "Cover". Più un test che tiene uguali le chiavi di `texts.config.js` e `texts.it.js`.
   - Verificati e scartati: le icone a quadratino (emoji senza font nel browser di prova sul server, non sul Mac) e la pagina album "più larga" (solo nello screenshot a pagina intera: la pagina non scorre in orizzontale). "Cover" su ogni foto è il pulsante per sceglierla come copertina, voluto.
   - La correzione di Safari (`'wasm-unsafe-eval'`) è già nel branch `feat/simplify-l-english`.
2. **Dati.**
   - Bucket privato (rinomino).
   - Formati `links` e `texts`, `linkKind`, `mergeTexts`, testi uniti nel sito.
   - Route della bozza e della pubblicazione a passi.
3. **Anteprima.**
   - Modalità `?preview=1`, messaggi e `data-field`.
   - CSP `frame-ancestors 'self'`.
4. **Dashboard in React.**
   - Sessione sull'architettura React, poi le schermate, il tema dal sito e la barra di pubblicazione.
   - Rimozione della dashboard attuale e delle route di scrittura diretta.
   - Rimandati dalla revisione finale del piano 1:
     - il test di guardia su `innerHTML` controlla anche i file `.jsx` e segnala `dangerouslySetInnerHTML`;
     - un esempio di test `.test.jsx` in `custom.example/`;
     - Testing Library, con l'ambiente `act` impostato esplicitamente.

## Scelte fatte scrivendo il piano 2

- **Sottotitolo della home:** sotto il nome la home mostra la **bio**. `landing.heroSubtitle` compare solo quando la bio è vuota, quindi modificarlo non si vedrebbe quasi mai. Tra i testi modificabili al suo posto c'è `landing.albumsSectionHeading`, il titolo della sezione album. Il "sottotitolo" dei mockup è la bio, già modificabile.
- **Icone dei link:** arrivano nel piano 4, insieme alla dashboard che le mostra. Nel piano 2 il footer mostra i link come testo, come oggi: l'etichetta o il nome del tipo ("Instagram", "Email", "Website").
- **Dove si vedono i link:** nel footer, che è presente su tutte le pagine, compresa quella dei contatti. Nessun elenco in più sulla pagina contatti.
- **Vecchio `social`:** il validatore lo accetta ancora, perché la dashboard attuale lo scrive fino al piano 4. In lettura diventa `links`. La dashboard attuale conserva `links` e `texts` quando salva.
- **Testi per gli slot:** `ctx.texts` resta il testo di `config/` e serve per lo scheletro disegnato subito. I testi uniti arrivano in `ctx.data.texts`; nav e footer ricevono già quelli uniti.
- **Bozza "a file":** ogni file della bozza è facoltativo. Un file assente vuol dire "uguale al pubblicato", quindi la dashboard non deve scrivere la bozza completa alla prima modifica.
- **Pulizia alla pubblicazione:** si cancellano solo le foto che erano nel manifest pubblicato e non sono più in quello della bozza, più tutti i file degli album eliminati. I file mai elencati in un manifest non si toccano. L'elenco di cosa cancellare viene scritto in `draft/cleanup.json` prima di sovrascrivere i manifest, così una pubblicazione interrotta sa ancora cosa cancellare. Una voce dell'elenco che la bozza vuole di nuovo non viene cancellata.

- **Dopo la revisione del Task 5 del piano 2:**
  - **Vince la foto in attesa.** Una foto in `staging/` viene copiata anche se nel bucket pubblico c'è già un file con lo stesso nome, per esempio un avanzo di una pubblicazione interrotta. Appena copiata, esce da `staging/`.
  - **Foto copiate annotate.** Le foto copiate si annotano in `draft/copied.json`. Quelle che la bozza nel frattempo ha tolto si cancellano alla pubblicazione. "Annulla modifiche" cancella quelle che nessun manifest pubblicato nomina, così niente di non pubblicato resta raggiungibile.
  - **Chiusura mirata.** La chiusura cancella solo i file della bozza che esistevano all'inizio dell'ultimo passo.
  - **Regola per il piano 4:** mentre la pubblicazione è in corso, la dashboard non salva la bozza e non carica foto.
  - **Per il piano 3:** una foto copiata da un passo di pubblicazione esce subito da `staging/`. Se la pubblicazione si ferma, l'anteprima deve cercare quella foto anche all'indirizzo pubblico.
  - **Regola per il piano 4:** un album nuovo scrive subito un manifest vuoto nella bozza. Altrimenti, se riusa lo slug di un album eliminato nella stessa bozza, erediterebbe le foto di quello pubblicato.

## Da portare nel piano 4 (dalle revisioni del piano 3)

- **Protocollo dell'anteprima, lato dashboard:**
  - su `preview:ready` controllare `event.origin === location.origin` e `event.source === iframe.contentWindow`;
  - a ogni ready rimandare i testi non salvati e il campo evidenziato. Il ready può arrivare più di una volta: le pagine del template di solito ne mandano due, al `load` e a `page:ready`;
  - sapere in quale pagina sta ogni campo (`texts.about.*` in `/about`, il resto in `/`) e impostare da sé l'indirizzo dell'iframe;
  - ricaricare (`preview:reload`) solo dopo salvataggi che non sono testo, con un'attesa, perché il testo è già dal vivo;
  - `preview:focus` con `field: null` quando si esce dal campo.
- **Un solo ready sulle pagine del template:** `createPageLifecycle` segna che la pagina è partita, e il ponte annuncia al `load` solo se nessun ciclo di vita è partito.
- **Nessun iframe per la dashboard:** regola `frame-ancestors 'none'` anche per `/admin/` e `/admin/*`, se la dashboard aggiunge sotto-percorsi.
- **Form contatti in anteprima:** non invia; la dashboard può spiegarlo con una breve nota.
- **Codice ripetuto:** la validazione del nome foto è ripetuta tra la route delle foto in anteprima e quella delle foto in attesa. Unirle quando si tolgono le vecchie route di scrittura.
- **Pagine d'esempio:** `custom.example/pages/chrome.js` monta nav e footer con i testi di `config/`, non con quelli uniti. Va corretto nel giro di documentazione.

## Fuori da questa specifica

- Il sito pubblico in React.
- Tornare a una versione pubblicata precedente (approccio C).
- Più amministratori con modifiche simultanee.
- TypeScript.
- Modificare dalla dashboard testi diversi da quelli di `EDITABLE_TEXT_KEYS`.
